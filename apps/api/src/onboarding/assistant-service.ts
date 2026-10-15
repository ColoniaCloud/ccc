import { randomUUID, createHash } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import { HTTPException } from 'hono/http-exception'
import type { SetupProposal } from '@crm/shared'
import type { TenantTx } from '../db/tenant-db'
import { tenants, members, onboardingSessions } from '../db/schema'
import { previewPreset, applyPreset } from '../presets/service'
import { allowedPresets, validateProposal, validateRevision, profileFingerprint, REQUEST_LEASE_MS } from './assistant-policy'
import type { SetupAssistant } from './anthropic'
import { startPilot, recordPilotActivity } from './pilot'
import { reserveAi, finishAi, quotaSnapshot } from './ai-quota'
import { previewFields, applyFields, configurationContext } from './personalization'

export type TenantRunner = <T>(tenantId: string, run: (tx: TenantTx) => Promise<T>) => Promise<T>
const busy = (session: typeof onboardingSessions.$inferSelect | undefined) => Boolean(session?.pendingRequestId && session.requestStartedAt && Date.now() - session.requestStartedAt.getTime() < REQUEST_LEASE_MS)

export class OnboardingAssistantService {
  constructor(private scoped: TenantRunner, private assistant: SetupAssistant) {}
  private async access(tx: TenantTx, tenantId: string, memberId: string, write = true) {
    if (write) await tx.select({ id: tenants.id }).from(tenants).where(eq(tenants.id, tenantId)).for('update')
    const tenant = await tx.query.tenants.findFirst({ where: eq(tenants.id, tenantId) })
    const member = await tx.query.members.findFirst({ where: and(eq(members.id, memberId), eq(members.tenantId, tenantId)) })
    if (!tenant || tenant.status !== 'active' || !member || (write && !['owner','admin'].includes(member.role))) throw new HTTPException(403, { message: 'Solo el propietario o un administrador activo puede preparar el CRM' })
    return tenant
  }
  private async session(tx: TenantTx, tenantId: string) { return tx.query.onboardingSessions.findFirst({ where: eq(onboardingSessions.tenantId, tenantId) }) }
  private async view(tx: TenantTx, tenant: typeof tenants.$inferSelect, session: typeof onboardingSessions.$inferSelect | undefined) {
    return { quota: await quotaSnapshot(tx,tenant.id), name: tenant.name, profile: tenant.businessProfile, required: tenant.setupRequired, supported: allowedPresets(tenant.businessProfile).length > 0, configured: this.assistant.configured,
      session: session ? { status: session.status, revision: session.revision, messages: session.messages, proposal: session.proposal, busy: busy(session) } : null }
  }
  async get(tenantId: string, memberId: string) {
    return this.scoped(tenantId, async (tx) => this.view(tx, await this.access(tx, tenantId, memberId, false), await this.session(tx, tenantId)))
  }
  async message(tenantId: string, memberId: string, text: unknown, revision: unknown) {
    if (typeof text !== 'string' || !text.trim() || text.length > 2000) throw new HTTPException(400, { message: 'Escribí un mensaje de hasta 2000 caracteres' })
    const expected = validateRevision(revision)
    if (!this.assistant.configured) throw new HTTPException(503, { message: 'El asistente todavía no está configurado. Podés preparar el CRM manualmente o continuar después' })
    const requestId = randomUUID()
    const prepared = await this.scoped(tenantId, async (tx) => {
      const tenant = await this.access(tx, tenantId, memberId)
      if (!tenant.businessProfile || !allowedPresets(tenant.businessProfile).length) throw new HTTPException(422, { message: 'El asistente está disponible para inmobiliarias y automotor. Revisá los datos del negocio' })
      let session = await this.session(tx, tenantId)
      if ((session?.revision ?? 0) !== expected) throw new HTTPException(409, { message: 'La conversación cambió. Actualizala antes de continuar' })
      if (session?.status === 'completed') throw new HTTPException(409, { message: 'Este onboarding ya está completado' })
      if (busy(session)) throw new HTTPException(409, { message: 'El asistente está preparando una respuesta' })
      await reserveAi(tx, tenantId, requestId)
      if (!session) session = (await tx.insert(onboardingSessions).values({ tenantId }).returning())[0]!
      await tx.update(onboardingSessions).set({ pendingRequestId: requestId, requestStartedAt: new Date(), attempts: session.attempts + 1, revision: session.revision + 1, status: session.proposal ? 'ready' : 'in_progress', updatedAt: new Date() }).where(eq(onboardingSessions.tenantId, tenantId))
      return { context: { name: tenant.name, profile: tenant.businessProfile, messages: [...session.messages, { role: 'user' as const, text: text.trim() }], proposal: session.proposal, configuration: await configurationContext(tx, tenantId) }, profileHash: profileFingerprint(tenant.businessProfile) }
    })
    try {
      // La petición a Anthropic sucede sin transacción ni conexión PostgreSQL retenida.
      const response = await this.assistant.generate({...prepared.context,messages:prepared.context.messages.slice(-20)})
      await this.scoped(tenantId,tx=>finishAi(tx,tenantId,requestId,response))
      return await this.scoped(tenantId, async (tx) => {
        const tenant = await this.access(tx, tenantId, memberId), session = await this.session(tx, tenantId)
        if (!session || session.pendingRequestId !== requestId) throw new HTTPException(409, { message: 'Esta respuesta fue reemplazada por una acción más reciente' })
        if (profileFingerprint(tenant.businessProfile) !== prepared.profileHash) throw new HTTPException(409, { message: 'Los datos del negocio cambiaron. Actualizá la conversación y volvé a intentar' })
        // Se valida incluso si el proveedor es un adaptador de pruebas o cambia en el futuro.
        const proposal = response.turn.proposal ? validateProposal(response.turn.proposal, tenant.businessProfile) : null
        const [updated] = await tx.update(onboardingSessions).set({ messages: [...prepared.context.messages, { role: 'assistant', text: response.turn.reply }], proposal,
          status: proposal ? 'ready' : 'in_progress', pendingRequestId: null, revision: session.revision + 1,
          inputTokens: session.inputTokens + response.inputTokens, outputTokens: session.outputTokens + response.outputTokens, updatedAt: new Date() }).where(eq(onboardingSessions.tenantId, tenantId)).returning()
        return this.view(tx, tenant, updated)
      })
    } catch (error) {
      await this.scoped(tenantId, async (tx) => {
        await finishAi(tx,tenantId,requestId)
        await tx.update(onboardingSessions).set({ pendingRequestId: null, updatedAt: new Date() }).where(and(eq(onboardingSessions.tenantId, tenantId), eq(onboardingSessions.pendingRequestId, requestId)))
      })
      if (error instanceof HTTPException) throw error
      throw new HTTPException(502, { message: 'El asistente no pudo responder. Tu conversación sigue guardada; actualizá y probá nuevamente' })
    }
  }
  async edit(tenantId: string, memberId: string, input: unknown, revision: unknown) {
    const expected = validateRevision(revision)
    return this.scoped(tenantId, async (tx) => {
      const tenant = await this.access(tx, tenantId, memberId), session = await this.session(tx, tenantId)
      if (!session?.proposal || session.status !== 'ready' || busy(session) || session.revision !== expected) throw new HTTPException(409, { message: 'La propuesta cambió. Actualizala antes de editar' })
      const proposal = validateProposal(input, tenant.businessProfile)
      const [updated] = await tx.update(onboardingSessions).set({ proposal, revision: session.revision + 1, updatedAt: new Date() }).where(eq(onboardingSessions.tenantId, tenantId)).returning()
      return this.view(tx, tenant, updated)
    })
  }
  private async approval(tx: TenantTx, tenant: typeof tenants.$inferSelect, session: typeof onboardingSessions.$inferSelect) {
    const proposal = validateProposal(session.proposal, tenant.businessProfile)
    const previews = []
    for (const key of proposal.presets) previews.push(await previewPreset(tx, tenant.id, key, proposal.processes?.find(p => p.presetKey === key)))
    const fields = await previewFields(tx, tenant.id, proposal), conflicts = [...previews.flatMap(preview => preview.conflicts), ...fields.conflicts]
    const names = previews.filter(preview => !preview.alreadyApplied || proposal.processes?.some(p => p.presetKey === preview.key)).map(preview => preview.pipelineName.normalize('NFKC').trim().toLowerCase())
    if (new Set(names).size !== names.length) conflicts.push('Los procesos nuevos deben tener nombres distintos.')
    const fingerprint = createHash('sha256').update(JSON.stringify({ tenantId: tenant.id, revision: session.revision, proposal, profile: tenant.businessProfile, previews, fields })).digest('hex')
    return { fingerprint, previews, fields, conflicts }
  }
  async preview(tenantId: string, memberId: string, revision: unknown) {
    const expected = validateRevision(revision)
    return this.scoped(tenantId, async (tx) => {
      const tenant = await this.access(tx, tenantId, memberId), session = await this.session(tx, tenantId)
      if (!session || session.status !== 'ready' || busy(session) || session.revision !== expected) throw new HTTPException(409, { message: 'La propuesta cambió. Actualizala antes de revisar' })
      return this.approval(tx, tenant, session)
    })
  }
  async apply(tenantId: string, memberId: string, revision: unknown, fingerprint: unknown) {
    const expected = validateRevision(revision)
    if (typeof fingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(fingerprint)) throw new HTTPException(400, { message: 'Revisá la propuesta antes de aprobar' })
    return this.scoped(tenantId, async (tx) => {
      const tenant = await this.access(tx, tenantId, memberId), session = await this.session(tx, tenantId)
      if (session?.status === 'completed') return this.view(tx, tenant, session)
      if (!session || session.status !== 'ready' || busy(session) || session.revision !== expected) throw new HTTPException(409, { message: 'La propuesta cambió. Revisala nuevamente' })
      const approval = await this.approval(tx, tenant, session)
      if (approval.conflicts.length || approval.fingerprint !== fingerprint) throw new HTTPException(409, { message: approval.conflicts.join(' ') || 'La configuración cambió. Revisá nuevamente los cambios' })
      await startPilot(tx, tenantId, memberId)
      const proposal = validateProposal(session.proposal, tenant.businessProfile)
      for (const key of proposal.presets) {
        // La aprobación conjunta cubre el estado inicial; los campos compartidos
        // se recalculan dentro de esta misma transacción tras aplicar cada plantilla.
        const custom = proposal.processes?.find(p => p.presetKey === key), preview = await previewPreset(tx, tenantId, key, custom)
        await applyPreset(tx, tenantId, memberId, key, preview.fingerprint, false, custom)
      }
      await applyFields(tx, tenantId, approval.fields.create)
      const [updatedTenant] = await tx.update(tenants).set({ setupRequired: false, updatedAt: new Date() }).where(eq(tenants.id, tenantId)).returning()
      const [updated] = await tx.update(onboardingSessions).set({ status: 'completed', revision: session.revision + 1, updatedAt: new Date() }).where(eq(onboardingSessions.tenantId, tenantId)).returning()
      await recordPilotActivity(tx, tenantId, memberId)
      return this.view(tx, updatedTenant!, updated)
    })
  }
  async defer(tenantId: string, memberId: string) {
    return this.scoped(tenantId, async (tx) => {
      const tenant = await this.access(tx, tenantId, memberId), session = await this.session(tx, tenantId)
      if (session?.status !== 'completed') await tx.insert(onboardingSessions).values({ tenantId, status: 'deferred' }).onConflictDoUpdate({ target: onboardingSessions.tenantId, set: { status: 'deferred', pendingRequestId: null, revision: (session?.revision ?? 0) + 1, updatedAt: new Date() } })
      await tx.update(tenants).set({ setupRequired: false }).where(eq(tenants.id, tenantId))
      return { deferred: true }
    })
  }
  async refine(tenantId: string, memberId: string, revision: unknown) {
    const expected = validateRevision(revision)
    return this.scoped(tenantId, async tx => {
      const tenant = await this.access(tx, tenantId, memberId), session = await this.session(tx, tenantId)
      if (!session || session.status !== 'completed' || session.revision !== expected || busy(session)) throw new HTTPException(409, { message: 'Actualizá la preparación antes de ajustarla' })
      const proposal = validateProposal(session.proposal, tenant.businessProfile)
      const [updated] = await tx.update(onboardingSessions).set({ status: 'ready', proposal: { ...proposal, processes: [], fields: [] }, revision: session.revision + 1, updatedAt: new Date() }).where(eq(onboardingSessions.tenantId, tenantId)).returning()
      return this.view(tx, tenant, updated)
    })
  }
  async resume(tenantId: string, memberId: string) {
    return this.scoped(tenantId, async (tx) => {
      const tenant = await this.access(tx, tenantId, memberId), session = await this.session(tx, tenantId)
      if (session?.status === 'deferred') {
        const [updated] = await tx.update(onboardingSessions).set({ status: session.proposal ? 'ready' : 'in_progress', revision: session.revision + 1, updatedAt: new Date() }).where(eq(onboardingSessions.tenantId, tenantId)).returning()
        return this.view(tx, tenant, updated)
      }
      return this.view(tx, tenant, session)
    })
  }
}

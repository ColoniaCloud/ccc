import { randomUUID } from 'node:crypto'
import { and, asc, desc, eq, ne, lt, sql } from 'drizzle-orm'
import { HTTPException } from 'hono/http-exception'
import { agents, agentJobs, agentProposals, tenants, members, pipelines, pipelineStages, deals, tasks } from '../db/schema'
import type { FollowUpCandidate } from '../db/schema/agents'
import type { TenantTx } from '../db/tenant-db'
import { aiPeriod } from '../onboarding/ai-quota'
import { localToday } from '../agenda/service'
import { saveTask } from '../agenda/tasks'
import { agentInput, APPROVE_ROLES, CONFIGURE_ROLES, EXECUTE_ROLES, limitsFor, validId } from './policy'
import type { AgentAssistant } from './provider'

type TenantRunner = <T>(tenantId: string, run: (tx: TenantTx) => Promise<T>) => Promise<T>
type Agent = typeof agents.$inferSelect
const LEASE_MS = 120_000
const lastActivity = sql<Date>`greatest(${deals.updatedAt}, coalesce((select max(ca.created_at) from contact_activities ca where ca.tenant_id = ${deals.tenantId} and ca.contact_id = ${deals.contactId}), ${deals.updatedAt}), coalesce((select max(t.updated_at) from tasks t where t.tenant_id = ${deals.tenantId} and t.deal_id = ${deals.id} and t.done = true), ${deals.updatedAt}))`.mapWith(v => new Date(v))

export class AgentService {
  constructor(private scoped: TenantRunner, private assistant: AgentAssistant) {}

  private async access(tx: TenantTx, tenantId: string, memberId: string, allowed?: string[]) {
    // One tenant lock serializes slot allocation, quota reservations and approvals.
    const [tenant] = await tx.select().from(tenants).where(eq(tenants.id, tenantId)).for('update')
    const member = await tx.query.members.findFirst({ where: and(eq(members.id, memberId), eq(members.tenantId, tenantId)) })
    if (!tenant || tenant.status !== 'active' || !member || (allowed && !allowed.includes(member.role))) throw new HTTPException(403, { message: 'No tenés permiso para esta acción' })
    return { tenant, member, limits: limitsFor(tenant.plan) }
  }

  private async find(tx: TenantTx, tenantId: string, id: string) {
    const item = await tx.query.agents.findFirst({ where: and(eq(agents.id, validId(id)), eq(agents.tenantId, tenantId), ne(agents.status, 'archived')) })
    if (!item) throw new HTTPException(404, { message: 'Agente no encontrado' })
    return item
  }

  private async slots(tx: TenantTx, tenantId: string, limit: number) {
    return tx.select({ id: agents.id }).from(agents).where(and(eq(agents.tenantId, tenantId), ne(agents.status, 'archived'))).orderBy(asc(agents.createdAt), asc(agents.id)).limit(Math.max(1, limit))
  }
  private async entitled(tx: TenantTx, tenantId: string, agentId: string, limit: number) {
    if (!limit || !(await this.slots(tx, tenantId, limit)).some(a => a.id === agentId)) throw new HTTPException(403, { message: 'Este agente excede los cupos de tu plan. Archivá otro agente o mejorá la membresía.' })
  }
  private async expire(tx: TenantTx, tenantId: string) {
    await tx.update(agentJobs).set({ status: 'failed', error: 'La ejecución se interrumpió. Podés volver a intentarlo.', finishedAt: new Date() })
      .where(and(eq(agentJobs.tenantId, tenantId), eq(agentJobs.status, 'running'), lt(agentJobs.createdAt, new Date(Date.now() - LEASE_MS))))
  }
  private async quota(tx: TenantTx, tenantId: string, plan: string) {
    const clock = aiPeriod(), limits = limitsFor(plan)
    const [usage] = await tx.select({ used: sql<number>`count(*)`.mapWith(Number) }).from(agentJobs).where(and(eq(agentJobs.tenantId, tenantId), eq(agentJobs.period, clock.period)))
    return { ...clock, ...limits, used: usage!.used, remaining: Math.max(0, limits.calls - usage!.used) }
  }

  async list(tenantId: string, memberId: string) {
    return this.scoped(tenantId, async tx => {
      const { tenant, member, limits } = await this.access(tx, tenantId, memberId)
      await this.expire(tx, tenantId)
      const items = await tx.select().from(agents).where(and(eq(agents.tenantId, tenantId), ne(agents.status, 'archived'))).orderBy(asc(agents.createdAt), asc(agents.id))
      return { items: items.map((a, i) => ({ ...a, locked: i >= limits.agents })), quota: await this.quota(tx, tenantId, tenant.plan), configured: this.assistant.configured,
        canConfigure: CONFIGURE_ROLES.includes(member.role), canExecute: EXECUTE_ROLES.includes(member.role), canApprove: APPROVE_ROLES.includes(member.role),
        pipelines: await tx.select({ id: pipelines.id, name: pipelines.name }).from(pipelines).where(eq(pipelines.tenantId, tenantId)) }
    })
  }
  async save(tenantId: string, memberId: string, input: unknown, id?: string) {
    const values = agentInput(input)
    return this.scoped(tenantId, async tx => {
      const { limits } = await this.access(tx, tenantId, memberId, CONFIGURE_ROLES)
      if (values.pipelineId && !(await tx.query.pipelines.findFirst({ where: and(eq(pipelines.id, values.pipelineId), eq(pipelines.tenantId, tenantId)) }))) throw new HTTPException(404, { message: 'Proceso no encontrado' })
      if (id) {
        await this.find(tx, tenantId, id)
        if (values.status === 'active') await this.entitled(tx, tenantId, id, limits.agents)
        await this.assertIdle(tx, tenantId, id)
        return (await tx.update(agents).set(values).where(and(eq(agents.id, id), eq(agents.tenantId, tenantId))).returning())[0]!
      }
      const [count] = await tx.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(agents).where(and(eq(agents.tenantId, tenantId), ne(agents.status, 'archived')))
      if (count!.n >= limits.agents) throw new HTTPException(403, { message: 'Alcanzaste el límite de agentes de tu membresía' })
      return (await tx.insert(agents).values({ ...values, status: 'paused', tenantId }).returning())[0]!
    })
  }
  async archive(tenantId: string, memberId: string, id: string) {
    return this.scoped(tenantId, async tx => {
      await this.access(tx, tenantId, memberId, CONFIGURE_ROLES); await this.find(tx, tenantId, id); await this.assertIdle(tx, tenantId, id)
      await tx.update(agents).set({ status: 'archived' }).where(and(eq(agents.id, id), eq(agents.tenantId, tenantId)))
      await tx.update(agentProposals).set({ status: 'dismissed', decidedBy: memberId, decidedAt: new Date() }).where(and(eq(agentProposals.agentId, id), eq(agentProposals.tenantId, tenantId), eq(agentProposals.status, 'pending')))
    })
  }
  private async assertIdle(tx: TenantTx, tenantId: string, id?: string) {
    await this.expire(tx, tenantId)
    const busy = await tx.query.agentJobs.findFirst({ where: and(eq(agentJobs.tenantId, tenantId), eq(agentJobs.status, 'running'), id ? eq(agentJobs.agentId, id) : undefined) })
    if (busy) throw new HTTPException(409, { message: 'Hay una ejecución en curso. Esperá a que termine.' })
  }

  private async candidates(tx: TenantTx, tenantId: string, agent: Agent, limit: number, dealId?: string): Promise<FollowUpCandidate[]> {
    const rows = await tx.select({ dealId: deals.id, title: deals.title, contactId: deals.contactId, assignedTo: deals.assignedTo, observedAt: lastActivity })
      .from(deals).innerJoin(pipelineStages, eq(pipelineStages.id, deals.stageId)).innerJoin(pipelines, and(eq(pipelines.id, deals.pipelineId), eq(pipelines.tenantId, tenantId)))
      .where(and(eq(deals.tenantId, tenantId), eq(pipelineStages.outcome, 'open'), agent.pipelineId ? eq(deals.pipelineId, agent.pipelineId) : undefined, dealId ? eq(deals.id, dealId) : undefined,
        sql`${lastActivity} < ${new Date(Date.now() - agent.staleDays * 86400000)}`,
        sql`not exists (select 1 from tasks t where t.tenant_id = ${tenantId} and t.deal_id = ${deals.id} and t.done = false)`))
      .orderBy(asc(lastActivity), asc(deals.id)).limit(limit)
    return rows.map(r => ({ ...r, title: r.title.slice(0, 200), observedAt: r.observedAt.toISOString() }))
  }

  async detail(tenantId: string, memberId: string, id: string) {
    return this.scoped(tenantId, async tx => {
      await this.access(tx, tenantId, memberId); const item = await this.find(tx, tenantId, id); await this.expire(tx, tenantId)
      return { item,
        jobs: await tx.select().from(agentJobs).where(and(eq(agentJobs.tenantId, tenantId), eq(agentJobs.agentId, id))).orderBy(desc(agentJobs.createdAt)).limit(50),
        proposals: await tx.select().from(agentProposals).where(and(eq(agentProposals.tenantId, tenantId), eq(agentProposals.agentId, id))).orderBy(sql`case when ${agentProposals.status} = 'pending' then 0 else 1 end`, desc(agentProposals.createdAt)).limit(200) }
    })
  }

  async execute(tenantId: string, memberId: string, id: string, kind: 'run' | 'chat', message?: unknown) {
    if (kind === 'chat' && (typeof message !== 'string' || !message.trim() || message.length > 2000)) throw new HTTPException(400, { message: 'Escribí un mensaje de hasta 2000 caracteres' })
    const jobId = randomUUID()
    const prepared = await this.scoped(tenantId, async tx => {
      const { tenant, limits } = await this.access(tx, tenantId, memberId, EXECUTE_ROLES)
      const agent = await this.find(tx, tenantId, id)
      await this.entitled(tx, tenantId, id, limits.agents)
      if (agent.status !== 'active') throw new HTTPException(409, { message: 'Activá el agente antes de ejecutarlo o conversar' })
      if (!this.assistant.configured) throw new HTTPException(503, { message: 'La IA de Agentes todavía no está configurada' })
      await this.assertIdle(tx, tenantId)
      const quota = await this.quota(tx, tenantId, tenant.plan)
      if (!quota.remaining) throw new HTTPException(429, { message: `Agotaste las ${quota.calls} consultas de Agentes. Se renuevan el ${quota.resetsOn}.` })
      const candidates = await this.candidates(tx, tenantId, agent, limits.records)
      const recent = await tx.select().from(agentJobs).where(and(eq(agentJobs.tenantId, tenantId), eq(agentJobs.agentId, id), eq(agentJobs.kind, 'chat'), eq(agentJobs.status, 'succeeded'))).orderBy(desc(agentJobs.createdAt)).limit(3)
      const prompt = kind === 'chat' ? String(message).trim() : 'Revisá las oportunidades sin actividad y resumí los seguimientos propuestos.'
      await tx.insert(agentJobs).values({ id: jobId, tenantId, agentId: id, memberId, kind, period: quota.period, prompt, candidates })
      return { agent, candidates, prompt, history: kind === 'chat' ? recent.reverse().flatMap(j => [{ role: 'user' as const, content: (j.prompt ?? '').slice(0, 1500) }, { role: 'assistant' as const, content: (j.response ?? '').slice(0, 1500) }]) : [] }
    })
    try {
      const response = await this.assistant.generate({ name: prepared.agent.name, instructions: prepared.agent.instructions, kind, message: prepared.prompt, candidates: prepared.candidates, history: prepared.history })
      // Usage is persisted before checking permissions again, even if access was revoked.
      await this.scoped(tenantId, tx => tx.update(agentJobs).set({ inputTokens: response.inputTokens, outputTokens: response.outputTokens }).where(and(eq(agentJobs.tenantId, tenantId), eq(agentJobs.id, jobId))))
      await this.scoped(tenantId, async tx => {
        const { limits } = await this.access(tx, tenantId, memberId, EXECUTE_ROLES)
        const agent = await this.find(tx, tenantId, id); await this.entitled(tx, tenantId, id, limits.agents)
        const job = await tx.query.agentJobs.findFirst({ where: and(eq(agentJobs.id, jobId), eq(agentJobs.tenantId, tenantId)) })
        if (agent.status !== 'active' || job?.status !== 'running' || job.createdAt.getTime() < Date.now() - LEASE_MS) throw new HTTPException(409, { message: 'La ejecución venció o el agente cambió. Actualizá la pantalla.' })
        if (kind === 'run') for (const candidate of prepared.candidates) {
          const [fresh] = await this.candidates(tx, tenantId, agent, 1, candidate.dealId)
          if (!fresh || fresh.observedAt !== candidate.observedAt) continue
          await tx.insert(agentProposals).values({ tenantId, agentId: id, runId: jobId, dealId: candidate.dealId, title: `Dar seguimiento: ${candidate.title}`.slice(0, 250), reason: `Oportunidad abierta sin actividad registrada durante ${agent.staleDays} días y sin tareas pendientes.`, observedAt: new Date(candidate.observedAt) }).onConflictDoNothing()
        }
        await tx.update(agentJobs).set({ status: 'succeeded', response: response.text.slice(0, 16000), finishedAt: new Date() }).where(and(eq(agentJobs.id, jobId), eq(agentJobs.tenantId, tenantId)))
      })
      return { jobId }
    } catch (error) {
      await this.scoped(tenantId, tx => tx.update(agentJobs).set({ status: 'failed', error: 'No se pudo completar la ejecución. El intento queda registrado en el consumo.', finishedAt: new Date() }).where(and(eq(agentJobs.id, jobId), eq(agentJobs.tenantId, tenantId), eq(agentJobs.status, 'running'))))
      if (error instanceof HTTPException) throw error
      throw new HTTPException(502, { message: 'El agente no pudo responder. Revisá el historial antes de reintentar.' })
    }
  }

  async decide(tenantId: string, memberId: string, id: string, proposalId: string, decision: unknown) {
    validId(proposalId)
    if (!['approve', 'dismiss'].includes(String(decision))) throw new HTTPException(400, { message: 'Decisión inválida' })
    return this.scoped(tenantId, async tx => {
      const { limits } = await this.access(tx, tenantId, memberId, APPROVE_ROLES)
      const agent = await this.find(tx, tenantId, id)
      const proposal = await tx.query.agentProposals.findFirst({ where: and(eq(agentProposals.id, proposalId), eq(agentProposals.tenantId, tenantId), eq(agentProposals.agentId, id)) })
      if (!proposal) throw new HTTPException(404, { message: 'Propuesta no encontrada' })
      if (proposal.status !== 'pending') return proposal
      let status: 'approved' | 'dismissed' | 'stale' = 'dismissed', taskId: string | null = null
      if (decision === 'approve') {
        await this.entitled(tx, tenantId, id, limits.agents)
        // Lock the deal against simultaneous stage/assignment edits before validating.
        await tx.select({ id: deals.id }).from(deals).where(and(eq(deals.id, proposal.dealId), eq(deals.tenantId, tenantId))).for('update')
        const [fresh] = await this.candidates(tx, tenantId, agent, 1, proposal.dealId)
        status = 'stale'
        if (fresh && fresh.observedAt === proposal.observedAt.toISOString()) {
          const task = await saveTask(tx, tenantId, { title: proposal.title, description: proposal.reason, dealId: fresh.dealId, contactId: fresh.contactId, assignedTo: fresh.assignedTo, dueOn: localToday() })
          status = 'approved'; taskId = task.id
        }
      }
      return (await tx.update(agentProposals).set({ status, taskId, decidedBy: memberId, decidedAt: new Date() }).where(and(eq(agentProposals.id, proposalId), eq(agentProposals.tenantId, tenantId))).returning())[0]!
    })
  }
}

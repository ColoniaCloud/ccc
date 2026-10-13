import { randomBytes, randomUUID } from 'node:crypto'
import { and, eq, lt } from 'drizzle-orm'
import { HTTPException } from 'hono/http-exception'
import type { TenantTx } from '../db/tenant-db'
import { calendarConnections, calendarOAuthStates, calendarEventSync, appointments, properties, vehicles, members, tenants } from '../db/schema'
import { authorizeUrl, calendarConfig, CALENDAR_SCOPE, GoogleCalendar, GoogleError, protect, unprotect, hash, eventBody, eventId } from './google'

export type Scoped = <T>(tenantId: string, fn: (tx: TenantTx) => Promise<T>) => Promise<T>
const context = (tenantId: string, memberId: string) => `calendar:${tenantId}:${memberId}`
export async function requireActor(tx: TenantTx, tenantId: string, memberId: string, userId?: string) {
  const actor = await tx.query.members.findFirst({ where: and(eq(members.id, memberId), eq(members.tenantId, tenantId)) })
  const tenant = await tx.query.tenants.findFirst({ where: eq(tenants.id, tenantId) })
  if (!actor || actor.role === 'support' || (userId && actor.userId !== userId) || tenant?.status === 'suspended') throw new HTTPException(403, { message: 'Sin permiso para conectar este calendario' })
  return { actor, tenant: tenant! }
}
export async function startConnection(tx: TenantTx, tenantId: string, memberId: string, userId: string) {
  if (!calendarConfig()) throw new HTTPException(503, { message: 'Google Calendar todavía no está habilitado por Plata' })
  await requireActor(tx, tenantId, memberId, userId)
  if ((await tx.query.calendarConnections.findFirst({ where: and(eq(calendarConnections.tenantId, tenantId), eq(calendarConnections.memberId, memberId)) }))?.status === 'connected') throw new HTTPException(409, { message: 'Ya tenés un calendario conectado. Desconectalo antes de cambiar la cuenta.' })
  await tx.delete(calendarOAuthStates).where(and(eq(calendarOAuthStates.tenantId, tenantId), lt(calendarOAuthStates.expiresAt, new Date())))
  const state = `${tenantId}.${randomBytes(32).toString('base64url')}`, verifier = randomBytes(32).toString('base64url')
  await tx.insert(calendarOAuthStates).values({ hash: hash(state), tenantId, memberId, userId,
    encryptedVerifier: protect(verifier, context(tenantId, memberId)), expiresAt: new Date(Date.now() + 600000) })
  return authorizeUrl(state, verifier)
}
export async function consumeState(tx: TenantTx, tenantId: string, state: string, userId: string) {
  const [record] = await tx.select().from(calendarOAuthStates).where(and(eq(calendarOAuthStates.hash, hash(state)), eq(calendarOAuthStates.tenantId, tenantId))).for('update')
  if (!record || record.userId !== userId || record.usedAt || record.expiresAt.getTime() <= Date.now()) throw new HTTPException(400, { message: 'La autorización venció o ya fue utilizada. Volvé a conectar.' })
  await requireActor(tx, tenantId, record.memberId, userId)
  await tx.update(calendarOAuthStates).set({ usedAt: new Date() }).where(eq(calendarOAuthStates.hash, record.hash))
  return { memberId: record.memberId, authorizationHash: record.hash, verifier: unprotect(record.encryptedVerifier, context(tenantId, record.memberId)) }
}
export async function finishConnection(scoped: Scoped, tenantId: string, memberId: string, userId: string, code: string, verifier: string, authorizationHash: string, google = new GoogleCalendar()) {
  const token = await google.exchange(code, verifier)
  if (!token.refresh_token || !token.scope?.split(' ').includes(CALENDAR_SCOPE)) throw new HTTPException(400, { message: 'Google no otorgó el permiso necesario. Volvé a conectar y autorizá el calendario de Plata.' })
  return scoped(tenantId, async (tx) => {
    await tx.select({ id: tenants.id }).from(tenants).where(eq(tenants.id, tenantId)).for('update')
    await requireActor(tx, tenantId, memberId, userId)
    const [authorization] = await tx.select().from(calendarOAuthStates).where(and(eq(calendarOAuthStates.hash, authorizationHash), eq(calendarOAuthStates.tenantId, tenantId))).for('update')
    if (!authorization || !authorization.usedAt || authorization.userId !== userId || authorization.memberId !== memberId || authorization.expiresAt.getTime() <= Date.now()) throw new HTTPException(400, { message: 'La autorización fue cancelada o venció. Volvé a conectar.' })
    const [previous] = await tx.select().from(calendarConnections).where(and(eq(calendarConnections.tenantId, tenantId), eq(calendarConnections.memberId, memberId))).for('update')
    if (previous?.status === 'connected') throw new HTTPException(409, { message: 'El calendario ya se conectó en otra ventana' })
    await tx.delete(calendarOAuthStates).where(eq(calendarOAuthStates.hash, authorizationHash))
    const values = { encryptedToken: protect(token.refresh_token!, context(tenantId, memberId)), status: 'connected' as const,
      calendarId: null, lastSyncedAt: null, lastError: null, nextSyncAt: new Date(), leaseId: null, leaseUntil: null, updatedAt: new Date() }
    if (previous) {
      await tx.delete(calendarEventSync).where(eq(calendarEventSync.connectionId, previous.id))
      return (await tx.update(calendarConnections).set(values).where(eq(calendarConnections.id, previous.id)).returning())[0]!.id
    }
    return (await tx.insert(calendarConnections).values({ tenantId, memberId, ...values }).returning())[0]!.id
  })
}
export async function disconnect(tx: TenantTx, tenantId: string, memberId: string) {
  // Invalida también las autorizaciones pendientes iniciadas en otras ventanas.
  await tx.delete(calendarOAuthStates).where(and(eq(calendarOAuthStates.tenantId, tenantId), eq(calendarOAuthStates.memberId, memberId)))
  await tx.update(calendarConnections).set({ encryptedToken: null, status: 'disconnected', leaseId: null, leaseUntil: null,
    lastError: null, updatedAt: new Date() }).where(and(eq(calendarConnections.tenantId, tenantId), eq(calendarConnections.memberId, memberId)))
}

export async function syncConnection(scoped: Scoped, tenantId: string, connectionId: string, google = new GoogleCalendar()) {
  const leaseId = randomUUID()
  const connection = await scoped(tenantId, async (tx) => {
    const [item] = await tx.select().from(calendarConnections).where(and(eq(calendarConnections.id, connectionId), eq(calendarConnections.tenantId, tenantId))).for('update')
    if (!item || item.status !== 'connected' || !item.encryptedToken || item.nextSyncAt.getTime() > Date.now() || (item.leaseUntil && item.leaseUntil.getTime() > Date.now())) return null
    try { await requireActor(tx, tenantId, item.memberId) } catch {
      await tx.update(calendarConnections).set({ status: 'disconnected', encryptedToken: null }).where(eq(calendarConnections.id, item.id)); return null
    }
    await tx.update(calendarConnections).set({ leaseId, leaseUntil: new Date(Date.now() + 90000) }).where(eq(calendarConnections.id, item.id))
    return item
  })
  if (!connection) return
  async function current(tx: TenantTx) {
    const [item] = await tx.select().from(calendarConnections).where(and(eq(calendarConnections.id, connectionId), eq(calendarConnections.tenantId, tenantId), eq(calendarConnections.leaseId, leaseId), eq(calendarConnections.status, 'connected'))).for('update')
    if (!item) throw new Error('Calendar lease changed')
    await requireActor(tx, tenantId, item.memberId)
    return item
  }
  try {
    const token = await google.refresh(unprotect(connection.encryptedToken!, context(tenantId, connection.memberId)))
    let calendarId = connection.calendarId
    if (!calendarId) {
      const tenant = await scoped(tenantId, async (tx) => { await current(tx); return (await tx.query.tenants.findFirst({ where: eq(tenants.id, tenantId) }))! })
      // calendars.insert no acepta un id propio. Ante respuesta incierta no se repite automáticamente.
      try { calendarId = await google.createCalendar(token.access_token, tenant.name) } catch { throw new GoogleError(502, true) }
      await scoped(tenantId, async (tx) => { await current(tx); await tx.update(calendarConnections).set({ calendarId }).where(eq(calendarConnections.id, connectionId)) })
    }
    const plan = await scoped(tenantId, async (tx) => {
      await current(tx)
      const tenant = (await tx.query.tenants.findFirst({ where: eq(tenants.id, tenantId) }))!
      const items = await tx.select({ id: appointments.id, kind: appointments.kind, status: appointments.status, scheduledAt: appointments.scheduledAt,
        durationMinutes: appointments.durationMinutes, propertyId: appointments.propertyId, vehicleId: appointments.vehicleId,
        propertyTitle: properties.title, vehicleTitle: vehicles.title }).from(appointments)
        .leftJoin(properties, eq(properties.id, appointments.propertyId)).leftJoin(vehicles, eq(vehicles.id, appointments.vehicleId))
        .where(and(eq(appointments.tenantId, tenantId), eq(appointments.assignedTo, connection.memberId)))
      const mappings = await tx.query.calendarEventSync.findMany({ where: eq(calendarEventSync.connectionId, connectionId) })
      const updates: { id: string; generation: number; fingerprint: string; body: ReturnType<typeof eventBody> | null }[] = []
      for (const item of items) {
        const previous = mappings.find((mapping) => mapping.appointmentId === item.id)
        // No exportar todo el historial al conectar por primera vez.
        const active = item.status !== 'cancelled' && (previous || item.scheduledAt.getTime() >= Date.now())
        if (!active && !previous) continue
        const body = active ? eventBody(item, tenant.slug) : null
        const fingerprint = body ? hash(JSON.stringify(body)) : 'deleted'
        if (previous?.fingerprint === fingerprint) continue
        const generation = (previous?.generation ?? 0) + (body && previous?.fingerprint === 'deleted' ? 1 : 0)
        // Guardar el nuevo id antes de enviarlo: un timeout puede haber creado el evento.
        await tx.insert(calendarEventSync).values({ tenantId, connectionId, appointmentId: item.id, generation, fingerprint: 'pending' })
          .onConflictDoUpdate({ target: [calendarEventSync.connectionId, calendarEventSync.appointmentId], set: { generation, fingerprint: 'pending' } })
        updates.push({ id: item.id, generation, fingerprint, body })
      }
      for (const mapping of mappings) if (!items.some((item) => item.id === mapping.appointmentId) && mapping.fingerprint !== 'deleted') updates.push({ id: mapping.appointmentId, generation: mapping.generation, fingerprint: 'deleted', body: null })
      return updates
    })
    for (const update of plan.slice(0, 10)) {
      await scoped(tenantId, async (tx) => { await current(tx); await tx.update(calendarConnections).set({ leaseUntil: new Date(Date.now() + 90000) }).where(eq(calendarConnections.id, connectionId)) })
      if (update.body) {
        try { await google.saveEvent(token.access_token, calendarId!, eventId(update.id, update.generation), update.body) }
        catch (error) {
          if (error instanceof GoogleError && error.status === 410) await scoped(tenantId, async (tx) => {
            await current(tx); await tx.update(calendarEventSync).set({ generation: update.generation + 1, fingerprint: 'pending' }).where(and(eq(calendarEventSync.connectionId, connectionId), eq(calendarEventSync.appointmentId, update.id)))
          })
          throw error
        }
      }
      else await google.deleteEvent(token.access_token, calendarId!, eventId(update.id, update.generation))
      await scoped(tenantId, async (tx) => { await current(tx); await tx.update(calendarEventSync).set({ fingerprint: update.fingerprint }).where(and(eq(calendarEventSync.connectionId, connectionId), eq(calendarEventSync.appointmentId, update.id))) })
    }
    await scoped(tenantId, async (tx) => { await current(tx); await tx.update(calendarConnections).set({ lastSyncedAt: new Date(), lastError: null,
      leaseId: null, leaseUntil: null, nextSyncAt: new Date(Date.now() + (plan.length > 10 ? 1000 : 60000)) }).where(eq(calendarConnections.id, connectionId)) })
  } catch (error) {
    await scoped(tenantId, async (tx) => {
      const reconnect = error instanceof GoogleError && error.reconnect
      await tx.update(calendarConnections).set({ status: reconnect ? 'reconnect' : 'connected',
        lastError: reconnect ? 'Se necesita volver a autorizar Google Calendar.' : 'No se pudo sincronizar. Plata volverá a intentar en cinco minutos.',
        leaseId: null, leaseUntil: null, nextSyncAt: new Date(Date.now() + 300000) })
        .where(and(eq(calendarConnections.id, connectionId), eq(calendarConnections.leaseId, leaseId), eq(calendarConnections.status, 'connected')))
    })
  }
}

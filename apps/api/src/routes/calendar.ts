import { Hono } from 'hono'
import { and, eq } from 'drizzle-orm'
import { authMiddleware } from '../middleware/auth'
import { tenantAccessMiddleware } from '../middleware/tenant'
import { db } from '../db'
import { withTenant } from '../db/tenant-db'
import { calendarConnections, calendarOAuthStates, tenants } from '../db/schema'
import { calendarConfig, hash } from '../calendar/google'
import { startConnection, consumeState, finishConnection, disconnect } from '../calendar/service'
import type { HonoVariables } from '../types'

const calendarRoutes = new Hono<{ Variables: HonoVariables }>()
calendarRoutes.use('*', authMiddleware)
calendarRoutes.use('*', async (c, next) => { c.header('Cache-Control', 'no-store'); c.header('Referrer-Policy', 'no-referrer'); await next() })
// Google vuelve por navegación y no puede mandar x-tenant-slug. La organización
// del state se valida mediante su hash guardado con RLS y la sesión del usuario.
calendarRoutes.get('/callback', async (c) => {
  const state = c.req.query('state') ?? ''
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.[A-Za-z0-9_-]{43}$/i.test(state)) return c.text('Autorización inválida. Volvé a Plata para conectar.', 400)
  const tenantId = state.slice(0, 36)
  const record = await withTenant(tenantId, (tx) => tx.query.calendarOAuthStates.findFirst({ where: eq(calendarOAuthStates.hash, hash(state)) }))
  if (!record || record.userId !== c.get('user').id) return c.text('Autorización inválida. Volvé a Plata para conectar.', 400)
  const tenant = await db.query.tenants.findFirst({ where: eq(tenants.id, record.tenantId) })
  const target = new URL('/app/agenda', process.env.WEB_URL ?? 'http://localhost:3000')
  target.searchParams.set('organization', tenant?.slug ?? '')
  try {
    const pending = await withTenant(record.tenantId, (tx) => consumeState(tx, record.tenantId, state, c.get('user').id))
    const code = c.req.query('code')
    if (!code || code.length > 4096 || c.req.query('error')) throw new Error('Authorization not granted')
    await finishConnection(withTenant, record.tenantId, pending.memberId, c.get('user').id, code, pending.verifier, pending.authorizationHash)
    target.searchParams.set('calendar', 'connected')
  } catch { target.searchParams.set('calendar', 'error') }
  return c.redirect(target.toString())
})
calendarRoutes.use('*', tenantAccessMiddleware)
calendarRoutes.get('/', async (c) => {
  const item = await withTenant(c.get('tenantId'), (tx) => tx.query.calendarConnections.findFirst({ where: and(eq(calendarConnections.tenantId, c.get('tenantId')), eq(calendarConnections.memberId, c.get('memberId'))) }))
  return c.json({ status: 'ok', configured: Boolean(calendarConfig()), connection: item ? {
    status: item.status, lastSyncedAt: item.lastSyncedAt, lastError: item.lastError, calendarCreated: Boolean(item.calendarId),
  } : null })
})
calendarRoutes.post('/connect', async (c) => c.json({ status: 'ok', url: await withTenant(c.get('tenantId'), (tx) => startConnection(tx, c.get('tenantId'), c.get('memberId'), c.get('user').id)) }))
calendarRoutes.post('/disconnect', async (c) => {
  await withTenant(c.get('tenantId'), (tx) => disconnect(tx, c.get('tenantId'), c.get('memberId')))
  return c.json({ status: 'ok' })
})
calendarRoutes.post('/retry', async (c) => {
  await withTenant(c.get('tenantId'), async (tx) => { await tx.update(calendarConnections).set({ nextSyncAt: new Date() }).where(and(eq(calendarConnections.tenantId, c.get('tenantId')), eq(calendarConnections.memberId, c.get('memberId')), eq(calendarConnections.status, 'connected'))) })
  return c.json({ status: 'ok' })
})
export { calendarRoutes }

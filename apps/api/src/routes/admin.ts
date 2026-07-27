import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { eq, desc } from 'drizzle-orm'
import { db } from '../db'
import { withTenant } from '../db/tenant-db'
import { tenants, members, billingSubscriptions, tenantModules } from '../db/schema'
import { authMiddleware } from '../middleware/auth'
import { superAdminMiddleware } from '../middleware/superadmin'
import type { HonoVariables } from '../types'
import type { Plan } from '@crm/shared'

const PLANS: Plan[] = ['free', 'pro', 'business', 'master', 'enterprise']

const adminRoutes = new Hono<{ Variables: HonoVariables }>()

adminRoutes.use('*', authMiddleware, superAdminMiddleware)

// Lectura cruzada entre tenants, que es exactamente lo que la RLS impide:
// se usa el `db` owner (con BYPASSRLS) a propósito, igual que los webhooks
// de billing. `tenant_modules` se lee con un withTenant() por tenant en
// vez de sumarlo al bypass — más queries, pero mantiene el panel del lado
// acotado siempre que se pueda, y el volumen de tenants de esta etapa lo
// permite. Toda la ruta está detrás de superAdminMiddleware.
adminRoutes.get('/tenants', async (c) => {
  const allTenants = await db.query.tenants.findMany({ orderBy: desc(tenants.createdAt) })

  const items = await Promise.all(allTenants.map(async (tenant) => {
    const [memberRows, subscription, enabledModules] = await Promise.all([
      db.query.members.findMany({ where: eq(members.tenantId, tenant.id) }),
      db.query.billingSubscriptions.findFirst({
        where:   eq(billingSubscriptions.tenantId, tenant.id),
        orderBy: desc(billingSubscriptions.createdAt),
      }),
      withTenant(tenant.id, (tx) => tx.query.tenantModules.findMany({
        where: eq(tenantModules.tenantId, tenant.id),
      })),
    ])

    return {
      id:           tenant.id,
      name:         tenant.name,
      slug:         tenant.slug,
      plan:         tenant.plan,
      status:       tenant.status,
      suspendedAt:  tenant.suspendedAt,
      planRenewsAt: tenant.planRenewsAt,
      createdAt:    tenant.createdAt,
      memberCount:  memberRows.length,
      modules:      enabledModules.map((m) => m.moduleKey),
      billing:      subscription ? { provider: subscription.provider, status: subscription.status } : null,
    }
  }))

  return c.json({ status: 'ok', items })
})

adminRoutes.post('/tenants/:id/suspend', async (c) => {
  const id = c.req.param('id')

  const tenant = await db.query.tenants.findFirst({ where: eq(tenants.id, id) })
  if (!tenant) {
    throw new HTTPException(404, { message: 'Tenant no encontrado' })
  }

  await db.update(tenants)
    .set({ status: 'suspended', suspendedAt: new Date(), updatedAt: new Date() })
    .where(eq(tenants.id, id))

  return c.json({ status: 'ok' })
})

adminRoutes.post('/tenants/:id/reactivate', async (c) => {
  const id = c.req.param('id')

  const tenant = await db.query.tenants.findFirst({ where: eq(tenants.id, id) })
  if (!tenant) {
    throw new HTTPException(404, { message: 'Tenant no encontrado' })
  }

  await db.update(tenants)
    .set({ status: 'active', suspendedAt: null, updatedAt: new Date() })
    .where(eq(tenants.id, id))

  return c.json({ status: 'ok' })
})

adminRoutes.post('/tenants/:id/plan', async (c) => {
  const id   = c.req.param('id')
  const body = await c.req.json().catch(() => null) as { plan?: string } | null
  const plan = body?.plan

  if (!plan || !PLANS.includes(plan as Plan)) {
    throw new HTTPException(400, { message: 'Plan inválido' })
  }

  const tenant = await db.query.tenants.findFirst({ where: eq(tenants.id, id) })
  if (!tenant) {
    throw new HTTPException(404, { message: 'Tenant no encontrado' })
  }

  await db.update(tenants)
    .set({ plan: plan as Plan, updatedAt: new Date() })
    .where(eq(tenants.id, id))

  return c.json({ status: 'ok' })
})

export { adminRoutes }

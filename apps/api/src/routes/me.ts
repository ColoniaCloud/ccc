import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { tenants, members, tenantModules } from '../db/schema'
import { authMiddleware } from '../middleware/auth'
import { tenantMiddleware } from '../middleware/tenant'
import { isSuperAdminEmail } from '../lib/superadmin'
import type { HonoVariables } from '../types'

const meRoutes = new Hono<{ Variables: HonoVariables }>()

meRoutes.get('/', authMiddleware, tenantMiddleware, async (c) => {
  const db       = c.get('db')
  const user     = c.get('user')
  const tenantId = c.get('tenantId')
  const memberId = c.get('memberId')

  const tenant = await db.query.tenants.findFirst({
    where: eq(tenants.id, tenantId),
  })

  const member = await db.query.members.findFirst({
    where: eq(members.id, memberId),
  })

  const enabledModules = await db.query.tenantModules.findMany({
    where: eq(tenantModules.tenantId, tenantId),
  })

  return c.json({
    status: 'ok',
    user: {
      id:    user.id,
      name:  user.name,
      email: user.email,
      // Solo para decidir si el front muestra el acceso a /admin. No es
      // el control de acceso: ese lo hace superAdminMiddleware en cada
      // request a /api/admin.
      isSuperAdmin: isSuperAdminEmail(user.email),
    },
    tenant: {
      id:      tenant?.id,
      name:    tenant?.name,
      slug:    tenant?.slug,
      plan:    tenant?.plan,
      modules: enabledModules.map((m) => m.moduleKey),
    },
    member: {
      id:   member?.id,
      role: member?.role,
    },
  })
})

export { meRoutes }

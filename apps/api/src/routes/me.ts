import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { db } from '../db'
import { tenants, members } from '../db/schema'
import { authMiddleware } from '../middleware/auth'
import { tenantMiddleware } from '../middleware/tenant'
import type { HonoVariables } from '../types'

const meRoutes = new Hono<{ Variables: HonoVariables }>()

meRoutes.get('/', authMiddleware, tenantMiddleware, async (c) => {
  const user     = c.get('user')
  const tenantId = c.get('tenantId')
  const memberId = c.get('memberId')

  const tenant = await db.query.tenants.findFirst({
    where: eq(tenants.id, tenantId),
  })

  const member = await db.query.members.findFirst({
    where: eq(members.id, memberId),
  })

  return c.json({
    status: 'ok',
    user: {
      id:    user.id,
      name:  user.name,
      email: user.email,
    },
    tenant: {
      id:   tenant?.id,
      name: tenant?.name,
      slug: tenant?.slug,
      plan: tenant?.plan,
    },
    member: {
      id:   member?.id,
      role: member?.role,
    },
  })
})

export { meRoutes }

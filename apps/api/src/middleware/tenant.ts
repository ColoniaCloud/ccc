import { createMiddleware } from 'hono/factory'
import { HTTPException } from 'hono/http-exception'
import { eq, and } from 'drizzle-orm'
import { db } from '../db'
import { tenants, members } from '../db/schema'
import type { HonoVariables } from '../types'

export const tenantMiddleware = createMiddleware<{
  Variables: HonoVariables
}>(async (c, next) => {
  let slug = c.req.header('x-tenant-slug')

  if (!slug) {
    const host = (c.req.header('host') ?? '').replace(/:\d+$/, '')
    const subdomain = host.split('.')[0]
    if (subdomain && !['www', 'api', 'app', 'localhost'].includes(subdomain)) {
      slug = subdomain
    }
  }

  if (!slug) {
    throw new HTTPException(400, { message: 'Tenant no especificado' })
  }

  const tenant = await db.query.tenants.findFirst({
    where: eq(tenants.slug, slug),
  })

  if (!tenant) {
    throw new HTTPException(404, { message: 'Tenant no encontrado' })
  }

  const userId = c.get('user')?.id
  if (!userId) {
    throw new HTTPException(401, { message: 'No autenticado' })
  }

  const member = await db.query.members.findFirst({
    where: and(
      eq(members.tenantId, tenant.id),
      eq(members.userId, userId),
    ),
  })

  if (!member) {
    throw new HTTPException(403, { message: 'Sin acceso a este tenant' })
  }

  c.set('tenantId', tenant.id)
  c.set('memberId', member.id)

  await next()
})

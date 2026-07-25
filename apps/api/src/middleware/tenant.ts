import { createMiddleware } from 'hono/factory'
import { HTTPException } from 'hono/http-exception'
import { eq, and, sql } from 'drizzle-orm'
import { db } from '../db'
import { tenantDb } from '../db/tenant-db'
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

  // set_config con is_local=true equivale a SET LOCAL pero acepta bind
  // params — SET LOCAL no admite placeholders del protocolo de Postgres.
  await tenantDb.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.tenant_id', ${tenant.id}, true)`)
    c.set('db', tx)
    await next()
  })
})

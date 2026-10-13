import { createMiddleware } from 'hono/factory'
import { HTTPException } from 'hono/http-exception'
import { eq, and, sql } from 'drizzle-orm'
import { db } from '../db'
import { tenantDb } from '../db/tenant-db'
import { tenants, members } from '../db/schema'
import type { HonoVariables } from '../types'
import type { Context } from 'hono'

async function resolveTenantContext(c: Context<{ Variables: HonoVariables }>) {
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

  // Suspensión desde el panel de administración: corta acá, antes de abrir
  // la transacción. El mensaje se muestra tal cual en el layout de la app.
  if (tenant.status === 'suspended') {
    throw new HTTPException(403, { message: 'Esta organización está suspendida' })
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
  c.set('memberRole', member.role)

  if (member.role === 'support' && !['GET', 'HEAD', 'OPTIONS'].includes(c.req.method)) {
    throw new HTTPException(403, { message: 'Tu rol tiene acceso de lectura al CRM' })
  }

}

// Los endpoints con llamadas a IA abren transacciones cortas en cada fase.
export const tenantAccessMiddleware = createMiddleware<{ Variables: HonoVariables }>(async (c, next) => {
  await resolveTenantContext(c)
  await next()
})

export const tenantMiddleware = createMiddleware<{ Variables: HonoVariables }>(async (c, next) => {
  await resolveTenantContext(c)

  // set_config con is_local=true equivale a SET LOCAL pero acepta bind
  // params — SET LOCAL no admite placeholders del protocolo de Postgres.
  await tenantDb.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.tenant_id', ${c.get('tenantId')}, true)`)
    c.set('db', tx)
    await next()
  })
})

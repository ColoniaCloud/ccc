import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { eq } from 'drizzle-orm'
import { db } from '../db'
import { tenants, members } from '../db/schema'
import { authMiddleware } from '../middleware/auth'
import type { HonoVariables } from '../types'

const onboardingRoutes = new Hono<{ Variables: HonoVariables }>()

const DIACRITICS = /[\u0300-\u036f]/g

function slugify(name: string): string {
  const slug = name
    .normalize('NFD').replace(DIACRITICS, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-+|-+$)/g, '')
    .slice(0, 48)

  return slug || 'empresa'
}

async function uniqueSlug(base: string): Promise<string> {
  let slug = base
  let suffix = 0

  while (await db.query.tenants.findFirst({ where: eq(tenants.slug, slug) })) {
    suffix += 1
    slug = `${base}-${suffix}`
  }

  return slug
}

onboardingRoutes.get('/status', authMiddleware, async (c) => {
  const user = c.get('user')

  const member = await db.query.members.findFirst({
    where: eq(members.userId, user.id),
  })

  if (!member) {
    return c.json({ status: 'pending' })
  }

  const tenant = await db.query.tenants.findFirst({
    where: eq(tenants.id, member.tenantId),
  })

  return c.json({
    status: 'completed',
    tenant: tenant ? { id: tenant.id, name: tenant.name, slug: tenant.slug } : null,
  })
})

onboardingRoutes.post('/', authMiddleware, async (c) => {
  const user = c.get('user')

  const existing = await db.query.members.findFirst({
    where: eq(members.userId, user.id),
  })
  if (existing) {
    throw new HTTPException(409, { message: 'Ya completaste el onboarding' })
  }

  const body = await c.req.json().catch(() => null) as { name?: string } | null
  const name = body?.name?.trim()
  if (!name || name.length < 2) {
    throw new HTTPException(400, { message: 'El nombre de la organización es requerido' })
  }

  const slug = await uniqueSlug(slugify(name))

  const [tenant] = await db.insert(tenants).values({ name, slug }).returning()
  if (!tenant) {
    throw new HTTPException(500, { message: 'No se pudo crear la organización' })
  }

  await db.insert(members).values({ userId: user.id, tenantId: tenant.id, role: 'admin' })

  return c.json({
    status: 'ok',
    tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug },
  }, 201)
})

export { onboardingRoutes }

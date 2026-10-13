import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { eq, asc } from 'drizzle-orm'
import { db } from '../db'
import { tenants, members } from '../db/schema'
import { user as authUser } from '../db/schema/auth'
import { authMiddleware } from '../middleware/auth'
import type { HonoVariables } from '../types'
import { validateBusinessProfile, localeForCountry } from '../onboarding/business-profile'

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

onboardingRoutes.get('/status', authMiddleware, async (c) => {
  const user = c.get('user')

  const member = await db.query.members.findFirst({
    where: eq(members.userId, user.id),
    orderBy: [asc(members.createdAt), asc(members.id)],
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
  if (!user.emailVerified) throw new HTTPException(403, { message: 'Verificá tu email antes de crear una organización' })
  const body = await c.req.json().catch(() => null)
  const result = validateBusinessProfile(body)
  if (!result.valid) {
    throw new HTTPException(400, { message: result.error })
  }
  const { name, profile } = result.values

  const tenant = await db.transaction(async (tx) => {
    // Serializa envíos del mismo usuario y mantiene el comportamiento del alta
    // inicial. Crear otra organización requiere intención explícita.
    await tx.select().from(authUser).where(eq(authUser.id, user.id)).for('update')
    const existing = await tx.query.members.findFirst({ where: eq(members.userId, user.id) })
    if (existing && body?.createAdditional !== true) {
      throw new HTTPException(409, { message: 'Ya tenés una organización. Usá Crear organización para agregar otra' })
    }
    const base = slugify(name)
    // INSERT ON CONFLICT evita la carrera entre consultar un slug e insertarlo.
    for (let suffix = 0; suffix < 100; suffix++) {
      const [created] = await tx.insert(tenants).values({ name, slug: suffix ? `${base}-${suffix}` : base,
        locale: localeForCountry(profile.country), businessProfile: profile, businessProfileUpdatedAt: new Date(), setupRequired: true })
        .onConflictDoNothing({ target: tenants.slug }).returning()
      if (!created) continue
      await tx.insert(members).values({ userId: user.id, tenantId: created.id, role: 'owner' })
      return created
    }
    throw new HTTPException(409, { message: 'No se pudo reservar un identificador. Probá con otro nombre' })
  })

  return c.json({
    status: 'ok',
    tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug },
  }, 201)
})

export { onboardingRoutes }

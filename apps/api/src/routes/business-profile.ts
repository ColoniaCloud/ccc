import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { eq } from 'drizzle-orm'
import { tenants, members } from '../db/schema'
import { authMiddleware } from '../middleware/auth'
import { tenantMiddleware } from '../middleware/tenant'
import type { HonoVariables } from '../types'
import { validateBusinessProfile, localeForCountry } from '../onboarding/business-profile'

// Perfil del negocio (Configuración → Negocio). Lo crea el onboarding; acá
// se consulta y edita. Cualquier miembro lo ve, solo un admin lo cambia.
const businessProfileRoutes = new Hono<{ Variables: HonoVariables }>()

businessProfileRoutes.use('*', authMiddleware, tenantMiddleware)

businessProfileRoutes.get('/', async (c) => {
  const db     = c.get('db')
  const tenant = await db.query.tenants.findFirst({ where: eq(tenants.id, c.get('tenantId')) })
  if (!tenant) {
    throw new HTTPException(404, { message: 'Organización no encontrada' })
  }

  return c.json({
    status:    'ok',
    name:      tenant.name,
    profile:   tenant.businessProfile,
    updatedAt: tenant.businessProfileUpdatedAt,
  })
})

businessProfileRoutes.put('/', async (c) => {
  const db       = c.get('db')
  const tenantId = c.get('tenantId')

  const member = await db.query.members.findFirst({ where: eq(members.id, c.get('memberId')) })
  if (!member || !['owner', 'admin'].includes(member.role)) {
    throw new HTTPException(403, { message: 'Solo un admin puede editar los datos del negocio' })
  }

  const result = validateBusinessProfile(await c.req.json().catch(() => null))
  if (!result.valid) {
    throw new HTTPException(400, { message: result.error })
  }
  const { name, profile } = result.values
  const now = new Date()

  // El slug no cambia: es la URL/identificador de la organización.
  await db.update(tenants)
    .set({
      name,
      locale:                   localeForCountry(profile.country),
      businessProfile:          profile,
      businessProfileUpdatedAt: now,
      updatedAt:                now,
    })
    .where(eq(tenants.id, tenantId))

  return c.json({ status: 'ok', name, profile, updatedAt: now })
})

export { businessProfileRoutes }

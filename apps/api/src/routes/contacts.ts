import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { eq, and, desc } from 'drizzle-orm'
import { db } from '../db'
import { contacts } from '../db/schema'
import { authMiddleware } from '../middleware/auth'
import { tenantMiddleware } from '../middleware/tenant'
import type { HonoVariables } from '../types'
import type { ContactStatus } from '@crm/shared'

const CONTACT_STATUSES: ContactStatus[] = ['lead', 'prospect', 'client', 'inactive']

type ContactBody = Partial<{
  name: string
  email: string
  phone: string
  companyName: string
  status: ContactStatus
  notes: string
}>

const contactsRoutes = new Hono<{ Variables: HonoVariables }>()

contactsRoutes.use('*', authMiddleware, tenantMiddleware)

contactsRoutes.get('/', async (c) => {
  const tenantId = c.get('tenantId')

  const rows = await db.query.contacts.findMany({
    where: eq(contacts.tenantId, tenantId),
    orderBy: desc(contacts.createdAt),
  })

  return c.json({ status: 'ok', items: rows })
})

contactsRoutes.post('/', async (c) => {
  const tenantId = c.get('tenantId')
  const body = await c.req.json().catch(() => null) as ContactBody | null

  const name = body?.name?.trim()
  if (!name) {
    throw new HTTPException(400, { message: 'El nombre es requerido' })
  }

  const status = body?.status && CONTACT_STATUSES.includes(body.status) ? body.status : 'lead'

  const [contact] = await db.insert(contacts).values({
    tenantId,
    name,
    email:       body?.email?.trim() || null,
    phone:       body?.phone?.trim() || null,
    companyName: body?.companyName?.trim() || null,
    status,
    notes:       body?.notes?.trim() || null,
  }).returning()

  return c.json({ status: 'ok', item: contact }, 201)
})

contactsRoutes.patch('/:id', async (c) => {
  const tenantId = c.get('tenantId')
  const id       = c.req.param('id')

  const existing = await db.query.contacts.findFirst({
    where: and(eq(contacts.id, id), eq(contacts.tenantId, tenantId)),
  })
  if (!existing) {
    throw new HTTPException(404, { message: 'Contacto no encontrado' })
  }

  const body = await c.req.json().catch(() => null) as ContactBody | null

  const patch: Record<string, unknown> = { updatedAt: new Date() }
  if (body?.name !== undefined)        patch.name        = body.name.trim()
  if (body?.email !== undefined)       patch.email       = body.email.trim() || null
  if (body?.phone !== undefined)       patch.phone       = body.phone.trim() || null
  if (body?.companyName !== undefined) patch.companyName = body.companyName.trim() || null
  if (body?.notes !== undefined)       patch.notes       = body.notes.trim() || null
  if (body?.status !== undefined && CONTACT_STATUSES.includes(body.status)) {
    patch.status = body.status
  }

  const [updated] = await db.update(contacts).set(patch).where(eq(contacts.id, id)).returning()

  return c.json({ status: 'ok', item: updated })
})

contactsRoutes.delete('/:id', async (c) => {
  const tenantId = c.get('tenantId')
  const id       = c.req.param('id')

  const existing = await db.query.contacts.findFirst({
    where: and(eq(contacts.id, id), eq(contacts.tenantId, tenantId)),
  })
  if (!existing) {
    throw new HTTPException(404, { message: 'Contacto no encontrado' })
  }

  await db.delete(contacts).where(eq(contacts.id, id))

  return c.json({ status: 'ok' })
})

export { contactsRoutes }

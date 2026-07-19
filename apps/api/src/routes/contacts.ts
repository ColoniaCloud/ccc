import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { eq, and, or, asc, desc, ilike, sql, inArray } from 'drizzle-orm'
import { db } from '../db'
import { contacts, tags, contactTags, customFieldDefinitions, contactActivities } from '../db/schema'
import { authMiddleware } from '../middleware/auth'
import { tenantMiddleware } from '../middleware/tenant'
import type { HonoVariables } from '../types'
import type { ContactStatus } from '@crm/shared'
import { validateCustomFieldsPatch } from '../contacts/custom-fields-validation'
import { logActivity } from '../contacts/activity-log'

const CONTACT_STATUSES: ContactStatus[] = ['lead', 'prospect', 'client', 'inactive']

type ContactBody = Partial<{
  name: string
  email: string
  phone: string
  companyName: string
  status: ContactStatus
  notes: string
  customFields: Record<string, unknown>
}>

async function getContactFieldDefinitions(tenantId: string) {
  return db.query.customFieldDefinitions.findMany({
    where: and(eq(customFieldDefinitions.tenantId, tenantId), eq(customFieldDefinitions.entityType, 'contact')),
  })
}

const contactsRoutes = new Hono<{ Variables: HonoVariables }>()

contactsRoutes.use('*', authMiddleware, tenantMiddleware)

contactsRoutes.get('/', async (c) => {
  const tenantId = c.get('tenantId')

  const search   = c.req.query('search')?.trim()
  const status   = c.req.query('status')
  const tagId    = c.req.query('tagId')
  const sort     = c.req.query('sort') ?? 'createdAt_desc'
  const page     = Math.max(1, Number(c.req.query('page')) || 1)
  const pageSize = Math.min(100, Math.max(1, Number(c.req.query('pageSize')) || 50))

  const conditions = [eq(contacts.tenantId, tenantId)]

  if (search) {
    const term = `%${search}%`
    conditions.push(
      or(
        ilike(contacts.name, term),
        ilike(contacts.email, term),
        ilike(contacts.companyName, term),
      )!,
    )
  }

  if (status && CONTACT_STATUSES.includes(status as ContactStatus)) {
    conditions.push(eq(contacts.status, status as ContactStatus))
  }

  if (tagId) {
    const matches = await db.query.contactTags.findMany({
      where: eq(contactTags.tagId, tagId),
    })
    conditions.push(inArray(contacts.id, matches.map((m) => m.contactId)))
  }

  const where = and(...conditions)

  const [sortColumn, sortDir] = sort.split('_')
  const orderColumn = sortColumn === 'name' ? contacts.name : contacts.createdAt
  const orderBy     = sortDir === 'asc' ? asc(orderColumn) : desc(orderColumn)

  const countRows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(contacts)
    .where(where)
  const count = countRows[0]?.count ?? 0

  const rows = await db.query.contacts.findMany({
    where,
    orderBy,
    limit:  pageSize,
    offset: (page - 1) * pageSize,
  })

  const contactIds = rows.map((r) => r.id)
  const tagRows = contactIds.length > 0
    ? await db
        .select({ contactId: contactTags.contactId, id: tags.id, name: tags.name, color: tags.color })
        .from(contactTags)
        .innerJoin(tags, eq(contactTags.tagId, tags.id))
        .where(inArray(contactTags.contactId, contactIds))
    : []

  const tagsByContact = new Map<string, { id: string; name: string; color: string | null }[]>()
  for (const row of tagRows) {
    const list = tagsByContact.get(row.contactId) ?? []
    list.push({ id: row.id, name: row.name, color: row.color })
    tagsByContact.set(row.contactId, list)
  }

  const items = rows.map((r) => ({ ...r, tags: tagsByContact.get(r.id) ?? [] }))

  return c.json({ status: 'ok', items, total: count, page, pageSize })
})

contactsRoutes.get('/:id', async (c) => {
  const tenantId = c.get('tenantId')
  const id       = c.req.param('id')

  const contact = await db.query.contacts.findFirst({
    where: and(eq(contacts.id, id), eq(contacts.tenantId, tenantId)),
  })
  if (!contact) {
    throw new HTTPException(404, { message: 'Contacto no encontrado' })
  }

  return c.json({ status: 'ok', item: contact })
})

contactsRoutes.get('/:id/tags', async (c) => {
  const tenantId = c.get('tenantId')
  const id       = c.req.param('id')

  const contact = await db.query.contacts.findFirst({
    where: and(eq(contacts.id, id), eq(contacts.tenantId, tenantId)),
  })
  if (!contact) {
    throw new HTTPException(404, { message: 'Contacto no encontrado' })
  }

  const rows = await db
    .select({ id: tags.id, name: tags.name, color: tags.color })
    .from(contactTags)
    .innerJoin(tags, eq(contactTags.tagId, tags.id))
    .where(eq(contactTags.contactId, id))

  return c.json({ status: 'ok', items: rows })
})

contactsRoutes.put('/:id/tags', async (c) => {
  const tenantId = c.get('tenantId')
  const id       = c.req.param('id')

  const contact = await db.query.contacts.findFirst({
    where: and(eq(contacts.id, id), eq(contacts.tenantId, tenantId)),
  })
  if (!contact) {
    throw new HTTPException(404, { message: 'Contacto no encontrado' })
  }

  const body   = await c.req.json().catch(() => null) as { tagIds?: string[] } | null
  const tagIds = Array.isArray(body?.tagIds) ? [...new Set(body.tagIds)] : []

  if (tagIds.length > 0) {
    const validTags = await db.query.tags.findMany({
      where: and(eq(tags.tenantId, tenantId), inArray(tags.id, tagIds)),
    })
    if (validTags.length !== tagIds.length) {
      throw new HTTPException(400, { message: 'Una o más etiquetas no son válidas' })
    }
  }

  await db.delete(contactTags).where(eq(contactTags.contactId, id))

  if (tagIds.length > 0) {
    await db.insert(contactTags).values(tagIds.map((tagId) => ({ contactId: id, tagId })))
  }

  return c.json({ status: 'ok' })
})

contactsRoutes.post('/', async (c) => {
  const tenantId = c.get('tenantId')
  const memberId = c.get('memberId')
  const body = await c.req.json().catch(() => null) as ContactBody | null

  const name = body?.name?.trim()
  if (!name) {
    throw new HTTPException(400, { message: 'El nombre es requerido' })
  }

  const status = body?.status && CONTACT_STATUSES.includes(body.status) ? body.status : 'lead'

  let customFields: Record<string, string | number | boolean | null> = {}
  if (body?.customFields) {
    const definitions = await getContactFieldDefinitions(tenantId)
    const result = validateCustomFieldsPatch(definitions, body.customFields)
    if (!result.valid) {
      throw new HTTPException(400, { message: result.error })
    }
    customFields = result.values
  }

  const [contact] = await db.insert(contacts).values({
    tenantId,
    name,
    email:       body?.email?.trim() || null,
    phone:       body?.phone?.trim() || null,
    companyName: body?.companyName?.trim() || null,
    status,
    notes:       body?.notes?.trim() || null,
    customFields,
  }).returning()

  if (!contact) {
    throw new HTTPException(500, { message: 'No se pudo crear el contacto' })
  }

  await logActivity({ tenantId, contactId: contact.id, memberId, type: 'created' })

  return c.json({ status: 'ok', item: contact }, 201)
})

contactsRoutes.patch('/:id', async (c) => {
  const tenantId = c.get('tenantId')
  const memberId = c.get('memberId')
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

  if (body?.customFields !== undefined) {
    const definitions = await getContactFieldDefinitions(tenantId)
    const result = validateCustomFieldsPatch(definitions, body.customFields)
    if (!result.valid) {
      throw new HTTPException(400, { message: result.error })
    }
    // Merge, no reemplazo — un PATCH parcial no debe borrar los demás
    // custom fields que ya tenía el contacto.
    patch.customFields = { ...existing.customFields, ...result.values }
  }

  const [updated] = await db.update(contacts).set(patch).where(eq(contacts.id, id)).returning()

  if (patch.status !== undefined && patch.status !== existing.status) {
    await logActivity({
      tenantId, contactId: id, memberId,
      type: 'status_change',
      metadata: { from: existing.status, to: patch.status },
    })
  }

  return c.json({ status: 'ok', item: updated })
})

contactsRoutes.get('/:id/activities', async (c) => {
  const tenantId = c.get('tenantId')
  const id       = c.req.param('id')

  const contact = await db.query.contacts.findFirst({
    where: and(eq(contacts.id, id), eq(contacts.tenantId, tenantId)),
  })
  if (!contact) {
    throw new HTTPException(404, { message: 'Contacto no encontrado' })
  }

  const rows = await db.query.contactActivities.findMany({
    where:   eq(contactActivities.contactId, id),
    orderBy: desc(contactActivities.createdAt),
  })

  return c.json({ status: 'ok', items: rows })
})

contactsRoutes.post('/:id/activities', async (c) => {
  const tenantId = c.get('tenantId')
  const memberId = c.get('memberId')
  const id       = c.req.param('id')

  const contact = await db.query.contacts.findFirst({
    where: and(eq(contacts.id, id), eq(contacts.tenantId, tenantId)),
  })
  if (!contact) {
    throw new HTTPException(404, { message: 'Contacto no encontrado' })
  }

  const body    = await c.req.json().catch(() => null) as { content?: string } | null
  const content = body?.content?.trim()
  if (!content) {
    throw new HTTPException(400, { message: 'El contenido de la nota es requerido' })
  }

  const [activity] = await db.insert(contactActivities).values({
    tenantId, contactId: id, memberId, type: 'note', content,
  }).returning()

  return c.json({ status: 'ok', item: activity }, 201)
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

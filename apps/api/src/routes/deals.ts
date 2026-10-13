import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { eq, and, desc } from 'drizzle-orm'
import { deals, pipelines, pipelineStages, contacts, properties, vehicles } from '../db/schema'
import { validateDealCatalog, validateReferences } from '../catalogs/service'
import { isUuid } from '../catalogs/validation'
import { authMiddleware } from '../middleware/auth'
import { tenantMiddleware } from '../middleware/tenant'
import type { HonoVariables } from '../types'
import type { DealCurrency } from '@crm/shared'

const CURRENCIES: DealCurrency[] = ['USD', 'UYU', 'ARS', 'CLP', 'BRL']

type DealBody = Partial<{
  title: string
  pipelineId: string
  stageId: string
  contactId: string | null
  value: string
  currency: DealCurrency
  propertyId: string | null
  vehicleId: string | null
  assignedTo: string | null
}>

const dealsRoutes = new Hono<{ Variables: HonoVariables }>()

function validateBody(body: DealBody | null) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HTTPException(400, { message: 'Ingresá los datos de la oportunidad' })
  if (body.title !== undefined && (typeof body.title !== 'string' || !body.title.trim() || body.title.length > 240)) throw new HTTPException(400, { message: 'Título inválido' })
  if (body.value !== undefined && (typeof body.value !== 'string' || !/^\d+(?:\.\d{1,2})?$/.test(body.value) || Number(body.value) > 9999999999.99)) throw new HTTPException(400, { message: 'Valor inválido: ingresá hasta dos decimales y un importe menor a diez mil millones' })
  if (body.currency !== undefined && !CURRENCIES.includes(body.currency)) throw new HTTPException(400, { message: 'Moneda inválida' })
  for (const key of ['pipelineId','stageId','contactId','assignedTo','propertyId','vehicleId'] as const) {
    if (body[key] != null && body[key] !== '' && !isUuid(body[key])) throw new HTTPException(400, { message: 'Identificador inválido' })
  }
}

dealsRoutes.use('*', authMiddleware, tenantMiddleware)

dealsRoutes.get('/', async (c) => {
  const db       = c.get('db')
  const tenantId = c.get('tenantId')

  const rows = await db
    .select({
      id:          deals.id,
      pipelineId:  deals.pipelineId,
      stageId:     deals.stageId,
      contactId:   deals.contactId,
      title:       deals.title,
      value:       deals.value,
      currency:    deals.currency,
      createdAt:   deals.createdAt,
      updatedAt:   deals.updatedAt,
      contactName: contacts.name,
      propertyId: deals.propertyId,
      vehicleId: deals.vehicleId,
      assignedTo: deals.assignedTo,
      propertyTitle: properties.title,
      vehicleTitle: vehicles.title,
    })
    .from(deals)
    .leftJoin(contacts, eq(deals.contactId, contacts.id))
    .leftJoin(properties, and(eq(deals.propertyId, properties.id), eq(properties.tenantId, tenantId)))
    .leftJoin(vehicles, and(eq(deals.vehicleId, vehicles.id), eq(vehicles.tenantId, tenantId)))
    .where(eq(deals.tenantId, tenantId))
    .orderBy(desc(deals.createdAt))

  return c.json({ status: 'ok', items: rows })
})

dealsRoutes.post('/', async (c) => {
  const db       = c.get('db')
  const tenantId = c.get('tenantId')
  const body = await c.req.json().catch(() => null) as DealBody | null
  validateBody(body)

  const title = body?.title?.trim()
  if (!title) {
    throw new HTTPException(400, { message: 'El título es requerido' })
  }
  if (!body?.pipelineId || !body?.stageId) {
    throw new HTTPException(400, { message: 'pipelineId y stageId son requeridos' })
  }

  const pipeline = await db.query.pipelines.findFirst({
    where: and(eq(pipelines.id, body.pipelineId), eq(pipelines.tenantId, tenantId)),
  })
  if (!pipeline) {
    throw new HTTPException(404, { message: 'Pipeline no encontrado' })
  }

  const stage = await db.query.pipelineStages.findFirst({
    where: and(eq(pipelineStages.id, body.stageId), eq(pipelineStages.pipelineId, pipeline.id)),
  })
  if (!stage) {
    throw new HTTPException(404, { message: 'Etapa no encontrada' })
  }

  if (body.contactId) {
    const contact = await db.query.contacts.findFirst({
      where: and(eq(contacts.id, body.contactId), eq(contacts.tenantId, tenantId)),
    })
    if (!contact) {
      throw new HTTPException(404, { message: 'Contacto no encontrado' })
    }
  }

  const currency = body.currency && CURRENCIES.includes(body.currency) ? body.currency : 'USD'
  await validateDealCatalog(db, tenantId, body.propertyId, body.vehicleId)
  if (body.assignedTo && !isUuid(body.assignedTo)) throw new HTTPException(400, { message: 'Responsable inválido' })
  await validateReferences(db, tenantId, { assignedTo: body.assignedTo })

  const [deal] = await db.insert(deals).values({
    tenantId,
    pipelineId: pipeline.id,
    stageId:    stage.id,
    contactId:  body.contactId || null,
    title,
    value:      body.value?.trim() || '0',
    currency,
    propertyId: body.propertyId || null,
    vehicleId: body.vehicleId || null,
    assignedTo: body.assignedTo || null,
  }).returning()

  return c.json({ status: 'ok', item: deal }, 201)
})

dealsRoutes.patch('/:id', async (c) => {
  const db       = c.get('db')
  const tenantId = c.get('tenantId')
  const id       = c.req.param('id')

  const existing = await db.query.deals.findFirst({
    where: and(eq(deals.id, id), eq(deals.tenantId, tenantId)),
  })
  if (!existing) {
    throw new HTTPException(404, { message: 'Deal no encontrado' })
  }

  const body = await c.req.json().catch(() => null) as DealBody | null
  validateBody(body)

  const patch: Record<string, unknown> = { updatedAt: new Date() }
  if (body?.propertyId !== undefined || body?.vehicleId !== undefined) {
    const propertyId = body.propertyId !== undefined ? body.propertyId || null : existing.propertyId
    const vehicleId = body.vehicleId !== undefined ? body.vehicleId || null : existing.vehicleId
    await validateDealCatalog(db, tenantId, propertyId, vehicleId)
    patch.propertyId = propertyId; patch.vehicleId = vehicleId
  }
  if (body?.assignedTo !== undefined) {
    if (body.assignedTo && !isUuid(body.assignedTo)) throw new HTTPException(400, { message: 'Responsable inválido' })
    await validateReferences(db, tenantId, { assignedTo: body.assignedTo })
    patch.assignedTo = body.assignedTo || null
  }

  if (body?.title !== undefined) {
    const title = body.title.trim()
    if (!title) {
      throw new HTTPException(400, { message: 'El título no puede estar vacío' })
    }
    patch.title = title
  }

  if (body?.stageId !== undefined) {
    const stage = await db.query.pipelineStages.findFirst({
      where: and(eq(pipelineStages.id, body.stageId), eq(pipelineStages.pipelineId, existing.pipelineId)),
    })
    if (!stage) {
      throw new HTTPException(404, { message: 'Etapa no encontrada' })
    }
    patch.stageId = stage.id
  }

  if (body?.contactId !== undefined) {
    if (body.contactId) {
      const contact = await db.query.contacts.findFirst({
        where: and(eq(contacts.id, body.contactId), eq(contacts.tenantId, tenantId)),
      })
      if (!contact) {
        throw new HTTPException(404, { message: 'Contacto no encontrado' })
      }
      patch.contactId = contact.id
    } else {
      patch.contactId = null
    }
  }

  if (body?.value !== undefined) patch.value = body.value.trim() || '0'
  if (body?.currency !== undefined && CURRENCIES.includes(body.currency)) patch.currency = body.currency

  const [updated] = await db.update(deals).set(patch).where(eq(deals.id, id)).returning()

  return c.json({ status: 'ok', item: updated })
})

dealsRoutes.delete('/:id', async (c) => {
  const db       = c.get('db')
  const tenantId = c.get('tenantId')
  const id       = c.req.param('id')

  const existing = await db.query.deals.findFirst({
    where: and(eq(deals.id, id), eq(deals.tenantId, tenantId)),
  })
  if (!existing) {
    throw new HTTPException(404, { message: 'Deal no encontrado' })
  }

  await db.delete(deals).where(eq(deals.id, id))

  return c.json({ status: 'ok' })
})

export { dealsRoutes }

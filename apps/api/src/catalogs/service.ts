import { and, asc, desc, eq, ilike } from 'drizzle-orm'
import { HTTPException } from 'hono/http-exception'
import type { CatalogKind } from '@crm/shared'
import type { TenantTx } from '../db/tenant-db'
import { properties, vehicles, tenantModules, contacts, members, appointments, deals } from '../db/schema'
import { isUuid, validateCatalog } from './validation'
import { dayOnly } from '../agenda/tasks'

export async function requireCatalog(db: TenantTx, tenantId: string, kind: CatalogKind) {
  if (!await db.query.tenantModules.findFirst({ where: and(eq(tenantModules.tenantId, tenantId), eq(tenantModules.moduleKey, kind)) })) {
    throw new HTTPException(403, { message: `Activá el módulo ${kind === 'properties' ? 'Propiedades' : 'Vehículos'} desde Configuración` })
  }
}

export async function catalogItem(db: TenantTx, tenantId: string, kind: CatalogKind, id: string, lock = false) {
  if (!isUuid(id)) throw new HTTPException(400, { message: 'Identificador inválido' })
  const table = kind === 'properties' ? properties : vehicles
  const query = db.select().from(table).where(and(eq(table.id, id), eq(table.tenantId, tenantId)))
  const [item] = lock ? await query.for('update') : await query
  if (!item) throw new HTTPException(404, { message: 'Ficha no encontrada' })
  return item
}

export async function validateReferences(db: TenantTx, tenantId: string, values: Record<string, unknown>) {
  if (values.sourceContactId && !await db.query.contacts.findFirst({ where: and(eq(contacts.id, String(values.sourceContactId)), eq(contacts.tenantId, tenantId)) })) {
    throw new HTTPException(404, { message: 'Contacto no encontrado en esta organización' })
  }
  if (values.assignedTo && !await db.query.members.findFirst({ where: and(eq(members.id, String(values.assignedTo)), eq(members.tenantId, tenantId)) })) {
    throw new HTTPException(404, { message: 'Responsable no encontrado en esta organización' })
  }
}

export async function validateDealCatalog(db: TenantTx, tenantId: string, propertyId: unknown, vehicleId: unknown) {
  if (propertyId && vehicleId) throw new HTTPException(400, { message: 'Una oportunidad puede vincular una propiedad o un vehículo, no ambos' })
  for (const [kind, id] of [['properties', propertyId], ['vehicles', vehicleId]] as const) {
    if (id == null || id === '') continue
    if (!isUuid(id)) throw new HTTPException(400, { message: 'Ficha inválida' })
    await requireCatalog(db, tenantId, kind)
    const item = await catalogItem(db, tenantId, kind, id, true)
    if (item.status !== 'available' && item.status !== 'reserved') throw new HTTPException(409, { message: 'La ficha no está disponible para una nueva oportunidad' })
  }
}

export async function listCatalog(db: TenantTx, tenantId: string, kind: CatalogKind, search: string, status?: string, page = 1) {
  await requireCatalog(db, tenantId, kind)
  const table = kind === 'properties' ? properties : vehicles
  const conditions = [eq(table.tenantId, tenantId)]
  if (search) conditions.push(ilike(table.title, `%${search.replace(/[%_\\]/g, '\\$&')}%`))
  if (status) conditions.push(eq(table.status, status as typeof table.$inferSelect.status))
  return db.select().from(table).where(and(...conditions)).orderBy(desc(table.createdAt), desc(table.id)).limit(50).offset((page - 1) * 50)
}

export async function saveCatalog(db: TenantTx, tenantId: string, kind: CatalogKind, input: unknown, id?: string) {
  await requireCatalog(db, tenantId, kind)
  if (id) await catalogItem(db, tenantId, kind, id, true)
  let values: Record<string, unknown>
  try { values = validateCatalog(kind, input, Boolean(id)) } catch (error) { throw new HTTPException(400, { message: (error as Error).message }) }
  await validateReferences(db, tenantId, values)
  // Campos específicos quedan validados antes de convertir al tipo de Drizzle.
  if (kind === 'properties') {
    if (id) return (await db.update(properties).set({ ...values, updatedAt: new Date() }).where(and(eq(properties.id, id), eq(properties.tenantId, tenantId))).returning())[0]!
    return (await db.insert(properties).values({ ...values, tenantId } as typeof properties.$inferInsert).returning())[0]!
  }
  if (id) return (await db.update(vehicles).set({ ...values, updatedAt: new Date() }).where(and(eq(vehicles.id, id), eq(vehicles.tenantId, tenantId))).returning())[0]!
  return (await db.insert(vehicles).values({ ...values, tenantId } as typeof vehicles.$inferInsert).returning())[0]!
}

export async function relatedCatalog(db: TenantTx, tenantId: string, kind: CatalogKind, id: string) {
  await requireCatalog(db, tenantId, kind)
  const item = await catalogItem(db, tenantId, kind, id)
  const relatedDeals = await db.select({ id: deals.id, title: deals.title, contactId: deals.contactId, contactName: contacts.name, pipelineId: deals.pipelineId })
    .from(deals).leftJoin(contacts, eq(contacts.id, deals.contactId))
    .where(and(eq(deals.tenantId, tenantId), eq(kind === 'properties' ? deals.propertyId : deals.vehicleId, id)))
    .orderBy(desc(deals.createdAt))
  const agenda = await db.select({ id: appointments.id, contactId: appointments.contactId, contactName: contacts.name,
    scheduledAt: appointments.scheduledAt, status: appointments.status, assignedTo: appointments.assignedTo,
    durationMinutes: appointments.durationMinutes,
    notes: appointments.notes })
    .from(appointments).leftJoin(contacts, eq(appointments.contactId, contacts.id))
    .where(and(eq(appointments.tenantId, tenantId), eq(kind === 'properties' ? appointments.propertyId : appointments.vehicleId, id)))
    .orderBy(asc(appointments.scheduledAt))
  const source = item.sourceContactId ? await db.query.contacts.findFirst({ where: and(eq(contacts.id, item.sourceContactId), eq(contacts.tenantId, tenantId)) }) : null
  return { item, sourceContactName: source?.name ?? null, deals: relatedDeals, appointments: agenda }
}

export async function scheduleAppointment(db: TenantTx, tenantId: string, kind: CatalogKind, id: string, input: unknown) {
  await requireCatalog(db, tenantId, kind)
  const item = await catalogItem(db, tenantId, kind, id, true)
  if (item.status !== 'available' && item.status !== 'reserved') throw new HTTPException(409, { message: 'Esta ficha ya no está disponible para agendar' })
  if (!input || typeof input !== 'object') throw new HTTPException(400, { message: 'Completá la cita' })
  const body = input as Record<string, unknown>
  if (!isUuid(body.contactId)) throw new HTTPException(400, { message: 'Elegí un interesado' })
  if (body.assignedTo != null && body.assignedTo !== '' && !isUuid(body.assignedTo)) throw new HTTPException(400, { message: 'Elegí un responsable válido' })
  const when = typeof body.scheduledAt === 'string' ? new Date(body.scheduledAt) : new Date(NaN)
  if (typeof body.scheduledAt === 'string') dayOnly(body.scheduledAt.slice(0, 10))
  if (!Number.isFinite(when.getTime()) || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/i.test(String(body.scheduledAt))) throw new HTTPException(400, { message: 'Ingresá fecha y hora con zona horaria' })
  if (when.getTime() < Date.now() - 60000) throw new HTTPException(400, { message: 'Elegí una fecha futura' })
  if (body.notes != null && (typeof body.notes !== 'string' || body.notes.length > 5000)) throw new HTTPException(400, { message: 'Notas inválidas' })
  const durationMinutes = appointmentDuration(body.durationMinutes ?? 60)
  await validateReferences(db, tenantId, { sourceContactId: body.contactId, assignedTo: body.assignedTo })
  return (await db.insert(appointments).values({ tenantId, kind: kind === 'properties' ? 'property_visit' : 'test_drive',
    propertyId: kind === 'properties' ? id : null, vehicleId: kind === 'vehicles' ? id : null,
    contactId: body.contactId, assignedTo: body.assignedTo ? String(body.assignedTo) : null,
    scheduledAt: when, durationMinutes, notes: typeof body.notes === 'string' ? body.notes.trim() || null : null }).returning())[0]!
}

export function appointmentDuration(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 15 || value > 480) throw new HTTPException(400, { message: 'La duración debe ser de 15 a 480 minutos' })
  return value
}

export async function editAppointment(db: TenantTx, tenantId: string, kind: CatalogKind, itemId: string, id: string, input: unknown) {
  await requireCatalog(db, tenantId, kind)
  await catalogItem(db, tenantId, kind, itemId)
  if (!isUuid(id) || !input || typeof input !== 'object' || Array.isArray(input)) throw new HTTPException(400, { message: 'Cita inválida' })
  const [existing] = await db.select().from(appointments).where(and(eq(appointments.id, id), eq(appointments.tenantId, tenantId), eq(kind === 'properties' ? appointments.propertyId : appointments.vehicleId, itemId))).for('update')
  if (!existing) throw new HTTPException(404, { message: 'Cita no encontrada' })
  const body = input as Record<string, unknown>, patch: Partial<typeof appointments.$inferInsert> = { updatedAt: new Date() }
  if (body.status !== undefined) {
    if (!['scheduled','completed','cancelled'].includes(String(body.status))) throw new HTTPException(400, { message: 'Estado inválido' })
    patch.status = body.status as 'scheduled' | 'completed' | 'cancelled'
  }
  if (body.scheduledAt !== undefined) {
    if (typeof body.scheduledAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/i.test(body.scheduledAt)) throw new HTTPException(400, { message: 'Ingresá fecha y hora con zona horaria' })
    const when = new Date(body.scheduledAt)
    dayOnly(body.scheduledAt.slice(0, 10))
    if (!Number.isFinite(when.getTime()) || when.getTime() < Date.now() - 60000) throw new HTTPException(400, { message: 'Elegí una fecha futura válida' })
    if ((patch.status ?? existing.status) !== 'scheduled') throw new HTTPException(409, { message: 'Solo se pueden reprogramar citas agendadas' })
    patch.scheduledAt = when
  }
  if (body.durationMinutes !== undefined) patch.durationMinutes = appointmentDuration(body.durationMinutes)
  if (body.assignedTo !== undefined) {
    if (body.assignedTo !== null && !isUuid(body.assignedTo)) throw new HTTPException(400, { message: 'Responsable inválido' })
    await validateReferences(db, tenantId, { assignedTo: body.assignedTo })
    patch.assignedTo = body.assignedTo as string | null
  }
  if (body.notes !== undefined) {
    if (body.notes !== null && (typeof body.notes !== 'string' || body.notes.length > 5000)) throw new HTTPException(400, { message: 'Notas inválidas' })
    patch.notes = typeof body.notes === 'string' ? body.notes.trim() || null : null
  }
  return (await db.update(appointments).set(patch).where(and(eq(appointments.id, id), eq(appointments.tenantId, tenantId))).returning())[0]!
}

export async function changeAppointment(db: TenantTx, tenantId: string, kind: CatalogKind, itemId: string, id: string, status: unknown) {
  await requireCatalog(db, tenantId, kind)
  await catalogItem(db, tenantId, kind, itemId)
  if (!isUuid(id) || !['scheduled','completed','cancelled'].includes(String(status))) throw new HTTPException(400, { message: 'Estado o identificador inválido' })
  const [item] = await db.update(appointments).set({ status: status as 'scheduled' | 'completed' | 'cancelled', updatedAt: new Date() })
    .where(and(eq(appointments.id, id), eq(appointments.tenantId, tenantId), eq(kind === 'properties' ? appointments.propertyId : appointments.vehicleId, itemId))).returning()
  if (!item) throw new HTTPException(404, { message: 'Cita no encontrada' })
  return item
}

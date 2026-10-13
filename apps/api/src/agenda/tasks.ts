import { and, eq } from 'drizzle-orm'
import { HTTPException } from 'hono/http-exception'
import type { TenantTx } from '../db/tenant-db'
import { tasks, contacts, deals, members } from '../db/schema'
import { isUuid } from '../catalogs/validation'

export function dayOnly(value: unknown): string | null {
  if (value === null || value === '') return null
  if (typeof value !== 'string' || !/^[1-9]\d{3}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(new Date(`${value}T00:00:00Z`).getTime()) || new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value) throw new HTTPException(400, { message: 'Ingresá una fecha válida (AAAA-MM-DD)' })
  return value
}

export async function saveTask(db: TenantTx, tenantId: string, input: unknown, id?: string) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new HTTPException(400, { message: 'Completá la tarea' })
  const body = input as Record<string, unknown>
  if (id && !isUuid(id)) throw new HTTPException(400, { message: 'Identificador inválido' })
  const existing = id ? (await db.select().from(tasks).where(and(eq(tasks.id, id), eq(tasks.tenantId, tenantId))).for('update'))[0] : null
  if (id && !existing) throw new HTTPException(404, { message: 'Tarea no encontrada' })
  const patch: Partial<typeof tasks.$inferInsert> = { updatedAt: new Date() }
  if (!id || body.title !== undefined) {
    if (typeof body.title !== 'string' || !body.title.trim() || body.title.trim().length > 250) throw new HTTPException(400, { message: 'El título debe tener entre 1 y 250 caracteres' })
    patch.title = body.title.trim()
  }
  if (body.description !== undefined) {
    if (body.description !== null && (typeof body.description !== 'string' || body.description.length > 5000)) throw new HTTPException(400, { message: 'Descripción inválida' })
    patch.description = typeof body.description === 'string' ? body.description.trim() || null : null
  }
  if (body.done !== undefined) {
    if (typeof body.done !== 'boolean') throw new HTTPException(400, { message: 'Estado inválido' })
    patch.done = body.done
  }
  if (body.dueOn !== undefined || body.dueDate !== undefined) {
    let value = body.dueOn !== undefined ? body.dueOn : body.dueDate
    if (body.dueOn === undefined && typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T.*Z$/.test(value)) {
      if (!Number.isFinite(new Date(value).getTime())) throw new HTTPException(400, { message: 'Fecha inválida' })
      value = value.slice(0, 10)
    }
    patch.dueOn = dayOnly(value)
    patch.dueDate = patch.dueOn ? new Date(`${patch.dueOn}T00:00:00Z`) : null
  }
  for (const key of ['contactId', 'dealId', 'assignedTo'] as const) {
    if (body[key] === undefined) continue
    const value = body[key]
    if (value !== null && !isUuid(value)) throw new HTTPException(400, { message: 'Relación inválida' })
    const table = key === 'contactId' ? contacts : key === 'dealId' ? deals : members
    if (value && !(await db.select({ id: table.id }).from(table).where(and(eq(table.id, String(value)), eq(table.tenantId, tenantId))))[0]) throw new HTTPException(404, { message: 'Contacto, oportunidad o responsable no encontrado en esta organización' })
    patch[key] = value as string | null
  }
  const dealId = patch.dealId !== undefined ? patch.dealId : existing?.dealId
  const contactId = patch.contactId !== undefined ? patch.contactId : existing?.contactId
  if (dealId) {
    const deal = await db.query.deals.findFirst({ where: and(eq(deals.id, dealId), eq(deals.tenantId, tenantId)) })
    if (!deal) throw new HTTPException(404, { message: 'Oportunidad no encontrada' })
    if (contactId && deal.contactId && contactId !== deal.contactId) throw new HTTPException(400, { message: 'El contacto debe coincidir con el de la oportunidad' })
    if (!contactId && body.contactId === undefined) patch.contactId = deal.contactId
  }
  if (id) return (await db.update(tasks).set(patch).where(and(eq(tasks.id, id), eq(tasks.tenantId, tenantId))).returning())[0]!
  return (await db.insert(tasks).values({ ...patch, tenantId, title: patch.title! }).returning())[0]!
}

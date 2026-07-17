import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { eq, and, asc } from 'drizzle-orm'
import { db } from '../db'
import { tasks, contacts, deals } from '../db/schema'
import { authMiddleware } from '../middleware/auth'
import { tenantMiddleware } from '../middleware/tenant'
import type { HonoVariables } from '../types'

type TaskBody = Partial<{
  title: string
  description: string | null
  dueDate: string | null
  contactId: string | null
  dealId: string | null
  done: boolean
}>

const tasksRoutes = new Hono<{ Variables: HonoVariables }>()

tasksRoutes.use('*', authMiddleware, tenantMiddleware)

tasksRoutes.get('/', async (c) => {
  const tenantId = c.get('tenantId')

  const rows = await db.query.tasks.findMany({
    where:   eq(tasks.tenantId, tenantId),
    orderBy: [asc(tasks.done), asc(tasks.dueDate)],
  })

  return c.json({ status: 'ok', items: rows })
})

tasksRoutes.post('/', async (c) => {
  const tenantId = c.get('tenantId')
  const body = await c.req.json().catch(() => null) as TaskBody | null

  const title = body?.title?.trim()
  if (!title) {
    throw new HTTPException(400, { message: 'El título es requerido' })
  }

  if (body?.contactId) {
    const contact = await db.query.contacts.findFirst({
      where: and(eq(contacts.id, body.contactId), eq(contacts.tenantId, tenantId)),
    })
    if (!contact) {
      throw new HTTPException(404, { message: 'Contacto no encontrado' })
    }
  }

  if (body?.dealId) {
    const deal = await db.query.deals.findFirst({
      where: and(eq(deals.id, body.dealId), eq(deals.tenantId, tenantId)),
    })
    if (!deal) {
      throw new HTTPException(404, { message: 'Deal no encontrado' })
    }
  }

  const [task] = await db.insert(tasks).values({
    tenantId,
    title,
    description: body?.description?.trim() || null,
    dueDate:     body?.dueDate ? new Date(body.dueDate) : null,
    contactId:   body?.contactId || null,
    dealId:      body?.dealId || null,
  }).returning()

  return c.json({ status: 'ok', item: task }, 201)
})

tasksRoutes.patch('/:id', async (c) => {
  const tenantId = c.get('tenantId')
  const id       = c.req.param('id')

  const existing = await db.query.tasks.findFirst({
    where: and(eq(tasks.id, id), eq(tasks.tenantId, tenantId)),
  })
  if (!existing) {
    throw new HTTPException(404, { message: 'Tarea no encontrada' })
  }

  const body = await c.req.json().catch(() => null) as TaskBody | null

  const patch: Record<string, unknown> = { updatedAt: new Date() }
  if (body?.title !== undefined) {
    const title = body.title.trim()
    if (!title) {
      throw new HTTPException(400, { message: 'El título no puede estar vacío' })
    }
    patch.title = title
  }
  if (body?.description !== undefined) patch.description = body.description?.trim() || null
  if (body?.dueDate !== undefined)     patch.dueDate      = body.dueDate ? new Date(body.dueDate) : null
  if (body?.done !== undefined)        patch.done         = body.done

  const [updated] = await db.update(tasks).set(patch).where(eq(tasks.id, id)).returning()

  return c.json({ status: 'ok', item: updated })
})

tasksRoutes.delete('/:id', async (c) => {
  const tenantId = c.get('tenantId')
  const id       = c.req.param('id')

  const existing = await db.query.tasks.findFirst({
    where: and(eq(tasks.id, id), eq(tasks.tenantId, tenantId)),
  })
  if (!existing) {
    throw new HTTPException(404, { message: 'Tarea no encontrada' })
  }

  await db.delete(tasks).where(eq(tasks.id, id))

  return c.json({ status: 'ok' })
})

export { tasksRoutes }

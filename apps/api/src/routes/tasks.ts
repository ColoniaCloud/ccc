import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { eq, and, asc } from 'drizzle-orm'
import { tasks } from '../db/schema'
import { authMiddleware } from '../middleware/auth'
import { tenantMiddleware } from '../middleware/tenant'
import { pilotObservation } from '../middleware/pilot'
import type { HonoVariables } from '../types'
import { saveTask } from '../agenda/tasks'
import { isUuid } from '../catalogs/validation'
const tasksRoutes = new Hono<{ Variables: HonoVariables }>()
tasksRoutes.use('*', authMiddleware, tenantMiddleware, pilotObservation)
tasksRoutes.use('*', async (c, next) => { c.header('Cache-Control', 'no-store'); await next() })
tasksRoutes.get('/', async (c) => c.json({ status: 'ok', items: await c.get('db').query.tasks.findMany({
  where: eq(tasks.tenantId, c.get('tenantId')), orderBy: [asc(tasks.done), asc(tasks.dueOn)],
}) }))
tasksRoutes.post('/', async (c) => c.json({ status: 'ok', item: await saveTask(c.get('db'), c.get('tenantId'), await c.req.json().catch(() => null)) }, 201))
tasksRoutes.patch('/:id', async (c) => c.json({ status: 'ok', item: await saveTask(c.get('db'), c.get('tenantId'), await c.req.json().catch(() => null), c.req.param('id')) }))
tasksRoutes.delete('/:id', async (c) => {
  const id = c.req.param('id')
  if (!isUuid(id)) throw new HTTPException(400, { message: 'Identificador inválido' })
  const removed = await c.get('db').delete(tasks).where(and(eq(tasks.id, id), eq(tasks.tenantId, c.get('tenantId')))).returning({ id: tasks.id })
  if (!removed.length) throw new HTTPException(404, { message: 'Tarea no encontrada' })
  return c.json({ status: 'ok' })
})
export { tasksRoutes }

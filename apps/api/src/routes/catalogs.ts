import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import type { CatalogKind } from '@crm/shared'
import type { HonoVariables } from '../types'
import { authMiddleware } from '../middleware/auth'
import { tenantMiddleware } from '../middleware/tenant'
import { pilotObservation } from '../middleware/pilot'
import { listCatalog, saveCatalog, relatedCatalog, scheduleAppointment, editAppointment } from '../catalogs/service'

export function createCatalogRoutes(kind: CatalogKind) {
  const routes = new Hono<{ Variables: HonoVariables }>()
  routes.use('*', authMiddleware, tenantMiddleware, pilotObservation)
  routes.get('/', async (c) => {
    const page = Number(c.req.query('page') ?? 1)
    const search = c.req.query('search') ?? ''
    const status = c.req.query('status')
    const statuses = kind === 'properties' ? ['available','reserved','sold','rented','archived'] : ['available','reserved','sold','archived']
    if (!Number.isInteger(page) || page < 1 || page > 100000 || search.length > 160 || (status && !statuses.includes(status))) throw new HTTPException(400, { message: 'Filtros inválidos' })
    const items = await listCatalog(c.get('db'), c.get('tenantId'), kind, search, status, page)
    return c.json({ status: 'ok', items, page, pageSize: 50 })
  })
  routes.post('/', async (c) => c.json({ status: 'ok', item: await saveCatalog(c.get('db'), c.get('tenantId'), kind, await c.req.json().catch(() => null)) }, 201))
  routes.get('/:id', async (c) => c.json({ status: 'ok', ...await relatedCatalog(c.get('db'), c.get('tenantId'), kind, c.req.param('id')) }))
  routes.patch('/:id', async (c) => c.json({ status: 'ok', item: await saveCatalog(c.get('db'), c.get('tenantId'), kind, await c.req.json().catch(() => null), c.req.param('id')) }))
  // Archivar conserva las relaciones y permite restaurar con PATCH status=available.
  routes.post('/:id/archive', async (c) => c.json({ status: 'ok', item: await saveCatalog(c.get('db'), c.get('tenantId'), kind, { status: 'archived' }, c.req.param('id')) }))
  routes.post('/:id/appointments', async (c) => c.json({ status: 'ok', item: await scheduleAppointment(c.get('db'), c.get('tenantId'), kind, c.req.param('id'), await c.req.json().catch(() => null)) }, 201))
  routes.patch('/:id/appointments/:appointmentId', async (c) => {
    return c.json({ status: 'ok', item: await editAppointment(c.get('db'), c.get('tenantId'), kind, c.req.param('id'), c.req.param('appointmentId'), await c.req.json().catch(() => null)) })
  })
  return routes
}

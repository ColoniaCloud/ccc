import { Hono } from 'hono'
import { authMiddleware } from '../middleware/auth'
import { tenantMiddleware } from '../middleware/tenant'
import type { HonoVariables } from '../types'
import { agenda } from '../agenda/service'
const agendaRoutes = new Hono<{ Variables: HonoVariables }>()
agendaRoutes.use('*', authMiddleware, tenantMiddleware)
agendaRoutes.get('/', async (c) => { c.header('Cache-Control', 'no-store'); return c.json({ status: 'ok', ...await agenda(c.get('db'), c.get('tenantId')) }) })
export { agendaRoutes }

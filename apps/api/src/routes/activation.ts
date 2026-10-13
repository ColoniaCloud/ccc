import { Hono } from 'hono'
import { authMiddleware } from '../middleware/auth'
import { tenantMiddleware } from '../middleware/tenant'
import type { HonoVariables } from '../types'
import { activation } from '../onboarding/activation'
const activationRoutes = new Hono<{ Variables: HonoVariables }>()
activationRoutes.use('*', authMiddleware, tenantMiddleware)
activationRoutes.get('/', async (c) => {
  c.header('Cache-Control', 'no-store')
  return c.json({ status: 'ok', ...await activation(c.get('db'), c.get('tenantId'), c.get('memberId')) })
})
export { activationRoutes }

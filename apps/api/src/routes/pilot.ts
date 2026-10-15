import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { authMiddleware } from '../middleware/auth'
import { tenantMiddleware } from '../middleware/tenant'
import { startPilot, pilotReport, pilotEvidence } from '../onboarding/pilot'
import type { HonoVariables } from '../types'
const pilotRoutes = new Hono<{ Variables: HonoVariables }>()
pilotRoutes.use('*', authMiddleware, tenantMiddleware)
pilotRoutes.use('*', async (c, next) => {
  if (!['owner','admin'].includes(c.get('memberRole'))) throw new HTTPException(403, { message: 'Solo el propietario o un administrador puede revisar la medición del piloto' })
  c.header('Cache-Control', 'no-store'); await next()
})
pilotRoutes.get('/', async c => c.json({ status: 'ok', ...await pilotReport(c.get('db'), c.get('tenantId')) }))
pilotRoutes.get('/export', async c => {
  const evidence = await pilotEvidence(c.get('db'), c.get('tenantId'))
  if (!evidence) throw new HTTPException(400, { message: 'El informe está disponible para inmobiliarias y automotor' })
  c.header('Content-Disposition', 'attachment; filename="plata-piloto.json"')
  return c.json(evidence)
})
pilotRoutes.post('/start', async c => {
  if (!await startPilot(c.get('db'), c.get('tenantId'), c.get('memberId'))) throw new HTTPException(400, { message: 'La medición del piloto está disponible para inmobiliarias y automotor' })
  return c.json({ status: 'ok', ...await pilotReport(c.get('db'), c.get('tenantId')) })
})
export { pilotRoutes }

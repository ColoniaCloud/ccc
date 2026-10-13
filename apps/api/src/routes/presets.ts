import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { authMiddleware } from '../middleware/auth'
import { tenantMiddleware } from '../middleware/tenant'
import type { HonoVariables } from '../types'
import { PRESETS } from '../presets/catalog'
import { previewPreset, applyPreset } from '../presets/service'

const presetsRoutes = new Hono<{ Variables: HonoVariables }>()
presetsRoutes.use('*', authMiddleware, tenantMiddleware)
presetsRoutes.get('/', (c) => c.json({ status: 'ok', items: Object.values(PRESETS) }))
presetsRoutes.post('/:key/preview', async (c) => {
  if (!['owner', 'admin'].includes(c.get('memberRole'))) throw new HTTPException(403, { message: 'Solo un administrador puede revisar la configuración' })
  return c.json({ status: 'ok', preview: await previewPreset(c.get('db'), c.get('tenantId'), c.req.param('key')) })
})
presetsRoutes.post('/:key/apply', async (c) => {
  const body = await c.req.json().catch(() => null) as { fingerprint?: unknown } | null
  if (typeof body?.fingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(body.fingerprint)) throw new HTTPException(400, { message: 'Revisá la vista previa antes de aplicar' })
  return c.json({ status: 'ok', ...await applyPreset(c.get('db'), c.get('tenantId'), c.get('memberId'), c.req.param('key'), body.fingerprint) })
})
export { presetsRoutes }

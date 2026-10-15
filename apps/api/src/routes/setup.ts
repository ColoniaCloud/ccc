import { Hono } from 'hono'
import { authMiddleware } from '../middleware/auth'
import { tenantAccessMiddleware } from '../middleware/tenant'
import { withTenant } from '../db/tenant-db'
import type { HonoVariables } from '../types'
import { AnthropicSetupAssistant } from '../onboarding/anthropic'
import { OnboardingAssistantService } from '../onboarding/assistant-service'

const service = new OnboardingAssistantService(withTenant, new AnthropicSetupAssistant())
const setupRoutes = new Hono<{ Variables: HonoVariables }>()
setupRoutes.use('*', authMiddleware, tenantAccessMiddleware)
setupRoutes.get('/', async (c) => { c.header('Cache-Control','no-store'); return c.json({ status: 'ok', ...await service.get(c.get('tenantId'), c.get('memberId')) }) })
setupRoutes.post('/message', async (c) => {
  const body = await c.req.json().catch(() => null)
  return c.json({ status: 'ok', ...await service.message(c.get('tenantId'), c.get('memberId'), body?.text, body?.revision) })
})
setupRoutes.put('/proposal', async (c) => {
  const body = await c.req.json().catch(() => null)
  return c.json({ status: 'ok', ...await service.edit(c.get('tenantId'), c.get('memberId'), body?.proposal, body?.revision) })
})
setupRoutes.post('/preview', async (c) => {
  const body = await c.req.json().catch(() => null)
  return c.json({ status: 'ok', approval: await service.preview(c.get('tenantId'), c.get('memberId'), body?.revision) })
})
setupRoutes.post('/apply', async (c) => {
  const body = await c.req.json().catch(() => null)
  return c.json({ status: 'ok', ...await service.apply(c.get('tenantId'), c.get('memberId'), body?.revision, body?.fingerprint) })
})
setupRoutes.post('/defer', async (c) => c.json({ status: 'ok', ...await service.defer(c.get('tenantId'), c.get('memberId')) }))
setupRoutes.post('/resume', async (c) => c.json({ status: 'ok', ...await service.resume(c.get('tenantId'), c.get('memberId')) }))
setupRoutes.post('/refine', async c => {
  const body = await c.req.json().catch(() => null)
  return c.json({ status: 'ok', ...await service.refine(c.get('tenantId'), c.get('memberId'), body?.revision) })
})
export { setupRoutes }

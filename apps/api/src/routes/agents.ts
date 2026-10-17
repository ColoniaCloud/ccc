import { Hono } from 'hono'
import { authMiddleware } from '../middleware/auth'
import { tenantAccessMiddleware } from '../middleware/tenant'
import { withTenant } from '../db/tenant-db'
import type { HonoVariables } from '../types'
import { AgentService } from '../agents/service'
import { AnthropicAgentAssistant } from '../agents/provider'

const service = new AgentService(withTenant, new AnthropicAgentAssistant())
export const agentsRoutes = new Hono<{ Variables: HonoVariables }>()
agentsRoutes.use('*', authMiddleware, tenantAccessMiddleware)
agentsRoutes.use('*', async (c, next) => { c.header('Cache-Control', 'no-store'); await next() })
agentsRoutes.get('/', async c => c.json({ status: 'ok', ...await service.list(c.get('tenantId'), c.get('memberId')) }))
agentsRoutes.post('/', async c => c.json({ status: 'ok', item: await service.save(c.get('tenantId'), c.get('memberId'), await c.req.json().catch(() => null)) }, 201))
agentsRoutes.get('/:id', async c => c.json({ status: 'ok', ...await service.detail(c.get('tenantId'), c.get('memberId'), c.req.param('id')) }))
agentsRoutes.put('/:id', async c => c.json({ status: 'ok', item: await service.save(c.get('tenantId'), c.get('memberId'), await c.req.json().catch(() => null), c.req.param('id')) }))
agentsRoutes.post('/:id/archive', async c => { await service.archive(c.get('tenantId'), c.get('memberId'), c.req.param('id')); return c.json({ status: 'ok' }) })
agentsRoutes.post('/:id/run', async c => c.json({ status: 'ok', ...await service.execute(c.get('tenantId'), c.get('memberId'), c.req.param('id'), 'run') }))
agentsRoutes.post('/:id/chat', async c => { const body = await c.req.json().catch(() => null); return c.json({ status: 'ok', ...await service.execute(c.get('tenantId'), c.get('memberId'), c.req.param('id'), 'chat', body?.message) }) })
agentsRoutes.post('/:id/proposals/:proposalId', async c => { const body = await c.req.json().catch(() => null); return c.json({ status: 'ok', item: await service.decide(c.get('tenantId'), c.get('memberId'), c.req.param('id'), c.req.param('proposalId'), body?.decision) }) })

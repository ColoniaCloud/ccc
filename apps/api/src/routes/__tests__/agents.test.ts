import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Hono, type Context, type Next } from 'hono'
import type { HonoVariables } from '../../types'

const handlers = vi.hoisted(() => ({
  list: vi.fn(async () => ({ items: [], quota: { agents: 1, remaining: 40 } })),
  save: vi.fn(async () => ({ id: 'created-agent', status: 'paused' })),
}))
vi.mock('../../agents/service', () => ({ AgentService: class { list = handlers.list; save = handlers.save } }))
vi.mock('../../agents/provider', () => ({ AnthropicAgentAssistant: class {} }))
vi.mock('../../db/tenant-db', () => ({ withTenant: vi.fn() }))
vi.mock('../../middleware/auth', () => ({
  authMiddleware: async (c: Context, next: Next) => {
    if (c.req.header('authorization') !== 'Bearer fixture') return c.json({ status: 'error', error: 'No autenticado' }, 401)
    return next()
  },
}))
vi.mock('../../middleware/tenant', () => ({
  tenantAccessMiddleware: async (c: Context<{ Variables: HonoVariables }>, next: Next) => {
    c.set('tenantId', 'fixture-tenant'); c.set('memberId', 'fixture-member'); await next()
  },
}))
import { agentsRoutes } from '../agents'

const app = new Hono().route('/api/agents', agentsRoutes)
const headers = { authorization: 'Bearer fixture', 'content-type': 'application/json' }
beforeEach(() => { vi.clearAllMocks() })

describe('HTTP de Agentes montado en su ruta pública', () => {
  it('carga la lista autenticada sin barra final y devuelve JSON', async () => {
    const response = await app.request('/api/agents', { headers })
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ status: 'ok', items: [] })
    expect(handlers.list).toHaveBeenCalledWith('fixture-tenant', 'fixture-member')
  })
  it('redirige la URL usada por el cliente anterior y conserva query y sesión', async () => {
    const redirect = await app.request('/api/agents/?view=list', { headers })
    expect(redirect.status).toBe(308)
    expect(redirect.headers.get('location')).toBe('/api/agents?view=list')
    const response = await app.request(redirect.headers.get('location')!, { headers })
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ status: 'ok', items: [] })
  })
  it('conserva el método y cuerpo al crear desde la URL con barra final', async () => {
    const input = { name: 'Sofía', staleDays: 5 }
    const request = { method: 'POST', headers, body: JSON.stringify(input) }
    const redirect = await app.request('/api/agents/', request)
    expect(redirect.status).toBe(308)
    const response = await app.request(redirect.headers.get('location')!, request)
    expect(response.status).toBe(201)
    expect(await response.json()).toMatchObject({ item: { id: 'created-agent' } })
    expect(handlers.save).toHaveBeenCalledWith('fixture-tenant', 'fixture-member', input)
  })
  it('exige autenticación en la ruta canónica y después de redirigir', async () => {
    const redirect = await app.request('/api/agents/')
    const response = await app.request(redirect.headers.get('location')!)
    expect(response.status).toBe(401)
    expect(await response.json()).toMatchObject({ error: 'No autenticado' })
    expect(handlers.list).not.toHaveBeenCalled()
  })
})

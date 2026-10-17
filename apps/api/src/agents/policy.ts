import { HTTPException } from 'hono/http-exception'
import { isUuid } from '../catalogs/validation'

// Separate from onboarding. One credit = one bounded model call (run or chat).
// Failed/abandoned calls remain charged: the provider may have processed them.
export const AGENT_LIMITS = {
  free: { agents: 0, calls: 0, records: 0 },
  pro: { agents: 1, calls: 40, records: 25 },
  business: { agents: 3, calls: 150, records: 50 },
  master: { agents: 10, calls: 500, records: 100 },
  enterprise: { agents: 20, calls: 1000, records: 100 },
} as const
export function limitsFor(plan: string) { return AGENT_LIMITS[plan as keyof typeof AGENT_LIMITS] ?? AGENT_LIMITS.free }
export const CONFIGURE_ROLES = ['owner', 'admin']
export const APPROVE_ROLES = ['owner', 'admin', 'manager']
export const EXECUTE_ROLES = ['owner', 'admin', 'manager', 'seller']
export function validId(id: string) { if (!isUuid(id)) throw new HTTPException(400, { message: 'Identificador inválido' }); return id }
export function agentInput(input: unknown) {
  const b = input as Record<string, unknown> | null
  if (!b || typeof b !== 'object' || Array.isArray(b) || typeof b.name !== 'string' || !b.name.trim() || b.name.length > 80 ||
    typeof b.instructions !== 'string' || b.instructions.length > 2000 || !Number.isInteger(b.staleDays) || Number(b.staleDays) < 1 || Number(b.staleDays) > 90 ||
    !['active', 'paused'].includes(String(b.status)) || (b.pipelineId !== null && !isUuid(b.pipelineId))) {
    throw new HTTPException(400, { message: 'Completá nombre, instrucciones (hasta 2000 caracteres), días sin actividad (1–90), proceso y estado.' })
  }
  return { name: b.name.trim(), instructions: b.instructions.trim(), staleDays: Number(b.staleDays), pipelineId: b.pipelineId as string | null, status: b.status as 'active' | 'paused' }
}

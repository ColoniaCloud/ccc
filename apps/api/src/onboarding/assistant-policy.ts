import { createHash } from 'node:crypto'
import type { BusinessProfile, PresetKey, SetupProposal, SetupTurn } from '@crm/shared'
import { HTTPException } from 'hono/http-exception'

export const MAX_SETUP_ATTEMPTS = 20
export const REQUEST_LEASE_MS = 120000
export function profileFingerprint(profile: BusinessProfile | null) { return createHash('sha256').update(JSON.stringify(profile)).digest('hex') }
export function allowedPresets(profile: BusinessProfile | null): PresetKey[] {
  return profile?.industry === 'real_estate' ? ['real_estate_sale','real_estate_rent'] : profile?.industry === 'automotive' ? ['automotive_sales'] : []
}
function text(value: unknown, max: number): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new HTTPException(400, { message: 'La propuesta contiene texto inválido' })
  return value.trim()
}
export function validateProposal(input: unknown, profile: BusinessProfile | null): SetupProposal {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new HTTPException(400, { message: 'Propuesta inválida' })
  const value = input as Record<string, unknown>, allowed = allowedPresets(profile)
  if (!Array.isArray(value.presets) || !value.presets.length || value.presets.length > 2 || value.presets.some((key) => !allowed.includes(key as PresetKey))) throw new HTTPException(400, { message: 'Elegí plantillas compatibles con el rubro del negocio' })
  if (new Set(value.presets).size !== value.presets.length) throw new HTTPException(400, { message: 'Las plantillas no pueden repetirse' })
  if (!Array.isArray(value.recommendations) || value.recommendations.length > 5 || !Array.isArray(value.connections) || value.connections.length > 8) throw new HTTPException(400, { message: 'Plan de trabajo inválido' })
  const connections = value.connections.map((entry: unknown) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new HTTPException(400, { message: 'Conexión inválida' })
    const item = entry as Record<string, unknown>
    return { tool: text(item.tool, 80), purpose: text(item.purpose, 240) }
  })
  return { summary: text(value.summary, 1200), presets: value.presets as PresetKey[], recommendations: value.recommendations.map((item) => text(item, 240)), connections }
}
export function validateTurn(input: unknown, profile: BusinessProfile | null): SetupTurn {
  if (!input || typeof input !== 'object') throw new Error('Respuesta de IA inválida')
  const value = input as Record<string, unknown>
  return { reply: text(value.reply, 2400), proposal: value.proposal == null ? null : validateProposal(value.proposal, profile) }
}
export function validateRevision(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) throw new HTTPException(400, { message: 'Revisión inválida. Actualizá la conversación' })
  return Number(value)
}

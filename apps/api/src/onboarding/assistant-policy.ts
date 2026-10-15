import { createHash } from 'node:crypto'
import type { BusinessProfile, PresetKey, SetupProposal, SetupTurn, SetupProcess, SetupField, CustomFieldType } from '@crm/shared'
import { HTTPException } from 'hono/http-exception'

export const MAX_SETUP_ATTEMPTS = 20
export const REQUEST_LEASE_MS = 120000
export function profileFingerprint(profile: BusinessProfile | null) { return createHash('sha256').update(JSON.stringify(profile)).digest('hex') }
export function allowedPresets(profile: BusinessProfile | null): PresetKey[] {
  return profile?.industry === 'real_estate' ? ['real_estate_sale','real_estate_rent'] : profile?.industry === 'automotive' ? ['automotive_sales'] : []
}
function text(value: unknown, max: number): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) throw new HTTPException(400, { message: 'La propuesta contiene texto inválido' })
  return value.trim()
}
const comparable = (value: string) => value.normalize('NFKC').toLocaleLowerCase('es').trim()
function uniqueNames(values: string[]) {
  if (new Set(values.map(comparable)).size !== values.length) throw new HTTPException(400, { message: 'Los nombres y opciones no pueden repetirse' })
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new HTTPException(400, { message: 'Personalización inválida' })
  return value as Record<string, unknown>
}
export function validatePersonalization(value: Record<string, unknown>, presets: PresetKey[]): { processes?: SetupProcess[]; fields?: SetupField[] } {
  const result: { processes?: SetupProcess[]; fields?: SetupField[] } = {}
  if (value.processes !== undefined) {
    if (!Array.isArray(value.processes) || value.processes.length > 2) throw new HTTPException(400, { message: 'Podés personalizar hasta dos procesos' })
    result.processes = value.processes.map(entry => {
      const item = object(entry)
      if (!presets.includes(item.presetKey as PresetKey) || !Array.isArray(item.openStages) || !item.openStages.length || item.openStages.length > 8) throw new HTTPException(400, { message: 'Elegí un proceso compatible y entre una y ocho etapas abiertas' })
      const process = { presetKey: item.presetKey as PresetKey, name: text(item.name, 120), openStages: item.openStages.map(stage => text(stage, 60)), wonLabel: text(item.wonLabel, 60), lostLabel: text(item.lostLabel, 60) }
      uniqueNames([...process.openStages, process.wonLabel, process.lostLabel]); return process
    })
    uniqueNames(result.processes.map(p => p.name))
    if (new Set(result.processes.map(p => p.presetKey)).size !== result.processes.length) throw new HTTPException(400, { message: 'Cada plantilla admite un proceso personalizado' })
  }
  if (value.fields !== undefined) {
    if (!Array.isArray(value.fields) || value.fields.length > 8) throw new HTTPException(400, { message: 'Podés proponer hasta ocho campos opcionales de contacto' })
    result.fields = value.fields.map(entry => {
      const item = object(entry), key = text(item.key, 44), types: CustomFieldType[] = ['text','number','date','boolean','select']
      if (!/^biz_[a-z][a-z0-9_]{0,39}$/.test(key) || !types.includes(item.fieldType as CustomFieldType)) throw new HTTPException(400, { message: 'Campo inválido: usá una clave biz_ y un tipo admitido' })
      const field: SetupField = { key, label: text(item.label, 80), fieldType: item.fieldType as CustomFieldType }
      if (field.fieldType === 'select') {
        if (!Array.isArray(item.options) || item.options.length < 2 || item.options.length > 12) throw new HTTPException(400, { message: 'Una lista necesita entre dos y doce opciones' })
        field.options = item.options.map(option => text(option, 80)); uniqueNames(field.options)
      } else if (item.options !== undefined && item.options !== null && (!Array.isArray(item.options) || item.options.length)) throw new HTTPException(400, { message: 'Solo las listas admiten opciones' })
      return field
    })
    uniqueNames(result.fields.map(f => f.label))
    if (new Set(result.fields.map(f => f.key)).size !== result.fields.length) throw new HTTPException(400, { message: 'Las claves de campo no pueden repetirse' })
  }
  return result
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
  return { summary: text(value.summary, 1200), presets: value.presets as PresetKey[], recommendations: value.recommendations.map((item) => text(item, 240)), connections, ...validatePersonalization(value, value.presets as PresetKey[]) }
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

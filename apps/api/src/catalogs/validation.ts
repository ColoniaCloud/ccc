import type { CatalogKind } from '@crm/shared'

export const CURRENCIES = ['USD', 'UYU', 'ARS', 'CLP', 'BRL'] as const
export const PROPERTY_TYPES = ['house', 'apartment', 'land', 'commercial', 'office', 'other'] as const
export const isUuid = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value)

export function validateCatalog(kind: CatalogKind, input: unknown, partial = false): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Ingresá los datos de la ficha')
  const body = input as Record<string, unknown>, result: Record<string, unknown> = {}
  function text(key: string, label: string, required = false, max = 160) {
    if (partial && body[key] === undefined) return
    const value = body[key]
    if (value !== undefined && value !== null && typeof value !== 'string') throw new Error(`${label}: texto inválido`)
    const normalized = typeof value === 'string' ? value.trim() : ''
    if ((required && !normalized) || normalized.length > max) throw new Error(`${label}: ${required ? 'completá el campo' : 'texto demasiado largo'}`)
    result[key] = normalized || null
  }
  function choice(key: string, label: string, choices: readonly string[], fallback?: string) {
    if (partial && body[key] === undefined) return
    const value = body[key] ?? fallback
    if (typeof value !== 'string' || !choices.includes(value)) throw new Error(`${label}: elegí una opción válida`)
    result[key] = value
  }
  function number(key: string, label: string, integer = false, required = false, max = 999999999999) {
    if (partial && body[key] === undefined) return
    const value = body[key]
    if (value === undefined || value === null || value === '') {
      if (required) throw new Error(`${label}: completá el campo`)
      result[key] = null; return
    }
    if ((typeof value !== 'string' && typeof value !== 'number') || !/^\d+(?:\.\d{1,2})?$/.test(String(value))) throw new Error(`${label}: número inválido`)
    const numeric = Number(value)
    if (!Number.isFinite(numeric) || numeric < 0 || numeric > max || (integer && !Number.isInteger(numeric))) throw new Error(`${label}: número fuera de rango`)
    result[key] = integer ? numeric : String(numeric)
  }
  text('title', 'Título', true)
  text('notes', 'Notas', false, 5000)
  number('price', 'Precio')
  choice('currency', 'Moneda', CURRENCIES, 'USD')
  choice('status', 'Estado', kind === 'properties' ? ['available','reserved','sold','rented','archived'] : ['available','reserved','sold','archived'], 'available')
  for (const key of ['sourceContactId', 'assignedTo']) {
    if (partial && body[key] === undefined) continue
    const value = body[key]
    if (value !== undefined && value !== null && value !== '' && !isUuid(value)) throw new Error('Contacto o responsable inválido')
    result[key] = value || null
  }
  if (kind === 'properties') {
    choice('operation', 'Operación', ['sale','rent'])
    choice('propertyType', 'Tipo de propiedad', PROPERTY_TYPES)
    text('address', 'Dirección', true, 240); text('city', 'Ciudad', true); text('region', 'Departamento o provincia')
    number('bedrooms', 'Dormitorios', true, false, 100); number('bathrooms', 'Baños', true, false, 100)
    number('area', 'Superficie', false, false, 9999999999)
  } else {
    text('make', 'Marca', true, 80); text('model', 'Modelo', true, 100); text('plate', 'Matrícula', false, 24)
    number('year', 'Año', true, true, new Date().getUTCFullYear() + 1)
    if (result.year !== undefined && Number(result.year) < 1886) throw new Error('Año: número fuera de rango')
    number('mileage', 'Kilometraje', true, false, 2147483647)
    choice('stockType', 'Origen', ['owned','consignment'], 'owned')
  }
  return result
}

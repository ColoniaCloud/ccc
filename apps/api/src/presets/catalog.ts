import type { CatalogKind, PresetKey, CustomFieldType } from '@crm/shared'

export type PresetField = { key: string; label: string; fieldType: CustomFieldType; options?: string[] }
export type Preset = { key: PresetKey; version: number; label: string; description: string;
  module: CatalogKind; pipelineName: string; stages: string[]; fields: PresetField[] }

const REAL_ESTATE_FIELDS: PresetField[] = [
  { key: 're_operation', label: 'Busca comprar o alquilar', fieldType: 'select', options: ['Comprar', 'Alquilar'] },
  { key: 're_zone', label: 'Zonas de interés', fieldType: 'text' },
  { key: 're_budget_min', label: 'Presupuesto mínimo', fieldType: 'number' },
  { key: 're_budget_max', label: 'Presupuesto máximo', fieldType: 'number' },
  { key: 're_currency', label: 'Moneda del presupuesto', fieldType: 'select', options: ['USD', 'UYU', 'ARS'] },
  { key: 're_bedrooms', label: 'Dormitorios buscados', fieldType: 'number' },
]

export const PRESETS: Record<PresetKey, Preset> = {
  real_estate_sale: {
    key: 'real_estate_sale', version: 1, label: 'Inmobiliaria · Venta', module: 'properties', pipelineName: 'Venta de propiedades',
    description: 'Organizá propiedades e interesados y acompañá cada consulta hasta la venta.',
    stages: ['Nuevo', 'Calificado', 'Visita', 'Propuesta', 'Reserva', 'Ganado', 'Perdido'], fields: REAL_ESTATE_FIELDS,
  },
  real_estate_rent: {
    key: 'real_estate_rent', version: 1, label: 'Inmobiliaria · Alquiler', module: 'properties', pipelineName: 'Alquiler de propiedades',
    description: 'Seguí consultas, visitas y documentación hasta el cierre del alquiler.',
    stages: ['Nuevo', 'Calificado', 'Visita', 'Documentación', 'Reserva', 'Ganado', 'Perdido'], fields: REAL_ESTATE_FIELDS,
  },
  automotive_sales: {
    key: 'automotive_sales', version: 1, label: 'Automotor · Venta', module: 'vehicles', pipelineName: 'Venta de vehículos',
    description: 'Gestioná vehículos, compradores, pruebas de manejo y propuestas comerciales.',
    stages: ['Nuevo', 'Calificado', 'Prueba de manejo', 'Propuesta', 'Reserva', 'Ganado', 'Perdido'],
    fields: [
      { key: 'auto_preferences', label: 'Vehículos de interés', fieldType: 'text' },
      { key: 'auto_budget', label: 'Presupuesto disponible', fieldType: 'number' },
      { key: 'auto_currency', label: 'Moneda del presupuesto', fieldType: 'select', options: ['USD', 'UYU', 'ARS'] },
      { key: 'auto_trade_in', label: 'Tiene vehículo para permutar', fieldType: 'boolean' },
      { key: 'auto_financing', label: 'Le interesa financiación', fieldType: 'boolean' },
    ],
  },
}

export function getPreset(key: string): Preset | null {
  return Object.hasOwn(PRESETS, key) ? PRESETS[key as PresetKey] : null
}

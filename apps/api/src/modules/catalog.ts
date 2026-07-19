import type { ModuleKey } from '@crm/shared'

export const MODULE_KEYS = ['stock', 'service_periods'] as const

export const MODULE_CATALOG: Record<ModuleKey, { label: string; description: string }> = {
  stock: {
    label: 'Stock',
    description: 'Catálogo de productos y control de inventario, vinculado a tus contactos.',
  },
  service_periods: {
    label: 'Períodos de servicio',
    description: 'Agenda y vigencia de servicios por contacto — membresías, turnos, contratos.',
  },
}

export function isModuleKey(key: string): key is ModuleKey {
  return (MODULE_KEYS as readonly string[]).includes(key)
}

import { describe, it, expect } from 'vitest'
import { MODULE_CATALOG, MODULE_KEYS, isModuleKey } from '../catalog'

describe('MODULE_CATALOG', () => {
  it('tiene label y description para cada módulo', () => {
    for (const key of MODULE_KEYS) {
      expect(MODULE_CATALOG[key].label).toBeTruthy()
      expect(MODULE_CATALOG[key].description).toBeTruthy()
    }
  })
})

describe('isModuleKey', () => {
  it('acepta stock y service_periods', () => {
    expect(isModuleKey('stock')).toBe(true)
    expect(isModuleKey('service_periods')).toBe(true)
  })

  it('rechaza valores arbitrarios', () => {
    expect(isModuleKey('billing')).toBe(false)
    expect(isModuleKey('')).toBe(false)
  })
})

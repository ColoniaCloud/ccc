import { describe, it, expect } from 'vitest'
import { PLAN_CATALOG, PAYABLE_PLANS, isPayablePlan, isKnownPlan } from '../plans'

describe('PLAN_CATALOG', () => {
  it('tiene un precio en USD para cada plan pagable', () => {
    for (const plan of PAYABLE_PLANS) {
      expect(PLAN_CATALOG[plan].priceUsd).toBeGreaterThan(0)
      expect(PLAN_CATALOG[plan].label).toBeTruthy()
    }
  })
})

describe('isPayablePlan', () => {
  it('acepta pro, business y master', () => {
    expect(isPayablePlan('pro')).toBe(true)
    expect(isPayablePlan('business')).toBe(true)
    expect(isPayablePlan('master')).toBe(true)
  })

  it('rechaza free, enterprise y valores arbitrarios', () => {
    expect(isPayablePlan('free')).toBe(false)
    expect(isPayablePlan('enterprise')).toBe(false)
    expect(isPayablePlan('gold')).toBe(false)
    expect(isPayablePlan('')).toBe(false)
  })
})

describe('isKnownPlan', () => {
  it('acepta los 5 planes del catálogo', () => {
    expect(isKnownPlan('free')).toBe(true)
    expect(isKnownPlan('pro')).toBe(true)
    expect(isKnownPlan('business')).toBe(true)
    expect(isKnownPlan('master')).toBe(true)
    expect(isKnownPlan('enterprise')).toBe(true)
  })

  it('rechaza planes que no existen', () => {
    expect(isKnownPlan('platinum')).toBe(false)
  })
})

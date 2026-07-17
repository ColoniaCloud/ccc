import { describe, it, expect } from 'vitest'
import { parseExternalReference } from '../mercadopago'

describe('parseExternalReference', () => {
  it('separa tenantId y plan de "tenantId:plan"', () => {
    expect(parseExternalReference('1f7b60e4-616e-47e3-8b89-b7075a50d040:pro'))
      .toEqual({ tenantId: '1f7b60e4-616e-47e3-8b89-b7075a50d040', plan: 'pro' })
  })

  it('devuelve null si falta el separador', () => {
    expect(parseExternalReference('sin-separador')).toBeNull()
  })

  it('devuelve null si está vacío o undefined', () => {
    expect(parseExternalReference('')).toBeNull()
    expect(parseExternalReference(undefined)).toBeNull()
  })

  it('devuelve null si falta la parte del plan', () => {
    expect(parseExternalReference('tenant-id:')).toBeNull()
  })
})

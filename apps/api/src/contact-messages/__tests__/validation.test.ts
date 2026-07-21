import { describe, it, expect } from 'vitest'
import { validateContactMessage } from '../validation'

describe('validateContactMessage', () => {
  it('acepta un body válido y recorta espacios', () => {
    const result = validateContactMessage({
      name: '  María Fernández  ',
      email: ' maria@empresa.com ',
      message: '  Quiero probar el CRM  ',
    })
    expect(result).toEqual({
      valid: true,
      values: { name: 'María Fernández', email: 'maria@empresa.com', message: 'Quiero probar el CRM' },
    })
  })

  it('rechaza cuando falta el nombre', () => {
    const result = validateContactMessage({ name: '  ', email: 'a@b.com', message: 'hola' })
    expect(result.valid).toBe(false)
  })

  it('rechaza cuando falta el email', () => {
    const result = validateContactMessage({ name: 'A', email: '', message: 'hola' })
    expect(result.valid).toBe(false)
  })

  it('rechaza un email con formato inválido', () => {
    const result = validateContactMessage({ name: 'A', email: 'no-es-un-email', message: 'hola' })
    expect(result.valid).toBe(false)
  })

  it('rechaza cuando falta el mensaje', () => {
    const result = validateContactMessage({ name: 'A', email: 'a@b.com', message: '   ' })
    expect(result.valid).toBe(false)
  })

  it('rechaza un nombre o mensaje demasiado largos', () => {
    const longName = 'a'.repeat(201)
    const longMessage = 'a'.repeat(5001)
    expect(validateContactMessage({ name: longName, email: 'a@b.com', message: 'hola' }).valid).toBe(false)
    expect(validateContactMessage({ name: 'A', email: 'a@b.com', message: longMessage }).valid).toBe(false)
  })

  it('maneja body no-objeto o con campos de tipo incorrecto sin tirar', () => {
    expect(validateContactMessage(null).valid).toBe(false)
    expect(validateContactMessage({ name: 123, email: true, message: [] }).valid).toBe(false)
  })
})

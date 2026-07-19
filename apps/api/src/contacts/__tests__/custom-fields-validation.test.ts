import { describe, it, expect } from 'vitest'
import { validateCustomFieldValue, validateCustomFieldsPatch } from '../custom-fields-validation'

const textDef   = { key: 'apodo', label: 'Apodo', fieldType: 'text' as const, options: null, required: false }
const numberDef = { key: 'empleados', label: 'Empleados', fieldType: 'number' as const, options: null, required: false }
const boolDef   = { key: 'activo', label: 'Activo', fieldType: 'boolean' as const, options: null, required: false }
const dateDef   = { key: 'vencimiento', label: 'Vencimiento', fieldType: 'date' as const, options: null, required: true }
const selectDef = { key: 'talle', label: 'Talle', fieldType: 'select' as const, options: ['S', 'M', 'L'], required: false }

describe('validateCustomFieldValue', () => {
  it('trata null, undefined y string vacío como null válido', () => {
    expect(validateCustomFieldValue(textDef, null)).toEqual({ valid: true, value: null })
    expect(validateCustomFieldValue(textDef, undefined)).toEqual({ valid: true, value: null })
    expect(validateCustomFieldValue(textDef, '')).toEqual({ valid: true, value: null })
  })

  it('acepta texto tal cual', () => {
    expect(validateCustomFieldValue(textDef, 'Pepe')).toEqual({ valid: true, value: 'Pepe' })
  })

  it('coerciona number y rechaza valores no numéricos', () => {
    expect(validateCustomFieldValue(numberDef, '10')).toEqual({ valid: true, value: 10 })
    expect(validateCustomFieldValue(numberDef, 10)).toEqual({ valid: true, value: 10 })
    const result = validateCustomFieldValue(numberDef, 'diez')
    expect(result.valid).toBe(false)
  })

  it('coerciona boolean', () => {
    expect(validateCustomFieldValue(boolDef, true)).toEqual({ valid: true, value: true })
    expect(validateCustomFieldValue(boolDef, 'true')).toEqual({ valid: true, value: true })
  })

  it('valida fechas y rechaza fechas inválidas', () => {
    const result = validateCustomFieldValue(dateDef, '2026-01-15')
    expect(result.valid).toBe(true)
    const invalid = validateCustomFieldValue(dateDef, 'no-es-fecha')
    expect(invalid.valid).toBe(false)
  })

  it('valida que el select esté entre las opciones', () => {
    expect(validateCustomFieldValue(selectDef, 'M')).toEqual({ valid: true, value: 'M' })
    const invalid = validateCustomFieldValue(selectDef, 'XL')
    expect(invalid.valid).toBe(false)
  })
})

describe('validateCustomFieldsPatch', () => {
  const definitions = [textDef, numberDef, selectDef]

  it('rechaza keys que no existen en las definiciones', () => {
    const result = validateCustomFieldsPatch(definitions, { fantasma: 'x' })
    expect(result.valid).toBe(false)
  })

  it('acepta un patch parcial válido', () => {
    const result = validateCustomFieldsPatch(definitions, { apodo: 'Pepe', empleados: '5' })
    expect(result).toEqual({ valid: true, values: { apodo: 'Pepe', empleados: 5 } })
  })

  it('exige los campos required solo cuando se pide explícitamente', () => {
    const withRequired = [dateDef]
    expect(validateCustomFieldsPatch(withRequired, {}).valid).toBe(true)
    expect(validateCustomFieldsPatch(withRequired, {}, { enforceRequired: true }).valid).toBe(false)
    expect(
      validateCustomFieldsPatch(withRequired, { vencimiento: '2026-01-01' }, { enforceRequired: true }).valid,
    ).toBe(true)
  })
})

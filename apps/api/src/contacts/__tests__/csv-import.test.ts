import { describe, it, expect } from 'vitest'
import { matchStatus, dedupeImportRows } from '../csv-import'

describe('matchStatus', () => {
  it('matchea las keys canónicas en minúsculas', () => {
    expect(matchStatus('lead')).toBe('lead')
    expect(matchStatus('CLIENT')).toBe('client')
  })

  it('matchea los labels en español, sin importar mayúsculas', () => {
    expect(matchStatus('Prospecto')).toBe('prospect')
    expect(matchStatus('inactivo')).toBe('inactive')
  })

  it('devuelve undefined si no reconoce el valor', () => {
    expect(matchStatus('foo')).toBeUndefined()
    expect(matchStatus('')).toBeUndefined()
    expect(matchStatus(undefined)).toBeUndefined()
  })
})

describe('dedupeImportRows', () => {
  it('conserva filas sin email tal cual, numerándolas desde 1', () => {
    const { rows, skipped } = dedupeImportRows([{ name: 'A' }, { name: 'B' }])
    expect(rows).toEqual([{ name: 'A', row: 1 }, { name: 'B', row: 2 }])
    expect(skipped).toEqual([])
  })

  it('descarta filas con email duplicado dentro del archivo, quedándose con la primera', () => {
    const { rows, skipped } = dedupeImportRows([
      { name: 'A', email: 'x@test.com' },
      { name: 'B', email: 'X@Test.com' },
      { name: 'C', email: 'y@test.com' },
    ])
    expect(rows).toEqual([
      { name: 'A', email: 'x@test.com', row: 1 },
      { name: 'C', email: 'y@test.com', row: 3 },
    ])
    expect(skipped).toEqual([{ row: 2, error: 'email duplicado dentro del archivo (se usó la fila 1)' }])
  })
})

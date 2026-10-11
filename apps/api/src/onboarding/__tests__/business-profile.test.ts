import { describe, it, expect } from 'vitest'
import { validateBusinessProfile } from '../business-profile'

const base = {
  name:     '  Ferretería Los Andes  ',
  industry: 'retail',
  country:  'UY',
  teamSize: '2-5',
  offering: '  Herramientas y materiales de construcción  ',
}

describe('validateBusinessProfile', () => {
  it('acepta los obligatorios, recorta espacios y deja los opcionales en null', () => {
    const result = validateBusinessProfile(base)
    expect(result).toEqual({
      valid: true,
      values: {
        name: 'Ferretería Los Andes',
        profile: {
          version: 1,
          industry: 'retail',
          industryOther: null,
          country: 'UY',
          teamSize: '2-5',
          offering: 'Herramientas y materiales de construcción',
          salesChannels: [],
          averageTicket: null,
          salesCycle: null,
          mainGoal: null,
        },
      },
    })
  })

  it('acepta los opcionales y deduplica canales', () => {
    const result = validateBusinessProfile({
      ...base,
      salesChannels: ['whatsapp', 'store', 'whatsapp'],
      averageTicket: 'USD 50',
      salesCycle: 'days',
      mainGoal: 'follow_up',
    })
    expect(result.valid).toBe(true)
    if (!result.valid) return
    expect(result.values.profile.salesChannels).toEqual(['whatsapp', 'store'])
    expect(result.values.profile.averageTicket).toBe('USD 50')
    expect(result.values.profile.salesCycle).toBe('days')
    expect(result.values.profile.mainGoal).toBe('follow_up')
  })

  it('exige detallar el rubro cuando es "otro" y lo descarta si no', () => {
    expect(validateBusinessProfile({ ...base, industry: 'other' }).valid).toBe(false)

    const other = validateBusinessProfile({ ...base, industry: 'other', industryOther: 'Vivero' })
    expect(other.valid && other.values.profile.industryOther).toBe('Vivero')

    const notOther = validateBusinessProfile({ ...base, industryOther: 'Vivero' })
    expect(notOther.valid && notOther.values.profile.industryOther).toBeNull()
  })

  it('rechaza campos obligatorios vacíos o fuera de las listas', () => {
    expect(validateBusinessProfile({ ...base, name: ' ' }).valid).toBe(false)
    expect(validateBusinessProfile({ ...base, industry: 'mineria' }).valid).toBe(false)
    expect(validateBusinessProfile({ ...base, country: 'XX' }).valid).toBe(false)
    expect(validateBusinessProfile({ ...base, teamSize: '1000' }).valid).toBe(false)
    expect(validateBusinessProfile({ ...base, offering: 'corto' }).valid).toBe(false)
  })

  it('rechaza opcionales con valores inválidos', () => {
    expect(validateBusinessProfile({ ...base, salesChannels: ['fax'] }).valid).toBe(false)
    expect(validateBusinessProfile({ ...base, salesCycle: 'years' }).valid).toBe(false)
    expect(validateBusinessProfile({ ...base, mainGoal: 'world_domination' }).valid).toBe(false)
  })

  it('no confunde propiedades heredadas con valores válidos', () => {
    expect(validateBusinessProfile({ ...base, industry: 'toString' }).valid).toBe(false)
  })

  it('rechaza un body vacío', () => {
    expect(validateBusinessProfile(null).valid).toBe(false)
  })
})

import type {
  BusinessProfile,
  BusinessIndustry,
  BusinessCountry,
  BusinessTeamSize,
  BusinessSalesChannel,
  BusinessSalesCycle,
  BusinessGoal,
  Locale,
} from '@crm/shared'

// Valores aceptados. `Record<Union, true>` hace que TypeScript falle si se
// agrega un valor al tipo de @crm/shared y no acá (o al revés).
const INDUSTRIES: Record<BusinessIndustry, true> = {
  retail: true, services: true, automotive: true, real_estate: true, health: true, education: true,
  food: true, construction: true, manufacturing: true, technology: true, wholesale: true, other: true,
}
const COUNTRIES: Record<BusinessCountry, true> = {
  UY: true, AR: true, CL: true, BR: true, PY: true, MX: true, CO: true, PE: true, ES: true, other: true,
}
const TEAM_SIZES: Record<BusinessTeamSize, true> = {
  'solo': true, '2-5': true, '6-20': true, '21-50': true, '50+': true,
}
const SALES_CHANNELS: Record<BusinessSalesChannel, true> = {
  whatsapp: true, instagram: true, facebook: true, store: true, web: true,
  phone: true, email: true, field: true, marketplace: true,
}
const SALES_CYCLES: Record<BusinessSalesCycle, true> = {
  immediate: true, days: true, weeks: true, months: true,
}
const GOALS: Record<BusinessGoal, true> = {
  organize_contacts: true, follow_up: true, sell_more: true, team: true, metrics: true,
}

const NAME_MIN     = 2
const NAME_MAX     = 120
const OFFERING_MIN = 10
const OFFERING_MAX = 500
const SHORT_MAX    = 80

export type BusinessProfileInput = { name: string; profile: BusinessProfile }

type ValidationResult =
  | { valid: true; values: BusinessProfileInput }
  | { valid: false; error: string }

function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function isOneOf<T extends string>(map: Record<T, true>, value: string): value is T {
  return Object.prototype.hasOwnProperty.call(map, value)
}

/**
 * Valida el formulario "Datos del negocio" (segundo paso del registro y
 * Configuración → Negocio). Mismo nivel de chequeo liviano que el resto de
 * la API: required + trim + listas cerradas. Los opcionales vacíos quedan
 * en null para que el perfil guardado tenga siempre la misma forma.
 */
export function validateBusinessProfile(body: unknown): ValidationResult {
  const b = (body ?? {}) as Record<string, unknown>

  const name          = str(b.name)
  const industry      = str(b.industry)
  const industryOther = str(b.industryOther)
  const country       = str(b.country)
  const teamSize      = str(b.teamSize)
  const offering      = str(b.offering)
  const averageTicket = str(b.averageTicket)
  const salesCycle    = str(b.salesCycle)
  const mainGoal      = str(b.mainGoal)
  const rawChannels   = Array.isArray(b.salesChannels) ? b.salesChannels : []

  if (name.length < NAME_MIN) {
    return { valid: false, error: 'El nombre del negocio es requerido' }
  }
  if (name.length > NAME_MAX) {
    return { valid: false, error: `El nombre del negocio no puede superar los ${NAME_MAX} caracteres` }
  }
  if (!isOneOf(INDUSTRIES, industry)) {
    return { valid: false, error: 'Elegí el rubro de tu negocio' }
  }
  if (industry === 'other' && !industryOther) {
    return { valid: false, error: 'Contanos a qué rubro se dedica tu negocio' }
  }
  if (industryOther.length > SHORT_MAX) {
    return { valid: false, error: `El rubro no puede superar los ${SHORT_MAX} caracteres` }
  }
  if (!isOneOf(COUNTRIES, country)) {
    return { valid: false, error: 'Elegí el país de tu negocio' }
  }
  if (!isOneOf(TEAM_SIZES, teamSize)) {
    return { valid: false, error: 'Elegí el tamaño de tu equipo' }
  }
  if (offering.length < OFFERING_MIN) {
    return { valid: false, error: 'Contanos en una frase qué vendés (al menos 10 caracteres)' }
  }
  if (offering.length > OFFERING_MAX) {
    return { valid: false, error: `La descripción no puede superar los ${OFFERING_MAX} caracteres` }
  }

  const salesChannels: BusinessSalesChannel[] = []
  for (const channel of rawChannels) {
    const value = str(channel)
    if (!isOneOf(SALES_CHANNELS, value)) {
      return { valid: false, error: 'Canal de venta inválido' }
    }
    if (!salesChannels.includes(value)) salesChannels.push(value)
  }

  if (averageTicket.length > SHORT_MAX) {
    return { valid: false, error: `El ticket promedio no puede superar los ${SHORT_MAX} caracteres` }
  }
  if (salesCycle && !isOneOf(SALES_CYCLES, salesCycle)) {
    return { valid: false, error: 'Ciclo de venta inválido' }
  }
  if (mainGoal && !isOneOf(GOALS, mainGoal)) {
    return { valid: false, error: 'Objetivo inválido' }
  }

  return {
    valid: true,
    values: {
      name,
      profile: {
        version:       1,
        industry,
        industryOther: industry === 'other' ? industryOther : null,
        country,
        teamSize,
        offering,
        salesChannels,
        averageTicket: averageTicket || null,
        salesCycle:    salesCycle ? (salesCycle as BusinessSalesCycle) : null,
        mainGoal:      mainGoal ? (mainGoal as BusinessGoal) : null,
      },
    },
  }
}

/** Locale de la organización según el país del negocio (default: es-UY). */
export function localeForCountry(country: BusinessCountry): Locale {
  switch (country) {
    case 'AR': return 'es-AR'
    case 'CL': return 'es-CL'
    case 'BR': return 'pt-BR'
    default:   return 'es-UY'
  }
}

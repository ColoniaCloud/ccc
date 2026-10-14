export type Plan = 'free' | 'pro' | 'business' | 'master' | 'enterprise'

export type TenantStatus = 'active' | 'suspended'

export type BillingProvider = 'mercadopago' | 'nowpayments'

export type SubscriptionStatus = 'pending' | 'active' | 'paused' | 'cancelled'

export type UserRole = 'owner' | 'admin' | 'manager' | 'seller' | 'support'

export type InvitableRole = Exclude<UserRole, 'owner'>

export interface OrganizationSummary {
  id: string
  name: string
  slug: string
  plan: Plan
  status: TenantStatus
  role: UserRole
}

export type Locale = 'es-UY' | 'es-AR' | 'es-CL' | 'pt-BR'

export interface ApiResponse<T = unknown> {
  data?: T
  error?: string
  status: 'ok' | 'error'
}

export interface PaginatedResponse<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}

export type ContactStatus = 'lead' | 'prospect' | 'client' | 'inactive'

export type DealCurrency = 'USD' | 'UYU' | 'ARS' | 'CLP' | 'BRL'

export type ModuleKey = 'stock' | 'service_periods' | 'properties' | 'vehicles'

export type CatalogKind = 'properties' | 'vehicles'
export type CatalogStatus = 'available' | 'reserved' | 'sold' | 'rented' | 'archived'
export type PresetKey = 'real_estate_sale' | 'real_estate_rent' | 'automotive_sales'
export type AppointmentKind = 'property_visit' | 'test_drive'
export type AppointmentStatus = 'scheduled' | 'completed' | 'cancelled'

export type SetupStatus = 'in_progress' | 'ready' | 'completed' | 'deferred'
export type SetupMessage = { role: 'user' | 'assistant'; text: string }
export type SetupProposal = {
  summary: string
  presets: PresetKey[]
  recommendations: string[]
  connections: { tool: string; purpose: string }[]
}
export type SetupTurn = { reply: string; proposal: SetupProposal | null }
export type SetupSnapshot = {
  name: string
  profile: BusinessProfile | null
  required: boolean
  supported: boolean
  configured: boolean
  session: { status: SetupStatus; revision: number; messages: SetupMessage[]; proposal: SetupProposal | null; busy: boolean } | null
}

export interface PresetPreview {
  key: PresetKey
  version: number
  label: string
  module: CatalogKind
  pipelineName: string
  stages: string[]
  fieldsToCreate: string[]
  fieldsToReuse: string[]
  conflicts: string[]
  alreadyApplied: boolean
  fingerprint: string
}

export type CustomFieldType = 'text' | 'number' | 'date' | 'boolean' | 'select'

export type CustomFieldEntityType = 'contact'

// ── Perfil del negocio ─────────────────────────────────────────────
// Lo completa el admin en el segundo paso del registro (onboarding) y se
// puede editar desde Configuración. Se guarda versionado en
// tenants.business_profile para que más adelante la IA lo use como memoria
// base del negocio: si cambia la forma, se sube la versión.
//
// Solo tipos: la API importa este paquete con `import type` (en runtime no
// puede cargar el .ts). Las etiquetas viven en la web y la validación en la
// API, ambas tipadas contra estas uniones.

export type BusinessIndustry =
  | 'retail' | 'services' | 'automotive' | 'real_estate' | 'health' | 'education'
  | 'food' | 'construction' | 'manufacturing' | 'technology' | 'wholesale' | 'other'

export type BusinessCountry = 'UY' | 'AR' | 'CL' | 'BR' | 'PY' | 'MX' | 'CO' | 'PE' | 'ES' | 'other'

export type BusinessTeamSize = 'solo' | '2-5' | '6-20' | '21-50' | '50+'

export type BusinessSalesChannel =
  | 'whatsapp' | 'instagram' | 'facebook' | 'store' | 'web' | 'phone' | 'email' | 'field' | 'marketplace'

export type BusinessSalesCycle = 'immediate' | 'days' | 'weeks' | 'months'

export type BusinessGoal = 'organize_contacts' | 'follow_up' | 'sell_more' | 'team' | 'metrics'

export interface BusinessProfile {
  version:       1
  industry:      BusinessIndustry
  industryOther: string | null
  country:       BusinessCountry
  teamSize:      BusinessTeamSize
  offering:      string
  salesChannels: BusinessSalesChannel[]
  averageTicket: string | null
  salesCycle:    BusinessSalesCycle | null
  mainGoal:      BusinessGoal | null
}
export { commercialSummary, pipelineSummary } from './dashboard'

export type Plan = 'free' | 'pro' | 'business' | 'enterprise'

export type UserRole = 'admin' | 'manager' | 'seller' | 'support'

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

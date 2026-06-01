import type { auth } from './lib/auth'
import type { tenants, members } from './db/schema'

export type AuthUser    = typeof auth.$Infer.Session.user
export type AuthSession = typeof auth.$Infer.Session.session
export type Tenant      = typeof tenants.$inferSelect
export type Member      = typeof members.$inferSelect

export type HonoVariables = {
  user:     AuthUser
  session:  AuthSession
  tenantId: string
  memberId: string
}

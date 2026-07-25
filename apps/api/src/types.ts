import type { auth } from './lib/auth'
import type { tenants, members } from './db/schema'
import type { TenantTx } from './db/tenant-db'

export type AuthUser    = typeof auth.$Infer.Session.user
export type AuthSession = typeof auth.$Infer.Session.session
export type Tenant      = typeof tenants.$inferSelect
export type Member      = typeof members.$inferSelect

export type HonoVariables = {
  user:     AuthUser
  session:  AuthSession
  tenantId: string
  memberId: string
  // Db acotada al tenant actual: transacción con `app.tenant_id` seteado,
  // sujeta a las políticas RLS de la migración 0007. La setea tenantMiddleware.
  db:       TenantTx
}

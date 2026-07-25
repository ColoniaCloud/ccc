import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

if (!process.env.DATABASE_URL_APP) {
  throw new Error('DATABASE_URL_APP no está definida. Verificá apps/api/.env')
}

const client = postgres(process.env.DATABASE_URL_APP)

// Rol "plata_app": sin BYPASSRLS, a diferencia del rol usado por `db`
// (../db/index.ts), que corre migraciones como owner y sí bypassea RLS.
// Cada request autenticado abre una transacción sobre este cliente y setea
// app.tenant_id (ver middleware/tenant.ts) para que las políticas de
// Row-Level Security (migración 0007) se apliquen de verdad.
export const tenantDb = drizzle(client, { schema })

export type TenantTx = Parameters<Parameters<typeof tenantDb.transaction>[0]>[0]

import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { sql } from 'drizzle-orm'
import * as schema from './schema'

if (!process.env.DATABASE_URL_APP) {
  throw new Error('DATABASE_URL_APP no está definida. Verificá apps/api/.env')
}

// Cada request con tenant retiene una conexión de este pool mientras dura
// (es una transacción abierta, no una query suelta), así que el default de
// postgres.js — 10 — pasa a significar "10 requests concurrentes". Se sube
// y queda configurable por env para ajustarlo al límite del plan de Neon
// sin tocar código.
const POOL_MAX = Number(process.env.DATABASE_POOL_MAX) || 20

const client = postgres(process.env.DATABASE_URL_APP, { max: POOL_MAX })

// Rol "plata_app": sin BYPASSRLS, a diferencia del rol usado por `db`
// (../db/index.ts), que corre migraciones como owner y sí bypassea RLS.
// Cada request autenticado abre una transacción sobre este cliente y setea
// app.tenant_id (ver middleware/tenant.ts) para que las políticas de
// Row-Level Security (migración 0007) se apliquen de verdad.
export const tenantDb = drizzle(client, { schema })

export type TenantTx = Parameters<Parameters<typeof tenantDb.transaction>[0]>[0]

// Mismo contexto que abre tenantMiddleware, para código que necesita
// consultar como un tenant fuera del ciclo de un request suyo — hoy el
// panel de administración, que recorre varios tenants en una misma
// llamada. set_config y no "SET LOCAL" porque acepta el id como parámetro
// bindeado en vez de interpolado en el SQL.
export async function withTenant<T>(tenantId: string, fn: (tx: TenantTx) => Promise<T>): Promise<T> {
  return tenantDb.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.tenant_id', ${tenantId}, true)`)
    return fn(tx)
  })
}

/**
 * Runner de migraciones para el deploy. En local se usa `pnpm db:migrate`
 * (drizzle-kit), pero drizzle-kit es una devDependency y no existe en la
 * imagen de producción — este script usa el migrador de drizzle-orm, que
 * sí viaja con las deps de runtime, contra la carpeta de migraciones que
 * el Dockerfile copia a dist/db/migrations.
 *
 * Corre como un proceso aparte (`node dist/db/migrate.js`), no al arrancar
 * la API: si dos réplicas levantaran a la vez competirían por el lock de
 * migraciones, y un fallo debe abortar el deploy antes de swapear los
 * contenedores, no dejar la API arriba a medio migrar.
 */
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import path from 'node:path'

const migrationsFolder = process.env.MIGRATIONS_FOLDER ?? path.join(__dirname, 'migrations')

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL no está configurada')
  }

  // max: 1 — una sola conexión, el migrador es secuencial por definición.
  const client = postgres(process.env.DATABASE_URL, { max: 1 })

  try {
    console.log(`Aplicando migraciones desde ${migrationsFolder}…`)
    await migrate(drizzle(client), { migrationsFolder })
    console.log('Migraciones al día.')
  } finally {
    await client.end()
  }
}

main().catch((err: unknown) => {
  console.error('Falló la migración:', err)
  process.exit(1)
})

import { db } from './index'
import { tenants, members } from './schema'
import { user } from './schema/auth'
import { eq } from 'drizzle-orm'

async function seed() {
  console.log('Seeding...')

  const [tenant] = await db
    .insert(tenants)
    .values({
      name:   'Empresa Demo',
      slug:   'demo',
      plan:   'pro',
      locale: 'es-UY',
    })
    .onConflictDoNothing()
    .returning()

  console.log('Tenant creado:', tenant?.slug ?? 'ya existía')

  const testUser = await db.query.user.findFirst({
    where: eq(user.email, 'test@test.com'),
  })

  if (!testUser) {
    console.log('Usuario test@test.com no encontrado. Corré la verificación de Parte B primero.')
    process.exit(1)
  }

  if (!tenant) {
    const existingTenant = await db.query.tenants.findFirst({
      where: eq(tenants.slug, 'demo'),
    })
    if (!existingTenant) {
      console.error('No se pudo encontrar ni crear el tenant demo')
      process.exit(1)
    }
    await db
      .insert(members)
      .values({ userId: testUser.id, tenantId: existingTenant.id, role: 'admin' })
      .onConflictDoNothing()
    console.log('Member creado para tenant existente')
    process.exit(0)
  }

  await db
    .insert(members)
    .values({ userId: testUser.id, tenantId: tenant.id, role: 'admin' })
    .onConflictDoNothing()

  console.log('Seed completo.')
  process.exit(0)
}

seed().catch((err) => {
  console.error('Error en seed:', err)
  process.exit(1)
})

import { beforeAll, beforeEach, afterAll, describe, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { eq } from 'drizzle-orm'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import * as schema from '../../db/schema'
import type { db as productionDb } from '../../db'
import { OrganizationService } from '../service'
import { invitationTokenHash, validateInvitation } from '../policy'
import { planAccountDeletion } from '../../account/deletion-service'

const A = '11111111-1111-1111-1111-111111111111'
const B = '22222222-2222-2222-2222-222222222222'
const ownerMember = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1'
const adminMember = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2'
const sellerMember = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3'
const otherMember = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1'
const recipient = { id: 'recipient', email: 'guest@example.com', emailVerified: true }
let client: PGlite
let database: ReturnType<typeof drizzle<typeof schema>>
let service: OrganizationService
let migratedRoles: { role: string }[]

async function fixtures(legacy = false) {
  await client.exec(`BEGIN;
    INSERT INTO "user" (id,name,email,email_verified,created_at,updated_at) VALUES
      ('owner-a','Ana','ana@example.com',true,now(),now()),
      ('owner-b','Bruno','bruno@example.com',true,now(),now()),
      ('admin-a','Admin','admin@example.com',true,now(),now()),
      ('seller-a','Vendedor','seller@example.com',true,now(),now()),
      ('recipient','Invitado','guest@example.com',true,now(),now());
    INSERT INTO tenants (id,name,slug) VALUES ('${A}','Negocio A','negocio-a'),('${B}','Negocio B','negocio-b');
    INSERT INTO members (id,user_id,tenant_id,role,created_at) VALUES
      ('${ownerMember}','owner-a','${A}','${legacy ? 'admin' : 'owner'}','2020-01-01'),
      ('${adminMember}','admin-a','${A}','admin','2021-01-01'),
      ('${sellerMember}','seller-a','${A}','seller','2022-01-01'),
      ('${otherMember}','owner-b','${B}','${legacy ? 'admin' : 'owner'}','2020-01-01');
    COMMIT;`)
}

beforeAll(async () => {
  // PostgreSQL real en WASM, sin conexiones ni credenciales de producción.
  client = new PGlite()
  database = drizzle(client, { schema })
  service = new OrganizationService(database as unknown as typeof productionDb)
  const folder = path.resolve('src/db/migrations')
  const journal = JSON.parse(readFileSync(path.join(folder, 'meta/_journal.json'), 'utf8')) as { entries: { tag: string }[] }
  for (const entry of journal.entries) {
    if (entry.tag.startsWith('0010_')) await fixtures(true)
    await client.exec(readFileSync(path.join(folder, `${entry.tag}.sql`), 'utf8'))
  }
  migratedRoles = (await client.query<{ role: string }>('SELECT role FROM members ORDER BY created_at, id')).rows
}, 30000)

beforeEach(async () => {
  await client.exec('TRUNCATE tenants, "user" CASCADE;')
  await fixtures()
})
afterAll(async () => { await client.close() })

describe('organizaciones, migración y permisos', () => {
  it('eliminar cuenta evalúa todas las organizaciones, incluyendo una distinta a la activa', async () => {
    await database.insert(schema.members).values({ userId: 'owner-b', tenantId: A, role: 'seller' })
    const plan = await planAccountDeletion('owner-b', database as unknown as typeof productionDb)
    expect(plan.allowed).toBe(true)
    expect(plan.tenantIds).toEqual([B])
    expect(plan.organizationNames).toEqual(['Negocio B'])
    await database.insert(schema.billingSubscriptions).values({ tenantId: B, provider: 'mercadopago',
      plan: 'pro', externalId: 'paid-test', status: 'active' })
    expect((await planAccountDeletion('owner-b', database as unknown as typeof productionDb)).allowed).toBe(false)
  })

  it('bloquea borrar la cuenta de un propietario con equipo aunque también tenga otra organización', async () => {
    await database.insert(schema.members).values({ userId: 'owner-a', tenantId: B, role: 'seller' })
    const plan = await planAccountDeletion('owner-a', database as unknown as typeof productionDb)
    expect(plan.allowed).toBe(false)
    expect(plan.tenantIds).toEqual([])
  })

  it('la vista previa incluye todas las organizaciones que quedarían vacías', async () => {
    await database.transaction(async (tx) => {
      await tx.delete(schema.members).where(eq(schema.members.id, otherMember))
      await tx.insert(schema.members).values({ userId: 'recipient', tenantId: B, role: 'owner' })
      const [another] = await tx.insert(schema.tenants).values({ name: 'Otro negocio', slug: 'otro' }).returning()
      await tx.insert(schema.members).values({ userId: 'recipient', tenantId: another!.id, role: 'owner' })
    })
    const plan = await planAccountDeletion('recipient', database as unknown as typeof productionDb)
    expect(plan.allowed).toBe(true)
    expect(plan.tenantIds).toHaveLength(2)
    expect(plan.organizationNames.sort()).toEqual(['Negocio B', 'Otro negocio'])
  })
  it('migra los admins existentes a un propietario por organización sin perder miembros', () => {
    expect(migratedRoles).toHaveLength(4)
    expect(migratedRoles.filter((item) => item.role === 'owner')).toHaveLength(2)
    expect(migratedRoles.filter((item) => item.role === 'admin')).toHaveLength(1)
  })

  it('lista solo las organizaciones del usuario y admite varias con la misma cuenta', async () => {
    await database.insert(schema.members).values({ userId: 'owner-a', tenantId: B, role: 'seller' })
    expect((await service.list('owner-a')).map((item) => item.slug)).toEqual(['negocio-a', 'negocio-b'])
    expect((await service.list('seller-a')).map((item) => item.slug)).toEqual(['negocio-a'])
    expect(await service.list('recipient')).toEqual([])
  })

  it('impide leer o cambiar equipos ajenos aun con IDs válidos', async () => {
    await expect(service.team('owner-a', 'negocio-b')).rejects.toMatchObject({ status: 403 })
    await expect(service.changeRole('owner-a', 'negocio-a', otherMember, 'seller')).rejects.toMatchObject({ status: 404 })
    await expect(service.remove('owner-a', 'negocio-a', otherMember)).rejects.toMatchObject({ status: 404 })
    await expect(service.transfer('owner-a', 'negocio-a', otherMember)).rejects.toMatchObject({ status: 400 })
  })

  it('el vendedor consulta el equipo pero no las invitaciones ni administra roles', async () => {
    await service.invite('owner-a', 'negocio-a', recipient.email, 'seller')
    expect((await service.team('seller-a', 'negocio-a')).invitations).toEqual([])
    await expect(service.invite('seller-a', 'negocio-a', recipient.email, 'seller')).rejects.toMatchObject({ status: 403 })
    await expect(service.changeRole('seller-a', 'negocio-a', adminMember, 'seller')).rejects.toMatchObject({ status: 403 })
    await expect(service.remove('seller-a', 'negocio-a', adminMember)).rejects.toMatchObject({ status: 403 })
  })

  it('un administrador no escala privilegios ni modifica a otros administradores', async () => {
    await expect(service.invite('admin-a', 'negocio-a', recipient.email, 'admin')).rejects.toMatchObject({ status: 403 })
    await expect(service.changeRole('admin-a', 'negocio-a', sellerMember, 'admin')).rejects.toMatchObject({ status: 403 })
    await expect(service.changeRole('admin-a', 'negocio-a', ownerMember, 'seller')).rejects.toMatchObject({ status: 403 })
    const invite = await service.invite('owner-a', 'negocio-a', recipient.email, 'admin')
    await expect(service.revoke('admin-a', 'negocio-a', invite.id)).rejects.toMatchObject({ status: 403 })
    await expect(service.invite('admin-a', 'negocio-a', recipient.email, 'seller')).rejects.toMatchObject({ status: 403 })
    await service.changeRole('admin-a', 'negocio-a', sellerMember, 'manager')
  })

  it('permite salir a un colaborador sin borrar su cuenta ni su organización', async () => {
    await service.remove('seller-a', 'negocio-a', sellerMember)
    expect(await service.list('seller-a')).toEqual([])
    expect(await database.query.user.findFirst({ where: eq(schema.user.id, 'seller-a') })).toBeDefined()
    expect(await database.query.tenants.findFirst({ where: eq(schema.tenants.id, A) })).toBeDefined()
  })

  it('exige transferencia explícita y la realiza atómicamente', async () => {
    await expect(service.remove('owner-a', 'negocio-a', ownerMember)).rejects.toMatchObject({ status: 409 })
    await expect(service.transfer('admin-a', 'negocio-a', sellerMember)).rejects.toMatchObject({ status: 403 })
    await service.transfer('owner-a', 'negocio-a', sellerMember)
    const team = await service.team('owner-a', 'negocio-a')
    expect(team.items.find((item) => item.id === ownerMember)?.role).toBe('admin')
    expect(team.items.find((item) => item.id === sellerMember)?.role).toBe('owner')
    expect(team.items.filter((item) => item.role === 'owner')).toHaveLength(1)
    await expect(service.transfer('owner-a', 'negocio-a', adminMember)).rejects.toMatchObject({ status: 403 })
  })

  it('la base impide dos propietarios y borrar uno que dejaría al equipo sin responsable', async () => {
    await expect(database.update(schema.members).set({ role: 'owner' }).where(eq(schema.members.id, sellerMember))).rejects.toBeDefined()
    await expect(database.delete(schema.user).where(eq(schema.user.id, 'owner-a'))).rejects.toBeDefined()
    expect(await database.query.user.findFirst({ where: eq(schema.user.id, 'owner-a') })).toBeDefined()
  })

  it('bloquea operaciones y aceptación en organizaciones suspendidas', async () => {
    const invite = await service.invite('owner-a', 'negocio-a', recipient.email, 'seller')
    await database.update(schema.tenants).set({ status: 'suspended' }).where(eq(schema.tenants.id, A))
    await expect(service.team('owner-a', 'negocio-a')).rejects.toMatchObject({ status: 403 })
    await expect(service.invitation(recipient, invite.token, true)).rejects.toMatchObject({ status: 403 })
  })
})

describe('invitaciones', () => {
  it('recupera invitaciones por email verificado al abrir otra pestaña, sin exponer tokens', async () => {
    const invite = await service.invite('owner-a', 'negocio-a', recipient.email, 'seller')
    const pending = await service.pendingFor(recipient)
    expect(pending.map((item) => item.id)).toEqual([invite.id])
    expect(JSON.stringify(pending)).not.toContain(invite.token)
    expect(await service.pendingFor({ ...recipient, email: 'other@example.com' })).toEqual([])
    await expect(service.pendingFor({ ...recipient, emailVerified: false })).rejects.toMatchObject({ status: 403 })
    await expect(service.acceptPending({ ...recipient, email: 'other@example.com' }, invite.id)).rejects.toMatchObject({ status: 403 })
    await service.acceptPending(recipient, invite.id)
    expect(await service.pendingFor(recipient)).toEqual([])
    expect(await service.list(recipient.id)).toHaveLength(1)
  })

  it('no recupera invitaciones vencidas, canceladas o de organizaciones suspendidas', async () => {
    const invite = await service.invite('owner-a', 'negocio-a', recipient.email, 'seller')
    await database.update(schema.organizationInvitations).set({ expiresAt: new Date('2000-01-01') }).where(eq(schema.organizationInvitations.id, invite.id))
    expect(await service.pendingFor(recipient)).toEqual([])
    const next = await service.invite('owner-a', 'negocio-a', recipient.email, 'seller')
    await service.revoke('owner-a', 'negocio-a', next.id)
    expect(await service.pendingFor(recipient)).toEqual([])
    await service.invite('owner-b', 'negocio-b', recipient.email, 'seller')
    await database.update(schema.tenants).set({ status: 'suspended' }).where(eq(schema.tenants.id, B))
    expect(await service.pendingFor(recipient)).toEqual([])
  })
  it('normaliza emails y rechaza roles o tokens inválidos', () => {
    expect(validateInvitation({ email: ' Guest@Example.COM ', role: 'seller' })).toEqual({ email: 'guest@example.com', role: 'seller' })
    expect(validateInvitation({ email: 'x', role: 'seller' })).toBeNull()
    expect(validateInvitation({ email: recipient.email, role: 'owner' })).toBeNull()
    expect(validateInvitation({ email: 42, role: 'seller' })).toBeNull()
    expect(invitationTokenHash('bad')).toBeNull()
  })

  it('guarda solo el hash y exige identidad verificada del destinatario', async () => {
    const invite = await service.invite('owner-a', 'negocio-a', recipient.email, 'seller')
    const row = await database.query.organizationInvitations.findFirst()
    expect(row?.tokenHash).toBe(invitationTokenHash(invite.token))
    expect(JSON.stringify(row)).not.toContain(invite.token)
    await expect(service.invitation({ ...recipient, email: 'someone@example.com' }, invite.token, true)).rejects.toMatchObject({ status: 403 })
    await expect(service.invitation({ ...recipient, emailVerified: false }, invite.token, true)).rejects.toMatchObject({ status: 403 })
    expect((await service.invitation(recipient, invite.token, false)).accepted).toBe(false)
    expect(await service.list(recipient.id)).toEqual([])
  })

  it('acepta sin duplicar membresías y no restaura privilegios al reutilizar un link', async () => {
    const invite = await service.invite('owner-a', 'negocio-a', recipient.email, 'manager')
    await service.invitation(recipient, invite.token, true)
    await service.invitation(recipient, invite.token, true)
    const member = (await service.team('owner-a', 'negocio-a')).items.find((item) => item.userId === recipient.id)!
    await service.changeRole('owner-a', 'negocio-a', member.id, 'support')
    expect((await service.invitation(recipient, invite.token, true)).role).toBe('support')
    expect(await service.list(recipient.id)).toHaveLength(1)
    await service.remove('owner-a', 'negocio-a', member.id)
    await expect(service.invitation(recipient, invite.token, true)).rejects.toMatchObject({ status: 409 })
  })

  it('acepta aunque el usuario ya trabaje en otra organización', async () => {
    const invite = await service.invite('owner-a', 'negocio-a', 'bruno@example.com', 'seller')
    await service.invitation({ id: 'owner-b', email: 'bruno@example.com', emailVerified: true }, invite.token, true)
    expect(await service.list('owner-b')).toHaveLength(2)
  })

  it('rechaza invitaciones vencidas y canceladas; reinvitar invalida el link previo', async () => {
    const old = await service.invite('owner-a', 'negocio-a', recipient.email, 'seller')
    await database.update(schema.organizationInvitations).set({ expiresAt: new Date('2000-01-01') })
      .where(eq(schema.organizationInvitations.id, old.id))
    await expect(service.invitation(recipient, old.token, true)).rejects.toMatchObject({ status: 403 })
    const replacement = await service.invite('owner-a', 'negocio-a', recipient.email, 'manager')
    await expect(service.invitation(recipient, old.token, true)).rejects.toMatchObject({ status: 403 })
    await service.revoke('owner-a', 'negocio-a', replacement.id)
    await expect(service.invitation(recipient, replacement.token, true)).rejects.toMatchObject({ status: 403 })
  })

  it('no invita a un miembro existente ni cancela invitaciones ya aceptadas', async () => {
    await expect(service.invite('owner-a', 'negocio-a', 'seller@example.com', 'manager')).rejects.toMatchObject({ status: 409 })
    const invite = await service.invite('owner-a', 'negocio-a', recipient.email, 'seller')
    await service.invitation(recipient, invite.token, true)
    await expect(service.revoke('owner-a', 'negocio-a', invite.id)).rejects.toMatchObject({ status: 409 })
  })

  it('RLS impide consultar invitaciones de otra organización con el rol de aplicación', async () => {
    await service.invite('owner-a', 'negocio-a', recipient.email, 'seller')
    await service.invite('owner-b', 'negocio-b', recipient.email, 'seller')
    await client.exec("CREATE ROLE invitation_test_role; GRANT SELECT ON organization_invitations TO invitation_test_role;")
    try {
      await client.exec(`BEGIN; SET LOCAL ROLE invitation_test_role; SELECT set_config('app.tenant_id','${A}',true);`)
      const rows = (await client.query<{ tenant_id: string }>('SELECT tenant_id FROM organization_invitations')).rows
      expect(rows).toEqual([{ tenant_id: A }])
      await client.exec('ROLLBACK;')
    } finally { await client.exec('RESET ROLE; DROP OWNED BY invitation_test_role; DROP ROLE invitation_test_role;') }
  })
})

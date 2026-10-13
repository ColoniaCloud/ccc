import { beforeAll, beforeEach, afterAll, describe, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { eq, sql } from 'drizzle-orm'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import * as schema from '../../db/schema'
import type { TenantTx } from '../../db/tenant-db'
import { previewPreset, applyPreset } from '../../presets/service'
import { getPreset } from '../../presets/catalog'
import { validateCatalog } from '../validation'
import { saveCatalog, listCatalog, relatedCatalog, scheduleAppointment, changeAppointment, validateDealCatalog } from '../service'

const A = '11111111-1111-1111-1111-111111111111', B = '22222222-2222-2222-2222-222222222222'
const OWNER = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', SELLER = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', OTHER = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1'
const CONTACT = 'cccccccc-cccc-cccc-cccc-ccccccccccc1', OTHER_CONTACT = 'cccccccc-cccc-cccc-cccc-ccccccccccc2'
const property = { title: 'Casa en Colonia', operation: 'sale', propertyType: 'house', address: 'Calle 123', city: 'Colonia', price: '125000.50', sourceContactId: CONTACT, assignedTo: OWNER }
const vehicle = { title: 'Toyota Corolla', make: 'Toyota', model: 'Corolla', year: 2022, mileage: 35000, stockType: 'consignment', sourceContactId: CONTACT }
const future = () => new Date(Date.now() + 86400000).toISOString()
let client: PGlite, database: ReturnType<typeof drizzle<typeof schema>>, preserved: number

async function fixtures() {
  await client.exec(`BEGIN;
    INSERT INTO "user" (id,name,email,email_verified,created_at,updated_at) VALUES
      ('owner-a','Ana','ana@example.com',true,now(),now()),('seller-a','Luis','luis@example.com',true,now(),now()),('owner-b','Bruno','bruno@example.com',true,now(),now());
    INSERT INTO tenants (id,name,slug) VALUES ('${A}','Negocio A','negocio-a'),('${B}','Negocio B','negocio-b');
    INSERT INTO members (id,user_id,tenant_id,role) VALUES ('${OWNER}','owner-a','${A}','owner'),('${SELLER}','seller-a','${A}','seller'),('${OTHER}','owner-b','${B}','owner');
    INSERT INTO contacts (id,tenant_id,name) VALUES ('${CONTACT}','${A}','Cliente A'),('${OTHER_CONTACT}','${B}','Cliente B');
    COMMIT;`)
}
async function scoped<T>(tenantId: string, run: (tx: TenantTx) => Promise<T>): Promise<T> {
  return database.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL ROLE plata_app`)
    await tx.execute(sql`SELECT set_config('app.tenant_id', ${tenantId}, true)`)
    return run(tx as unknown as TenantTx)
  })
}
async function apply(key = 'real_estate_sale', tenantId = A, memberId = OWNER) {
  const preview = await scoped(tenantId, (tx) => previewPreset(tx, tenantId, key))
  return scoped(tenantId, (tx) => applyPreset(tx, tenantId, memberId, key, preview.fingerprint))
}
beforeAll(async () => {
  client = new PGlite(); database = drizzle(client, { schema })
  await client.exec('CREATE ROLE plata_app;')
  const folder = path.resolve('src/db/migrations'), journal = JSON.parse(readFileSync(path.join(folder, 'meta/_journal.json'), 'utf8')) as { entries: { tag: string }[] }
  for (const { tag } of journal.entries) {
    if (tag.startsWith('0011_')) await fixtures()
    await client.exec(readFileSync(path.join(folder, `${tag}.sql`), 'utf8'))
  }
  preserved = (await database.select().from(schema.contacts)).length
  await client.exec('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO plata_app;')
}, 30000)
beforeEach(async () => { await client.exec('TRUNCATE tenants, "user" CASCADE;'); await fixtures() })
afterAll(async () => { await client.close() })

describe('preconfiguraciones con vista previa y aprobación', () => {
  it('la migración conserva los contactos de organizaciones existentes', () => { expect(preserved).toBe(2) })
  it('rechaza claves ajenas al catálogo', async () => {
    expect(getPreset('__proto__')).toBeNull()
    await expect(scoped(A, (tx) => previewPreset(tx, A, 'unknown'))).rejects.toMatchObject({ status: 404 })
  })
  it('revisar no modifica datos; aplicar crea etapas, campos opcionales y un módulo', async () => {
    const preview = await scoped(A, (tx) => previewPreset(tx, A, 'real_estate_sale'))
    expect(preview.fieldsToCreate).toHaveLength(6); expect(preview.conflicts).toEqual([])
    expect(await database.select().from(schema.pipelines)).toHaveLength(0)
    const result = await scoped(A, (tx) => applyPreset(tx, A, OWNER, preview.key, preview.fingerprint))
    expect(result.applied).toBe(true)
    expect(await database.select().from(schema.pipelineStages)).toHaveLength(7)
    expect((await database.select().from(schema.customFieldDefinitions)).every((field) => !field.required)).toBe(true)
    expect((await database.select().from(schema.tenantModules))[0]?.moduleKey).toBe('properties')
    expect((await database.select().from(schema.pipelines))[0]?.isDefault).toBe(true)
  })
  it('conserva procesos previos y aplica venta y alquiler compartiendo sus campos', async () => {
    await database.insert(schema.pipelines).values({ tenantId: A, name: 'Ventas existentes', isDefault: true })
    await apply(); const rent = await scoped(A, (tx) => previewPreset(tx, A, 'real_estate_rent'))
    expect(rent.fieldsToCreate).toEqual([]); expect(rent.fieldsToReuse).toHaveLength(6)
    await apply('real_estate_rent')
    const processes = await database.select().from(schema.pipelines)
    expect(processes).toHaveLength(3); expect(processes.filter((item) => item.isDefault).map((item) => item.name)).toEqual(['Ventas existentes'])
    expect(await database.select().from(schema.customFieldDefinitions)).toHaveLength(6)
    expect(await database.select().from(schema.contacts)).toHaveLength(2)
  })
  it('repetir una aprobación conserva las personalizaciones sin duplicar ni reactivar módulos', async () => {
    const preview = await scoped(A, (tx) => previewPreset(tx, A, 'real_estate_sale'))
    await scoped(A, (tx) => applyPreset(tx, A, OWNER, preview.key, preview.fingerprint))
    await database.update(schema.pipelineStages).set({ name: 'Consulta personalizada' })
    await database.delete(schema.tenantModules)
    const result = await scoped(A, (tx) => applyPreset(tx, A, OWNER, preview.key, preview.fingerprint))
    expect(result.applied).toBe(false)
    expect(await database.select().from(schema.pipelineStages)).toHaveLength(7)
    expect((await database.select().from(schema.pipelineStages)).every((item) => item.name === 'Consulta personalizada')).toBe(true)
    expect(await database.select().from(schema.tenantModules)).toHaveLength(0)
  })
  it('una vista previa vencida no escribe ningún cambio', async () => {
    const preview = await scoped(A, (tx) => previewPreset(tx, A, 'real_estate_sale'))
    await database.insert(schema.customFieldDefinitions).values({ tenantId: A, entityType: 'contact', key: 'manual', label: 'Manual', fieldType: 'text' })
    await expect(scoped(A, (tx) => applyPreset(tx, A, OWNER, preview.key, preview.fingerprint))).rejects.toMatchObject({ status: 409 })
    expect(await database.select().from(schema.pipelines)).toHaveLength(0)
    expect(await database.select().from(schema.tenantModules)).toHaveLength(0)
  })
  it('bloquea campos incompatibles y nombres de proceso existentes sin reemplazarlos', async () => {
    await database.insert(schema.customFieldDefinitions).values({ tenantId: A, entityType: 'contact', key: 're_currency', label: 'Mi moneda', fieldType: 'text' })
    await database.insert(schema.pipelines).values({ tenantId: A, name: 'Venta de propiedades' })
    const preview = await scoped(A, (tx) => previewPreset(tx, A, 'real_estate_sale'))
    expect(preview.conflicts).toHaveLength(2)
    await expect(scoped(A, (tx) => applyPreset(tx, A, OWNER, preview.key, preview.fingerprint))).rejects.toMatchObject({ status: 409 })
    expect((await database.select().from(schema.customFieldDefinitions))[0]?.fieldType).toBe('text')
  })
  it('revalida el rol y la organización del actor al aplicar', async () => {
    const preview = await scoped(A, (tx) => previewPreset(tx, A, 'real_estate_sale'))
    for (const memberId of [SELLER, OTHER]) await expect(scoped(A, (tx) => applyPreset(tx, A, memberId, preview.key, preview.fingerprint))).rejects.toMatchObject({ status: 403 })
    expect(await database.select().from(schema.tenantPresets)).toHaveLength(0)
  })
  it('un error durante la aplicación revierte pipeline, etapas, campos y módulo', async () => {
    await client.exec("ALTER TABLE pipeline_stages ADD CONSTRAINT preview_failure CHECK (name <> 'Reserva');")
    try {
      await expect(apply()).rejects.toThrow()
      for (const table of [schema.pipelines, schema.pipelineStages, schema.customFieldDefinitions, schema.tenantModules, schema.tenantPresets]) expect(await database.select().from(table)).toHaveLength(0)
    } finally { await client.exec('ALTER TABLE pipeline_stages DROP CONSTRAINT preview_failure;') }
  })
  it('la huella de una organización no autoriza configurar otra', async () => {
    const preview = await scoped(A, (tx) => previewPreset(tx, A, 'automotive_sales'))
    await expect(scoped(B, (tx) => applyPreset(tx, B, OTHER, preview.key, preview.fingerprint))).rejects.toMatchObject({ status: 409 })
    await apply('automotive_sales', B, OTHER)
    expect(await scoped(A, (tx) => tx.select().from(schema.tenantPresets))).toHaveLength(0)
  })
})

describe('catálogos, relaciones y citas', () => {
  it('no permite operar un catálogo deshabilitado', async () => {
    await expect(scoped(A, (tx) => saveCatalog(tx, A, 'properties', property))).rejects.toMatchObject({ status: 403 })
  })
  it('valida datos específicos, límites numéricos y campos permitidos', () => {
    for (const price of [-1, '1.234', 1.234, 'Infinity', {}, '1e4']) expect(() => validateCatalog('properties', { ...property, price })).toThrow()
    expect(() => validateCatalog('properties', { ...property, bedrooms: 1.5 })).toThrow()
    expect(() => validateCatalog('vehicles', { ...vehicle, status: 'rented' })).toThrow()
    expect(() => validateCatalog('vehicles', { ...vehicle, year: 1885 })).toThrow()
    expect(() => validateCatalog('vehicles', { ...vehicle, year: new Date().getUTCFullYear() + 2 })).toThrow()
    expect(() => validateCatalog('vehicles', { ...vehicle, mileage: 2147483648 })).toThrow()
    expect(validateCatalog('properties', { ...property, tenantId: B, id: OTHER, price: '' })).toMatchObject({ price: null })
    expect(validateCatalog('properties', { ...property, tenantId: B })).not.toHaveProperty('tenantId')
  })
  it('crea y edita sin perder campos omitidos; rechaza contactos y responsables ajenos', async () => {
    await apply()
    const item = await scoped(A, (tx) => saveCatalog(tx, A, 'properties', property))
    const updated = await scoped(A, (tx) => saveCatalog(tx, A, 'properties', { notes: 'Nueva nota', bedrooms: 0 }, item.id))
    expect(updated.title).toBe(property.title); expect(updated.price).toBe(property.price)
    for (const changes of [{ sourceContactId: OTHER_CONTACT }, { assignedTo: OTHER }]) await expect(scoped(A, (tx) => saveCatalog(tx, A, 'properties', changes, item.id))).rejects.toMatchObject({ status: 404 })
    await apply('real_estate_sale', B, OTHER)
    await expect(scoped(B, (tx) => saveCatalog(tx, B, 'properties', { title: 'Ajena' }, item.id))).rejects.toMatchObject({ status: 404 })
  })
  it('busca literales y filtra disponibilidad sin filtrar fichas de otra empresa', async () => {
    await apply(); await apply('real_estate_sale', B, OTHER)
    await scoped(A, (tx) => saveCatalog(tx, A, 'properties', { ...property, title: 'Casa 10%_A' }))
    await scoped(A, (tx) => saveCatalog(tx, A, 'properties', { ...property, title: 'Casa normal', status: 'reserved' }))
    await scoped(B, (tx) => saveCatalog(tx, B, 'properties', { ...property, title: 'Ajena', sourceContactId: OTHER_CONTACT, assignedTo: OTHER }))
    expect(await scoped(A, (tx) => listCatalog(tx, A, 'properties', '%_'))).toHaveLength(1)
    expect(await scoped(A, (tx) => listCatalog(tx, A, 'properties', '', 'reserved'))).toHaveLength(1)
    expect(await scoped(A, (tx) => tx.select().from(schema.properties))).toHaveLength(2)
  })
  it('vincula oportunidades y conserva historial al archivar o eliminar un contacto', async () => {
    const configured = await apply()
    const item = await scoped(A, (tx) => saveCatalog(tx, A, 'properties', property))
    const stages = await database.select().from(schema.pipelineStages)
    await scoped(A, async (tx) => { await validateDealCatalog(tx, A, item.id, null); await tx.insert(schema.deals).values({ tenantId: A, pipelineId: configured.pipelineId!, stageId: stages[0]!.id, title: 'Interés de cliente', propertyId: item.id, contactId: CONTACT }) })
    await scoped(A, (tx) => scheduleAppointment(tx, A, 'properties', item.id, { contactId: CONTACT, assignedTo: OWNER, scheduledAt: future() }))
    await scoped(A, (tx) => saveCatalog(tx, A, 'properties', { status: 'archived' }, item.id))
    await expect(scoped(A, (tx) => validateDealCatalog(tx, A, item.id, null))).rejects.toMatchObject({ status: 409 })
    await expect(scoped(A, (tx) => scheduleAppointment(tx, A, 'properties', item.id, { contactId: CONTACT, scheduledAt: future() }))).rejects.toMatchObject({ status: 409 })
    await database.delete(schema.contacts).where(eq(schema.contacts.id, CONTACT))
    const detail = await scoped(A, (tx) => relatedCatalog(tx, A, 'properties', item.id))
    expect(detail.deals).toHaveLength(1); expect(detail.appointments).toHaveLength(1); expect(detail.appointments[0]?.contactId).toBeNull()
    expect(detail.item.sourceContactId).toBeNull()
    await scoped(A, (tx) => saveCatalog(tx, A, 'properties', { status: 'available' }, item.id))
    await scoped(A, (tx) => validateDealCatalog(tx, A, item.id, null))
  })
  it('rechaza dos activos en una oportunidad y vínculos de activos ajenos en PostgreSQL', async () => {
    const configured = await apply(); await apply('automotive_sales'); await apply('real_estate_sale', B, OTHER)
    const item = await scoped(A, (tx) => saveCatalog(tx, A, 'properties', property))
    const car = await scoped(A, (tx) => saveCatalog(tx, A, 'vehicles', vehicle))
    const foreign = await scoped(B, (tx) => saveCatalog(tx, B, 'properties', { ...property, sourceContactId: OTHER_CONTACT, assignedTo: OTHER }))
    await expect(scoped(A, (tx) => validateDealCatalog(tx, A, item.id, car.id))).rejects.toMatchObject({ status: 400 })
    await expect(scoped(A, (tx) => validateDealCatalog(tx, A, foreign.id, null))).rejects.toMatchObject({ status: 404 })
    const [stage] = await database.select().from(schema.pipelineStages).where(eq(schema.pipelineStages.pipelineId, configured.pipelineId!))
    await expect(database.insert(schema.deals).values({ tenantId: A, pipelineId: configured.pipelineId!, stageId: stage!.id, title: 'Inválida', propertyId: foreign.id })).rejects.toThrow()
    await expect(database.insert(schema.deals).values({ tenantId: A, pipelineId: configured.pipelineId!, stageId: stage!.id, title: 'Inválida', propertyId: item.id, vehicleId: car.id })).rejects.toThrow()
  })
  it('agenda prueba de manejo y valida interesados, horarios y pertenencia de la cita', async () => {
    await apply('automotive_sales'); await apply('automotive_sales', B, OTHER)
    const car = await scoped(A, (tx) => saveCatalog(tx, A, 'vehicles', vehicle))
    for (const input of [{ contactId: OTHER_CONTACT, scheduledAt: future() }, { contactId: CONTACT, assignedTo: OTHER, scheduledAt: future() }]) await expect(scoped(A, (tx) => scheduleAppointment(tx, A, 'vehicles', car.id, input))).rejects.toMatchObject({ status: 404 })
    for (const scheduledAt of ['invalid', '2020-01-01T12:00:00Z', '2099-01-01T12:00:00']) await expect(scoped(A, (tx) => scheduleAppointment(tx, A, 'vehicles', car.id, { contactId: CONTACT, scheduledAt }))).rejects.toMatchObject({ status: 400 })
    const appointment = await scoped(A, (tx) => scheduleAppointment(tx, A, 'vehicles', car.id, { contactId: CONTACT, scheduledAt: future() }))
    expect(appointment.kind).toBe('test_drive'); expect(appointment.vehicleId).toBe(car.id)
    const otherCar = await scoped(A, (tx) => saveCatalog(tx, A, 'vehicles', { ...vehicle, title: 'Otro' }))
    await expect(scoped(A, (tx) => changeAppointment(tx, A, 'vehicles', otherCar.id, appointment.id, 'completed'))).rejects.toMatchObject({ status: 404 })
    await expect(scoped(B, (tx) => changeAppointment(tx, B, 'vehicles', car.id, appointment.id, 'completed'))).rejects.toMatchObject({ status: 404 })
    expect((await scoped(A, (tx) => changeAppointment(tx, A, 'vehicles', car.id, appointment.id, 'completed'))).status).toBe('completed')
  })
  it('RLS impide insertar datos para otro tenant incluso con una FK válida', async () => {
    await apply('automotive_sales')
    await expect(scoped(A, (tx) => tx.insert(schema.vehicles).values({ tenantId: B, title: 'Ajeno', make: 'Ford', model: 'Ka', year: 2020 }))).rejects.toThrow()
    expect(await database.select().from(schema.vehicles)).toHaveLength(0)
  })
  it('elimina una organización completa sin romper las referencias de su historial', async () => {
    const configured = await apply()
    const item = await scoped(A, (tx) => saveCatalog(tx, A, 'properties', property))
    const [stage] = await database.select().from(schema.pipelineStages)
    await database.insert(schema.deals).values({ tenantId: A, pipelineId: configured.pipelineId!, stageId: stage!.id, title: 'Consulta', propertyId: item.id })
    await scoped(A, (tx) => scheduleAppointment(tx, A, 'properties', item.id, { contactId: CONTACT, scheduledAt: future() }))
    await database.delete(schema.tenants).where(eq(schema.tenants.id, A))
    expect(await database.select().from(schema.properties)).toHaveLength(0)
    expect(await database.select().from(schema.appointments)).toHaveLength(0)
    expect(await database.select().from(schema.deals)).toHaveLength(0)
  })
})

import { beforeAll, beforeEach, afterAll, afterEach, describe, expect, it, vi } from 'vitest'
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
import { editAppointment } from '../service'
import { dayOnly, saveTask } from '../../agenda/tasks'
import { agenda, localToday } from '../../agenda/service'
import { startConnection, consumeState, finishConnection, disconnect, syncConnection } from '../../calendar/service'
import { CALENDAR_SCOPE, GoogleCalendar, GoogleError, protect, unprotect, eventBody, eventId } from '../../calendar/google'

const A = '11111111-1111-1111-1111-111111111111', B = '22222222-2222-2222-2222-222222222222'
const OWNER = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', SELLER = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', OTHER = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1'
const CONTACT = 'cccccccc-cccc-cccc-cccc-ccccccccccc1', OTHER_CONTACT = 'cccccccc-cccc-cccc-cccc-ccccccccccc2'
const property = { title: 'Casa en Colonia', operation: 'sale', propertyType: 'house', address: 'Calle 123', city: 'Colonia', price: '125000.50', sourceContactId: CONTACT, assignedTo: OWNER }
const vehicle = { title: 'Toyota Corolla', make: 'Toyota', model: 'Corolla', year: 2022, mileage: 35000, stockType: 'consignment', sourceContactId: CONTACT }
const future = () => new Date(Date.now() + 86400000).toISOString()
let client: PGlite, database: ReturnType<typeof drizzle<typeof schema>>, preserved: number, migratedDay: string | null

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
    if (tag.startsWith('0013_')) await client.exec(`INSERT INTO tasks (tenant_id,title,due_date) VALUES ('${A}','Tarea previa a agenda','2026-10-13 00:00:00');`)
    await client.exec(readFileSync(path.join(folder, `${tag}.sql`), 'utf8'))
  }
  preserved = (await database.select().from(schema.contacts)).length
  migratedDay = (await database.select().from(schema.tasks))[0]?.dueOn ?? null
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

describe('agenda y seguimiento comercial', () => {
  it('la migración conserva el día de vencimiento de las tareas anteriores', () => { expect(migratedDay).toBe('2026-10-13') })
  it('fechas sin hora conservan el día y rechazan fechas imposibles', () => {
    expect(dayOnly('2026-10-13')).toBe('2026-10-13')
    expect(localToday(new Date('2026-10-14T01:30:00Z'))).toBe('2026-10-13')
    for (const value of ['2026-02-30', '2026-13-01', '13/10/2026', {}, true]) expect(() => dayOnly(value)).toThrow()
  })
  it('valida responsables, relaciones, estado y fechas en altas y ediciones', async () => {
    const task = await scoped(A, (tx) => saveTask(tx, A, { title: 'Llamar', dueOn: '2026-10-13', assignedTo: SELLER, contactId: CONTACT }))
    expect(task.dueDate?.toISOString()).toBe('2026-10-13T00:00:00.000Z')
    expect(task.assignedTo).toBe(SELLER)
    for (const input of [{ title: 123 }, { done: 'false' }, { assignedTo: OTHER }, { contactId: OTHER_CONTACT }, { dealId: 'wrong' }, { dueOn: '2026-02-30' }]) await expect(scoped(A, (tx) => saveTask(tx, A, input, task.id))).rejects.toThrow()
    await expect(scoped(B, (tx) => saveTask(tx, B, { done: true }, task.id))).rejects.toMatchObject({ status: 404 })
    expect((await database.select().from(schema.tasks))[0]?.done).toBe(false)
  })
  it('vincula una acción con fecha y contacto a la oportunidad; cerradas no requieren seguimiento', async () => {
    const result = await apply(), stages = await database.select().from(schema.pipelineStages)
    const [deal] = await database.insert(schema.deals).values({ tenantId: A, pipelineId: result.pipelineId!, stageId: stages.find((s) => s.outcome === 'open')!.id, title: 'Venta', contactId: CONTACT }).returning()
    expect((await scoped(A, (tx) => agenda(tx, A))).counts.withoutFollowUp).toBe(1)
    await scoped(A, (tx) => saveTask(tx, A, { title: 'Seguimiento sin fecha', dealId: deal!.id }))
    expect((await scoped(A, (tx) => agenda(tx, A))).counts.withoutFollowUp).toBe(1)
    const task = await scoped(A, (tx) => saveTask(tx, A, { title: 'Llamar', dueOn: localToday(), dealId: deal!.id, assignedTo: OWNER }))
    expect(task.contactId).toBe(CONTACT)
    expect((await scoped(A, (tx) => agenda(tx, A))).counts.withoutFollowUp).toBe(0)
    await scoped(A, (tx) => saveTask(tx, A, { done: true }, task.id))
    expect((await scoped(A, (tx) => agenda(tx, A))).counts.withoutFollowUp).toBe(1)
    await database.update(schema.deals).set({ stageId: stages.find((s) => s.outcome === 'won')!.id })
    expect((await scoped(A, (tx) => agenda(tx, A))).followUp).toHaveLength(0)
  })
  it('una cita de otra persona a la misma propiedad no oculta una oportunidad sin seguimiento', async () => {
    const result = await apply(), item = await scoped(A, (tx) => saveCatalog(tx, A, 'properties', property))
    const [stage] = await database.select().from(schema.pipelineStages)
    const [second] = await database.insert(schema.contacts).values({ tenantId: A, name: 'Otro interesado' }).returning()
    await database.insert(schema.deals).values({ tenantId: A, pipelineId: result.pipelineId!, stageId: stage!.id, title: 'Venta', contactId: CONTACT, propertyId: item.id })
    await scoped(A, (tx) => scheduleAppointment(tx, A, 'properties', item.id, { contactId: second!.id, scheduledAt: future() }))
    expect((await scoped(A, (tx) => agenda(tx, A))).counts.withoutFollowUp).toBe(1)
    await scoped(A, (tx) => scheduleAppointment(tx, A, 'properties', item.id, { contactId: CONTACT, scheduledAt: future() }))
    expect((await scoped(A, (tx) => agenda(tx, A))).counts.withoutFollowUp).toBe(0)
  })
  it('vencidos incluyen citas pasadas y tareas anteriores; hoy todavía no vence', async () => {
    await apply(); const item = await scoped(A, (tx) => saveCatalog(tx, A, 'properties', property))
    const now = new Date('2026-10-13T15:00:00Z')
    await database.insert(schema.appointments).values({ tenantId: A, kind: 'property_visit', propertyId: item.id, scheduledAt: new Date('2026-10-13T13:00:00Z') })
    await scoped(A, (tx) => saveTask(tx, A, { title: 'Ayer', dueOn: '2026-10-12' }))
    await scoped(A, (tx) => saveTask(tx, A, { title: 'Hoy', dueOn: '2026-10-13' }))
    expect((await scoped(A, (tx) => agenda(tx, A, now))).counts).toMatchObject({ overdueTasks: 1, overdueAppointments: 1 })
    const other = await scoped(B, (tx) => agenda(tx, B, now))
    expect(other.tasks).toEqual([]); expect(other.appointments).toEqual([])
  })
  it('reprograma fecha, duración y responsable sin cambiar interesado; valida organización', async () => {
    await apply(); const item = await scoped(A, (tx) => saveCatalog(tx, A, 'properties', property))
    const appointment = await scoped(A, (tx) => scheduleAppointment(tx, A, 'properties', item.id, { contactId: CONTACT, scheduledAt: future() }))
    const updated = await scoped(A, (tx) => editAppointment(tx, A, 'properties', item.id, appointment.id, { scheduledAt: future(), durationMinutes: 30, assignedTo: SELLER }))
    expect(updated).toMatchObject({ durationMinutes: 30, assignedTo: SELLER, contactId: CONTACT })
    for (const input of [{ durationMinutes: 0 }, { durationMinutes: '60' }, { assignedTo: OTHER }, { scheduledAt: '2026-10-15T10:00' }]) await expect(scoped(A, (tx) => editAppointment(tx, A, 'properties', item.id, appointment.id, input))).rejects.toThrow()
  })
})

describe('Google Calendar: autorización y sincronización', () => {
  beforeEach(() => {
    vi.stubEnv('GOOGLE_CALENDAR_CLIENT_ID', 'test-client'); vi.stubEnv('GOOGLE_CALENDAR_CLIENT_SECRET', 'test-secret'); vi.stubEnv('CALENDAR_ENCRYPTION_KEY', 'ab'.repeat(32))
  })
  afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks() })
  async function connected() {
    const google = new GoogleCalendar()
    vi.spyOn(google, 'exchange').mockResolvedValue({ access_token: 'fake-access', refresh_token: 'fake-refresh', scope: CALENDAR_SCOPE })
    const url = await scoped(A, (tx) => startConnection(tx, A, OWNER, 'owner-a'))
    const state = new URL(url).searchParams.get('state')!
    const pending = await scoped(A, (tx) => consumeState(tx, A, state, 'owner-a'))
    const id = await finishConnection(scoped, A, OWNER, 'owner-a', 'fake-code', pending.verifier, pending.authorizationHash, google)
    return { id, google }
  }
  async function setupSync() {
    await apply(); const item = await scoped(A, (tx) => saveCatalog(tx, A, 'properties', property))
    const appointment = await scoped(A, (tx) => scheduleAppointment(tx, A, 'properties', item.id, { contactId: CONTACT, assignedTo: OWNER, scheduledAt: future() }))
    const { id, google } = await connected()
    vi.spyOn(google, 'refresh').mockResolvedValue({ access_token: 'fake-access' })
    const create = vi.spyOn(google, 'createCalendar').mockResolvedValue('calendar-test')
    const save = vi.spyOn(google, 'saveEvent').mockResolvedValue()
    const remove = vi.spyOn(google, 'deleteEvent').mockResolvedValue()
    return { id, google, item, appointment, create, save, remove }
  }
  async function due(id: string) { await database.update(schema.calendarConnections).set({ nextSyncAt: new Date(0) }).where(eq(schema.calendarConnections.id, id)) }
  it('cifra tokens y vincula el cifrado a organización y miembro', () => {
    const value = protect('secret-refresh-token', `${A}:${OWNER}`)
    expect(value).not.toContain('secret-refresh-token'); expect(unprotect(value, `${A}:${OWNER}`)).toBe('secret-refresh-token')
    expect(() => unprotect(value, `${B}:${OWNER}`)).toThrow()
    expect(() => unprotect(value.slice(0, -4) + 'AAAA', `${A}:${OWNER}`)).toThrow()
  })
  it('usa permiso de calendarios creados por Plata, PKCE, offline y state por sesión', async () => {
    const url = new URL(await scoped(A, (tx) => startConnection(tx, A, OWNER, 'owner-a')))
    expect(url.searchParams.get('scope')).toBe(CALENDAR_SCOPE); expect(url.searchParams.get('code_challenge_method')).toBe('S256')
    expect(url.searchParams.get('access_type')).toBe('offline')
    const state = url.searchParams.get('state')!
    await expect(scoped(A, (tx) => consumeState(tx, A, state, 'owner-b'))).rejects.toMatchObject({ status: 400 })
    await scoped(A, (tx) => consumeState(tx, A, state, 'owner-a'))
    await expect(scoped(A, (tx) => consumeState(tx, A, state, 'owner-a'))).rejects.toMatchObject({ status: 400 })
  })
  it('estado vencido, ajeno y autorización de support son rechazados', async () => {
    const url = new URL(await scoped(A, (tx) => startConnection(tx, A, OWNER, 'owner-a'))), state = url.searchParams.get('state')!
    await expect(scoped(B, (tx) => consumeState(tx, B, state, 'owner-a'))).rejects.toThrow()
    await database.update(schema.calendarOAuthStates).set({ expiresAt: new Date(0) })
    await expect(scoped(A, (tx) => consumeState(tx, A, state, 'owner-a'))).rejects.toThrow()
    await database.update(schema.members).set({ role: 'support' }).where(eq(schema.members.id, SELLER))
    await expect(scoped(A, (tx) => startConnection(tx, A, SELLER, 'seller-a'))).rejects.toMatchObject({ status: 403 })
  })
  it('PostgreSQL bloquea conexiones y estados que intentan enlazar un miembro ajeno', async () => {
    await expect(scoped(A, (tx) => tx.insert(schema.calendarConnections).values({ tenantId: A, memberId: OTHER }))).rejects.toThrow()
    await expect(scoped(A, (tx) => tx.insert(schema.calendarOAuthStates).values({ hash: 'cross-tenant', tenantId: A, memberId: OTHER, userId: 'owner-b', encryptedVerifier: 'none', expiresAt: new Date(Date.now() + 60000) }))).rejects.toThrow()
    const { id } = await connected()
    await expect(scoped(B, (tx) => tx.insert(schema.calendarEventSync).values({ tenantId: B, connectionId: id, appointmentId: CONTACT, fingerprint: 'cross-tenant' }))).rejects.toThrow()
    expect(await database.select().from(schema.calendarEventSync)).toHaveLength(0)
  })
  it('solo guarda credenciales con scope completo y revalida membresía después de Google', async () => {
    const google = new GoogleCalendar()
    vi.spyOn(google, 'exchange').mockResolvedValue({ access_token: 'fake', refresh_token: 'fake-refresh', scope: 'openid' })
    await expect(finishConnection(scoped, A, OWNER, 'owner-a', 'code', 'verifier', 'invalid', google)).rejects.toThrow()
    expect(await database.select().from(schema.calendarConnections)).toHaveLength(0)
    vi.spyOn(google, 'exchange').mockResolvedValue({ access_token: 'fake', refresh_token: 'fake-refresh', scope: CALENDAR_SCOPE })
    await expect(finishConnection(scoped, A, OWNER, 'owner-b', 'code', 'verifier', 'invalid', google)).rejects.toMatchObject({ status: 403 })
  })
  it('RLS protege estados, conexiones y eventos; desconectar destruye tokens y estados pendientes', async () => {
    await connected()
    expect(await scoped(B, (tx) => tx.select().from(schema.calendarConnections))).toHaveLength(0)
    await scoped(A, (tx) => disconnect(tx, A, OWNER))
    await scoped(A, (tx) => startConnection(tx, A, OWNER, 'owner-a'))
    expect(await scoped(B, (tx) => tx.select().from(schema.calendarOAuthStates))).toHaveLength(0)
    await scoped(A, (tx) => disconnect(tx, A, OWNER))
    const [connection] = await database.select().from(schema.calendarConnections)
    expect(connection).toMatchObject({ encryptedToken: null, status: 'disconnected' })
    expect(await database.select().from(schema.calendarOAuthStates)).toHaveLength(0)
  })
  it('desconectar durante el intercambio OAuth impide reconectar con una respuesta tardía', async () => {
    const google = new GoogleCalendar()
    const url = new URL(await scoped(A, (tx) => startConnection(tx, A, OWNER, 'owner-a')))
    const pending = await scoped(A, (tx) => consumeState(tx, A, url.searchParams.get('state')!, 'owner-a'))
    vi.spyOn(google, 'exchange').mockImplementation(async () => {
      await scoped(A, (tx) => disconnect(tx, A, OWNER))
      return { access_token: 'fake', refresh_token: 'fake-refresh', scope: CALENDAR_SCOPE }
    })
    await expect(finishConnection(scoped, A, OWNER, 'owner-a', 'code', pending.verifier, pending.authorizationHash, google)).rejects.toMatchObject({ status: 400 })
    expect(await database.select().from(schema.calendarConnections)).toHaveLength(0)
  })
  it('exporta solo ficha y horario, sin notas, contactos ni invitados', () => {
    const body = eventBody({ id: CONTACT, scheduledAt: new Date('2026-10-14T15:00:00Z'), durationMinutes: 30, kind: 'property_visit', propertyId: OTHER, vehicleId: null, propertyTitle: 'Casa', vehicleTitle: null }, 'negocio-a')
    expect(body.end.dateTime).toBe('2026-10-14T15:30:00.000Z'); expect(body.visibility).toBe('private')
    expect(body).not.toHaveProperty('attendees'); expect(body).not.toHaveProperty('notes')
    expect(eventId(CONTACT, 0)).toMatch(/^[a-v0-9]{5,1024}$/)
  })
  it('crea una vez, conserva ids, actualiza horarios, cancela y reabre sin reutilizar ids borrados', async () => {
    const { id, google, item, appointment, create, save, remove } = await setupSync()
    await syncConnection(scoped, A, id, google)
    expect(create).toHaveBeenCalledTimes(1); expect(save).toHaveBeenCalledTimes(1)
    await due(id); await syncConnection(scoped, A, id, google); expect(save).toHaveBeenCalledTimes(1)
    await scoped(A, (tx) => editAppointment(tx, A, 'properties', item.id, appointment.id, { durationMinutes: 30 }))
    await due(id); await syncConnection(scoped, A, id, google); expect(save).toHaveBeenCalledTimes(2)
    expect(save.mock.calls[0]![2]).toBe(save.mock.calls[1]![2])
    await scoped(A, (tx) => editAppointment(tx, A, 'properties', item.id, appointment.id, { status: 'cancelled' }))
    await due(id); await syncConnection(scoped, A, id, google); expect(remove).toHaveBeenCalledTimes(1)
    await scoped(A, (tx) => editAppointment(tx, A, 'properties', item.id, appointment.id, { status: 'scheduled' }))
    await due(id); await syncConnection(scoped, A, id, google)
    expect(save.mock.calls[2]![2]).not.toBe(save.mock.calls[0]![2])
  })
  it('reintenta una respuesta incierta con el mismo id y quita citas reasignadas', async () => {
    const { id, google, item, appointment, save, remove } = await setupSync()
    save.mockRejectedValueOnce(new GoogleError(503))
    await syncConnection(scoped, A, id, google)
    expect((await database.select().from(schema.calendarConnections))[0]?.lastError).toContain('cinco minutos')
    await due(id); await syncConnection(scoped, A, id, google)
    expect(save.mock.calls[0]![2]).toBe(save.mock.calls[1]![2])
    await scoped(A, (tx) => editAppointment(tx, A, 'properties', item.id, appointment.id, { assignedTo: SELLER }))
    await due(id); await syncConnection(scoped, A, id, google); expect(remove).toHaveBeenCalledTimes(1)
  })
  it('una lease vigente evita workers simultáneos; revocación exige autorización', async () => {
    const { id, google, save } = await setupSync()
    await database.update(schema.calendarConnections).set({ leaseUntil: new Date(Date.now() + 60000) }).where(eq(schema.calendarConnections.id, id))
    await syncConnection(scoped, A, id, google); expect(save).not.toHaveBeenCalled()
    await database.update(schema.calendarConnections).set({ leaseUntil: null }).where(eq(schema.calendarConnections.id, id))
    vi.spyOn(google, 'refresh').mockRejectedValueOnce(new GoogleError(400, true))
    await syncConnection(scoped, A, id, google)
    expect((await database.select().from(schema.calendarConnections))[0]?.status).toBe('reconnect')
  })
  it('no inicia eventos después de desconectar y no restaura credenciales al terminar una llamada', async () => {
    const { id, google, save } = await setupSync()
    save.mockImplementationOnce(async () => { await scoped(A, (tx) => disconnect(tx, A, OWNER)) })
    await syncConnection(scoped, A, id, google)
    expect((await database.select().from(schema.calendarConnections))[0]).toMatchObject({ status: 'disconnected', encryptedToken: null, leaseId: null })
    await due(id); await syncConnection(scoped, A, id, google)
    expect(save).toHaveBeenCalledTimes(1)
  })
  it('regenera el id si Google conserva un tombstone tras una respuesta perdida', async () => {
    const { id, google, save } = await setupSync()
    save.mockRejectedValueOnce(new GoogleError(410))
    await syncConnection(scoped, A, id, google); await due(id); await syncConnection(scoped, A, id, google)
    expect(save.mock.calls[0]![2]).not.toBe(save.mock.calls[1]![2])
    expect((await database.select().from(schema.calendarConnections))[0]?.status).toBe('connected')
  })
})

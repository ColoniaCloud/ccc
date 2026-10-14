import { beforeAll, beforeEach, afterAll, describe, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { eq, sql } from 'drizzle-orm'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import * as schema from '../../db/schema'
import type { TenantTx } from '../../db/tenant-db'
import { startPilot, recordPilotActivity, pilotReport, pilotWeeks } from '../pilot'
import { commercialSummary, pipelineSummary } from '@crm/shared'
const A = '11111111-1111-1111-1111-111111111111', B = '22222222-2222-2222-2222-222222222222', MEMBER = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
let client: PGlite, db: ReturnType<typeof drizzle<typeof schema>>
const scoped = <T>(tenant: string, run: (tx: TenantTx) => Promise<T>) => db.transaction(async tx => {
  await tx.execute(sql`SET LOCAL ROLE plata_app`); await tx.execute(sql`SELECT set_config('app.tenant_id', ${tenant}, true)`)
  return run(tx as unknown as TenantTx)
})
beforeAll(async () => {
  client = new PGlite(); db = drizzle(client, { schema }); await client.exec('CREATE ROLE plata_app;')
  const folder = path.resolve('src/db/migrations'), journal = JSON.parse(readFileSync(path.join(folder, 'meta/_journal.json'), 'utf8'))
  for (const { tag } of journal.entries) await client.exec(readFileSync(path.join(folder, `${tag}.sql`), 'utf8'))
  await client.exec('GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO plata_app;')
}, 30000)
beforeEach(async () => {
  await client.exec(`TRUNCATE tenants,"user" CASCADE; INSERT INTO "user" (id,name,email,email_verified,created_at,updated_at) VALUES ('pilot','Pilot','pilot@example.com',true,now(),now()); INSERT INTO tenants (id,name,slug) VALUES ('${A}','A','a'),('${B}','B','b'); INSERT INTO members (id,user_id,tenant_id,role) VALUES ('${MEMBER}','pilot','${A}','owner');`)
  await db.update(schema.tenants).set({ businessProfile: { version: 1, industry: 'real_estate', industryOther: null, country: 'UY', teamSize: 'solo', offering: 'Propiedades', salesChannels: ['whatsapp'], averageTicket: null, salesCycle: 'weeks', mainGoal: 'follow_up' } }).where(eq(schema.tenants.id, A))
})
afterAll(async () => client.close())
describe('medición persistente del piloto', () => {
  it('leer no inicia ni altera la medición', async () => {
    expect((await scoped(A, tx => pilotReport(tx, A))).supported).toBe(true)
    expect(await db.select().from(schema.pilotMeasurements)).toHaveLength(0)
  })
  it('marca los datos anteriores como baseline y conserva el hito después de eliminar', async () => {
    const [contact] = await db.insert(schema.contacts).values({ tenantId: A, name: 'Anterior' }).returning()
    await scoped(A, tx => startPilot(tx, A, MEMBER, new Date('2026-10-13T15:00:00Z')))
    await scoped(A, async tx => { await tx.delete(schema.contacts).where(eq(schema.contacts.id, contact!.id)); await recordPilotActivity(tx, A, MEMBER, new Date('2026-10-14T01:00:00Z')) })
    const report = await scoped(A, tx => pilotReport(tx, A, new Date('2026-10-14T15:00:00Z')))
    if (!report.supported) throw new Error('unsupported')
    expect(report.milestones.find(m => m.key === 'contact')?.source).toBe('baseline')
    expect(report.secondsToActivation).toBeNull()
    expect(report.weeks.at(-1)).toMatchObject({ activeDays: 1, actions: 1 })
  })
  it('registra el primer hito durante una acción y no cambia su fecha al repetirse', async () => {
    await scoped(A, async tx => {
      await startPilot(tx, A, MEMBER, new Date('2026-10-13T15:00:00Z'))
      await tx.insert(schema.contacts).values({ tenantId: A, name: 'Nuevo' })
      await recordPilotActivity(tx, A, MEMBER, new Date('2026-10-13T15:10:00Z'))
      await recordPilotActivity(tx, A, MEMBER, new Date('2026-10-13T15:20:00Z'))
    })
    const [milestone] = await db.select().from(schema.pilotMilestones)
    expect(milestone?.source).toBe('activity'); expect(milestone?.observedAt.toISOString()).toBe('2026-10-13T15:10:00.000Z')
    expect((await db.select().from(schema.pilotActivityDaily))[0]?.actions).toBe(2)
  })
  it('revierte datos comerciales y medición juntos cuando falla la transacción', async () => {
    await expect(scoped(A, async tx => { await startPilot(tx, A, MEMBER); await tx.insert(schema.contacts).values({ tenantId: A, name: 'Fallido' }); await recordPilotActivity(tx, A, MEMBER); throw new Error('rollback') })).rejects.toThrow('rollback')
    expect(await db.select().from(schema.pilotMeasurements)).toHaveLength(0); expect(await db.select().from(schema.contacts)).toHaveLength(0)
  })
  it('aísla las tres tablas por organización y bloquea escrituras ajenas', async () => {
    await scoped(A, async tx => { await startPilot(tx, A, MEMBER); await tx.insert(schema.contacts).values({ tenantId: A, name: 'Propio' }); await recordPilotActivity(tx, A, MEMBER) })
    await scoped(B, async tx => {
      expect(await tx.select().from(schema.pilotMeasurements)).toHaveLength(0)
      expect(await tx.select().from(schema.pilotMilestones)).toHaveLength(0)
      expect(await tx.select().from(schema.pilotActivityDaily)).toHaveLength(0)
    })
    await expect(scoped(B, tx => tx.insert(schema.pilotActivityDaily).values({ tenantId: A, day: '2026-10-13', lastActivityAt: new Date() }))).rejects.toThrow()
  })
  it('no inicia otros rubros y pausa la actividad si cambia el rubro medido', async () => {
    expect(await scoped(B, tx => startPilot(tx, B, MEMBER))).toBe(false)
    await scoped(A, tx => startPilot(tx, A, MEMBER))
    const tenant = await db.query.tenants.findFirst({ where: eq(schema.tenants.id, A) })
    await db.update(schema.tenants).set({ businessProfile: { ...tenant!.businessProfile!, industry: 'automotive' } }).where(eq(schema.tenants.id, A))
    await scoped(A, tx => recordPilotActivity(tx, A, MEMBER))
    const report = await scoped(A, tx => pilotReport(tx, A)); if (!report.supported) throw new Error('unsupported')
    expect(report.currentIndustryMatches).toBe(false); expect(await db.select().from(schema.pilotActivityDaily)).toHaveLength(0)
  })
  it('calcula semanas usando el día local de Uruguay cerca de medianoche UTC', () => {
    expect(pilotWeeks(new Date('2026-10-19T01:00:00Z')).at(-1)).toEqual({ from: '2026-10-12', to: '2026-10-18' })
    expect(pilotWeeks(new Date('2026-10-19T04:00:00Z')).at(-1)).toEqual({ from: '2026-10-19', to: '2026-10-25' })
  })
})
it('excluye cierres del total abierto y separa el gráfico de cada proceso y las monedas', () => {
  const pipelines: { id: string; stages: { id: string; outcome: 'open' | 'won' | 'lost' }[] }[] = [{ id: 'a', stages: [{ id: 'open', outcome: 'open' }, { id: 'won', outcome: 'won' }] }, { id: 'b', stages: [{ id: 'other', outcome: 'open' }, { id: 'lost', outcome: 'lost' }] }]
  const deals = [{ pipelineId: 'a', stageId: 'open', currency: 'USD', value: '100' }, { pipelineId: 'a', stageId: 'won', currency: 'USD', value: '900' }, { pipelineId: 'b', stageId: 'other', currency: 'UYU', value: '4000' }, { pipelineId: 'b', stageId: 'lost', currency: 'USD', value: '800' }]
  expect(commercialSummary(deals, pipelines)).toEqual({ openCount: 2, usdPipeline: 100 })
  expect(pipelineSummary(deals, pipelines[1]).count).toBe(2)
  expect(pipelineSummary(deals, pipelines[1]).stages.map(s => s.count)).toEqual([1, 1])
})

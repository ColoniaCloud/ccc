import { beforeAll, beforeEach, afterAll, describe, expect, it, vi } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { eq, sql } from 'drizzle-orm'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import * as schema from '../../db/schema'
import type { TenantTx } from '../../db/tenant-db'
import { AgentService } from '../service'
import type { AgentAssistant } from '../provider'
import { aiPeriod } from '../../onboarding/ai-quota'

const A = '11111111-1111-1111-1111-111111111111', B = '22222222-2222-2222-2222-222222222222'
const OWNER = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', SELLER = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', SUPPORT = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3', OTHER = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1'
const config = { name: 'Seguimiento', instructions: 'Sé breve', staleDays: 5, pipelineId: null, status: 'active' }
const reply = { text: 'Revisé las oportunidades. Aprobá las tareas desde Propuestas.', inputTokens: 120, outputTokens: 30 }
let client: PGlite, database: ReturnType<typeof drizzle<typeof schema>>, service: AgentService
let provider: AgentAssistant & { generate: ReturnType<typeof vi.fn<AgentAssistant['generate']>> }, transactions = 0
let dealId: string, closedStage: string, pipelineId: string
async function scoped<T>(tenantId: string, run: (tx: TenantTx) => Promise<T>): Promise<T> {
  return database.transaction(async tx => {
    transactions++
    try { await tx.execute(sql`SET LOCAL ROLE plata_app`); await tx.execute(sql`SELECT set_config('app.tenant_id', ${tenantId}, true)`); return await run(tx as unknown as TenantTx) }
    finally { transactions-- }
  })
}
beforeAll(async () => {
  client = new PGlite(); database = drizzle(client, { schema }); await client.exec('CREATE ROLE plata_app;')
  const folder = path.resolve('src/db/migrations'), journal = JSON.parse(readFileSync(path.join(folder, 'meta/_journal.json'), 'utf8')) as { entries: { tag: string }[] }
  for (const { tag } of journal.entries) await client.exec(readFileSync(path.join(folder, `${tag}.sql`), 'utf8'))
  await client.exec('GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO plata_app;')
}, 30000)
beforeEach(async () => {
  await client.exec(`TRUNCATE tenants,"user" CASCADE; BEGIN;
    INSERT INTO "user" (id,name,email,email_verified,created_at,updated_at) VALUES ('owner','Ana','ana@example.com',true,now(),now()),('seller','Luis','luis@example.com',true,now(),now()),('support','Support','support@example.com',true,now(),now()),('other','Otro','other@example.com',true,now(),now());
    INSERT INTO tenants (id,name,slug,plan) VALUES ('${A}','Empresa','empresa','pro'),('${B}','Otra','otra','pro');
    INSERT INTO members (id,user_id,tenant_id,role) VALUES ('${OWNER}','owner','${A}','owner'),('${SELLER}','seller','${A}','seller'),('${SUPPORT}','support','${A}','support'),('${OTHER}','other','${B}','owner'); COMMIT;`)
  const [pipeline] = await database.insert(schema.pipelines).values({ tenantId: A, name: 'Ventas' }).returning(); pipelineId = pipeline!.id
  const stages = await database.insert(schema.pipelineStages).values([{ pipelineId, name: 'Abierta', outcome: 'open' }, { pipelineId, name: 'Ganada', outcome: 'won' }]).returning(); closedStage = stages[1]!.id
  const [contact] = await database.insert(schema.contacts).values({ tenantId: A, name: 'Persona privada', email: 'private@example.com', phone: '123456' }).returning()
  const [deal] = await database.insert(schema.deals).values({ tenantId: A, pipelineId, stageId: stages[0]!.id, title: 'Visita al Centro', contactId: contact!.id, assignedTo: SELLER, updatedAt: new Date(Date.now() - 10 * 86400000) }).returning(); dealId = deal!.id
  provider = { configured: true, generate: vi.fn(async () => { expect(transactions).toBe(0); return reply }) }; service = new AgentService(scoped, provider)
})
afterAll(async () => { await client.close() })
async function active() { const a = await service.save(A, OWNER, config); expect(a.status).toBe('paused'); return service.save(A, OWNER, config, a.id) }
async function proposed() { const a = await active(); await service.execute(A, OWNER, a.id, 'run'); return { agent: a, proposal: (await service.detail(A, OWNER, a.id)).proposals[0]! } }

describe('Agentes: datos reales aislados en PostgreSQL de prueba', () => {
  it('propone sin escribir tareas y aprueba una sola vez incluso con dos solicitudes', async () => {
    const { agent, proposal } = await proposed()
    expect(proposal.status).toBe('pending'); expect(await database.select().from(schema.tasks)).toHaveLength(0)
    const results = await Promise.all([service.decide(A, OWNER, agent.id, proposal.id, 'approve'), service.decide(A, OWNER, agent.id, proposal.id, 'approve')])
    expect(results[0]!.taskId).toBe(results[1]!.taskId)
    const tasks = await database.select().from(schema.tasks)
    expect(tasks).toHaveLength(1); expect(tasks[0]).toMatchObject({ dealId, assignedTo: SELLER, tenantId: A })
    expect(tasks[0]!.dueOn).toBeTruthy()
  })
  it('no repite propuestas pendientes al volver a ejecutar', async () => {
    const { agent } = await proposed(); await service.execute(A, OWNER, agent.id, 'run')
    expect((await service.detail(A, OWNER, agent.id)).proposals).toHaveLength(1)
  })
  it('descarta la aprobación si la oportunidad se cerró después de la propuesta', async () => {
    const { agent, proposal } = await proposed()
    await database.update(schema.deals).set({ stageId: closedStage }).where(eq(schema.deals.id, dealId))
    expect((await service.decide(A, OWNER, agent.id, proposal.id, 'approve'))!.status).toBe('stale')
    expect(await database.select().from(schema.tasks)).toHaveLength(0)
  })
  it('no crea una tarea si ya se agregó un seguimiento manual', async () => {
    const { agent, proposal } = await proposed()
    await database.insert(schema.tasks).values({ tenantId: A, dealId, title: 'Llamar manualmente' })
    expect((await service.decide(A, OWNER, agent.id, proposal.id, 'approve'))!.status).toBe('stale')
    expect(await database.select().from(schema.tasks)).toHaveLength(1)
  })
  it('considera notas recientes y tareas completadas como actividad', async () => {
    const a = await active(), [deal] = await database.select().from(schema.deals)
    await database.insert(schema.contactActivities).values({ tenantId: A, contactId: deal!.contactId!, type: 'note', content: 'Hablamos hoy' })
    await service.execute(A, OWNER, a.id, 'run')
    expect((await service.detail(A, OWNER, a.id)).proposals).toHaveLength(0)
    await database.delete(schema.contactActivities)
    await database.insert(schema.tasks).values({ tenantId: A, dealId, title: 'Llamada realizada', done: true })
    await service.execute(A, OWNER, a.id, 'run')
    expect((await service.detail(A, OWNER, a.id)).proposals).toHaveLength(0)
  })
  it('chat usa contexto acotado y no crea propuestas ni tareas', async () => {
    const a = await active(); await service.execute(A, SELLER, a.id, 'chat', 'Redactá un seguimiento')
    const detail = await service.detail(A, OWNER, a.id)
    expect(detail.proposals).toHaveLength(0); expect(detail.jobs[0]!.response).toBe(reply.text)
    expect(JSON.stringify(provider.generate.mock.calls)).not.toContain('private@example.com')
    expect(await database.select().from(schema.tasks)).toHaveLength(0)
  })
  it('respeta permisos para configurar, ejecutar y aprobar', async () => {
    await expect(service.save(A, SELLER, config)).rejects.toMatchObject({ status: 403 })
    const { agent, proposal } = await proposed()
    await expect(service.execute(A, SUPPORT, agent.id, 'run')).rejects.toMatchObject({ status: 403 })
    await expect(service.decide(A, SELLER, agent.id, proposal.id, 'approve')).rejects.toMatchObject({ status: 403 })
    expect((await service.detail(A, SUPPORT, agent.id)).jobs).toHaveLength(1)
  })
  it('aísla agentes, historial y propuestas por tenant con RLS y claves compuestas', async () => {
    const { agent, proposal } = await proposed()
    await expect(service.detail(B, OTHER, agent.id)).rejects.toMatchObject({ status: 404 })
    await expect(service.decide(B, OTHER, agent.id, proposal.id, 'approve')).rejects.toMatchObject({ status: 404 })
    expect(await scoped(B, tx => tx.select().from(schema.agents))).toHaveLength(0)
    expect(await scoped(B, tx => tx.select().from(schema.agentJobs))).toHaveLength(0)
    expect(await scoped(B, tx => tx.select().from(schema.agentProposals))).toHaveLength(0)
    await expect(scoped(B, tx => tx.insert(schema.agentJobs).values({ id: randomUUID(), tenantId: B, agentId: agent.id, memberId: OTHER, kind: 'run', period: aiPeriod().period }))).rejects.toThrow()
  })
  it('limita cupos y bloquea agentes excedentes al bajar de plan', async () => {
    await database.update(schema.tenants).set({ plan: 'business' }).where(eq(schema.tenants.id, A))
    const a = await active(), b = await service.save(A, OWNER, config)
    await database.update(schema.tenants).set({ plan: 'pro' }).where(eq(schema.tenants.id, A))
    await expect(service.save(A, OWNER, config)).rejects.toMatchObject({ status: 403 })
    const view = await service.list(A, OWNER), locked = view.items.find(i => i.locked)!
    await expect(service.execute(A, OWNER, locked.id, 'run')).rejects.toMatchObject({ status: 403 })
    await service.archive(A, OWNER, a.id)
    expect((await service.list(A, OWNER)).items.find(i => i.id === b.id)?.locked).toBe(false)
  })
  it('reserva cuota separada, limita a 40 consultas Pro y conserva fallos', async () => {
    const a = await active()
    await database.insert(schema.agentJobs).values(Array.from({ length: 39 }, () => ({ id: randomUUID(), tenantId: A, agentId: a.id, memberId: OWNER, kind: 'chat' as const, period: aiPeriod().period, status: 'failed' as const })))
    provider.generate.mockRejectedValue(new Error('Proveedor no disponible'))
    await expect(service.execute(A, OWNER, a.id, 'chat', 'Hola')).rejects.toMatchObject({ status: 502 })
    await expect(service.execute(A, OWNER, a.id, 'run')).rejects.toMatchObject({ status: 429 })
    expect((await service.list(A, OWNER)).quota.used).toBe(40)
    expect(await database.select().from(schema.aiRequests)).toHaveLength(0)
  })
  it('excluye consumo de meses anteriores y permite leer y aprobar sin crédito', async () => {
    const { agent, proposal } = await proposed()
    await database.update(schema.agentJobs).set({ period: '2020-01-01' })
    expect((await service.list(A, OWNER)).quota.used).toBe(0)
    await database.insert(schema.agentJobs).values(Array.from({ length: 40 }, () => ({ id: randomUUID(), tenantId: A, agentId: agent.id, memberId: OWNER, kind: 'chat' as const, period: aiPeriod().period, status: 'failed' as const })))
    expect((await service.decide(A, OWNER, agent.id, proposal.id, 'approve'))!.status).toBe('approved')
  })
  it('bloquea llamadas simultáneas sin retener una transacción durante la IA', async () => {
    const a = await active(); let resolve!: (value: typeof reply) => void, started!: () => void
    const signal = new Promise<void>(r => { started = r })
    provider.generate.mockImplementation(() => { expect(transactions).toBe(0); started(); return new Promise(r => { resolve = r }) })
    const first = service.execute(A, OWNER, a.id, 'run'); await signal
    await expect(service.execute(A, OWNER, a.id, 'chat', 'Hola')).rejects.toMatchObject({ status: 409 })
    await expect(service.save(A, OWNER, config, a.id)).rejects.toMatchObject({ status: 409 })
    resolve(reply); await first
    expect((await service.list(A, OWNER)).quota.used).toBe(1)
  })
  it('revalida membresía cuando vuelve la IA y conserva consumo', async () => {
    const a = await active()
    provider.generate.mockImplementation(async () => { await database.update(schema.members).set({ role: 'support' }).where(eq(schema.members.id, SELLER)); return reply })
    await expect(service.execute(A, SELLER, a.id, 'run')).rejects.toMatchObject({ status: 403 })
    const view = await service.detail(A, OWNER, a.id)
    expect(view.proposals).toHaveLength(0); expect(view.jobs[0]).toMatchObject({ status: 'failed', inputTokens: 120 })
  })
  it('recupera ejecuciones interrumpidas y Free solo puede ver la demo', async () => {
    const a = await active()
    await database.insert(schema.agentJobs).values({ id: randomUUID(), tenantId: A, agentId: a.id, memberId: OWNER, kind: 'run', period: aiPeriod().period, createdAt: new Date(Date.now() - 180000) })
    await service.execute(A, OWNER, a.id, 'run')
    expect((await service.detail(A, OWNER, a.id)).jobs.map(j => j.status).sort()).toEqual(['failed','succeeded'])
    await database.update(schema.tenants).set({ plan: 'free' }).where(eq(schema.tenants.id, A))
    await expect(service.execute(A, OWNER, a.id, 'run')).rejects.toMatchObject({ status: 403 })
    await expect(service.save(A, OWNER, config)).rejects.toMatchObject({ status: 403 })
  })
})

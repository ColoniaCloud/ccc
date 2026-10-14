import { beforeAll, beforeEach, afterAll, describe, expect, it, vi } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { eq, sql } from 'drizzle-orm'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import type { BusinessProfile, SetupProposal } from '@crm/shared'
import * as schema from '../../db/schema'
import type { TenantTx } from '../../db/tenant-db'
import { OnboardingAssistantService, type TenantRunner } from '../assistant-service'
import { validateProposal, validateRevision, MAX_SETUP_ATTEMPTS } from '../assistant-policy'
import type { SetupAssistant } from '../anthropic'

const A = '11111111-1111-1111-1111-111111111111', B = '22222222-2222-2222-2222-222222222222'
const OWNER = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', ADMIN = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', SELLER = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3', OTHER = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1'
const profile: BusinessProfile = { version: 1, industry: 'real_estate', industryOther: null, country: 'UY', teamSize: '2-5', offering: 'Vendemos y alquilamos propiedades en Colonia.', salesChannels: ['whatsapp','instagram'], averageTicket: null, salesCycle: 'weeks', mainGoal: 'follow_up' }
const proposal: SetupProposal = { summary: 'Inmobiliaria en Colonia con procesos de venta y alquiler.', presets: ['real_estate_sale','real_estate_rent'], recommendations: ['Cargar la cartera inicial'], connections: [{ tool: 'WhatsApp', purpose: 'Seguimiento de interesados' }] }
const reply = { turn: { reply: 'Preparé una propuesta para revisar.', proposal }, inputTokens: 500, outputTokens: 120 }
let client: PGlite, database: ReturnType<typeof drizzle<typeof schema>>, service: OnboardingAssistantService
let provider: SetupAssistant & { generate: ReturnType<typeof vi.fn<SetupAssistant['generate']>> }, activeTransactions = 0
const scoped: TenantRunner = async (tenantId, run) => database.transaction(async (tx) => {
  activeTransactions++
  try { await tx.execute(sql`SET LOCAL ROLE plata_app`); await tx.execute(sql`SELECT set_config('app.tenant_id', ${tenantId}, true)`); return await run(tx as unknown as TenantTx) }
  finally { activeTransactions-- }
})
beforeAll(async () => {
  client = new PGlite(); database = drizzle(client, { schema }); await client.exec('CREATE ROLE plata_app;')
  const folder = path.resolve('src/db/migrations'), journal = JSON.parse(readFileSync(path.join(folder,'meta/_journal.json'),'utf8')) as { entries: { tag: string }[] }
  for (const { tag } of journal.entries) await client.exec(readFileSync(path.join(folder,`${tag}.sql`),'utf8'))
  await client.exec('GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO plata_app;')
}, 30000)
beforeEach(async () => {
  await client.exec(`TRUNCATE tenants,"user" CASCADE; BEGIN;
    INSERT INTO "user" (id,name,email,email_verified,created_at,updated_at) VALUES ('owner','Ana','ana@example.com',true,now(),now()),('admin','Admin','admin@example.com',true,now(),now()),('seller','Luis','luis@example.com',true,now(),now()),('other','Bruno','bruno@example.com',true,now(),now());
    INSERT INTO tenants (id,name,slug,setup_required) VALUES ('${A}','Inmobiliaria','inmobiliaria',true),('${B}','Otro negocio','otro',false);
    INSERT INTO members (id,user_id,tenant_id,role) VALUES ('${OWNER}','owner','${A}','owner'),('${ADMIN}','admin','${A}','admin'),('${SELLER}','seller','${A}','seller'),('${OTHER}','other','${B}','owner'); COMMIT;`)
  await database.update(schema.tenants).set({ businessProfile: profile }).where(eq(schema.tenants.id,A))
  await database.update(schema.tenants).set({ businessProfile: { ...profile, industry: 'automotive' } }).where(eq(schema.tenants.id,B))
  provider = { configured: true, generate: vi.fn(async () => structuredClone(reply)) }; service = new OnboardingAssistantService(scoped, provider)
})
afterAll(async () => { await client.close() })
async function ready() { return service.message(A,OWNER,'Quiero configurar venta y alquiler.',0) }
function delayed() {
  let resolve!: (value: typeof reply) => void, started!: () => void
  const waiting = new Promise<typeof reply>((done) => { resolve = done }), signal = new Promise<void>((done) => { started = done })
  provider.generate.mockImplementation(async () => { expect(activeTransactions).toBe(0); started(); return waiting })
  return { resolve, signal }
}
describe('onboarding con aprobación y conversación guardada', () => {
  it('leer no crea una sesión ni usa IA y conserva organizaciones antiguas sin forzar onboarding', async () => {
    const view = await service.get(A,OWNER)
    expect(view.session).toBeNull(); expect(view.required).toBe(true); expect((await service.get(B,OTHER)).required).toBe(false)
    expect(provider.generate).not.toHaveBeenCalled()
  })
  it('pregunta usando el perfil y guarda el turno sin aplicar configuraciones', async () => {
    provider.generate.mockResolvedValue({ ...reply, turn: { reply: '¿Cómo hacen el seguimiento de interesados?', proposal: null } })
    const view = await ready()
    expect(view.session?.status).toBe('in_progress'); expect(view.session?.messages).toHaveLength(2)
    expect(provider.generate.mock.calls[0]![0].profile.offering).toBe(profile.offering)
    expect((await service.get(A,OWNER)).session?.messages).toEqual(view.session?.messages)
    expect(await database.select().from(schema.pipelines)).toHaveLength(0)
  })
  it('edita, revisa y aplica ambas plantillas atómicamente, reutilizando los campos compartidos', async () => {
    let view = await ready()
    view = await service.edit(A,OWNER,{ ...proposal, summary: 'Resumen editado por el cliente' },view.session!.revision)
    const approval = await service.preview(A,OWNER,view.session!.revision)
    expect(approval.previews).toHaveLength(2)
    const complete = await service.apply(A,OWNER,view.session!.revision,approval.fingerprint)
    expect(complete.session?.status).toBe('completed'); expect(complete.required).toBe(false)
    expect(complete.session?.proposal?.summary).toBe('Resumen editado por el cliente')
    expect(complete.session?.proposal?.connections).toEqual(proposal.connections)
    expect(await database.select().from(schema.pipelines)).toHaveLength(2)
    expect(await database.select().from(schema.customFieldDefinitions)).toHaveLength(6)
    expect((await service.apply(A,OWNER,view.session!.revision,approval.fingerprint)).session?.status).toBe('completed')
    expect(await database.select().from(schema.tenantPresets)).toHaveLength(2)
    expect((await database.select().from(schema.pilotActivityDaily))[0]?.actions).toBe(1)
    expect((await database.select().from(schema.pilotMilestones)).map(m => m.key)).toContain('onboarding_completed')
  })
  it('bloquea revisiones viejas y configuración modificada después de revisar', async () => {
    const view = await ready(), approval = await service.preview(A,OWNER,view.session!.revision)
    await expect(service.edit(A,OWNER,proposal,0)).rejects.toMatchObject({ status: 409 })
    await database.insert(schema.customFieldDefinitions).values({ tenantId:A, entityType:'contact', key:'manual', label:'Manual', fieldType:'text' })
    await expect(service.apply(A,OWNER,view.session!.revision,approval.fingerprint)).rejects.toMatchObject({ status:409 })
    expect(await database.select().from(schema.pipelines)).toHaveLength(0)
    expect((await service.get(A,OWNER)).required).toBe(true)
  })
  it('un conflicto en el segundo proceso impide aplicar el primero', async () => {
    await database.insert(schema.pipelines).values({ tenantId:A, name:'Alquiler de propiedades' })
    const view = await ready(), approval = await service.preview(A,OWNER,view.session!.revision)
    expect(approval.conflicts).toHaveLength(1)
    await expect(service.apply(A,OWNER,view.session!.revision,approval.fingerprint)).rejects.toMatchObject({ status:409 })
    expect(await database.select().from(schema.tenantModules)).toHaveLength(0)
    expect(await database.select().from(schema.tenantPresets)).toHaveLength(0)
  })
  it('un error a mitad de la aplicación revierte todos los procesos y el cierre del onboarding', async () => {
    const view = await ready(), approval = await service.preview(A,OWNER,view.session!.revision)
    await client.exec("ALTER TABLE pipeline_stages ADD CONSTRAINT setup_failure CHECK(name<>'Documentación');")
    try {
      await expect(service.apply(A,OWNER,view.session!.revision,approval.fingerprint)).rejects.toThrow()
      expect(await database.select().from(schema.pipelines)).toHaveLength(0)
      expect(await database.select().from(schema.customFieldDefinitions)).toHaveLength(0)
      expect((await service.get(A,OWNER)).session?.status).toBe('ready')
    } finally { await client.exec('ALTER TABLE pipeline_stages DROP CONSTRAINT setup_failure;') }
  })
  it('deja para después y retoma sin perder conversación ni propuesta', async () => {
    const view = await ready(); await service.defer(A,OWNER)
    expect((await service.get(A,OWNER)).required).toBe(false)
    const resumed = await service.resume(A,OWNER)
    expect(resumed.session?.status).toBe('ready'); expect(resumed.session?.messages).toEqual(view.session?.messages)
  })
  it('seller y miembros de otra organización no pueden generar, editar o aplicar', async () => {
    const view = await ready()
    for (const actor of [SELLER,OTHER]) {
      await expect(service.message(A,actor,'Consulta',view.session!.revision)).rejects.toMatchObject({ status:403 })
      await expect(service.edit(A,actor,proposal,view.session!.revision)).rejects.toMatchObject({ status:403 })
      await expect(service.preview(A,actor,view.session!.revision)).rejects.toMatchObject({ status:403 })
      await expect(service.defer(A,actor)).rejects.toMatchObject({ status:403 })
    }
    expect(provider.generate).toHaveBeenCalledTimes(1)
    expect((await service.get(B,OTHER)).session).toBeNull()
    await expect(service.get(A,OTHER)).rejects.toMatchObject({ status:403 })
  })
  it('RLS no permite leer una sesión ajena ni insertar con otro tenant', async () => {
    await ready()
    expect(await scoped(B,(tx)=>tx.select().from(schema.onboardingSessions))).toHaveLength(0)
    await expect(scoped(B,(tx)=>tx.insert(schema.onboardingSessions).values({tenantId:A}))).rejects.toThrow()
  })
  it('la falta de clave y un fallo de IA no cambian configuración ni revelan errores del proveedor', async () => {
    provider.configured = false
    await expect(ready()).rejects.toMatchObject({ status:503 }); expect(provider.generate).not.toHaveBeenCalled()
    provider.configured = true; provider.generate.mockRejectedValue(new Error('private upstream secret'))
    await expect(ready()).rejects.toMatchObject({ status:502 })
    const view = await service.get(A,OWNER)
    expect(view.session?.messages).toEqual([]); expect(view.session?.busy).toBe(false)
    expect(await database.select().from(schema.tenantModules)).toHaveLength(0)
  })
  it('una refinación fallida conserva la propuesta anterior editable', async () => {
    const view = await ready(); provider.generate.mockRejectedValue(new Error('timeout'))
    await expect(service.message(A,OWNER,'Refinar',view.session!.revision)).rejects.toMatchObject({status:502})
    const after = await service.get(A,OWNER)
    expect(after.session?.status).toBe('ready'); expect(after.session?.proposal).toEqual(proposal)
    await service.edit(A,OWNER,proposal,after.session!.revision)
  })
  it('no sostiene una transacción durante IA y rechaza una segunda generación concurrente', async () => {
    const delayedResponse = delayed(), pending = service.message(A,OWNER,'Empezar',0)
    await delayedResponse.signal
    const view = await service.get(A,OWNER)
    expect(view.session?.busy).toBe(true)
    await expect(service.message(A,OWNER,'Duplicada',view.session!.revision)).rejects.toMatchObject({status:409})
    expect(provider.generate).toHaveBeenCalledTimes(1)
    delayedResponse.resolve(reply); expect((await pending).session?.status).toBe('ready')
  })
  it('una respuesta tardía no sobrescribe una preparación pospuesta', async () => {
    const response = delayed(), pending = service.message(A,OWNER,'Empezar',0)
    const rejection = expect(pending).rejects.toMatchObject({status:409})
    await response.signal; await service.defer(A,OWNER); response.resolve(reply); await rejection
    expect((await service.get(A,OWNER)).session?.status).toBe('deferred')
    expect((await service.get(A,OWNER)).session?.messages).toHaveLength(0)
  })
  it('revalida rol y datos del negocio después de responder la IA', async () => {
    const response = delayed(), pending = service.message(A,ADMIN,'Empezar',0)
    const rejection = expect(pending).rejects.toMatchObject({status:403})
    await response.signal; await database.update(schema.members).set({role:'seller'}).where(eq(schema.members.id,ADMIN)); response.resolve(reply); await rejection
    expect((await service.get(A,OWNER)).session?.busy).toBe(false)
    const response2=delayed(), pending2=service.message(A,OWNER,'Empezar', (await service.get(A,OWNER)).session!.revision)
    const rejection2=expect(pending2).rejects.toMatchObject({status:409})
    await response2.signal; await database.update(schema.tenants).set({businessProfile:{...profile,offering:'Otro negocio y otra operación'}}).where(eq(schema.tenants.id,A)); response2.resolve(reply); await rejection2
    expect((await service.get(A,OWNER)).session?.messages).toHaveLength(0)
  })
  it('limita consumo y permite recuperar un pedido que quedó abandonado', async () => {
    await database.insert(schema.onboardingSessions).values({tenantId:A, attempts:MAX_SETUP_ATTEMPTS})
    await expect(service.message(A,OWNER,'Consultar',1)).rejects.toMatchObject({status:429})
    await database.update(schema.onboardingSessions).set({attempts:0,pendingRequestId:OTHER,requestStartedAt:new Date(Date.now()-180000)}).where(eq(schema.onboardingSessions.tenantId,A))
    expect((await service.message(A,OWNER,'Recuperar',1)).session?.status).toBe('ready')
  })
  it('rechaza propuestas ajenas al nicho y normaliza sin aceptar instrucciones de ejecución', () => {
    for(const presets of [['automotive_sales'],['__proto__'],[],['real_estate_sale','real_estate_sale']]) expect(()=>validateProposal({...proposal,presets},profile)).toThrow()
    expect(()=>validateProposal({...proposal,connections:[{tool:'x',purpose:''}]},profile)).toThrow()
    expect(()=>validateProposal({...proposal,recommendations:Array(6).fill('Acción')},profile)).toThrow()
    expect(validateProposal({...proposal,execute:'DELETE ALL',connections:[{tool:'WhatsApp',purpose:'Contactar',connected:true}]},profile)).toEqual({...proposal,connections:[{tool:'WhatsApp',purpose:'Contactar'}]})
    for(const revision of [-1,1.5,'1',null,NaN]) expect(()=>validateRevision(revision)).toThrow()
  })
})

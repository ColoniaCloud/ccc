import { and, eq, sql } from 'drizzle-orm'
import { HTTPException } from 'hono/http-exception'
import type { TenantTx } from '../db/tenant-db'
import { aiMonthlyUsage, aiRequests, tenants } from '../db/schema'
import { localToday } from '../agenda/service'
export const DEFAULT_AI_LIMITS = { free:10, pro:40, business:100, master:250, enterprise:500 } as const
export function aiLimit(plan: string) {
  if (!Object.hasOwn(DEFAULT_AI_LIMITS,plan)) return 0
  const value = process.env[`AI_MONTHLY_LIMIT_${plan.toUpperCase()}`]
  if (value === undefined) return DEFAULT_AI_LIMITS[plan as keyof typeof DEFAULT_AI_LIMITS]
  if (!/^\d{1,6}$/.test(value) || Number(value) > 100000) throw new Error('Invalid AI quota configuration')
  return Number(value)
}
export function aiPeriod(now = new Date()) {
  const period = `${localToday(now).slice(0,7)}-01`, [year,month] = period.split('-').map(Number)
  return { period, resetsOn: new Date(Date.UTC(year!,month!,1,12)).toISOString().slice(0,10), timeZone:'America/Montevideo' as const }
}
export async function quotaSnapshot(tx: TenantTx, tenantId: string, now = new Date()) {
  const tenant = await tx.query.tenants.findFirst({where:eq(tenants.id,tenantId)}), clock = aiPeriod(now), limit = aiLimit(tenant?.plan ?? '')
  const usage = await tx.query.aiMonthlyUsage.findFirst({where:and(eq(aiMonthlyUsage.tenantId,tenantId),eq(aiMonthlyUsage.period,clock.period))})
  return {...clock,plan:tenant?.plan ?? 'unknown',limit,used:usage?.used ?? 0,remaining:Math.max(0,limit-(usage?.used ?? 0)),inputTokens:usage?.inputTokens ?? 0,outputTokens:usage?.outputTokens ?? 0}
}
export async function reserveAi(tx: TenantTx, tenantId: string, id: string, now = new Date()) {
  await tx.select({id:tenants.id}).from(tenants).where(eq(tenants.id,tenantId)).for('update')
  const quota = await quotaSnapshot(tx,tenantId,now)
  if (!quota.remaining) throw new HTTPException(429,{message:`Alcanzaste las ${quota.limit} consultas de IA del mes. La cuota se renueva el ${quota.resetsOn} en hora de Uruguay. Podés editar y aplicar propuestas manualmente.`})
  await tx.insert(aiMonthlyUsage).values({tenantId,period:quota.period,used:1}).onConflictDoUpdate({target:[aiMonthlyUsage.tenantId,aiMonthlyUsage.period],set:{used:sql`${aiMonthlyUsage.used} + 1`}})
  await tx.insert(aiRequests).values({id,tenantId,period:quota.period,plan:quota.plan,limit:quota.limit,createdAt:now})
}
export async function finishAi(tx: TenantTx, tenantId: string, id: string, tokens?: {inputTokens:number;outputTokens:number}, now = new Date()) {
  if (tokens && (![tokens.inputTokens,tokens.outputTokens].every(value=>Number.isSafeInteger(value)&&value>=0&&value<=10000000))) throw new Error('Invalid token usage')
  const [request] = await tx.update(aiRequests).set({status:tokens?'succeeded':'failed',finishedAt:now,inputTokens:tokens?.inputTokens ?? null,outputTokens:tokens?.outputTokens ?? null}).where(and(eq(aiRequests.tenantId,tenantId),eq(aiRequests.id,id),eq(aiRequests.status,'reserved'))).returning({period:aiRequests.period})
  if (request && tokens) await tx.update(aiMonthlyUsage).set({inputTokens:sql`${aiMonthlyUsage.inputTokens} + ${tokens.inputTokens}`,outputTokens:sql`${aiMonthlyUsage.outputTokens} + ${tokens.outputTokens}`}).where(and(eq(aiMonthlyUsage.tenantId,tenantId),eq(aiMonthlyUsage.period,request.period)))
}

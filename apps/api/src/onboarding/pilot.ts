import { and, asc, eq, gte, sql } from 'drizzle-orm'
import type { TenantTx } from '../db/tenant-db'
import { tenants, onboardingSessions, pilotMeasurements, pilotMilestones, pilotActivityDaily, type PilotMilestoneKey } from '../db/schema'
import { activation } from './activation'
import { localToday } from '../agenda/service'
import { quotaSnapshot } from './ai-quota'

const LABELS: Record<PilotMilestoneKey, string> = { configuration: 'CRM preparado', inventory: 'Primera ficha', contact: 'Primer contacto', opportunity: 'Primera oportunidad vinculada', follow_up: 'Primer seguimiento', activation_ready: 'Recorrido de activación completo', onboarding_completed: 'Onboarding aprobado' }
async function capture(tx: TenantTx, tenantId: string, memberId: string, source: 'baseline' | 'activity', now: Date) {
  const view = await activation(tx, tenantId, memberId, now)
  const measurement = await tx.query.pilotMeasurements.findFirst({ where: eq(pilotMeasurements.tenantId, tenantId) })
  if (!view.supported || !measurement || measurement.industry !== view.industry) return
  const keys = view.steps.filter(step => step.complete).map(step => step.key as PilotMilestoneKey)
  if (view.ready) keys.push('activation_ready')
  const session = await tx.query.onboardingSessions.findFirst({ where: eq(onboardingSessions.tenantId, tenantId) })
  if (session?.status === 'completed') keys.push('onboarding_completed')
  if (keys.length) await tx.insert(pilotMilestones).values(keys.map(key => ({ tenantId, key, source, observedAt: now }))).onConflictDoNothing()
}
export async function startPilot(tx: TenantTx, tenantId: string, memberId: string, now = new Date()) {
  // Orden común de locks: organización, medición, registros comerciales.
  const [tenant] = await tx.select().from(tenants).where(eq(tenants.id, tenantId)).for('update')
  const industry = tenant?.businessProfile?.industry
  if (industry !== 'real_estate' && industry !== 'automotive') return false
  const inserted = await tx.insert(pilotMeasurements).values({ tenantId, industry, startedAt: now }).onConflictDoNothing().returning()
  if (inserted.length) await capture(tx, tenantId, memberId, 'baseline', now)
  return true
}
export async function recordPilotActivity(tx: TenantTx, tenantId: string, memberId: string, now = new Date()) {
  const measurement = await tx.query.pilotMeasurements.findFirst({ where: eq(pilotMeasurements.tenantId, tenantId) })
  const tenant = await tx.query.tenants.findFirst({ where: eq(tenants.id, tenantId) })
  if (!measurement || measurement.industry !== tenant?.businessProfile?.industry) return
  await capture(tx, tenantId, memberId, 'activity', now)
  await tx.insert(pilotActivityDaily).values({ tenantId, day: localToday(now), actions: 1, lastActivityAt: now })
    .onConflictDoUpdate({ target: [pilotActivityDaily.tenantId, pilotActivityDaily.day], set: { actions: sql`${pilotActivityDaily.actions} + 1`, lastActivityAt: now } })
}
export function pilotWeeks(now = new Date()) {
  const date = new Date(`${localToday(now)}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 6) % 7)
  return Array.from({ length: 4 }, (_, index) => {
    const start = new Date(date); start.setUTCDate(start.getUTCDate() - (3 - index) * 7)
    const end = new Date(start); end.setUTCDate(end.getUTCDate() + 6)
    return { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) }
  })
}
export async function pilotReport(tx: TenantTx, tenantId: string, now = new Date()) {
  const tenant = await tx.query.tenants.findFirst({ where: eq(tenants.id, tenantId) })
  const industry = tenant?.businessProfile?.industry
  if (industry !== 'real_estate' && industry !== 'automotive') return { supported: false as const }
  const measurement = await tx.query.pilotMeasurements.findFirst({ where: eq(pilotMeasurements.tenantId, tenantId) })
  const milestones = await tx.query.pilotMilestones.findMany({ where: eq(pilotMilestones.tenantId, tenantId), orderBy: asc(pilotMilestones.observedAt) })
  const periods = pilotWeeks(now)
  const days = await tx.query.pilotActivityDaily.findMany({ where: and(eq(pilotActivityDaily.tenantId, tenantId), gte(pilotActivityDaily.day, periods[0]!.from)), orderBy: asc(pilotActivityDaily.day) })
  const first = milestones.find(item => item.key === 'activation_ready')
  return { supported: true as const, startedAt: measurement?.startedAt ?? null, industry: measurement?.industry ?? industry,
    currentIndustryMatches: !measurement || measurement.industry === industry,
    secondsToActivation: first?.source === 'activity' && measurement ? Math.max(0, Math.floor((first.observedAt.getTime() - measurement.startedAt.getTime()) / 1000)) : null,
    milestones: milestones.map(item => ({ key: item.key, label: LABELS[item.key], source: item.source, observedAt: item.observedAt })),
    weeks: periods.map(period => { const rows = days.filter(day => day.day >= period.from && day.day <= period.to); return { ...period, activeDays: rows.length, actions: rows.reduce((sum, row) => sum + row.actions, 0) } }),
  }
}

export async function pilotEvidence(tx: TenantTx, tenantId: string, now = new Date()) {
  const report = await pilotReport(tx, tenantId, now)
  if (!report.supported) return null
  return { version: 1, generatedAt: now.toISOString(), timeZone: 'America/Montevideo',
    measurement: report, ai: await quotaSnapshot(tx, tenantId, now),
    notes: ['Los hitos baseline ya existían al comenzar y no prueban una conversión durante el piloto.',
      'La actividad muestra las últimas cuatro semanas calendario; no representa ventas ni ingresos.',
      'La IA corresponde al mes calendario indicado, no a todo el piloto. La contabilidad comenzó con el despliegue de cuotas.',
      'Los tokens son los conocidos; las solicitudes fallidas pueden tener consumo desconocido. No es una factura.'] }
}

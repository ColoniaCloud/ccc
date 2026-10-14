import { and, eq, isNotNull, sql } from 'drizzle-orm'
import { appointmentIsPast } from '@crm/shared'
import type { TenantTx } from '../db/tenant-db'
import { tenants, tenantModules, pipelines, contacts, properties, vehicles, deals, pipelineStages, calendarConnections, calendarEventSync } from '../db/schema'
import { agenda } from '../agenda/service'

export async function activation(tx: TenantTx, tenantId: string, memberId: string, now = new Date()) {
  const tenant = await tx.query.tenants.findFirst({ where: eq(tenants.id, tenantId) })
  const industry = tenant?.businessProfile?.industry
  if (industry !== 'real_estate' && industry !== 'automotive') return { supported: false as const }
  const kind = industry === 'real_estate' ? 'properties' : 'vehicles', stock = kind === 'properties' ? properties : vehicles
  const catalogEnabled = Boolean(await tx.query.tenantModules.findFirst({ where: and(eq(tenantModules.tenantId, tenantId), eq(tenantModules.moduleKey, kind)) }))
  const [inventory] = await tx.select({ total: sql<number>`count(*)::int` }).from(stock).where(eq(stock.tenantId, tenantId))
  const [people] = await tx.select({ total: sql<number>`count(*)::int` }).from(contacts).where(eq(contacts.tenantId, tenantId))
  const configured = catalogEnabled && Boolean(await tx.query.pipelines.findFirst({ where: eq(pipelines.tenantId, tenantId) }))
  const relatedDeals = await tx.select({ id: deals.id, contactId: deals.contactId, propertyId: deals.propertyId, vehicleId: deals.vehicleId, outcome: pipelineStages.outcome })
    .from(deals).innerJoin(contacts, eq(contacts.id, deals.contactId)).innerJoin(pipelineStages, eq(pipelineStages.id, deals.stageId))
    .where(and(eq(deals.tenantId, tenantId), isNotNull(kind === 'properties' ? deals.propertyId : deals.vehicleId)))
  const activity = await agenda(tx, tenantId, now), eligible = new Set(relatedDeals.map((deal) => deal.id))
  const plannedTask = activity.tasks.some((task) => task.dealId && eligible.has(task.dealId) && task.assignedTo && task.dueOn && (task.done || task.dueOn >= activity.today))
  const plannedAppointment = activity.appointments.some((item) => item.assignedTo && (item.status === 'completed' || (item.status === 'scheduled' && !appointmentIsPast(item, now))) && relatedDeals.some((deal) => item.contactId === deal.contactId && (kind === 'properties' ? item.propertyId === deal.propertyId : item.vehicleId === deal.vehicleId)))
  const followed = plannedTask || plannedAppointment || relatedDeals.some((deal) => deal.outcome !== 'open')
  const connection = await tx.query.calendarConnections.findFirst({ where: and(eq(calendarConnections.tenantId, tenantId), eq(calendarConnections.memberId, memberId)) })
  const [synced] = connection ? await tx.select({ total: sql<number>`count(*)::int` }).from(calendarEventSync)
    .where(and(eq(calendarEventSync.tenantId, tenantId), eq(calendarEventSync.connectionId, connection.id), sql`${calendarEventSync.fingerprint} not in ('pending','deleted')`)) : [{ total: 0 }]
  const steps = [
    { key: 'configuration', title: 'Preparar el CRM', description: 'Un proceso comercial y el catálogo de tu rubro habilitados.', complete: configured, href: '/app/setup' },
    { key: 'inventory', title: kind === 'properties' ? 'Cargar una propiedad' : 'Cargar un vehículo', description: 'Una ficha registrada en el catálogo de esta organización.', complete: inventory!.total > 0, href: `/app/${kind}` },
    { key: 'contact', title: 'Registrar un contacto', description: 'La persona con la que vas a trabajar en el CRM.', complete: people!.total > 0, href: '/app/contacts' },
    { key: 'opportunity', title: 'Crear una oportunidad vinculada', description: 'Relacionar un interesado con una ficha de tu catálogo.', complete: relatedDeals.length > 0, href: '/app/pipeline' },
    { key: 'follow_up', title: 'Dar el primer seguimiento', description: 'Una acción o cita con fecha y responsable, o una oportunidad cerrada.', complete: followed, href: '/app/agenda' },
  ]
  const complete = steps.filter((step) => step.complete).length
  return { supported: true as const, industry, steps, complete, total: steps.length, ready: complete === steps.length,
    counts: { inventory: inventory!.total, contacts: people!.total, linkedOpportunities: relatedDeals.length, ...activity.counts },
    calendar: { optional: true, connected: connection?.status === 'connected', hasSyncedAppointment: Boolean(connection?.status === 'connected' && connection.lastSyncedAt && !connection.lastError && synced?.total), href: '/app/agenda' },
  }
}

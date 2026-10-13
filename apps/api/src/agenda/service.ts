import { and, asc, eq } from 'drizzle-orm'
import type { TenantTx } from '../db/tenant-db'
import { appointments, tasks, contacts, properties, vehicles, deals, pipelineStages, pipelines, members, user } from '../db/schema'

export function localToday(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Montevideo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

export async function agenda(db: TenantTx, tenantId: string, now = new Date()) {
  const today = localToday(now)
  const taskItems = await db.select({ id: tasks.id, title: tasks.title, description: tasks.description, dueOn: tasks.dueOn,
    done: tasks.done, contactId: tasks.contactId, contactName: contacts.name, dealId: tasks.dealId,
    assignedTo: tasks.assignedTo, responsibleName: user.name }).from(tasks)
    .leftJoin(contacts, eq(contacts.id, tasks.contactId)).leftJoin(members, eq(members.id, tasks.assignedTo)).leftJoin(user, eq(user.id, members.userId))
    .where(eq(tasks.tenantId, tenantId)).orderBy(asc(tasks.dueOn), asc(tasks.createdAt))
  const appointmentItems = await db.select({ id: appointments.id, kind: appointments.kind, scheduledAt: appointments.scheduledAt,
    durationMinutes: appointments.durationMinutes, status: appointments.status, assignedTo: appointments.assignedTo,
    responsibleName: user.name, contactId: appointments.contactId, contactName: contacts.name, notes: appointments.notes,
    propertyId: appointments.propertyId, vehicleId: appointments.vehicleId, propertyTitle: properties.title, vehicleTitle: vehicles.title }).from(appointments)
    .leftJoin(contacts, eq(contacts.id, appointments.contactId)).leftJoin(properties, eq(properties.id, appointments.propertyId))
    .leftJoin(vehicles, eq(vehicles.id, appointments.vehicleId)).leftJoin(members, eq(members.id, appointments.assignedTo)).leftJoin(user, eq(user.id, members.userId))
    .where(eq(appointments.tenantId, tenantId)).orderBy(asc(appointments.scheduledAt))
  const openDeals = await db.select({ id: deals.id, title: deals.title, pipelineId: deals.pipelineId, pipelineName: pipelines.name,
    stageName: pipelineStages.name, contactId: deals.contactId, contactName: contacts.name, assignedTo: deals.assignedTo,
    responsibleName: user.name, propertyId: deals.propertyId, vehicleId: deals.vehicleId }).from(deals)
    .innerJoin(pipelines, eq(pipelines.id, deals.pipelineId)).innerJoin(pipelineStages, eq(pipelineStages.id, deals.stageId))
    .leftJoin(contacts, eq(contacts.id, deals.contactId)).leftJoin(members, eq(members.id, deals.assignedTo)).leftJoin(user, eq(user.id, members.userId))
    .where(and(eq(deals.tenantId, tenantId), eq(pipelineStages.outcome, 'open'))).orderBy(asc(deals.createdAt))
  const followUp = openDeals.map((deal) => {
    const pendingTasks = taskItems.filter((task) => !task.done && task.dealId === deal.id && task.dueOn)
    // Una visita de otro interesado a la misma ficha no cuenta como seguimiento.
    const pendingAppointments = appointmentItems.filter((item) => item.status === 'scheduled' && deal.contactId && item.contactId === deal.contactId &&
      ((deal.propertyId && item.propertyId === deal.propertyId) || (deal.vehicleId && item.vehicleId === deal.vehicleId)))
    const hasFuture = pendingTasks.some((task) => task.dueOn! >= today) || pendingAppointments.some((item) => item.scheduledAt >= now)
    const overdue = pendingTasks.some((task) => task.dueOn! < today) || pendingAppointments.some((item) => item.scheduledAt < now)
    return { ...deal, needsFollowUp: !hasFuture, overdue, nextTask: pendingTasks.find((task) => task.dueOn! >= today) ?? null,
      nextAppointment: pendingAppointments.find((item) => item.scheduledAt >= now) ?? null }
  })
  return { today, timeZone: 'America/Montevideo', tasks: taskItems, appointments: appointmentItems, followUp,
    counts: { overdueTasks: taskItems.filter((task) => !task.done && task.dueOn && task.dueOn < today).length,
      overdueAppointments: appointmentItems.filter((item) => item.status === 'scheduled' && item.scheduledAt < now).length,
      withoutFollowUp: followUp.filter((item) => item.needsFollowUp).length } }
}

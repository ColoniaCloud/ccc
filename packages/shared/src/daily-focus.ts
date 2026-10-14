import { appointmentIsPast } from './appointment-time.js'
export { appointmentIsPast } from './appointment-time.js'
type Assigned = { id: string; assignedTo: string | null }
type Task = Assigned & { done: boolean; dueOn: string | null }
type Appointment = Assigned & { status: string; scheduledAt: string; durationMinutes: number }
type Deal = Assigned & { needsFollowUp: boolean }
export const uruguayDay = (now: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Montevideo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
export function dailyFocus<T extends Task, A extends Appointment, D extends Deal>(data: { tasks: T[]; appointments: A[]; followUp: D[] }, responsible: string, now = new Date()) {
  const today = uruguayDay(now), end = new Date(`${today}T12:00:00Z`); end.setUTCDate(end.getUTCDate() + 6)
  const lastDay = end.toISOString().slice(0, 10), matches = (item: Assigned) => responsible === 'all' || (responsible === 'none' ? item.assignedTo === null : item.assignedTo === responsible)
  const pending = data.tasks.filter(t => !t.done && matches(t)).sort((a,b) => (a.dueOn ?? '9999').localeCompare(b.dueOn ?? '9999') || a.id.localeCompare(b.id))
  const appointments = data.appointments.filter(a => a.status === 'scheduled' && matches(a)).sort((a,b) => a.scheduledAt.localeCompare(b.scheduledAt) || a.id.localeCompare(b.id))
  const finished = (a: Appointment) => appointmentIsPast(a, now)
  return { today, lastDay, overdueTasks: pending.filter(t => t.dueOn && t.dueOn < today), todayTasks: pending.filter(t => t.dueOn === today), undatedTasks: pending.filter(t => !t.dueOn),
    overdueAppointments: appointments.filter(finished), upcomingAppointments: appointments.filter(a => !finished(a) && uruguayDay(new Date(a.scheduledAt)) <= lastDay),
    withoutFollowUp: data.followUp.filter(d => matches(d) && d.needsFollowUp) }
}

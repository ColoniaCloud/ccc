'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { dailyFocus, uruguayDay } from '@crm/shared'
import { useApp } from '@/app/app/app-context'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Skeleton } from '@/components/ui/skeleton'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectGroup, SelectItem } from '@/components/ui/select'
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from '@/components/ui/empty'
type Assigned = { id: string; assignedTo: string | null; responsibleName: string | null }
type Task = Assigned & { title: string; dueOn: string | null; done: boolean }
type Appointment = Assigned & { scheduledAt: string; durationMinutes: number; status: string; propertyTitle: string | null; vehicleTitle: string | null }
type Deal = Assigned & { title: string; needsFollowUp: boolean }
type Data = { tasks: Task[]; appointments: Appointment[]; followUp: Deal[] }
const date = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString('es-UY', { timeZone: 'UTC', day: 'numeric', month: 'short' })
export function DailyFocus() {
  const { apiFetch, me } = useApp(), [data, setData] = useState<Data | null>(null), [team, setTeam] = useState<{ id: string; name: string }[]>([]), [responsible, setResponsible] = useState(me.member.id), [error, setError] = useState(''), [revision, setRevision] = useState(0), [now, setNow] = useState(new Date()), [loading, setLoading] = useState(false)
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError('')
    Promise.all([apiFetch('/api/agenda', { signal: controller.signal }), apiFetch(`/api/organizations/${encodeURIComponent(me.tenant.slug)}/team`, { signal: controller.signal })]).then(async ([res, members]) => {
      if (!res.ok || !members.ok) throw new Error('No se pudo cargar Tu día')
      const [agenda, roster] = await Promise.all([res.json(), members.json()]); if (controller.signal.aborted) return
      setData(agenda); setTeam(roster.items); setNow(new Date())
    }).catch((err: Error) => { if (!controller.signal.aborted) setError(err.message) }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [apiFetch, me.tenant.slug, revision])
  useEffect(() => {
    const refresh = () => { if (document.visibilityState === 'visible') { setNow(new Date()); setRevision(n => n + 1) } }
    const timer = setInterval(refresh, 60000); document.addEventListener('visibilitychange', refresh)
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', refresh) }
  }, [])
  const focus = data ? dailyFocus(data, responsible, now) : null
  function href(tab: string, extra: Record<string,string> = {}) { return `/app/agenda?${new URLSearchParams({ tab, responsible, organization: me.tenant.slug, ...(tab === 'pending' && focus ? { from: focus.today, to: focus.lastDay } : {}), ...extra })}` }
  function group(title: string, items: { id: string; title: string; description: string; href: string }[], link: string) {
    if (!items.length) return null
    return <section className="flex flex-col gap-2"><div className="flex items-center justify-between gap-2"><h3 className="font-medium">{title}</h3><Badge variant="secondary">{items.length}</Badge></div>{items.slice(0,3).map(item => <Link key={item.id} className="rounded-md border p-3" href={item.href}><p className="break-words font-medium">{item.title}</p><p className="text-sm text-muted-foreground">{item.description}</p></Link>)}{items.length > 3 && <Button asChild size="sm" variant="ghost" className="self-start"><Link href={link}>Ver los {items.length} en Agenda</Link></Button>}</section>
  }
  function taskRows(items: Task[], tab: string) { return items.map(t => ({ id: t.id, title: t.title, description: `${t.dueOn ? date(t.dueOn) : 'Sin fecha'} · ${t.responsibleName ?? 'Sin responsable'}`, href: href(tab, { kind: 'task', taskId: t.id }) })) }
  function appointmentRows(items: Appointment[], tab: string) { return items.map(a => ({ id: a.id, title: a.propertyTitle ?? a.vehicleTitle ?? 'Cita', description: `${new Date(a.scheduledAt).getTime() <= now.getTime() && tab !== 'overdue' ? 'En curso · ' : ''}${new Date(a.scheduledAt).toLocaleString('es-UY',{ timeZone:'America/Montevideo',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit' })} · ${a.responsibleName ?? 'Sin responsable'}`, href: href(tab, { appointmentId: a.id, from: uruguayDay(new Date(a.scheduledAt)), to: uruguayDay(new Date(a.scheduledAt)) }) })) }
  const empty = focus && ![focus.overdueTasks, focus.todayTasks, focus.undatedTasks, focus.overdueAppointments, focus.upcomingAppointments, focus.withoutFollowUp].some(items => items.length)
  return <Card className="dashboard-tasks-card"><CardHeader><div className="flex flex-wrap items-center justify-between gap-2"><CardTitle role="heading" aria-level={2}>Tu día</CardTitle><Button variant="outline" size="sm" disabled={loading} onClick={() => setRevision(n => n + 1)}>{loading ? 'Actualizando…' : 'Actualizar'}</Button></div><CardDescription>Qué requiere atención y las citas de hoy a {focus ? date(focus.lastDay) : 'los próximos siete días'}. Hora de Uruguay.</CardDescription></CardHeader><CardContent className="flex flex-col gap-4">
    <FieldGroup><Field><FieldLabel htmlFor="focus-responsible">Responsable de Tu día</FieldLabel><Select value={responsible} onValueChange={setResponsible}><SelectTrigger id="focus-responsible" className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="all">Todo el equipo</SelectItem><SelectItem value="none">Sin asignar</SelectItem>{team.map(member => <SelectItem key={member.id} value={member.id}>{member.id === me.member.id ? `${member.name} (vos)` : member.name}</SelectItem>)}</SelectGroup></SelectContent></Select></Field></FieldGroup>
    {error && <Alert variant="destructive"><AlertDescription>{error}{data && ' Se conserva la última lectura; actualizá antes de actuar.'}</AlertDescription></Alert>}
    {!data && !error && <Skeleton className="h-40 w-full" />}
    {empty && <Empty><EmptyHeader><EmptyTitle>No hay pendientes en este foco</EmptyTitle><EmptyDescription>Probá con todo el equipo o sin asignar para revisar el resto de la organización.</EmptyDescription></EmptyHeader></Empty>}
    {focus && <div className="grid items-start gap-4 md:grid-cols-2 xl:grid-cols-3">{group('Tareas vencidas',taskRows(focus.overdueTasks,'overdue'),href('overdue',{kind:'task'}))}{group('Tareas para hoy',taskRows(focus.todayTasks,'pending'),href('pending',{kind:'task',from:focus.today,to:focus.today}))}{group('Citas por resolver',appointmentRows(focus.overdueAppointments,'overdue'),href('overdue'))}{group('Citas próximas y en curso',appointmentRows(focus.upcomingAppointments,'pending'),href('pending'))}{group('Oportunidades sin próximo paso',focus.withoutFollowUp.map(d => ({id:d.id,title:d.title,description:d.responsibleName ?? 'Sin responsable',href: me.member.role === 'support' ? href('followUp') : href('followUp',{newTask:'1',dealId:d.id})})),href('followUp'))}{group('Tareas sin fecha',taskRows(focus.undatedTasks,'pending'),href('pending',{kind:'task'}))}</div>}
    <Button asChild variant="ghost" size="sm" className="self-start"><Link href={href('pending')}>Abrir Agenda con este responsable</Link></Button>
  </CardContent></Card>
}

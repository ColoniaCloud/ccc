'use client'
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { appointmentIsPast } from '@crm/shared'
import { useApp } from '../app-context'
import { TaskForm, type AgendaTask } from '@/components/TaskForm'
import { CalendarConnection } from '@/components/CalendarConnection'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from '@/components/ui/empty'
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog'

type Appointment = { id: string; kind: string; scheduledAt: string; durationMinutes: number; status: string; contactId: string | null; contactName: string | null; assignedTo: string | null; responsibleName: string | null; propertyId: string | null; vehicleId: string | null; propertyTitle: string | null; vehicleTitle: string | null }
type FollowUp = { id: string; title: string; pipelineId: string; pipelineName: string; stageName: string; assignedTo: string | null; responsibleName: string | null; contactName: string | null; needsFollowUp: boolean; overdue: boolean; nextTask: AgendaTask | null; nextAppointment: Appointment | null }
type Agenda = { today: string; tasks: AgendaTask[]; appointments: Appointment[]; followUp: FollowUp[]; counts: { overdueTasks: number; overdueAppointments: number; withoutFollowUp: number } }
const dateLabel = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString('es-UY', { timeZone: 'UTC', dateStyle: 'medium' })
const timeLabel = (iso: string) => new Date(iso).toLocaleString('es-UY', { timeZone: 'America/Montevideo', dateStyle: 'medium', timeStyle: 'short' })
const dayAt = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Montevideo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso))
const assetUrl = (item: Appointment) => `/app/${item.propertyId ? 'properties' : 'vehicles'}/${item.propertyId ?? item.vehicleId}`

export default function AgendaPage() {
  const { apiFetch, me } = useApp(), canWrite = me.member.role !== 'support'
  const [data, setData] = useState<Agenda | null>(null), [members, setMembers] = useState<{ id: string; name: string }[]>([]), [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const [tab, setTab] = useState('pending'), [responsible, setResponsible] = useState('all'), [kind, setKind] = useState('all'), [from, setFrom] = useState(''), [to, setTo] = useState('')
  const [taskForm, setTaskForm] = useState<{ task?: AgendaTask; dealId?: string } | null>(null), [deleting, setDeleting] = useState<AgendaTask | null>(null)
  const [editing, setEditing] = useState<Appointment | null>(null), [when, setWhen] = useState(''), [duration, setDuration] = useState(60), [assignee, setAssignee] = useState('none'), [formError, setFormError] = useState('')
  const load = useCallback(async (signal?: AbortSignal) => {
    const res = await apiFetch('/api/agenda', { signal }), body = await res.json()
    if (!res.ok) throw new Error(body.error ?? 'No se pudo cargar la agenda')
    return body as Agenda
  }, [apiFetch])
  useEffect(() => {
    const controller = new AbortController()
    Promise.all([load(controller.signal), apiFetch(`/api/organizations/${encodeURIComponent(me.tenant.slug)}/team`, { signal: controller.signal })]).then(async ([agenda, teamRes]) => {
      if (!teamRes.ok) throw new Error('No se pudo cargar el equipo')
      const team = await teamRes.json(); if (controller.signal.aborted) return
      setData(agenda); setMembers(team.items); setFrom(agenda.today)
      const end = new Date(`${agenda.today}T12:00:00Z`); end.setUTCDate(end.getUTCDate() + 7); setTo(end.toISOString().slice(0, 10))
      const params = new URLSearchParams(window.location.search)
      const selectedTab = params.get('tab'), selectedMember = params.get('responsible'), selectedKind = params.get('kind')
      if (selectedTab && ['pending','overdue','followUp','history'].includes(selectedTab)) setTab(selectedTab)
      if (selectedMember && (['all','none'].includes(selectedMember) || team.items.some((member: { id: string }) => member.id === selectedMember))) setResponsible(selectedMember)
      if (selectedKind && ['all','task','property_visit','test_drive'].includes(selectedKind)) setKind(selectedKind)
      for (const [key, change] of [['from',setFrom],['to',setTo]] as const) { const value = params.get(key); if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) change(value) }
      const selectedTask = agenda.tasks.find(task => task.id === params.get('taskId'))
      if (selectedTask && canWrite) setTaskForm({ task: selectedTask })
      const selectedAppointment = agenda.appointments.find(item => item.id === params.get('appointmentId'))
      if (selectedAppointment && canWrite && selectedAppointment.status === 'scheduled') openAppointment(selectedAppointment)

      if (canWrite && params.get('newTask') === '1') setTaskForm({ dealId: params.get('dealId') ?? undefined })
    }).catch((err: Error) => { if (!controller.signal.aborted) setError(err.message) })
    return () => controller.abort()
  }, [load, apiFetch, me.tenant.slug, canWrite])
  async function refresh() { setData(await load()); setError('') }
  async function mutate(path: string, method: string, body?: object) {
    setBusy(true); setError('')
    try {
      const res = await apiFetch(path, { method, ...(body ? { body: JSON.stringify(body) } : {}) }), result = await res.json()
      if (!res.ok) throw new Error(result.error ?? 'No se pudo guardar el cambio')
      await refresh(); return true
    } catch (err) { setError((err as Error).message); return false } finally { setBusy(false) }
  }
  function memberMatches(id: string | null) { return responsible === 'all' || (responsible === 'none' ? id === null : id === responsible) }
  function inRange(day: string | null) { return !day || ((!from || day >= from) && (!to || day <= to)) }
  const now = Date.now()
  const tasks = (data?.tasks ?? []).filter((item) => memberMatches(item.assignedTo) && (kind === 'all' || kind === 'task') && (tab === 'history' ? item.done : !item.done && (tab === 'overdue' ? Boolean(item.dueOn && item.dueOn < data!.today) : inRange(item.dueOn))))
  const appointments = (data?.appointments ?? []).filter((item) => memberMatches(item.assignedTo) && (kind === 'all' || kind === item.kind) && (tab === 'history' ? item.status !== 'scheduled' : item.status === 'scheduled' && (tab === 'overdue' ? appointmentIsPast(item, new Date(now)) : inRange(dayAt(item.scheduledAt)))))
  const rows = [...tasks.map((item) => ({ type: 'task' as const, item, day: item.dueOn ?? '9999' })), ...appointments.map((item) => ({ type: 'appointment' as const, item, day: dayAt(item.scheduledAt) }))].sort((a, b) => a.day.localeCompare(b.day) || (a.type === 'appointment' && b.type === 'appointment' ? a.item.scheduledAt.localeCompare(b.item.scheduledAt) : a.type.localeCompare(b.type)))
  function openAppointment(item: Appointment) {
    const date = new Date(item.scheduledAt), offset = date.getTimezoneOffset() * 60000
    setWhen(new Date(date.getTime() - offset).toISOString().slice(0, 16)); setDuration(item.durationMinutes); setAssignee(item.assignedTo ?? 'none'); setFormError(''); setEditing(item)
  }
  async function reschedule(event: React.FormEvent) {
    event.preventDefault(); if (!editing) return
    const ok = await mutate(`/api/${editing.propertyId ? 'properties' : 'vehicles'}/${editing.propertyId ?? editing.vehicleId}/appointments/${editing.id}`, 'PATCH', { scheduledAt: new Date(when).toISOString(), durationMinutes: duration, assignedTo: assignee === 'none' ? null : assignee })
    if (ok) setEditing(null); else setFormError('No se pudo reprogramar. Revisá el mensaje de la agenda.')
  }
  function select(id: string, label: string, value: string, change: (value: string) => void, options: [string, string][]) {
    return <Field><FieldLabel htmlFor={id}>{label}</FieldLabel><Select value={value} onValueChange={(next) => { if (next) change(next) }} disabled={busy}><SelectTrigger id={id} className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{options.map(([key, title]) => <SelectItem key={key} value={key}>{title}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>
  }
  return <div className="page">
    <div className="page-header"><div><h1>Agenda y seguimiento</h1><p>El próximo paso de cada oportunidad, con fecha y responsable.</p></div>{canWrite && <Button onClick={() => setTaskForm({})}>Nueva tarea</Button>}</div>
    {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
    {!data ? <><Skeleton className="h-24 w-full" /><Button variant="outline" onClick={() => void refresh().catch((err: Error) => setError(err.message))}>Reintentar</Button></> : <>
      <div className="grid gap-3 sm:grid-cols-3">{[[String(data.counts.overdueTasks), 'Tareas vencidas'], [String(data.counts.overdueAppointments), 'Citas por resolver'], [String(data.counts.withoutFollowUp), 'Oportunidades sin próximo paso']].map(([count, label]) => <Card key={label}><CardHeader><CardDescription>{label} · organización</CardDescription><CardTitle className="text-3xl tabular-nums">{count}</CardTitle></CardHeader></Card>)}</div>
      <Card><CardHeader><CardTitle role="heading" aria-level={2}>Trabajo del equipo</CardTitle><CardDescription>Las fechas de la agenda se muestran en hora de Uruguay. Una tarea vence al terminar el día.</CardDescription></CardHeader><CardContent className="flex flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-2">{select('agenda-member', 'Responsable', responsible, setResponsible, [['all','Todo el equipo'], ['none','Sin asignar'], ...members.map((member) => [member.id, member.id === me.member.id ? `${member.name} (vos)` : member.name] as [string,string])])}{tab !== 'followUp' && select('agenda-kind', 'Tipo de actividad', kind, setKind, [['all','Todas'],['task','Tareas'],['property_visit','Visitas'],['test_drive','Pruebas de manejo']])}</div>
        <Tabs value={tab} onValueChange={setTab}><TabsList className="grid w-full grid-cols-2 gap-1 group-data-horizontal/tabs:h-auto sm:grid-cols-4"><TabsTrigger className="h-8" value="pending">Agenda</TabsTrigger><TabsTrigger className="h-8" value="overdue">Vencidos</TabsTrigger><TabsTrigger className="h-8" value="followUp">Seguimiento</TabsTrigger><TabsTrigger className="h-8" value="history">Historial</TabsTrigger></TabsList><TabsContent value={tab} className="flex flex-col gap-4">
        {tab === 'pending' && <div className="grid gap-3 sm:grid-cols-2"><Field><FieldLabel htmlFor="agenda-from">Desde</FieldLabel><Input id="agenda-from" type="date" value={from} onChange={(event) => { setFrom(event.target.value); if (event.target.value > to) setTo(event.target.value) }} /></Field><Field><FieldLabel htmlFor="agenda-to">Hasta</FieldLabel><Input id="agenda-to" type="date" min={from || undefined} value={to} onChange={(event) => setTo(event.target.value)} /></Field></div>}
        {tab === 'followUp' ? <>
          <p className="text-sm text-muted-foreground">Una tarea con fecha vinculada a la oportunidad o una cita del mismo interesado y ficha cuenta como próximo paso. Una tarea sin fecha queda pendiente de planificar.</p>
          {data.followUp.filter((item) => memberMatches(item.assignedTo)).map((deal) => <div key={deal.id} className="flex flex-col gap-2 rounded-lg border p-4">
            <div className="flex flex-wrap items-center justify-between gap-2"><Link className="font-medium break-words" href={`/app/pipeline?pipelineId=${deal.pipelineId}`}>{deal.title}</Link><Badge variant={deal.needsFollowUp ? 'destructive' : 'secondary'}>{deal.needsFollowUp ? 'Sin próximo paso' : 'Planificada'}</Badge></div>
            <p className="text-sm text-muted-foreground">{deal.pipelineName} · {deal.stageName} · {deal.responsibleName ?? 'Sin responsable'}</p>
            {deal.nextTask && <p className="text-sm">{dateLabel(deal.nextTask.dueOn!)} · {deal.nextTask.title}</p>}{deal.nextAppointment && <p className="text-sm">{timeLabel(deal.nextAppointment.scheduledAt)} · {deal.nextAppointment.kind === 'property_visit' ? 'Visita' : 'Prueba de manejo'}</p>}
            {deal.overdue && <p className="text-sm text-destructive">Tiene actividades vencidas por resolver.</p>}
            {canWrite && <Button variant="outline" size="sm" className="self-start" onClick={() => setTaskForm({ dealId: deal.id })}>Planificar seguimiento</Button>}
          </div>)}
          {!data.followUp.some((item) => memberMatches(item.assignedTo)) && <Empty><EmptyHeader><EmptyTitle>Sin oportunidades abiertas</EmptyTitle><EmptyDescription>Las oportunidades ganadas o perdidas no requieren seguimiento.</EmptyDescription></EmptyHeader></Empty>}
        </> : rows.length ? rows.map((row) => <div key={`${row.type}-${row.item.id}`} className="flex flex-col gap-2 rounded-lg border p-4">
          <div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0"><p className="font-medium break-words">{row.type === 'task' ? row.item.title : row.item.propertyTitle ?? row.item.vehicleTitle ?? 'Ficha eliminada'}</p><p className="text-sm text-muted-foreground">{row.type === 'task' ? row.item.dueOn ? dateLabel(row.item.dueOn) : 'Sin fecha · pendiente de planificar' : `${timeLabel(row.item.scheduledAt)} · ${row.item.durationMinutes} min`}</p></div><Badge variant="outline">{row.type === 'task' ? row.item.done ? 'Tarea completada' : 'Tarea' : row.item.status === 'completed' ? 'Realizada' : row.item.status === 'cancelled' ? 'Cancelada' : row.item.kind === 'property_visit' ? 'Visita' : 'Prueba de manejo'}</Badge></div>
          <p className="text-sm text-muted-foreground">{row.item.responsibleName ?? 'Sin responsable'}{row.item.contactName ? ` · ${row.item.contactName}` : ''}</p>
          {((row.type === 'task' && !row.item.done && row.item.dueOn && row.item.dueOn < data.today) || (row.type === 'appointment' && row.item.status === 'scheduled' && appointmentIsPast(row.item, new Date(now)))) && <p className="text-sm text-destructive">{row.type === 'task' ? 'Vencida' : 'Horario pasado · marcar realizada o reprogramar'}</p>}
          <div className="flex flex-wrap gap-2">{row.type === 'task' ? <>{row.item.contactId && <Button asChild size="sm" variant="ghost"><Link href={`/app/contacts/${row.item.contactId}`}>Ver contacto</Link></Button>}{canWrite && <><Button size="sm" disabled={busy} variant="outline" onClick={() => void mutate(`/api/tasks/${row.item.id}`, 'PATCH', { done: !row.item.done })}>{row.item.done ? 'Reabrir' : 'Completar tarea'}</Button><Button size="sm" disabled={busy} variant="outline" onClick={() => setTaskForm({ task: row.item })}>Editar</Button><Button size="sm" disabled={busy} variant="ghost" onClick={() => setDeleting(row.item)}>Eliminar</Button></>}</> : <><Button asChild size="sm" variant="ghost"><Link href={assetUrl(row.item)}>Ver ficha</Link></Button>{canWrite && row.item.status === 'scheduled' && <><Button size="sm" disabled={busy} variant="outline" onClick={() => openAppointment(row.item)}>Reprogramar</Button><Button size="sm" disabled={busy} variant="outline" onClick={() => void mutate(`/api/${row.item.propertyId ? 'properties' : 'vehicles'}/${row.item.propertyId ?? row.item.vehicleId}/appointments/${row.item.id}`, 'PATCH', { status: 'completed' })}>Marcar realizada</Button><Button size="sm" disabled={busy} variant="ghost" onClick={() => void mutate(`/api/${row.item.propertyId ? 'properties' : 'vehicles'}/${row.item.propertyId ?? row.item.vehicleId}/appointments/${row.item.id}`, 'PATCH', { status: 'cancelled' })}>Cancelar cita</Button></>}</>}</div>
        </div>) : <Empty><EmptyHeader><EmptyTitle>Sin actividades en esta vista</EmptyTitle><EmptyDescription>Cambiá los filtros o planificá el próximo seguimiento.</EmptyDescription></EmptyHeader></Empty>}
      </TabsContent></Tabs></CardContent></Card><CalendarConnection />
    </>}
    <Sheet open={Boolean(taskForm)} onOpenChange={(open) => { if (!open) setTaskForm(null) }}><SheetContent className="overflow-y-auto"><SheetHeader><SheetTitle>{taskForm?.task ? 'Editar tarea' : 'Nueva tarea'}</SheetTitle><SheetDescription>Vinculá la acción a una oportunidad para organizar su seguimiento.</SheetDescription></SheetHeader><div className="px-4 pb-4">{taskForm && <TaskForm task={taskForm.task} dealId={taskForm.dealId} onSaved={() => { setTaskForm(null); void refresh().catch((err: Error) => setError(err.message)) }} />}</div></SheetContent></Sheet>
    <Sheet open={Boolean(editing)} onOpenChange={(open) => { if (!open && !busy) setEditing(null) }}><SheetContent><SheetHeader><SheetTitle>Reprogramar cita</SheetTitle><SheetDescription>La hora de este formulario corresponde a la zona horaria de tu dispositivo.</SheetDescription></SheetHeader><form className="flex flex-col gap-4 px-4 pb-4" onSubmit={reschedule}><FieldGroup><Field><FieldLabel htmlFor="reschedule-when">Fecha y hora</FieldLabel><Input id="reschedule-when" required type="datetime-local" value={when} onChange={(event) => setWhen(event.target.value)} disabled={busy} /></Field><Field><FieldLabel htmlFor="reschedule-duration">Duración en minutos</FieldLabel><Input id="reschedule-duration" type="number" min={15} max={480} required value={duration} onChange={(event) => setDuration(Number(event.target.value))} disabled={busy} /></Field>{select('reschedule-member', 'Responsable', assignee, setAssignee, [['none','Sin asignar'], ...members.map((member) => [member.id, member.name] as [string,string])])}</FieldGroup>{formError && <Alert variant="destructive"><AlertDescription>{formError}</AlertDescription></Alert>}<Button disabled={busy}>{busy ? 'Guardando…' : 'Guardar cita'}</Button></form></SheetContent></Sheet>
    <AlertDialog open={Boolean(deleting)} onOpenChange={(open) => { if (!open && !busy) setDeleting(null) }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Eliminar tarea</AlertDialogTitle><AlertDialogDescription>Se eliminará «{deleting?.title}». Si era el próximo paso de una oportunidad, esa oportunidad volverá a necesitar seguimiento.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={busy}>Volver</AlertDialogCancel><AlertDialogAction disabled={busy} onClick={(event) => { event.preventDefault(); if (deleting) void mutate(`/api/tasks/${deleting.id}`, 'DELETE').then((ok) => { if (ok) setDeleting(null) }) }}>Eliminar tarea</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </div>
}

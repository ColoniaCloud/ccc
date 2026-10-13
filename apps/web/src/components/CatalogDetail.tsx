'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import type { CatalogKind } from '@crm/shared'
import { useApp } from '@/app/app/app-context'
import { CATALOGS, STATUS_LABELS, catalogFields, priceLabel, type CatalogRecord } from '@/lib/catalogs'
import { CatalogForm } from './CatalogForm'
import { loadContactOptions } from '@/lib/contact-options'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog'

type Appointment = { id: string; contactId: string | null; contactName: string | null; scheduledAt: string; status: string; assignedTo: string | null; notes: string | null }
type Detail = { item: CatalogRecord; sourceContactName: string | null; deals: { id: string; title: string; contactName: string | null; pipelineId: string }[]; appointments: Appointment[] }
const APPOINTMENT_STATUS: Record<string, string> = { scheduled: 'Agendada', completed: 'Realizada', cancelled: 'Cancelada' }

export function CatalogDetail({ kind }: { kind: CatalogKind }) {
  const { id } = useParams<{ id: string }>(), { apiFetch, me } = useApp()
  const [detail, setDetail] = useState<Detail | null>(null), [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState(false), [scheduling, setScheduling] = useState(false), [archiving, setArchiving] = useState(false)
  const [busy, setBusy] = useState(false), [formError, setFormError] = useState<string | null>(null)
  const [contacts, setContacts] = useState<{ id: string; name: string }[]>([]), [members, setMembers] = useState<{ id: string; name: string }[]>([])
  const [contactId, setContactId] = useState(''), [assignedTo, setAssignedTo] = useState('none'), [when, setWhen] = useState(''), [notes, setNotes] = useState('')
  const config = CATALOGS[kind], canWrite = me.member.role !== 'support'
  async function load() {
    const res = await apiFetch(`/api/${kind}/${id}`), data = await res.json()
    if (!res.ok) throw new Error(data.error ?? 'No se pudo abrir la ficha')
    setDetail(data); setError(null)
  }
  useEffect(() => {
    let cancelled = false
    Promise.all([apiFetch(`/api/${kind}/${id}`), apiFetch(`/api/organizations/${encodeURIComponent(me.tenant.slug)}/team`)]).then(async ([res, teamRes]) => {
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'No se pudo abrir la ficha')
      if (!teamRes.ok) throw new Error('No se pudieron cargar los responsables')
      const team = await teamRes.json()
      if (!cancelled) { setDetail(data); setMembers(team.items); setError(null) }
    }).catch((err: Error) => { if (!cancelled) setError(err.message) })
    return () => { cancelled = true }
  }, [apiFetch, id, kind, me.tenant.slug])
  useEffect(() => {
    if (!scheduling) return
    const controller = new AbortController()
    async function loadContacts() {
      const items = await loadContactOptions(apiFetch, controller.signal)
      if (!controller.signal.aborted) setContacts(items)
    }
    loadContacts().catch((err: Error) => { if (!controller.signal.aborted) setFormError(err.message) })
    return () => controller.abort()
  }, [apiFetch, scheduling])
  async function changeStatus(appointment: Appointment, status: string) {
    setBusy(true)
    try {
      const res = await apiFetch(`/api/${kind}/${id}/appointments/${appointment.id}`, { method: 'PATCH', body: JSON.stringify({ status }) }), data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'No se pudo actualizar la cita')
      await load()
    } catch (err) { setError((err as Error).message) } finally { setBusy(false) }
  }
  async function archive() {
    setBusy(true)
    try {
      const res = await apiFetch(`/api/${kind}/${id}/archive`, { method: 'POST' }), data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'No se pudo archivar')
      setArchiving(false); await load()
    } catch (err) { setError((err as Error).message) } finally { setBusy(false) }
  }
  async function schedule(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setFormError(null)
    try {
      const res = await apiFetch(`/api/${kind}/${id}/appointments`, { method: 'POST', body: JSON.stringify({ contactId,
        assignedTo: assignedTo === 'none' ? null : assignedTo, scheduledAt: new Date(when).toISOString(), notes }) }), data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'No se pudo agendar')
      setScheduling(false); setWhen(''); setNotes(''); setContactId(''); await load()
    } catch (err) { setFormError((err as Error).message) } finally { setBusy(false) }
  }
  const available = detail && ['available','reserved'].includes(detail.item.status)
  function selection(key: string, label: string, value: string, onChange: (value: string) => void, options: { id: string; name: string }[], optional = false) {
    return <Field><FieldLabel htmlFor={key}>{label}</FieldLabel><Select value={value} onValueChange={onChange} disabled={busy}>
      <SelectTrigger id={key} className="w-full"><SelectValue placeholder="Elegí un contacto" /></SelectTrigger><SelectContent><SelectGroup>
        {optional && <SelectItem value="none">Sin asignar</SelectItem>}{options.map((option) => <SelectItem key={option.id} value={option.id}>{option.name}</SelectItem>)}
      </SelectGroup></SelectContent></Select></Field>
  }
  return <div className="page">
    <Button asChild variant="ghost" className="self-start"><Link href={`/app/${kind}`}>← {config.label}</Link></Button>
    {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
    {!detail ? !error && <Skeleton className="h-64 w-full" /> : <>
      <div className="page-header catalog-detail-header"><div className="min-w-0"><h1 className="break-words">{detail.item.title}</h1><p>{priceLabel(detail.item)}</p></div><div className="flex flex-wrap gap-2">
        <Badge variant="secondary">{STATUS_LABELS[detail.item.status]}</Badge>
        {canWrite && <><Button variant="outline" onClick={() => setEditing(true)}>Editar ficha</Button>{detail.item.status !== 'archived' && <Button variant="outline" disabled={busy} onClick={() => setArchiving(true)}>Archivar</Button>}</>}
      </div></div>
      <div className="grid items-start gap-4 xl:grid-cols-2">
        <Card><CardHeader><CardTitle>Datos comerciales</CardTitle><CardDescription>La ficha pertenece a {me.tenant.name}.</CardDescription></CardHeader><CardContent>
          <dl className="grid gap-4 sm:grid-cols-2">{catalogFields(kind).filter((field) => !['title','price','currency','status'].includes(field.key)).map((field) => <div key={field.key}>
            <dt className="text-sm text-muted-foreground">{field.label}</dt><dd>{field.options?.find(([value]) => value === detail.item[field.key])?.[1] ?? detail.item[field.key] ?? 'Sin completar'}</dd>
          </div>)}<div><dt className="text-sm text-muted-foreground">{kind === 'properties' ? 'Propietario' : 'Vendedor o consignante'}</dt><dd>{detail.item.sourceContactId ? <Link href={`/app/contacts/${detail.item.sourceContactId}`}>{detail.sourceContactName ?? 'Abrir contacto'}</Link> : 'Sin asociar'}</dd></div>
          <div><dt className="text-sm text-muted-foreground">Responsable</dt><dd>{members.find((member) => member.id === detail.item.assignedTo)?.name ?? 'Sin asignar'}</dd></div></dl>
          {detail.item.notes && <p className="mt-4 whitespace-pre-wrap break-words">{detail.item.notes}</p>}
        </CardContent></Card>
        <div className="flex flex-col gap-4">
          <Card><CardHeader><CardTitle>Oportunidades relacionadas</CardTitle><CardDescription>Interesados que avanzan en el proceso comercial.</CardDescription></CardHeader><CardContent className="flex flex-col gap-3">
            {!detail.deals.length && <p className="text-sm text-muted-foreground">Todavía no hay oportunidades asociadas.</p>}
            {detail.deals.map((deal) => <Link key={deal.id} className="rounded-md border p-3" href={`/app/pipeline?pipelineId=${deal.pipelineId}`}><p className="font-medium">{deal.title}</p><p className="text-sm text-muted-foreground">{deal.contactName ?? 'Sin interesado'}</p></Link>)}
            {canWrite && available && <Button asChild variant="outline"><Link href={`/app/pipeline?${kind === 'properties' ? 'propertyId' : 'vehicleId'}=${id}`}>Crear oportunidad</Link></Button>}
          </CardContent></Card>
          <Card><CardHeader><CardTitle>{kind === 'properties' ? 'Visitas' : 'Pruebas de manejo'}</CardTitle><CardDescription>Fecha, interesado y responsable en un mismo lugar.</CardDescription></CardHeader><CardContent className="flex flex-col gap-4">
            {!detail.appointments.length && <p className="text-sm text-muted-foreground">No hay citas agendadas.</p>}
            {detail.appointments.map((appointment) => <div key={appointment.id} className="flex flex-col gap-2 rounded-md border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2"><strong>{appointment.contactName ?? 'Contacto eliminado'}</strong><Badge variant="outline">{APPOINTMENT_STATUS[appointment.status]}</Badge></div>
              <p className="text-sm">{new Date(appointment.scheduledAt).toLocaleString('es-UY', { dateStyle: 'medium', timeStyle: 'short' })}</p>
              <p className="text-sm text-muted-foreground">{members.find((member) => member.id === appointment.assignedTo)?.name ?? 'Sin responsable'}</p>
              {appointment.notes && <p className="whitespace-pre-wrap break-words text-sm">{appointment.notes}</p>}
              {canWrite && appointment.status === 'scheduled' && <div className="flex gap-2"><Button size="sm" disabled={busy} onClick={() => void changeStatus(appointment, 'completed')}>Marcar realizada</Button><Button size="sm" variant="outline" disabled={busy} onClick={() => void changeStatus(appointment, 'cancelled')}>Cancelar cita</Button></div>}
            </div>)}
            {canWrite && available && <Button onClick={() => { setAssignedTo(detail.item.assignedTo ?? 'none'); setFormError(null); setScheduling(true) }}>Agendar {config.appointment}</Button>}
          </CardContent></Card>
        </div>
      </div>
      <Sheet open={editing} onOpenChange={setEditing}><SheetContent className="overflow-y-auto sm:max-w-xl"><SheetHeader><SheetTitle>Editar {config.singular}</SheetTitle><SheetDescription>Actualizá los datos y la disponibilidad.</SheetDescription></SheetHeader><div className="px-4 pb-4"><CatalogForm key={detail.item.updatedAt} kind={kind} item={detail.item} onSaved={() => { setEditing(false); void load().catch((err: Error) => setError(err.message)) }} /></div></SheetContent></Sheet>
      <Sheet open={scheduling} onOpenChange={(open) => { if (!busy) setScheduling(open) }}><SheetContent className="overflow-y-auto"><SheetHeader><SheetTitle>Agendar {config.appointment}</SheetTitle><SheetDescription>{detail.item.title}. La hora corresponde a la zona horaria de tu dispositivo.</SheetDescription></SheetHeader>
        <form className="flex flex-col gap-4 px-4 pb-4" onSubmit={schedule}><FieldGroup>
          {selection('appointment-contact', 'Interesado', contactId, setContactId, contacts)}
          {selection('appointment-member', 'Responsable', assignedTo, setAssignedTo, members, true)}
          <Field><FieldLabel htmlFor="appointment-when">Fecha y hora</FieldLabel><Input id="appointment-when" type="datetime-local" required value={when} onChange={(event) => setWhen(event.target.value)} disabled={busy} /></Field>
          <Field><FieldLabel htmlFor="appointment-notes">Notas</FieldLabel><Textarea id="appointment-notes" maxLength={5000} value={notes} onChange={(event) => setNotes(event.target.value)} disabled={busy} /></Field>
        </FieldGroup>{formError && <Alert variant="destructive"><AlertDescription>{formError}</AlertDescription></Alert>}<Button disabled={busy || !contactId || !when}>{busy ? 'Agendando…' : 'Confirmar cita'}</Button>
        </form></SheetContent></Sheet>
      <AlertDialog open={archiving} onOpenChange={(open) => { if (!busy) setArchiving(open) }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Archivar ficha</AlertDialogTitle><AlertDialogDescription>La ficha dejará de estar disponible para nuevas oportunidades y citas. Se conservan su historial y sus relaciones. Podés recuperarla editando su disponibilidad.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={busy}>Volver</AlertDialogCancel><AlertDialogAction disabled={busy} onClick={(event) => { event.preventDefault(); void archive() }}>{busy ? 'Archivando…' : 'Archivar ficha'}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    </>}
  </div>
}

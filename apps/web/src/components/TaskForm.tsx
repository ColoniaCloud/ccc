'use client'
import { useEffect, useState } from 'react'
import { useApp } from '@/app/app/app-context'
import { loadContactOptions } from '@/lib/contact-options'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Alert, AlertDescription } from '@/components/ui/alert'
export type AgendaTask = { id: string; title: string; description: string | null; dueOn: string | null; done: boolean; assignedTo: string | null; responsibleName: string | null; contactId: string | null; contactName: string | null; dealId: string | null }
type Option = { id: string; name: string }
type Deal = { id: string; title: string; contactId: string | null; assignedTo: string | null }
export function TaskForm({ task, dealId: initialDeal, onSaved }: { task?: AgendaTask; dealId?: string; onSaved: () => void }) {
  const { apiFetch, me } = useApp()
  const [title, setTitle] = useState(task?.title ?? ''), [description, setDescription] = useState(task?.description ?? ''), [dueOn, setDueOn] = useState(task?.dueOn ?? '')
  const [assignedTo, setAssignedTo] = useState(task ? task.assignedTo ?? 'none' : me.member.id), [contactId, setContactId] = useState(task?.contactId ?? 'none'), [dealId, setDealId] = useState(task?.dealId ?? initialDeal ?? 'none')
  const [contacts, setContacts] = useState<Option[]>([]), [members, setMembers] = useState<Option[]>([]), [deals, setDeals] = useState<Deal[]>([])
  const [ready, setReady] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('')
  useEffect(() => {
    const controller = new AbortController()
    Promise.all([loadContactOptions(apiFetch, controller.signal), apiFetch(`/api/organizations/${encodeURIComponent(me.tenant.slug)}/team`, { signal: controller.signal }), apiFetch('/api/deals', { signal: controller.signal })]).then(async ([items, teamRes, dealsRes]) => {
      if (!teamRes.ok || !dealsRes.ok) throw new Error('No se pudieron cargar los contactos, oportunidades y responsables')
      const team = await teamRes.json(), data = await dealsRes.json()
      if (controller.signal.aborted) return
      setContacts(items); setMembers(team.items); setDeals(data.items); setReady(true)
      if (!task && initialDeal) {
        const deal = (data.items as Deal[]).find((item) => item.id === initialDeal)
        if (deal) { setContactId(deal.contactId ?? 'none'); setAssignedTo(deal.assignedTo ?? me.member.id); setTitle(`Seguimiento · ${deal.title}`) }
        else setError('La oportunidad ya no está disponible. Elegí otra.')
      }
    }).catch((err: Error) => { if (!controller.signal.aborted) setError(err.message) })
    return () => controller.abort()
  }, [apiFetch, me.tenant.slug, me.member.id, task, initialDeal])
  function selection(id: string, label: string, value: string, change: (value: string) => void, options: Option[]) {
    return <Field><FieldLabel htmlFor={id}>{label}</FieldLabel><Select value={value} onValueChange={(next) => { if (next) change(next) }} disabled={busy || !ready}><SelectTrigger id={id} className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="none">Sin asociar</SelectItem>{options.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError('')
    try {
      const res = await apiFetch(`/api/tasks${task ? `/${task.id}` : ''}`, { method: task ? 'PATCH' : 'POST', body: JSON.stringify({ title, description, dueOn: dueOn || null, assignedTo: assignedTo === 'none' ? null : assignedTo, contactId: contactId === 'none' ? null : contactId, dealId: dealId === 'none' ? null : dealId }) }), data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'No se pudo guardar la tarea')
      onSaved()
    } catch (err) { setError((err as Error).message) } finally { setBusy(false) }
  }
  return <form onSubmit={submit} className="flex flex-col gap-4"><FieldGroup>
    <Field><FieldLabel htmlFor="task-title">Título</FieldLabel><Input id="task-title" required maxLength={250} value={title} onChange={(event) => setTitle(event.target.value)} disabled={busy} /></Field>
    <Field><FieldLabel htmlFor="task-due">Vencimiento</FieldLabel><Input id="task-due" type="date" value={dueOn} onChange={(event) => setDueOn(event.target.value)} disabled={busy} /></Field>
    {selection('task-member', 'Responsable', assignedTo, setAssignedTo, members)}
    {selection('task-deal', 'Oportunidad', dealId, (value) => { setDealId(value); const deal = deals.find((item) => item.id === value); if (deal) { setContactId(deal.contactId ?? 'none'); if (deal.assignedTo) setAssignedTo(deal.assignedTo) } }, deals.map((deal) => ({ id: deal.id, name: deal.title })))}
    {selection('task-contact', 'Contacto', contactId, setContactId, contacts)}
    <Field><FieldLabel htmlFor="task-description">Notas</FieldLabel><Textarea id="task-description" value={description} maxLength={5000} onChange={(event) => setDescription(event.target.value)} disabled={busy} /></Field>
  </FieldGroup>{error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}<Button disabled={busy || !ready}>{busy ? 'Guardando…' : 'Guardar tarea'}</Button></form>
}

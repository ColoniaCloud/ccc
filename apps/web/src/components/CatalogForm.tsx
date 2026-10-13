'use client'

import { useEffect, useState } from 'react'
import type { CatalogKind } from '@crm/shared'
import { useApp } from '@/app/app/app-context'
import { catalogFields, initialCatalogValues, type CatalogRecord } from '@/lib/catalogs'
import { loadContactOptions } from '@/lib/contact-options'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

export function CatalogForm({ kind, item, onSaved }: { kind: CatalogKind; item?: CatalogRecord; onSaved: (item: CatalogRecord) => void }) {
  const { apiFetch, me } = useApp()
  const [values, setValues] = useState(() => initialCatalogValues(kind, item))
  const [contacts, setContacts] = useState<{ id: string; name: string }[]>([])
  const [members, setMembers] = useState<{ id: string; name: string }[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    const controller = new AbortController()
    Promise.all([
      loadContactOptions(apiFetch, controller.signal),
      apiFetch(`/api/organizations/${encodeURIComponent(me.tenant.slug)}/team`, { signal: controller.signal }),
    ]).then(async ([contactItems, memberRes]) => {
      if (!memberRes.ok) throw new Error('No se pudieron cargar los responsables')
      const memberData = await memberRes.json()
      if (!controller.signal.aborted) { setContacts(contactItems); setMembers(memberData.items) }
    }).catch((err: Error) => { if (!controller.signal.aborted) setError(err.message) })
    return () => controller.abort()
  }, [apiFetch, me.tenant.slug])
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError(null)
    try {
      const res = await apiFetch(`/api/${kind}${item ? `/${item.id}` : ''}`, { method: item ? 'PATCH' : 'POST',
        body: JSON.stringify({ ...values, sourceContactId: values.sourceContactId === 'none' ? null : values.sourceContactId, assignedTo: values.assignedTo === 'none' ? null : values.assignedTo }) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'No se pudo guardar la ficha')
      onSaved(data.item)
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo conectar con el servidor') }
    finally { setBusy(false) }
  }
  function select(key: string, label: string, options: [string, string][]) {
    return <Field key={key}><FieldLabel htmlFor={`catalog-${key}`}>{label}</FieldLabel>
      <Select value={values[key]} onValueChange={(value) => setValues((previous) => ({ ...previous, [key]: value }))} disabled={busy}>
        <SelectTrigger id={`catalog-${key}`} className="w-full"><SelectValue /></SelectTrigger>
        <SelectContent><SelectGroup>{options.map(([value, text]) => <SelectItem key={value} value={value}>{text}</SelectItem>)}</SelectGroup></SelectContent>
      </Select></Field>
  }
  return <form onSubmit={submit} className="flex flex-col gap-4">
    {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
    <FieldGroup className="grid gap-4 sm:grid-cols-2">
      {catalogFields(kind).map((field) => field.options ? select(field.key, field.label, field.options) : (
        <Field key={field.key}><FieldLabel htmlFor={`catalog-${field.key}`}>{field.label}</FieldLabel>
          <Input id={`catalog-${field.key}`} type={field.type ?? 'text'} required={field.required} min={field.min} step={field.step ?? (field.type === 'number' ? '1' : undefined)}
            maxLength={field.type ? undefined : 240} value={values[field.key]} disabled={busy} onChange={(event) => setValues((previous) => ({ ...previous, [field.key]: event.target.value }))} />
        </Field>
      ))}
      {select('sourceContactId', kind === 'properties' ? 'Propietario (contacto)' : 'Vendedor o consignante (contacto)', [['none','Sin asociar'], ...contacts.map((contact): [string, string] => [contact.id, contact.name])])}
      {select('assignedTo', 'Responsable', [['none','Sin asignar'], ...members.map((member): [string, string] => [member.id, member.name])])}
    </FieldGroup>
    <Field><FieldLabel htmlFor="catalog-notes">Notas</FieldLabel><Textarea id="catalog-notes" maxLength={5000} value={values.notes} disabled={busy} onChange={(event) => setValues((previous) => ({ ...previous, notes: event.target.value }))} /></Field>
    <Button type="submit" disabled={busy}>{busy ? 'Guardando…' : 'Guardar ficha'}</Button>
  </form>
}

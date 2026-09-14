'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  ArrowLeft01Icon,
  Clock01Icon,
  Contact01Icon,
  Delete02Icon,
  Note01Icon,
  Settings02Icon,
} from '@hugeicons/core-free-icons'
import type { ContactStatus, CustomFieldType } from '@crm/shared'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { useApp } from '../../app-context'

type CustomFieldValue = string | number | boolean | null

type Contact = {
  id: string
  name: string
  email: string | null
  phone: string | null
  companyName: string | null
  status: ContactStatus
  notes: string | null
  customFields: Record<string, CustomFieldValue>
}

type TagItem = { id: string; name: string; color: string | null }
type ActivityType = 'note' | 'status_change' | 'created' | 'updated'

type Activity = {
  id: string
  type: ActivityType
  content: string | null
  metadata: Record<string, unknown> | null
  createdAt: string
}

type FieldDefinition = {
  id: string
  key: string
  label: string
  fieldType: CustomFieldType
  options: string[] | null
  required: boolean
}

const STATUS_LABELS: Record<ContactStatus, string> = {
  lead: 'Lead',
  prospect: 'Prospecto',
  client: 'Cliente',
  inactive: 'Inactivo',
}

function formatActivityDate(iso: string) {
  return new Date(iso).toLocaleDateString('es-UY', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function describeActivity(activity: Activity) {
  if (activity.type === 'created') return 'Contacto creado'
  if (activity.type === 'status_change') {
    const from = activity.metadata?.from as string | undefined
    const to = activity.metadata?.to as string | undefined
    const fromLabel = from ? (STATUS_LABELS[from as ContactStatus] ?? from) : '—'
    const toLabel = to ? (STATUS_LABELS[to as ContactStatus] ?? to) : '—'
    return `Estado cambiado de ${fromLabel} a ${toLabel}`
  }
  if (activity.type === 'note') return activity.content ?? ''
  return activity.content ?? 'Contacto actualizado'
}

function initials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('')
}

export default function ContactDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { apiFetch } = useApp()

  const [contact, setContact] = useState<Contact | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [status, setStatus] = useState<ContactStatus>('lead')
  const [notes, setNotes] = useState('')

  const [allTags, setAllTags] = useState<TagItem[] | null>(null)
  const [contactTagIds, setContactTagIds] = useState<Set<string>>(new Set())
  const [newTagName, setNewTagName] = useState('')
  const [creatingTag, setCreatingTag] = useState(false)
  const [tagError, setTagError] = useState<string | null>(null)

  const [customFieldDefs, setCustomFieldDefs] = useState<FieldDefinition[] | null>(null)
  const [fieldValues, setFieldValues] = useState<Record<string, string | boolean>>({})
  const [savingFields, setSavingFields] = useState(false)
  const [fieldsError, setFieldsError] = useState<string | null>(null)

  const [activities, setActivities] = useState<Activity[] | null>(null)
  const [activitiesError, setActivitiesError] = useState<string | null>(null)
  const [noteContent, setNoteContent] = useState('')
  const [addingNote, setAddingNote] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function load() {
      const response = await apiFetch(`/api/contacts/${id}`)
      if (response.status === 404) {
        if (!cancelled) setNotFound(true)
        return
      }
      if (!response.ok) throw new Error('No se pudo cargar el contacto')

      const data = await response.json() as { item: Contact }
      if (!cancelled) {
        setContact(data.item)
        setName(data.item.name)
        setEmail(data.item.email ?? '')
        setPhone(data.item.phone ?? '')
        setCompanyName(data.item.companyName ?? '')
        setStatus(data.item.status)
        setNotes(data.item.notes ?? '')
      }
    }

    load().catch((loadError: unknown) => {
      if (!cancelled) setError(loadError instanceof Error ? loadError.message : 'No se pudo cargar el contacto')
    })
    return () => { cancelled = true }
  }, [apiFetch, id])

  useEffect(() => {
    let cancelled = false

    async function loadTags() {
      const [allResponse, contactResponse] = await Promise.all([
        apiFetch('/api/tags'),
        apiFetch(`/api/contacts/${id}/tags`),
      ])
      if (!allResponse.ok || !contactResponse.ok) throw new Error('No se pudieron cargar las etiquetas')
      const allData = await allResponse.json() as { items: TagItem[] }
      const contactData = await contactResponse.json() as { items: TagItem[] }

      if (!cancelled) {
        setAllTags(allData.items)
        setContactTagIds(new Set(contactData.items.map((tag) => tag.id)))
      }
    }

    loadTags().catch((loadError: unknown) => {
      if (!cancelled) setTagError(loadError instanceof Error ? loadError.message : 'No se pudieron cargar las etiquetas')
    })
    return () => { cancelled = true }
  }, [apiFetch, id])

  useEffect(() => {
    let cancelled = false

    async function loadDefinitions() {
      const response = await apiFetch('/api/custom-fields?entityType=contact')
      if (!response.ok) throw new Error('No se pudieron cargar los campos personalizados')
      const data = await response.json() as { items: FieldDefinition[] }
      if (!cancelled) setCustomFieldDefs(data.items)
    }

    loadDefinitions().catch((loadError: unknown) => {
      if (!cancelled) setFieldsError(loadError instanceof Error ? loadError.message : 'No se pudieron cargar los campos personalizados')
    })
    return () => { cancelled = true }
  }, [apiFetch])

  async function loadActivities() {
    const response = await apiFetch(`/api/contacts/${id}/activities`)
    if (!response.ok) throw new Error('No se pudo cargar la actividad')
    const data = await response.json() as { items: Activity[] }
    setActivities(data.items)
  }

  useEffect(() => {
    let cancelled = false
    loadActivities().catch((loadError: unknown) => {
      if (!cancelled) setActivitiesError(loadError instanceof Error ? loadError.message : 'No se pudo cargar la actividad')
    })
    return () => { cancelled = true }
  }, [apiFetch, id])

  useEffect(() => {
    if (!contact || !customFieldDefs) return
    const initial: Record<string, string | boolean> = {}
    for (const definition of customFieldDefs) {
      const raw = contact.customFields[definition.key]
      if (definition.fieldType === 'boolean') initial[definition.key] = Boolean(raw)
      else if (definition.fieldType === 'date' && raw) initial[definition.key] = String(raw).slice(0, 10)
      else initial[definition.key] = raw === null || raw === undefined ? '' : String(raw)
    }
    setFieldValues(initial)
  }, [contact, customFieldDefs])

  function setFieldValue(key: string, fieldValue: string | boolean) {
    setFieldValues((previous) => ({ ...previous, [key]: fieldValue }))
  }

  async function handleSaveFields(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFieldsError(null)
    setSavingFields(true)
    try {
      const response = await apiFetch(`/api/contacts/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ customFields: fieldValues }),
      })
      if (!response.ok) {
        const body = await response.json().catch(() => null) as { error?: string } | null
        throw new Error(body?.error ?? 'No se pudieron guardar los campos')
      }
      const data = await response.json() as { item: Contact }
      setContact(data.item)
    } catch (saveError: unknown) {
      setFieldsError(saveError instanceof Error ? saveError.message : 'No se pudieron guardar los campos')
    } finally {
      setSavingFields(false)
    }
  }

  async function persistTags(nextIds: Set<string>) {
    const response = await apiFetch(`/api/contacts/${id}/tags`, {
      method: 'PUT',
      body: JSON.stringify({ tagIds: Array.from(nextIds) }),
    })
    if (!response.ok) throw new Error('No se pudieron actualizar las etiquetas')
  }

  async function toggleTag(tagId: string) {
    const previous = contactTagIds
    const next = new Set(previous)
    if (next.has(tagId)) next.delete(tagId)
    else next.add(tagId)
    setContactTagIds(next)
    setTagError(null)

    try {
      await persistTags(next)
    } catch (updateError: unknown) {
      setContactTagIds(previous)
      setTagError(updateError instanceof Error ? updateError.message : 'No se pudo actualizar la etiqueta')
    }
  }

  async function handleAddTag(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmed = newTagName.trim()
    if (!trimmed) return

    setCreatingTag(true)
    setTagError(null)
    try {
      const response = await apiFetch('/api/tags', {
        method: 'POST',
        body: JSON.stringify({ name: trimmed }),
      })
      if (!response.ok) throw new Error('No se pudo crear la etiqueta')
      const data = await response.json() as { item: TagItem }

      setAllTags((previous) => {
        const list = previous ?? []
        return list.some((tag) => tag.id === data.item.id)
          ? list
          : [...list, data.item].sort((first, second) => first.name.localeCompare(second.name))
      })

      const next = new Set(contactTagIds).add(data.item.id)
      setContactTagIds(next)
      await persistTags(next)
      setNewTagName('')
    } catch (createError: unknown) {
      setTagError(createError instanceof Error ? createError.message : 'No se pudo crear la etiqueta')
    } finally {
      setCreatingTag(false)
    }
  }

  async function handleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setSaving(true)
    try {
      const response = await apiFetch(`/api/contacts/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name, email, phone, companyName, status, notes }),
      })
      if (!response.ok) {
        const body = await response.json().catch(() => null) as { error?: string } | null
        throw new Error(body?.error ?? 'No se pudo guardar el contacto')
      }
      const data = await response.json() as { item: Contact }
      setContact(data.item)
      await loadActivities()
    } catch (saveError: unknown) {
      setError(saveError instanceof Error ? saveError.message : 'No se pudo guardar el contacto')
    } finally {
      setSaving(false)
    }
  }

  async function handleAddNote(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmed = noteContent.trim()
    if (!trimmed) return

    setAddingNote(true)
    setActivitiesError(null)
    try {
      const response = await apiFetch(`/api/contacts/${id}/activities`, {
        method: 'POST',
        body: JSON.stringify({ content: trimmed }),
      })
      if (!response.ok) throw new Error('No se pudo agregar la nota')
      setNoteContent('')
      await loadActivities()
    } catch (createError: unknown) {
      setActivitiesError(createError instanceof Error ? createError.message : 'No se pudo agregar la nota')
    } finally {
      setAddingNote(false)
    }
  }

  async function handleDelete() {
    setDeleting(true)
    setError(null)
    try {
      const response = await apiFetch(`/api/contacts/${id}`, { method: 'DELETE' })
      if (!response.ok) throw new Error('No se pudo eliminar el contacto')
      router.push('/app/contacts')
    } catch (deleteError: unknown) {
      setError(deleteError instanceof Error ? deleteError.message : 'No se pudo eliminar el contacto')
      setDeleteOpen(false)
      setDeleting(false)
    }
  }

  if (notFound) {
    return (
      <div className="page">
        <Card>
          <CardHeader><CardTitle>Contacto no encontrado</CardTitle><CardDescription>Es posible que haya sido eliminado o que el enlace no sea correcto.</CardDescription></CardHeader>
          <CardContent>
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon"><HugeiconsIcon icon={Contact01Icon} strokeWidth={1.8} /></EmptyMedia>
                <EmptyTitle>Este contacto no existe</EmptyTitle>
                <EmptyDescription>Volvé al directorio para continuar trabajando.</EmptyDescription>
              </EmptyHeader>
              <EmptyContent><Button variant="outline" asChild><Link href="/app/contacts">Volver a contactos</Link></Button></EmptyContent>
            </Empty>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!contact) {
    return (
      <div className="page contact-detail-loading" aria-label="Cargando contacto">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-96 w-full" />
      </div>
    )
  }

  return (
    <div className="page contact-profile-page">
      <Button variant="ghost" size="sm" asChild className="contact-back-button">
        <Link href="/app/contacts">
          <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={2} data-icon="inline-start" />
          Volver a contactos
        </Link>
      </Button>

      <div className="contact-profile-header">
        <div className="contact-profile-identity">
          <Avatar size="lg"><AvatarFallback>{initials(contact.name)}</AvatarFallback></Avatar>
          <div>
            <div className="crm-title-row">
              <h1>{contact.name}</h1>
              <Badge variant="outline" data-contact-status={contact.status}>{STATUS_LABELS[contact.status]}</Badge>
            </div>
            <p>{contact.companyName ?? contact.email ?? 'Sin empresa ni email registrados'}</p>
          </div>
        </div>
        <Button variant="destructive" onClick={() => setDeleteOpen(true)}>
          <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} data-icon="inline-start" />
          Eliminar contacto
        </Button>
      </div>

      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}

      <Tabs defaultValue="information" className="contact-profile-tabs">
        <TabsList variant="line">
          <TabsTrigger value="information"><HugeiconsIcon icon={Contact01Icon} strokeWidth={1.8} data-icon="inline-start" />Información</TabsTrigger>
          <TabsTrigger value="fields"><HugeiconsIcon icon={Settings02Icon} strokeWidth={1.8} data-icon="inline-start" />Campos</TabsTrigger>
          <TabsTrigger value="activity"><HugeiconsIcon icon={Clock01Icon} strokeWidth={1.8} data-icon="inline-start" />Actividad</TabsTrigger>
        </TabsList>

        <TabsContent value="information" className="contact-tab-content">
          <div className="contact-information-grid">
            <Card>
              <CardHeader>
                <CardTitle>Datos del contacto</CardTitle>
                <CardDescription>Información principal visible para todo el equipo.</CardDescription>
              </CardHeader>
              <form onSubmit={handleSave}>
                <CardContent>
                  <FieldGroup>
                    <div className="crm-field-grid">
                      <Field>
                        <FieldLabel htmlFor="detail-name">Nombre</FieldLabel>
                        <Input id="detail-name" required value={name} onChange={(event) => setName(event.target.value)} />
                      </Field>
                      <Field>
                        <FieldLabel htmlFor="detail-status">Estado</FieldLabel>
                        <Select value={status} onValueChange={(nextStatus) => setStatus(nextStatus as ContactStatus)}>
                          <SelectTrigger id="detail-status" className="w-full"><SelectValue /></SelectTrigger>
                          <SelectContent position="popper">
                            <SelectGroup>{Object.entries(STATUS_LABELS).map(([key, label]) => <SelectItem key={key} value={key}>{label}</SelectItem>)}</SelectGroup>
                          </SelectContent>
                        </Select>
                      </Field>
                      <Field>
                        <FieldLabel htmlFor="detail-email">Email</FieldLabel>
                        <Input id="detail-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
                      </Field>
                      <Field>
                        <FieldLabel htmlFor="detail-phone">Teléfono</FieldLabel>
                        <Input id="detail-phone" value={phone} onChange={(event) => setPhone(event.target.value)} />
                      </Field>
                    </div>
                    <Field>
                      <FieldLabel htmlFor="detail-company">Empresa</FieldLabel>
                      <Input id="detail-company" value={companyName} onChange={(event) => setCompanyName(event.target.value)} />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="detail-notes">Notas internas</FieldLabel>
                      <Textarea id="detail-notes" rows={5} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Contexto, preferencias o información relevante…" />
                    </Field>
                  </FieldGroup>
                </CardContent>
                <CardFooter className="contact-card-footer"><Button type="submit" disabled={saving}>{saving ? 'Guardando…' : 'Guardar cambios'}</Button></CardFooter>
              </form>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Etiquetas</CardTitle>
                <CardDescription>Clasificá este contacto para encontrarlo y segmentarlo rápidamente.</CardDescription>
              </CardHeader>
              <CardContent>
                {tagError && <Alert variant="destructive" className="mb-3"><AlertDescription>{tagError}</AlertDescription></Alert>}
                {!allTags ? (
                  <div className="contact-tags-loading"><Skeleton className="h-9 w-full" /><Skeleton className="h-9 w-full" /></div>
                ) : allTags.length === 0 ? (
                  <Empty className="contact-tags-empty">
                    <EmptyHeader><EmptyTitle>Sin etiquetas todavía</EmptyTitle><EmptyDescription>Creá una abajo para empezar a segmentar.</EmptyDescription></EmptyHeader>
                  </Empty>
                ) : (
                  <FieldSet>
                    <FieldLegend variant="label">Etiquetas disponibles</FieldLegend>
                    <FieldGroup className="contact-tag-options">
                      {allTags.map((tag) => (
                        <Field orientation="horizontal" key={tag.id}>
                          <Checkbox id={`tag-${tag.id}`} checked={contactTagIds.has(tag.id)} onCheckedChange={() => void toggleTag(tag.id)} />
                          <FieldLabel htmlFor={`tag-${tag.id}`}>{tag.name}</FieldLabel>
                        </Field>
                      ))}
                    </FieldGroup>
                  </FieldSet>
                )}
              </CardContent>
              <CardFooter>
                <form className="contact-tag-form" onSubmit={handleAddTag}>
                  <Field>
                    <FieldLabel htmlFor="new-tag" className="sr-only">Nueva etiqueta</FieldLabel>
                    <Input id="new-tag" value={newTagName} onChange={(event) => setNewTagName(event.target.value)} placeholder="Nueva etiqueta" />
                  </Field>
                  <Button type="submit" variant="outline" disabled={creatingTag || !newTagName.trim()}>{creatingTag ? 'Creando…' : 'Agregar'}</Button>
                </form>
              </CardFooter>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="fields" className="contact-tab-content">
          <Card>
            <CardHeader>
              <CardTitle>Campos personalizados</CardTitle>
              <CardDescription>Información adaptada al proceso comercial de tu organización.</CardDescription>
            </CardHeader>
            <CardContent>
              {fieldsError && <Alert variant="destructive" className="mb-3"><AlertDescription>{fieldsError}</AlertDescription></Alert>}
              {!customFieldDefs ? (
                <div className="contact-fields-loading"><Skeleton className="h-9 w-full" /><Skeleton className="h-9 w-full" /><Skeleton className="h-9 w-full" /></div>
              ) : customFieldDefs.length === 0 ? (
                <Empty className="contact-fields-empty">
                  <EmptyHeader>
                    <EmptyMedia variant="icon"><HugeiconsIcon icon={Settings02Icon} strokeWidth={1.8} /></EmptyMedia>
                    <EmptyTitle>No hay campos personalizados</EmptyTitle>
                    <EmptyDescription>Creá campos para capturar los datos específicos de tu negocio.</EmptyDescription>
                  </EmptyHeader>
                  <EmptyContent><Button variant="outline" asChild><Link href="/app/settings/custom-fields">Configurar campos</Link></Button></EmptyContent>
                </Empty>
              ) : (
                <form onSubmit={handleSaveFields}>
                  <FieldGroup className="contact-custom-fields">
                    {customFieldDefs.map((definition) => {
                      const stringValue = typeof fieldValues[definition.key] === 'string' ? fieldValues[definition.key] as string : ''
                      return definition.fieldType === 'boolean' ? (
                        <Field orientation="horizontal" key={definition.id}>
                          <FieldLabel htmlFor={`cf-${definition.key}`}>{definition.label}{definition.required ? ' *' : ''}</FieldLabel>
                          <Switch id={`cf-${definition.key}`} checked={Boolean(fieldValues[definition.key])} onCheckedChange={(checked) => setFieldValue(definition.key, checked)} />
                        </Field>
                      ) : (
                        <Field key={definition.id}>
                          <FieldLabel htmlFor={`cf-${definition.key}`}>{definition.label}{definition.required ? ' *' : ''}</FieldLabel>
                          {definition.fieldType === 'select' ? (
                            <Select value={stringValue || 'none'} onValueChange={(selected) => setFieldValue(definition.key, selected === 'none' ? '' : selected)}>
                              <SelectTrigger id={`cf-${definition.key}`} className="w-full"><SelectValue placeholder="Sin valor" /></SelectTrigger>
                              <SelectContent position="popper">
                                <SelectGroup>
                                  <SelectItem value="none">Sin valor</SelectItem>
                                  {(definition.options ?? []).map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}
                                </SelectGroup>
                              </SelectContent>
                            </Select>
                          ) : (
                            <Input
                              id={`cf-${definition.key}`}
                              type={definition.fieldType === 'number' ? 'number' : definition.fieldType === 'date' ? 'date' : 'text'}
                              value={stringValue}
                              onChange={(event) => setFieldValue(definition.key, event.target.value)}
                            />
                          )}
                        </Field>
                      )
                    })}
                  </FieldGroup>
                  <div className="contact-fields-actions"><Button type="submit" disabled={savingFields}>{savingFields ? 'Guardando…' : 'Guardar campos'}</Button></div>
                </form>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="activity" className="contact-tab-content">
          <Card>
            <CardHeader>
              <CardTitle>Actividad</CardTitle>
              <CardDescription>Notas y cambios registrados para este contacto.</CardDescription>
            </CardHeader>
            <CardContent>
              <form className="contact-note-form" onSubmit={handleAddNote}>
                <Field>
                  <FieldLabel htmlFor="contact-note">Agregar nota</FieldLabel>
                  <Textarea id="contact-note" rows={3} value={noteContent} onChange={(event) => setNoteContent(event.target.value)} placeholder="Escribí el resultado de una llamada, reunión o seguimiento…" />
                </Field>
                <Button type="submit" disabled={addingNote || !noteContent.trim()}>
                  <HugeiconsIcon icon={Note01Icon} strokeWidth={2} data-icon="inline-start" />
                  {addingNote ? 'Agregando…' : 'Agregar nota'}
                </Button>
              </form>

              {activitiesError && <Alert variant="destructive" className="mt-4"><AlertDescription>{activitiesError}</AlertDescription></Alert>}
              {!activities ? (
                <div className="contact-activity-loading"><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" /></div>
              ) : activities.length === 0 ? (
                <Empty className="contact-activity-empty"><EmptyHeader><EmptyTitle>Sin actividad registrada</EmptyTitle><EmptyDescription>Agregá una nota para iniciar el historial.</EmptyDescription></EmptyHeader></Empty>
              ) : (
                <ol className="contact-timeline">
                  {activities.map((activity) => (
                    <li key={activity.id} data-activity-type={activity.type}>
                      <span className="contact-timeline-marker" />
                      <div>
                        <p>{describeActivity(activity)}</p>
                        <time dateTime={activity.createdAt}>{formatActivityDate(activity.createdAt)}</time>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <AlertDialog open={deleteOpen} onOpenChange={(open) => { if (!deleting) setDeleteOpen(open) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia><HugeiconsIcon icon={Delete02Icon} strokeWidth={1.8} /></AlertDialogMedia>
            <AlertDialogTitle>Eliminar contacto</AlertDialogTitle>
            <AlertDialogDescription>Vas a eliminar a {contact.name} y su información asociada. Esta acción no se puede deshacer.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={deleting} onClick={() => void handleDelete()}>{deleting ? 'Eliminando…' : 'Eliminar definitivamente'}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import type { ContactStatus, CustomFieldType } from '@crm/shared'
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
  lead:     'Lead',
  prospect: 'Prospecto',
  client:   'Cliente',
  inactive: 'Inactivo',
}

function formatActivityDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-UY', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

function describeActivity(activity: Activity): string {
  if (activity.type === 'created') return 'Contacto creado'
  if (activity.type === 'status_change') {
    const from = activity.metadata?.from as string | undefined
    const to   = activity.metadata?.to as string | undefined
    const fromLabel = from ? (STATUS_LABELS[from as ContactStatus] ?? from) : '—'
    const toLabel   = to ? (STATUS_LABELS[to as ContactStatus] ?? to) : '—'
    return `Estado cambiado de ${fromLabel} a ${toLabel}`
  }
  if (activity.type === 'note') return activity.content ?? ''
  return activity.content ?? 'Contacto actualizado'
}

export default function ContactDetailPage() {
  const { id }  = useParams<{ id: string }>()
  const router  = useRouter()
  const { apiFetch } = useApp()

  const [contact, setContact]   = useState<Contact | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const [saving, setSaving]     = useState(false)
  const [deleting, setDeleting] = useState(false)

  const [name, setName]               = useState('')
  const [email, setEmail]             = useState('')
  const [phone, setPhone]             = useState('')
  const [companyName, setCompanyName] = useState('')
  const [status, setStatus]           = useState<ContactStatus>('lead')
  const [notes, setNotes]             = useState('')

  const [allTags, setAllTags]           = useState<TagItem[] | null>(null)
  const [contactTagIds, setContactTagIds] = useState<Set<string>>(new Set())
  const [newTagName, setNewTagName]     = useState('')
  const [creatingTag, setCreatingTag]   = useState(false)
  const [tagError, setTagError]         = useState<string | null>(null)

  const [customFieldDefs, setCustomFieldDefs] = useState<FieldDefinition[] | null>(null)
  const [fieldValues, setFieldValues]         = useState<Record<string, string | boolean>>({})
  const [savingFields, setSavingFields]       = useState(false)
  const [fieldsError, setFieldsError]         = useState<string | null>(null)

  const [activities, setActivities]           = useState<Activity[] | null>(null)
  const [activitiesError, setActivitiesError] = useState<string | null>(null)
  const [noteContent, setNoteContent]         = useState('')
  const [addingNote, setAddingNote]           = useState(false)

  useEffect(() => {
    let cancelled = false

    async function load() {
      const res = await apiFetch(`/api/contacts/${id}`)

      if (res.status === 404) {
        if (!cancelled) setNotFound(true)
        return
      }
      if (!res.ok) {
        throw new Error('No se pudo cargar el contacto')
      }

      const data = await res.json() as { item: Contact }

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

    load().catch(() => { if (!cancelled) setError('No se pudo cargar el contacto') })

    return () => { cancelled = true }
  }, [apiFetch, id])

  useEffect(() => {
    let cancelled = false

    async function loadTags() {
      const [allRes, contactRes] = await Promise.all([
        apiFetch('/api/tags'),
        apiFetch(`/api/contacts/${id}/tags`),
      ])
      const allData     = await allRes.json() as { items: TagItem[] }
      const contactData = await contactRes.json() as { items: TagItem[] }

      if (!cancelled) {
        setAllTags(allData.items)
        setContactTagIds(new Set(contactData.items.map((t) => t.id)))
      }
    }

    loadTags().catch(() => { if (!cancelled) setTagError('No se pudieron cargar las etiquetas') })

    return () => { cancelled = true }
  }, [apiFetch, id])

  useEffect(() => {
    let cancelled = false

    async function loadDefs() {
      const res  = await apiFetch('/api/custom-fields?entityType=contact')
      const data = await res.json() as { items: FieldDefinition[] }
      if (!cancelled) setCustomFieldDefs(data.items)
    }

    loadDefs().catch(() => { if (!cancelled) setFieldsError('No se pudieron cargar los campos personalizados') })

    return () => { cancelled = true }
  }, [apiFetch])

  async function loadActivities() {
    const res  = await apiFetch(`/api/contacts/${id}/activities`)
    const data = await res.json() as { items: Activity[] }
    setActivities(data.items)
  }

  useEffect(() => {
    let cancelled = false

    loadActivities().catch(() => { if (!cancelled) setActivitiesError('No se pudo cargar la actividad') })

    return () => { cancelled = true }
  }, [apiFetch, id])

  useEffect(() => {
    if (!contact || !customFieldDefs) return

    const initial: Record<string, string | boolean> = {}
    for (const def of customFieldDefs) {
      const raw = contact.customFields[def.key]
      if (def.fieldType === 'boolean') {
        initial[def.key] = Boolean(raw)
      } else if (def.fieldType === 'date' && raw) {
        initial[def.key] = String(raw).slice(0, 10)
      } else {
        initial[def.key] = raw === null || raw === undefined ? '' : String(raw)
      }
    }
    setFieldValues(initial)
  }, [contact, customFieldDefs])

  function setFieldValue(key: string, value: string | boolean) {
    setFieldValues((prev) => ({ ...prev, [key]: value }))
  }

  async function handleSaveFields(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setFieldsError(null)
    setSavingFields(true)

    try {
      const res = await apiFetch(`/api/contacts/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ customFields: fieldValues }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => null) as { error?: string } | null
        throw new Error(body?.error ?? 'No se pudieron guardar los campos')
      }

      const data = await res.json() as { item: Contact }
      setContact(data.item)
    } catch (err: unknown) {
      setFieldsError(err instanceof Error ? err.message : 'No se pudieron guardar los campos')
    } finally {
      setSavingFields(false)
    }
  }

  async function persistTags(nextIds: Set<string>) {
    const res = await apiFetch(`/api/contacts/${id}/tags`, {
      method: 'PUT',
      body: JSON.stringify({ tagIds: Array.from(nextIds) }),
    })
    if (!res.ok) {
      throw new Error('No se pudieron actualizar las etiquetas')
    }
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
    } catch (err) {
      setContactTagIds(previous)
      setTagError(err instanceof Error ? err.message : 'No se pudo actualizar la etiqueta')
    }
  }

  async function handleAddTag(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const trimmed = newTagName.trim()
    if (!trimmed) return

    setCreatingTag(true)
    setTagError(null)

    try {
      const res = await apiFetch('/api/tags', {
        method: 'POST',
        body: JSON.stringify({ name: trimmed }),
      })
      if (!res.ok) {
        throw new Error('No se pudo crear la etiqueta')
      }

      const data = await res.json() as { item: TagItem }

      setAllTags((prev) => {
        const list = prev ?? []
        return list.some((t) => t.id === data.item.id)
          ? list
          : [...list, data.item].sort((a, b) => a.name.localeCompare(b.name))
      })

      const next = new Set(contactTagIds).add(data.item.id)
      setContactTagIds(next)
      await persistTags(next)
      setNewTagName('')
    } catch (err) {
      setTagError(err instanceof Error ? err.message : 'No se pudo crear la etiqueta')
    } finally {
      setCreatingTag(false)
    }
  }

  async function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setSaving(true)

    try {
      const res = await apiFetch(`/api/contacts/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name, email, phone, companyName, status, notes }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => null) as { error?: string } | null
        throw new Error(body?.error ?? 'No se pudo guardar el contacto')
      }

      const data = await res.json() as { item: Contact }
      setContact(data.item)
      await loadActivities()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar el contacto')
    } finally {
      setSaving(false)
    }
  }

  async function handleAddNote(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const trimmed = noteContent.trim()
    if (!trimmed) return

    setAddingNote(true)
    setActivitiesError(null)

    try {
      const res = await apiFetch(`/api/contacts/${id}/activities`, {
        method: 'POST',
        body: JSON.stringify({ content: trimmed }),
      })
      if (!res.ok) {
        throw new Error('No se pudo agregar la nota')
      }
      setNoteContent('')
      await loadActivities()
    } catch (err) {
      setActivitiesError(err instanceof Error ? err.message : 'No se pudo agregar la nota')
    } finally {
      setAddingNote(false)
    }
  }

  async function handleDelete() {
    setDeleting(true)
    await apiFetch(`/api/contacts/${id}`, { method: 'DELETE' })
    router.push('/app/contacts')
  }

  if (notFound) {
    return (
      <div className="page">
        <p className="empty-state">Este contacto no existe.</p>
        <Link href="/app/contacts" className="btn-ghost" style={{ alignSelf: 'flex-start' }}>Volver a contactos</Link>
      </div>
    )
  }

  if (!contact) {
    return (
      <div className="page">
        <p className="empty-state">Cargando…</p>
      </div>
    )
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <Link href="/app/contacts" className="back-link">← Contactos</Link>
          <h1>{contact.name}</h1>
        </div>
        <button className="link-danger" onClick={handleDelete} disabled={deleting}>
          {deleting ? 'Eliminando…' : 'Eliminar contacto'}
        </button>
      </div>

      {error && <div className="form-error">{error}</div>}

      <div className="contact-detail">
        <div className="contact-detail-main">
          <div className="panel">
            <h2>Datos del contacto</h2>
            <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-4)' }}>
              <div className="detail-form-grid">
                <div className="inline-field">
                  <label htmlFor="detail-name">Nombre</label>
                  <input id="detail-name" required value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                <div className="inline-field">
                  <label htmlFor="detail-status">Estado</label>
                  <select id="detail-status" value={status} onChange={(e) => setStatus(e.target.value as ContactStatus)}>
                    {Object.entries(STATUS_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </div>
                <div className="inline-field">
                  <label htmlFor="detail-email">Email</label>
                  <input id="detail-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                <div className="inline-field">
                  <label htmlFor="detail-phone">Teléfono</label>
                  <input id="detail-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
                </div>
                <div className="inline-field span-2">
                  <label htmlFor="detail-company">Empresa</label>
                  <input id="detail-company" value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
                </div>
                <div className="inline-field span-2">
                  <label htmlFor="detail-notes">Notas</label>
                  <textarea id="detail-notes" rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} />
                </div>
              </div>
              <button type="submit" className="btn" disabled={saving} style={{ alignSelf: 'flex-start' }}>
                {saving ? 'Guardando…' : 'Guardar cambios'}
              </button>
            </form>
          </div>

          <div className="panel">
            <h2>Etiquetas</h2>

            {tagError && (
              <div className="form-error" style={{ marginBottom: 'var(--spacing-3)' }}>{tagError}</div>
            )}

            {!allTags ? (
              <p className="empty-state">Cargando…</p>
            ) : (
              <>
                <div className="tag-chip-row" style={{ marginBottom: 'var(--spacing-3)' }}>
                  {allTags.length === 0 ? (
                    <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-tertiary)' }}>
                      Todavía no creaste etiquetas.
                    </span>
                  ) : (
                    allTags.map((tag) => (
                      <button
                        key={tag.id}
                        type="button"
                        className={`tag-chip tag-chip-toggle${contactTagIds.has(tag.id) ? ' active' : ''}`}
                        onClick={() => toggleTag(tag.id)}
                      >
                        {tag.name}
                      </button>
                    ))
                  )}
                </div>
                <form className="tag-chip-add-form" onSubmit={handleAddTag}>
                  <input
                    value={newTagName}
                    onChange={(e) => setNewTagName(e.target.value)}
                    placeholder="Nueva etiqueta"
                  />
                  <button type="submit" className="btn-ghost" disabled={creatingTag || !newTagName.trim()}>
                    {creatingTag ? 'Creando…' : 'Agregar'}
                  </button>
                </form>
              </>
            )}
          </div>

          <div className="panel">
            <h2>Campos personalizados</h2>

            {fieldsError && (
              <div className="form-error" style={{ marginBottom: 'var(--spacing-3)' }}>{fieldsError}</div>
            )}

            {!customFieldDefs ? (
              <p className="empty-state">Cargando…</p>
            ) : customFieldDefs.length === 0 ? (
              <p className="empty-state">
                Todavía no hay campos personalizados. Podés crearlos en{' '}
                <Link href="/app/settings/custom-fields">Configuración</Link>.
              </p>
            ) : (
              <form onSubmit={handleSaveFields} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-4)' }}>
                <div className="detail-form-grid">
                  {customFieldDefs.map((def) => (
                    <div key={def.id} className="inline-field">
                      <label htmlFor={`cf-${def.key}`}>{def.label}{def.required ? ' *' : ''}</label>
                      {def.fieldType === 'boolean' ? (
                        <div style={{ display: 'flex', alignItems: 'center', paddingTop: 'var(--spacing-1)' }}>
                          <input
                            id={`cf-${def.key}`} type="checkbox"
                            checked={Boolean(fieldValues[def.key])}
                            onChange={(e) => setFieldValue(def.key, e.target.checked)}
                          />
                        </div>
                      ) : def.fieldType === 'select' ? (
                        <select
                          id={`cf-${def.key}`}
                          value={typeof fieldValues[def.key] === 'string' ? fieldValues[def.key] as string : ''}
                          onChange={(e) => setFieldValue(def.key, e.target.value)}
                        >
                          <option value="">—</option>
                          {(def.options ?? []).map((opt) => (
                            <option key={opt} value={opt}>{opt}</option>
                          ))}
                        </select>
                      ) : (
                        <input
                          id={`cf-${def.key}`}
                          type={def.fieldType === 'number' ? 'number' : def.fieldType === 'date' ? 'date' : 'text'}
                          value={typeof fieldValues[def.key] === 'string' ? fieldValues[def.key] as string : ''}
                          onChange={(e) => setFieldValue(def.key, e.target.value)}
                        />
                      )}
                    </div>
                  ))}
                </div>
                <button type="submit" className="btn" disabled={savingFields} style={{ alignSelf: 'flex-start' }}>
                  {savingFields ? 'Guardando…' : 'Guardar campos'}
                </button>
              </form>
            )}
          </div>
        </div>

        <div className="contact-detail-side">
          <div className="panel">
            <h2>Actividad</h2>

            {activitiesError && (
              <div className="form-error" style={{ marginBottom: 'var(--spacing-3)' }}>{activitiesError}</div>
            )}

            <form className="tag-chip-add-form" onSubmit={handleAddNote} style={{ marginBottom: 'var(--spacing-4)' }}>
              <input
                value={noteContent}
                onChange={(e) => setNoteContent(e.target.value)}
                placeholder="Agregar una nota…"
              />
              <button type="submit" className="btn-ghost" disabled={addingNote || !noteContent.trim()}>
                {addingNote ? 'Agregando…' : 'Agregar'}
              </button>
            </form>

            {!activities ? (
              <p className="empty-state">Cargando…</p>
            ) : activities.length === 0 ? (
              <p className="empty-state">Todavía no hay actividad registrada.</p>
            ) : (
              <ul className="timeline">
                {activities.map((activity) => (
                  <li key={activity.id} className={`timeline-item timeline-item-${activity.type}`}>
                    <p className="timeline-content">{describeActivity(activity)}</p>
                    <span className="timeline-date">{formatActivityDate(activity.createdAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

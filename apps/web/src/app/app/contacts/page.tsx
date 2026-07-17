'use client'

import { useEffect, useState } from 'react'
import { useApp } from '../app-context'

type ContactStatus = 'lead' | 'prospect' | 'client' | 'inactive'

type Contact = {
  id: string
  name: string
  email: string | null
  phone: string | null
  companyName: string | null
  status: ContactStatus
}

const STATUS_LABELS: Record<ContactStatus, string> = {
  lead:     'Lead',
  prospect: 'Prospecto',
  client:   'Cliente',
  inactive: 'Inactivo',
}

export default function ContactsPage() {
  const { apiFetch } = useApp()

  const [contacts, setContacts]   = useState<Contact[] | null>(null)
  const [error, setError]         = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const [name, setName]       = useState('')
  const [email, setEmail]     = useState('')
  const [phone, setPhone]     = useState('')
  const [company, setCompany] = useState('')

  async function loadContacts() {
    const res  = await apiFetch('/api/contacts')
    const data = await res.json() as { items: Contact[] }
    setContacts(data.items)
  }

  useEffect(() => {
    loadContacts().catch(() => setError('No se pudieron cargar los contactos'))
  }, [apiFetch])

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)

    try {
      const res = await apiFetch('/api/contacts', {
        method: 'POST',
        body: JSON.stringify({
          name,
          email:       email || undefined,
          phone:       phone || undefined,
          companyName: company || undefined,
        }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => null) as { error?: string } | null
        throw new Error(body?.error ?? 'No se pudo crear el contacto')
      }

      setName('')
      setEmail('')
      setPhone('')
      setCompany('')
      await loadContacts()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'No se pudo crear el contacto')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete(id: string) {
    await apiFetch(`/api/contacts/${id}`, { method: 'DELETE' })
    setContacts((prev) => prev?.filter((contact) => contact.id !== id) ?? null)
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Contactos</h1>
          <p>Leads, prospectos y clientes de tu organización.</p>
        </div>
      </div>

      <div className="panel">
        <form className="inline-form" onSubmit={handleSubmit}>
          <div className="inline-field">
            <label htmlFor="contact-name">Nombre</label>
            <input
              id="contact-name" required
              value={name} onChange={(e) => setName(e.target.value)}
              placeholder="María Fernández"
            />
          </div>
          <div className="inline-field">
            <label htmlFor="contact-email">Email</label>
            <input
              id="contact-email" type="email"
              value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="maria@empresa.com"
            />
          </div>
          <div className="inline-field">
            <label htmlFor="contact-phone">Teléfono</label>
            <input
              id="contact-phone"
              value={phone} onChange={(e) => setPhone(e.target.value)}
              placeholder="+598 99 123 456"
            />
          </div>
          <div className="inline-field">
            <label htmlFor="contact-company">Empresa</label>
            <input
              id="contact-company"
              value={company} onChange={(e) => setCompany(e.target.value)}
              placeholder="Acme SRL"
            />
          </div>
          <button type="submit" className="btn" disabled={submitting}>
            {submitting ? 'Agregando…' : 'Agregar contacto'}
          </button>
        </form>

        {error && (
          <div className="form-error" style={{ marginTop: 'var(--spacing-4)' }}>{error}</div>
        )}
      </div>

      <div className="panel">
        {!contacts ? (
          <p className="empty-state">Cargando…</p>
        ) : contacts.length === 0 ? (
          <p className="empty-state">Todavía no agregaste ningún contacto.</p>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Empresa</th>
                  <th>Email</th>
                  <th>Teléfono</th>
                  <th>Estado</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {contacts.map((contact) => (
                  <tr key={contact.id}>
                    <td>{contact.name}</td>
                    <td>{contact.companyName ?? '—'}</td>
                    <td>{contact.email ?? '—'}</td>
                    <td>{contact.phone ?? '—'}</td>
                    <td><span className={`pill pill-${contact.status}`}>{STATUS_LABELS[contact.status]}</span></td>
                    <td>
                      <button className="link-danger" onClick={() => handleDelete(contact.id)}>Eliminar</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

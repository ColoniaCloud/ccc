'use client'

import { useState } from 'react'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

export default function ContactoPage() {
  const [name, setName]       = useState('')
  const [email, setEmail]     = useState('')
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError]     = useState<string | null>(null)
  const [sent, setSent]       = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)

    try {
      const res = await fetch(`${API_URL}/api/contact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, message }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => null) as { error?: string } | null
        throw new Error(body?.error ?? 'No se pudo enviar el mensaje')
      }

      setSent(true)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'No se pudo enviar el mensaje')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="mkt-section">
      <div className="mkt-section-head">
        <h2>Contacto</h2>
        <p>¿Tenés dudas o querés contarnos qué necesita tu negocio? Escribinos.</p>
      </div>

      <div className="mkt-form">
        {sent ? (
          <p className="mkt-form-success">
            ¡Gracias! Recibimos tu mensaje y te vamos a responder a la brevedad.
          </p>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="mkt-form-field">
              <label htmlFor="contact-name">Nombre</label>
              <input
                id="contact-name" required
                value={name} onChange={(e) => setName(e.target.value)}
                placeholder="Tu nombre"
              />
            </div>
            <div className="mkt-form-field">
              <label htmlFor="contact-email">Email</label>
              <input
                id="contact-email" type="email" required
                value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="vos@empresa.com"
              />
            </div>
            <div className="mkt-form-field">
              <label htmlFor="contact-message">Mensaje</label>
              <textarea
                id="contact-message" required rows={5}
                value={message} onChange={(e) => setMessage(e.target.value)}
                placeholder="Contanos qué necesitás"
              />
            </div>

            {error && <div className="mkt-form-error">{error}</div>}

            <button type="submit" className="mkt-btn mkt-btn-primary" disabled={submitting}>
              {submitting ? 'Enviando…' : 'Enviar mensaje'}
            </button>
          </form>
        )}
      </div>
    </section>
  )
}

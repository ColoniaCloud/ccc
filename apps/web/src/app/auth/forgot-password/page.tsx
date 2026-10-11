'use client'

import { useState } from 'react'
import Link from 'next/link'
import { requestPasswordReset, webUrl } from '@/lib/auth'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'

export default function ForgotPasswordPage() {
  const [sentTo,  setSentTo]  = useState<string | null>(null)
  const [error,   setError]   = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const email = (new FormData(e.currentTarget).get('email') as string).trim()

    try {
      // La API responde igual exista o no la cuenta (no revela qué emails
      // están registrados), así que el mensaje de éxito es siempre el mismo.
      const { error: resetError } = await requestPasswordReset({
        email,
        redirectTo: webUrl('/auth/reset-password'),
      })
      if (resetError) {
        setError(resetError.status === 429
          ? 'Demasiados intentos. Esperá un minuto y probá de nuevo.'
          : 'No pudimos procesar el pedido. Probá de nuevo.')
        return
      }
      setSentTo(email)
    } catch {
      setError('No se pudo conectar con el servidor. Revisá tu conexión.')
    } finally {
      setLoading(false)
    }
  }

  if (sentTo) {
    return (
      <>
        <h1 className="auth-title">Revisá tu correo</h1>
        <p className="auth-message">
          Si existe una cuenta con <strong>{sentTo}</strong>, te llega un link para elegir una
          contraseña nueva. El link vence en 1 hora.
        </p>
        <p className="auth-message">Si no lo ves en unos minutos, revisá la carpeta de spam.</p>
        <div className="auth-link-row">
          <Link href="/auth/sign-in">Volver a iniciar sesión</Link>
        </div>
      </>
    )
  }

  return (
    <>
      <h1 className="auth-title">Recuperar contraseña</h1>
      <p className="auth-subtitle">Te mandamos un link para elegir una nueva.</p>

      {error && (
        <Alert variant="destructive" className="mb-2">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <form className="auth-form" onSubmit={handleSubmit}>
        <div className="auth-field">
          <Label htmlFor="email">Email de tu cuenta</Label>
          <Input
            id="email" name="email" type="email"
            placeholder="juan@empresa.com"
            required autoComplete="email"
          />
        </div>

        <Button type="submit" className="mt-2 w-full" disabled={loading}>
          {loading ? 'Enviando…' : 'Enviar link'}
        </Button>
      </form>

      <div className="auth-link-row">
        ¿Te acordaste? <Link href="/auth/sign-in">Iniciá sesión</Link>
      </div>
    </>
  )
}

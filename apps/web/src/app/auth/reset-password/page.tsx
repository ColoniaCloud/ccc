'use client'

import { Suspense, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { resetPassword, authErrorMessage } from '@/lib/auth'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'

/**
 * Destino del link del correo "Restablecé tu contraseña". La API valida el
 * token y redirige acá con ?token=… (o con ?error=INVALID_TOKEN si venció).
 */
function ResetPasswordForm() {
  const searchParams = useSearchParams()
  const token        = searchParams.get('token')
  const invalidLink  = !token || searchParams.get('error') === 'INVALID_TOKEN'

  const [done,    setDone]    = useState(false)
  const [error,   setError]   = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!token) return
    setError(null)

    const form     = new FormData(e.currentTarget)
    const password = form.get('password') as string
    const confirm  = form.get('confirm')  as string
    if (password !== confirm) {
      setError('Las contraseñas no coinciden.')
      return
    }

    setLoading(true)
    try {
      const { error: resetError } = await resetPassword({ newPassword: password, token })
      if (resetError) {
        setError(resetError.code === 'INVALID_TOKEN'
          ? 'El link venció o ya se usó. Pedí uno nuevo.'
          : authErrorMessage(resetError, 'No se pudo cambiar la contraseña. Probá de nuevo.'))
        return
      }
      setDone(true)
    } catch {
      setError('No se pudo conectar con el servidor. Revisá tu conexión.')
    } finally {
      setLoading(false)
    }
  }

  if (invalidLink) {
    return (
      <>
        <h1 className="auth-title">Link inválido</h1>
        <p className="auth-message">El link para cambiar la contraseña venció o ya se usó.</p>
        <Button asChild className="w-full">
          <Link href="/auth/forgot-password">Pedir un link nuevo</Link>
        </Button>
      </>
    )
  }

  if (done) {
    return (
      <>
        <h1 className="auth-title">Contraseña actualizada</h1>
        <p className="auth-message">
          Ya podés ingresar con tu contraseña nueva. Por seguridad cerramos las demás sesiones abiertas.
        </p>
        <Button asChild className="w-full">
          <Link href="/auth/sign-in">Iniciar sesión</Link>
        </Button>
      </>
    )
  }

  return (
    <>
      <h1 className="auth-title">Elegí una contraseña nueva</h1>

      {error && (
        <Alert variant="destructive" className="mb-2">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <form className="auth-form" onSubmit={handleSubmit}>
        <div className="auth-field">
          <Label htmlFor="password">Contraseña nueva</Label>
          <Input
            id="password" name="password" type="password"
            placeholder="Mínimo 8 caracteres"
            minLength={8} required autoComplete="new-password"
          />
        </div>

        <div className="auth-field">
          <Label htmlFor="confirm">Repetila</Label>
          <Input
            id="confirm" name="confirm" type="password"
            minLength={8} required autoComplete="new-password"
          />
        </div>

        <Button type="submit" className="mt-2 w-full" disabled={loading}>
          {loading ? 'Guardando…' : 'Guardar contraseña'}
        </Button>
      </form>
    </>
  )
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordForm />
    </Suspense>
  )
}

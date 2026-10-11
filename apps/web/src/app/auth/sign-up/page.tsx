'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { signUp, authErrorMessage, webUrl } from '@/lib/auth'
import { SocialButtons } from '@/components/SocialButtons'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'

export default function SignUpPage() {
  const router             = useRouter()
  const [error,   setError]  = useState<string | null>(null)
  const [loading, setLoading]= useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const form     = new FormData(e.currentTarget)
    const name     = form.get('name')     as string
    const email    = form.get('email')    as string
    const password = form.get('password') as string

    try {
      // Con verificación obligatoria el registro no inicia sesión: llega un
      // correo cuyo link verifica, inicia sesión y vuelve al onboarding.
      const { error: signUpError } = await signUp.email({
        name, email, password,
        callbackURL: webUrl('/onboarding'),
      })
      if (signUpError) {
        setError(authErrorMessage(signUpError, 'Error al crear la cuenta'))
        return
      }
      router.push(`/auth/verify-email?email=${encodeURIComponent(email)}`)
    } catch {
      setError('No se pudo conectar con el servidor. Revisá tu conexión.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <h1 className="auth-title">Crear cuenta</h1>
      <p className="auth-subtitle">Empezá a organizar tu equipo de ventas hoy.</p>

      {error && (
        <Alert variant="destructive" className="mb-2">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <SocialButtons />

      <form className="auth-form" onSubmit={handleSubmit}>
        <div className="auth-field">
          <Label htmlFor="name">Nombre completo</Label>
          <Input
            id="name" name="name" type="text"
            placeholder="Juan García"
            required autoComplete="name"
          />
        </div>

        <div className="auth-field">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email" name="email" type="email"
            placeholder="juan@empresa.com"
            required autoComplete="email"
          />
        </div>

        <div className="auth-field">
          <Label htmlFor="password">Contraseña</Label>
          <Input
            id="password" name="password" type="password"
            placeholder="Mínimo 8 caracteres"
            minLength={8} required autoComplete="new-password"
          />
        </div>

        <Button type="submit" className="mt-2 w-full" disabled={loading}>
          {loading ? 'Creando cuenta…' : 'Crear cuenta'}
        </Button>
      </form>

      <div className="auth-link-row">
        ¿Ya tenés cuenta? <Link href="/auth/sign-in">Iniciá sesión</Link>
      </div>
    </>
  )
}

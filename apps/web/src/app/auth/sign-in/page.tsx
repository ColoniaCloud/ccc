'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { signIn, authErrorMessage } from '@/lib/auth'
import { SocialButtons } from '@/components/SocialButtons'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

// Errores que llegan por query string desde redirects externos: el login
// social (errorCallbackURL) y los links de verificación vencidos.
const REDIRECT_ERRORS: Record<string, string> = {
  // Better Auth agrega su propio ?error=… al errorCallbackURL del login social.
  account_not_linked: 'Ya tenés una cuenta con ese email. Ingresá con tu email y contraseña.',
  social: 'No se pudo iniciar sesión con ese proveedor. Probá de nuevo o usá tu email.',
  verify: 'El link de verificación no es válido o venció. Iniciá sesión y te mandamos uno nuevo.',
}

function redirectErrorMessage(codes: string[]): string | null {
  const known = Object.keys(REDIRECT_ERRORS).find((code) => codes.includes(code))
  return known ? REDIRECT_ERRORS[known] ?? null : null
}

function SignInForm() {
  const router       = useRouter()
  const searchParams = useSearchParams()
  const redirectError = redirectErrorMessage(searchParams.getAll('error'))

  const [error,   setError]  = useState<string | null>(redirectError)
  const [loading, setLoading]= useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const form     = new FormData(e.currentTarget)
    const email    = form.get('email')    as string
    const password = form.get('password') as string

    try {
      const { error: signInError } = await signIn.email({ email, password })
      if (signInError?.code === 'EMAIL_NOT_VERIFIED') {
        // La API ya reenvió el correo de verificación (sendOnSignIn).
        router.push(`/auth/verify-email?email=${encodeURIComponent(email)}&resent=1`)
        return
      }
      if (signInError) {
        setError(authErrorMessage(signInError, 'No se pudo iniciar sesión. Probá de nuevo.'))
        return
      }

      // Determinar destino según estado de onboarding
      const res = await fetch(`${API_URL}/api/onboarding/status`, {
        credentials: 'include',
      })
      if (!res.ok) {
        setError('Ingresaste, pero no pudimos cargar tu cuenta. Recargá la página.')
        return
      }
      const { status } = await res.json() as { status: string }

      router.push(status === 'completed' ? '/app' : '/onboarding')
    } catch {
      setError('No se pudo conectar con el servidor. Revisá tu conexión.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <h1 className="auth-title">Iniciar sesión</h1>
      <p className="auth-subtitle">Bienvenido de vuelta.</p>

      {error && (
        <Alert variant="destructive" className="mb-2">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <SocialButtons />

      <form className="auth-form" onSubmit={handleSubmit}>
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
            placeholder="Tu contraseña"
            required autoComplete="current-password"
          />
          <Link href="/auth/forgot-password" className="auth-forgot">¿Olvidaste tu contraseña?</Link>
        </div>

        <Button type="submit" className="mt-2 w-full" disabled={loading}>
          {loading ? 'Ingresando…' : 'Ingresar'}
        </Button>
      </form>

      <div className="auth-link-row">
        ¿No tenés cuenta? <Link href="/auth/sign-up">Registrate gratis</Link>
      </div>
    </>
  )
}

// useSearchParams necesita un límite de Suspense para que Next pueda
// prerenderizar la página.
export default function SignInPage() {
  return (
    <Suspense>
      <SignInForm />
    </Suspense>
  )
}

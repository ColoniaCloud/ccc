'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { signIn } from '@/lib/auth'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

export default function SignInPage() {
  const router             = useRouter()
  const [error,   setError]  = useState<string | null>(null)
  const [loading, setLoading]= useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const form     = new FormData(e.currentTarget)
    const email    = form.get('email')    as string
    const password = form.get('password') as string

    try {
      await signIn.email({ email, password })

      // Determinar destino según estado de onboarding
      const res        = await fetch(`${API_URL}/api/onboarding/status`, {
        credentials: 'include',
      })
      const { status } = await res.json() as { status: string }

      router.push(status === 'completed' ? '/app' : '/onboarding')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Email o contraseña incorrectos'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <h1 className="auth-title">Iniciar sesión</h1>
      <p className="auth-subtitle">Bienvenido de vuelta.</p>

      {error && <div className="auth-error">{error}</div>}

      <form className="auth-form" onSubmit={handleSubmit}>
        <div className="auth-field">
          <label className="auth-label" htmlFor="email">Email</label>
          <input
            id="email" name="email" type="email"
            className="auth-input" placeholder="juan@empresa.com"
            required autoComplete="email"
          />
        </div>

        <div className="auth-field">
          <label className="auth-label" htmlFor="password">Contraseña</label>
          <input
            id="password" name="password" type="password"
            className="auth-input" placeholder="Tu contraseña"
            required autoComplete="current-password"
          />
        </div>

        <button type="submit" className="auth-btn" disabled={loading}>
          {loading ? 'Ingresando…' : 'Ingresar'}
        </button>
      </form>

      <div className="auth-link-row">
        ¿No tenés cuenta? <Link href="/auth/sign-up">Registrate gratis</Link>
      </div>
    </>
  )
}

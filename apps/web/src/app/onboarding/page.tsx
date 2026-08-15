'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from '@/lib/auth'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

type StatusResponse = { status: 'pending' } | { status: 'completed'; tenant: unknown }

export default function OnboardingPage() {
  const router = useRouter()
  const { data: session, isPending: sessionLoading } = useSession()

  const [checking, setChecking] = useState(true)
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (sessionLoading) return

    if (!session) {
      router.replace('/auth/sign-in')
      return
    }

    fetch(`${API_URL}/api/onboarding/status`, { credentials: 'include' })
      .then((res) => res.json() as Promise<StatusResponse>)
      .then((data) => {
        if (data.status === 'completed') {
          router.replace('/app')
        } else {
          setChecking(false)
        }
      })
      .catch(() => setChecking(false))
  }, [session, sessionLoading, router])

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const res = await fetch(`${API_URL}/api/onboarding`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => null) as { error?: string } | null
        throw new Error(body?.error ?? 'No se pudo crear la organización')
      }

      router.push('/app')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'No se pudo crear la organización'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  if (sessionLoading || checking) {
    return <p className="auth-subtitle">Cargando…</p>
  }

  return (
    <>
      <h1 className="auth-title">Creá tu organización</h1>
      <p className="auth-subtitle">Así es como tu equipo va a ver el espacio de trabajo.</p>

      {error && (
        <Alert variant="destructive" className="mb-2">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <form className="auth-form" onSubmit={handleSubmit}>
        <div className="auth-field">
          <Label htmlFor="name">Nombre de la organización</Label>
          <Input
            id="name" name="name" type="text"
            placeholder="Mi Empresa SRL"
            required minLength={2} autoComplete="organization"
            value={name} onChange={(e) => setName(e.target.value)}
          />
        </div>

        <Button type="submit" className="mt-2 w-full" disabled={loading}>
          {loading ? 'Creando…' : 'Continuar'}
        </Button>
      </form>
    </>
  )
}

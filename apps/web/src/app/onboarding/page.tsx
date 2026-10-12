'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useSession } from '@/lib/auth'
import { pendingInvitation, rememberOrganization } from '@/lib/organizations'
import {
  BusinessProfileForm, toFormValues, toRequestBody, type BusinessProfileValues,
} from '@/components/BusinessProfileForm'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

type StatusResponse = { status: 'pending' } | { status: 'completed'; tenant: unknown }

/**
 * Segundo paso del registro: datos del negocio. Llegan acá el link de
 * verificación de email, el login social de una cuenta nueva y cualquier
 * usuario con sesión que todavía no tiene organización.
 */
function Onboarding() {
  const router       = useRouter()
  const searchParams = useSearchParams()
  const { data: session, isPending: sessionLoading } = useSession()

  const [checking, setChecking] = useState(true)
  const additional = searchParams.get('new') === '1'

  useEffect(() => {
    if (sessionLoading) return

    if (!session) {
      // Un link de verificación vencido o inválido vuelve acá con ?error=…
      // y sin sesión: se avisa en el login en vez de rebotar en silencio.
      router.replace(searchParams.get('error') ? '/auth/sign-in?error=verify' : '/auth/sign-in')
      return
    }
    if (pendingInvitation()) { router.replace('/auth/invitation'); return }
    if (additional) { setChecking(false); return }

    fetch(`${API_URL}/api/organizations/invitations`, { credentials: 'include' })
      .then(async (res) => {
        if (!res.ok) throw new Error('No se pudieron consultar tus invitaciones')
        const data = await res.json() as { items: unknown[] }
        if (data.items.length) { router.replace('/auth/invitation'); return null }
        return fetch(`${API_URL}/api/onboarding/status`, { credentials: 'include' })
      })
      .then((res) => res ? res.json() as Promise<StatusResponse> : null)
      .then((data) => {
        if (!data) return
        if (data.status === 'completed') {
          router.replace('/app')
        } else {
          setChecking(false)
        }
      })
      .catch(() => setChecking(false))
  }, [session, sessionLoading, router, searchParams, additional])

  async function handleSubmit(values: BusinessProfileValues): Promise<string | null> {
    try {
      const res = await fetch(`${API_URL}/api/onboarding`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ ...toRequestBody(values), createAdditional: additional }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => null) as { error?: string } | null
        return body?.error ?? 'No se pudo crear la organización'
      }

      const data = await res.json() as { tenant: { slug: string } }
      rememberOrganization(session!.user.id, data.tenant.slug)
      router.push(`/app?organization=${encodeURIComponent(data.tenant.slug)}`)
      return null
    } catch {
      return 'No se pudo conectar con el servidor. Revisá tu conexión.'
    }
  }

  if (sessionLoading || checking) {
    return <p className="auth-subtitle">Cargando…</p>
  }

  return (
    <>
      <h1 className="auth-title">Contanos sobre tu negocio</h1>
      <p className="auth-subtitle">
        Con estos datos Plata se adapta a cómo vendés. Te lleva un minuto y lo podés cambiar después.
      </p>

      <BusinessProfileForm
        initial={toFormValues('', null)}
        submitLabel="Continuar"
        onSubmit={handleSubmit}
      />
    </>
  )
}

export default function OnboardingPage() {
  return (
    <Suspense>
      <Onboarding />
    </Suspense>
  )
}

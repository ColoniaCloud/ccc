'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { UserRole } from '@crm/shared'
import { useSession, signOut } from '@/lib/auth'
import { pendingInvitation, rememberInvitation, rememberOrganization, ROLE_LABELS } from '@/lib/organizations'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'
type Preview = { tenant: { name: string; slug: string }; email: string; role: UserRole; accepted: boolean }
type Pending = Preview & { id: string }

export default function InvitationPage() {
  const { data: session, isPending } = useSession()
  const [token, setToken] = useState<string | null>(null)
  const [initialized, setInitialized] = useState(false)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [pending, setPending] = useState<Pending[]>([])
  const [invitationId, setInvitationId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const fromEmail = new URLSearchParams(window.location.hash.slice(1)).get('token')
    const value = fromEmail ?? pendingInvitation()
    if (value && /^[a-f0-9]{64}$/.test(value)) {
      rememberInvitation(value); setToken(value)
      // El secreto no se envía en la URL HTTP ni queda en el historial visible.
      window.history.replaceState(null, '', window.location.pathname)
    }
    setInitialized(true)
  }, [])

  useEffect(() => {
    if (!session) return
    const controller = new AbortController()
    setPreview(null); setError(null)
    fetch(`${API_URL}/api/organizations/invitations${token ? '/preview' : ''}`, { method: token ? 'POST' : 'GET', credentials: 'include',
      headers: { 'Content-Type': 'application/json' }, ...(token ? { body: JSON.stringify({ token }) } : {}), signal: controller.signal })
      .then(async (res) => {
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? 'No se pudo abrir la invitación')
        if (!controller.signal.aborted) {
          if (token) setPreview(data)
          else {
            const items = data.items as Pending[]
            setPending(items)
            if (items.length === 1) { setPreview(items[0]!); setInvitationId(items[0]!.id) }
            else if (!items.length) setError('No tenés invitaciones pendientes con este email. Podés pedir una nueva al administrador.')
          }
        }
      }).catch((err: Error) => { if (!controller.signal.aborted) setError(err.message) })
    return () => controller.abort()
  }, [session, token])

  async function accept() {
    setBusy(true); setError(null)
    try {
      const res = await fetch(`${API_URL}/api/organizations/invitations/${token ? 'accept' : `${invitationId}/accept`}`, { method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' }, ...(token ? { body: JSON.stringify({ token }) } : {}) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'No se pudo aceptar la invitación')
      rememberOrganization(session!.user.id, data.tenant.slug)
      rememberInvitation(null)
      window.location.assign(`/app?organization=${encodeURIComponent(data.tenant.slug)}`)
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo conectar con el servidor'); setBusy(false) }
  }

  function exit() { rememberInvitation(null); window.location.assign('/app') }

  if (isPending || !initialized) return <Skeleton className="h-32 w-full" />
  return (
    <div className="flex flex-col gap-4">
      <h1 className="auth-title">Sumate al equipo</h1>
      {!session ? <>
          <p className="auth-subtitle">Ingresá o creá una cuenta con el mismo email que recibió la invitación. Después podrás aceptarla.</p>
          <Button asChild><Link href="/auth/sign-in">Iniciar sesión</Link></Button>
          <Button asChild variant="outline"><Link href="/auth/sign-up">Crear cuenta</Link></Button>
        </> : <>
          <p className="auth-subtitle">Ingresaste como {session.user.email}.</p>
          {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
          {token && error && <Button variant="outline" disabled={busy} onClick={() => {
            rememberInvitation(null); setToken(null); setPending([]); setInvitationId(null)
          }}>Ver mis invitaciones pendientes</Button>}
          {!token && pending.length > 1 && pending.map((item) => <Button key={item.id} variant="outline" disabled={busy} onClick={() => {
            setPreview(item); setInvitationId(item.id)
          }}>{item.tenant.name}</Button>)}
          {preview ? <>
            <p>Te invitaron a <strong>{preview.tenant.name}</strong> como <strong>{ROLE_LABELS[preview.role]}</strong>.</p>
            <p className="auth-subtitle">Podés pertenecer a otras organizaciones con esta misma cuenta. Sus datos y permisos son independientes.</p>
            <Button disabled={busy} onClick={() => void accept()}>{busy ? 'Ingresando…' : preview.accepted ? 'Abrir organización' : 'Aceptar invitación'}</Button>
          </> : !error && !pending.length && <Skeleton className="h-20 w-full" />}
          <Button variant="outline" disabled={busy} onClick={async () => { setPreview(null); await signOut() }}>Usar otra cuenta</Button>
        </>}
      <Button variant="ghost" disabled={busy} onClick={exit}>Volver a Plata</Button>
      {session && <Button variant="ghost" disabled={busy} onClick={() => {
        rememberInvitation(null); window.location.assign('/onboarding?new=1')
      }}>Crear una organización propia</Button>}
    </div>
  )
}

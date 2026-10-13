'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { SetupSnapshot } from '@crm/shared'
import { useApp } from '@/app/app/app-context'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

export function SetupWelcome() {
  const { apiFetch, me } = useApp(), [view, setView] = useState<SetupSnapshot | null>(null)
  useEffect(() => {
    const controller = new AbortController()
    apiFetch('/api/setup', { signal: controller.signal }).then(async (res) => { if (res.ok && !controller.signal.aborted) setView(await res.json()) }).catch(() => {})
    return () => controller.abort()
  }, [apiFetch])
  if (!view?.supported || !['owner','admin'].includes(me.member.role) || view.session?.status === 'completed') return null
  return <Card><CardHeader><CardTitle>Prepará el CRM para tu negocio</CardTitle><CardDescription>El asistente usa los datos de tu registro y te ayuda a revisar una configuración por nicho.</CardDescription></CardHeader><CardContent><Button asChild><Link href="/app/setup">{view.session ? 'Retomar preparación' : 'Preparar mi CRM'}</Link></Button></CardContent></Card>
}

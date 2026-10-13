'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useApp } from '@/app/app/app-context'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Skeleton } from '@/components/ui/skeleton'
type Snapshot = { supported: boolean; steps?: { key: string; title: string; description: string; complete: boolean; href: string }[]; complete?: number; total?: number; ready?: boolean;
  counts?: { overdueTasks: number; overdueAppointments: number; withoutFollowUp: number }; calendar?: { connected: boolean; hasSyncedAppointment: boolean; href: string } }
export function ActivationGuide() {
  const { apiFetch, me } = useApp(), [view, setView] = useState<Snapshot | null>(null), [error, setError] = useState(''), [revision, setRevision] = useState(0), [expanded, setExpanded] = useState(false)
  useEffect(() => {
    const controller = new AbortController()
    setError('')
    apiFetch('/api/activation', { signal: controller.signal }).then(async (res) => {
      const data = await res.json(); if (!res.ok) throw new Error(data.error ?? 'No se pudo revisar la puesta en marcha')
      if (!controller.signal.aborted) setView(data)
    }).catch((err: Error) => { if (!controller.signal.aborted) setError(err.message) })
    return () => controller.abort()
  }, [apiFetch, revision])
  if (view && !view.supported) return null
  const canWrite = me.member.role !== 'support', canConfigure = ['owner','admin'].includes(me.member.role), pending = view?.steps?.find((step) => !step.complete)
  return <Card><CardHeader><div className="flex flex-wrap items-center justify-between gap-2"><CardTitle role="heading" aria-level={2}>{view?.ready ? 'Tu negocio ya está en marcha' : 'Del CRM preparado a tu primera operación'}</CardTitle>{view?.supported && <Badge variant="secondary">{view.complete} de {view.total}</Badge>}</div><CardDescription>El avance se comprueba con los registros actuales de {me.tenant.name}.</CardDescription></CardHeader><CardContent className="flex flex-col gap-4">
    {error ? <Alert variant="destructive"><AlertDescription><div className="flex flex-col items-start gap-2"><p>{error}</p><Button variant="outline" size="sm" onClick={() => setRevision((value) => value + 1)}>Reintentar</Button></div></AlertDescription></Alert> : !view ? <Skeleton className="h-24 w-full" /> : <>
      {view.ready && <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-muted-foreground">Ya registraste una ficha, un contacto, una oportunidad vinculada y su seguimiento.</p><Button variant="outline" size="sm" onClick={() => setExpanded((value) => !value)}>{expanded ? 'Ocultar pasos' : 'Ver pasos comprobados'}</Button></div>}
      {(!view.ready || expanded) && <ol className="grid gap-3 md:grid-cols-2">{view.steps?.map((step, index) => <li key={step.key} className="flex flex-col gap-2 rounded-lg border p-3"><div className="flex flex-wrap items-start justify-between gap-2"><p className="font-medium">{index + 1}. {step.title}</p><Badge variant="outline">{step.complete ? 'Comprobado' : 'Pendiente'}</Badge></div><p className="text-sm text-muted-foreground">{step.description}</p>{!step.complete && (step.key === 'configuration' && !canConfigure ? <p className="text-sm text-muted-foreground">El propietario o un administrador completa este paso.</p> : <Button asChild size="sm" variant="outline" className="self-start"><Link href={step.href}>{canWrite ? 'Continuar este paso' : 'Ver esta sección'}</Link></Button>)}</li>)}</ol>}
      {pending && canWrite && (pending.key !== 'configuration' || canConfigure) && <Button asChild className="self-start"><Link href={pending.href}>Siguiente paso: {pending.title.toLocaleLowerCase('es-UY')}</Link></Button>}
      {view.counts && (view.counts.overdueTasks + view.counts.overdueAppointments + view.counts.withoutFollowUp > 0) && <Alert><AlertDescription><p>Para revisar hoy: {view.counts.overdueTasks} tareas vencidas, {view.counts.overdueAppointments} citas por resolver y {view.counts.withoutFollowUp} oportunidades sin próximo paso.</p><Link className="underline" href="/app/agenda">Revisar seguimiento</Link></AlertDescription></Alert>}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"><div><p className="font-medium">Tu Google Calendar <Badge variant="outline">Opcional</Badge></p><p className="text-sm text-muted-foreground">{view.calendar?.hasSyncedAppointment ? 'Ya se comprobó una cita sincronizada para tu cuenta.' : view.calendar?.connected ? 'Conectado. Falta comprobar una cita sincronizada.' : 'Autorizá tu cuenta desde Agenda para copiar las citas que tengas asignadas.'}</p></div><Button asChild size="sm" variant="outline"><Link href="/app/agenda">Abrir agenda</Link></Button></div>
    </>}
  </CardContent></Card>
}

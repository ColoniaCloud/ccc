'use client'
import { useEffect, useState } from 'react'
import { useApp } from '@/app/app/app-context'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Skeleton } from '@/components/ui/skeleton'
type Report = { supported: boolean; startedAt: string | null; currentIndustryMatches: boolean; secondsToActivation: number | null; milestones: { key: string; label: string; source: string; observedAt: string }[]; weeks: { from: string; to: string; activeDays: number; actions: number }[] }
const date = (value: string) => new Intl.DateTimeFormat('es-UY', { timeZone: 'America/Montevideo', day: 'numeric', month: 'short' }).format(new Date(value.length === 10 ? `${value}T12:00:00Z` : value))
export function PilotMetrics() {
  const { apiFetch, me } = useApp()
  const allowed = ['owner', 'admin'].includes(me.member.role)
  const [report, setReport] = useState<Report | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false), [revision, setRevision] = useState(0)
  useEffect(() => {
    if (!allowed) return
    const controller = new AbortController()
    setReport(null); setError('')
    apiFetch('/api/pilot', { signal: controller.signal }).then(async res => {
      const body = await res.json(); if (!res.ok) throw new Error(body.error ?? 'No se pudo cargar la medición')
      if (!controller.signal.aborted) setReport(body)
    }).catch((err: Error) => { if (!controller.signal.aborted) setError(err.message) })
    return () => controller.abort()
  }, [apiFetch, allowed, revision])
  async function start() {
    setBusy(true); setError('')
    try { const res = await apiFetch('/api/pilot/start', { method: 'POST' }); const body = await res.json(); if (!res.ok) throw new Error(body.error ?? 'No se pudo iniciar la medición'); setReport(body) }
    catch (err) { setError(err instanceof Error ? err.message : 'No se pudo iniciar la medición') }
    finally { setBusy(false) }
  }
  if (!allowed || report?.supported === false) return null
  return <Card><CardHeader><CardTitle>Medición del piloto</CardTitle><CardDescription>Hitos conservados y actividad comercial de {me.tenant.name}. Las semanas siguen la hora de Uruguay.</CardDescription></CardHeader><CardContent className="flex flex-col gap-4">
    {error && <Alert variant="destructive"><AlertDescription>{error} <Button variant="outline" size="sm" onClick={() => setRevision(n => n + 1)}>Reintentar</Button></AlertDescription></Alert>}
    {!report && !error ? <Skeleton className="h-24 w-full" /> : report && !report.startedAt ? <><p className="text-sm text-muted-foreground">La medición empieza al realizar una acción comercial o al pulsar este botón. Los registros anteriores se marcan como existentes, sin atribuirles una fecha histórica.</p><Button className="self-start" onClick={start} disabled={busy}>{busy ? 'Iniciando…' : 'Comenzar medición'}</Button></> : report && <>
      <p className="text-sm">Comenzó el {date(report.startedAt!)}. {report.secondsToActivation !== null ? `Recorrido de activación completado en ${Math.ceil(report.secondsToActivation / 60)} minutos desde el inicio de la medición.` : 'El tiempo hasta la activación se mide únicamente cuando se completa durante el piloto.'}</p>
      {!report.currentIndustryMatches && <Alert><AlertDescription>El rubro cambió. Se conserva la medición anterior y se pausa el registro de actividad para evitar mezclar rubros.</AlertDescription></Alert>}
      <ul className="grid gap-2 md:grid-cols-2">{report.milestones.map(item => <li key={item.key} className="text-sm"><strong>{item.label}</strong><p className="text-muted-foreground">{item.source === 'baseline' ? 'Ya existía al comenzar' : `Comprobado el ${date(item.observedAt)}`}</p></li>)}</ul>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{report.weeks.map(week => <div key={week.from} className="rounded-lg border p-3"><p className="text-sm">{date(week.from)} – {date(week.to)}</p><p className="font-medium">{week.activeDays} días con actividad</p><p className="text-sm text-muted-foreground">{week.actions} acciones comerciales</p></div>)}</div>
      <p className="text-xs text-muted-foreground">Cada creación, modificación o eliminación aceptada cuenta como una acción; una importación cuenta una vez. Consultar pantallas y autorizar Calendar no suma actividad. Los hitos conservan la primera comprobación aunque después se eliminen registros.</p>
    </>}
  </CardContent></Card>
}

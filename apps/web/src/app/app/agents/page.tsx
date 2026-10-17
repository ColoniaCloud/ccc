'use client'

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import Link from 'next/link'
import { useApp } from '../app-context'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card'
import { Field, FieldGroup, FieldLabel, FieldDescription } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from '@/components/ui/empty'
import { Skeleton } from '@/components/ui/skeleton'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectGroup, SelectItem } from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'

type Agent = { id: string; name: string; instructions: string; staleDays: number; pipelineId: string | null; status: 'active' | 'paused'; locked: boolean }
type Overview = { items: Agent[]; quota: { agents: number; calls: number; records: number; used: number; remaining: number; resetsOn: string }; configured: boolean; canConfigure: boolean; canExecute: boolean; canApprove: boolean; pipelines: { id: string; name: string }[] }
type Job = { id: string; kind: 'run' | 'chat'; status: 'running' | 'succeeded' | 'failed'; prompt: string; response: string | null; error: string | null; createdAt: string; candidates: unknown[] }
type Proposal = { id: string; title: string; reason: string; status: 'pending' | 'approved' | 'dismissed' | 'stale'; taskId: string | null }
type Detail = { item: Agent; jobs: Job[]; proposals: Proposal[] }
const statusLabels = { running: 'En curso', succeeded: 'Completada', failed: 'Interrumpida', pending: 'Por aprobar', approved: 'Tarea creada', dismissed: 'Descartada', stale: 'Ya no corresponde' }
const defaults = { name: 'Seguimiento comercial', instructions: 'Priorizá las oportunidades que necesitan un próximo paso. Usá un tono cordial y concreto.', staleDays: 5, pipelineId: null as string | null, status: 'paused' as 'active' | 'paused' }
const date = (value: string) => new Date(value).toLocaleString('es-UY', { dateStyle: 'short', timeStyle: 'short' })

export default function AgentsPage() {
  const { apiFetch, me } = useApp()
  const [overview, setOverview] = useState<Overview | null>(null), [selected, setSelected] = useState<string | null>(null), [detail, setDetail] = useState<Detail | null>(null)
  const [error, setError] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false), [creating, setCreating] = useState(false), [message, setMessage] = useState('')
  const [tab, setTab] = useState('pending'), [demo, setDemo] = useState(false), [demoApproved, setDemoApproved] = useState(false)
  const sequence = useRef(0)
  const request = useCallback(async (path: string, init?: RequestInit) => {
    const res = await apiFetch(`/api/agents${path}`, init), data = await res.json()
    if (!res.ok) throw new Error(data.error || 'No se pudo completar la operación')
    return data
  }, [apiFetch])
  const load = useCallback(async () => {
    const seq = ++sequence.current
    const [list, view] = await Promise.all([request('/'), selected ? request(`/${selected}`) : Promise.resolve(null)])
    if (sequence.current === seq) { setOverview(list); setDetail(view) }
  }, [request, selected])
  useEffect(() => {
    setDetail(null); setError('')
    load().catch(e => setError(e.message))
    return () => { sequence.current++ }
  }, [load])
  const running = detail?.jobs.some(j => j.status === 'running') ?? false
  useEffect(() => {
    if (!running || busy) return
    const timer = setInterval(() => { load().catch(e => setError(e.message)) }, 4000)
    return () => clearInterval(timer)
  }, [running, busy, load])

  async function mutate(path: string, body?: unknown, method = 'POST') {
    setBusy(true); setError(''); setNotice('')
    try {
      const result = await request(path, { method, body: body === undefined ? undefined : JSON.stringify(body) })
      await load()
      return result
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo completar la acción'); await load().catch(() => {}); return null }
    finally { setBusy(false) }
  }
  const current = overview?.items.find(a => a.id === selected)
  const executable = Boolean(overview?.canExecute && overview.configured && overview.quota.remaining && current?.status === 'active' && !current.locked && !busy && !running)
  const pending = detail?.proposals.filter(p => p.status === 'pending') ?? []

  return <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-4 sm:p-6">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div><p className="text-sm text-muted-foreground">Tu equipo · {me.tenant.name}</p><h1 className="text-2xl font-semibold tracking-tight">Agentes</h1><p className="mt-1 text-sm text-muted-foreground">Encontrá oportunidades que necesitan seguimiento y convertí propuestas en tareas.</p></div>
      {overview?.canConfigure && <Button disabled={busy || overview.items.length >= overview.quota.agents} onClick={() => { setCreating(true); setSelected(null); setNotice('') }}>Nuevo agente</Button>}
    </header>
    {error && <Alert variant="destructive"><AlertDescription>{error}<Button variant="link" onClick={() => { setError(''); load().catch(e => setError(e.message)) }}>Reintentar carga</Button></AlertDescription></Alert>}
    {notice && <p role="status" className="text-sm text-muted-foreground">{notice}</p>}
    {!overview && !error && <Skeleton className="h-40 w-full" />}
    {overview && <>
      <Card><CardHeader><CardTitle>Capacidad de tu plan <Badge variant="secondary">{me.tenant.plan}</Badge></CardTitle><CardDescription>{overview.items.length} / {overview.quota.agents} agentes · {overview.quota.used} / {overview.quota.calls} consultas del mes</CardDescription></CardHeader>
        <CardContent><p className="text-sm text-muted-foreground">Cada revisión o mensaje consume una consulta, incluso si se interrumpe. Cupo compartido por la organización, separado del Asistente. Se renueva el {overview.quota.resetsOn} (Uruguay). Hasta {overview.quota.records} oportunidades por revisión.</p></CardContent>
        <CardFooter><Button variant="link" asChild><Link href="/app/billing">Ver membresía</Link></Button></CardFooter></Card>
      {!overview.configured && overview.quota.agents > 0 && <Alert><AlertDescription>La IA de Agentes aún no está configurada. Podés preparar tus agentes; la ejecución estará disponible cuando se habilite.</AlertDescription></Alert>}
      {overview.quota.remaining === 0 && overview.quota.agents > 0 && <Alert><AlertDescription>Se agotó el cupo mensual. Podés revisar el historial y aprobar las propuestas existentes.</AlertDescription></Alert>}
      {overview.quota.agents === 0 && <Card><CardHeader><CardTitle>Probá Seguimiento comercial</CardTitle><CardDescription>Demostración con datos ficticios, sin usar tu cuota ni modificar el CRM.</CardDescription></CardHeader><CardContent className="flex flex-col gap-4">
        {!demo ? <p className="text-sm">El agente detecta una oportunidad abierta sin actividad y prepara el próximo paso para tu revisión.</p> : <div className="flex flex-col gap-2"><Badge variant="outline">Ejemplo ficticio</Badge><p className="font-medium">Dar seguimiento: Visita al apartamento del Centro</p><p className="text-sm text-muted-foreground">Pasaron 7 días sin actividad registrada y no hay una tarea pendiente.</p><p className="text-sm">Propuesta: contactar al interesado para conocer su impresión y acordar el próximo paso.</p>{demoApproved && <p role="status">Aprobación simulada. En un plan pago, esta acción crearía una tarea en tu Agenda.</p>}</div>}
      </CardContent><CardFooter><Button variant="outline" onClick={() => demo ? setDemoApproved(true) : setDemo(true)} disabled={demoApproved}>{demo ? 'Simular aprobación' : 'Probar con un ejemplo'}</Button></CardFooter></Card>}
      {creating && <AgentForm busy={busy} pipelines={overview.pipelines} onCancel={() => setCreating(false)} onSave={async values => { const r = await mutate('/', values); if (r) { setCreating(false); setSelected(r.item.id); setTab('config'); setNotice('Agente creado en pausa. Revisá la configuración y activalo para comenzar.') } }} />}
      {overview.items.length > 0 && <div className="grid items-start gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
        <nav aria-label="Agentes de la organización" className="flex flex-col gap-2">{overview.items.map(a => <Button key={a.id} variant={a.id === selected ? 'secondary' : 'outline'} className="h-auto min-h-14 justify-start whitespace-normal text-left" disabled={busy} onClick={() => { setSelected(a.id); setCreating(false); setTab('pending'); setNotice('') }}><span className="flex min-w-0 flex-col gap-1"><span className="break-words">{a.name}</span><span className="text-xs text-muted-foreground">{a.locked ? 'Fuera del cupo del plan' : a.status === 'active' ? 'Activo · ejecución manual' : 'En pausa'}</span></span></Button>)}</nav>
        {!selected ? <Empty><EmptyHeader><EmptyTitle>Elegí un agente</EmptyTitle><EmptyDescription>Revisá sus propuestas, conversá o consultá el historial.</EmptyDescription></EmptyHeader></Empty> : !detail ? <Skeleton className="h-64 w-full" /> : <section className="flex min-w-0 flex-col gap-4" aria-label={detail.item.name}>
          <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-semibold break-words">{detail.item.name}</h2><p className="text-sm text-muted-foreground">Seguimiento comercial · {detail.item.staleDays} días sin actividad</p></div><Button disabled={!executable} onClick={async () => { const r = await mutate(`/${selected}/run`); if (r) { setTab('pending'); setNotice('Revisión completada. Las tareas pendientes de aprobación aparecen debajo.') } }}>{busy || running ? 'Procesando…' : 'Revisar oportunidades'}</Button></div>
          {(current?.locked || current?.status === 'paused') && <Alert><AlertDescription>{current.locked ? 'Este agente excede el cupo del plan. Archivá otro o cambiá la membresía para volver a usarlo.' : 'El agente está en pausa. Un propietario o administrador puede activarlo desde Configuración.'}</AlertDescription></Alert>}
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="grid w-full grid-cols-2 group-data-horizontal/tabs:h-auto sm:inline-flex sm:w-fit [&>[data-slot=tabs-trigger]]:min-h-11"><TabsTrigger value="pending">Propuestas ({pending.length})</TabsTrigger><TabsTrigger value="chat">Conversación</TabsTrigger><TabsTrigger value="history">Historial</TabsTrigger>{overview.canConfigure && <TabsTrigger value="config">Configuración</TabsTrigger>}</TabsList>
            <TabsContent value="pending" className="flex flex-col gap-3">
              <p className="text-sm text-muted-foreground">Aprobar crea una tarea para hoy, con el responsable de la oportunidad. Se vuelve a comprobar que siga necesitando seguimiento.</p>
              {!pending.length && <Empty><EmptyHeader><EmptyTitle>No hay propuestas pendientes</EmptyTitle><EmptyDescription>Revisá las oportunidades para detectar casos abiertos, sin actividad registrada y sin tareas pendientes.</EmptyDescription></EmptyHeader></Empty>}
              {pending.map(p => <Card key={p.id}><CardHeader><CardTitle>{p.title}</CardTitle><CardDescription>{p.reason}</CardDescription></CardHeader><CardContent><p className="text-sm text-muted-foreground">La aprobación crea una tarea; no envía mensajes al cliente.</p></CardContent>{overview.canApprove && <CardFooter className="flex-wrap gap-2"><Button disabled={busy || current?.locked} onClick={async () => { const r = await mutate(`/${selected}/proposals/${p.id}`, { decision: 'approve' }); if (r) setNotice(r.item.status === 'approved' ? 'Tarea creada. Podés verla en Agenda.' : 'El caso cambió y ya no corresponde crear esta tarea.') }}>Aprobar tarea</Button><Button variant="outline" disabled={busy} onClick={() => mutate(`/${selected}/proposals/${p.id}`, { decision: 'dismiss' })}>Descartar</Button></CardFooter>}</Card>)}
              {!overview.canApprove && pending.length > 0 && <p className="text-sm text-muted-foreground">Un propietario, administrador o manager debe aprobar las propuestas.</p>}
              <Button variant="link" asChild><Link href="/app/agenda">Ver tareas en Agenda</Link></Button>
            </TabsContent>
            <TabsContent value="chat" className="flex flex-col gap-4">
              <p className="text-sm text-muted-foreground">Conversación compartida con tu organización. Podés pedir explicaciones o borradores; las acciones se aprueban en Propuestas.</p>
              <div className="flex max-h-[55vh] flex-col gap-3 overflow-y-auto" aria-label="Conversación del agente">{[...detail.jobs].reverse().filter(j => j.status === 'succeeded').map(j => <Card key={j.id}><CardHeader><CardDescription>{j.kind === 'run' ? 'Revisión de oportunidades' : j.prompt} · {date(j.createdAt)}</CardDescription></CardHeader><CardContent><p className="whitespace-pre-wrap break-words text-sm">{j.response}</p></CardContent></Card>)}</div>
              <form className="flex flex-col gap-3" onSubmit={async e => { e.preventDefault(); const r = await mutate(`/${selected}/chat`, { message }); if (r) setMessage('') }}><Field><FieldLabel htmlFor="agent-message">Mensaje al agente</FieldLabel><Textarea id="agent-message" value={message} onChange={e => setMessage(e.target.value)} maxLength={2000} placeholder="¿Qué oportunidades priorizarías y por qué?" disabled={!executable} /></Field><Button className="self-start" disabled={!executable || !message.trim()}>Enviar · 1 consulta</Button></form>
            </TabsContent>
            <TabsContent value="history" className="flex flex-col gap-3"><p className="text-sm text-muted-foreground">Últimas 50 ejecuciones y mensajes. El consumo incluye intentos fallidos.</p>{detail.jobs.map(j => <Card key={j.id}><CardHeader><CardTitle>{j.kind === 'run' ? 'Revisión comercial' : 'Conversación'} <Badge variant="outline">{statusLabels[j.status]}</Badge></CardTitle><CardDescription>{date(j.createdAt)} · {j.candidates.length} casos revisados</CardDescription></CardHeader><CardContent><p className="whitespace-pre-wrap break-words text-sm">{j.error || j.response || 'Esperando respuesta…'}</p></CardContent></Card>)}{detail.proposals.filter(p => p.status !== 'pending').map(p => <p key={p.id} className="text-sm">{p.title} · <Badge variant="secondary">{statusLabels[p.status]}</Badge></p>)}</TabsContent>
            {overview.canConfigure && <TabsContent value="config"><AgentForm key={`${detail.item.id}-${detail.item.status}`} initial={detail.item} busy={busy || running} pipelines={overview.pipelines} onSave={async values => { if (await mutate(`/${selected}`, values, 'PUT')) setNotice('Configuración guardada.') }} /><div className="mt-4"><Button variant="outline" disabled={busy || running} onClick={async () => { if (!window.confirm('¿Archivar este agente? Se descartarán sus propuestas pendientes y se liberará su cupo.')) return; setBusy(true); setError(''); try { await request(`/${selected}/archive`, { method: 'POST' }); setSelected(null); setNotice('Agente archivado. Su historial se conserva.'); } catch(e) { setError(e instanceof Error ? e.message : 'No se pudo archivar') } finally { setBusy(false) } }}>Archivar agente</Button></div></TabsContent>}
          </Tabs>
        </section>}
      </div>}
      {!overview.items.length && !creating && overview.quota.agents > 0 && <Empty><EmptyHeader><EmptyTitle>Tu primer agente de seguimiento</EmptyTitle><EmptyDescription>{overview.canConfigure ? 'Creá un agente, elegí un proceso y definí cuántos días sin actividad ameritan un seguimiento.' : 'Un propietario o administrador puede crear el primer agente para el equipo.'}</EmptyDescription></EmptyHeader></Empty>}
    </>}
  </div>
}

function AgentForm({ initial, busy, pipelines, onSave, onCancel }: { initial?: Agent; busy: boolean; pipelines: Overview['pipelines']; onSave: (values: typeof defaults) => Promise<void>; onCancel?: () => void }) {
  const [values, setValues] = useState(initial ? { name: initial.name, instructions: initial.instructions, staleDays: initial.staleDays, pipelineId: initial.pipelineId, status: initial.status } : defaults)
  function submit(e: FormEvent) { e.preventDefault(); void onSave(values) }
  return <Card><CardHeader><CardTitle>{initial ? 'Configuración del agente' : 'Crear agente de seguimiento'}</CardTitle><CardDescription>{initial ? 'Los cambios se aplican a las próximas revisiones.' : 'Nace en pausa para que revises su configuración antes de activarlo.'}</CardDescription></CardHeader><CardContent><form onSubmit={submit} className="flex flex-col gap-5"><FieldGroup>
    <Field><FieldLabel htmlFor="agent-name">Nombre</FieldLabel><Input id="agent-name" required maxLength={80} value={values.name} disabled={busy} onChange={e => setValues({ ...values, name: e.target.value })} /></Field>
    <Field><FieldLabel htmlFor="agent-instructions">Instrucciones</FieldLabel><Textarea id="agent-instructions" maxLength={2000} value={values.instructions} disabled={busy} onChange={e => setValues({ ...values, instructions: e.target.value })} /><FieldDescription>Definí tono y prioridades. Las instrucciones no habilitan envíos ni cambios automáticos.</FieldDescription></Field>
    <Field><FieldLabel htmlFor="agent-days">Días sin actividad registrada</FieldLabel><Input id="agent-days" type="number" min={1} max={90} required value={values.staleDays} disabled={busy} onChange={e => setValues({ ...values, staleDays: Number(e.target.value) })} /></Field>
    <Field><FieldLabel htmlFor="agent-pipeline">Proceso comercial</FieldLabel><Select value={values.pipelineId || 'all'} onValueChange={v => setValues({ ...values, pipelineId: v === 'all' ? null : v })} disabled={busy}><SelectTrigger id="agent-pipeline"><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="all">Todos los procesos</SelectItem>{pipelines.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>
    {initial && <Field><FieldLabel htmlFor="agent-status">Estado</FieldLabel><Select value={values.status} onValueChange={v => setValues({ ...values, status: v as 'active' | 'paused' })} disabled={busy}><SelectTrigger id="agent-status"><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="paused">En pausa</SelectItem><SelectItem value="active">Activo</SelectItem></SelectGroup></SelectContent></Select></Field>}
  </FieldGroup><div className="flex gap-2"><Button disabled={busy}>{busy ? 'Guardando…' : initial ? 'Guardar configuración' : 'Crear en pausa'}</Button>{onCancel && <Button type="button" variant="outline" disabled={busy} onClick={onCancel}>Cancelar</Button>}</div></form></CardContent></Card>
}

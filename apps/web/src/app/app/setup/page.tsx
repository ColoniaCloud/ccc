'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import type { PresetKey, PresetPreview, SetupProposal, SetupSnapshot } from '@crm/shared'
import { useApp } from '../app-context'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Field, FieldGroup, FieldLabel, FieldDescription, FieldSet, FieldLegend } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton } from '@/components/ui/skeleton'

type Preset = { key: PresetKey; label: string; module: string; stages: string[] }
type Approval = { fingerprint: string; previews: PresetPreview[]; conflicts: string[] }

export default function SetupPage() {
  const { apiFetch, me } = useApp()
  const [view, setView] = useState<SetupSnapshot | null>(null), [presets, setPresets] = useState<Preset[]>([])
  const [draft, setDraft] = useState<SetupProposal | null>(null), [recommendations, setRecommendations] = useState(''), [message, setMessage] = useState('')
  const [approval, setApproval] = useState<Approval | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null)
  const bottom = useRef<HTMLDivElement>(null), canConfigure = ['owner','admin'].includes(me.member.role)
  function receive(data: SetupSnapshot) {
    setView(data); setDraft(data.session?.proposal ? structuredClone(data.session.proposal) : null)
    setRecommendations(data.session?.proposal?.recommendations.join('\n') ?? '')
  }
  async function request(path: string, method = 'GET', body?: unknown) {
    const res = await apiFetch(`/api/setup${path}`, { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error ?? 'No se pudo preparar el CRM')
    return data
  }
  async function refresh() { receive(await request('')); setError(null) }
  useEffect(() => {
    const controller = new AbortController()
    Promise.all([apiFetch('/api/setup', { signal: controller.signal }), apiFetch('/api/presets', { signal: controller.signal })]).then(async ([res, presetsRes]) => {
      const [data, presetData] = await Promise.all([res.json(), presetsRes.json()])
      if (!res.ok || !presetsRes.ok) throw new Error(data.error ?? 'No se pudo cargar el asistente')
      if (!controller.signal.aborted) { receive(data); setPresets(presetData.items) }
    }).catch((err: Error) => { if (!controller.signal.aborted) setError(err.message) })
    return () => controller.abort()
  }, [apiFetch])
  useEffect(() => {
    if (!view?.session?.busy) return
    const timer = window.setInterval(() => { request('').then(receive).catch((err: Error) => setError(err.message)) }, 3000)
    return () => clearInterval(timer)
  }, [apiFetch, view?.session?.busy])
  useEffect(() => { bottom.current?.scrollIntoView({ block: 'nearest' }) }, [view?.session?.messages.length])
  const locked = busy || Boolean(view?.session?.busy), completed = view?.session?.status === 'completed', deferred = view?.session?.status === 'deferred'
  const choices = presets.filter((preset) => view?.profile?.industry === 'real_estate' ? preset.module === 'properties' : preset.module === 'vehicles')
  async function send(text: string) {
    setBusy(true); setError(null); setApproval(null)
    try { receive(await request('/message', 'POST', { text, revision: view?.session?.revision ?? 0 })); setMessage('') }
    catch (err) { setError((err as Error).message); await request('').then(receive).catch(() => {}) }
    finally { setBusy(false) }
  }
  async function defer() {
    setBusy(true); setError(null)
    try { await request('/defer','POST'); window.location.assign('/app') } catch (err) { setError((err as Error).message); setBusy(false) }
  }
  async function resume() {
    setBusy(true); setError(null)
    try { receive(await request('/resume','POST')) } catch (err) { setError((err as Error).message) } finally { setBusy(false) }
  }
  async function review(event: React.FormEvent) {
    event.preventDefault(); if (!draft || !view?.session) return
    setBusy(true); setError(null); setApproval(null)
    try {
      const saved = await request('/proposal','PUT', { revision: view.session.revision, proposal: { ...draft, recommendations: recommendations.split('\n').map((text) => text.trim()).filter(Boolean) } }) as SetupSnapshot
      receive(saved)
      const data = await request('/preview','POST', { revision: saved.session!.revision })
      setApproval(data.approval)
    } catch (err) { setError((err as Error).message) } finally { setBusy(false) }
  }
  async function apply() {
    if (!approval || !view?.session) return
    setBusy(true); setError(null)
    try { receive(await request('/apply','POST', { revision: view.session.revision, fingerprint: approval.fingerprint })); setApproval(null); window.location.assign('/app/setup') }
    catch (err) { setError((err as Error).message); setApproval(null); await request('').then(receive).catch(() => {}) } finally { setBusy(false) }
  }
  function changeDraft(next: SetupProposal) { setDraft(next); setApproval(null) }
  return <div className="page">
    <div className="page-header"><div><h1>Prepará tu CRM con Plata</h1><p>Una conversación para adaptar el espacio de {view?.name ?? me.tenant.name}.</p></div>{canConfigure && !completed && <Button variant="outline" disabled={locked} onClick={() => void defer()}>Configurar después</Button>}</div>
    {error && <Alert variant="destructive"><AlertDescription><div className="flex flex-col items-start gap-2"><p>{error}</p><Button variant="outline" size="sm" disabled={busy} onClick={() => void refresh().catch((err: Error) => setError(err.message))}>Actualizar conversación</Button></div></AlertDescription></Alert>}
    {!view ? !error && <Skeleton className="h-64 w-full" /> : <>
      {!canConfigure && <Alert><AlertDescription>Solo el propietario o un administrador puede preparar y aprobar la configuración.</AlertDescription></Alert>}
      {!view.supported && <Alert><AlertDescription>El asistente está disponible para inmobiliarias y automotor en esta etapa. Podés seguir trabajando en el CRM o <Link className="underline" href="/app/settings/business">revisar los datos del negocio</Link>.</AlertDescription></Alert>}
      {!view.configured && !completed && <Alert><AlertDescription>El asistente todavía no está disponible. Podés aplicar las <Link className="underline" href="/app/settings/presets">preconfiguraciones manualmente</Link> y continuar después.</AlertDescription></Alert>}
      {deferred && <Card><CardHeader><CardTitle role="heading" aria-level={2}>Tu preparación está guardada</CardTitle><CardDescription>Retomá la conversación cuando quieras.</CardDescription></CardHeader><CardContent><Button disabled={locked || !canConfigure} onClick={() => void resume()}>Retomar preparación</Button></CardContent></Card>}
      {completed ? <Card><CardHeader><CardTitle role="heading" aria-level={2}>Tu CRM está preparado</CardTitle><CardDescription>La configuración fue aprobada y aplicada. Este es el plan que guardamos para tu negocio.</CardDescription></CardHeader><CardContent className="flex flex-col gap-4">
        <p className="whitespace-pre-wrap break-words">{view.session?.proposal?.summary}</p><div className="flex flex-wrap gap-2">{view.session?.proposal?.presets.map((key) => <Badge key={key} variant="secondary">{presets.find((preset) => preset.key === key)?.label}</Badge>)}</div>
        {Boolean(view.session?.proposal?.recommendations.length) && <div><h2 className="font-medium">Próximas acciones</h2><ul className="mt-2 list-disc pl-5">{view.session?.proposal?.recommendations.map((text, index) => <li className="break-words" key={index}>{text}</li>)}</ul></div>}
        {Boolean(view.session?.proposal?.connections.length) && <div><h2 className="font-medium">Herramientas por conectar</h2><p className="text-sm text-muted-foreground">Son pasos pendientes: requieren conexión y autorización.</p><ul className="mt-2 flex flex-col gap-3">{view.session?.proposal?.connections.map((connection, index) => <li key={index}><strong>{connection.tool}</strong><Badge className="ml-2" variant="outline">Pendiente</Badge><p className="text-sm text-muted-foreground">{connection.purpose}</p></li>)}</ul></div>}
        <div className="flex flex-wrap gap-2"><Button asChild><Link href={`/app/${view.profile?.industry === 'real_estate' ? 'properties' : 'vehicles'}`}>Abrir catálogo</Link></Button><Button variant="outline" asChild><Link href="/app/pipeline">Ver procesos comerciales</Link></Button></div>
      </CardContent></Card> : !deferred && <div className="grid items-start gap-4 xl:grid-cols-2">
        <Card><CardHeader><CardTitle role="heading" aria-level={2}>Conversemos sobre tu negocio</CardTitle><CardDescription>Ya tengo los datos del registro. Las respuestas se guardan para retomar después.</CardDescription></CardHeader><CardContent className="flex flex-col gap-4">
          {view.profile && <p className="rounded-md border p-3 text-sm text-muted-foreground">{view.profile.offering}</p>}
          {!view.session?.messages.length ? <><p>Contame cómo trabajás hoy y qué herramientas usás. No compartas contraseñas ni datos privados de tus clientes.</p><Button disabled={locked || !canConfigure || !view.supported || !view.configured} onClick={() => void send('Quiero preparar el CRM para mi negocio. Empecemos con los datos del registro.')}>Empezar preparación</Button></> : <>
            <div role="log" aria-label="Conversación de preparación" aria-live="polite" className="flex max-h-[34rem] flex-col gap-3 overflow-y-auto">
              {view.session.messages.map((item, index) => <div key={index} className="rounded-md border p-3"><p className="mb-1 text-xs text-muted-foreground">{item.role === 'assistant' ? 'Asistente de Plata' : 'Tu equipo'}</p><p className="whitespace-pre-wrap break-words">{item.text}</p></div>)}<div ref={bottom} />
            </div>
            <form className="flex flex-col gap-3" onSubmit={(event) => { event.preventDefault(); void send(message) }}><FieldGroup><Field data-disabled={locked || !canConfigure}><FieldLabel htmlFor="setup-message">Tu respuesta</FieldLabel><Textarea id="setup-message" maxLength={2000} required value={message} disabled={locked || !canConfigure || !view.configured} onChange={(event) => setMessage(event.target.value)} placeholder="Contame cómo trabajan, o pedime una propuesta con lo que ya sabemos…" /></Field></FieldGroup><Button disabled={locked || !canConfigure || !view.configured || !message.trim()}>Enviar respuesta</Button></form>
          </>}
          {locked && <p role="status" className="text-sm text-muted-foreground">El asistente está preparando una respuesta… Podés volver más tarde; la conversación queda guardada.</p>}
        </CardContent></Card>
        {draft ? <Card><CardHeader><CardTitle role="heading" aria-level={2}>Tu propuesta</CardTitle><CardDescription>Podés editarla antes de revisar los cambios y aprobar.</CardDescription></CardHeader><CardContent>
          <form onSubmit={review} className="flex flex-col gap-4"><FieldGroup>
            <Field><FieldLabel htmlFor="setup-summary">Resumen del negocio y configuración</FieldLabel><Textarea id="setup-summary" required maxLength={1200} value={draft.summary} disabled={locked || !canConfigure} onChange={(event) => changeDraft({ ...draft, summary: event.target.value })} /></Field>
            <FieldSet><FieldLegend>Procesos que querés preparar</FieldLegend><FieldGroup>{choices.map((preset) => <Field key={preset.key} orientation="horizontal"><Checkbox id={`setup-${preset.key}`} checked={draft.presets.includes(preset.key)} disabled={locked || !canConfigure} onCheckedChange={(checked) => changeDraft({ ...draft, presets: checked ? [...draft.presets, preset.key] : draft.presets.filter((key) => key !== preset.key) })} /><FieldLabel htmlFor={`setup-${preset.key}`}>{preset.label}</FieldLabel></Field>)}</FieldGroup></FieldSet>
            <Field><FieldLabel htmlFor="setup-recommendations">Próximas acciones</FieldLabel><Textarea id="setup-recommendations" value={recommendations} disabled={locked || !canConfigure} maxLength={1200} onChange={(event) => { setRecommendations(event.target.value); setApproval(null) }} /><FieldDescription>Hasta cinco acciones, una por línea. Se guardan como plan de trabajo.</FieldDescription></Field>
            <FieldSet><FieldLegend>Herramientas por conectar</FieldLegend><FieldDescription>Se guardarán como pendientes. Este paso no conecta ni publica nada.</FieldDescription><FieldGroup>
              {draft.connections.map((connection, index) => <FieldSet key={index}><FieldGroup><Field><FieldLabel htmlFor={`tool-${index}`}>Herramienta {index + 1}</FieldLabel><Input id={`tool-${index}`} required maxLength={80} value={connection.tool} disabled={locked || !canConfigure} onChange={(event) => changeDraft({ ...draft, connections: draft.connections.map((item, position) => position === index ? { ...item, tool: event.target.value } : item) })} /></Field><Field><FieldLabel htmlFor={`purpose-${index}`}>Para qué la usás</FieldLabel><Textarea id={`purpose-${index}`} required maxLength={240} value={connection.purpose} disabled={locked || !canConfigure} onChange={(event) => changeDraft({ ...draft, connections: draft.connections.map((item, position) => position === index ? { ...item, purpose: event.target.value } : item) })} /></Field></FieldGroup><Button type="button" size="sm" variant="outline" disabled={locked || !canConfigure} onClick={() => changeDraft({ ...draft, connections: draft.connections.filter((_, position) => position !== index) })}>Quitar herramienta {index + 1}</Button></FieldSet>)}
            </FieldGroup><Button type="button" variant="outline" disabled={locked || !canConfigure || draft.connections.length >= 8} onClick={() => changeDraft({ ...draft, connections: [...draft.connections, { tool: '', purpose: '' }] })}>Agregar herramienta pendiente</Button></FieldSet>
          </FieldGroup><Button disabled={locked || !canConfigure || !draft.presets.length}>Guardar y revisar cambios</Button></form>
          {approval && <div className="mt-5 flex flex-col gap-4">
            <h2 className="font-medium">Cambios para aprobar</h2>{approval.previews.map((preview) => <div key={preview.key} className="rounded-md border p-3"><h3 className="font-medium">{preview.label}</h3>{preview.alreadyApplied ? <p className="text-sm text-muted-foreground">Ya aplicada. Se conservan tus personalizaciones actuales.</p> : <><p className="text-sm">Se habilita {preview.module === 'properties' ? 'Propiedades' : 'Vehículos'} y se agrega el proceso {preview.pipelineName}.</p><ol className="mt-2 flex flex-wrap gap-2">{preview.stages.map((stage, index) => <li key={stage}><Badge variant="secondary">{index + 1}. {stage}</Badge></li>)}</ol><p className="mt-2 text-sm">Campos opcionales: {preview.fieldsToCreate.join(', ') || 'Se reutilizan los campos existentes'}.</p></>}</div>)}
            {approval.conflicts.length > 0 && <Alert variant="destructive"><AlertDescription>{approval.conflicts.join(' ')}</AlertDescription></Alert>}
            <p className="text-sm text-muted-foreground">Se conservan tus datos y procesos existentes. Las herramientas del plan quedan pendientes de conexión.</p><Button disabled={locked || approval.conflicts.length > 0 || !canConfigure} onClick={() => void apply()}>Aprobar y preparar mi CRM</Button>
          </div>}
        </CardContent></Card> : <Card><CardHeader><CardTitle role="heading" aria-level={2}>Una configuración para tu forma de trabajar</CardTitle><CardDescription>La propuesta aparecerá cuando tengamos lo necesario.</CardDescription></CardHeader><CardContent><p className="text-sm text-muted-foreground">Vas a revisar procesos, campos y próximos pasos antes de aplicar la configuración.</p></CardContent></Card>}
      </div>}
    </>}
  </div>
}



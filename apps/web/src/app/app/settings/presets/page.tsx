'use client'

import { useEffect, useState } from 'react'
import type { CatalogKind, PresetKey, PresetPreview } from '@crm/shared'
import { useApp } from '../../app-context'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'

type Preset = { key: PresetKey; label: string; description: string; version: number; module: CatalogKind }

export default function PresetsSettingsPage() {
  const { apiFetch, me } = useApp()
  const [items, setItems] = useState<Preset[] | null>(null), [preview, setPreview] = useState<PresetPreview | null>(null)
  const [error, setError] = useState<string | null>(null), [previewError, setPreviewError] = useState<string | null>(null), [busy, setBusy] = useState<string | null>(null)
  const canConfigure = ['owner','admin'].includes(me.member.role)
  useEffect(() => {
    const controller = new AbortController()
    apiFetch('/api/presets', { signal: controller.signal }).then(async (res) => {
      const data = await res.json(); if (!res.ok) throw new Error(data.error ?? 'No se pudieron cargar las plantillas')
      if (!controller.signal.aborted) setItems(data.items)
    }).catch((err: Error) => { if (!controller.signal.aborted) setError(err.message) })
    return () => controller.abort()
  }, [apiFetch])
  async function review(key: PresetKey) {
    setBusy(key); setError(null); setPreviewError(null)
    try {
      const res = await apiFetch(`/api/presets/${key}/preview`, { method: 'POST' }), data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'No se pudo revisar la configuración')
      setPreview(data.preview)
    } catch (err) { setError((err as Error).message) } finally { setBusy(null) }
  }
  async function apply() {
    if (!preview) return
    setBusy(preview.key); setPreviewError(null)
    try {
      const res = await apiFetch(`/api/presets/${preview.key}/apply`, { method: 'POST', body: JSON.stringify({ fingerprint: preview.fingerprint }) }), data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'No se pudo aplicar la plantilla')
      window.location.assign(`/app/${preview.module}`)
    } catch (err) { setPreviewError((err as Error).message) } finally { setBusy(null) }
  }
  return <div className="flex flex-col gap-4">
    <div><h2 className="text-xl font-semibold">Preconfiguraciones por nicho</h2><p className="text-sm text-muted-foreground">Prepará el CRM de {me.tenant.name}. Cada plantilla agrega un proceso comercial y campos opcionales a los contactos.</p></div>
    {!canConfigure && <Alert><AlertDescription>El propietario o un administrador puede revisar y aplicar estas plantillas.</AlertDescription></Alert>}
    {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
    {!items ? !error && <Skeleton className="h-48 w-full" /> : <div className="grid gap-4 lg:grid-cols-2">{items.map((item) => <Card key={item.key}>
      <CardHeader><CardTitle>{item.label}</CardTitle><CardDescription>{item.description}</CardDescription></CardHeader><CardContent className="flex flex-col items-start gap-3"><Badge variant="outline">Versión {item.version}</Badge><Button disabled={!canConfigure || Boolean(busy)} onClick={() => void review(item.key)}>{busy === item.key ? 'Revisando…' : 'Revisar configuración'}</Button></CardContent>
    </Card>)}</div>}
    <Sheet open={Boolean(preview)} onOpenChange={(open) => { if (!open && !busy) setPreview(null) }}><SheetContent className="overflow-y-auto sm:max-w-xl"><SheetHeader><SheetTitle>{preview?.label}</SheetTitle><SheetDescription>Revisá lo que se agregará a {me.tenant.name} antes de confirmar.</SheetDescription></SheetHeader>
      {preview && <div className="flex flex-col gap-5 px-4 pb-4">
        {preview.alreadyApplied ? <Alert><AlertDescription>Esta plantilla ya fue aplicada. Se conservan las personalizaciones posteriores; no se vuelven a crear campos ni etapas.</AlertDescription></Alert> : <>
          <div><h3 className="font-medium">Módulo a habilitar</h3><p>{preview.module === 'properties' ? 'Propiedades' : 'Vehículos'}</p></div>
          <div><h3 className="font-medium">Nuevo proceso: {preview.pipelineName}</h3><ol className="mt-2 flex flex-wrap gap-2" aria-label="Etapas de la plantilla">{preview.stages.map((stage, index) => <li key={stage}><Badge variant="secondary">{index + 1}. {stage}</Badge></li>)}</ol></div>
          <div><h3 className="font-medium">Campos opcionales a crear</h3>{preview.fieldsToCreate.length ? <ul className="mt-2 list-disc pl-5 text-sm">{preview.fieldsToCreate.map((label) => <li key={label}>{label}</li>)}</ul> : <p className="text-sm">No se necesitan campos nuevos.</p>}</div>
          {preview.fieldsToReuse.length > 0 && <div><h3 className="font-medium">Campos existentes que se reutilizan</h3><ul className="mt-2 list-disc pl-5 text-sm">{preview.fieldsToReuse.map((label) => <li key={label}>{label}</li>)}</ul></div>}
          <p className="text-sm text-muted-foreground">Se mantienen los contactos, las oportunidades, los procesos y los campos existentes. La plantilla no conecta servicios externos.</p>
        </>}
        {preview.conflicts.length > 0 && <Alert variant="destructive"><AlertDescription><ul className="list-disc pl-4">{preview.conflicts.map((conflict) => <li key={conflict}>{conflict}</li>)}</ul></AlertDescription></Alert>}
        {previewError && <Alert variant="destructive"><AlertDescription>{previewError} Volvé a revisar la configuración para continuar.</AlertDescription></Alert>}
      </div>}
      <SheetFooter><Button variant="outline" disabled={Boolean(busy)} onClick={() => setPreview(null)}>Cerrar</Button>{preview && !preview.alreadyApplied && <Button disabled={Boolean(busy) || preview.conflicts.length > 0 || Boolean(previewError)} onClick={() => void apply()}>{busy ? 'Aplicando…' : 'Aprobar y aplicar'}</Button>}</SheetFooter>
    </SheetContent></Sheet>
  </div>
}

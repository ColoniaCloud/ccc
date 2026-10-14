'use client'
import { useEffect, useState } from 'react'
import type { CatalogKind } from '@crm/shared'
import { useApp } from '@/app/app/app-context'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Field, FieldGroup, FieldLabel, FieldDescription } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from '@/components/ui/empty'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog'
type Photo = { id: string; width: number; height: number; position: number }
function PrivatePhoto({ path, alt }: { path: string; alt: string }) {
  const { apiFetch } = useApp(), [url, setUrl] = useState(''), [error, setError] = useState(false)
  useEffect(() => {
    const controller = new AbortController(); let objectUrl = ''
    setUrl(''); setError(false)
    apiFetch(path, { signal: controller.signal }).then(async res => {
      if (!res.ok) throw new Error('image')
      const blob = await res.blob(); if (controller.signal.aborted) return
      objectUrl = URL.createObjectURL(blob); setUrl(objectUrl)
    }).catch(() => { if (!controller.signal.aborted) setError(true) })
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [apiFetch, path])
  return error ? <p role="status">No se pudo cargar esta foto.</p> : url ? <img src={url} alt={alt} className="max-h-[65vh] w-full object-contain" /> : <Skeleton className="h-40 w-full" />
}
export function CatalogPhotos({ kind, assetId, title }: { kind: CatalogKind; assetId: string; title: string }) {
  const { apiFetch, me } = useApp(), [photos, setPhotos] = useState<Photo[] | null>(null), [error, setError] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false), [removing, setRemoving] = useState<Photo | null>(null), [revision, setRevision] = useState(0)
  const path = `/api/catalog-photos/${kind}/${assetId}`, canWrite = me.member.role !== 'support'
  useEffect(() => {
    const controller = new AbortController(); setPhotos(null); setError('')
    apiFetch(path, { signal: controller.signal }).then(async res => { const body = await res.json(); if (!res.ok) throw new Error(body.error ?? 'No se pudo cargar la galería'); if (!controller.signal.aborted) setPhotos(body.items) }).catch((err: Error) => { if (!controller.signal.aborted) setError(err.message) })
    return () => controller.abort()
  }, [apiFetch, path, revision])
  async function reload() { const res = await apiFetch(path), body = await res.json(); if (!res.ok) throw new Error(body.error ?? 'No se pudo cargar la galería'); setPhotos(body.items) }
  async function upload(files: FileList | null) {
    if (!files?.length || !photos) return
    if (files.length + photos.length > 12) { setError('Podés guardar hasta 12 fotos por ficha. Seleccioná menos archivos.'); return }
    setBusy(true); setError(''); setNotice(''); let uploaded = 0
    try {
      for (const file of Array.from(files)) {
        if (file.size > 6 * 1024 * 1024) throw new Error(`${file.name}: supera los 6 MB`)
        const res = await apiFetch(path, { method: 'POST', headers: { 'Content-Type': file.type || 'application/octet-stream' }, body: file }), body = await res.json()
        if (!res.ok) throw new Error(`${file.name}: ${body.error ?? 'no se pudo subir'}`)
        uploaded++
      }
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudieron subir las fotos') }
    finally { if (uploaded) setNotice(`${uploaded} fotos guardadas.`); try { await reload() } catch (err) { setError((err as Error).message) } setBusy(false) }
  }
  async function reorder(index: number, target: number) {
    if (!photos) return
    const ids = photos.map(p => p.id), [id] = ids.splice(index, 1); ids.splice(target, 0, id!)
    setBusy(true); setError('')
    try { const res = await apiFetch(`${path}/order`, { method: 'PATCH', body: JSON.stringify({ ids }) }), body = await res.json(); if (!res.ok) throw new Error(body.error ?? 'No se pudo cambiar el orden'); await reload() }
    catch (err) { setError((err as Error).message) } finally { setBusy(false) }
  }
  async function remove() {
    if (!removing) return
    setBusy(true); setError('')
    try { const res = await apiFetch(`${path}/${removing.id}`, { method: 'DELETE' }), body = await res.json(); if (!res.ok) throw new Error(body.error ?? 'No se pudo eliminar'); setRemoving(null); await reload() }
    catch (err) { setError((err as Error).message) } finally { setBusy(false) }
  }
  return <Card><CardHeader><CardTitle>Fotos de la ficha</CardTitle><CardDescription>La primera foto es la portada. Solo los miembros de {me.tenant.name} pueden acceder a esta galería.</CardDescription></CardHeader><CardContent className="flex flex-col gap-4">
    {error && <Alert variant="destructive"><AlertDescription>{error} <Button variant="outline" size="sm" onClick={() => setRevision(n => n + 1)} disabled={busy}>Recargar</Button></AlertDescription></Alert>}
    {notice && <p role="status" className="text-sm text-muted-foreground">{notice}</p>}
    {canWrite && <FieldGroup><Field><FieldLabel htmlFor={`photos-${assetId}`}>Agregar fotos</FieldLabel><Input id={`photos-${assetId}`} type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={busy || !photos || photos.length >= 12} onChange={event => { void upload(event.target.files); event.target.value = '' }} /><FieldDescription>JPEG, PNG o WebP, hasta 6 MB y 16 megapíxeles por archivo. Hasta 12 fotos por ficha. Se optimizan y se eliminan los metadatos de ubicación.</FieldDescription></Field></FieldGroup>}
    {busy && <p role="status">Guardando cambios…</p>}
    {!photos && !error ? <Skeleton className="h-40 w-full" /> : photos?.length === 0 ? <Empty><EmptyHeader><EmptyTitle>Esta ficha todavía no tiene fotos</EmptyTitle><EmptyDescription>{canWrite ? 'Seleccioná una o varias imágenes para armar la galería.' : 'El equipo puede agregar fotos desde esta ficha.'}</EmptyDescription></EmptyHeader></Empty> : <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{photos?.map((photo, index) => <div key={photo.id} className="flex min-w-0 flex-col gap-2 rounded-lg border p-3">
      <Dialog><DialogTrigger asChild><Button variant="ghost" className="h-auto w-full p-0" aria-label={`Ampliar foto ${index + 1}`}><PrivatePhoto path={`${path}/${photo.id}/file`} alt={`${title}, foto ${index + 1}`} /></Button></DialogTrigger><DialogContent className="sm:max-w-3xl"><DialogHeader><DialogTitle>{title}: foto {index + 1}</DialogTitle><DialogDescription>Galería privada de esta organización.</DialogDescription></DialogHeader><PrivatePhoto path={`${path}/${photo.id}/file`} alt={`${title}, foto ${index + 1}`} /></DialogContent></Dialog>
      <div className="flex items-center gap-2"><span className="text-sm">Foto {index + 1}</span>{index === 0 && <Badge variant="secondary">Portada</Badge>}</div>
      {canWrite && <div className="flex flex-wrap gap-2">{index > 0 && <Button size="sm" variant="outline" disabled={busy} onClick={() => reorder(index, 0)} aria-label={`Usar foto ${index + 1} como portada`}>Hacer portada</Button>}<Button size="sm" variant="outline" disabled={busy || index === 0} onClick={() => reorder(index, index - 1)} aria-label={`Mover foto ${index + 1} antes`}>Antes</Button><Button size="sm" variant="outline" disabled={busy || index === photos.length - 1} onClick={() => reorder(index, index + 1)} aria-label={`Mover foto ${index + 1} después`}>Después</Button><Button size="sm" variant="outline" disabled={busy} onClick={() => setRemoving(photo)} aria-label={`Eliminar foto ${index + 1}`}>Eliminar</Button></div>}
    </div>)}</div>}
    <AlertDialog open={Boolean(removing)} onOpenChange={open => { if (!open && !busy) setRemoving(null) }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Eliminar foto</AlertDialogTitle><AlertDialogDescription>La foto se elimina de esta ficha. Si es la portada, la siguiente ocupará su lugar.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel><AlertDialogAction disabled={busy} onClick={event => { event.preventDefault(); void remove() }}>Eliminar foto</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </CardContent></Card>
}

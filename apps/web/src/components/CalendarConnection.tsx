'use client'
import { useCallback, useEffect, useState } from 'react'
import { useApp } from '@/app/app/app-context'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog'
type State = { configured: boolean; connection: { status: string; lastSyncedAt: string | null; lastError: string | null; calendarCreated: boolean } | null }
export function CalendarConnection() {
  const { apiFetch, me } = useApp()
  const [state, setState] = useState<State | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false), [confirm, setConfirm] = useState(false)
  const load = useCallback(async () => {
    const res = await apiFetch('/api/calendar'), data = await res.json()
    if (!res.ok) throw new Error(data.error ?? 'No se pudo cargar la conexión')
    setState(data)
  }, [apiFetch])
  useEffect(() => {
    let active = true
    const refresh = () => { if (active) void load().catch((err: Error) => { if (active) setError(err.message) }) }
    const status = new URLSearchParams(window.location.search).get('calendar')
    if (status === 'error') setError('Google no pudo completar la autorización. Volvé a conectar y aceptá el permiso del calendario de Plata.')
    refresh(); const timer = setInterval(refresh, 30000)
    return () => { active = false; clearInterval(timer) }
  }, [load])
  async function action(path: string) {
    setBusy(true); setError('')
    try {
      const res = await apiFetch(`/api/calendar/${path}`, { method: 'POST' }), data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'No se pudo completar la conexión')
      if (data.url) { window.location.assign(data.url); return }
      setConfirm(false); await load()
    } catch (err) { setError((err as Error).message) } finally { setBusy(false) }
  }
  const connected = state?.connection?.status === 'connected', canWrite = me.member.role !== 'support'
  return <Card><CardHeader><div className="flex flex-wrap items-center gap-2"><CardTitle role="heading" aria-level={2}>Tu Google Calendar</CardTitle><Badge variant="outline">{connected ? 'Conectado' : state?.connection?.status === 'reconnect' ? 'Requiere autorización' : 'Sin conectar'}</Badge></div><CardDescription>Un calendario propio de Plata para tus visitas y pruebas de manejo asignadas. Los cambios se hacen en el CRM.</CardDescription></CardHeader>
    <CardContent className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">Se copian el título de la ficha, el horario y la duración. Los contactos y las notas quedan en Plata. Las tareas permanecen en esta agenda.</p>
      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
      {state?.connection?.lastError && <Alert><AlertDescription>{state.connection.lastError}</AlertDescription></Alert>}
      {connected && <p className="text-sm text-muted-foreground">{state?.connection?.lastSyncedAt ? `Última sincronización: ${new Date(state.connection.lastSyncedAt).toLocaleString('es-UY')}.` : 'Preparando el calendario. La primera sincronización puede tardar un minuto.'}</p>}
      {state && !state.configured && <p className="text-sm text-muted-foreground">Plata todavía debe habilitar esta conexión con Google. Podés usar toda la agenda mientras tanto.</p>}
      {canWrite && state && <div className="flex flex-wrap gap-2">{connected ? <><Button variant="outline" disabled={busy || !state.configured} onClick={() => void action('retry')}>Sincronizar ahora</Button><Button variant="outline" disabled={busy} onClick={() => setConfirm(true)}>Desconectar</Button></> : <Button disabled={busy || !state.configured} onClick={() => void action('connect')}>{busy ? 'Conectando…' : 'Autorizar Google Calendar'}</Button>}</div>}
    </CardContent><AlertDialog open={confirm} onOpenChange={(open) => { if (!busy) setConfirm(open) }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Desconectar Google Calendar</AlertDialogTitle><AlertDialogDescription>Plata elimina la autorización guardada y deja de actualizar este calendario. Las citas ya copiadas quedan en Google; podés borrar ese calendario desde allí. Una operación ya enviada puede terminar. Si volvés a conectar, se creará un calendario nuevo.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={busy}>Volver</AlertDialogCancel><AlertDialogAction disabled={busy} onClick={(event) => { event.preventDefault(); void action('disconnect') }}>Desconectar</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </Card>
}

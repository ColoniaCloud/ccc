'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { CatalogKind } from '@crm/shared'
import { useApp } from '@/app/app/app-context'
import { CATALOGS, STATUS_LABELS, priceLabel, type CatalogRecord } from '@/lib/catalogs'
import { CatalogForm } from './CatalogForm'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from '@/components/ui/empty'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'

export function CatalogPage({ kind }: { kind: CatalogKind }) {
  const { apiFetch, me } = useApp(), router = useRouter()
  const [items, setItems] = useState<CatalogRecord[] | null>(null)
  const [search, setSearch] = useState(''), [status, setStatus] = useState('all'), [page, setPage] = useState(1)
  const [error, setError] = useState<string | null>(null), [open, setOpen] = useState(false)
  const config = CATALOGS[kind], enabled = me.tenant.modules.includes(kind)
  useEffect(() => {
    if (!enabled) return
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      setError(null); setItems(null)
      apiFetch(`/api/${kind}?page=${page}&search=${encodeURIComponent(search)}${status === 'all' ? '' : `&status=${status}`}`, { signal: controller.signal })
        .then(async (res) => { const data = await res.json(); if (!res.ok) throw new Error(data.error ?? 'No se pudo cargar el catálogo'); if (!controller.signal.aborted) setItems(data.items) })
        .catch((err: Error) => { if (!controller.signal.aborted) setError(err.message) })
    }, 180)
    return () => { clearTimeout(timer); controller.abort() }
  }, [apiFetch, enabled, kind, page, search, status])
  return <div className="page">
    <div className="page-header"><div><h1>{config.label}</h1><p>Tu oferta, sus interesados y el próximo paso comercial.</p></div>
      {enabled && me.member.role !== 'support' && <Button onClick={() => setOpen(true)}>Nueva ficha</Button>}
    </div>
    {!enabled ? <Card><CardHeader><CardTitle>Prepará tu catálogo</CardTitle><CardDescription>Aplicá una plantilla por nicho para habilitar esta herramienta y sus procesos comerciales.</CardDescription></CardHeader><CardContent><Button asChild><Link href="/app/settings/presets">Ver preconfiguraciones</Link></Button></CardContent></Card> : <>
      <div className="flex flex-wrap gap-3">
        <Input aria-label="Buscar en el catálogo" placeholder="Buscar por título…" className="min-w-0 flex-1" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1) }} />
        <Select value={status} onValueChange={(value) => { setStatus(value); setPage(1) }}><SelectTrigger aria-label="Filtrar disponibilidad"><SelectValue /></SelectTrigger><SelectContent><SelectGroup>
          <SelectItem value="all">Todos los estados</SelectItem>{Object.entries(STATUS_LABELS).filter(([key]) => kind === 'properties' || key !== 'rented').map(([key, label]) => <SelectItem key={key} value={key}>{label}</SelectItem>)}
        </SelectGroup></SelectContent></Select>
      </div>
      {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : !items ? <Skeleton className="h-40 w-full" /> : !items.length ? <Empty><EmptyHeader><EmptyTitle>Sin fichas para mostrar</EmptyTitle><EmptyDescription>Agregá tu primera {config.singular} o ajustá los filtros.</EmptyDescription></EmptyHeader></Empty> : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{items.map((item) => <Card key={item.id}>
          <CardHeader><CardTitle><Link href={`/app/${kind}/${item.id}`}>{item.title}</Link></CardTitle><CardDescription>{kind === 'properties' ? `${item.address}, ${item.city}` : `${item.make} ${item.model} · ${item.year}`}</CardDescription></CardHeader>
          <CardContent className="flex flex-col gap-3"><Badge variant="secondary">{STATUS_LABELS[item.status]}</Badge><p>{priceLabel(item)}</p><Button asChild variant="outline"><Link href={`/app/${kind}/${item.id}`}>Abrir ficha</Link></Button></CardContent>
        </Card>)}</div>
      )}
      <div className="flex items-center justify-between gap-2"><Button variant="outline" disabled={page === 1 || !items} onClick={() => setPage(page - 1)}>Anterior</Button><span>Página {page}</span><Button variant="outline" disabled={!items || items.length < 50} onClick={() => setPage(page + 1)}>Siguiente</Button></div>
    </>}
    <Sheet open={open} onOpenChange={setOpen}><SheetContent className="overflow-y-auto sm:max-w-xl"><SheetHeader><SheetTitle>Nueva {config.singular}</SheetTitle><SheetDescription>Cargá los datos comerciales de la ficha.</SheetDescription></SheetHeader><div className="px-4 pb-4"><CatalogForm kind={kind} onSaved={(item) => { setOpen(false); router.push(`/app/${kind}/${item.id}`) }} /></div></SheetContent></Sheet>
  </div>
}

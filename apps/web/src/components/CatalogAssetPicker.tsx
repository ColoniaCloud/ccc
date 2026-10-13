'use client'

import { useEffect, useState } from 'react'
import type { CatalogKind } from '@crm/shared'
import { useApp } from '@/app/app/app-context'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { CATALOGS, type CatalogRecord } from '@/lib/catalogs'

export function CatalogAssetPicker({ value, onChange, disabled }: { value: string; onChange: (value: string) => void; disabled: boolean }) {
  const { apiFetch, me } = useApp()
  const [search, setSearch] = useState(''), [items, setItems] = useState<{ value: string; title: string }[]>([])
  const [selected, setSelected] = useState<{ value: string; title: string } | null>(null), [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (value === 'none') { setSelected(null); return }
    const controller = new AbortController(), [kind, id] = value.split(':')
    apiFetch(`/api/${kind}/${id}`, { signal: controller.signal }).then(async (res) => {
      const data = await res.json(); if (!res.ok) throw new Error(data.error ?? 'No se pudo cargar la ficha seleccionada')
      if (!controller.signal.aborted) setSelected({ value, title: data.item.title })
    }).catch((err: Error) => { if (!controller.signal.aborted) setError(err.message) })
    return () => controller.abort()
  }, [apiFetch, value])
  useEffect(() => {
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      const kinds = (['properties','vehicles'] as CatalogKind[]).filter((kind) => me.tenant.modules.includes(kind))
      Promise.all(kinds.flatMap((kind) => ['available','reserved'].map(async (status) => {
        const res = await apiFetch(`/api/${kind}?status=${status}&search=${encodeURIComponent(search)}`, { signal: controller.signal }), data = await res.json()
        if (!res.ok) throw new Error(data.error ?? 'No se pudieron cargar las fichas')
        return (data.items as CatalogRecord[]).map((item) => ({ value: `${kind}:${item.id}`, title: `${CATALOGS[kind].label}: ${item.title}` }))
      }))).then((lists) => { if (!controller.signal.aborted) { setItems(lists.flat()); setError(null) } }).catch((err: Error) => { if (!controller.signal.aborted) setError(err.message) })
    }, 200)
    return () => { clearTimeout(timer); controller.abort() }
  }, [apiFetch, me.tenant.modules, search])
  const choices = selected && !items.some((item) => item.value === selected.value) ? [selected, ...items] : items
  return <div className="flex flex-col gap-2">
    <Input aria-label="Buscar propiedad o vehículo" placeholder="Buscar ficha por título…" value={search} onChange={(event) => setSearch(event.target.value)} disabled={disabled} />
    <Select value={value} onValueChange={onChange} disabled={disabled}><SelectTrigger id="deal-asset" className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup>
      <SelectItem value="none">Sin ficha asociada</SelectItem>{choices.map((item) => <SelectItem key={item.value} value={item.value}>{item.title}</SelectItem>)}
    </SelectGroup></SelectContent></Select>
    <p className="text-xs text-muted-foreground">Se muestran fichas disponibles o reservadas. Buscá por título para encontrar otras.</p>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </div>
}

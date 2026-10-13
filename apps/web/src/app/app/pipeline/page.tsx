'use client'

import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import Link from 'next/link'
import { CatalogAssetPicker } from '@/components/CatalogAssetPicker'
import { loadContactOptions } from '@/lib/contact-options'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Add01Icon,
  Delete02Icon,
  KanbanIcon,
  Layers01Icon,
  MoneyBag02Icon,
  MoreHorizontalIcon,
  Move01Icon,
} from '@hugeicons/core-free-icons'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { useApp } from '../app-context'

type Stage = { id: string; name: string; color: string; position: number }
type Pipeline = { id: string; name: string; stages: Stage[] }

type Deal = {
  id: string
  pipelineId: string
  stageId: string
  contactId: string | null
  contactName: string | null
  title: string
  value: string
  currency: string
  propertyId: string | null
  vehicleId: string | null
  propertyTitle: string | null
  vehicleTitle: string | null
  assignedTo: string | null
}

type Contact = { id: string; name: string }

const CURRENCIES = ['USD', 'UYU', 'ARS', 'CLP', 'BRL']

function formatValue(value: string, currency: string) {
  const numericValue = Number(value)
  if (Number.isNaN(numericValue)) return `${currency} ${value}`
  return new Intl.NumberFormat('es-UY', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(numericValue)
}

export default function PipelinePage() {
  const { apiFetch, me } = useApp()
  const canWrite = me.member.role !== 'support'

  const [pipeline, setPipeline] = useState<Pipeline | null>(null)
  const [pipelines, setPipelines] = useState<Pipeline[]>([])
  const [members, setMembers] = useState<Contact[]>([])
  const [deals, setDeals] = useState<Deal[] | null>(null)
  const [contacts, setContacts] = useState<Contact[]>([])
  const [listError, setListError] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Deal | null>(null)
  const [deleting, setDeleting] = useState(false)

  const [title, setTitle] = useState('')
  const [value, setValue] = useState('')
  const [currency, setCurrency] = useState('USD')
  const [contactId, setContactId] = useState('none')
  const [stageId, setStageId] = useState('')
  const [asset, setAsset] = useState('none')
  const [assignedTo, setAssignedTo] = useState('none')
  const activeStageId = pipeline?.stages.some((stage) => stage.id === stageId) ? stageId : pipeline?.stages[0]?.id ?? ''

  async function loadDeals() {
    const response = await apiFetch('/api/deals')
    if (!response.ok) throw new Error('No se pudieron cargar las oportunidades')
    const data = await response.json() as { items: Deal[] }
    setDeals(data.items)
  }

  useEffect(() => {
    async function load() {
      try {
        const [pipelinesResponse, contactItems, membersResponse] = await Promise.all([
          apiFetch('/api/pipelines'),
          loadContactOptions(apiFetch),
          apiFetch(`/api/organizations/${encodeURIComponent(me.tenant.slug)}/team`),
        ])
        if (!pipelinesResponse.ok || !membersResponse.ok) throw new Error('No se pudo cargar el pipeline')

        const pipelinesData = await pipelinesResponse.json() as { items: Pipeline[] }
        const params = new URLSearchParams(window.location.search)
        const activePipeline = pipelinesData.items.find((item) => item.id === params.get('pipelineId')) ?? pipelinesData.items[0] ?? null

        setPipelines(pipelinesData.items)
        setMembers((await membersResponse.json()).items)
        setPipeline(activePipeline)
        setStageId(activePipeline?.stages[0]?.id ?? '')
        setContacts(contactItems)
        const kind = params.has('propertyId') ? 'properties' : params.has('vehicleId') ? 'vehicles' : null
        if (kind && canWrite && me.tenant.modules.includes(kind)) {
          const id = params.get(kind === 'properties' ? 'propertyId' : 'vehicleId')!
          const assetRes = await apiFetch(`/api/${kind}/${id}`), assetData = await assetRes.json()
          if (!assetRes.ok) throw new Error(assetData.error ?? 'No se pudo cargar la ficha')
          if (!['available','reserved'].includes(assetData.item.status)) throw new Error('La ficha ya no está disponible')
          setAsset(`${kind}:${id}`); setTitle(assetData.item.title); setValue(assetData.item.price ?? ''); setCurrency(assetData.item.currency)
          setAssignedTo(assetData.item.assignedTo ?? 'none'); setCreateOpen(true)
        }
        await loadDeals()
        setListError(null)
      } catch (loadError: unknown) {
        setListError(loadError instanceof Error ? loadError.message : 'No se pudo cargar el pipeline')
        setDeals([])
      }
    }

    load()
  }, [apiFetch, canWrite, me.tenant.slug, me.tenant.modules])

  function resetForm() {
    setTitle('')
    setValue('')
    setCurrency('USD')
    setContactId('none')
    setStageId(pipeline?.stages[0]?.id ?? '')
    setAsset('none')
    setAssignedTo('none')
    setFormError(null)
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!pipeline || !activeStageId) return

    setFormError(null)
    setSubmitting(true)

    try {
      const response = await apiFetch('/api/deals', {
        method: 'POST',
        body: JSON.stringify({
          title,
          pipelineId: pipeline.id,
          stageId: activeStageId,
          value: value || undefined,
          currency,
          contactId: contactId === 'none' ? undefined : contactId,
          propertyId: asset.startsWith('properties:') ? asset.split(':')[1] : null,
          vehicleId: asset.startsWith('vehicles:') ? asset.split(':')[1] : null,
          assignedTo: assignedTo === 'none' ? null : assignedTo,
        }),
      })

      if (!response.ok) {
        const body = await response.json().catch(() => null) as { error?: string } | null
        throw new Error(body?.error ?? 'No se pudo crear la oportunidad')
      }

      resetForm()
      setCreateOpen(false)
      await loadDeals()
    } catch (submitError: unknown) {
      setFormError(submitError instanceof Error ? submitError.message : 'No se pudo crear la oportunidad')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleMove(dealId: string, nextStageId: string) {
    const previous = deals
    setDeals((current) => current?.map((deal) => deal.id === dealId ? { ...deal, stageId: nextStageId } : deal) ?? null)

    try {
      const response = await apiFetch(`/api/deals/${dealId}`, {
        method: 'PATCH',
        body: JSON.stringify({ stageId: nextStageId }),
      })
      if (!response.ok) throw new Error('No se pudo mover la oportunidad')
      setListError(null)
    } catch (moveError: unknown) {
      setDeals(previous ?? null)
      setListError(moveError instanceof Error ? moveError.message : 'No se pudo mover la oportunidad')
    }
  }

  async function handleDeleteConfirmed() {
    const target = deleteTarget
    if (!target) return

    setDeleting(true)
    try {
      const response = await apiFetch(`/api/deals/${target.id}`, { method: 'DELETE' })
      if (!response.ok) throw new Error('No se pudo eliminar la oportunidad')
      setDeals((current) => current?.filter((deal) => deal.id !== target.id) ?? null)
      setDeleteTarget(null)
      setListError(null)
    } catch (deleteError: unknown) {
      setListError(deleteError instanceof Error ? deleteError.message : 'No se pudo eliminar la oportunidad')
    } finally {
      setDeleting(false)
    }
  }

  const summary = useMemo(() => {
    const items = (deals ?? []).filter((deal) => deal.pipelineId === pipeline?.id)
    return {
      total: items.length,
      usdValue: items
        .filter((deal) => deal.currency === 'USD')
        .reduce((sum, deal) => sum + (Number(deal.value) || 0), 0),
    }
  }, [deals, pipeline?.id])

  return (
    <div className="page pipeline-page">
      <div className="page-header crm-page-header">
        <div>
          <div className="crm-title-row">
            <h1>Pipeline</h1>
            {pipeline && <Badge variant="secondary">{pipeline.name}</Badge>}
          </div>
          <p>Seguí cada oportunidad y mantené el proceso comercial en movimiento.</p>
        </div>
        {canWrite && <Button onClick={() => setCreateOpen(true)} disabled={!pipeline?.stages.length}>
          <HugeiconsIcon icon={Add01Icon} strokeWidth={2} data-icon="inline-start" />
          Nueva oportunidad
        </Button>}
      </div>

      {pipelines.length > 1 && <Field className="max-w-sm"><FieldLabel htmlFor="pipeline-selector">Proceso comercial</FieldLabel><Select value={pipeline?.id ?? ''} onValueChange={(id) => { const next = pipelines.find((item) => item.id === id)!; setPipeline(next); setStageId(next.stages[0]?.id ?? '') }}><SelectTrigger id="pipeline-selector" className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{pipelines.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>}

      {listError && (
        <Alert variant="destructive">
          <AlertDescription>{listError}</AlertDescription>
        </Alert>
      )}

      <div className="pipeline-overview" aria-label="Resumen del pipeline">
        <Card size="sm">
          <CardHeader>
            <CardDescription>Oportunidades</CardDescription>
            <CardAction><span className="pipeline-overview-icon"><HugeiconsIcon icon={KanbanIcon} strokeWidth={1.8} /></span></CardAction>
          </CardHeader>
          <CardContent><strong>{deals ? summary.total : '—'}</strong><span>en todas las etapas</span></CardContent>
        </Card>
        <Card size="sm">
          <CardHeader>
            <CardDescription>Valor en USD</CardDescription>
            <CardAction><span className="pipeline-overview-icon"><HugeiconsIcon icon={MoneyBag02Icon} strokeWidth={1.8} /></span></CardAction>
          </CardHeader>
          <CardContent><strong>{deals ? formatValue(String(summary.usdValue), 'USD') : '—'}</strong><span>sin mezclar monedas</span></CardContent>
        </Card>
        <Card size="sm">
          <CardHeader>
            <CardDescription>Etapas</CardDescription>
            <CardAction><span className="pipeline-overview-icon"><HugeiconsIcon icon={Layers01Icon} strokeWidth={1.8} /></span></CardAction>
          </CardHeader>
          <CardContent><strong>{pipeline?.stages.length ?? '—'}</strong><span>en el proceso actual</span></CardContent>
        </Card>
      </div>

      {!pipeline || deals === null ? (
        <div className="pipeline-board-loading" aria-label="Cargando pipeline">
          {Array.from({ length: 3 }).map((_, index) => (
            <Card className="pipeline-column-v2" key={index}>
              <CardHeader><Skeleton className="h-5 w-28" /><Skeleton className="h-4 w-16" /></CardHeader>
              <CardContent className="pipeline-loading-cards"><Skeleton className="h-28 w-full" /><Skeleton className="h-28 w-full" /></CardContent>
            </Card>
          ))}
        </div>
      ) : pipeline.stages.length === 0 ? (
        <Card>
          <CardHeader><CardTitle>Pipeline sin etapas</CardTitle><CardDescription>Configurá al menos una etapa para empezar a trabajar.</CardDescription></CardHeader>
          <CardContent>
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon"><HugeiconsIcon icon={KanbanIcon} strokeWidth={1.8} /></EmptyMedia>
                <EmptyTitle>No hay etapas configuradas</EmptyTitle>
                <EmptyDescription>La creación de oportunidades estará disponible cuando el pipeline tenga etapas.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          </CardContent>
        </Card>
      ) : (
        <div className="pipeline-board-v2">
          {pipeline.stages.map((stage) => {
            const stageDeals = deals.filter((deal) => deal.stageId === stage.id)
            const stageUsdValue = stageDeals
              .filter((deal) => deal.currency === 'USD')
              .reduce((sum, deal) => sum + (Number(deal.value) || 0), 0)

            return (
              <Card
                className="pipeline-column-v2"
                key={stage.id}
                style={{ '--stage-color': stage.color } as CSSProperties}
              >
                <CardHeader className="pipeline-column-header-v2">
                  <CardTitle><span className="pipeline-stage-dot" />{stage.name}</CardTitle>
                  <CardDescription>{stageUsdValue > 0 ? `${formatValue(String(stageUsdValue), 'USD')} en USD` : 'Sin valor en USD'}</CardDescription>
                  <CardAction><Badge variant="outline">{stageDeals.length}</Badge></CardAction>
                </CardHeader>
                <CardContent className="pipeline-column-content-v2">
                  {stageDeals.length === 0 ? (
                    <Empty className="pipeline-stage-empty">
                      <EmptyHeader>
                        <EmptyTitle>Etapa vacía</EmptyTitle>
                        <EmptyDescription>Mové una oportunidad acá o creá una nueva.</EmptyDescription>
                      </EmptyHeader>
                    </Empty>
                  ) : stageDeals.map((deal) => (
                    <Card size="sm" className="pipeline-deal-card" key={deal.id}>
                      <CardHeader>
                        <CardTitle>{deal.title}</CardTitle>
                        <CardDescription>{deal.contactName ?? 'Sin contacto asociado'}</CardDescription>
                        {canWrite && <CardAction>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon-sm" aria-label={`Acciones para ${deal.title}`}>
                                <HugeiconsIcon icon={MoreHorizontalIcon} strokeWidth={2} />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuGroup>
                                <DropdownMenuSub>
                                  <DropdownMenuSubTrigger>
                                    <HugeiconsIcon icon={Move01Icon} strokeWidth={2} />
                                    Mover a
                                  </DropdownMenuSubTrigger>
                                  <DropdownMenuSubContent>
                                    <DropdownMenuGroup>
                                      {pipeline.stages.map((destination) => (
                                        <DropdownMenuItem
                                          key={destination.id}
                                          disabled={destination.id === deal.stageId}
                                          onSelect={() => void handleMove(deal.id, destination.id)}
                                        >
                                          {destination.name}
                                        </DropdownMenuItem>
                                      ))}
                                    </DropdownMenuGroup>
                                  </DropdownMenuSubContent>
                                </DropdownMenuSub>
                                <DropdownMenuItem variant="destructive" onSelect={() => setDeleteTarget(deal)}>
                                  <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
                                  Eliminar
                                </DropdownMenuItem>
                              </DropdownMenuGroup>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </CardAction>}
                      </CardHeader>
                      <CardContent className="flex flex-col gap-2"><strong className="pipeline-deal-value">{formatValue(deal.value, deal.currency)}</strong>
                        {(deal.propertyId || deal.vehicleId) && <Link className="text-sm underline" href={`/app/${deal.propertyId ? 'properties' : 'vehicles'}/${deal.propertyId ?? deal.vehicleId}`}>{deal.propertyTitle ?? deal.vehicleTitle ?? 'Abrir ficha'}</Link>}
                        {deal.assignedTo && <p className="text-xs text-muted-foreground">{members.find((member) => member.id === deal.assignedTo)?.name ?? 'Sin responsable'}</p>}
                        {canWrite && <Button asChild variant="outline" size="sm"><Link href={`/app/agenda?newTask=1&dealId=${deal.id}`}>Planificar seguimiento</Link></Button>}
                      </CardContent>
                    </Card>
                  ))}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <Sheet open={createOpen} onOpenChange={(open) => { setCreateOpen(open); if (!open) resetForm() }}>
        <SheetContent className="crm-create-sheet">
          <SheetHeader>
            <SheetTitle>Nueva oportunidad</SheetTitle>
            <SheetDescription>Registrá el negocio y ubicalo en la etapa correcta del proceso.</SheetDescription>
          </SheetHeader>
          <form className="crm-sheet-form" onSubmit={handleSubmit}>
            <div className="crm-sheet-body">
              <FieldGroup>
                {pipelines.length > 1 && <Field><FieldLabel htmlFor="deal-pipeline">Proceso comercial</FieldLabel><Select value={pipeline?.id ?? ''} onValueChange={(id) => { const next = pipelines.find((item) => item.id === id)!; setPipeline(next); setStageId(next.stages[0]?.id ?? '') }} disabled={submitting}><SelectTrigger id="deal-pipeline" className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{pipelines.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>}
                <Field data-invalid={Boolean(formError && !title.trim())}>
                  <FieldLabel htmlFor="deal-title">Título</FieldLabel>
                  <Input
                    id="deal-title"
                    required
                    autoFocus
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    placeholder="Interés comercial — cliente"
                    aria-invalid={Boolean(formError && !title.trim())}
                  />
                </Field>
                {me.tenant.modules.some((key) => key === 'properties' || key === 'vehicles') && <Field><FieldLabel htmlFor="deal-asset">Propiedad o vehículo</FieldLabel><CatalogAssetPicker value={asset} onChange={setAsset} disabled={submitting} /></Field>}
                <Field><FieldLabel htmlFor="deal-assigned">Responsable</FieldLabel><Select value={assignedTo} onValueChange={setAssignedTo}><SelectTrigger id="deal-assigned" className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="none">Sin asignar</SelectItem>{members.map((member) => <SelectItem key={member.id} value={member.id}>{member.name}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>
                <div className="crm-field-grid crm-field-grid--value">
                  <Field>
                    <FieldLabel htmlFor="deal-value">Valor</FieldLabel>
                    <Input id="deal-value" type="number" min="0" step="0.01" value={value} onChange={(event) => setValue(event.target.value)} placeholder="1500" />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="deal-currency">Moneda</FieldLabel>
                    <Select value={currency} onValueChange={setCurrency}>
                      <SelectTrigger id="deal-currency" className="w-full"><SelectValue /></SelectTrigger>
                      <SelectContent position="popper">
                        <SelectGroup>{CURRENCIES.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectGroup>
                      </SelectContent>
                    </Select>
                  </Field>
                </div>
                <Field>
                  <FieldLabel htmlFor="deal-contact">Contacto</FieldLabel>
                  <Select value={contactId} onValueChange={setContactId}>
                    <SelectTrigger id="deal-contact" className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent position="popper">
                      <SelectGroup>
                        <SelectItem value="none">Sin contacto</SelectItem>
                        {contacts.map((contact) => <SelectItem key={contact.id} value={contact.id}>{contact.name}</SelectItem>)}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
                <Field>
                  <FieldLabel htmlFor="deal-stage">Etapa inicial</FieldLabel>
                  <Select key={pipeline?.id} value={activeStageId} onValueChange={(id) => { if (id) setStageId(id) }}>
                    <SelectTrigger id="deal-stage" className="w-full"><SelectValue placeholder="Elegí una etapa" /></SelectTrigger>
                    <SelectContent position="popper">
                      <SelectGroup>
                        {pipeline?.stages.map((stage) => <SelectItem key={stage.id} value={stage.id}>{stage.name}</SelectItem>)}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
                {formError && <FieldError>{formError}</FieldError>}
              </FieldGroup>
            </div>
            <SheetFooter>
              <SheetClose asChild><Button type="button" variant="outline">Cancelar</Button></SheetClose>
              <Button type="submit" disabled={submitting || !pipeline || !activeStageId}>{submitting ? 'Guardando…' : 'Crear oportunidad'}</Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>

      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => { if (!open && !deleting) setDeleteTarget(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia><HugeiconsIcon icon={Delete02Icon} strokeWidth={1.8} /></AlertDialogMedia>
            <AlertDialogTitle>Eliminar oportunidad</AlertDialogTitle>
            <AlertDialogDescription>
              Vas a eliminar “{deleteTarget?.title}” del pipeline. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={deleting} onClick={() => void handleDeleteConfirmed()}>
              {deleting ? 'Eliminando…' : 'Eliminar definitivamente'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

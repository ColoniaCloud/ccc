'use client'

import { useEffect, useMemo, useState, type CSSProperties } from 'react'
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
  const { apiFetch } = useApp()

  const [pipeline, setPipeline] = useState<Pipeline | null>(null)
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

  async function loadDeals() {
    const response = await apiFetch('/api/deals')
    if (!response.ok) throw new Error('No se pudieron cargar las oportunidades')
    const data = await response.json() as { items: Deal[] }
    setDeals(data.items)
  }

  useEffect(() => {
    async function load() {
      try {
        const [pipelinesResponse, contactsResponse] = await Promise.all([
          apiFetch('/api/pipelines'),
          apiFetch('/api/contacts?pageSize=100&sort=name_asc'),
        ])
        if (!pipelinesResponse.ok || !contactsResponse.ok) throw new Error('No se pudo cargar el pipeline')

        const pipelinesData = await pipelinesResponse.json() as { items: Pipeline[] }
        const contactsData = await contactsResponse.json() as { items: Contact[] }
        const activePipeline = pipelinesData.items[0] ?? null

        setPipeline(activePipeline)
        setStageId(activePipeline?.stages[0]?.id ?? '')
        setContacts(contactsData.items)
        await loadDeals()
        setListError(null)
      } catch (loadError: unknown) {
        setListError(loadError instanceof Error ? loadError.message : 'No se pudo cargar el pipeline')
        setDeals([])
      }
    }

    load()
  }, [apiFetch])

  function resetForm() {
    setTitle('')
    setValue('')
    setCurrency('USD')
    setContactId('none')
    setStageId(pipeline?.stages[0]?.id ?? '')
    setFormError(null)
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!pipeline || !stageId) return

    setFormError(null)
    setSubmitting(true)

    try {
      const response = await apiFetch('/api/deals', {
        method: 'POST',
        body: JSON.stringify({
          title,
          pipelineId: pipeline.id,
          stageId,
          value: value || undefined,
          currency,
          contactId: contactId === 'none' ? undefined : contactId,
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
    const items = deals ?? []
    return {
      total: items.length,
      usdValue: items
        .filter((deal) => deal.currency === 'USD')
        .reduce((sum, deal) => sum + (Number(deal.value) || 0), 0),
    }
  }, [deals])

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
        <Button onClick={() => setCreateOpen(true)} disabled={!pipeline?.stages.length}>
          <HugeiconsIcon icon={Add01Icon} strokeWidth={2} data-icon="inline-start" />
          Nueva oportunidad
        </Button>
      </div>

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
                        <CardAction>
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
                        </CardAction>
                      </CardHeader>
                      <CardContent><strong className="pipeline-deal-value">{formatValue(deal.value, deal.currency)}</strong></CardContent>
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
                <Field data-invalid={Boolean(formError && !title.trim())}>
                  <FieldLabel htmlFor="deal-title">Título</FieldLabel>
                  <Input
                    id="deal-title"
                    required
                    autoFocus
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    placeholder="Licencia anual — Acme"
                    aria-invalid={Boolean(formError && !title.trim())}
                  />
                </Field>
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
                  <Select value={stageId} onValueChange={setStageId}>
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
              <Button type="submit" disabled={submitting || !pipeline || !stageId}>{submitting ? 'Guardando…' : 'Crear oportunidad'}</Button>
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

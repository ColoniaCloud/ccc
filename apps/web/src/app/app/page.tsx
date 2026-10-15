'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Add01Icon,
  ArrowRight01Icon,
  CheckListIcon,
  Contact01Icon,
  KanbanIcon,
  MoneyBag02Icon,
} from '@hugeicons/core-free-icons'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { useApp } from './app-context'
import { SetupWelcome } from '@/components/SetupWelcome'
import { ActivationGuide } from '@/components/ActivationGuide'
import { DailyFocus } from '@/components/DailyFocus'
import { commercialSummary, pipelineSummary } from '@crm/shared'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectGroup, SelectItem } from '@/components/ui/select'

type Contact = {
  id: string
  name: string
  companyName: string | null
  status: 'lead' | 'prospect' | 'client' | 'inactive'
}

type Deal = {
  id: string
  title: string
  value: string
  currency: string
  contactName: string | null
  stageId: string
  pipelineId: string
}

type Task = {
  id: string
  title: string
  dueDate: string | null
  dueOn: string | null
  done: boolean
}

type Stage = { id: string; name: string; color: string; position: number; outcome: 'open' | 'won' | 'lost' }
type Pipeline = { id: string; name: string; stages: Stage[] }
type DashboardData = {
  contacts: Contact[]
  contactTotal: number
  deals: Deal[]
  tasks: Task[]
  pipelines: Pipeline[]
}

const STATUS_LABELS: Record<Contact['status'], string> = {
  lead: 'Lead',
  prospect: 'Prospecto',
  client: 'Cliente',
  inactive: 'Inactivo',
}

function formatMoney(value: string, currency: string) {
  const numericValue = Number(value)
  if (Number.isNaN(numericValue)) return `${currency} ${value}`
  return new Intl.NumberFormat('es-UY', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(numericValue)
}

export default function AppHomePage() {
  const { me, apiFetch } = useApp()
  const [data, setData] = useState<DashboardData | null>(null)
  const [activationReady, setActivationReady] = useState(false)
  const [pipelineId, setPipelineId] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const [contactsRes, dealsRes, tasksRes, pipelinesRes] = await Promise.all([
          apiFetch('/api/contacts?pageSize=6'),
          apiFetch('/api/deals'),
          apiFetch('/api/tasks'),
          apiFetch('/api/pipelines'),
        ])

        if (![contactsRes, dealsRes, tasksRes, pipelinesRes].every((response) => response.ok)) {
          throw new Error('No se pudo cargar el resumen del espacio')
        }

        const [contactsData, dealsData, tasksData, pipelinesData] = await Promise.all([
          contactsRes.json() as Promise<{ items: Contact[]; total?: number }>,
          dealsRes.json() as Promise<{ items: Deal[] }>,
          tasksRes.json() as Promise<{ items: Task[] }>,
          pipelinesRes.json() as Promise<{ items: Pipeline[] }>,
        ])

        if (!cancelled) {
          setData({
            contacts: contactsData.items,
            contactTotal: contactsData.total ?? contactsData.items.length,
            deals: dealsData.items,
            tasks: tasksData.items,
            pipelines: pipelinesData.items,
          })
        }
      } catch (loadError: unknown) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'No se pudo cargar el resumen')
        }
      }
    }

    load()
    return () => { cancelled = true }
  }, [apiFetch])

  const metrics = useMemo(() => {
    const tasks = data?.tasks ?? []
    const pendingTasks = tasks.filter((task) => !task.done)
    const completedTasks = tasks.filter((task) => task.done).length
    const commercial = commercialSummary(data?.deals ?? [], data?.pipelines ?? [])

    return {
      pendingTasks,
      ...commercial,
      completionRate: tasks.length ? Math.round((completedTasks / tasks.length) * 100) : 0,
    }
  }, [data])

  const selectedPipeline = data?.pipelines.find(p => p.id === pipelineId) ?? data?.pipelines[0]
  const chart = pipelineSummary(data?.deals ?? [], selectedPipeline)
  const stageSummaries = chart.stages

  const firstName = me.user.name.split(' ')[0]

  return (
    <div className="page dashboard-page">
      <SetupWelcome />
      <div className="dashboard-hero">
        <div>
          <span className="dashboard-date" suppressHydrationWarning>
            {new Intl.DateTimeFormat('es-UY', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())}
          </span>
          <h1>Buen día, {firstName}</h1>
          <p>Acá tenés una lectura rápida de lo que necesita atención hoy.</p>
        </div>
        <div className="dashboard-hero-actions">
          <Button variant="outline" asChild>
            <Link href="/app/pipeline">
              <HugeiconsIcon icon={KanbanIcon} strokeWidth={2} data-icon="inline-start" />
              Ver pipeline
            </Link>
          </Button>
          <Button asChild>
            <Link href="/app/contacts">
              <HugeiconsIcon icon={Add01Icon} strokeWidth={2} data-icon="inline-start" />
              Nuevo contacto
            </Link>
          </Button>
        </div>
      </div>

      {(activationReady ? [
        <DailyFocus key="daily" />,
        <ActivationGuide key="activation" onReadyChange={setActivationReady} />,
      ] : [
        <ActivationGuide key="activation" onReadyChange={setActivationReady} />,
        <DailyFocus key="daily" />,
      ])}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="dashboard-metrics" aria-label="Indicadores principales">
        <Card size="sm" className="metric-card">
          <CardHeader>
            <CardDescription>Contactos</CardDescription>
            <CardAction><span className="metric-icon"><HugeiconsIcon icon={Contact01Icon} strokeWidth={1.8} /></span></CardAction>
          </CardHeader>
          <CardContent>
            <strong className="metric-value">{data ? data.contactTotal : '—'}</strong>
            <span className="metric-support">en tu base comercial</span>
          </CardContent>
        </Card>

        <Card size="sm" className="metric-card">
          <CardHeader>
            <CardDescription>Negocios abiertos</CardDescription>
            <CardAction><span className="metric-icon"><HugeiconsIcon icon={KanbanIcon} strokeWidth={1.8} /></span></CardAction>
          </CardHeader>
          <CardContent>
            <strong className="metric-value">{data ? metrics.openCount : '—'}</strong>
            <span className="metric-support">en todos tus procesos comerciales</span>
          </CardContent>
        </Card>

        <Card size="sm" className="metric-card">
          <CardHeader>
            <CardDescription>Pipeline en USD</CardDescription>
            <CardAction><span className="metric-icon"><HugeiconsIcon icon={MoneyBag02Icon} strokeWidth={1.8} /></span></CardAction>
          </CardHeader>
          <CardContent>
            <strong className="metric-value metric-value--money">
              {data ? formatMoney(String(metrics.usdPipeline), 'USD') : '—'}
            </strong>
            <span className="metric-support">oportunidades abiertas, solo USD</span>
          </CardContent>
        </Card>

        <Card size="sm" className="metric-card">
          <CardHeader>
            <CardDescription>Tareas pendientes</CardDescription>
            <CardAction><span className="metric-icon"><HugeiconsIcon icon={CheckListIcon} strokeWidth={1.8} /></span></CardAction>
          </CardHeader>
          <CardContent>
            <strong className="metric-value">{data ? metrics.pendingTasks.length : '—'}</strong>
            <span className="metric-support">{metrics.completionRate}% completado</span>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4">
        <Card className="dashboard-pipeline-card">
          <CardHeader>
            <CardTitle>Estado del pipeline</CardTitle>
            <CardDescription>Distribución de oportunidades por etapa.</CardDescription>
            <CardAction>
              <Badge variant="secondary">{chart.count} negocios</Badge>
            </CardAction>
          </CardHeader>
          <CardContent>
            {data && data.pipelines.length > 1 && <Select value={selectedPipeline?.id} onValueChange={setPipelineId}><SelectTrigger className="mb-4 w-full" aria-label="Proceso comercial"><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{data.pipelines.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectGroup></SelectContent></Select>}
            {error ? (
              <div className="dashboard-empty-compact">El pipeline no está disponible en este momento.</div>
            ) : !data ? (
              <div className="dashboard-loading-block">Cargando pipeline…</div>
            ) : stageSummaries.length === 0 ? (
              <div className="dashboard-empty-compact">Todavía no hay etapas configuradas.</div>
            ) : (
              <div className="pipeline-summary-list">
                {stageSummaries.map((stage) => (
                  <div className="pipeline-summary-row" key={stage.id}>
                    <div className="pipeline-summary-meta">
                      <span><i style={{ backgroundColor: stage.color }} />{stage.name}</span>
                      <strong>{stage.count}</strong>
                    </div>
                    <div className="pipeline-summary-track">
                      <span style={{ width: stage.width, backgroundColor: stage.color }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
          <CardFooter>
            <Button variant="ghost" size="sm" asChild>
              <Link href={selectedPipeline ? `/app/pipeline?pipelineId=${selectedPipeline.id}` : '/app/pipeline'}>
                Abrir pipeline
                <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} data-icon="inline-end" />
              </Link>
            </Button>
          </CardFooter>
        </Card>

      </div>

      <Card className="dashboard-contacts-card">
        <CardHeader>
          <CardTitle>Contactos recientes</CardTitle>
          <CardDescription>Las últimas personas incorporadas a tu espacio.</CardDescription>
          <CardAction>
            <Button variant="outline" size="sm" asChild>
              <Link href="/app/contacts">Gestionar contactos</Link>
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          {error ? (
            <div className="dashboard-empty-compact">Los contactos no están disponibles en este momento.</div>
          ) : !data ? (
            <div className="dashboard-loading-block">Cargando contactos…</div>
          ) : data.contacts.length === 0 ? (
            <div className="dashboard-empty-compact">Agregá tu primer contacto para empezar a construir tu base.</div>
          ) : (
            <div className="dashboard-contact-grid">
              {data.contacts.slice(0, 4).map((contact) => (
                <Link href={`/app/contacts/${contact.id}`} className="dashboard-contact" key={contact.id}>
                  <span className="dashboard-contact-avatar">{contact.name.charAt(0).toUpperCase()}</span>
                  <span>
                    <strong>{contact.name}</strong>
                    <small>{contact.companyName ?? 'Sin empresa'}</small>
                  </span>
                  <Badge variant="outline">{STATUS_LABELS[contact.status]}</Badge>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

    </div>
  )
}

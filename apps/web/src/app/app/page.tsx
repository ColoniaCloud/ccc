'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Add01Icon,
  ArrowRight01Icon,
  Calendar01Icon,
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
}

type Task = {
  id: string
  title: string
  dueDate: string | null
  done: boolean
}

type Stage = { id: string; name: string; color: string; position: number }
type DashboardData = {
  contacts: Contact[]
  contactTotal: number
  deals: Deal[]
  tasks: Task[]
  stages: Stage[]
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

function formatDueDate(date: string | null) {
  if (!date) return 'Sin fecha'
  return new Intl.DateTimeFormat('es-UY', { day: 'numeric', month: 'short' }).format(new Date(date))
}

function isOverdue(date: string | null) {
  return Boolean(date && new Date(date).getTime() < Date.now())
}

export default function AppHomePage() {
  const { me, apiFetch } = useApp()
  const [data, setData] = useState<DashboardData | null>(null)
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
          pipelinesRes.json() as Promise<{ items: { stages: Stage[] }[] }>,
        ])

        if (!cancelled) {
          setData({
            contacts: contactsData.items,
            contactTotal: contactsData.total ?? contactsData.items.length,
            deals: dealsData.items,
            tasks: tasksData.items,
            stages: pipelinesData.items[0]?.stages ?? [],
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
    const usdPipeline = (data?.deals ?? [])
      .filter((deal) => deal.currency === 'USD')
      .reduce((total, deal) => total + (Number(deal.value) || 0), 0)

    return {
      pendingTasks,
      usdPipeline,
      completionRate: tasks.length ? Math.round((completedTasks / tasks.length) * 100) : 0,
    }
  }, [data])

  const stageSummaries = useMemo(() => {
    if (!data) return []
    const maximum = Math.max(1, ...data.stages.map((stage) => data.deals.filter((deal) => deal.stageId === stage.id).length))
    return data.stages.map((stage) => {
      const stageDeals = data.deals.filter((deal) => deal.stageId === stage.id)
      return {
        ...stage,
        count: stageDeals.length,
        width: `${Math.max(stageDeals.length ? 12 : 2, (stageDeals.length / maximum) * 100)}%`,
      }
    })
  }, [data])

  const upcomingTasks = metrics.pendingTasks.slice(0, 5)
  const firstName = me.user.name.split(' ')[0]

  return (
    <div className="page dashboard-page">
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
            <strong className="metric-value">{data ? data.deals.length : '—'}</strong>
            <span className="metric-support">en el pipeline activo</span>
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
            <span className="metric-support">sin mezclar monedas</span>
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

      <div className="dashboard-main-grid">
        <Card className="dashboard-pipeline-card">
          <CardHeader>
            <CardTitle>Estado del pipeline</CardTitle>
            <CardDescription>Distribución de oportunidades por etapa.</CardDescription>
            <CardAction>
              <Badge variant="secondary">{data?.deals.length ?? 0} negocios</Badge>
            </CardAction>
          </CardHeader>
          <CardContent>
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
              <Link href="/app/pipeline">
                Abrir pipeline
                <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} data-icon="inline-end" />
              </Link>
            </Button>
          </CardFooter>
        </Card>

        <Card className="dashboard-tasks-card">
          <CardHeader>
            <CardTitle>Próximas tareas</CardTitle>
            <CardDescription>Tu foco para los siguientes días.</CardDescription>
          </CardHeader>
          <CardContent>
            {error ? (
              <div className="dashboard-empty-compact">Las tareas no están disponibles en este momento.</div>
            ) : !data ? (
              <div className="dashboard-loading-block">Cargando tareas…</div>
            ) : upcomingTasks.length === 0 ? (
              <div className="dashboard-empty-compact">No tenés tareas pendientes.</div>
            ) : (
              <div className="dashboard-task-list">
                {upcomingTasks.map((task) => (
                  <div className="dashboard-task" key={task.id}>
                    <span className="dashboard-task-check" aria-hidden="true" />
                    <div>
                      <strong>{task.title}</strong>
                      <span className={isOverdue(task.dueDate) ? 'is-overdue' : undefined}>
                        <HugeiconsIcon icon={Calendar01Icon} strokeWidth={1.8} />
                        {isOverdue(task.dueDate) ? 'Venció ' : ''}{formatDueDate(task.dueDate)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
          <CardFooter>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/app/tasks">
                Ver todas las tareas
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

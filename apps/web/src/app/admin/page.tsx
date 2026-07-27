'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from '@/lib/auth'
import type { Plan, TenantStatus } from '@crm/shared'
import './admin.css'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'
const PLANS: Plan[] = ['free', 'pro', 'business', 'master', 'enterprise']

type TenantRow = {
  id: string
  name: string
  slug: string
  plan: Plan
  status: TenantStatus
  suspendedAt: string | null
  planRenewsAt: string | null
  createdAt: string
  memberCount: number
  modules: string[]
  billing: { provider: string; status: string } | null
}

export default function AdminPage() {
  const router = useRouter()
  const { data: session, isPending: sessionLoading } = useSession()

  const [tenants, setTenants] = useState<TenantRow[] | null>(null)
  const [forbidden, setForbidden] = useState(false)
  const [error, setError]         = useState<string | null>(null)
  const [pending, setPending]     = useState<string | null>(null)

  const load = useCallback(async () => {
    const res = await fetch(`${API_URL}/api/admin/tenants`, { credentials: 'include' })

    if (res.status === 403) {
      setForbidden(true)
      return
    }
    if (!res.ok) {
      throw new Error('No se pudieron cargar los tenants')
    }

    const data = await res.json() as { items: TenantRow[] }
    setTenants(data.items)
  }, [])

  useEffect(() => {
    if (sessionLoading) return
    if (!session) {
      router.replace('/auth/sign-in')
      return
    }
    load().catch(() => setError('No se pudieron cargar los tenants'))
  }, [session, sessionLoading, router, load])

  async function runAction(tenantId: string, path: string, init?: RequestInit) {
    setError(null)
    setPending(tenantId)
    try {
      const res = await fetch(`${API_URL}/api/admin/tenants/${tenantId}${path}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        ...init,
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null) as { error?: string } | null
        throw new Error(body?.error ?? 'La acción no se pudo completar')
      }
      await load()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'La acción no se pudo completar')
    } finally {
      setPending(null)
    }
  }

  if (sessionLoading || (!forbidden && !tenants && !error)) {
    return <p className="admin-loading">Cargando…</p>
  }

  if (forbidden) {
    return (
      <div className="admin-shell">
        <p className="empty-state">No tenés acceso a esta sección.</p>
      </div>
    )
  }

  return (
    <div className="admin-shell">
      <h1 className="admin-title">Tenants</h1>
      <p className="admin-subtitle">Vista global de todas las organizaciones — soporte y facturación.</p>

      {error && <div className="form-error">{error}</div>}

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Organización</th>
              <th>Plan</th>
              <th>Estado</th>
              <th>Módulos</th>
              <th>Miembros</th>
              <th>Billing</th>
              <th>Alta</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {tenants && tenants.length === 0 && (
              <tr><td colSpan={8}><p className="empty-state">Todavía no hay organizaciones registradas.</p></td></tr>
            )}
            {tenants?.map((tenant) => (
              <tr key={tenant.id}>
                <td>
                  <div className="admin-tenant-name">{tenant.name}</div>
                  <div className="admin-tenant-slug">{tenant.slug}</div>
                </td>
                <td>
                  <select
                    className="admin-plan-select"
                    value={tenant.plan}
                    disabled={pending === tenant.id}
                    onChange={(e) => runAction(tenant.id, '/plan', { body: JSON.stringify({ plan: e.target.value }) })}
                  >
                    {PLANS.map((plan) => <option key={plan} value={plan}>{plan}</option>)}
                  </select>
                </td>
                <td>
                  <span className={`pill admin-status-${tenant.status}`}>
                    {tenant.status === 'active' ? 'Activo' : 'Suspendido'}
                  </span>
                </td>
                <td>
                  {tenant.modules.length === 0
                    ? <span className="admin-tenant-slug">—</span>
                    : tenant.modules.join(', ')}
                </td>
                <td>{tenant.memberCount}</td>
                <td>
                  {tenant.billing
                    ? `${tenant.billing.provider} · ${tenant.billing.status}`
                    : <span className="admin-tenant-slug">sin suscripción</span>}
                </td>
                <td>{new Date(tenant.createdAt).toLocaleDateString('es-UY')}</td>
                <td>
                  {tenant.status === 'active' ? (
                    <button
                      type="button"
                      className="link-danger"
                      disabled={pending === tenant.id}
                      onClick={() => runAction(tenant.id, '/suspend')}
                    >
                      Suspender
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="btn-ghost"
                      disabled={pending === tenant.id}
                      onClick={() => runAction(tenant.id, '/reactivate')}
                    >
                      Reactivar
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

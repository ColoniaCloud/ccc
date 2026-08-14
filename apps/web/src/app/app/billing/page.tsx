'use client'

import { useEffect, useState } from 'react'
import { useApp } from '../app-context'

type PlanItem = { key: string; label: string; priceUsd: number | null; payable: boolean }

type Status = {
  plan: string
  planRenewsAt: string | null
  subscription: {
    provider: 'mercadopago' | 'nowpayments'
    plan: string
    status: string
    externalId: string
  } | null
}

export default function BillingPage() {
  const { apiFetch, me } = useApp()

  const [plans, setPlans]     = useState<PlanItem[] | null>(null)
  const [status, setStatus]   = useState<Status | null>(null)
  const [error, setError]     = useState<string | null>(null)
  const [notice, setNotice]   = useState<string | null>(null)
  const [pending, setPending] = useState<string | null>(null)

  async function loadStatus() {
    const res  = await apiFetch('/api/billing/status')
    const data = await res.json() as Status
    setStatus(data)
  }

  useEffect(() => {
    async function load() {
      try {
        const plansRes  = await apiFetch('/api/billing/plans')
        const plansData = await plansRes.json() as { items: PlanItem[] }
        setPlans(plansData.items)
        await loadStatus()
      } catch {
        setError('No se pudo cargar la información de facturación')
      }
    }
    load()
  }, [apiFetch])

  async function handleCheckout(plan: string, provider: 'mercadopago' | 'nowpayments') {
    setError(null)
    setNotice(null)
    setPending(`${plan}:${provider}`)

    try {
      const res = await apiFetch('/api/billing/checkout', {
        method: 'POST',
        body: JSON.stringify({ plan, provider }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => null) as { error?: string } | null
        throw new Error(body?.error ?? 'No se pudo iniciar el pago')
      }

      const data = await res.json() as { checkoutUrl?: string; emailSent?: boolean; email?: string }

      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl
        return
      }

      if (data.emailSent) {
        setNotice(`Te enviamos un email a ${data.email} con el link para completar el pago en cripto. Antes de cada vencimiento te va a llegar uno nuevo automáticamente.`)
        return
      }

      throw new Error('El proveedor no devolvió un link de pago')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'No se pudo iniciar el pago')
    } finally {
      setPending(null)
    }
  }

  async function handleCancel() {
    setError(null)
    setNotice(null)
    setPending('cancel')

    try {
      const res = await apiFetch('/api/billing/cancel', { method: 'POST' })

      if (!res.ok) {
        const body = await res.json().catch(() => null) as { error?: string } | null
        throw new Error(body?.error ?? 'No se pudo cancelar la suscripción')
      }

      setNotice('Tu suscripción fue cancelada. Volviste al plan Free.')
      await loadStatus()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'No se pudo cancelar la suscripción')
    } finally {
      setPending(null)
    }
  }

  const isAdmin               = me.member.role === 'admin'
  const currentPlan           = status?.plan ?? me.tenant.plan
  const hasActiveSubscription = status?.subscription?.status === 'active'

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Facturación</h1>
          <p>
            Plan actual: <strong style={{ color: 'var(--color-text)' }}>{currentPlan}</strong>
            {status?.planRenewsAt && ` — se renueva el ${new Date(status.planRenewsAt).toLocaleDateString('es-UY')}`}
          </p>
        </div>
        {hasActiveSubscription && isAdmin && (
          <button className="btn-ghost" onClick={handleCancel} disabled={pending === 'cancel'}>
            {pending === 'cancel' ? 'Cancelando…' : 'Cancelar suscripción'}
          </button>
        )}
      </div>

      {!isAdmin && (
        <div className="panel">
          <p className="empty-state">Solo un admin de la organización puede gestionar la facturación.</p>
        </div>
      )}

      {error && <div className="form-error">{error}</div>}
      {notice && <div className="notice">{notice}</div>}

      {!plans ? (
        <p className="empty-state">Cargando planes…</p>
      ) : (
        <div className="plan-grid">
          {plans.map((item) => (
            <div key={item.key} className={`plan-card${currentPlan === item.key ? ' current' : ''}`}>
              {currentPlan === item.key && <span className="plan-badge">Plan actual</span>}
              <div className="plan-name">{item.label}</div>
              <div className="plan-price">
                {item.priceUsd === null ? 'Custom' : item.priceUsd === 0 ? 'Gratis' : (
                  <>USD {item.priceUsd}<small> /mes</small></>
                )}
              </div>

              {item.payable && isAdmin && (
                <div className="plan-actions">
                  <button
                    className="btn"
                    disabled={pending !== null}
                    onClick={() => handleCheckout(item.key, 'mercadopago')}
                  >
                    {pending === `${item.key}:mercadopago` ? 'Redirigiendo…' : 'Pagar con MercadoPago'}
                  </button>
                  <button
                    className="btn-ghost"
                    disabled={pending !== null}
                    onClick={() => handleCheckout(item.key, 'nowpayments')}
                  >
                    {pending === `${item.key}:nowpayments` ? 'Procesando…' : 'Pagar con cripto'}
                  </button>
                </div>
              )}

              {item.key === 'enterprise' && (
                <div className="plan-actions">
                  <a className="btn-ghost" href="mailto:hola@plata.studio">Contactanos</a>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { eq, and, desc } from 'drizzle-orm'
// `db` (owner, sin RLS) es a propósito acá: los webhooks de abajo escriben
// billing_subscriptions/billing_events antes de que exista un tenant de
// sesión — no pasan por tenantMiddleware. Las rutas autenticadas usan
// `c.get('db')` (ver más abajo), acotado al tenant vía RLS.
import { db } from '../db'
import { tenants, members, billingSubscriptions, billingEvents } from '../db/schema'
import { authMiddleware } from '../middleware/auth'
import { tenantMiddleware } from '../middleware/tenant'
import type { HonoVariables } from '../types'
import { PLAN_CATALOG, isPayablePlan, type PayablePlan } from '../billing/plans'
import {
  createMercadoPagoSubscription,
  cancelMercadoPagoSubscription,
  getMercadoPagoSubscription,
  getMercadoPagoInvoice,
  verifyMercadoPagoSignature,
  parseExternalReference,
  InvalidWebhookSignatureError,
} from '../billing/mercadopago'
import {
  ensureNowPaymentsPlan,
  createNowPaymentsSubscription,
  cancelNowPaymentsSubscription,
  verifyNowPaymentsSignature,
} from '../billing/nowpayments'

const WEB_URL        = process.env.WEB_URL ?? 'http://localhost:3000'
const API_PUBLIC_URL = process.env.API_PUBLIC_URL ?? 'http://localhost:3001'

const billingRoutes = new Hono<{ Variables: HonoVariables }>()

// ─── Catálogo público ──────────────────────────────────────────────
billingRoutes.get('/plans', (c) => {
  return c.json({
    status: 'ok',
    items: [
      { key: 'free', label: 'Free', priceUsd: 0, payable: false },
      ...Object.entries(PLAN_CATALOG).map(([key, value]) => ({
        key, label: value.label, priceUsd: value.priceUsd, payable: true,
      })),
      { key: 'enterprise', label: 'Enterprise', priceUsd: null, payable: false },
    ],
  })
})

// ─── Estado de la suscripción del tenant actual ───────────────────
billingRoutes.get('/status', authMiddleware, tenantMiddleware, async (c) => {
  const db = c.get('db')
  const tenantId = c.get('tenantId')

  const tenant = await db.query.tenants.findFirst({ where: eq(tenants.id, tenantId) })
  if (!tenant) {
    throw new HTTPException(404, { message: 'Tenant no encontrado' })
  }

  const subscription = await db.query.billingSubscriptions.findFirst({
    where:   eq(billingSubscriptions.tenantId, tenantId),
    orderBy: desc(billingSubscriptions.createdAt),
  })

  return c.json({
    status: 'ok',
    plan:         tenant.plan,
    planRenewsAt: tenant.planRenewsAt,
    subscription: subscription ? {
      provider:   subscription.provider,
      plan:       subscription.plan,
      status:     subscription.status,
      externalId: subscription.externalId,
    } : null,
  })
})

// ─── Iniciar un checkout (MercadoPago o cripto) ───────────────────
billingRoutes.post('/checkout', authMiddleware, tenantMiddleware, async (c) => {
  const db = c.get('db')
  const tenantId = c.get('tenantId')
  const memberId = c.get('memberId')
  const user     = c.get('user')

  const member = await db.query.members.findFirst({ where: eq(members.id, memberId) })
  if (!member || member.role !== 'admin') {
    throw new HTTPException(403, { message: 'Solo un admin puede gestionar la suscripción' })
  }

  const body = await c.req.json().catch(() => null) as { plan?: string; provider?: string } | null
  const plan     = body?.plan ?? ''
  const provider = body?.provider ?? ''

  if (!isPayablePlan(plan)) {
    throw new HTTPException(400, { message: 'Plan inválido' })
  }
  if (provider !== 'mercadopago' && provider !== 'nowpayments') {
    throw new HTTPException(400, { message: 'Proveedor de pago inválido' })
  }

  const tenant = await db.query.tenants.findFirst({ where: eq(tenants.id, tenantId) })
  if (!tenant) {
    throw new HTTPException(404, { message: 'Tenant no encontrado' })
  }

  const catalog = PLAN_CATALOG[plan as PayablePlan]

  try {
    if (provider === 'mercadopago') {
      const subscription = await createMercadoPagoSubscription({
        tenantId,
        plan,
        priceUsd:  catalog.priceUsd,
        payerEmail: user.email,
        backUrl:    `${WEB_URL}/app/billing`,
      })

      await db.insert(billingSubscriptions).values({
        tenantId,
        provider:   'mercadopago',
        plan,
        externalId: subscription.id,
        status:     'pending',
      })

      return c.json({ status: 'ok', provider, checkoutUrl: subscription.initPoint })
    }

    const ipnCallbackUrl  = `${API_PUBLIC_URL}/api/billing/webhooks/nowpayments`
    const externalPlanId  = await ensureNowPaymentsPlan(plan as PayablePlan, ipnCallbackUrl)
    const subscription    = await createNowPaymentsSubscription({
      subscriptionPlanId: externalPlanId,
      email: user.email,
    })

    await db.insert(billingSubscriptions).values({
      tenantId,
      provider:   'nowpayments',
      plan,
      externalId: subscription.id,
      status:     'pending',
    })

    // NOWPayments no devuelve un link de checkout: le manda un email al
    // suscriptor con el link de pago (y uno nuevo antes de cada vencimiento).
    return c.json({ status: 'ok', provider, emailSent: true, email: user.email })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'No se pudo iniciar el checkout'
    throw new HTTPException(502, { message })
  }
})

// ─── Cancelar la suscripción activa ───────────────────────────────
billingRoutes.post('/cancel', authMiddleware, tenantMiddleware, async (c) => {
  const db = c.get('db')
  const tenantId = c.get('tenantId')
  const memberId = c.get('memberId')

  const member = await db.query.members.findFirst({ where: eq(members.id, memberId) })
  if (!member || member.role !== 'admin') {
    throw new HTTPException(403, { message: 'Solo un admin puede gestionar la suscripción' })
  }

  const subscription = await db.query.billingSubscriptions.findFirst({
    where: and(
      eq(billingSubscriptions.tenantId, tenantId),
      eq(billingSubscriptions.status, 'active'),
    ),
    orderBy: desc(billingSubscriptions.createdAt),
  })

  if (!subscription) {
    throw new HTTPException(404, { message: 'No hay una suscripción activa' })
  }

  try {
    if (subscription.provider === 'mercadopago') {
      await cancelMercadoPagoSubscription(subscription.externalId)
    } else {
      await cancelNowPaymentsSubscription(subscription.externalId)
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'No se pudo cancelar la suscripción'
    throw new HTTPException(502, { message })
  }

  await db.update(billingSubscriptions)
    .set({ status: 'cancelled', updatedAt: new Date() })
    .where(eq(billingSubscriptions.id, subscription.id))

  await db.update(tenants)
    .set({ plan: 'free', planRenewsAt: null, updatedAt: new Date() })
    .where(eq(tenants.id, tenantId))

  return c.json({ status: 'ok' })
})

// ─── Webhook: MercadoPago ──────────────────────────────────────────
billingRoutes.post('/webhooks/mercadopago', async (c) => {
  const dataId = c.req.query('data.id') ?? undefined
  const type   = c.req.query('type') ?? undefined

  try {
    verifyMercadoPagoSignature({
      xSignature: c.req.header('x-signature'),
      xRequestId: c.req.header('x-request-id'),
      dataId,
    })
  } catch (err) {
    if (err instanceof InvalidWebhookSignatureError) {
      throw new HTTPException(401, { message: `Firma inválida: ${err.reason}` })
    }
    throw err
  }

  if (!dataId || !type) {
    return c.json({ status: 'ok' })
  }

  try {
    if (type === 'subscription_preapproval') {
      const preapproval = await getMercadoPagoSubscription(dataId)
      const parsed = parseExternalReference(preapproval.external_reference)

      await db.insert(billingEvents).values({
        tenantId:   parsed?.tenantId,
        provider:   'mercadopago',
        eventType:  'subscription_preapproval',
        externalId: dataId,
        rawPayload: preapproval,
      }).onConflictDoNothing()

      if (parsed) {
        const nextStatus = mapPreapprovalStatus(preapproval.status)

        await db.update(billingSubscriptions)
          .set({ status: nextStatus, updatedAt: new Date() })
          .where(and(
            eq(billingSubscriptions.provider, 'mercadopago'),
            eq(billingSubscriptions.externalId, dataId),
          ))

        if (nextStatus === 'active') {
          await db.update(tenants)
            .set({
              plan:         parsed.plan as typeof tenants.$inferSelect['plan'],
              planRenewsAt: preapproval.next_payment_date ? new Date(preapproval.next_payment_date) : null,
              updatedAt:    new Date(),
            })
            .where(eq(tenants.id, parsed.tenantId))
        } else if (nextStatus === 'cancelled') {
          await db.update(tenants)
            .set({ plan: 'free', planRenewsAt: null, updatedAt: new Date() })
            .where(eq(tenants.id, parsed.tenantId))
        }
      }
    } else if (type === 'subscription_authorized_payment') {
      const invoice = await getMercadoPagoInvoice(dataId)
      const parsed  = parseExternalReference(invoice.external_reference)

      await db.insert(billingEvents).values({
        tenantId:   parsed?.tenantId,
        provider:   'mercadopago',
        eventType:  'subscription_authorized_payment',
        externalId: dataId,
        rawPayload: invoice,
      }).onConflictDoNothing()

      if (parsed && invoice.payment?.status === 'approved' && invoice.preapproval_id) {
        const preapproval = await getMercadoPagoSubscription(invoice.preapproval_id)

        await db.update(tenants)
          .set({
            plan:         parsed.plan as typeof tenants.$inferSelect['plan'],
            planRenewsAt: preapproval.next_payment_date ? new Date(preapproval.next_payment_date) : null,
            updatedAt:    new Date(),
          })
          .where(eq(tenants.id, parsed.tenantId))
      }
    }
  } catch (err) {
    console.error('Error procesando webhook de MercadoPago:', err)
    throw new HTTPException(500, { message: 'Error procesando la notificación' })
  }

  return c.json({ status: 'ok' })
})

function mapPreapprovalStatus(status: string | undefined): 'active' | 'paused' | 'cancelled' | 'pending' {
  if (status === 'authorized') return 'active'
  if (status === 'paused')     return 'paused'
  if (status === 'cancelled')  return 'cancelled'
  return 'pending'
}

// ─── Webhook: NOWPayments (cripto, suscripción recurrente) ────────
billingRoutes.post('/webhooks/nowpayments', async (c) => {
  const body = await c.req.json().catch(() => null) as {
    payment_status?: string
    subscription_id?: number | string
    payment_id?: number | string
    order_id?: string
  } | null

  if (!body) {
    throw new HTTPException(400, { message: 'Body inválido' })
  }

  const signature = c.req.header('x-nowpayments-sig')
  let valid = false
  try {
    valid = verifyNowPaymentsSignature(body, signature)
  } catch (err) {
    console.error('No se pudo validar la firma de NOWPayments:', err)
    throw new HTTPException(503, { message: 'Validación de firma no disponible' })
  }

  if (!valid) {
    throw new HTTPException(401, { message: 'Firma inválida' })
  }

  const subscriptionExternalId = body.subscription_id !== undefined ? String(body.subscription_id) : undefined
  const eventExternalId = String(body.payment_id ?? body.order_id ?? subscriptionExternalId ?? 'unknown')

  const subscription = subscriptionExternalId
    ? await db.query.billingSubscriptions.findFirst({
        where: and(
          eq(billingSubscriptions.provider, 'nowpayments'),
          eq(billingSubscriptions.externalId, subscriptionExternalId),
        ),
      })
    : undefined

  await db.insert(billingEvents).values({
    tenantId:   subscription?.tenantId,
    provider:   'nowpayments',
    eventType:  body.payment_status ?? 'unknown',
    externalId: eventExternalId,
    rawPayload: body,
  }).onConflictDoNothing()

  if (!subscription) {
    return c.json({ status: 'ok' })
  }

  if (body.payment_status === 'finished' || body.payment_status === 'confirmed') {
    const periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)

    await db.update(billingSubscriptions)
      .set({ status: 'active', currentPeriodEnd: periodEnd, updatedAt: new Date() })
      .where(eq(billingSubscriptions.id, subscription.id))

    await db.update(tenants)
      .set({
        plan:         subscription.plan as typeof tenants.$inferSelect['plan'],
        planRenewsAt: periodEnd,
        updatedAt:    new Date(),
      })
      .where(eq(tenants.id, subscription.tenantId))
  } else if (body.payment_status === 'expired' || body.payment_status === 'failed') {
    await db.update(billingSubscriptions)
      .set({ status: 'cancelled', updatedAt: new Date() })
      .where(eq(billingSubscriptions.id, subscription.id))
  }

  return c.json({ status: 'ok' })
})

export { billingRoutes }

import crypto from 'node:crypto'
import { eq, and } from 'drizzle-orm'
import { db } from '../db'
import { billingProviderPlans } from '../db/schema'
import { PLAN_CATALOG, type PayablePlan } from './plans'

const API_BASE = 'https://api.nowpayments.io/v1'

if (!process.env.NOWPAYMENTS_API_KEY) {
  throw new Error('NOWPAYMENTS_API_KEY no está definida. Verificá apps/api/.env')
}
if (!process.env.NOWPAYMENTS_EMAIL || !process.env.NOWPAYMENTS_PASSWORD) {
  throw new Error('NOWPAYMENTS_EMAIL / NOWPAYMENTS_PASSWORD no están definidas. Verificá apps/api/.env')
}

const API_KEY  = process.env.NOWPAYMENTS_API_KEY
const EMAIL    = process.env.NOWPAYMENTS_EMAIL
const PASSWORD = process.env.NOWPAYMENTS_PASSWORD

// ─── Auth JWT (requerido solo por /subscriptions) ─────────────────
// El token dura 5 minutos. Lo cacheamos en memoria y lo renovamos con
// margen antes de que expire.
let cachedToken: { value: string; expiresAt: number } | null = null

async function getAuthToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) {
    return cachedToken.value
  }

  const res = await fetch(`${API_BASE}/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  })

  const body = await parseNowResponse<{ token: string }>(res)
  cachedToken = { value: body.token, expiresAt: Date.now() + 4 * 60 * 1000 }
  return body.token
}

/** Las Suscripciones exigen Bearer JWT *y* x-api-key a la vez. */
async function nowRequestAuthed<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await getAuthToken()

  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Authorization': `Bearer ${token}`,
      'x-api-key':     API_KEY,
      'Content-Type':  'application/json',
      ...init.headers,
    },
  })

  return parseNowResponse<T>(res)
}

async function parseNowResponse<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => null) as unknown

  if (!res.ok) {
    const message = body && typeof body === 'object' && 'message' in body
      ? String((body as { message: unknown }).message)
      : `NOWPayments respondió ${res.status}`
    throw new Error(message)
  }

  // Los endpoints autenticados con JWT envuelven la respuesta en { result }.
  if (body && typeof body === 'object' && 'result' in body) {
    return (body as { result: T }).result
  }

  return body as T
}

// ─── Planes recurrentes ────────────────────────────────────────────
type NowPlanResponse = { id: string; title: string }

export async function ensureNowPaymentsPlan(plan: PayablePlan, ipnCallbackUrl: string): Promise<string> {
  const cached = await db.query.billingProviderPlans.findFirst({
    where: and(
      eq(billingProviderPlans.provider, 'nowpayments'),
      eq(billingProviderPlans.plan, plan),
    ),
  })
  if (cached) return cached.externalPlanId

  const catalog = PLAN_CATALOG[plan]

  const created = await nowRequestAuthed<NowPlanResponse>('/subscriptions/plans', {
    method: 'POST',
    body: JSON.stringify({
      title:            `ColoniaCloud CRM — ${catalog.label}`,
      interval_day:     30,
      amount:           catalog.priceUsd,
      currency:         'usd',
      ipn_callback_url: ipnCallbackUrl,
    }),
  })

  await db.insert(billingProviderPlans).values({
    provider:       'nowpayments',
    plan,
    externalPlanId: created.id,
  }).onConflictDoNothing()

  return created.id
}

// ─── Suscripción de un cliente a un plan ──────────────────────────
// NOWPayments no devuelve un link para redirigir al navegador: le manda
// un email al suscriptor con el link de pago (y uno nuevo antes de cada
// vencimiento). Por eso, a diferencia de MercadoPago, este checkout no
// termina en un redirect sino en un aviso de "revisá tu email".
type NowSubscriptionResponse = { id: string; status: string }

export async function createNowPaymentsSubscription(params: {
  subscriptionPlanId: string
  email: string
}): Promise<NowSubscriptionResponse> {
  const results = await nowRequestAuthed<NowSubscriptionResponse[]>('/subscriptions', {
    method: 'POST',
    body: JSON.stringify({
      subscription_plan_id: Number(params.subscriptionPlanId),
      email:                params.email,
    }),
  })

  const [subscription] = results
  if (!subscription) {
    throw new Error('NOWPayments no devolvió la suscripción creada')
  }

  return subscription
}

export async function cancelNowPaymentsSubscription(id: string): Promise<void> {
  await nowRequestAuthed(`/subscriptions/${id}`, { method: 'DELETE' })
}

/**
 * NOWPayments firma el body ordenando sus claves alfabéticamente (recursivo)
 * y calculando HMAC-SHA512 con la IPN Secret Key configurada en el dashboard.
 */
export function verifyNowPaymentsSignature(rawBody: unknown, signature: string | undefined | null): boolean {
  if (!process.env.NOWPAYMENTS_IPN_SECRET) {
    throw new Error('NOWPAYMENTS_IPN_SECRET no está definida. Verificá apps/api/.env')
  }
  if (!signature) return false

  const sorted = sortObjectKeys(rawBody)
  const hmac = crypto.createHmac('sha512', process.env.NOWPAYMENTS_IPN_SECRET)
  hmac.update(JSON.stringify(sorted))
  const computed = hmac.digest('hex')

  const a = Buffer.from(computed)
  const b = Buffer.from(signature)
  if (a.length !== b.length) return false

  return crypto.timingSafeEqual(a, b)
}

function sortObjectKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortObjectKeys)
  }
  if (value !== null && typeof value === 'object') {
    const entries = Object.keys(value as Record<string, unknown>)
      .sort()
      .map((key) => [key, sortObjectKeys((value as Record<string, unknown>)[key])] as const)
    return Object.fromEntries(entries)
  }
  return value
}

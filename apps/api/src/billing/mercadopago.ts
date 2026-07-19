import {
  MercadoPagoConfig,
  PreApproval,
  Invoice,
  WebhookSignatureValidator,
  InvalidWebhookSignatureError,
} from 'mercadopago'

if (!process.env.MERCADOPAGO_ACCESS_TOKEN) {
  throw new Error('MERCADOPAGO_ACCESS_TOKEN no está definida. Verificá apps/api/.env')
}

const config = new MercadoPagoConfig({ accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN })

const preApprovalClient = new PreApproval(config)
const invoiceClient     = new Invoice(config)

// Las cuentas de MercadoPago solo aceptan la moneda local del país de la
// cuenta para suscripciones (preapproval) — una cuenta de Uruguay (MLU) no
// puede cobrar en USD, por ejemplo. Los precios del catálogo están en USD,
// así que los convertimos a la moneda de la cuenta con una tasa fija.
const CURRENCY     = process.env.MERCADOPAGO_CURRENCY ?? 'UYU'
const USD_TO_LOCAL = Number(process.env.MERCADOPAGO_USD_TO_UYU_RATE ?? '40')

export async function createMercadoPagoSubscription(params: {
  tenantId: string
  plan: string
  priceUsd: number
  payerEmail: string
  backUrl: string
}): Promise<{ id: string; initPoint: string }> {
  const transactionAmount = CURRENCY === 'USD'
    ? params.priceUsd
    : Math.round(params.priceUsd * USD_TO_LOCAL * 100) / 100

  const response = await preApprovalClient.create({
    body: {
      reason:             `Plata — plan ${params.plan}`,
      external_reference: `${params.tenantId}:${params.plan}`,
      payer_email:        params.payerEmail,
      back_url:           params.backUrl,
      status:             'pending',
      auto_recurring: {
        frequency:          1,
        frequency_type:     'months',
        transaction_amount: transactionAmount,
        currency_id:        CURRENCY,
      },
    },
  })

  if (!response.id || !response.init_point) {
    throw new Error('MercadoPago no devolvió un id/init_point de suscripción')
  }

  return { id: response.id, initPoint: response.init_point }
}

export async function getMercadoPagoSubscription(id: string) {
  return preApprovalClient.get({ id })
}

export async function cancelMercadoPagoSubscription(id: string) {
  return preApprovalClient.update({ id, body: { status: 'cancelled' } })
}

export async function getMercadoPagoInvoice(id: string) {
  return invoiceClient.get({ id })
}

export function verifyMercadoPagoSignature(params: {
  xSignature: string | undefined | null
  xRequestId: string | undefined | null
  dataId:     string | undefined | null
}): void {
  if (!process.env.MERCADOPAGO_WEBHOOK_SECRET) {
    throw new Error('MERCADOPAGO_WEBHOOK_SECRET no está definida. Verificá apps/api/.env')
  }

  WebhookSignatureValidator.validate({
    xSignature: params.xSignature,
    xRequestId: params.xRequestId,
    dataId:     params.dataId,
    secret:     process.env.MERCADOPAGO_WEBHOOK_SECRET,
  })
}

export { InvalidWebhookSignatureError }

/** Parsea "tenantId:plan" desde external_reference. */
export function parseExternalReference(externalReference: string | undefined): { tenantId: string; plan: string } | null {
  if (!externalReference) return null
  const [tenantId, plan] = externalReference.split(':')
  if (!tenantId || !plan) return null
  return { tenantId, plan }
}

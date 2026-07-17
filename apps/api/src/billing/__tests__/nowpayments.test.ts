import { describe, it, expect } from 'vitest'
import crypto from 'node:crypto'
import { verifyNowPaymentsSignature } from '../nowpayments'

const IPN_SECRET = process.env.NOWPAYMENTS_IPN_SECRET as string

// Replica independiente del algoritmo documentado por NOWPayments (ordenar
// las claves recursivamente y firmar el JSON resultante con HMAC-SHA512),
// para no depender de la función interna sortObjectKeys al armar el fixture.
function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys)
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>).sort()
        .map((key) => [key, sortKeys((value as Record<string, unknown>)[key])]),
    )
  }
  return value
}

function sign(body: unknown): string {
  return crypto.createHmac('sha512', IPN_SECRET)
    .update(JSON.stringify(sortKeys(body)))
    .digest('hex')
}

describe('verifyNowPaymentsSignature', () => {
  it('acepta una firma calculada correctamente', () => {
    const body = { payment_status: 'finished', subscription_id: '12345', payment_id: 999 }
    expect(verifyNowPaymentsSignature(body, sign(body))).toBe(true)
  })

  it('acepta la firma sin importar el orden de las claves en el body', () => {
    const bodyA = { b: 2, a: 1, c: { y: 2, x: 1 } }
    const bodyB = { c: { x: 1, y: 2 }, a: 1, b: 2 }
    const signature = sign(bodyA)
    expect(verifyNowPaymentsSignature(bodyB, signature)).toBe(true)
  })

  it('rechaza una firma que no corresponde al body', () => {
    const body = { payment_status: 'finished', subscription_id: '12345' }
    expect(verifyNowPaymentsSignature(body, sign({ payment_status: 'failed' }))).toBe(false)
  })

  it('rechaza si falta la firma', () => {
    expect(verifyNowPaymentsSignature({ a: 1 }, undefined)).toBe(false)
    expect(verifyNowPaymentsSignature({ a: 1 }, null)).toBe(false)
  })

  it('rechaza una firma con longitud distinta a un hash válido', () => {
    expect(verifyNowPaymentsSignature({ a: 1 }, 'no-es-un-hash')).toBe(false)
  })
})

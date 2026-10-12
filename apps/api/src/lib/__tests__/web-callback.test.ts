import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { withWebCallback } from '../web-callback'

const BASE = 'https://api.plata.studio/api/auth/verify-email?token=abc'

describe('withWebCallback', () => {
  const original = process.env.WEB_URL
  beforeEach(() => { process.env.WEB_URL = 'https://app.plata.studio/' })
  afterEach(() => { process.env.WEB_URL = original })

  function callbackOf(url: string) {
    return new URL(url).searchParams.get('callbackURL')
  }

  it('respeta un callback absoluto de la web', () => {
    const url = `${BASE}&callbackURL=${encodeURIComponent('https://app.plata.studio/onboarding')}`
    expect(withWebCallback(url)).toBe(url)
  })

  it('manda "/" (reenvío al iniciar sesión) al onboarding de la web', () => {
    expect(callbackOf(withWebCallback(`${BASE}&callbackURL=%2F`))).toBe('https://app.plata.studio/onboarding')
  })

  it('completa un callback relativo con el dominio de la web', () => {
    expect(callbackOf(withWebCallback(`${BASE}&callbackURL=%2Fapp`))).toBe('https://app.plata.studio/app')
  })

  it('agrega el callback si no viene ninguno y conserva el token', () => {
    const result = new URL(withWebCallback(BASE))
    expect(result.searchParams.get('callbackURL')).toBe('https://app.plata.studio/onboarding')
    expect(result.searchParams.get('token')).toBe('abc')
  })
})

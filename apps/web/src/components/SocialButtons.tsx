'use client'

import { useEffect, useState } from 'react'
import { signIn, webUrl } from '@/lib/auth'
import { Button } from '@/components/ui/button'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

type Provider = 'google' | 'microsoft'

const PROVIDERS: Record<Provider, { label: string; icon: React.ReactNode }> = {
  google: {
    label: 'Continuar con Google',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.2-2.1 3.5-5.1 3.5-8.7z" />
        <path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.3v3.1A12 12 0 0 0 12 24z" />
        <path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6h-4a12 12 0 0 0 0 10.8l4-3.1z" />
        <path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A11.5 11.5 0 0 0 12 0 12 12 0 0 0 1.3 6.6l4 3.1c.9-2.9 3.6-4.9 6.7-4.9z" />
      </svg>
    ),
  },
  microsoft: {
    label: 'Continuar con Microsoft',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path fill="#F25022" d="M1 1h10.5v10.5H1z" />
        <path fill="#7FBA00" d="M12.5 1H23v10.5H12.5z" />
        <path fill="#00A4EF" d="M1 12.5h10.5V23H1z" />
        <path fill="#FFB900" d="M12.5 12.5H23V23H12.5z" />
      </svg>
    ),
  },
}

function isProvider(value: string): value is Provider {
  return value in PROVIDERS
}

/**
 * Botones de login social. Solo muestra los proveedores que la API tiene
 * configurados (GET /api/auth-providers); si no hay ninguno no renderiza
 * nada, ni siquiera el separador.
 *
 * Cuenta nueva → onboarding (datos del negocio). Cuenta existente → /app,
 * que igual manda al onboarding si todavía no tiene organización.
 */
export function SocialButtons() {
  const [providers, setProviders] = useState<Provider[]>([])
  const [pending, setPending]     = useState<Provider | null>(null)
  const [error, setError]         = useState<string | null>(null)

  useEffect(() => {
    fetch(`${API_URL}/api/auth-providers`)
      .then((res) => res.json() as Promise<{ providers?: string[] }>)
      .then((data) => setProviders((data.providers ?? []).filter(isProvider)))
      .catch(() => setProviders([]))
  }, [])

  async function handleClick(provider: Provider) {
    setError(null)
    setPending(provider)
    const { error: socialError } = await signIn.social({
      provider,
      callbackURL:        webUrl('/app'),
      newUserCallbackURL: webUrl('/onboarding'),
      errorCallbackURL:   webUrl('/auth/sign-in?error=social'),
    })
    // Si todo sale bien el navegador ya se fue al proveedor; solo volvemos
    // acá si no se pudo iniciar el flujo.
    if (socialError) {
      setError('No se pudo conectar con el proveedor. Probá de nuevo.')
      setPending(null)
    }
  }

  if (providers.length === 0) return null

  return (
    <div className="auth-social">
      {providers.map((provider) => (
        <Button
          key={provider}
          type="button"
          variant="outline"
          className="w-full"
          disabled={pending !== null}
          onClick={() => void handleClick(provider)}
        >
          {PROVIDERS[provider].icon}
          {pending === provider ? 'Redirigiendo…' : PROVIDERS[provider].label}
        </Button>
      ))}
      {error && <p className="auth-social-error">{error}</p>}
      <div className="auth-divider"><span>o con tu email</span></div>
    </div>
  )
}

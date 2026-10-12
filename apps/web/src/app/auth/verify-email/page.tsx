'use client'

import { Suspense, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { sendVerificationEmail, webUrl } from '@/lib/auth'
import { pendingInvitation } from '@/lib/organizations'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'

/**
 * "Revisá tu correo": después del registro, o cuando alguien intenta entrar
 * sin haber verificado el email (en ese caso la API ya reenvió el correo).
 */
function VerifyEmailNotice() {
  const searchParams = useSearchParams()
  const email  = searchParams.get('email') ?? ''
  const resent = searchParams.get('resent') === '1'

  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')

  async function handleResend() {
    if (!email) return
    setStatus('sending')
    const { error } = await sendVerificationEmail({ email, callbackURL: webUrl(pendingInvitation() ? '/auth/invitation' : '/onboarding') })
    setStatus(error ? 'error' : 'sent')
  }

  return (
    <>
      <h1 className="auth-title">Revisá tu correo</h1>

      <p className="auth-message">
        {resent ? 'Tu email todavía no está confirmado. ' : ''}
        Te mandamos un link de confirmación{email ? <> a <strong>{email}</strong></> : ''}.
        Abrilo para activar tu cuenta y seguir con el registro.
      </p>
      <p className="auth-message">
        Si no lo ves en unos minutos, revisá la carpeta de spam o promociones.
      </p>

      {status === 'sent' && (
        <Alert className="mb-2">
          <AlertDescription>Listo, te mandamos un correo nuevo.</AlertDescription>
        </Alert>
      )}
      {status === 'error' && (
        <Alert variant="destructive" className="mb-2">
          <AlertDescription>No pudimos reenviar el correo. Esperá un minuto y probá de nuevo.</AlertDescription>
        </Alert>
      )}

      {email && (
        <Button
          type="button"
          variant="outline"
          className="w-full"
          disabled={status === 'sending' || status === 'sent'}
          onClick={() => void handleResend()}
        >
          {status === 'sending' ? 'Enviando…' : 'Reenviar el correo'}
        </Button>
      )}

      <div className="auth-link-row">
        ¿Ya lo confirmaste? <Link href="/auth/sign-in">Iniciá sesión</Link>
      </div>
    </>
  )
}

export default function VerifyEmailPage() {
  return (
    <Suspense>
      <VerifyEmailNotice />
    </Suspense>
  )
}

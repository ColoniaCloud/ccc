'use client'

import { useEffect, useState } from 'react'
import { deleteUser, webUrl } from '@/lib/auth'
import { useApp } from '../../app-context'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import '../../../auth/auth.css'

type DeletionPreview =
  | { allowed: true;  deletesOrganization: boolean; organizationName: string | null }
  | { allowed: false; reason: string;               organizationName: string | null }

const CONFIRM_WORD = 'ELIMINAR'

export default function AccountSettingsPage() {
  const { apiFetch, me } = useApp()

  const [preview, setPreview] = useState<DeletionPreview | null>(null)
  const [confirm, setConfirm] = useState('')
  const [status,  setStatus]  = useState<'idle' | 'sending' | 'sent'>('idle')
  const [error,   setError]   = useState<string | null>(null)

  useEffect(() => {
    apiFetch('/api/account/deletion')
      .then((res) => res.json() as Promise<DeletionPreview>)
      .then(setPreview)
      .catch(() => setError('No se pudo cargar la información de tu cuenta'))
  }, [apiFetch])

  async function handleRequestDeletion() {
    setError(null)
    setStatus('sending')
    // Better Auth manda el correo de confirmación; el borrado recién ocurre
    // cuando se confirma desde el link (pantalla /auth/delete-account).
    const { error: deleteError } = await deleteUser({ callbackURL: webUrl('/auth/delete-account') })
    if (deleteError) {
      setError(deleteError.message ?? 'No se pudo iniciar la eliminación. Probá de nuevo.')
      setStatus('idle')
      return
    }
    setStatus('sent')
  }

  return (
    <div style={{ maxWidth: 560 }}>
      <section style={{ marginBottom: 'var(--spacing-8)' }}>
        <h2 style={{ fontSize: 'var(--font-size-md, 1rem)', fontWeight: 600, marginBottom: 'var(--spacing-2)' }}>Tu cuenta</h2>
        <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
          {me.user.name} · {me.user.email}
        </p>
      </section>

      <section className="danger-zone">
        <h2 style={{ fontSize: 'var(--font-size-md, 1rem)', fontWeight: 600, marginBottom: 'var(--spacing-2)' }}>
          Eliminar mi cuenta
        </h2>

        {error && (
          <Alert variant="destructive" className="mb-2">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {!preview ? (
          !error && <p className="empty-state">Cargando…</p>
        ) : !preview.allowed ? (
          <Alert variant="destructive">
            <AlertDescription>{preview.reason}</AlertDescription>
          </Alert>
        ) : status === 'sent' ? (
          <Alert>
            <AlertDescription>
              Te mandamos un correo a <strong>{me.user.email}</strong> para confirmar. Abrilo en este navegador y
              confirmá la eliminación. El link vence en 1 hora.
            </AlertDescription>
          </Alert>
        ) : (
          <>
            <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)', lineHeight: 1.6, marginBottom: 'var(--spacing-3)' }}>
              {preview.deletesOrganization && preview.organizationName ? (
                <>
                  Sos el único miembro de <strong>{preview.organizationName}</strong>, así que se va a eliminar tu cuenta
                  y también la organización con todos sus datos: contactos, oportunidades, tareas, pipelines, etiquetas y
                  configuración.
                </>
              ) : (
                <>Se va a eliminar tu cuenta y tu acceso a Plata.</>
              )}{' '}
              <strong>No se puede deshacer.</strong> Te vamos a mandar un correo para confirmar.
            </p>

            <div className="auth-field" style={{ marginBottom: 'var(--spacing-3)' }}>
              <Label htmlFor="confirm-delete">Para continuar, escribí {CONFIRM_WORD}</Label>
              <Input
                id="confirm-delete" autoComplete="off"
                value={confirm} onChange={(e) => setConfirm(e.target.value)}
              />
            </div>

            <Button
              type="button"
              variant="destructive"
              disabled={confirm.trim().toUpperCase() !== CONFIRM_WORD || status === 'sending'}
              onClick={() => void handleRequestDeletion()}
            >
              {status === 'sending' ? 'Enviando…' : 'Eliminar mi cuenta'}
            </Button>
          </>
        )}
      </section>
    </div>
  )
}


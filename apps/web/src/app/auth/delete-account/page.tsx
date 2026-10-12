'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { deleteUser, useSession } from '@/lib/auth'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

type DeletionPreview =
  | { allowed: true;  deletesOrganization: boolean; organizationName: string | null }
  | { allowed: false; reason: string;               organizationName: string | null }

/**
 * Destino del link del correo "Confirmá la eliminación de tu cuenta". Pide la
 * confirmación final con la sesión iniciada y recién ahí borra (Better Auth
 * valida el token contra la sesión).
 */
function DeleteAccountConfirm() {
  const searchParams = useSearchParams()
  const token = searchParams.get('token')
  const { data: session, isPending } = useSession()

  const [preview, setPreview] = useState<DeletionPreview | null>(null)
  const [status,  setStatus]  = useState<'idle' | 'deleting' | 'deleted'>('idle')
  const [error,   setError]   = useState<string | null>(null)

  useEffect(() => {
    if (!session) return
    fetch(`${API_URL}/api/account/deletion`, { credentials: 'include' })
      .then((res) => res.json() as Promise<DeletionPreview>)
      .then(setPreview)
      .catch(() => setPreview(null))
  }, [session])

  async function handleDelete() {
    if (!token) return
    setError(null)
    setStatus('deleting')
    const { error: deleteError } = await deleteUser({ token })
    if (deleteError) {
      setError(deleteError.code === 'INVALID_TOKEN'
        ? 'El link venció o ya se usó. Pedí la eliminación de nuevo desde Configuración → Mi cuenta.'
        : deleteError.message ?? 'No se pudo eliminar la cuenta. Probá de nuevo.')
      setStatus('idle')
      return
    }
    setStatus('deleted')
  }

  if (status === 'deleted') {
    return (
      <>
        <h1 className="auth-title">Cuenta eliminada</h1>
        <p className="auth-message">
          Eliminamos tu cuenta{preview?.allowed && preview.deletesOrganization ? ' y tu organización con todos sus datos' : ''}.
          Gracias por haber usado Plata.
        </p>
        <Button asChild className="w-full">
          <a href="https://plata.studio">Ir a plata.studio</a>
        </Button>
      </>
    )
  }

  if (!token) {
    return (
      <>
        <h1 className="auth-title">Link inválido</h1>
        <p className="auth-message">Pedí la eliminación de tu cuenta desde Configuración → Mi cuenta.</p>
      </>
    )
  }

  if (isPending) {
    return <p className="auth-subtitle">Cargando…</p>
  }

  if (!session) {
    return (
      <>
        <h1 className="auth-title">Iniciá sesión para confirmar</h1>
        <p className="auth-message">
          Por seguridad, la eliminación solo se puede confirmar con la sesión iniciada. Iniciá sesión en este
          navegador y volvé a abrir el link del correo.
        </p>
        <Button asChild className="w-full">
          <Link href="/auth/sign-in">Iniciar sesión</Link>
        </Button>
      </>
    )
  }

  return (
    <>
      <h1 className="auth-title">Eliminar tu cuenta</h1>

      {error && (
        <Alert variant="destructive" className="mb-2">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {preview && !preview.allowed ? (
        <Alert variant="destructive">
          <AlertDescription>{preview.reason}</AlertDescription>
        </Alert>
      ) : (
        <>
          <p className="auth-message">
            Vas a eliminar la cuenta <strong>{session.user.email}</strong>
            {preview?.allowed && preview.deletesOrganization && preview.organizationName ? (
              <> y la organización <strong>{preview.organizationName}</strong> con todos sus datos</>
            ) : null}
            . <strong>Esta acción no se puede deshacer.</strong>
          </p>
          <Button
            type="button"
            variant="destructive"
            className="w-full"
            disabled={status === 'deleting' || !preview}
            onClick={() => void handleDelete()}
          >
            {status === 'deleting' ? 'Eliminando…' : 'Eliminar definitivamente'}
          </Button>
        </>
      )}

      <div className="auth-link-row">
        <Link href="/app">Cancelar y volver a Plata</Link>
      </div>
    </>
  )
}

export default function DeleteAccountPage() {
  return (
    <Suspense>
      <DeleteAccountConfirm />
    </Suspense>
  )
}

'use client'

import { useEffect, useState } from 'react'
import type { BusinessProfile } from '@crm/shared'
import { useApp } from '../../app-context'
import {
  BusinessProfileForm, toFormValues, toRequestBody,
  type BusinessProfileValues,
} from '@/components/BusinessProfileForm'
import '../../../auth/auth.css'

type ProfileResponse = { name: string; profile: BusinessProfile | null }

export default function BusinessSettingsPage() {
  const { apiFetch, me } = useApp()

  const [initial, setInitial] = useState<BusinessProfileValues | null>(null)
  const [hasProfile, setHasProfile] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    apiFetch('/api/business-profile')
      .then((res) => res.json() as Promise<ProfileResponse>)
      .then((data) => {
        setHasProfile(data.profile !== null)
        setInitial(toFormValues(data.name, data.profile))
      })
      .catch(() => setLoadError('No se pudieron cargar los datos del negocio'))
  }, [apiFetch])

  async function handleSubmit(values: BusinessProfileValues): Promise<string | null> {
    try {
      const res = await apiFetch('/api/business-profile', {
        method: 'PUT',
        body:   JSON.stringify(toRequestBody(values)),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null) as { error?: string } | null
        return body?.error ?? 'No se pudieron guardar los datos'
      }
      setHasProfile(true)
      return null
    } catch {
      return 'No se pudo conectar con el servidor. Revisá tu conexión.'
    }
  }

  const isAdmin = ['owner', 'admin'].includes(me.member.role)

  return (
    <div style={{ maxWidth: 560 }}>
      <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)', marginBottom: 'var(--spacing-4)' }}>
        Plata usa estos datos para adaptarse a cómo vende tu negocio.
      </p>

      {!hasProfile && isAdmin && (
        <p className="empty-state" style={{ marginBottom: 'var(--spacing-4)' }}>
          Tu organización se creó antes de este formulario: completalo para que Plata conozca tu negocio.
        </p>
      )}

      {!isAdmin && (
        <p className="empty-state" style={{ marginBottom: 'var(--spacing-4)' }}>
          Solo un admin puede editar los datos del negocio.
        </p>
      )}

      {loadError && <div className="form-error">{loadError}</div>}

      {!initial && !loadError ? (
        <p className="empty-state">Cargando…</p>
      ) : initial && (
        <BusinessProfileForm
          initial={initial}
          submitLabel="Guardar cambios"
          readOnly={!isAdmin}
          onSubmit={handleSubmit}
        />
      )}
    </div>
  )
}

'use client'

import { useEffect, useState } from 'react'
import { useApp } from '../../app-context'

type ModuleItem = { key: string; label: string; description: string; enabled: boolean }

export default function ModulesSettingsPage() {
  const { apiFetch, me } = useApp()

  const [modules, setModules] = useState<ModuleItem[] | null>(null)
  const [error, setError]     = useState<string | null>(null)
  const [pending, setPending] = useState<string | null>(null)

  async function load() {
    const res  = await apiFetch('/api/modules')
    const data = await res.json() as { items: ModuleItem[] }
    setModules(data.items)
  }

  useEffect(() => {
    load().catch(() => setError('No se pudieron cargar los módulos'))
  }, [apiFetch])

  async function handleToggle(item: ModuleItem) {
    setError(null)
    setPending(item.key)

    try {
      const res = await apiFetch(`/api/modules/${item.key}/${item.enabled ? 'disable' : 'enable'}`, {
        method: 'POST',
      })

      if (!res.ok) {
        const body = await res.json().catch(() => null) as { error?: string } | null
        throw new Error(body?.error ?? 'No se pudo actualizar el módulo')
      }

      await load()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'No se pudo actualizar el módulo')
    } finally {
      setPending(null)
    }
  }

  const isAdmin = me.member.role === 'admin'

  return (
    <div>
      <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)', marginBottom: 'var(--spacing-4)' }}>
        Activá las herramientas que tu organización necesita, según tu rubro.
      </p>

      {!isAdmin && (
        <p className="empty-state">Solo un admin puede activar o desactivar módulos.</p>
      )}

      {error && (
        <div className="form-error" style={{ marginBottom: 'var(--spacing-4)' }}>{error}</div>
      )}

      {!modules ? (
        <p className="empty-state">Cargando…</p>
      ) : (
        <div className="module-grid">
          {modules.map((item) => (
            <div key={item.key} className={`module-card${item.enabled ? ' enabled' : ''}`}>
              <div className="module-card-head">
                <span className="module-name">{item.label}</span>
                {isAdmin && (
                  <button
                    type="button"
                    className={`module-toggle${item.enabled ? ' on' : ''}`}
                    disabled={pending === item.key}
                    onClick={() => handleToggle(item)}
                    aria-label={`${item.enabled ? 'Desactivar' : 'Activar'} ${item.label}`}
                    aria-pressed={item.enabled}
                  />
                )}
              </div>
              <p className="module-desc">{item.description}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

'use client'

import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react'

export type Me = {
  user:   { id: string; name: string; email: string }
  tenant: { id: string; name: string; slug: string; plan: string; modules: string[] }
  member: { id: string; role: string }
}

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

type AppContextValue = {
  me: Me
  apiFetch: (path: string, init?: RequestInit) => Promise<Response>
}

const AppContext = createContext<AppContextValue | null>(null)

export function AppProvider({ me, children }: { me: Me; children: ReactNode }) {
  const tenantSlug = me.tenant.slug

  const apiFetch = useCallback(async (path: string, init: RequestInit = {}) => {
    return fetch(`${API_URL}${path}`, {
      ...init,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'x-tenant-slug': tenantSlug,
        ...init.headers,
      },
    })
  }, [tenantSlug])

  const value = useMemo(() => ({ me, apiFetch }), [me, apiFetch])

  return (
    <AppContext.Provider value={value}>
      {children}
    </AppContext.Provider>
  )
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext)
  if (!ctx) {
    throw new Error('useApp debe usarse dentro de AppProvider')
  }
  return ctx
}

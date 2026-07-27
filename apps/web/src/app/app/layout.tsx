'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useSession, signOut } from '@/lib/auth'
import { Logo } from '@/components/Logo'
import type { ModuleKey } from '@crm/shared'
import { AppProvider, type Me } from './app-context'
import './app.css'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

type StatusResponse =
  | { status: 'pending' }
  | { status: 'completed'; tenant: { id: string; name: string; slug: string } | null }

// moduleKey opcional: un nav item con moduleKey solo se muestra si el tenant
// tiene ese módulo activo (me.tenant.modules). Sin moduleKey, siempre visible.
// superAdmin: solo visible para los emails de SUPERADMIN_EMAILS (lo informa
// /api/me). Ocultar el link no protege nada — el control real está en
// superAdminMiddleware, del lado de la API.
const NAV_ITEMS: { href: string; label: string; moduleKey?: ModuleKey; superAdmin?: boolean }[] = [
  { href: '/app',            label: 'Resumen' },
  { href: '/app/contacts',   label: 'Contactos' },
  { href: '/app/pipeline',   label: 'Pipeline' },
  { href: '/app/tasks',      label: 'Tareas' },
  { href: '/app/billing',    label: 'Facturación' },
  { href: '/app/settings',   label: 'Configuración' },
  { href: '/admin',          label: 'Administración', superAdmin: true },
]

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router   = useRouter()
  const pathname = usePathname()
  const { data: session, isPending: sessionLoading } = useSession()

  const [me, setMe]           = useState<Me | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.localStorage.getItem('plata:sidebar-collapsed') === '1'
  })

  function toggleSidebar() {
    setSidebarCollapsed((prev) => {
      const next = !prev
      window.localStorage.setItem('plata:sidebar-collapsed', next ? '1' : '0')
      return next
    })
  }

  useEffect(() => {
    if (sessionLoading) return

    if (!session) {
      router.replace('/auth/sign-in')
      return
    }

    let cancelled = false

    async function load() {
      try {
        const statusRes  = await fetch(`${API_URL}/api/onboarding/status`, { credentials: 'include' })
        const statusData = await statusRes.json() as StatusResponse

        if (statusData.status === 'pending' || !statusData.tenant) {
          if (!cancelled) router.replace('/onboarding')
          return
        }

        const meRes = await fetch(`${API_URL}/api/me`, {
          credentials: 'include',
          headers: { 'x-tenant-slug': statusData.tenant.slug },
        })
        // El mensaje de la API importa: acá es por donde llega el 403 de
        // un tenant suspendido, y el usuario tiene que ver por qué se
        // quedó afuera en vez de una pantalla de carga eterna.
        if (!meRes.ok) {
          const body = await meRes.json().catch(() => null) as { error?: string } | null
          throw new Error(body?.error ?? 'No se pudo cargar la cuenta')
        }

        const meData = await meRes.json() as Me

        if (!cancelled) {
          setMe(meData)
          setLoading(false)
        }
      } catch (err: unknown) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'No se pudo cargar la cuenta')
          setLoading(false)
        }
      }
    }

    load()
    return () => { cancelled = true }
  }, [session, sessionLoading, router])

  async function handleSignOut() {
    await signOut()
    router.replace('/auth/sign-in')
  }

  if (sessionLoading || loading) {
    return (
      <div className="app-shell">
        <main className="app-main">
          <p className="app-loading">Cargando…</p>
        </main>
      </div>
    )
  }

  if (!me) {
    return (
      <div className="app-shell">
        <main className="app-main">
          <div className="app-error">
            <p className="form-error">{error ?? 'No se pudo cargar la cuenta'}</p>
            <button className="btn-ghost" onClick={handleSignOut}>Cerrar sesión</button>
          </div>
        </main>
      </div>
    )
  }

  return (
    <AppProvider me={me}>
      <div className="app-shell app-shell--with-sidebar">
        <div className="app-content">
          <header className="app-header">
            <Logo height={32} priority />
            <div className="app-header-right">
              <span className="app-tenant">{me.tenant.name}</span>
              <button className="app-signout" onClick={handleSignOut}>Cerrar sesión</button>
            </div>
          </header>

          <main className="app-main app-main--scroll">
            {children}
          </main>
        </div>

        <aside className={`app-sidebar${sidebarCollapsed ? ' app-sidebar--collapsed' : ''}`}>
          <nav className="app-nav">
            {NAV_ITEMS
              .filter((item) => !item.moduleKey || me.tenant.modules.includes(item.moduleKey))
              .filter((item) => !item.superAdmin || me.user.isSuperAdmin)
              .map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`app-nav-link${pathname === item.href ? ' active' : ''}`}
                >
                  {item.label}
                </Link>
              ))}
          </nav>
        </aside>

        <button
          type="button"
          className={`app-sidebar-toggle${sidebarCollapsed ? ' app-sidebar-toggle--collapsed' : ''}`}
          onClick={toggleSidebar}
          aria-label={sidebarCollapsed ? 'Mostrar barra lateral' : 'Ocultar barra lateral'}
          aria-pressed={sidebarCollapsed}
        >
          {sidebarCollapsed ? '‹' : '›'}
        </button>
      </div>
    </AppProvider>
  )
}

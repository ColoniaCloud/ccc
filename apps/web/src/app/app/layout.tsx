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
const NAV_ITEMS: { href: string; label: string; moduleKey?: ModuleKey }[] = [
  { href: '/app',            label: 'Resumen' },
  { href: '/app/contacts',   label: 'Contactos' },
  { href: '/app/pipeline',   label: 'Pipeline' },
  { href: '/app/tasks',      label: 'Tareas' },
  { href: '/app/billing',    label: 'Facturación' },
  { href: '/app/settings',   label: 'Configuración' },
]

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router   = useRouter()
  const pathname = usePathname()
  const { data: session, isPending: sessionLoading } = useSession()

  const [me, setMe]           = useState<Me | null>(null)
  const [loading, setLoading] = useState(true)
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
        if (!meRes.ok) throw new Error('No se pudo cargar la cuenta')

        const meData = await meRes.json() as Me

        if (!cancelled) {
          setMe(meData)
          setLoading(false)
        }
      } catch {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [session, sessionLoading, router])

  async function handleSignOut() {
    await signOut()
    router.replace('/auth/sign-in')
  }

  if (sessionLoading || loading || !me) {
    return (
      <div className="app-shell">
        <main className="app-main">
          <p className="app-loading">Cargando…</p>
        </main>
      </div>
    )
  }

  return (
    <AppProvider me={me}>
      <div className="app-shell app-shell--with-sidebar">
        <div className="app-content">
          <header className="app-header">
            <span className="app-tenant">{me.tenant.name}</span>
            <button className="app-signout" onClick={handleSignOut}>Cerrar sesión</button>
          </header>

          <main className="app-main app-main--scroll">
            {children}
          </main>
        </div>

        <aside className={`app-sidebar${sidebarCollapsed ? ' app-sidebar--collapsed' : ''}`}>
          <div className="app-brand">
            <Logo height={26} />
          </div>
          <nav className="app-nav">
            {NAV_ITEMS
              .filter((item) => !item.moduleKey || me.tenant.modules.includes(item.moduleKey))
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

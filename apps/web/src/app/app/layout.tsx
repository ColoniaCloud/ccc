'use client'

import { useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  ArrowLeft01Icon,
  CheckListIcon,
  Contact01Icon,
  CreditCardIcon,
  DashboardSquare01Icon,
  KanbanIcon,
  Logout01Icon,
  Menu01Icon,
  Settings01Icon,
  UserShield01Icon,
} from '@hugeicons/core-free-icons'
import type { ModuleKey } from '@crm/shared'
import { useSession, signOut } from '@/lib/auth'
import { Logo } from '@/components/Logo'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { AppProvider, type Me } from './app-context'
import './app.css'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

type StatusResponse =
  | { status: 'pending' }
  | { status: 'completed'; tenant: { id: string; name: string; slug: string } | null }

type NavItem = {
  href: string
  label: string
  icon: typeof DashboardSquare01Icon
  moduleKey?: ModuleKey
  superAdmin?: boolean
}

const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: 'Espacio de trabajo',
    items: [
      { href: '/app', label: 'Resumen', icon: DashboardSquare01Icon },
      { href: '/app/contacts', label: 'Contactos', icon: Contact01Icon },
      { href: '/app/pipeline', label: 'Pipeline', icon: KanbanIcon },
      { href: '/app/tasks', label: 'Tareas', icon: CheckListIcon },
    ],
  },
  {
    label: 'Organización',
    items: [
      { href: '/app/billing', label: 'Facturación', icon: CreditCardIcon },
      { href: '/app/settings', label: 'Configuración', icon: Settings01Icon },
      { href: '/admin', label: 'Administración', icon: UserShield01Icon, superAdmin: true },
    ],
  },
]

function isNavItemActive(pathname: string, href: string) {
  return href === '/app' ? pathname === href : pathname === href || pathname.startsWith(`${href}/`)
}

function getInitials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('')
}

function formatPlan(plan: string) {
  return plan.charAt(0).toUpperCase() + plan.slice(1)
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const { data: session, isPending: sessionLoading } = useSession()

  const [me, setMe] = useState<Me | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  const visibleGroups = useMemo(() => {
    if (!me) return []
    return NAV_GROUPS.map((group) => ({
      ...group,
      items: group.items
        .filter((item) => !item.moduleKey || me.tenant.modules.includes(item.moduleKey))
        .filter((item) => !item.superAdmin || me.user.isSuperAdmin),
    })).filter((group) => group.items.length > 0)
  }, [me])

  const currentItem = useMemo(
    () => visibleGroups.flatMap((group) => group.items).find((item) => isNavItemActive(pathname, item.href)),
    [pathname, visibleGroups],
  )

  function toggleSidebar() {
    setSidebarCollapsed((previous) => {
      const next = !previous
      window.localStorage.setItem('plata:sidebar-collapsed', next ? '1' : '0')
      return next
    })
  }

  useEffect(() => {
    setMobileOpen(false)
  }, [pathname])

  useEffect(() => {
    setSidebarCollapsed(window.localStorage.getItem('plata:sidebar-collapsed') === '1')
  }, [])

  useEffect(() => {
    if (sessionLoading) return

    if (!session) {
      router.replace('/auth/sign-in')
      return
    }

    let cancelled = false

    async function load() {
      try {
        const statusRes = await fetch(`${API_URL}/api/onboarding/status`, { credentials: 'include' })
        const statusData = await statusRes.json() as StatusResponse

        if (statusData.status === 'pending' || !statusData.tenant) {
          if (!cancelled) router.replace('/onboarding')
          return
        }

        const meRes = await fetch(`${API_URL}/api/me`, {
          credentials: 'include',
          headers: { 'x-tenant-slug': statusData.tenant.slug },
        })
        if (!meRes.ok) {
          const body = await meRes.json().catch(() => null) as { error?: string } | null
          throw new Error(body?.error ?? 'No se pudo cargar la cuenta')
        }

        const meData = await meRes.json() as Me

        if (!cancelled) {
          setMe(meData)
          setLoading(false)
        }
      } catch (loadError: unknown) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'No se pudo cargar la cuenta')
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
      <div className="app-loading-screen">
        <Image src="/icon.svg" alt="" width={38} height={38} priority />
        <div className="app-loading-copy">
          <span>Preparando tu espacio</span>
          <small>Cargando la información de tu organización…</small>
        </div>
      </div>
    )
  }

  if (!me) {
    return (
      <div className="app-error-screen">
        <div className="app-error">
          <Image src="/icon.svg" alt="Plata" width={42} height={42} />
          <div>
            <h1>No pudimos abrir tu espacio</h1>
            <p className="form-error">{error ?? 'No se pudo cargar la cuenta'}</p>
          </div>
          <Button variant="outline" onClick={handleSignOut}>Cerrar sesión</Button>
        </div>
      </div>
    )
  }

  return (
    <AppProvider me={me}>
      <div className={`app-shell app-shell--with-sidebar${sidebarCollapsed ? ' app-shell--collapsed' : ''}`}>
        {mobileOpen && (
          <button
            type="button"
            className="app-sidebar-backdrop"
            aria-label="Cerrar navegación"
            onClick={() => setMobileOpen(false)}
          />
        )}

        <aside className={`app-sidebar${mobileOpen ? ' app-sidebar--mobile-open' : ''}`}>
          <div className="app-sidebar-brand">
            <Link href="/app" aria-label="Ir al resumen de Plata" className="app-sidebar-logo">
              <Image className="app-sidebar-mark" src="/icon.svg" alt="" width={34} height={34} priority />
              <Logo height={25} priority />
            </Link>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="app-sidebar-mobile-close"
              aria-label="Cerrar navegación"
              onClick={() => setMobileOpen(false)}
            >
              <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={2} />
            </Button>
          </div>

          <nav className="app-nav" aria-label="Navegación principal">
            {visibleGroups.map((group) => (
              <div className="app-nav-group" key={group.label}>
                <span className="app-nav-label">{group.label}</span>
                <div className="app-nav-items">
                  {group.items.map((item) => {
                    const active = isNavItemActive(pathname, item.href)
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={`app-nav-link${active ? ' active' : ''}`}
                        aria-current={active ? 'page' : undefined}
                        title={sidebarCollapsed ? item.label : undefined}
                      >
                        <HugeiconsIcon icon={item.icon} strokeWidth={1.8} className="app-nav-icon" />
                        <span>{item.label}</span>
                      </Link>
                    )
                  })}
                </div>
              </div>
            ))}
          </nav>

          <div className="app-sidebar-footer">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="app-user-trigger">
                  <Avatar size="sm">
                    <AvatarFallback>{getInitials(me.user.name)}</AvatarFallback>
                  </Avatar>
                  <span className="app-user-copy">
                    <strong>{me.user.name}</strong>
                    <small>{me.user.email}</small>
                  </span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" align="start" className="w-64">
                <DropdownMenuLabel>
                  <span className="app-account-menu-label">{me.tenant.name}</span>
                  <span className="app-account-menu-meta">{me.member.role} · Plan {formatPlan(me.tenant.plan)}</span>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuItem asChild>
                    <Link href="/app/settings">
                      <HugeiconsIcon icon={Settings01Icon} strokeWidth={2} />
                      Configuración
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem variant="destructive" onSelect={handleSignOut}>
                    <HugeiconsIcon icon={Logout01Icon} strokeWidth={2} />
                    Cerrar sesión
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>

            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="app-sidebar-collapse"
              onClick={toggleSidebar}
              aria-label={sidebarCollapsed ? 'Expandir barra lateral' : 'Contraer barra lateral'}
              aria-pressed={sidebarCollapsed}
            >
              <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={2} />
            </Button>
          </div>
        </aside>

        <div className="app-content">
          <header className="app-header">
            <div className="app-header-context">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="app-mobile-menu"
                aria-label="Abrir navegación"
                onClick={() => setMobileOpen(true)}
              >
                <HugeiconsIcon icon={Menu01Icon} strokeWidth={2} />
              </Button>
              <div>
                <span className="app-header-eyebrow">{me.tenant.name}</span>
                <strong>{currentItem?.label ?? 'Plata'}</strong>
              </div>
            </div>
            <Badge variant="outline">Plan {formatPlan(me.tenant.plan)}</Badge>
          </header>

          <main className="app-main app-main--scroll">
            {children}
          </main>
        </div>
      </div>
    </AppProvider>
  )
}

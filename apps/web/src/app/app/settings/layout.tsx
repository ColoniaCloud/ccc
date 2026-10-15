'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import './settings.css'
import { useApp } from '../app-context'

const SETTINGS_NAV = [
  { href: '/app/settings/team',          label: 'Equipo' },
  { href: '/app/settings/business',      label: 'Negocio' },
  { href: '/app/settings/presets',       label: 'Preconfiguraciones' },
  { href: '/app/settings/modules',       label: 'Módulos' },
  { href: '/app/settings/custom-fields', label: 'Campos personalizados' },
  { href: '/app/settings/account',       label: 'Mi cuenta' },
]

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { me } = useApp()
  const canMeasure = ['owner','admin'].includes(me.member.role)

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Configuración</h1>
          <p>Ajustes de tu organización.</p>
        </div>
      </div>

      <div className="settings-shell">
        <nav className="settings-nav">
          {[...SETTINGS_NAV, ...(canMeasure ? [{ href: '/app/settings/pilot', label: 'Medición del piloto' }] : [])].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`settings-nav-link${pathname === item.href ? ' active' : ''}`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="settings-content">
          {children}
        </div>
      </div>
    </div>
  )
}

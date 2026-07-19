'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import './settings.css'

const SETTINGS_NAV = [
  { href: '/app/settings/modules',       label: 'Módulos' },
  { href: '/app/settings/custom-fields', label: 'Campos personalizados' },
]

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

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
          {SETTINGS_NAV.map((item) => (
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

import Link from 'next/link'
import { Logo } from '@/components/Logo'
import './marketing.css'

const NAV_LINKS = [
  { href: '/',             label: 'Inicio' },
  { href: '/herramientas', label: 'Herramientas' },
  { href: '/modulos',      label: 'Módulos' },
  { href: '/precios',      label: 'Precios' },
  { href: '/contacto',     label: 'Contacto' },
]

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mkt">
      <nav className="mkt-nav">
        <Link href="/" className="mkt-brand" aria-label="Plata — inicio">
          <Logo height={30} priority />
        </Link>
        <div className="mkt-nav-links">
          {NAV_LINKS.map((item) => (
            <Link key={item.href} href={item.href}>{item.label}</Link>
          ))}
          <Link href="/auth/sign-in">Iniciar sesión</Link>
          <Link href="/auth/sign-up" className="mkt-nav-cta">Empezá gratis</Link>
        </div>
      </nav>

      {children}

      <footer className="mkt-footer">
        &copy; {new Date().getFullYear()} Plata. Todos los derechos reservados.
      </footer>
    </div>
  )
}

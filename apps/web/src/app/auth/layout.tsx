import type { ReactNode } from 'react'
import { Logo } from '@/components/Logo'
import './auth.css'

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="auth-shell">
      <div className="auth-brand">
        <Logo height={34} priority />
      </div>
      <div className="auth-card">
        {children}
      </div>
      <p className="auth-footer">
        &copy; {new Date().getFullYear()} Plata. Todos los derechos reservados.
      </p>
    </div>
  )
}

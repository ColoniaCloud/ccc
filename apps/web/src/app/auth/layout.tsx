import type { ReactNode } from 'react'
import './auth.css'

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="auth-shell">
      <div className="auth-brand">
        <span className="auth-brand-dot" />
        <span className="auth-brand-name">Plata</span>
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

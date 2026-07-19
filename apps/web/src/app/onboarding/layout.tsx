import type { ReactNode } from 'react'
import '../auth/auth.css'

export default function OnboardingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="auth-shell">
      <div className="auth-brand">
        <span className="auth-brand-dot" />
        <span className="auth-brand-name">Plata</span>
      </div>
      <div className="auth-card">
        {children}
      </div>
    </div>
  )
}

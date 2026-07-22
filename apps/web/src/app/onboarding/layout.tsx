import type { ReactNode } from 'react'
import { Logo } from '@/components/Logo'
import '../auth/auth.css'

export default function OnboardingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="auth-shell">
      <div className="auth-brand">
        <Logo height={34} priority />
      </div>
      <div className="auth-card">
        {children}
      </div>
    </div>
  )
}

import type { ReactNode } from 'react'
import { Logo } from '@/components/Logo'
import { Card } from '@/components/ui/card'
import '../auth/auth.css'

export default function OnboardingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="auth-shell">
      <div className="auth-brand">
        <Logo height={34} priority />
      </div>
      <Card className="w-full max-w-[400px] gap-0 p-8 shadow-md">
        {children}
      </Card>
    </div>
  )
}

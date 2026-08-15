import type { ReactNode } from 'react'
import { Logo } from '@/components/Logo'
import { GroundBackground } from '@/components/GroundBackground'
import { Card } from '@/components/ui/card'
import './auth.css'

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="auth-shell">
      <div className="auth-form-pane">
        <div className="auth-brand">
          <Logo height={34} priority />
        </div>
        <Card className="w-full max-w-[400px] gap-0 p-8 shadow-md">
          {children}
        </Card>
        <p className="auth-footer">
          &copy; {new Date().getFullYear()} Plata. Todos los derechos reservados.
        </p>
      </div>

      <div className="auth-visual">
        <GroundBackground />
      </div>
    </div>
  )
}

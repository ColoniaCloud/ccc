import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'

const PLANS = [
  { name: 'Free', price: 0 },
  { name: 'Pro', price: 10 },
  { name: 'Business', price: 35, featured: true },
  { name: 'Master', price: 80 },
  { name: 'Enterprise', price: null },
]

export default function PreciosPage() {
  return (
    <>
      <section className="mkt-section">
        <div className="mkt-section-head">
          <h2>Planes para cada etapa</h2>
          <p>Empezás gratis. Escalás cuando tu equipo lo necesite.</p>
        </div>
        <div className="mkt-pricing">
          {PLANS.map((plan) => (
            <Card
              key={plan.name}
              className={cn('gap-3 p-5', plan.featured && 'border-accent shadow-[0_0_0_1px_var(--color-accent)_inset]')}
            >
              <span className="mkt-price-name">{plan.name}</span>
              <span className="mkt-price-value">
                {plan.price === null ? 'Custom' : plan.price === 0 ? 'Gratis' : (
                  <>USD {plan.price}<small> /mes</small></>
                )}
              </span>
            </Card>
          ))}
        </div>
        <div className="mkt-payments" style={{ marginTop: 'var(--spacing-8)' }}>
          <Badge variant="secondary" className="h-auto gap-2 px-5 py-2 text-sm">💳 MercadoPago</Badge>
          <Badge variant="secondary" className="h-auto gap-2 px-5 py-2 text-sm">₿ Cripto (BTC, USDT y más)</Badge>
        </div>
      </section>

      <section className="mkt-section">
        <Card className="mkt-cta">
          <h2>Armá tu organización en un minuto</h2>
          <p style={{ color: 'var(--color-text-secondary)', maxWidth: '48ch' }}>
            Sin tarjeta para empezar. Pasás al plan pago cuando quieras, con MercadoPago o cripto.
          </p>
          <Link href="/auth/sign-up" className={buttonVariants()}>Crear mi cuenta</Link>
        </Card>
      </section>
    </>
  )
}

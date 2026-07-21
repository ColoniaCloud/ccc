import Link from 'next/link'

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
            <div key={plan.name} className={`mkt-price-card${plan.featured ? ' featured' : ''}`}>
              <span className="mkt-price-name">{plan.name}</span>
              <span className="mkt-price-value">
                {plan.price === null ? 'Custom' : plan.price === 0 ? 'Gratis' : (
                  <>USD {plan.price}<small> /mes</small></>
                )}
              </span>
            </div>
          ))}
        </div>
        <div className="mkt-payments" style={{ marginTop: 'var(--spacing-8)' }}>
          <span className="mkt-payment-pill">💳 MercadoPago</span>
          <span className="mkt-payment-pill">₿ Cripto (BTC, USDT y más)</span>
        </div>
      </section>

      <section className="mkt-section">
        <div className="mkt-cta">
          <h2>Armá tu organización en un minuto</h2>
          <p style={{ color: 'var(--color-text-secondary)', maxWidth: '48ch' }}>
            Sin tarjeta para empezar. Pasás al plan pago cuando quieras, con MercadoPago o cripto.
          </p>
          <Link href="/auth/sign-up" className="mkt-btn mkt-btn-primary">Crear mi cuenta</Link>
        </div>
      </section>
    </>
  )
}

import Link from 'next/link'
import './marketing.css'

const FEATURES = [
  {
    icon: '◐',
    title: 'Contactos a tu medida',
    desc: 'Campos personalizados, etiquetas y búsqueda avanzada para organizar tu cartera como tu negocio la necesita.',
  },
  {
    icon: '⬡',
    title: 'Módulos por rubro',
    desc: 'Activá solo las herramientas que usás: gestioná stock si vendés productos, o turnos si das servicios.',
  },
  {
    icon: '▤',
    title: 'Pipeline visual',
    desc: 'Un tablero kanban simple: movés cada oportunidad de etapa según avanza la conversación.',
  },
  {
    icon: '◷',
    title: 'Historial completo',
    desc: 'Línea de tiempo con cada cambio de estado, nota y actualización — nunca perdés el contexto de un contacto.',
  },
  {
    icon: '⇧',
    title: 'Carga masiva',
    desc: 'Importá tu base de contactos desde un CSV en minutos, con detección de duplicados por email.',
  },
  {
    icon: '$',
    title: 'Pagos flexibles',
    desc: 'Suscribite con MercadoPago o pagá con cripto — vos elegís cómo cobrarte tu equipo.',
  },
]

const PLANS = [
  { name: 'Free', price: 0 },
  { name: 'Pro', price: 10 },
  { name: 'Business', price: 35, featured: true },
  { name: 'Master', price: 80 },
  { name: 'Enterprise', price: null },
]

export default function MarketingHomePage() {
  return (
    <div className="mkt">
      <nav className="mkt-nav">
        <div className="mkt-brand">
          <span className="mkt-brand-dot" />
          Plata
        </div>
        <div className="mkt-nav-links">
          <Link href="/auth/sign-in">Iniciar sesión</Link>
          <Link href="/auth/sign-up" className="mkt-nav-cta">Empezá gratis</Link>
        </div>
      </nav>

      <header className="mkt-hero">
        <span className="mkt-eyebrow">CRM para equipos de venta en LATAM</span>
        <h1>El CRM que tu equipo de ventas va a usar de verdad</h1>
        <p>
          Contactos, pipeline visual y tareas en un solo lugar — sin la carga
          de un ERP. Armá tu organización en menos de un minuto y empezá a
          vender.
        </p>
        <div className="mkt-hero-actions">
          <Link href="/auth/sign-up" className="mkt-btn mkt-btn-primary">Empezá gratis</Link>
          <Link href="/auth/sign-in" className="mkt-btn mkt-btn-ghost">Ya tengo cuenta</Link>
        </div>
      </header>

      <section className="mkt-section">
        <div className="mkt-section-head">
          <h2>Todo lo que un equipo comercial necesita</h2>
          <p>Sin curva de aprendizaje: entrás, cargás tu primer contacto, y ya estás vendiendo.</p>
        </div>
        <div className="mkt-features">
          {FEATURES.map((f) => (
            <div key={f.title} className="mkt-feature">
              <div className="mkt-feature-icon">{f.icon}</div>
              <h3>{f.title}</h3>
              <p>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

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

      <footer className="mkt-footer">
        &copy; {new Date().getFullYear()} Plata. Todos los derechos reservados.
      </footer>
    </div>
  )
}

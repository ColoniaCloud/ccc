import Link from 'next/link'

const HIGHLIGHTS = [
  {
    icon: '◐',
    title: 'Contactos a tu medida',
    desc: 'Campos personalizados, etiquetas y búsqueda avanzada para organizar tu cartera como tu negocio la necesita.',
  },
  {
    icon: '▤',
    title: 'Pipeline visual',
    desc: 'Un tablero kanban simple: movés cada oportunidad de etapa según avanza la conversación.',
  },
  {
    icon: '⇧',
    title: 'Carga masiva',
    desc: 'Importá tu base de contactos desde un CSV en minutos, con detección de duplicados por email.',
  },
]

export default function MarketingHomePage() {
  return (
    <>
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
          {HIGHLIGHTS.map((f) => (
            <div key={f.title} className="mkt-feature">
              <div className="mkt-feature-icon">{f.icon}</div>
              <h3>{f.title}</h3>
              <p>{f.desc}</p>
            </div>
          ))}
        </div>
        <p style={{ textAlign: 'center', marginTop: 'var(--spacing-8)' }}>
          <Link href="/herramientas" className="mkt-btn-ghost mkt-btn" style={{ display: 'inline-block' }}>
            Ver todas las herramientas →
          </Link>
        </p>
      </section>

      <section className="mkt-section">
        <div className="mkt-cta">
          <h2>Armá tu organización en un minuto</h2>
          <p style={{ color: 'var(--color-text-secondary)', maxWidth: '48ch' }}>
            Sin tarjeta para empezar. Planes desde gratis — pasás al plan pago cuando
            quieras, con MercadoPago o cripto. <Link href="/precios">Ver precios</Link>.
          </p>
          <Link href="/auth/sign-up" className="mkt-btn mkt-btn-primary">Crear mi cuenta</Link>
        </div>
      </section>
    </>
  )
}

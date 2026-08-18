import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'

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
        <Badge variant="outline" className="border-accent/30 bg-accent/10 text-accent uppercase tracking-wide">
          CRM para equipos de venta en LATAM
        </Badge>
        <h1>El CRM que tu equipo de ventas va a usar de verdad</h1>
        <p>
          Contactos, pipeline visual y tareas en un solo lugar — sin la carga
          de un ERP. Armá tu organización en menos de un minuto y empezá a
          vender.
        </p>
        <div className="mkt-hero-actions">
          <Link href="/auth/sign-up" className={buttonVariants()}>Empezá gratis</Link>
          <Link href="/auth/sign-in" className={buttonVariants({ variant: 'outline' })}>Ya tengo cuenta</Link>
        </div>
      </header>

      <section className="mkt-section">
        <div className="mkt-section-head">
          <h2>Todo lo que un equipo comercial necesita</h2>
          <p>Sin curva de aprendizaje: entrás, cargás tu primer contacto, y ya estás vendiendo.</p>
        </div>
        <div className="mkt-features">
          {HIGHLIGHTS.map((f) => (
            <Card key={f.title} className="gap-3 p-6">
              <div className="mkt-feature-icon">{f.icon}</div>
              <h3>{f.title}</h3>
              <p>{f.desc}</p>
            </Card>
          ))}
        </div>
        <p style={{ textAlign: 'center', marginTop: 'var(--spacing-8)' }}>
          <Link href="/herramientas" className={buttonVariants({ variant: 'outline' })}>
            Ver todas las herramientas →
          </Link>
        </p>
      </section>

      <section className="mkt-section">
        <Card className="mkt-cta">
          <h2>Armá tu organización en un minuto</h2>
          <p style={{ color: 'var(--color-text-secondary)', maxWidth: '48ch' }}>
            Sin tarjeta para empezar. Planes desde gratis — pasás al plan pago cuando
            quieras, con MercadoPago o cripto. <Link href="/precios">Ver precios</Link>.
          </p>
          <Link href="/auth/sign-up" className={buttonVariants()}>Crear mi cuenta</Link>
        </Card>
      </section>
    </>
  )
}

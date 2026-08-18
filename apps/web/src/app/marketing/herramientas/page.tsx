import { Card } from '@/components/ui/card'

const TOOLS = [
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
    icon: '✓',
    title: 'Tareas y seguimientos',
    desc: 'Recordatorios con vencimiento para que ningún cliente quede esperando una respuesta.',
  },
  {
    icon: '◷',
    title: 'Historial completo',
    desc: 'Línea de tiempo con cada cambio de estado, nota y actualización — nunca perdés el contexto de un contacto.',
  },
  {
    icon: '☰',
    title: 'Edición masiva',
    desc: 'Cambiá el estado, agregá una etiqueta o eliminá varios contactos a la vez, sin repetir la acción uno por uno.',
  },
  {
    icon: '⇧',
    title: 'Carga masiva',
    desc: 'Importá tu base de contactos desde un CSV en minutos, con detección de duplicados por email.',
  },
]

export default function HerramientasPage() {
  return (
    <section className="mkt-section">
      <div className="mkt-section-head">
        <h2>Herramientas</h2>
        <p>Todo lo que necesitás para gestionar tu cartera de contactos, ya construido y listo para usar.</p>
      </div>
      <div className="mkt-features">
        {TOOLS.map((f) => (
          <Card key={f.title} className="gap-3 p-6">
            <div className="mkt-feature-icon">{f.icon}</div>
            <h3>{f.title}</h3>
            <p>{f.desc}</p>
          </Card>
        ))}
      </div>
    </section>
  )
}

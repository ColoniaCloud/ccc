const MODULES = [
  {
    icon: '⬡',
    label: 'Stock',
    desc: 'Catálogo de productos y control de inventario, vinculado a tus contactos — pensado para tiendas que venden productos.',
  },
  {
    icon: '◷',
    label: 'Períodos de servicio',
    desc: 'Agenda y vigencia de servicios por contacto — membresías, turnos, contratos. Pensado para consultorios y negocios de servicios.',
  },
]

export default function ModulosPage() {
  return (
    <section className="mkt-section">
      <div className="mkt-section-head">
        <h2>Módulos por rubro</h2>
        <p>
          El mismo CRM, adaptado a tu negocio. Activás solo las herramientas que usás —
          nada de pantallas ni menús que no te sirven.
        </p>
      </div>
      <div className="mkt-modules">
        {MODULES.map((m) => (
          <div key={m.label} className="mkt-feature mkt-module-card">
            <div className="mkt-feature-icon">{m.icon}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-2)' }}>
              <h3>{m.label}</h3>
              <span className="mkt-badge-soon">Próximamente</span>
            </div>
            <p>{m.desc}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

import type { ReactNode } from 'react'

// Datos del titular y fecha de vigencia compartidos por /pdp y /cds.
export const LEGAL = {
  service:      'Plata',
  site:         'plata.studio',
  owner:        'Colonia Cloud',
  ownerPerson:  'Garrido Hernandez J. Manuel',
  rut:          '221002530010',
  country:      'República Oriental del Uruguay',
  contactEmail: 'privacidad@plata.studio',
  updatedAt:    '12 de octubre de 2026',
} as const

export function LegalPage({ title, intro, children }: { title: string; intro: ReactNode; children: ReactNode }) {
  return (
    <section className="mkt-section">
      <article className="mkt-legal">
        <h1>{title}</h1>
        <p className="mkt-legal-meta">Última actualización: {LEGAL.updatedAt}</p>
        <div className="mkt-legal-intro">{intro}</div>
        {children}
      </article>
    </section>
  )
}

export function ContactEmail() {
  return <a href={`mailto:${LEGAL.contactEmail}`}>{LEGAL.contactEmail}</a>
}

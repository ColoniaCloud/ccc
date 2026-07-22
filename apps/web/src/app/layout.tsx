import type { Metadata } from 'next'
import '../styles/theme.css'
import './globals.css'

// Dominio público de la landing — necesario para que Next resuelva a URL
// absoluta las imágenes de Open Graph (los scrapers de WhatsApp, X, LinkedIn
// no siguen rutas relativas). En Render se setea NEXT_PUBLIC_SITE_URL.
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://colonia.cloud'

const TITLE = 'Plata — CRM para equipos de venta en LATAM'
const DESCRIPTION =
  'Contactos, pipeline visual y tareas en un solo lugar. Armá tu organización en menos de un minuto y empezá a vender.'

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'Plata',
    template: '%s · Plata',
  },
  description: 'Plata — CRM SaaS para Latinoamérica',
  icons: {
    icon: [{ url: '/icon.svg', type: 'image/svg+xml' }],
    apple: '/icon.svg',
  },
  openGraph: {
    type: 'website',
    siteName: 'Plata',
    locale: 'es_UY',
    url: SITE_URL,
    title: TITLE,
    description: DESCRIPTION,
    images: [{ url: '/opengraph-image.png', width: 1200, height: 630, alt: TITLE }],
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: DESCRIPTION,
    images: ['/opengraph-image.png'],
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  )
}

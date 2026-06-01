import type { Metadata } from 'next'
import '../styles/theme.css'
import './globals.css'

export const metadata: Metadata = {
  title: 'CRM',
  description: 'CRM SaaS para Latinoamérica',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  )
}

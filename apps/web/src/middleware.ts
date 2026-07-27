import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Dominios que muestran la web pública (landing) en vez de la app.
// Todavía no está definido el dominio final del producto, así que esto
// vive en una env var — sin configurar, estos paths siguen yendo directo
// al login/404 como hasta ahora (comportamiento actual sin cambios).
// Se tolera que la env var venga con protocolo o slash final (error común
// al pegar la URL completa desde el navegador) — se normaliza acá.
const MARKETING_HOSTS = (process.env.MARKETING_HOSTS ?? '')
  .split(',')
  .map((host) => host.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/+$/, ''))
  .filter(Boolean)

// URL pública limpia (en el dominio de marketing) → archivo real bajo /marketing.
const MARKETING_PATHS: Record<string, string> = {
  '/':             '/marketing',
  '/herramientas': '/marketing/herramientas',
  '/modulos':      '/marketing/modulos',
  '/precios':      '/marketing/precios',
  '/contacto':     '/marketing/contacto',
}

export function middleware(request: NextRequest) {
  const host       = (request.headers.get('host') ?? '').toLowerCase()
  const isMarketing = MARKETING_HOSTS.includes(host)

  // El panel de administración es de la app, no de la web pública: en el
  // dominio de marketing no tiene por qué existir (ahí ni siquiera hay
  // sesión, así que solo redirigiría al login). Se manda a la landing.
  if (isMarketing && request.nextUrl.pathname.startsWith('/admin')) {
    return NextResponse.redirect(new URL('/', request.url))
  }

  const target = MARKETING_PATHS[request.nextUrl.pathname]

  if (target && isMarketing) {
    return NextResponse.rewrite(new URL(target, request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/', '/herramientas', '/modulos', '/precios', '/contacto', '/admin/:path*'],
}

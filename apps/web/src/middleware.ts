import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Dominios que muestran la web pública (landing) en vez de la app.
// Todavía no está definido el dominio final del producto, así que esto
// vive en una env var — sin configurar, "/" sigue yendo directo al login
// como hasta ahora (comportamiento actual sin cambios).
const MARKETING_HOSTS = (process.env.MARKETING_HOSTS ?? '')
  .split(',')
  .map((host) => host.trim())
  .filter(Boolean)

export function middleware(request: NextRequest) {
  const host = (request.headers.get('host') ?? '').toLowerCase()

  if (MARKETING_HOSTS.includes(host) && request.nextUrl.pathname === '/') {
    return NextResponse.rewrite(new URL('/marketing', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: '/',
}

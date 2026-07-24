import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { db } from '../db'
import { user, session, account, verification } from '../db/schema/auth'
import { getAllowedOrigins } from './origins'

if (!process.env.BETTER_AUTH_SECRET) {
  throw new Error('BETTER_AUTH_SECRET no está definida. Verificá apps/api/.env')
}

// En prod, hay dos topologías posibles:
// - Dominios completamente distintos (Render: crm-api-xxxx.onrender.com vs
//   crm-web-xxxx.onrender.com — cada uno en su propio sufijo público, o sea
//   "sitios" distintos para el navegador). Ahí SameSite=Lax (default) nunca
//   reenvía la cookie entre esos dos orígenes — el login responde 200 pero
//   la sesión no queda. Se soluciona con SameSite=None.
// - Subdominios de un mismo dominio propio (ej. api.plata.studio y
//   app.plata.studio, mismo "sitio" para el navegador). Ahí lo correcto es
//   `crossSubDomainCookies` con el dominio raíz — la cookie queda visible en
//   ambos subdominios y SameSite=Lax funciona sin ampliar el alcance de la
//   cookie más de lo necesario.
// COOKIE_DOMAIN sin definir (Render) => comportamiento actual, sin cambios.
const isProduction  = process.env.NODE_ENV === 'production'
const cookieDomain  = process.env.COOKIE_DOMAIN

export const auth = betterAuth({
  secret: process.env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema: { user, session, account, verification },
  }),
  emailAndPassword: {
    enabled: true,
  },
  trustedOrigins: getAllowedOrigins(),
  advanced: isProduction ? {
    defaultCookieAttributes: {
      sameSite: cookieDomain ? 'lax' : 'none',
      secure: true,
    },
    ...(cookieDomain ? {
      crossSubDomainCookies: { enabled: true, domain: cookieDomain },
    } : {}),
  } : undefined,
})

export type Auth = typeof auth

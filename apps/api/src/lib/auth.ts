import { betterAuth } from 'better-auth'
import { APIError } from 'better-auth/api'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { db } from '../db'
import { user, session, account, verification } from '../db/schema/auth'
import { getAllowedOrigins } from './origins'
import { sendEmail } from './email'
import { verificationEmail, resetPasswordEmail, deleteAccountEmail } from './email-templates'
import { planAccountDeletion, deleteTenantIfEmpty } from '../account/deletion-service'
import { withWebCallback } from './web-callback'

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

// Login social: cada proveedor se habilita solo si están sus credenciales,
// así el código puede ir a producción antes de crear las apps OAuth (ver
// documentos/login-social.md). /api/auth-providers le dice a la web cuáles
// mostrar. Meta (Facebook) queda para una etapa posterior.
const socialProviders = {
  ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET ? {
    google: {
      clientId:     process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    },
  } : {}),
  ...(process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET ? {
    microsoft: {
      clientId:     process.env.MICROSOFT_CLIENT_ID,
      clientSecret: process.env.MICROSOFT_CLIENT_SECRET,
      // "common": cuentas de cualquier organización + cuentas personales.
      tenantId:     process.env.MICROSOFT_TENANT_ID ?? 'common',
    },
  } : {}),
}

export const enabledSocialProviders = Object.keys(socialProviders)

// beforeDelete → afterDelete del mismo request: qué organización borrar una
// vez eliminado el usuario.
const pendingTenantDeletions = new Map<string, string[]>()


export const auth = betterAuth({
  secret: process.env.BETTER_AUTH_SECRET,
  // Los links de los correos (verificación, contraseña) apuntan a la API, que
  // valida el token y redirige a la web. Sin baseURL Better Auth lo infiere
  // del request, que detrás de Traefik puede salir con el host interno.
  baseURL: process.env.API_PUBLIC_URL,
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema: { user, session, account, verification },
  }),
  emailAndPassword: {
    enabled: true,
    // Sin email verificado no hay sesión: el registro no inicia sesión y el
    // login responde EMAIL_NOT_VERIFIED (y reenvía el correo, ver sendOnSignIn).
    // Las cuentas previas a esta regla se marcaron verificadas en la migración 0009.
    requireEmailVerification: true,
    resetPasswordTokenExpiresIn: 60 * 60,
    // Cambiar la contraseña cierra las demás sesiones abiertas.
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => {
      await sendEmail(resetPasswordEmail({ to: user.email, url }))
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    sendOnSignIn: true,
    autoSignInAfterVerification: true,
    expiresIn: 60 * 60 * 24,
    sendVerificationEmail: async ({ user, url }) => {
      await sendEmail(verificationEmail({ to: user.email, name: user.name, url: withWebCallback(url) }))
    },
  },
  user: {
    // Eliminar cuenta (Configuración → Mi cuenta). Siempre con confirmación por
    // email, también para cuentas de Google/Microsoft que no tienen contraseña.
    // El link del correo lleva a /auth/delete-account en la web, que pide la
    // confirmación final con la sesión iniciada (el callback de Better Auth
    // exige sesión y responde JSON crudo si algo falla).
    deleteUser: {
      enabled: true,
      deleteTokenExpiresIn: 60 * 60,
      sendDeleteAccountVerification: async ({ user, token }) => {
        const plan = await planAccountDeletion(user.id)
        if (!plan.allowed) {
          throw new APIError('BAD_REQUEST', { message: plan.reason, code: 'ACCOUNT_DELETION_BLOCKED' })
        }
        const webUrl = (process.env.WEB_URL ?? 'http://localhost:3000').replace(/\/+$/, '')
        await sendEmail(deleteAccountEmail({
          to:                  user.email,
          url:                 `${webUrl}/auth/delete-account?token=${encodeURIComponent(token)}`,
          organizationName:    plan.organizationName,
          deletesOrganization: plan.deletesOrganization,
        }))
      },
      // Se vuelve a evaluar al confirmar: entre el pedido y el click pudo
      // haberse activado una suscripción o haber cambiado la organización.
      beforeDelete: async (user) => {
        const plan = await planAccountDeletion(user.id)
        if (!plan.allowed) {
          throw new APIError('BAD_REQUEST', { message: plan.reason, code: 'ACCOUNT_DELETION_BLOCKED' })
        }
        if (plan.tenantIds.length) pendingTenantDeletions.set(user.id, plan.tenantIds)
      },
      // El usuario ya no existe (y sus membresías, sesiones y cuentas se
      // fueron en cascada): recién ahora se borra la organización que quedó vacía.
      afterDelete: async (user) => {
        const tenantIds = pendingTenantDeletions.get(user.id) ?? []
        pendingTenantDeletions.delete(user.id)
        for (const tenantId of tenantIds) await deleteTenantIfEmpty(tenantId)
      },
    },
  },
  socialProviders,
  account: {
    // Entrar con Google usando el email de una cuenta existente la vincula a
    // esa cuenta en vez de fallar o duplicarla. Microsoft queda afuera a
    // propósito: con tenantId "common" el email lo puede definir el admin de
    // cualquier organización de Entra ID ("nOAuth"), así que confiar en él
    // para vincular permitiría tomar cuentas ajenas. Sin vincular, Better
    // Auth corta con error=account_not_linked y la web pide entrar con la
    // contraseña.
    accountLinking: {
      enabled: true,
      trustedProviders: ['google'],
    },
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

import { createAuthClient } from 'better-auth/react'

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001',
})

export const {
  signIn,
  signUp,
  signOut,
  useSession,
  getSession,
  sendVerificationEmail,
  requestPasswordReset,
  resetPassword,
  deleteUser,
} = authClient

/**
 * URL absoluta en la web actual. Los links de los correos y los redirects
 * del login social los resuelve la API (api.plata.studio), así que necesitan
 * saber a qué dominio de la web volver.
 */
export function webUrl(path: string): string {
  return `${window.location.origin}${path}`
}

// Better Auth no lanza excepciones: signIn/signUp devuelven `{ data, error }`.
// Hay que mirar `error` explícitamente; si no, un login fallido sigue de largo
// como si hubiera funcionado y el usuario termina rebotando al login sin ver nada.
const AUTH_ERROR_MESSAGES: Record<string, string> = {
  USER_ALREADY_EXISTS:                   'Ya existe una cuenta con ese email. Iniciá sesión.',
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: 'Ya existe una cuenta con ese email. Iniciá sesión.',
  INVALID_EMAIL_OR_PASSWORD:             'Email o contraseña incorrectos.',
  INVALID_PASSWORD:                      'Email o contraseña incorrectos.',
  INVALID_EMAIL:                         'El email no es válido.',
  PASSWORD_TOO_SHORT:                    'La contraseña tiene que tener al menos 8 caracteres.',
  PASSWORD_TOO_LONG:                     'La contraseña es demasiado larga.',
  EMAIL_NOT_VERIFIED:                    'Tenés que verificar tu email antes de ingresar.',
}

export function authErrorMessage(
  error: { code?: string; message?: string; status?: number } | null | undefined,
  fallback: string,
): string {
  if (!error) return fallback
  const known = error.code ? AUTH_ERROR_MESSAGES[error.code] : undefined
  if (known) return known
  if (error.status === 429) return 'Demasiados intentos. Esperá un minuto y probá de nuevo.'
  return fallback
}

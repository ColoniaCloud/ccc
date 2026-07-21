const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const NAME_MAX = 200
const MESSAGE_MAX = 5000

export type ContactMessageValues = { name: string; email: string; message: string }

type ValidationResult =
  | { valid: true; values: ContactMessageValues }
  | { valid: false; error: string }

/**
 * Valida el body del formulario público de contacto. Sin librería de
 * validación — mismo nivel de chequeo liviano que el resto de la API
 * (required + trim + un regex simple de email).
 */
export function validateContactMessage(body: unknown): ValidationResult {
  const b = (body ?? {}) as Partial<Record<'name' | 'email' | 'message', unknown>>

  const name    = typeof b.name === 'string' ? b.name.trim() : ''
  const email   = typeof b.email === 'string' ? b.email.trim() : ''
  const message = typeof b.message === 'string' ? b.message.trim() : ''

  if (!name) {
    return { valid: false, error: 'El nombre es requerido' }
  }
  if (name.length > NAME_MAX) {
    return { valid: false, error: `El nombre no puede superar los ${NAME_MAX} caracteres` }
  }
  if (!email) {
    return { valid: false, error: 'El email es requerido' }
  }
  if (!EMAIL_RE.test(email)) {
    return { valid: false, error: 'El email no es válido' }
  }
  if (!message) {
    return { valid: false, error: 'El mensaje es requerido' }
  }
  if (message.length > MESSAGE_MAX) {
    return { valid: false, error: `El mensaje no puede superar los ${MESSAGE_MAX} caracteres` }
  }

  return { valid: true, values: { name, email, message } }
}

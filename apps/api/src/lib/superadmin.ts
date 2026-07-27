/**
 * Allowlist de emails con acceso al admin panel. No hay un rol de
 * superadmin en la base de datos todavía — para el alcance actual (una
 * sola persona operando el producto) alcanza con una env var, mismo
 * patrón que ALLOWED_ORIGINS / MARKETING_HOSTS (ver apps/api/src/lib/origins.ts).
 */
export function getSuperAdminEmails(): string[] {
  const raw = process.env.SUPERADMIN_EMAILS ?? ''
  return raw.split(',').map((email) => email.trim().toLowerCase()).filter(Boolean)
}

export function isSuperAdminEmail(email: string): boolean {
  return getSuperAdminEmails().includes(email.trim().toLowerCase())
}

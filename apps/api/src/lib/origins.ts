/**
 * Orígenes del frontend permitidos para CORS y para Better Auth
 * (`trustedOrigins`). Antes había un solo origen (WEB_URL, ej. Render donde
 * web y api viven en dominios `.onrender.com` completamente distintos). Con
 * varios subdominios de un mismo dominio (plata.studio) — la web pública en
 * la raíz y en `www`, la app en `app.` — hace falta una lista.
 *
 * `ALLOWED_ORIGINS` es opcional y va separada por comas; si no está seteada,
 * cae a `WEB_URL` sola (comportamiento actual sin cambios).
 */
export function getAllowedOrigins(): string[] {
  const raw = process.env.ALLOWED_ORIGINS ?? process.env.WEB_URL ?? 'http://localhost:3000'
  return raw.split(',').map((origin) => origin.trim()).filter(Boolean)
}

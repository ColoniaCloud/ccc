/**
 * El reenvío automático del correo de verificación al intentar entrar sin
 * verificar (sendOnSignIn) no recibe callbackURL de la web y Better Auth usa
 * "/", que se resuelve contra la API: el link verificaba pero dejaba al
 * usuario en api.plata.studio/. Si el callback no es una URL absoluta, se
 * manda al onboarding de la web (que redirige a /app si ya está completo).
 */
export function withWebCallback(url: string): string {
  const link     = new URL(url)
  const callback = link.searchParams.get('callbackURL')
  if (!callback || callback.startsWith('/')) {
    const webUrl = (process.env.WEB_URL ?? 'http://localhost:3000').replace(/\/+$/, '')
    const path   = callback && callback !== '/' ? callback : '/onboarding'
    link.searchParams.set('callbackURL', `${webUrl}${path}`)
  }
  return link.toString()
}

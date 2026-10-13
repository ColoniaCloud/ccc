import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'

export const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.app.created'
export function calendarConfig() {
  const separate = Boolean(process.env.GOOGLE_CALENDAR_CLIENT_ID || process.env.GOOGLE_CALENDAR_CLIENT_SECRET)
  const clientId = separate ? process.env.GOOGLE_CALENDAR_CLIENT_ID : process.env.GOOGLE_CLIENT_ID
  const clientSecret = separate ? process.env.GOOGLE_CALENDAR_CLIENT_SECRET : process.env.GOOGLE_CLIENT_SECRET
  const key = process.env.CALENDAR_ENCRYPTION_KEY
  if (!clientId || !clientSecret || !key || !/^[a-f0-9]{64}$/i.test(key)) return null
  const redirectUri = `${(process.env.API_PUBLIC_URL ?? 'http://localhost:3001').replace(/\/$/, '')}/api/calendar/callback`
  return { clientId, clientSecret, redirectUri, key: Buffer.from(key, 'hex') }
}
export function protect(value: string, context: string, key = calendarConfig()?.key) {
  if (!key) throw new Error('Calendar encryption unavailable')
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, iv)
  cipher.setAAD(Buffer.from(context))
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64')
}
export function unprotect(value: string, context: string, key = calendarConfig()?.key) {
  if (!key) throw new Error('Calendar encryption unavailable')
  const bytes = Buffer.from(value, 'base64'), decipher = createDecipheriv('aes-256-gcm', key, bytes.subarray(0, 12))
  decipher.setAAD(Buffer.from(context)); decipher.setAuthTag(bytes.subarray(12, 28))
  return Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString('utf8')
}
export const hash = (value: string) => createHash('sha256').update(value).digest('hex')
export function authorizeUrl(state: string, verifier: string) {
  const config = calendarConfig()!
  return `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({ client_id: config.clientId,
    redirect_uri: config.redirectUri, response_type: 'code', scope: CALENDAR_SCOPE, access_type: 'offline',
    prompt: 'consent', state, code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256' })}`
}
export class GoogleError extends Error {
  constructor(public status: number, public reconnect = false) { super('Google Calendar no pudo completar la operación') }
}
type Transport = typeof fetch
export class GoogleCalendar {
  constructor(private transport: Transport = fetch) {}
  private async token(params: Record<string, string>) {
    const config = calendarConfig()!
    const response = await this.transport('https://oauth2.googleapis.com/token', { method: 'POST', signal: AbortSignal.timeout(15000),
      body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, ...params }) })
    const body = await response.json() as { access_token?: string; refresh_token?: string; scope?: string; error?: string }
    if (!response.ok || !body.access_token) throw new GoogleError(response.status, body.error === 'invalid_grant')
    return body as typeof body & { access_token: string }
  }
  async exchange(code: string, verifier: string) {
    return this.token({ code, code_verifier: verifier, redirect_uri: calendarConfig()!.redirectUri, grant_type: 'authorization_code' })
  }
  async refresh(refreshToken: string) { return this.token({ refresh_token: refreshToken, grant_type: 'refresh_token' }) }
  private async request(token: string, path: string, method: string, body?: unknown) {
    const response = await this.transport(`https://www.googleapis.com/calendar/v3/${path}`, { method, signal: AbortSignal.timeout(15000),
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) })
    return response
  }
  async createCalendar(token: string, name: string) {
    const response = await this.request(token, 'calendars', 'POST', { summary: `Plata · ${name}`, timeZone: 'America/Montevideo', description: 'Citas asignadas desde Plata. Los cambios se realizan en el CRM.' })
    if (!response.ok) throw new GoogleError(response.status, response.status === 401 || response.status === 403)
    const body = await response.json() as { id?: string }
    if (!body.id) throw new GoogleError(502)
    return body.id
  }
  async saveEvent(token: string, calendarId: string, eventId: string, body: unknown) {
    const base = `calendars/${encodeURIComponent(calendarId)}/events`
    const patch = await this.request(token, `${base}/${eventId}?sendUpdates=none`, 'PATCH', body)
    if (patch.ok) return
    if (patch.status !== 404) throw new GoogleError(patch.status, [401,403].includes(patch.status))
    const insert = await this.request(token, `${base}?sendUpdates=none`, 'POST', { ...(body as object), id: eventId })
    if (insert.ok) return
    // Una respuesta perdida al insertar no debe duplicar citas.
    if (insert.status === 409) {
      const retry = await this.request(token, `${base}/${eventId}?sendUpdates=none`, 'PATCH', body)
      if (retry.ok) return
      throw new GoogleError(retry.status, [401,403].includes(retry.status))
    }
    throw new GoogleError(insert.status, [401,403,404].includes(insert.status))
  }
  async deleteEvent(token: string, calendarId: string, eventId: string) {
    const response = await this.request(token, `calendars/${encodeURIComponent(calendarId)}/events/${eventId}?sendUpdates=none`, 'DELETE')
    if (!response.ok && ![404,410].includes(response.status)) throw new GoogleError(response.status, [401,403].includes(response.status))
  }
}

export type EventAppointment = { id: string; scheduledAt: Date; durationMinutes: number; kind: string; propertyTitle: string | null; vehicleTitle: string | null; propertyId: string | null; vehicleId: string | null }
export function eventBody(item: EventAppointment, slug: string) {
  const web = (process.env.WEB_URL ?? 'http://localhost:3000').replace(/\/$/, '')
  // El calendario externo no recibe notas, datos del contacto ni su email/teléfono.
  return { summary: `${item.kind === 'property_visit' ? 'Visita' : 'Prueba de manejo'} · ${item.propertyTitle ?? item.vehicleTitle ?? 'Plata'}`,
    start: { dateTime: item.scheduledAt.toISOString() }, end: { dateTime: new Date(item.scheduledAt.getTime() + item.durationMinutes * 60000).toISOString() },
    description: `Gestioná esta cita en Plata: ${web}/app/${item.propertyId ? 'properties' : 'vehicles'}/${item.propertyId ?? item.vehicleId}?organization=${encodeURIComponent(slug)}`,
    visibility: 'private' }
}
export const eventId = (appointmentId: string, generation: number) => `p${appointmentId.replace(/-/g, '')}g${generation.toString(16)}`

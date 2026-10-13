import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GoogleCalendar, GoogleError, CALENDAR_SCOPE, calendarConfig } from '../google'

beforeEach(() => { vi.stubEnv('GOOGLE_CALENDAR_CLIENT_ID', 'client'); vi.stubEnv('GOOGLE_CALENDAR_CLIENT_SECRET', 'secret'); vi.stubEnv('CALENDAR_ENCRYPTION_KEY', 'ab'.repeat(32)) })
afterEach(() => { vi.unstubAllEnvs() })
const response = (status: number, body: unknown = {}) => new Response(status === 204 ? null : JSON.stringify(body), { status })
describe('contrato HTTP de Google Calendar', () => {
  it('intercambia código con PKCE y obtiene permisos concedidos sin exponer secretos', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response(200, { access_token: 'access', refresh_token: 'refresh', scope: CALENDAR_SCOPE }))
    const google = new GoogleCalendar(fetcher)
    await google.exchange('code', 'verifier')
    const params = fetcher.mock.calls[0]![1]!.body as URLSearchParams
    expect(params.get('grant_type')).toBe('authorization_code'); expect(params.get('code_verifier')).toBe('verifier')
    expect(params.get('redirect_uri')).toContain('/api/calendar/callback')
    fetcher.mockResolvedValueOnce(response(400, { error: 'invalid_grant', error_description: 'private provider details' }))
    await expect(google.refresh('refresh')).rejects.toMatchObject({ reconnect: true, message: 'Google Calendar no pudo completar la operación' })
  })
  it('actualiza por id, crea si falta y recupera un insert anterior sin duplicar', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(response(404)).mockResolvedValueOnce(response(409)).mockResolvedValueOnce(response(200))
    await new GoogleCalendar(fetcher).saveEvent('access', 'calendar@example.com', 'pabc123', { summary: 'Visita' })
    expect(fetcher.mock.calls.map((call) => call[1]?.method)).toEqual(['PATCH','POST','PATCH'])
    expect(JSON.parse(fetcher.mock.calls[1]![1]!.body as string).id).toBe('pabc123')
    expect(fetcher.mock.calls.every((call) => String(call[0]).includes('sendUpdates=none'))).toBe(true)
  })
  it('borrados repetidos son idempotentes; errores temporales no revocan conexión', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(response(410)).mockResolvedValueOnce(response(503))
    const google = new GoogleCalendar(fetcher)
    await google.deleteEvent('access', 'calendar', 'id')
    await expect(google.deleteEvent('access', 'calendar', 'id')).rejects.toMatchObject({ status: 503, reconnect: false })
  })
  it('un evento eliminado permanentemente admite regenerar id; un calendario eliminado requiere reconectar', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(response(410)).mockResolvedValueOnce(response(404)).mockResolvedValueOnce(response(404))
    const google = new GoogleCalendar(fetcher)
    await expect(google.saveEvent('access','calendar','id',{})).rejects.toMatchObject({ status: 410, reconnect: false })
    await expect(google.saveEvent('access','calendar','id',{})).rejects.toMatchObject({ status: 404, reconnect: true })
  })
  it('usa calendario secundario con nombre y zona de Uruguay; no permite respuesta sin id', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(response(200, { id: 'created' })).mockResolvedValueOnce(response(200))
    const google = new GoogleCalendar(fetcher)
    expect(await google.createCalendar('access','Empresa')).toBe('created')
    expect(JSON.parse(fetcher.mock.calls[0]![1]!.body as string)).toMatchObject({ summary: 'Plata · Empresa', timeZone: 'America/Montevideo' })
    await expect(google.createCalendar('access','Empresa')).rejects.toBeInstanceOf(GoogleError)
  })
  it('admite cliente de login y rechaza una configuración parcial de cliente propio', () => {
    vi.stubEnv('GOOGLE_CALENDAR_CLIENT_ID',''); vi.stubEnv('GOOGLE_CALENDAR_CLIENT_SECRET',''); vi.stubEnv('GOOGLE_CLIENT_ID','login'); vi.stubEnv('GOOGLE_CLIENT_SECRET','login-secret')
    expect(calendarConfig()?.clientId).toBe('login')
    vi.stubEnv('GOOGLE_CALENDAR_CLIENT_ID','partial'); expect(calendarConfig()).toBeNull()
    vi.stubEnv('GOOGLE_CALENDAR_CLIENT_SECRET','secret'); vi.stubEnv('CALENDAR_ENCRYPTION_KEY','weak'); expect(calendarConfig()).toBeNull()
  })
})

import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { authMiddleware } from '../middleware/auth'
import { organizationService } from '../organizations/service'
import { INVITABLE_ROLES, validateInvitation } from '../organizations/policy'
import type { InvitableRole } from '@crm/shared'
import type { HonoVariables } from '../types'
import { sendEmail } from '../lib/email'
import { organizationInvitationEmail } from '../lib/email-templates'

const organizationsRoutes = new Hono<{ Variables: HonoVariables }>()
organizationsRoutes.use('*', authMiddleware)
organizationsRoutes.use('*', async (c, next) => { c.header('Cache-Control', 'no-store'); await next() })

function validId(id: string) {
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id)) {
    throw new HTTPException(400, { message: 'Identificador inválido' })
  }
  return id
}

organizationsRoutes.get('/', async (c) => c.json({ status: 'ok', items: await organizationService.list(c.get('user').id) }))
organizationsRoutes.get('/invitations', async (c) => c.json({ status: 'ok', items: await organizationService.pendingFor(c.get('user')) }))
organizationsRoutes.post('/invitations/:id/accept', async (c) =>
  c.json({ status: 'ok', ...await organizationService.acceptPending(c.get('user'), validId(c.req.param('id'))) }))
organizationsRoutes.post('/invitations/preview', async (c) => {
  const body = await c.req.json().catch(() => null) as { token?: unknown } | null
  if (typeof body?.token !== 'string') throw new HTTPException(400, { message: 'Falta el código de invitación' })
  c.header('Cache-Control', 'no-store')
  return c.json({ status: 'ok', ...await organizationService.invitation(c.get('user'), body.token, false) })
})
organizationsRoutes.post('/invitations/accept', async (c) => {
  const body = await c.req.json().catch(() => null) as { token?: unknown } | null
  if (typeof body?.token !== 'string') throw new HTTPException(400, { message: 'Falta el código de invitación' })
  return c.json({ status: 'ok', ...await organizationService.invitation(c.get('user'), body.token, true) })
})

organizationsRoutes.get('/:slug/team', async (c) =>
  c.json({ status: 'ok', ...await organizationService.team(c.get('user').id, c.req.param('slug')) }))

organizationsRoutes.post('/:slug/invitations', async (c) => {
  const input = validateInvitation(await c.req.json().catch(() => null))
  if (!input) throw new HTTPException(400, { message: 'Ingresá un email válido y elegí un rol' })
  const invitation = await organizationService.invite(c.get('user').id, c.req.param('slug'), input.email, input.role)
  const webUrl = (process.env.WEB_URL ?? 'http://localhost:3000').replace(/\/+$/, '')
  // La transacción ya terminó: no retenemos locks/conexiones mientras Resend responde.
  try {
    await sendEmail(organizationInvitationEmail({ to: input.email, organizationName: invitation.organizationName,
      inviterName: c.get('user').name, url: `${webUrl}/auth/invitation#token=${invitation.token}` }))
    await organizationService.markDelivered(invitation.id)
  } catch {
    throw new HTTPException(502, { message: 'No se pudo enviar la invitación. Volvé a invitar para generar un nuevo correo' })
  }
  return c.json({ status: 'ok' }, 201)
})

organizationsRoutes.delete('/:slug/invitations/:id', async (c) => {
  await organizationService.revoke(c.get('user').id, c.req.param('slug'), validId(c.req.param('id')))
  return c.json({ status: 'ok' })
})
organizationsRoutes.patch('/:slug/members/:id', async (c) => {
  const body = await c.req.json().catch(() => null) as { role?: string } | null
  if (!INVITABLE_ROLES.includes(body?.role as InvitableRole)) throw new HTTPException(400, { message: 'Rol inválido' })
  await organizationService.changeRole(c.get('user').id, c.req.param('slug'), validId(c.req.param('id')), body!.role as InvitableRole)
  return c.json({ status: 'ok' })
})
organizationsRoutes.delete('/:slug/members/:id', async (c) => {
  await organizationService.remove(c.get('user').id, c.req.param('slug'), validId(c.req.param('id')))
  return c.json({ status: 'ok' })
})
organizationsRoutes.post('/:slug/members/:id/ownership', async (c) => {
  await organizationService.transfer(c.get('user').id, c.req.param('slug'), validId(c.req.param('id')))
  return c.json({ status: 'ok' })
})

export { organizationsRoutes }

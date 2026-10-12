import { and, asc, eq, gt, isNull, sql, type SQL } from 'drizzle-orm'
import { HTTPException } from 'hono/http-exception'
import type { InvitableRole, UserRole } from '@crm/shared'
import { db } from '../db'
import { members, tenants, organizationInvitations, user } from '../db/schema'
import { canAssignRole, canManageMember, canManageOrganization, invitationError, invitationTokenHash,
  INVITATION_LIFETIME_MS, newInvitationToken } from './policy'

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0]
type Actor = { id: string; email: string; emailVerified: boolean }
type Member = typeof members.$inferSelect
type Organization = typeof tenants.$inferSelect

/** Identity/team operations intentionally use the owner connection: they resolve
 * memberships before a tenant context exists. Every scoped operation authorizes
 * inside a transaction, locking the organization before changing its team. CRM
 * data continues to use tenantMiddleware and the separate RLS connection. */
export class OrganizationService {
  constructor(private readonly database: typeof db) {}

  async list(userId: string) {
    return this.database.select({ id: tenants.id, name: tenants.name, slug: tenants.slug,
      plan: tenants.plan, status: tenants.status, role: members.role })
      .from(members).innerJoin(tenants, eq(members.tenantId, tenants.id))
      .where(eq(members.userId, userId)).orderBy(asc(members.createdAt), asc(members.id))
  }

  async pendingFor(actor: Actor) {
    if (!actor.emailVerified) throw new HTTPException(403, { message: 'Verificá tu email antes de ver tus invitaciones' })
    return this.database.select({ id: organizationInvitations.id, role: organizationInvitations.role,
      email: organizationInvitations.email, accepted: sql<boolean>`false`, tenant: { id: tenants.id, name: tenants.name, slug: tenants.slug } })
      .from(organizationInvitations).innerJoin(tenants, eq(organizationInvitations.tenantId, tenants.id))
      .where(and(eq(organizationInvitations.email, actor.email.trim().toLowerCase()),
        eq(tenants.status, 'active'), isNull(organizationInvitations.acceptedAt), isNull(organizationInvitations.revokedAt),
        gt(organizationInvitations.expiresAt, new Date()))).orderBy(asc(organizationInvitations.createdAt))
  }

  private async scoped<T>(actorId: string, slug: string,
    action: (tx: Transaction, organization: Organization, actor: Member) => Promise<T>) {
    return this.database.transaction(async (tx) => {
      const [organization] = await tx.select().from(tenants).where(eq(tenants.slug, slug)).for('update')
      if (!organization) throw new HTTPException(404, { message: 'Organización no encontrada' })
      const [actor] = await tx.select().from(members)
        .where(and(eq(members.tenantId, organization.id), eq(members.userId, actorId))).for('update')
      if (!actor) throw new HTTPException(403, { message: 'No tenés acceso a esta organización' })
      if (organization.status !== 'active') throw new HTTPException(403, { message: 'Esta organización está suspendida' })
      return action(tx, organization, actor)
    })
  }

  async team(actorId: string, slug: string) {
    return this.scoped(actorId, slug, async (tx, organization, actor) => {
      const items = await tx.select({ id: members.id, userId: members.userId, role: members.role,
        name: user.name, email: user.email, createdAt: members.createdAt })
        .from(members).innerJoin(user, eq(members.userId, user.id))
        .where(eq(members.tenantId, organization.id)).orderBy(asc(members.createdAt), asc(members.id))
      const invitations = canManageOrganization(actor.role)
        ? await tx.select({ id: organizationInvitations.id, email: organizationInvitations.email,
          role: organizationInvitations.role, expiresAt: organizationInvitations.expiresAt,
          deliveredAt: organizationInvitations.deliveredAt })
          .from(organizationInvitations).where(and(eq(organizationInvitations.tenantId, organization.id),
            isNull(organizationInvitations.acceptedAt), isNull(organizationInvitations.revokedAt)))
          .orderBy(asc(organizationInvitations.createdAt))
        : []
      return { items, invitations }
    })
  }

  async invite(actorId: string, slug: string, email: string, role: InvitableRole) {
    return this.scoped(actorId, slug, async (tx, organization, actor) => {
      if (!canAssignRole(actor.role, role)) throw new HTTPException(403, { message: 'No podés invitar con ese rol' })
      const existing = await tx.select({ id: members.id }).from(members)
        .innerJoin(user, eq(members.userId, user.id))
        .where(and(eq(members.tenantId, organization.id), sql`lower(${user.email}) = ${email}`))
      if (existing.length) throw new HTTPException(409, { message: 'Este usuario ya pertenece a la organización' })
      const pending = await tx.query.organizationInvitations.findFirst({ where: and(
        eq(organizationInvitations.tenantId, organization.id), eq(organizationInvitations.email, email),
        isNull(organizationInvitations.acceptedAt), isNull(organizationInvitations.revokedAt)) })
      if (pending && !canAssignRole(actor.role, pending.role)) {
        throw new HTTPException(403, { message: 'Solo el propietario puede reemplazar esta invitación' })
      }
      // Una nueva invitación reemplaza también las vencidas; el link anterior deja de servir.
      await tx.update(organizationInvitations).set({ revokedAt: new Date() }).where(and(
        eq(organizationInvitations.tenantId, organization.id), eq(organizationInvitations.email, email),
        isNull(organizationInvitations.acceptedAt), isNull(organizationInvitations.revokedAt)))
      const { token, tokenHash } = newInvitationToken()
      const [invitation] = await tx.insert(organizationInvitations).values({ tenantId: organization.id,
        email, role, tokenHash, invitedBy: actorId, expiresAt: new Date(Date.now() + INVITATION_LIFETIME_MS) }).returning()
      return { id: invitation!.id, token, organizationName: organization.name }
    })
  }

  async markDelivered(id: string) {
    await this.database.update(organizationInvitations).set({ deliveredAt: new Date() })
      .where(eq(organizationInvitations.id, id))
  }

  async revoke(actorId: string, slug: string, id: string) {
    return this.scoped(actorId, slug, async (tx, organization, actor) => {
      const invitation = await tx.query.organizationInvitations.findFirst({ where: and(
        eq(organizationInvitations.id, id), eq(organizationInvitations.tenantId, organization.id)) })
      if (!invitation) throw new HTTPException(404, { message: 'Invitación no encontrada' })
      if (!canAssignRole(actor.role, invitation.role)) throw new HTTPException(403, { message: 'No podés cancelar esta invitación' })
      if (invitation.acceptedAt) throw new HTTPException(409, { message: 'La invitación ya fue aceptada' })
      await tx.update(organizationInvitations).set({ revokedAt: new Date() }).where(eq(organizationInvitations.id, id))
    })
  }

  async invitation(actor: Actor, token: string, accept: boolean) {
    const hash = invitationTokenHash(token)
    if (!hash) throw new HTTPException(404, { message: 'Invitación no encontrada' })
    return this.resolveInvitation(actor, eq(organizationInvitations.tokenHash, hash), accept)
  }

  async acceptPending(actor: Actor, id: string) {
    // Con sesión/email verificado, el destinatario puede recuperar invitaciones
    // incluso si abrió el correo de verificación en otra pestaña/dispositivo.
    return this.resolveInvitation(actor, eq(organizationInvitations.id, id), true)
  }

  private async resolveInvitation(actor: Actor, condition: SQL, accept: boolean) {
    return this.database.transaction(async (tx) => {
      // El orden de locks es siempre organización → invitación → membresía.
      const found = await tx.query.organizationInvitations.findFirst({ where: condition })
      if (!found) throw new HTTPException(404, { message: 'Invitación no encontrada' })
      const [organization] = await tx.select().from(tenants).where(eq(tenants.id, found.tenantId)).for('update')
      if (!organization || organization.status !== 'active') {
        throw new HTTPException(403, { message: 'Esta organización no está disponible' })
      }
      const [invitation] = await tx.select().from(organizationInvitations)
        .where(eq(organizationInvitations.id, found.id)).for('update')
      if (!invitation) throw new HTTPException(404, { message: 'Invitación no encontrada' })
      const error = invitationError(invitation, actor)
      if (error) throw new HTTPException(403, { message: error })
      const existing = await tx.query.members.findFirst({ where: and(
        eq(members.tenantId, organization.id), eq(members.userId, actor.id)) })
      if (invitation.acceptedAt && !existing) throw new HTTPException(409, { message: 'Ya no pertenecés a esta organización. Pedí otra invitación' })
      if (accept && !invitation.acceptedAt) {
        // Una invitación jamás cambia el rol de alguien que ya es miembro.
        if (!existing) await tx.insert(members).values({ userId: actor.id, tenantId: organization.id, role: invitation.role })
        await tx.update(organizationInvitations).set({ acceptedAt: new Date(), acceptedBy: actor.id })
          .where(eq(organizationInvitations.id, invitation.id))
      }
      return { tenant: { id: organization.id, name: organization.name, slug: organization.slug },
        email: invitation.email, role: existing?.role ?? invitation.role, accepted: accept || Boolean(invitation.acceptedAt) }
    })
  }

  async changeRole(actorId: string, slug: string, id: string, role: InvitableRole) {
    return this.scoped(actorId, slug, async (tx, organization, actor) => {
      const target = await tx.query.members.findFirst({ where: and(eq(members.id, id), eq(members.tenantId, organization.id)) })
      if (!target) throw new HTTPException(404, { message: 'Miembro no encontrado' })
      if (!canManageMember(actor.role, target.role) || !canAssignRole(actor.role, role)) {
        throw new HTTPException(403, { message: 'No podés cambiar este rol. La propiedad se transfiere por separado' })
      }
      await tx.update(members).set({ role }).where(eq(members.id, id))
    })
  }

  async remove(actorId: string, slug: string, id: string) {
    return this.scoped(actorId, slug, async (tx, organization, actor) => {
      const target = await tx.query.members.findFirst({ where: and(eq(members.id, id), eq(members.tenantId, organization.id)) })
      if (!target) throw new HTTPException(404, { message: 'Miembro no encontrado' })
      if (target.role === 'owner') throw new HTTPException(409, { message: 'Transferí la propiedad antes de salir de la organización' })
      if (target.userId !== actorId && !canManageMember(actor.role, target.role)) {
        throw new HTTPException(403, { message: 'No podés quitar este miembro' })
      }
      await tx.delete(members).where(eq(members.id, id))
    })
  }

  async transfer(actorId: string, slug: string, id: string) {
    return this.scoped(actorId, slug, async (tx, organization, actor) => {
      if (actor.role !== 'owner') throw new HTTPException(403, { message: 'Solo el propietario puede transferir la organización' })
      const target = await tx.query.members.findFirst({ where: and(eq(members.id, id), eq(members.tenantId, organization.id)) })
      if (!target || target.id === actor.id) throw new HTTPException(400, { message: 'Elegí otro miembro de esta organización' })
      await tx.update(members).set({ role: 'admin' }).where(eq(members.id, actor.id))
      await tx.update(members).set({ role: 'owner' }).where(eq(members.id, target.id))
    })
  }
}

export const organizationService = new OrganizationService(db)

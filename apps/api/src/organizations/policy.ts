import { createHash, randomBytes } from 'node:crypto'
import type { InvitableRole, UserRole } from '@crm/shared'

export const INVITABLE_ROLES: readonly InvitableRole[] = ['admin', 'manager', 'seller', 'support']
export const INVITATION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000

export function canManageOrganization(role: string): boolean {
  return role === 'owner' || role === 'admin'
}

export function canAssignRole(actor: UserRole, role: InvitableRole): boolean {
  return actor === 'owner' || (actor === 'admin' && role !== 'admin')
}

export function canManageMember(actor: UserRole, target: UserRole): boolean {
  return target !== 'owner' && (actor === 'owner' || (actor === 'admin' && target !== 'admin'))
}

export function validateInvitation(body: unknown): { email: string; role: InvitableRole } | null {
  if (!body || typeof body !== 'object') return null
  const { email, role } = body as Record<string, unknown>
  if (typeof email !== 'string' || typeof role !== 'string') return null
  const normalized = email.trim().toLowerCase()
  if (normalized.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) return null
  if (!INVITABLE_ROLES.includes(role as InvitableRole)) return null
  return { email: normalized, role: role as InvitableRole }
}

export function invitationTokenHash(token: string): string | null {
  return /^[a-f0-9]{64}$/.test(token) ? createHash('sha256').update(token).digest('hex') : null
}

export function newInvitationToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString('hex')
  return { token, tokenHash: invitationTokenHash(token)! }
}

export function invitationError(
  invitation: { email: string; expiresAt: Date; revokedAt: Date | null; acceptedAt: Date | null; acceptedBy: string | null },
  actor: { id: string; email: string; emailVerified: boolean },
  now = new Date(),
): string | null {
  if (!actor.emailVerified) return 'Verificá tu email antes de aceptar la invitación'
  if (invitation.email !== actor.email.trim().toLowerCase()) return 'Ingresá con el email al que se envió la invitación'
  if (invitation.revokedAt) return 'Esta invitación fue cancelada'
  // Un reintento del mismo destinatario es idempotente, incluso tras vencer.
  if (invitation.acceptedAt) return invitation.acceptedBy === actor.id ? null : 'Esta invitación ya fue utilizada'
  if (invitation.expiresAt.getTime() <= now.getTime()) return 'Esta invitación venció. Pedí una nueva al administrador'
  return null
}

import { sql } from 'drizzle-orm'
import { pgTable, text, timestamp, uuid, uniqueIndex, index, check } from 'drizzle-orm/pg-core'
import type { InvitableRole } from '@crm/shared'
import { tenants } from './tenants'
import { user } from './auth'

export const organizationInvitations = pgTable('organization_invitations', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  email: text('email').notNull(),
  role: text('role').notNull().$type<InvitableRole>(),
  tokenHash: text('token_hash').notNull().unique(),
  invitedBy: text('invited_by').references(() => user.id, { onDelete: 'set null' }),
  expiresAt: timestamp('expires_at').notNull(),
  acceptedAt: timestamp('accepted_at'),
  acceptedBy: text('accepted_by').references(() => user.id, { onDelete: 'set null' }),
  revokedAt: timestamp('revoked_at'),
  deliveredAt: timestamp('delivered_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  tenantIndex: index('organization_invitations_tenant_idx').on(table.tenantId),
  pendingEmail: uniqueIndex('organization_invitations_pending_email').on(table.tenantId, table.email)
    .where(sql`${table.acceptedAt} is null and ${table.revokedAt} is null`),
  validRole: check('organization_invitations_valid_role', sql`${table.role} in ('admin', 'manager', 'seller', 'support')`),
}))

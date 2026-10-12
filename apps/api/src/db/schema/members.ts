import { pgTable, text, timestamp, uuid, unique, uniqueIndex, check } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { user } from './auth'
import { tenants } from './tenants'
import type { UserRole } from '@crm/shared'

export const members = pgTable('members', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  role: text('role').notNull().default('seller').$type<UserRole>(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  userTenantUnique: unique().on(table.userId, table.tenantId),
  ownerUnique: uniqueIndex('members_one_owner_per_tenant').on(table.tenantId).where(sql`${table.role} = 'owner'`),
  validRole: check('members_valid_role', sql`${table.role} in ('owner', 'admin', 'manager', 'seller', 'support')`),
}))

export type Member = typeof members.$inferSelect
export type MemberInsert = typeof members.$inferInsert

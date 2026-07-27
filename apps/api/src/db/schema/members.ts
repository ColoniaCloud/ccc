import { pgTable, text, timestamp, uuid, unique } from 'drizzle-orm/pg-core'
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
  // Un usuario pertenece a una sola organización (decisión 2026-07-26,
  // ver DECISIONS.md) — antes el unique era compuesto (userId, tenantId),
  // lo que en teoría permitía múltiples memberships por usuario aunque
  // el onboarding ya lo bloqueaba en código. Esto lo hace una garantía
  // real de la base de datos, no solo de la capa de aplicación.
  userUnique: unique().on(table.userId),
}))

export type Member = typeof members.$inferSelect
export type MemberInsert = typeof members.$inferInsert

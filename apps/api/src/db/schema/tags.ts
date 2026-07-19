import { pgTable, text, timestamp, uuid, unique } from 'drizzle-orm/pg-core'
import { tenants } from './tenants'

export const tags = pgTable('tags', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  color: text('color'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  tenantNameUnique: unique().on(table.tenantId, table.name),
}))

export type Tag = typeof tags.$inferSelect
export type TagInsert = typeof tags.$inferInsert

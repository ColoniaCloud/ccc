import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import type { Plan, Locale } from '@crm/shared'

export const tenants = pgTable('tenants', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  plan: text('plan').notNull().default('free').$type<Plan>(),
  locale: text('locale').notNull().default('es-UY').$type<Locale>(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

export type Tenant = typeof tenants.$inferSelect
export type TenantInsert = typeof tenants.$inferInsert

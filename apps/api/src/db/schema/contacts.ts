import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { tenants } from './tenants'
import type { ContactStatus } from '@crm/shared'

export const contacts = pgTable('contacts', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  email: text('email'),
  phone: text('phone'),
  companyName: text('company_name'),
  status: text('status').notNull().default('lead').$type<ContactStatus>(),
  notes: text('notes'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

export type Contact = typeof contacts.$inferSelect
export type ContactInsert = typeof contacts.$inferInsert

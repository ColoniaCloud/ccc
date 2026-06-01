import { pgTable, text, timestamp, uuid, boolean } from 'drizzle-orm/pg-core'
import { tenants } from './tenants'
import { contacts } from './contacts'
import { deals } from './deals'
import { members } from './members'

export const tasks = pgTable('tasks', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  contactId: uuid('contact_id').references(() => contacts.id, { onDelete: 'set null' }),
  dealId: uuid('deal_id').references(() => deals.id, { onDelete: 'set null' }),
  assignedTo: uuid('assigned_to').references(() => members.id, { onDelete: 'set null' }),
  title: text('title').notNull(),
  description: text('description'),
  dueDate: timestamp('due_date'),
  done: boolean('done').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

export type Task = typeof tasks.$inferSelect
export type TaskInsert = typeof tasks.$inferInsert

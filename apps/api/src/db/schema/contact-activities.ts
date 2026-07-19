import { pgTable, text, timestamp, uuid, jsonb } from 'drizzle-orm/pg-core'
import { tenants } from './tenants'
import { contacts } from './contacts'
import { members } from './members'

export type ActivityType = 'note' | 'status_change' | 'created' | 'updated'

export const contactActivities = pgTable('contact_activities', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  contactId: uuid('contact_id').notNull().references(() => contacts.id, { onDelete: 'cascade' }),
  memberId: uuid('member_id').references(() => members.id, { onDelete: 'set null' }),
  type: text('type').notNull().$type<ActivityType>(),
  content: text('content'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

export type ContactActivity = typeof contactActivities.$inferSelect
export type ContactActivityInsert = typeof contactActivities.$inferInsert

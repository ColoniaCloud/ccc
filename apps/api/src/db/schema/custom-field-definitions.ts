import { pgTable, text, timestamp, uuid, jsonb, boolean, integer, unique } from 'drizzle-orm/pg-core'
import { tenants } from './tenants'
import type { CustomFieldType, CustomFieldEntityType } from '@crm/shared'

export const customFieldDefinitions = pgTable('custom_field_definitions', {
  id:         uuid('id').primaryKey().defaultRandom(),
  tenantId:   uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  entityType: text('entity_type').notNull().$type<CustomFieldEntityType>(),
  key:        text('key').notNull(),
  label:      text('label').notNull(),
  fieldType:  text('field_type').notNull().$type<CustomFieldType>(),
  options:    jsonb('options').$type<string[]>(),
  required:   boolean('required').notNull().default(false),
  position:   integer('position').notNull().default(0),
  createdAt:  timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  tenantEntityKeyUnique: unique().on(table.tenantId, table.entityType, table.key),
}))

export type CustomFieldDefinition = typeof customFieldDefinitions.$inferSelect
export type CustomFieldDefinitionInsert = typeof customFieldDefinitions.$inferInsert

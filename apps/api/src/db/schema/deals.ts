import { pgTable, text, timestamp, uuid, numeric, check, foreignKey } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { tenants } from './tenants'
import { pipelines, pipelineStages } from './pipelines'
import { contacts } from './contacts'
import { members } from './members'
import { properties, vehicles } from './catalogs'
import type { DealCurrency } from '@crm/shared'

export const deals = pgTable('deals', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  pipelineId: uuid('pipeline_id').notNull().references(() => pipelines.id),
  stageId: uuid('stage_id').notNull().references(() => pipelineStages.id),
  contactId: uuid('contact_id').references(() => contacts.id, { onDelete: 'set null' }),
  assignedTo: uuid('assigned_to').references(() => members.id, { onDelete: 'set null' }),
  propertyId: uuid('property_id'),
  vehicleId: uuid('vehicle_id'),
  title: text('title').notNull(),
  value: numeric('value', { precision: 12, scale: 2 }).default('0'),
  currency: text('currency').notNull().default('USD').$type<DealCurrency>(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  oneAsset: check('deals_one_catalog_item', sql`${table.propertyId} is null or ${table.vehicleId} is null`),
  propertyTenant: foreignKey({ name: 'deals_property_tenant_fk', columns: [table.tenantId, table.propertyId], foreignColumns: [properties.tenantId, properties.id] }),
  vehicleTenant: foreignKey({ name: 'deals_vehicle_tenant_fk', columns: [table.tenantId, table.vehicleId], foreignColumns: [vehicles.tenantId, vehicles.id] }),
}))

export type Deal = typeof deals.$inferSelect
export type DealInsert = typeof deals.$inferInsert

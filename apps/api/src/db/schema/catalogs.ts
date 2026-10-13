import { sql } from 'drizzle-orm'
import { pgTable, uuid, text, timestamp, numeric, integer, check, unique } from 'drizzle-orm/pg-core'
import type { CatalogStatus, DealCurrency } from '@crm/shared'
import { tenants } from './tenants'
import { contacts } from './contacts'
import { members } from './members'

function commonColumns() {
  return {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    status: text('status').notNull().default('available').$type<CatalogStatus>(),
    price: numeric('price', { precision: 14, scale: 2 }),
    currency: text('currency').notNull().default('USD').$type<DealCurrency>(),
    sourceContactId: uuid('source_contact_id').references(() => contacts.id, { onDelete: 'set null' }),
    assignedTo: uuid('assigned_to').references(() => members.id, { onDelete: 'set null' }),
    notes: text('notes'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  }
}

export const properties = pgTable('properties', {
  ...commonColumns(),
  operation: text('operation').notNull().$type<'sale' | 'rent'>(),
  propertyType: text('property_type').notNull().$type<'house' | 'apartment' | 'land' | 'commercial' | 'office' | 'other'>(),
  address: text('address').notNull(),
  city: text('city').notNull(),
  region: text('region'),
  bedrooms: integer('bedrooms'),
  bathrooms: integer('bathrooms'),
  area: numeric('area', { precision: 12, scale: 2 }),
}, (table) => ({
  tenantIdUnique: unique('properties_tenant_id_id_unique').on(table.tenantId, table.id),
  validOperation: check('properties_operation', sql`${table.operation} in ('sale','rent')`),
  validType: check('properties_type', sql`${table.propertyType} in ('house','apartment','land','commercial','office','other')`),
  validStatus: check('properties_status', sql`${table.status} in ('available','reserved','sold','rented','archived')`),
  validNumbers: check('properties_numbers', sql`(${table.price} is null or ${table.price} >= 0) and (${table.area} is null or ${table.area} >= 0) and (${table.bedrooms} is null or ${table.bedrooms} >= 0) and (${table.bathrooms} is null or ${table.bathrooms} >= 0)`),
  validCurrency: check('properties_currency', sql`${table.currency} in ('USD','UYU','ARS','CLP','BRL')`),
}))

export const vehicles = pgTable('vehicles', {
  ...commonColumns(),
  make: text('make').notNull(),
  model: text('model').notNull(),
  year: integer('year').notNull(),
  mileage: integer('mileage'),
  plate: text('plate'),
  stockType: text('stock_type').notNull().default('owned').$type<'owned' | 'consignment'>(),
}, (table) => ({
  tenantIdUnique: unique('vehicles_tenant_id_id_unique').on(table.tenantId, table.id),
  validStock: check('vehicles_stock_type', sql`${table.stockType} in ('owned','consignment')`),
  validStatus: check('vehicles_status', sql`${table.status} in ('available','reserved','sold','archived')`),
  validNumbers: check('vehicles_numbers', sql`${table.year} between 1886 and 2200 and (${table.price} is null or ${table.price} >= 0) and (${table.mileage} is null or ${table.mileage} >= 0)`),
  validCurrency: check('vehicles_currency', sql`${table.currency} in ('USD','UYU','ARS','CLP','BRL')`),
}))

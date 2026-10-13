import { sql } from 'drizzle-orm'
import { pgTable, uuid, text, timestamp, foreignKey, check, integer } from 'drizzle-orm/pg-core'
import type { AppointmentKind, AppointmentStatus } from '@crm/shared'
import { tenants } from './tenants'
import { contacts } from './contacts'
import { members } from './members'
import { properties, vehicles } from './catalogs'

export const appointments = pgTable('appointments', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  kind: text('kind').notNull().$type<AppointmentKind>(),
  propertyId: uuid('property_id'),
  vehicleId: uuid('vehicle_id'),
  contactId: uuid('contact_id').references(() => contacts.id, { onDelete: 'set null' }),
  assignedTo: uuid('assigned_to').references(() => members.id, { onDelete: 'set null' }),
  scheduledAt: timestamp('scheduled_at').notNull(),
  durationMinutes: integer('duration_minutes').notNull().default(60),
  status: text('status').notNull().default('scheduled').$type<AppointmentStatus>(),
  notes: text('notes'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  validTarget: check('appointments_target', sql`(${table.kind} = 'property_visit' and ${table.propertyId} is not null and ${table.vehicleId} is null) or (${table.kind} = 'test_drive' and ${table.vehicleId} is not null and ${table.propertyId} is null)`),
  validStatus: check('appointments_status', sql`${table.status} in ('scheduled','completed','cancelled')`),
  propertyTenant: foreignKey({ name: 'appointments_property_tenant_fk', columns: [table.tenantId, table.propertyId], foreignColumns: [properties.tenantId, properties.id] }),
  vehicleTenant: foreignKey({ name: 'appointments_vehicle_tenant_fk', columns: [table.tenantId, table.vehicleId], foreignColumns: [vehicles.tenantId, vehicles.id] }),
}))

import { sql } from 'drizzle-orm'
import { pgTable, uuid, integer, timestamp, customType, check, foreignKey, index } from 'drizzle-orm/pg-core'
import { tenants } from './tenants'
import { properties, vehicles } from './catalogs'
const bytes = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => 'bytea' })
export const catalogPhotos = pgTable('catalog_photos', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  propertyId: uuid('property_id'), vehicleId: uuid('vehicle_id'),
  position: integer('position').notNull(),
  width: integer('width').notNull(), height: integer('height').notNull(),
  byteSize: integer('byte_size').notNull(), content: bytes('content').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, t => ({
  property: foreignKey({ columns: [t.tenantId, t.propertyId], foreignColumns: [properties.tenantId, properties.id] }).onDelete('cascade'),
  vehicle: foreignKey({ columns: [t.tenantId, t.vehicleId], foreignColumns: [vehicles.tenantId, vehicles.id] }).onDelete('cascade'),
  asset: check('catalog_photos_asset', sql`num_nonnulls(${t.propertyId},${t.vehicleId}) = 1`),
  dimensions: check('catalog_photos_dimensions', sql`${t.width} between 1 and 1600 and ${t.height} between 1 and 1600`),
  size: check('catalog_photos_size', sql`${t.byteSize} between 1 and 524288 and octet_length(${t.content}) = ${t.byteSize}`),
  order: check('catalog_photos_position', sql`${t.position} >= 0`),
  propertyIndex: index('catalog_photos_property').on(t.tenantId, t.propertyId, t.position),
  vehicleIndex: index('catalog_photos_vehicle').on(t.tenantId, t.vehicleId, t.position),
}))

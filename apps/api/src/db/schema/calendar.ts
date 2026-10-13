import { pgTable, uuid, text, timestamp, integer, unique, primaryKey, foreignKey } from 'drizzle-orm/pg-core'
import { tenants } from './tenants'
import { members } from './members'

export const calendarConnections = pgTable('calendar_connections', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  memberId: uuid('member_id').notNull().references(() => members.id, { onDelete: 'cascade' }),
  encryptedToken: text('encrypted_token'),
  calendarId: text('calendar_id'),
  status: text('status').notNull().default('connected').$type<'connected' | 'disconnected' | 'reconnect'>(),
  leaseId: uuid('lease_id'),
  leaseUntil: timestamp('lease_until'),
  nextSyncAt: timestamp('next_sync_at').notNull().defaultNow(),
  lastSyncedAt: timestamp('last_synced_at'),
  lastError: text('last_error'),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({ memberUnique: unique('calendar_connections_member_unique').on(table.tenantId, table.memberId),
  tenantConnectionUnique: unique('calendar_connections_tenant_connection_unique').on(table.tenantId, table.id),
  memberTenant: foreignKey({ name: 'calendar_connections_member_tenant_fk', columns: [table.tenantId, table.memberId], foreignColumns: [members.tenantId, members.id] }).onDelete('cascade'),
}))

export const calendarOAuthStates = pgTable('calendar_oauth_states', {
  hash: text('hash').primaryKey(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  memberId: uuid('member_id').notNull().references(() => members.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull(),
  encryptedVerifier: text('encrypted_verifier').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  usedAt: timestamp('used_at'),
}, (table) => ({ memberTenant: foreignKey({ name: 'calendar_oauth_states_member_tenant_fk', columns: [table.tenantId, table.memberId], foreignColumns: [members.tenantId, members.id] }).onDelete('cascade') }))

// Sin FK a la cita: conservar el id permite borrar en Google cuando desaparece en Plata.
export const calendarEventSync = pgTable('calendar_event_sync', {
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  connectionId: uuid('connection_id').notNull().references(() => calendarConnections.id, { onDelete: 'cascade' }),
  appointmentId: uuid('appointment_id').notNull(),
  fingerprint: text('fingerprint').notNull(),
  generation: integer('generation').notNull().default(0),
}, (table) => ({ pk: primaryKey({ columns: [table.connectionId, table.appointmentId] }),
  connectionTenant: foreignKey({ name: 'calendar_event_sync_connection_tenant_fk', columns: [table.tenantId, table.connectionId], foreignColumns: [calendarConnections.tenantId, calendarConnections.id] }).onDelete('cascade'),
}))

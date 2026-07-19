import { pgTable, text, timestamp, uuid, unique } from 'drizzle-orm/pg-core'
import { tenants } from './tenants'
import type { ModuleKey } from '@crm/shared'

export const tenantModules = pgTable('tenant_modules', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  moduleKey: text('module_key').notNull().$type<ModuleKey>(),
  enabledAt: timestamp('enabled_at').notNull().defaultNow(),
}, (table) => ({
  tenantModuleUnique: unique().on(table.tenantId, table.moduleKey),
}))

export type TenantModule = typeof tenantModules.$inferSelect
export type TenantModuleInsert = typeof tenantModules.$inferInsert

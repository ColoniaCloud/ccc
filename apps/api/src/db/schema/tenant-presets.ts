import { pgTable, uuid, text, integer, timestamp, unique } from 'drizzle-orm/pg-core'
import type { PresetKey } from '@crm/shared'
import { tenants } from './tenants'
import { pipelines } from './pipelines'

export const tenantPresets = pgTable('tenant_presets', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  presetKey: text('preset_key').notNull().$type<PresetKey>(),
  version: integer('version').notNull(),
  pipelineId: uuid('pipeline_id').references(() => pipelines.id, { onDelete: 'set null' }),
  appliedAt: timestamp('applied_at').notNull().defaultNow(),
}, (table) => ({ tenantPreset: unique().on(table.tenantId, table.presetKey) }))

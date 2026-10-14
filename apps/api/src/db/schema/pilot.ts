import { sql } from 'drizzle-orm'
import { pgTable, uuid, text, timestamp, date, integer, primaryKey, check } from 'drizzle-orm/pg-core'
import { tenants } from './tenants'
export const pilotMeasurements = pgTable('pilot_measurements', {
  tenantId: uuid('tenant_id').primaryKey().references(() => tenants.id, { onDelete: 'cascade' }),
  industry: text('industry').notNull().$type<'real_estate' | 'automotive'>(),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
}, (t) => ({ industryCheck: check('pilot_measurements_industry', sql`${t.industry} in ('real_estate','automotive')`) }))
export type PilotMilestoneKey = 'configuration' | 'inventory' | 'contact' | 'opportunity' | 'follow_up' | 'activation_ready' | 'onboarding_completed'
export const pilotMilestones = pgTable('pilot_milestones', {
  tenantId: uuid('tenant_id').notNull().references(() => pilotMeasurements.tenantId, { onDelete: 'cascade' }),
  key: text('key').notNull().$type<PilotMilestoneKey>(),
  source: text('source').notNull().$type<'baseline' | 'activity'>(),
  observedAt: timestamp('observed_at', { withTimezone: true }).notNull(),
}, (t) => ({ pk: primaryKey({ columns: [t.tenantId, t.key] }),
  sourceCheck: check('pilot_milestones_source', sql`${t.source} in ('baseline','activity')`),
  keyCheck: check('pilot_milestones_key', sql`${t.key} in ('configuration','inventory','contact','opportunity','follow_up','activation_ready','onboarding_completed')`),
}))
export const pilotActivityDaily = pgTable('pilot_activity_daily', {
  tenantId: uuid('tenant_id').notNull().references(() => pilotMeasurements.tenantId, { onDelete: 'cascade' }),
  day: date('day').notNull(),
  actions: integer('actions').notNull().default(1),
  lastActivityAt: timestamp('last_activity_at', { withTimezone: true }).notNull(),
}, (t) => ({ pk: primaryKey({ columns: [t.tenantId, t.day] }), actionsCheck: check('pilot_activity_daily_actions', sql`${t.actions} > 0`) }))

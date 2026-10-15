import { sql } from 'drizzle-orm'
import { pgTable, uuid, date, integer, text, timestamp, primaryKey, check, foreignKey } from 'drizzle-orm/pg-core'
import { tenants } from './tenants'
export const aiMonthlyUsage = pgTable('ai_monthly_usage', {
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  period: date('period').notNull(), used: integer('used').notNull().default(0),
  inputTokens: integer('input_tokens').notNull().default(0), outputTokens: integer('output_tokens').notNull().default(0),
}, t => ({ pk: primaryKey({columns:[t.tenantId,t.period]}), nonnegative: check('ai_monthly_nonnegative',sql`${t.used} >= 0 and ${t.inputTokens} >= 0 and ${t.outputTokens} >= 0`) }))
export const aiRequests = pgTable('ai_requests', {
  id: uuid('id').primaryKey(), tenantId: uuid('tenant_id').notNull(), period: date('period').notNull(),
  plan: text('plan').notNull(), limit: integer('quota_limit').notNull(),
  status: text('status').notNull().default('reserved').$type<'reserved'|'succeeded'|'failed'>(),
  createdAt: timestamp('created_at',{withTimezone:true}).notNull(), finishedAt: timestamp('finished_at',{withTimezone:true}),
  inputTokens: integer('input_tokens'), outputTokens: integer('output_tokens'),
}, t => ({ monthly: foreignKey({columns:[t.tenantId,t.period],foreignColumns:[aiMonthlyUsage.tenantId,aiMonthlyUsage.period]}).onDelete('cascade'), validStatus: check('ai_request_status',sql`${t.status} in ('reserved','succeeded','failed')`), nonnegative:check('ai_request_nonnegative',sql`${t.limit} >= 0 and (${t.inputTokens} is null or ${t.inputTokens} >= 0) and (${t.outputTokens} is null or ${t.outputTokens} >= 0)`) }))

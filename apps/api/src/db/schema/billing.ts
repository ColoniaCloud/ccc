import { pgTable, text, timestamp, uuid, jsonb, unique } from 'drizzle-orm/pg-core'
import { tenants } from './tenants'
import type { Plan, BillingProvider, SubscriptionStatus } from '@crm/shared'

export const billingSubscriptions = pgTable('billing_subscriptions', {
  id:               uuid('id').primaryKey().defaultRandom(),
  tenantId:         uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  provider:         text('provider').notNull().$type<BillingProvider>(),
  plan:             text('plan').notNull().$type<Plan>(),
  externalId:       text('external_id').notNull(),
  status:           text('status').notNull().default('pending').$type<SubscriptionStatus>(),
  currentPeriodEnd: timestamp('current_period_end'),
  createdAt:        timestamp('created_at').notNull().defaultNow(),
  updatedAt:        timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  externalUnique: unique().on(table.provider, table.externalId),
}))

export const billingEvents = pgTable('billing_events', {
  id:         uuid('id').primaryKey().defaultRandom(),
  tenantId:   uuid('tenant_id').references(() => tenants.id, { onDelete: 'set null' }),
  provider:   text('provider').notNull().$type<BillingProvider>(),
  eventType:  text('event_type').notNull(),
  externalId: text('external_id').notNull(),
  rawPayload: jsonb('raw_payload'),
  createdAt:  timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  idempotencyUnique: unique().on(table.provider, table.externalId, table.eventType),
}))

export const billingProviderPlans = pgTable('billing_provider_plans', {
  id:             uuid('id').primaryKey().defaultRandom(),
  provider:       text('provider').notNull().$type<BillingProvider>(),
  plan:           text('plan').notNull().$type<Plan>(),
  externalPlanId: text('external_plan_id').notNull(),
  createdAt:      timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  providerPlanUnique: unique().on(table.provider, table.plan),
}))

export type BillingSubscription       = typeof billingSubscriptions.$inferSelect
export type BillingSubscriptionInsert = typeof billingSubscriptions.$inferInsert
export type BillingEvent              = typeof billingEvents.$inferSelect
export type BillingProviderPlan       = typeof billingProviderPlans.$inferSelect

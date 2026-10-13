import { boolean, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import type { Plan, Locale, TenantStatus, BusinessProfile } from '@crm/shared'

export const tenants = pgTable('tenants', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  plan: text('plan').notNull().default('free').$type<Plan>(),
  planRenewsAt: timestamp('plan_renews_at'),
  locale: text('locale').notNull().default('es-UY').$type<Locale>(),
  status: text('status').notNull().default('active').$type<TenantStatus>(),
  suspendedAt: timestamp('suspended_at'),
  // Perfil del negocio del onboarding (memoria base para la IA). Null en las
  // organizaciones creadas antes de que existiera el formulario.
  businessProfile: jsonb('business_profile').$type<BusinessProfile>(),
  businessProfileUpdatedAt: timestamp('business_profile_updated_at'),
  setupRequired: boolean('setup_required').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

export type Tenant = typeof tenants.$inferSelect
export type TenantInsert = typeof tenants.$inferInsert

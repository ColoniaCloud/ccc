import { sql } from 'drizzle-orm'
import { pgTable, uuid, text, integer, jsonb, timestamp, check } from 'drizzle-orm/pg-core'
import type { SetupStatus, SetupMessage, SetupProposal } from '@crm/shared'
import { tenants } from './tenants'

export const onboardingSessions = pgTable('onboarding_sessions', {
  tenantId: uuid('tenant_id').primaryKey().references(() => tenants.id, { onDelete: 'cascade' }),
  status: text('status').notNull().default('in_progress').$type<SetupStatus>(),
  revision: integer('revision').notNull().default(1),
  messages: jsonb('messages').notNull().default([]).$type<SetupMessage[]>(),
  proposal: jsonb('proposal').$type<SetupProposal>(),
  pendingRequestId: uuid('pending_request_id'),
  requestStartedAt: timestamp('request_started_at'),
  attempts: integer('attempts').notNull().default(0),
  inputTokens: integer('input_tokens').notNull().default(0),
  outputTokens: integer('output_tokens').notNull().default(0),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({ validStatus: check('onboarding_sessions_status', sql`${table.status} in ('in_progress','ready','completed','deferred')`) }))

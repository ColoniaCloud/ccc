import { pgTable, uuid, text, integer, timestamp, jsonb, unique, foreignKey, index } from 'drizzle-orm/pg-core'
import { tenants } from './tenants'

export type FollowUpCandidate = { dealId: string; title: string; contactId: string | null; assignedTo: string | null; observedAt: string }
export const agents = pgTable('agents', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  name: text('name').notNull(), instructions: text('instructions').notNull(),
  status: text('status').notNull().default('paused').$type<'active' | 'paused' | 'archived'>(),
  staleDays: integer('stale_days').notNull().default(5), pipelineId: uuid('pipeline_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, t => ({ tenantKey: unique('agents_tenant_id_id').on(t.tenantId, t.id) }))

export const agentJobs = pgTable('agent_jobs', {
  id: uuid('id').primaryKey(), tenantId: uuid('tenant_id').notNull(), agentId: uuid('agent_id').notNull(),
  memberId: uuid('member_id').notNull(), kind: text('kind').notNull().$type<'run' | 'chat'>(),
  period: text('period').notNull(), status: text('status').notNull().default('running').$type<'running' | 'succeeded' | 'failed'>(),
  prompt: text('prompt'), response: text('response'), error: text('error'),
  candidates: jsonb('candidates').notNull().default([]).$type<FollowUpCandidate[]>(),
  inputTokens: integer('input_tokens').notNull().default(0), outputTokens: integer('output_tokens').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
}, t => ({ agent: foreignKey({ columns: [t.tenantId, t.agentId], foreignColumns: [agents.tenantId, agents.id] }).onDelete('cascade'),
  tenantKey: unique('agent_jobs_tenant_id_id').on(t.tenantId, t.id), usage: index('agent_jobs_usage').on(t.tenantId, t.period),
}))

export const agentProposals = pgTable('agent_proposals', {
  id: uuid('id').primaryKey().defaultRandom(), tenantId: uuid('tenant_id').notNull(), agentId: uuid('agent_id').notNull(), runId: uuid('run_id').notNull(),
  dealId: uuid('deal_id').notNull(), title: text('title').notNull(), reason: text('reason').notNull(), observedAt: timestamp('observed_at', { withTimezone: true }).notNull(),
  status: text('status').notNull().default('pending').$type<'pending' | 'approved' | 'dismissed' | 'stale'>(),
  taskId: uuid('task_id'), decidedBy: uuid('decided_by'), decidedAt: timestamp('decided_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, t => ({ agent: foreignKey({ columns: [t.tenantId, t.agentId], foreignColumns: [agents.tenantId, agents.id] }).onDelete('cascade'),
  run: foreignKey({ columns: [t.tenantId, t.runId], foreignColumns: [agentJobs.tenantId, agentJobs.id] }).onDelete('cascade'),
}))

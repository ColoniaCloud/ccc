CREATE TABLE "agent_jobs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"period" text NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"prompt" text,
	"response" text,
	"error" text,
	"candidates" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "agent_jobs_tenant_id_id" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "agent_proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"deal_id" uuid NOT NULL,
	"title" text NOT NULL,
	"reason" text NOT NULL,
	"observed_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"task_id" uuid,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"instructions" text NOT NULL,
	"status" text DEFAULT 'paused' NOT NULL,
	"stale_days" integer DEFAULT 5 NOT NULL,
	"pipeline_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agents_tenant_id_id" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
ALTER TABLE "agent_jobs" ADD CONSTRAINT "agent_jobs_tenant_id_agent_id_agents_tenant_id_id_fk" FOREIGN KEY ("tenant_id","agent_id") REFERENCES "public"."agents"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_proposals" ADD CONSTRAINT "agent_proposals_tenant_id_agent_id_agents_tenant_id_id_fk" FOREIGN KEY ("tenant_id","agent_id") REFERENCES "public"."agents"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_proposals" ADD CONSTRAINT "agent_proposals_tenant_id_run_id_agent_jobs_tenant_id_id_fk" FOREIGN KEY ("tenant_id","run_id") REFERENCES "public"."agent_jobs"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_jobs_usage" ON "agent_jobs" USING btree ("tenant_id","period");--> statement-breakpoint
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE agents FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON agents USING (tenant_id = current_setting('app.tenant_id', true)::uuid) WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);
ALTER TABLE agent_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_jobs FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON agent_jobs USING (tenant_id = current_setting('app.tenant_id', true)::uuid) WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);
ALTER TABLE agent_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_proposals FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON agent_proposals USING (tenant_id = current_setting('app.tenant_id', true)::uuid) WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);
CREATE UNIQUE INDEX agent_proposals_pending_deal ON agent_proposals (tenant_id, deal_id) WHERE status = 'pending';
CREATE INDEX agent_proposals_agent ON agent_proposals (tenant_id, agent_id, created_at);
CREATE INDEX agent_jobs_agent ON agent_jobs (tenant_id, agent_id, created_at);
ALTER TABLE agents ADD CONSTRAINT agents_status CHECK (status IN ('active','paused','archived'));
ALTER TABLE agents ADD CONSTRAINT agents_days CHECK (stale_days BETWEEN 1 AND 90);
ALTER TABLE agent_jobs ADD CONSTRAINT agent_jobs_status CHECK (status IN ('running','succeeded','failed'));
ALTER TABLE agent_jobs ADD CONSTRAINT agent_jobs_kind CHECK (kind IN ('run','chat'));
ALTER TABLE agent_jobs ADD CONSTRAINT agent_jobs_tokens CHECK (input_tokens >= 0 AND output_tokens >= 0);
ALTER TABLE agent_proposals ADD CONSTRAINT agent_proposals_status CHECK (status IN ('pending','approved','dismissed','stale'));
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='plata_app') THEN
  GRANT SELECT, INSERT, UPDATE, DELETE ON agents, agent_jobs, agent_proposals TO plata_app;
 END IF;
END $$;

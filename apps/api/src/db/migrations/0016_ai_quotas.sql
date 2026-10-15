CREATE TABLE "ai_monthly_usage" (
	"tenant_id" uuid NOT NULL,
	"period" date NOT NULL,
	"used" integer DEFAULT 0 NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "ai_monthly_usage_tenant_id_period_pk" PRIMARY KEY("tenant_id","period"),
	CONSTRAINT "ai_monthly_nonnegative" CHECK ("ai_monthly_usage"."used" >= 0 and "ai_monthly_usage"."input_tokens" >= 0 and "ai_monthly_usage"."output_tokens" >= 0)
);
--> statement-breakpoint
CREATE TABLE "ai_requests" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"period" date NOT NULL,
	"plan" text NOT NULL,
	"quota_limit" integer NOT NULL,
	"status" text DEFAULT 'reserved' NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone,
	"input_tokens" integer,
	"output_tokens" integer,
	CONSTRAINT "ai_request_status" CHECK ("ai_requests"."status" in ('reserved','succeeded','failed')),
	CONSTRAINT "ai_request_nonnegative" CHECK ("ai_requests"."quota_limit" >= 0 and ("ai_requests"."input_tokens" is null or "ai_requests"."input_tokens" >= 0) and ("ai_requests"."output_tokens" is null or "ai_requests"."output_tokens" >= 0))
);
--> statement-breakpoint
ALTER TABLE "ai_monthly_usage" ADD CONSTRAINT "ai_monthly_usage_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_requests" ADD CONSTRAINT "ai_requests_tenant_id_period_ai_monthly_usage_tenant_id_period_fk" FOREIGN KEY ("tenant_id","period") REFERENCES "public"."ai_monthly_usage"("tenant_id","period") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE ai_monthly_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_monthly_usage FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON ai_monthly_usage USING (tenant_id = current_setting('app.tenant_id', true)::uuid) WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);
ALTER TABLE ai_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_requests FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON ai_requests USING (tenant_id = current_setting('app.tenant_id', true)::uuid) WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='plata_app') THEN
  GRANT SELECT, INSERT, UPDATE, DELETE ON ai_monthly_usage,ai_requests TO plata_app;
 END IF;
END $$;

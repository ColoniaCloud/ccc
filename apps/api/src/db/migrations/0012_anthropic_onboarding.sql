CREATE TABLE "onboarding_sessions" (
	"tenant_id" uuid PRIMARY KEY NOT NULL,
	"status" text DEFAULT 'in_progress' NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"messages" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"proposal" jsonb,
	"pending_request_id" uuid,
	"request_started_at" timestamp,
	"attempts" integer DEFAULT 0 NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "onboarding_sessions_status" CHECK ("onboarding_sessions"."status" in ('in_progress','ready','completed','deferred'))
);
--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "setup_required" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "onboarding_sessions" ADD CONSTRAINT "onboarding_sessions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE onboarding_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE onboarding_sessions FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON onboarding_sessions USING (tenant_id = current_setting('app.tenant_id', true)::uuid) WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'plata_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON onboarding_sessions TO plata_app;
  END IF;
END $$;

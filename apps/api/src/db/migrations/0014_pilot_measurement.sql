CREATE TABLE "pilot_activity_daily" (
	"tenant_id" uuid NOT NULL,
	"day" date NOT NULL,
	"actions" integer DEFAULT 1 NOT NULL,
	"last_activity_at" timestamp with time zone NOT NULL,
	CONSTRAINT "pilot_activity_daily_tenant_id_day_pk" PRIMARY KEY("tenant_id","day"),
	CONSTRAINT "pilot_activity_daily_actions" CHECK ("pilot_activity_daily"."actions" > 0)
);
--> statement-breakpoint
CREATE TABLE "pilot_measurements" (
	"tenant_id" uuid PRIMARY KEY NOT NULL,
	"industry" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	CONSTRAINT "pilot_measurements_industry" CHECK ("pilot_measurements"."industry" in ('real_estate','automotive'))
);
--> statement-breakpoint
CREATE TABLE "pilot_milestones" (
	"tenant_id" uuid NOT NULL,
	"key" text NOT NULL,
	"source" text NOT NULL,
	"observed_at" timestamp with time zone NOT NULL,
	CONSTRAINT "pilot_milestones_tenant_id_key_pk" PRIMARY KEY("tenant_id","key"),
	CONSTRAINT "pilot_milestones_source" CHECK ("pilot_milestones"."source" in ('baseline','activity')),
	CONSTRAINT "pilot_milestones_key" CHECK ("pilot_milestones"."key" in ('configuration','inventory','contact','opportunity','follow_up','activation_ready','onboarding_completed'))
);
--> statement-breakpoint
ALTER TABLE "pilot_activity_daily" ADD CONSTRAINT "pilot_activity_daily_tenant_id_pilot_measurements_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."pilot_measurements"("tenant_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pilot_measurements" ADD CONSTRAINT "pilot_measurements_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pilot_milestones" ADD CONSTRAINT "pilot_milestones_tenant_id_pilot_measurements_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."pilot_measurements"("tenant_id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE pilot_measurements ENABLE ROW LEVEL SECURITY;
ALTER TABLE pilot_measurements FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON pilot_measurements USING (tenant_id = current_setting('app.tenant_id', true)::uuid) WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);
ALTER TABLE pilot_milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE pilot_milestones FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON pilot_milestones USING (tenant_id = current_setting('app.tenant_id', true)::uuid) WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);
ALTER TABLE pilot_activity_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE pilot_activity_daily FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON pilot_activity_daily USING (tenant_id = current_setting('app.tenant_id', true)::uuid) WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'plata_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON pilot_measurements, pilot_milestones, pilot_activity_daily TO plata_app;
  END IF;
END $$;

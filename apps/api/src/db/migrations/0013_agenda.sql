ALTER TABLE tasks ADD COLUMN due_on date;
UPDATE tasks SET due_on = due_date::date WHERE due_date IS NOT NULL;
--> statement-breakpoint
ALTER TABLE appointments ADD COLUMN duration_minutes integer NOT NULL DEFAULT 60;
ALTER TABLE appointments ADD CONSTRAINT appointments_duration CHECK (duration_minutes BETWEEN 15 AND 480);
--> statement-breakpoint
ALTER TABLE pipeline_stages ADD COLUMN outcome text NOT NULL DEFAULT 'open';
UPDATE pipeline_stages SET outcome = CASE lower(trim(name)) WHEN 'ganado' THEN 'won' WHEN 'perdido' THEN 'lost' END WHERE lower(trim(name)) IN ('ganado','perdido');
ALTER TABLE pipeline_stages ADD CONSTRAINT pipeline_stages_outcome CHECK (outcome IN ('open','won','lost'));
--> statement-breakpoint
CREATE INDEX tasks_agenda_pending ON tasks (tenant_id, due_on) WHERE NOT done;
CREATE INDEX appointments_agenda_pending ON appointments (tenant_id, scheduled_at) WHERE status = 'scheduled';

--> statement-breakpoint
CREATE TABLE "calendar_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"encrypted_token" text,
	"calendar_id" text,
	"status" text DEFAULT 'connected' NOT NULL,
	"lease_id" uuid,
	"lease_until" timestamp,
	"next_sync_at" timestamp DEFAULT now() NOT NULL,
	"last_synced_at" timestamp,
	"last_error" text,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "calendar_connections_member_unique" UNIQUE("tenant_id","member_id")
);
--> statement-breakpoint
CREATE TABLE "calendar_event_sync" (
	"tenant_id" uuid NOT NULL,
	"connection_id" uuid NOT NULL,
	"appointment_id" uuid NOT NULL,
	"fingerprint" text NOT NULL,
	"generation" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "calendar_event_sync_connection_id_appointment_id_pk" PRIMARY KEY("connection_id","appointment_id")
);
--> statement-breakpoint
CREATE TABLE "calendar_oauth_states" (
	"hash" text PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"encrypted_verifier" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"used_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "calendar_connections" ADD CONSTRAINT "calendar_connections_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_connections" ADD CONSTRAINT "calendar_connections_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_event_sync" ADD CONSTRAINT "calendar_event_sync_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_event_sync" ADD CONSTRAINT "calendar_event_sync_connection_id_calendar_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."calendar_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_oauth_states" ADD CONSTRAINT "calendar_oauth_states_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_oauth_states" ADD CONSTRAINT "calendar_oauth_states_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE calendar_connections ADD CONSTRAINT calendar_connection_status CHECK (status IN ('connected','disconnected','reconnect'));
ALTER TABLE calendar_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_connections FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON calendar_connections USING (tenant_id = current_setting('app.tenant_id', true)::uuid) WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);
ALTER TABLE calendar_oauth_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_oauth_states FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON calendar_oauth_states USING (tenant_id = current_setting('app.tenant_id', true)::uuid) WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);
ALTER TABLE calendar_event_sync ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_event_sync FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON calendar_event_sync USING (tenant_id = current_setting('app.tenant_id', true)::uuid) WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'plata_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON calendar_connections, calendar_oauth_states, calendar_event_sync TO plata_app;
  END IF;
END $$;

--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_tenant_member_unique" UNIQUE("tenant_id","id");
--> statement-breakpoint
ALTER TABLE "calendar_connections" ADD CONSTRAINT "calendar_connections_tenant_connection_unique" UNIQUE("tenant_id","id");
--> statement-breakpoint
ALTER TABLE "calendar_connections" ADD CONSTRAINT "calendar_connections_member_tenant_fk" FOREIGN KEY ("tenant_id","member_id") REFERENCES "public"."members"("tenant_id","id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "calendar_event_sync" ADD CONSTRAINT "calendar_event_sync_connection_tenant_fk" FOREIGN KEY ("tenant_id","connection_id") REFERENCES "public"."calendar_connections"("tenant_id","id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "calendar_oauth_states" ADD CONSTRAINT "calendar_oauth_states_member_tenant_fk" FOREIGN KEY ("tenant_id","member_id") REFERENCES "public"."members"("tenant_id","id") ON DELETE cascade ON UPDATE no action;

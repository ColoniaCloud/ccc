CREATE TABLE "properties" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"title" text NOT NULL,
	"status" text DEFAULT 'available' NOT NULL,
	"price" numeric(14, 2),
	"currency" text DEFAULT 'USD' NOT NULL,
	"source_contact_id" uuid,
	"assigned_to" uuid,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"operation" text NOT NULL,
	"property_type" text NOT NULL,
	"address" text NOT NULL,
	"city" text NOT NULL,
	"region" text,
	"bedrooms" integer,
	"bathrooms" integer,
	"area" numeric(12, 2),
	CONSTRAINT "properties_tenant_id_id_unique" UNIQUE("tenant_id","id"),
	CONSTRAINT "properties_operation" CHECK ("properties"."operation" in ('sale','rent')),
	CONSTRAINT "properties_type" CHECK ("properties"."property_type" in ('house','apartment','land','commercial','office','other')),
	CONSTRAINT "properties_status" CHECK ("properties"."status" in ('available','reserved','sold','rented','archived')),
	CONSTRAINT "properties_numbers" CHECK (("properties"."price" is null or "properties"."price" >= 0) and ("properties"."area" is null or "properties"."area" >= 0) and ("properties"."bedrooms" is null or "properties"."bedrooms" >= 0) and ("properties"."bathrooms" is null or "properties"."bathrooms" >= 0)),
	CONSTRAINT "properties_currency" CHECK ("properties"."currency" in ('USD','UYU','ARS','CLP','BRL'))
);
--> statement-breakpoint
CREATE TABLE "vehicles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"title" text NOT NULL,
	"status" text DEFAULT 'available' NOT NULL,
	"price" numeric(14, 2),
	"currency" text DEFAULT 'USD' NOT NULL,
	"source_contact_id" uuid,
	"assigned_to" uuid,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"make" text NOT NULL,
	"model" text NOT NULL,
	"year" integer NOT NULL,
	"mileage" integer,
	"plate" text,
	"stock_type" text DEFAULT 'owned' NOT NULL,
	CONSTRAINT "vehicles_tenant_id_id_unique" UNIQUE("tenant_id","id"),
	CONSTRAINT "vehicles_stock_type" CHECK ("vehicles"."stock_type" in ('owned','consignment')),
	CONSTRAINT "vehicles_status" CHECK ("vehicles"."status" in ('available','reserved','sold','archived')),
	CONSTRAINT "vehicles_numbers" CHECK ("vehicles"."year" between 1886 and 2200 and ("vehicles"."price" is null or "vehicles"."price" >= 0) and ("vehicles"."mileage" is null or "vehicles"."mileage" >= 0)),
	CONSTRAINT "vehicles_currency" CHECK ("vehicles"."currency" in ('USD','UYU','ARS','CLP','BRL'))
);
--> statement-breakpoint
CREATE TABLE "appointments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"property_id" uuid,
	"vehicle_id" uuid,
	"contact_id" uuid,
	"assigned_to" uuid,
	"scheduled_at" timestamp NOT NULL,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "appointments_target" CHECK (("appointments"."kind" = 'property_visit' and "appointments"."property_id" is not null and "appointments"."vehicle_id" is null) or ("appointments"."kind" = 'test_drive' and "appointments"."vehicle_id" is not null and "appointments"."property_id" is null)),
	CONSTRAINT "appointments_status" CHECK ("appointments"."status" in ('scheduled','completed','cancelled'))
);
--> statement-breakpoint
CREATE TABLE "tenant_presets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"preset_key" text NOT NULL,
	"version" integer NOT NULL,
	"pipeline_id" uuid,
	"applied_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tenant_presets_tenant_id_preset_key_unique" UNIQUE("tenant_id","preset_key")
);
--> statement-breakpoint
ALTER TABLE "deals" ADD COLUMN "property_id" uuid;--> statement-breakpoint
ALTER TABLE "deals" ADD COLUMN "vehicle_id" uuid;--> statement-breakpoint
ALTER TABLE "properties" ADD CONSTRAINT "properties_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "properties" ADD CONSTRAINT "properties_source_contact_id_contacts_id_fk" FOREIGN KEY ("source_contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "properties" ADD CONSTRAINT "properties_assigned_to_members_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_source_contact_id_contacts_id_fk" FOREIGN KEY ("source_contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_assigned_to_members_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_assigned_to_members_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_property_tenant_fk" FOREIGN KEY ("tenant_id","property_id") REFERENCES "public"."properties"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_vehicle_tenant_fk" FOREIGN KEY ("tenant_id","vehicle_id") REFERENCES "public"."vehicles"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_presets" ADD CONSTRAINT "tenant_presets_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_presets" ADD CONSTRAINT "tenant_presets_pipeline_id_pipelines_id_fk" FOREIGN KEY ("pipeline_id") REFERENCES "public"."pipelines"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deals" ADD CONSTRAINT "deals_property_tenant_fk" FOREIGN KEY ("tenant_id","property_id") REFERENCES "public"."properties"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deals" ADD CONSTRAINT "deals_vehicle_tenant_fk" FOREIGN KEY ("tenant_id","vehicle_id") REFERENCES "public"."vehicles"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deals" ADD CONSTRAINT "deals_one_catalog_item" CHECK ("deals"."property_id" is null or "deals"."vehicle_id" is null);
--> statement-breakpoint
ALTER TABLE properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE properties FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON properties USING (tenant_id = current_setting('app.tenant_id', true)::uuid) WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);
--> statement-breakpoint
ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicles FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON vehicles USING (tenant_id = current_setting('app.tenant_id', true)::uuid) WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);
--> statement-breakpoint
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON appointments USING (tenant_id = current_setting('app.tenant_id', true)::uuid) WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);
--> statement-breakpoint
ALTER TABLE tenant_presets ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_presets FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON tenant_presets USING (tenant_id = current_setting('app.tenant_id', true)::uuid) WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'plata_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON properties, vehicles, appointments, tenant_presets TO plata_app;
  END IF;
END $$;

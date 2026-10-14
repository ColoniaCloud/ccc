CREATE TABLE "catalog_photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"property_id" uuid,
	"vehicle_id" uuid,
	"position" integer NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"byte_size" integer NOT NULL,
	"content" "bytea" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "catalog_photos_asset" CHECK (num_nonnulls("catalog_photos"."property_id","catalog_photos"."vehicle_id") = 1),
	CONSTRAINT "catalog_photos_dimensions" CHECK ("catalog_photos"."width" between 1 and 1600 and "catalog_photos"."height" between 1 and 1600),
	CONSTRAINT "catalog_photos_size" CHECK ("catalog_photos"."byte_size" between 1 and 524288 and octet_length("catalog_photos"."content") = "catalog_photos"."byte_size"),
	CONSTRAINT "catalog_photos_position" CHECK ("catalog_photos"."position" >= 0)
);
--> statement-breakpoint
ALTER TABLE "catalog_photos" ADD CONSTRAINT "catalog_photos_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_photos" ADD CONSTRAINT "catalog_photos_tenant_id_property_id_properties_tenant_id_id_fk" FOREIGN KEY ("tenant_id","property_id") REFERENCES "public"."properties"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_photos" ADD CONSTRAINT "catalog_photos_tenant_id_vehicle_id_vehicles_tenant_id_id_fk" FOREIGN KEY ("tenant_id","vehicle_id") REFERENCES "public"."vehicles"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "catalog_photos_property" ON "catalog_photos" USING btree ("tenant_id","property_id","position");--> statement-breakpoint
CREATE INDEX "catalog_photos_vehicle" ON "catalog_photos" USING btree ("tenant_id","vehicle_id","position");
--> statement-breakpoint
ALTER TABLE catalog_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalog_photos FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON catalog_photos USING (tenant_id = current_setting('app.tenant_id', true)::uuid) WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'plata_app') THEN
  GRANT SELECT, INSERT, UPDATE, DELETE ON catalog_photos TO plata_app;
 END IF;
END $$;

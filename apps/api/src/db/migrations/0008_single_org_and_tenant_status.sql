ALTER TABLE "members" DROP CONSTRAINT "members_user_id_tenant_id_unique";--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "status" text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "suspended_at" timestamp;--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_user_id_unique" UNIQUE("user_id");
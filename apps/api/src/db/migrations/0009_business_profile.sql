ALTER TABLE "tenants" ADD COLUMN "business_profile" jsonb;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "business_profile_updated_at" timestamp;--> statement-breakpoint
-- Verificación de email obligatoria desde esta versión. Las cuentas que ya
-- existían se crearon sin verificación (no había envío de correos): se marcan
-- como verificadas para no dejarlas afuera. Corre una sola vez, antes de que
-- la API nueva empiece a exigir la verificación.
UPDATE "user" SET "email_verified" = true WHERE "email_verified" = false;

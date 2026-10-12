CREATE TABLE "organization_invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"email" text NOT NULL,
	"role" text NOT NULL,
	"token_hash" text NOT NULL,
	"invited_by" text,
	"expires_at" timestamp NOT NULL,
	"accepted_at" timestamp,
	"accepted_by" text,
	"revoked_at" timestamp,
	"delivered_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "organization_invitations_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "organization_invitations_valid_role" CHECK ("organization_invitations"."role" in ('admin', 'manager', 'seller', 'support'))
);
--> statement-breakpoint
ALTER TABLE "members" DROP CONSTRAINT "members_user_id_unique";--> statement-breakpoint
ALTER TABLE "organization_invitations" ADD CONSTRAINT "organization_invitations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_invitations" ADD CONSTRAINT "organization_invitations_invited_by_user_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_invitations" ADD CONSTRAINT "organization_invitations_accepted_by_user_id_fk" FOREIGN KEY ("accepted_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "organization_invitations_tenant_idx" ON "organization_invitations" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "organization_invitations_pending_email" ON "organization_invitations" USING btree ("tenant_id","email") WHERE "organization_invitations"."accepted_at" is null and "organization_invitations"."revoked_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "members_one_owner_per_tenant" ON "members" USING btree ("tenant_id") WHERE "members"."role" = 'owner';--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_user_id_tenant_id_unique" UNIQUE("user_id","tenant_id");--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_valid_role" CHECK ("members"."role" in ('owner', 'admin', 'manager', 'seller', 'support'));
--> statement-breakpoint
-- Conserva todos los usuarios y datos. El admin más antiguo asume la propiedad;
-- si una organización histórica no tenía admin, se elige su miembro más antiguo.
WITH ranked AS (
  SELECT id, row_number() OVER (PARTITION BY tenant_id
    ORDER BY CASE WHEN role = 'admin' THEN 0 ELSE 1 END, created_at, id) AS position
  FROM members
)
UPDATE members SET role = 'owner' FROM ranked WHERE members.id = ranked.id AND ranked.position = 1;
--> statement-breakpoint
ALTER TABLE "organization_invitations" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "organization_invitations" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "organization_invitations"
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);
--> statement-breakpoint
-- Garantiza un responsable aun si Better Auth borra membresías en cascada.
-- Es diferido para permitir transferir propiedad en dos UPDATE atómicos.
CREATE FUNCTION ensure_organization_owner() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE organization_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN organization_id := OLD.tenant_id;
  ELSE organization_id := NEW.tenant_id;
  END IF;
  PERFORM id FROM tenants WHERE id = organization_id FOR UPDATE;
  IF FOUND AND EXISTS (SELECT 1 FROM members WHERE tenant_id = organization_id)
    AND NOT EXISTS (SELECT 1 FROM members WHERE tenant_id = organization_id AND role = 'owner') THEN
    RAISE EXCEPTION 'La organización debe tener un propietario' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER members_require_owner
AFTER INSERT OR UPDATE OR DELETE ON members
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION ensure_organization_owner();

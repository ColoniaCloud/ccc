-- Row-Level Security como red de seguridad estructural para el aislamiento
-- multi-tenant. Hasta ahora el aislamiento dependía 100% de que cada query
-- en apps/api/src/routes/*.ts incluyera "WHERE tenant_id = ..." a mano.
-- Estas políticas hacen que Postgres mismo rechace filas de otro tenant,
-- incluso si una query nueva se olvida del filtro.
--
-- Requiere que la conexión de la app use un rol SIN BYPASSRLS (rol
-- "plata_app"; ver migración de rol aparte). Roles con BYPASSRLS
-- (ej. el owner "neondb_owner" usado para migraciones) ignoran estas
-- políticas por diseño de Postgres, incluso con FORCE ROW LEVEL SECURITY.
--
-- current_setting('app.tenant_id', true) devuelve NULL si nadie lo seteó
-- en la sesión/transacción (segundo argumento "true" = missing_ok). Con
-- tenant_id NULL las comparaciones son siempre falsas, así que el default
-- ante ausencia de contexto de tenant es "denegar", no "permitir todo".
--
-- Alcance de esta migración: las tablas del CRM core, que solo se leen o
-- escriben dentro de un request autenticado ya resuelto por tenantMiddleware.
-- Quedan afuera a propósito (requieren diseño de política aparte, no forzarlo
-- acá): billing_subscriptions y billing_events, porque los webhooks de
-- MercadoPago/NOWPayments (routes/billing.ts) escriben ahí sin pasar por
-- tenantMiddleware, antes de que exista un app.tenant_id de sesión; tenants
-- (tabla raíz, sin tenant_id propio); billing_provider_plans (catálogo
-- global, no es dato de tenant); contact_messages (formulario público sin
-- sesión); y las tablas de Better Auth (user/session/account/verification,
-- compartidas entre tenants por diseño).

--> statement-breakpoint
ALTER TABLE "members" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "members" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "members"
  USING ("tenant_id" = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true)::uuid);

--> statement-breakpoint
ALTER TABLE "contacts" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "contacts" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "contacts"
  USING ("tenant_id" = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true)::uuid);

--> statement-breakpoint
ALTER TABLE "pipelines" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "pipelines" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "pipelines"
  USING ("tenant_id" = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true)::uuid);

--> statement-breakpoint
ALTER TABLE "deals" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "deals" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "deals"
  USING ("tenant_id" = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true)::uuid);

--> statement-breakpoint
ALTER TABLE "tasks" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "tasks" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "tasks"
  USING ("tenant_id" = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true)::uuid);

--> statement-breakpoint
ALTER TABLE "tenant_modules" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "tenant_modules" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "tenant_modules"
  USING ("tenant_id" = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true)::uuid);

--> statement-breakpoint
ALTER TABLE "tags" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "tags" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "tags"
  USING ("tenant_id" = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true)::uuid);

--> statement-breakpoint
ALTER TABLE "custom_field_definitions" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "custom_field_definitions" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "custom_field_definitions"
  USING ("tenant_id" = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true)::uuid);

--> statement-breakpoint
ALTER TABLE "contact_activities" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "contact_activities" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "contact_activities"
  USING ("tenant_id" = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true)::uuid);

-- Tablas sin columna tenant_id propia: heredan el tenant de su padre.
--> statement-breakpoint
ALTER TABLE "pipeline_stages" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "pipeline_stages" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "pipeline_stages"
  USING (EXISTS (
    SELECT 1 FROM "pipelines" p
    WHERE p.id = "pipeline_stages"."pipeline_id"
      AND p.tenant_id = current_setting('app.tenant_id', true)::uuid
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM "pipelines" p
    WHERE p.id = "pipeline_stages"."pipeline_id"
      AND p.tenant_id = current_setting('app.tenant_id', true)::uuid
  ));

--> statement-breakpoint
ALTER TABLE "contact_tags" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "contact_tags" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "contact_tags"
  USING (EXISTS (
    SELECT 1 FROM "contacts" c
    WHERE c.id = "contact_tags"."contact_id"
      AND c.tenant_id = current_setting('app.tenant_id', true)::uuid
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM "contacts" c
    WHERE c.id = "contact_tags"."contact_id"
      AND c.tenant_id = current_setting('app.tenant_id', true)::uuid
  ));

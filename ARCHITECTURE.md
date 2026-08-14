# Arquitectura del Sistema — CRM SaaS LATAM

## Cuatro superficies del sistema

| Superficie | Dominio | Tecnología | Responsabilidad |
|---|---|---|---|
| **Web pública + App tenant** | `app.plata.studio` | Next.js 15 (App Router) | Landing, registro, onboarding, dashboard, CRM |
| **API** | `api.plata.studio` | Hono + Node.js | REST endpoints, auth, webhooks (MercadoPago/NOWPayments), jobs |
| **Admin panel** | `app.plata.studio/admin` | Next.js 15 (App Router) | Gestión de tenants (lectura + suspender/reactivar/forzar plan) — acceso restringido a superadmin |

Se abandonó el dominio `crm.lat` documentado originalmente a favor de `plata.studio`
(dominio real del usuario). Web pública y app tenant hoy son la misma app
Next.js (`apps/web`), sin separar por subdominio de tenant todavía.

---

## Stack por capa

### Frontend — `apps/web`
- **Next.js 15** con App Router: RSC por defecto, streaming, layouts anidados
- **React 19**: `use()`, Server Actions, concurrent features
- **React Aria Components**: primitivos accesibles sin estilos forzados
- **CSS custom properties**: design tokens en `theme.css`, sin dependencia de utilidades externas

### Backend — `apps/api`
- **Hono**: framework HTTP ultra-liviano, edge-ready, TypeScript nativo
- **Better Auth**: autenticación multi-tenant con soporte para organizaciones
- **Drizzle ORM**: queries tipadas en SQL real, sin abstracción pesada
- **BullMQ + Redis**: cola de jobs para emails, notificaciones, procesamiento async
- **postgres**: driver nativo para PostgreSQL sin overhead

### Base de datos
- **PostgreSQL 16**: base principal (Neon)
- **Estrategia multi-tenant**: fila por tenant, no schema-per-tenant.
  Todas las tablas de datos del CRM viven en el schema `public` con una
  columna `tenant_id`; no hay un schema aislado por tenant. Se evaluó
  schema-per-tenant al principio del proyecto (ver ARCHITECTURE.md
  original) pero se optó por el modelo más simple de fila-por-tenant,
  reforzado con Row-Level Security como defensa en profundidad (ver abajo).
- **Un usuario pertenece a una sola organización** (`members.user_id` es
  unique a nivel DB desde la migración `0008_single_org_and_tenant_status`).
  No hay selector de organización en el front — si en el futuro hace falta
  que un usuario pertenezca a varios tenants, hay que levantar esa
  restricción y agregar el switcher, no es el modelo actual.
- **Row-Level Security** (migración `0007_enable_rls_tenant_isolation`):
  las 11 tablas del CRM core (`contacts`, `deals`, `tasks`, `pipelines`,
  `pipeline_stages`, `tags`, `contact_tags`, `custom_field_definitions`,
  `contact_activities`, `tenant_modules`, `members`) tienen
  `FORCE ROW LEVEL SECURITY` con una policy `tenant_isolation` que compara
  `tenant_id` contra `current_setting('app.tenant_id')`.
  - **Dos roles de conexión, y la diferencia importa**: `db`
    (`apps/api/src/db/index.ts`, `DATABASE_URL`) conecta como owner de las
    tablas, que en Neon tiene `BYPASSRLS` — con ese rol las policies **no
    se aplican**, ni siquiera con `FORCE`. Por eso existe `tenantDb`
    (`apps/api/src/db/tenant-db.ts`, `DATABASE_URL_APP`), que conecta con
    el rol `plata_app`, sin `BYPASSRLS`. El rol se crea por fuera de las
    migraciones. Si algún día la app conecta todo con el owner, la RLS
    pasa a ser decorativa sin que nada falle a la vista.
  - `tenantMiddleware` abre una transacción sobre `tenantDb`, setea
    `app.tenant_id` con `set_config` y expone esa conexión acotada en
    `c.get('db')`. Las rutas de datos del CRM usan esa, no el `db` global.
  - Es un respaldo del filtro por `tenantId` que ya hace cada query de
    Drizzle — no lo reemplaza, lo cubre si alguna se olvida.
  - Quedan **fuera** de RLS: `tenants` (la tabla que `tenantMiddleware`
    usa para *resolver* el tenant antes de que exista contexto) y las de
    billing (`billing_subscriptions`, `billing_events`,
    `billing_provider_plans`), que también se escriben desde los webhooks
    de MercadoPago/NOWPayments, autenticados por firma y sin tenant de
    sesión.
  - Los webhooks de billing usan el `db` owner a propósito; las rutas
    autenticadas de billing usan `c.get('db')`.
- **Migraciones**: el deploy las corre solo, en un contenedor efímero,
  entre `docker compose build` y `up -d` (ver `.github/workflows/deploy-vps.yml`).
  En producción se usa `dist/db/migrate.js` (migrador de `drizzle-orm`,
  que viaja con las deps de runtime); en local sigue siendo
  `pnpm db:migrate` (drizzle-kit, que es devDependency y no está en la
  imagen). Hasta la 0007 las migraciones se venían aplicando a mano y
  `drizzle.__drizzle_migrations` quedó vacía; se baselineó con las
  migraciones ya aplicadas para que el runner arranque desde la 0008 en
  vez de intentar recrear el schema entero.

### Paquetes compartidos — `packages/shared`
- Tipos TypeScript compartidos entre `web` y `api`
- Sin lógica de negocio, sin dependencias de runtime
- Importado directamente como TypeScript (sin compilación previa)

---

## Estrategia de multi-tenancy

```
PostgreSQL (schema "public", un solo schema)
├── tenants
├── members              (userId ↔ tenantId, un usuario = un tenant)
├── plans / billing_*    (fuera del alcance de RLS, ver arriba)
└── contacts, deals, tasks, pipelines, tags, ...   (tenant_id + RLS)
```

La identificación del tenant se resuelve en `tenantMiddleware`
(`apps/api/src/middleware/tenant.ts`) por:
1. Header `x-tenant-slug` (lo que manda `apps/web`, ver `app-context.tsx`)
2. Si no viene el header, subdominio del `Host` (`{slug}.app.plata.studio`)

Con el slug resuelto, se busca el tenant y se valida la membership del
usuario autenticado (sesión de Better Auth) contra `members`. Recién ahí
se abre la transacción con RLS (`withTenant`) para el resto del request.

---

## Comunicación web ↔ api

| Canal | Uso | Implementación |
|---|---|---|
| **REST** | CRUD estándar, mutations | `fetch` desde Server Actions / Route Handlers |
| **SSE** | Notificaciones en tiempo real, progreso de jobs | `EventSource` en cliente, endpoint SSE en Hono |
| **WebSockets** | Colaboración en tiempo real (futuro) | Reservado para Sprint 4+ |

Las llamadas de Server Components a la API van server-side (sin exposición de tokens al cliente).

---

## Estructura del monorepo

```
crm/
├── apps/
│   ├── web/          Next.js — UI del tenant y web pública
│   └── api/          Hono — API REST + auth + jobs
├── packages/
│   └── shared/       Tipos TypeScript compartidos (sin runtime deps)
├── turbo.json        Pipeline de build/dev/lint/type-check
├── pnpm-workspace.yaml
└── tsconfig.base.json  Config TypeScript base heredada por todos
```

**Reglas de dependencia:**
- `web` puede importar `@crm/shared`
- `api` puede importar `@crm/shared`
- `shared` no importa ningún otro paquete interno
- `web` nunca importa directamente desde `api` (solo via HTTP)

---

## Variables de entorno por ambiente

| Variable | Dev | Staging | Prod |
|---|---|---|---|
| `DATABASE_URL` | PostgreSQL local | Supabase staging | Supabase prod / RDS |
| `REDIS_URL` | Redis local | Upstash staging | Upstash prod |
| `BETTER_AUTH_SECRET` | string local | secret en CI | secret en vault |
| `STRIPE_SECRET_KEY` | clave test | clave test | clave live |
| `ANTHROPIC_API_KEY` | clave personal | clave de equipo | clave prod |
| `PORT` | 3001 | 3001 | definido por plataforma |
| `WEB_URL` | http://localhost:3000 | — | https://app.plata.studio |
| `API_PUBLIC_URL` | http://localhost:3001 | — | https://api.plata.studio |

Las variables solo requeridas por `api` viven en `apps/api/.env`.
Las variables del root `.env` son para herramientas de desarrollo (turbo, scripts globales).

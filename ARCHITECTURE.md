# Arquitectura del Sistema — CRM SaaS LATAM

## Cuatro superficies del sistema

| Superficie | Dominio | Tecnología | Responsabilidad |
|---|---|---|---|
| **Web pública** | `crm.lat` | Next.js 15 (App Router) | Landing, pricing, registro, onboarding |
| **App tenant** | `app.crm.lat` o `{tenant}.crm.lat` | Next.js 15 (App Router) | Dashboard, CRM, cotizaciones, reportes |
| **API** | `api.crm.lat` | Hono + Node.js | REST endpoints, auth, webhooks, jobs |
| **Admin panel** | `admin.crm.lat` | Next.js 15 (App Router) | Gestión de tenants, métricas globales, soporte |

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
- **PostgreSQL 16**: base principal
- **Estrategia multi-tenant**: schema separado por tenant (`tenant_{slug}`)
  - Cada tenant tiene su propio schema con tablas aisladas
  - Schema `public` contiene tablas globales: tenants, planes, billing
  - Row-Level Security como defensa en profundidad adicional

### Paquetes compartidos — `packages/shared`
- Tipos TypeScript compartidos entre `web` y `api`
- Sin lógica de negocio, sin dependencias de runtime
- Importado directamente como TypeScript (sin compilación previa)

---

## Estrategia de multi-tenancy

```
PostgreSQL
├── public (schema global)
│   ├── tenants
│   ├── plans
│   └── billing_events
├── tenant_acme (schema aislado)
│   ├── users
│   ├── leads
│   ├── clients
│   └── ...
└── tenant_globalsrl (schema aislado)
    ├── users
    ├── leads
    └── ...
```

La identificación del tenant se resuelve por:
1. Subdominio: `{slug}.crm.lat` → extrae slug del host
2. Header `X-Tenant-ID` para requests de API directa
3. JWT claim `tenantId` en sesión autenticada

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
| `WEB_URL` | http://localhost:3000 | https://staging.crm.lat | https://app.crm.lat |

Las variables solo requeridas por `api` viven en `apps/api/.env`.
Las variables del root `.env` son para herramientas de desarrollo (turbo, scripts globales).

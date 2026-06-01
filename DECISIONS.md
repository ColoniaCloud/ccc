# Decisiones de Arquitectura

Registro de decisiones técnicas con fecha y justificación.
Formato: contexto → decisión → razón.

---

## 2026-05-30 — Turborepo sobre Nx

**Decisión:** Turborepo como orquestador del monorepo.

**Razón:** Menor configuración inicial y curva de aprendizaje más baja para un equipo pequeño o desarrollador individual. El modelo de caché de Turborepo funciona out-of-the-box con `turbo.json` mínimo. Nx requiere un grafo de proyecto más explícito y plugins por tecnología. Para el scope actual (2 apps + 1 package), Turborepo es suficiente y más rápido de iterar.

---

## 2026-05-30 — React Aria Components + Vanilla CSS sobre Tailwind / shadcn

**Decisión:** React Aria Components para primitivos UI, CSS custom properties (sin Tailwind, sin shadcn).

**Razón:** Tres motivaciones distintas:
1. **Accesibilidad nativa**: React Aria implementa todos los patrones WAI-ARIA correctamente. shadcn delega la accesibilidad al desarrollador; con React Aria es el default.
2. **Control total del diseño**: un sistema de tokens en CSS custom properties (`theme.css`) permite iterar el look & feel sin reaprender una API de utilidades. Los cambios de diseño son cambios de CSS, no de clases en JSX.
3. **Diferenciación visual**: las UIs generadas por IA y los proyectos rápidos convergen en el mismo look de Tailwind/shadcn. Un diseño propio es un activo de producto.

---

## 2026-05-30 — Hono sobre Express / Fastify

**Decisión:** Hono como framework HTTP para `apps/api`.

**Razón:** Hono es edge-ready desde el diseño (corre en Cloudflare Workers, Deno, Bun, Node sin cambios). TypeScript nativo sin tipos separados. Integración directa con Zod para validación de request (`@hono/zod-validator`). DX comparable a Express con performance cercana a Fastify. Permite migrar a edge en el futuro sin reescribir handlers.

---

## 2026-05-30 — Better Auth sobre NextAuth / Auth.js

**Decisión:** Better Auth para autenticación.

**Razón:** Better Auth tiene soporte nativo de organizaciones y multi-tenancy en su modelo de datos. NextAuth/Auth.js está diseñado para aplicaciones single-tenant y requiere extensiones complejas para multi-tenancy. Además, Better Auth no tiene lock-in a Next.js: funciona con cualquier framework HTTP, lo que permite mover la auth a `apps/api` (Hono) sin fricciones. El modelo de sesiones es más controlable que el de NextAuth.

---

## 2026-05-30 — Drizzle ORM sobre Prisma

**Decisión:** Drizzle ORM para acceso a base de datos.

**Razón:** Drizzle escribe queries en SQL real tipado. El desarrollador entiende exactamente qué SQL se genera, sin sorpresas de N+1 o queries subóptimas ocultas. Prisma genera SQL implícito que puede ser difícil de optimizar. Drizzle tiene mejor soporte para schemas dinámicos (necesario para nuestra estrategia de schema-per-tenant). El bundle size de Drizzle es significativamente menor que Prisma Client. TypeScript estricto end-to-end sin codegen intermedio.

---

## 2026-05-30 — pnpm sobre npm / yarn

**Decisión:** pnpm como package manager del monorepo.

**Razón:** pnpm usa hard links para evitar duplicar dependencias en disco — crítico en monorepos donde múltiples apps comparten las mismas versiones de React, TypeScript, etc. El protocolo `workspace:*` para dependencias internas es más explícito que las soluciones de yarn. La resolución de dependencias es más estricta (previene acceso a dependencias no declaradas). Velocidad de instalación superior a npm en CI.

---

## 2026-05-31 — Middleware de Tenant — strip de puerto en header Host

**Contexto:** El middleware tenant.ts extrae el subdominio del header Host para
identificar el tenant en producción. En desarrollo, Host incluye el puerto
(ej: localhost:3001), lo que hacía que "localhost:3001" no matcheara la
exclusion list ["www", "api", "app", "localhost"].

**Decisión:** Aplicar `.replace(/:\d+$/, '')` al valor del header Host antes de
extraer el subdominio.

**Impacto:** Correcto funcionamiento en desarrollo y producción.

---

## Infraestructura de producción — Fly.io + Neon en lugar de Railway completo

**Fecha:** 2026-05-31
**Contexto:** La Parte D original del Sprint 1 planificaba Railway para API + DB.
Railway subió precios y tiene un modelo de costo menos predecible a escala.
**Decisión:**
- API → Fly.io (región gru, São Paulo). shared-cpu-1x, 256MB RAM, scale-to-zero.
  Costo estimado: ~$2-3 USD/mes vs ~$10-15 USD/mes en Railway.
- DB producción → Neon (mismo proveedor que dev, proyecto separado).
  Escala a cero. Free tier cubre el MVP.
- Redis (Sprint 2+) → Upstash. Cobra por request, no por instancia.
**Impacto:** Stack de infraestructura MVP cuesta ~$2-3 USD/mes total
en lugar de ~$15 USD/mes. Sin cambios en el código de la API.

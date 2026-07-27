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

---

## Infraestructura de producción — Render en lugar de Fly.io

**Fecha:** 2026-07-17
**Contexto:** Fly.io eliminó su free tier permanente en 2024 — cuentas nuevas
requieren tarjeta cargada desde el primer deploy. Para la etapa de pruebas del
MVP (todavía sin usuarios reales pagando) se evaluaron Render, Railway y
Hostinger. Railway ya había quedado descartado por precio impredecible (ver
decisión anterior) y en 2026 su free tier se redujo a $1 USD/mes de crédito,
peor que antes. Hostinger tiene hosting Node.js administrado, pero no está
pensado para monorepos pnpm ni para procesos siempre-activos con conexión
persistente a Postgres — hubiera requerido VPS con setup manual (Nginx, PM2,
Certbot) para replicar lo que Render da de fábrica.
**Decisión:**
- API + Web → Render, un service "Free" para cada app, definidos en un solo
  `render.yaml` en la raíz del repo (soporta el monorepo pnpm sin cambios de
  código). Deploy automático en cada push a `main` vía conexión a GitHub.
  Costo: $0/mes mientras el uso esté dentro de las 750 horas gratis/mes.
- Se abandona el deploy en Fly.io (`fly.toml`, `apps/api/Dockerfile` quedan
  en el repo sin uso, no se borraron).
**Trade-off aceptado:** los services free de Render "duermen" a los 15 min sin
tráfico y tardan ~1 min en despertar. Para un webhook de MercadoPago/NOWPayments
que llega dormido, el proveedor reintenta y termina procesándose, solo con
demora la primera vez — aceptable en etapa de pruebas, a revisar antes de
tener usuarios pagando en producción real (ahí conviene un plan pago sin sleep,
o volver a Fly.io/VPS).
**Impacto:** Stack de infraestructura MVP pasa a $0 USD/mes durante pruebas.
Sin cambios en el código de las apps — mismos scripts `build`/`start` que ya
usaba Fly.io.

---

## 2026-07-26 — Multi-tenant: confirmado single-org por usuario

**Contexto:** ARCHITECTURE.md documentaba una estrategia schema-per-tenant
que nunca se implementó — el código real usa fila-por-tenant (`tenant_id`
en cada tabla) desde el sprint de módulos. Además, `members` tenía un
unique compuesto `(userId, tenantId)` que en teoría permitía que un
usuario perteneciera a varias organizaciones, aunque el onboarding ya
bloqueaba crear una segunda membership en código (409 si ya existe una).
Ningún lugar del producto (ni el front) soporta elegir/cambiar de
organización.

**Decisión:** Un usuario pertenece a una sola organización. Se cambia el
unique de `members` a `userId` solo (migración
`0008_single_org_and_tenant_status`), convirtiendo en garantía de base de
datos lo que ya era una regla de la aplicación.

**Impacto:** Si en el futuro hace falta multi-org por usuario (invitar al
mismo email a dos tenants distintos), hay que revertir esta migración y
construir el selector de organización — no es una limitación técnica de
fondo, es una simplificación deliberada para el alcance actual.

---

## 2026-07-27 — RLS: el rol de conexión es la mitad del mecanismo

**Contexto:** La RLS se implementó en `0007_enable_rls_tenant_isolation`
(FORCE RLS sobre las 11 tablas del CRM core, policy contra
`current_setting('app.tenant_id')`). En paralelo se había preparado una
implementación alternativa que conectaba con `DATABASE_URL` — el rol owner
de las tablas — dando por sentado que `FORCE ROW LEVEL SECURITY` alcanzaba
para que las policies aplicaran también al owner.

**Decisión:** Se confirma el diseño de dos roles. En Neon el rol
`neondb_owner` tiene `BYPASSRLS = true`, y `BYPASSRLS` gana sobre `FORCE`:
con ese rol las policies no se evalúan nunca. Una RLS servida por el owner
no protege nada y además no falla de ninguna manera visible — las queries
siguen devolviendo exactamente lo mismo que antes. Por eso el runtime
conecta con `plata_app` (`DATABASE_URL_APP`, sin `BYPASSRLS`) para todo
request con tenant resuelto, y el owner queda para migraciones, webhooks y
la resolución del tenant previa al contexto.

Regla práctica para el futuro: verificar `rolbypassrls` del rol con el que
conecta la app antes de dar por buena cualquier policy.

**Impacto:** Sin `DATABASE_URL_APP` la API no arranca (falla explícita en
`db/tenant-db.ts`), que es el comportamiento deseado: es preferible no
levantar a levantar con la RLS desactivada en silencio. El rol se crea
por fuera de las migraciones, así que una base nueva necesita ese paso
manual antes del primer deploy.

**Nota sobre el pool:** cada request con tenant retiene una conexión de
`tenantDb` mientras dura (es una transacción abierta, no una query
suelta). El pool pasó de su default de 10 a 20, configurable con
`DATABASE_POOL_MAX`. Queda pendiente que el checkout de billing mantiene
esa transacción abierta durante la llamada HTTP a MercadoPago/NOWPayments.

---

## 2026-07-27 — Las migraciones dejan de correrse a mano

**Contexto:** El deploy al VPS (`deploy-vps.yml`) construía y levantaba los
contenedores pero nunca corría migraciones: se venían aplicando a mano.
Como efecto secundario, `drizzle.__drizzle_migrations` quedó vacía con el
schema ya en la 0007 — cualquier migrador arrancando desde ahí habría
intentado recrear el schema entero.

**Decisión:** El deploy corre `dist/db/migrate.js` en un contenedor
efímero entre el `build` y el `up -d`, y se baselineó la tabla de tracking
con las migraciones 0000-0007 ya aplicadas. Se usa el migrador de
`drizzle-orm` y no drizzle-kit porque este último es devDependency y no
existe en la imagen de producción.

Migrar **antes** del swap de contenedores deja una ventana de segundos
donde el código viejo ve el schema nuevo. Es el orden menos malo: migrar
después significa que el código nuevo consulta columnas que todavía no
existen y tira 500 en cada request, y además un fallo de migración ya no
podría abortar el deploy. Si el downtime de esos segundos deja de ser
aceptable, la salida es expand/contract (migraciones compatibles hacia
atrás en dos pasos), no reordenar estos comandos.

**Impacto:** Las migraciones nuevas se aplican solas al pushear a main. La
contracara es que una migración destructiva ahora corre sin que nadie la
mire: el filtro es la revisión del `.sql` antes del merge.

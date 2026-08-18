# Google Analytics — separar datos de la web pública y de la app

## Por qué es un problema mezclarlos

`apps/web` es **un solo Next.js**, y `app/layout.tsx` (el root layout) envuelve
tanto la landing pública (`plata.studio`, `www.plata.studio`) como el CRM
autenticado (`app.plata.studio`). Si se pone un único tag de GA en ese layout
raíz, todo cae en la misma propiedad: sesiones de visitantes anónimos
navegando `/precios` se mezclan con sesiones de usuarios logueados con la
pestaña de `/app/pipeline` abierta ocho horas. Son dos comportamientos y dos
objetivos completamente distintos:

- **Web (marketing)**: funnel de adquisición — de dónde vienen las visitas,
  qué páginas convierten a "Empezá gratis", bounce rate, SEO.
- **App (producto)**: uso del producto — qué módulos se usan, retención,
  fricción en el onboarding, adopción de features. Métricas como "duración
  de sesión" o "bounce rate" no significan lo mismo acá (un usuario puede
  tener la app abierta todo el día sin interactuar).

Mezclarlos rompe ambos análisis: el funnel de marketing queda inflado con
actividad de usuarios ya convertidos, y las métricas de producto quedan
contaminadas con tráfico de gente que nunca se registró.

## Decisión recomendada: dos propiedades GA4 separadas

- **"Plata — Web"**: stream para `plata.studio` (cubre `www.plata.studio`
  también — mismo dominio registrable, no hace falta un stream por
  subdominio para eso).
- **"Plata — App"**: stream separado para `app.plata.studio`.

Dos propiedades (no dos streams de la misma propiedad) porque los reportes
estándar de GA4 (funnels, exploraciones, audiencias) operan a nivel de
propiedad — mezclarlos en streams de una sola propiedad todavía permite que
un reporte sin filtrar junte ambos. Separar en propiedades hace que sea
**imposible** mezclarlos por accidente, y cada equipo (marketing vs
producto) mira su propiedad sin tener que acordarse de aplicar un filtro.

**Trade-off aceptado**: se pierde la continuidad de sesión automática de GA
entre `plata.studio` → `app.plata.studio` (ej. no hay un reporte nativo de
"usuario vino de una campaña de Google Ads y 3 días después se registró"
dentro de GA). Eso se resuelve con atribución por UTM guardada en el propio
backend (ver más abajo), que además es más confiable a mediano plazo que
la atribución de GA (que además está cada vez más degradada por bloqueadores
e ITP/cookies de terceros).

---

## Paso 1 — Crear las propiedades en Google Analytics

1. [analytics.google.com](https://analytics.google.com/) → Admin → **Create
   Property**.
2. Propiedad 1: `Plata — Web`. Zona horaria: Uruguay (GMT-3) o la que use el
   negocio. Moneda: UYU.
   - Dentro, **Data Streams → Add stream → Web** → URL `https://plata.studio`.
   - Anotar el **Measurement ID** (`G-XXXXXXX`).
3. Propiedad 2: `Plata — App (producto)`. Mismo huso horario.
   - **Data Streams → Add stream → Web** → URL `https://app.plata.studio`.
   - Anotar el **Measurement ID** (`G-YYYYYYY`).
4. En la propiedad de App, ir a **Data Settings → Data Collection** y
   **desactivar** "Google signals" y la personalización de ads — es
   analítica de producto sobre usuarios logueados, no tiene sentido (ni es
   deseable) alimentar remarketing con eso.

## Paso 2 — Search Console (relacionado, hacerlo junto)

Dar de alta **dos propiedades separadas** en Search Console también:
`https://plata.studio` (dominio, cubre `www` y `plata.studio` con verificación
DNS) y no dar de alta `app.plata.studio` — no tiene contenido indexable, ver
el documento de SEO para el detalle de por qué debe bloquearse el rastreo ahí.

## Paso 3 — Variables de entorno

En `apps/web` (local `.env.local`, y como env var en el VPS — se inyecta en
build-time del contenedor `crm-web`, igual que `NEXT_PUBLIC_API_URL` en
`deploy/docker-compose.yml`):

```bash
NEXT_PUBLIC_GA_WEB_ID=G-XXXXXXX
NEXT_PUBLIC_GA_APP_ID=G-YYYYYYY
```

No son secretos (un Measurement ID es público por diseño, viaja en el HTML),
pero igual conviene documentarlos en `apps/web/.env.example` si se crea uno,
y agregarlos como build arg en `deploy/docker-compose.yml` junto a
`NEXT_PUBLIC_API_URL` (`apps/web/Dockerfile` tiene que aceptarlos como
`ARG`/`ENV` igual que ya hace con `NEXT_PUBLIC_API_URL`).

## Paso 4 — Un único helper para decidir "qué superficie es esta request"

Hoy la lista de hosts de marketing vive solo en `apps/web/src/middleware.ts`
(`MARKETING_HOSTS`). Conviene extraerla a un módulo compartido para no
duplicar la lógica entre el middleware y el layout que carga GA:

`apps/web/src/lib/surface.ts` (nuevo archivo):

```ts
const MARKETING_HOSTS = (process.env.MARKETING_HOSTS ?? '')
  .split(',')
  .map((h) => h.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/+$/, ''))
  .filter(Boolean)

export type Surface = 'marketing' | 'app'

export function getSurface(host: string | null): Surface {
  const clean = (host ?? '').toLowerCase().replace(/:\d+$/, '')
  return MARKETING_HOSTS.includes(clean) ? 'marketing' : 'app'
}
```

Actualizar `middleware.ts` para importar `MARKETING_HOSTS`/`getSurface` de
ahí en vez de redefinirlo (elimina la duplicación, no cambia el
comportamiento).

## Paso 5 — Cargar el GA correcto en `app/layout.tsx`

Usar `@next/third-parties` (paquete oficial de Next.js, ya pensado para
este caso — carga `gtag.js` de forma optimizada con `next/script`):

```bash
pnpm --filter @crm/web add @next/third-parties
```

`apps/web/src/app/layout.tsx` es Server Component — puede leer el header
`Host` de la request con `headers()` de `next/headers`:

```tsx
import { headers } from 'next/headers'
import { GoogleAnalytics } from '@next/third-parties/google'
import { getSurface } from '@/lib/surface'

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const host = (await headers()).get('host')
  const surface = getSurface(host)
  const gaId = surface === 'marketing'
    ? process.env.NEXT_PUBLIC_GA_WEB_ID
    : process.env.NEXT_PUBLIC_GA_APP_ID

  return (
    <html lang="es" className={/* sin cambios */}>
      <body>
        {children}
        {gaId && <GoogleAnalytics gaId={gaId} />}
      </body>
    </html>
  )
}
```

Esto garantiza que **cada request carga un solo Measurement ID**, decidido
por dominio — no hay forma de que un pageview de `app.plata.studio` termine
en la propiedad de Web ni viceversa, porque no es una decisión en el
cliente (que se podría bypassear o tener condiciones de carrera), es
server-side antes de que se arme el HTML.

## Paso 6 — Qué NO debe llegar nunca a GA desde la app

La propiedad "App" mide producto sobre usuarios reales con PII disponible en
el frontend (`me.user`, `me.tenant` de `app-context.tsx`). Reglas duras:

- **Nunca** mandar `email` ni `name` como parámetro de evento ni como
  `user_id`. Si se quiere análisis a nivel de usuario, usar el `id` interno
  de Better Auth (`user.id`, string random sin significado) como `user_id`
  de GA vía `gtag('config', gaId, { user_id: internalId })` — nunca el
  email.
- **Nunca** mandar `tenant.name` completo en texto libre si el nombre de la
  organización puede ser sensible (razón social real de un cliente) — si
  hace falta segmentar por tenant, usar `tenant.id` (UUID) como
  `user_property`, no el nombre.
- Eventos de negocio ya identificables por sí solos (crear un contacto, mover
  un deal de etapa, completar el onboarding) son útiles para producto y no
  llevan PII si se registran solo como el nombre del evento + metadata no
  personal (ej. `module_key`, `pipeline_stage_id`), no el contenido del
  contacto creado.

## Paso 7 — Atribución marketing → producto sin mezclar GA

Para no perder "esta persona vino de una campaña y se convirtió" al separar
propiedades:

1. Cuando alguien cae en `plata.studio` con `utm_source`/`utm_campaign` en la
   URL, guardarlos en una cookie de primera parte de corta duración (ej.
   `plata_utm`, 30 días, dominio `.plata.studio` para que sobreviva el salto
   a `app.plata.studio` en el signup).
2. En el submit de `sign-up` (`apps/web/src/app/auth/sign-up/page.tsx`),
   mandar esos valores al backend junto con el alta (nuevo campo opcional en
   el payload de registro u onboarding) y guardarlos en `tenants` o en una
   tabla `tenant_acquisition` — dato propio, no depende de que GA pueda
   correlacionar entre propiedades.
3. Esto también es más robusto a futuro: Safari (ITP) y Firefox ya bloquean
   cookies de terceros y limitan las de primera parte entre navegaciones
   top-level en muchos casos — depender de que GA linkee sesiones entre
   `plata.studio` y `app.plata.studio` es cada vez menos confiable de
   cualquier forma.

## Paso 8 — Verificación

1. Deploy con las dos env vars cargadas.
2. `view-source:https://plata.studio` → confirmar que el script de GA carga
   `G-XXXXXXX` (Web).
3. `view-source:https://app.plata.studio/auth/sign-in` → confirmar que carga
   `G-YYYYYYY` (App) — **antes de loguearse** ya se debe ver el ID correcto,
   porque `getSurface` decide por dominio, no por sesión.
4. GA4 → **DebugView** en cada propiedad (agregar `?gtm_debug=1` o usar la
   extensión GA Debugger) → generar un evento en cada dominio y confirmar
   que aparece solo en su propiedad correspondiente, nunca en la otra.
5. Consentimiento: si en algún momento se agrega un banner de cookies (ver
   nota abajo), verificar que Consent Mode v2 esté configurado en **ambas**
   propiedades antes de ir a producción.

## Nota — consentimiento de cookies

Uruguay no tiene todavía una ley de protección de datos con el nivel de
exigencia de cookie banners que GDPR (UE), pero si Plata capta clientes en
mercados con esa exigencia (o simplemente como buena práctica), conviene
implementar [Google Consent Mode
v2](https://developers.google.com/tag-platform/security/guides/consent) en
la propiedad **Web** (visitantes anónimos, aplica consentimiento clásico de
cookies de marketing). En la propiedad **App**, al ser usuarios ya
autenticados con una relación contractual (términos de servicio aceptados en
el signup), la base legal suele ser "interés legítimo" para analítica de
producto — de todos modos, confirmar con quien maneje el aspecto legal del
producto antes de asumir esto como definitivo.

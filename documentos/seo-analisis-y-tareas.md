# Análisis de SEO — estado actual y plan de tareas

Base del análisis: código real de `apps/web` (no hay acceso a Search
Console/Analytics históricos desde acá, así que esto es una auditoría
técnica y de estructura, no de rankings ni de tráfico actual).

## Lo que ya está bien

- **Next.js 15 con App Router / RSC**: el contenido de marketing se renderiza
  en el servidor, es 100% crawleable sin depender de que Google ejecute JS —
  la base técnica es sólida, no hay que pelear contra un SPA client-only.
- **`<html lang="es">`** seteado en `app/layout.tsx` — correcto para el
  público objetivo.
- **OpenGraph/Twitter cards a nivel global** (`app/layout.tsx`): título,
  descripción, imagen 1200×630, `metadataBase` resuelto por env var — la
  base para que un link de Plata se vea bien compartido en WhatsApp/X/
  LinkedIn ya existe.
- **URLs limpias y en español** (`/herramientas`, `/modulos`, `/precios`,
  `/contacto`) — descriptivas, sin querystrings ni IDs, alineadas al idioma
  del usuario buscando en LATAM.
- **Fuentes vía `next/font`** (`Nunito_Sans`, `Noto_Sans`) — evita
  render-blocking de Google Fonts vía `<link>` tradicional, ya optimizado
  para Core Web Vitals (CLS/LCP) sin trabajo extra.
- **Separación por dominio ya resuelta a nivel de middleware** — la landing
  pública no compite ni se mezcla con contenido autenticado en el mismo
  árbol de rutas indexable.

## Gaps encontrados (de mayor a menor impacto)

### 1. Cada página de marketing usa el mismo `<title>`/`<meta description>` genérico

Ninguna de `marketing/page.tsx`, `herramientas/page.tsx`, `modulos/page.tsx`,
`precios/page.tsx`, `contacto/page.tsx` exporta `metadata`. Todas heredan el
título/descripción del root layout (`"Plata"` / `"Plata — CRM SaaS para
Latinoamérica"`). Para Google esto es la diferencia entre 5 páginas
compitiendo por keywords distintas y 5 páginas que parecen la misma página
duplicada — es probablemente el gap de mayor impacto de todos los
encontrados, y el más barato de arreglar.

### 2. No existe `robots.txt` ni `sitemap.xml`

No hay `app/robots.ts` ni `app/sitemap.ts` (convenciones nativas de Next 15).
Sin sitemap, Google depende solo de crawleo por links para descubrir las
páginas — funciona, pero es más lento y menos confiable, sobre todo para
contenido nuevo (blog, si se agrega). Sin `robots.txt`, tampoco hay una
directiva explícita para bloquear `app.plata.studio` del índice (ver punto
3).

### 3. `app.plata.studio` no tiene ninguna barrera contra indexación

El dominio de la app autenticada (`/auth/sign-in`, `/onboarding`, `/app/*`,
`/admin`) no tiene `noindex` en ningún lado. Si Google llega a indexar
`app.plata.studio/auth/sign-in`, es contenido sin valor para quien busca
(una pantalla de login) y compite en el índice contra la landing real. Hay
que bloquearlo explícitamente — no asumir que "nadie le va a poner un link"
es suficiente.

### 4. Posible contenido duplicado `www.plata.studio` vs `plata.studio`

El router de Traefik (`deploy/docker-compose.yml`) matchea
`Host(plata.studio) || Host(www.plata.studio) || Host(app.plata.studio)`
contra el mismo servicio, sirviendo el mismo contenido en ambos hosts sin
un redirect 301 de uno a otro ni un `<link rel="canonical">` que le diga a
Google cuál es la versión "real". Es un caso clásico de duplicado
www/non-www que divide el "link equity" entre dos URLs en vez de
consolidarlo en una.

### 5. Sin datos estructurados (JSON-LD)

No hay `Organization`, `SoftwareApplication`/`Product` ni `FAQPage` schema
en ninguna página. Para un SaaS, `Organization` (en el layout raíz) y
`Product`/`Offer` en `/precios` habilitan rich snippets (precio, rating si
en algún momento hay reviews) que mejoran el CTR en resultados de búsqueda
sin cambiar el ranking en sí.

### 6. Ícono de Apple Touch en SVG, no PNG

`metadata.icons.apple` apunta a `/icon.svg`. Soporte de SVG como apple-touch-
icon es inconsistente en versiones más viejas de iOS/Safari — el estándar
seguro es un PNG 180×180 dedicado.

### 7. Sin sección de contenido/blog

No hay ninguna ruta de contenido educativo (`/blog`, `/guias`, etc.). Para
un CRM compitiendo por SEO en LATAM, contenido evergreen ("cómo armar un
pipeline de ventas", "plantilla de seguimiento de clientes") suele ser el
canal orgánico de mayor volumen a mediano plazo, mucho más que las páginas
transaccionales (`/precios`, `/modulos`) por sí solas. No es un bug, es una
inversión a evaluar — se incluye en la lista de tareas como ítem estratégico,
no técnico.

### 8. Sin `next/image` en marketing (bajo impacto hoy)

Los assets actuales son todos SVG (logos), así que no hay una foto/screenshot
pesada sin optimizar todavía. Queda como nota para cuando se agreguen
capturas de producto o fotos a la landing — usar `next/image` desde el día
uno de esas páginas, no como refactor después.

### 9. Migración a shadcn/Tailwind en curso — riesgo de Core Web Vitals si queda a medias

Hay cambios sin commitear que migran `marketing.css` y `theme.css` al preset
de shadcn (166 líneas removidas de `marketing.css`, moviendo estilos a
utilities de Tailwind). Mientras la migración esté a medio camino entre
React Aria + CSS propio y shadcn + Tailwind, hay riesgo de CSS duplicado o
sin usar viajando al bundle. No es un problema hoy, pero conviene medir
Lighthouse/PageSpeed **antes y después** de terminar la migración completa
(landing + shell de la app), no solo confiar en que "se ve bien".

---

## Lista de tareas

### Rápidas / alto impacto (hacer primero)

- [ ] Agregar `export const metadata` (title + description únicos, pensados
      para keyword de esa página) a `marketing/page.tsx`, `herramientas/page.tsx`,
      `modulos/page.tsx`, `precios/page.tsx`, `contacto/page.tsx`.
- [ ] Crear `apps/web/src/app/robots.ts` que sirva reglas distintas según
      `host` (marketing hosts: `Allow: /`; `app.plata.studio`: `Disallow: /`).
- [ ] Crear `apps/web/src/app/sitemap.ts` con las 5 URLs de marketing
      (excluir todo lo de `/app`, `/auth`, `/onboarding`, `/admin`).
- [ ] Agregar `X-Robots-Tag: noindex` (o meta `robots: noindex` en el layout
      de `/app`, `/auth`, `/onboarding`, `/admin`) como segunda capa además
      del `robots.ts` — no depender de un solo mecanismo.
- [ ] Decidir dominio canónico (`plata.studio` vs `www.plata.studio`) y
      resolver el duplicado: opción simple es agregar un redirect 301 en
      Traefik del que no se use hacia el canónico; alternativa más liviana es
      agregar `<link rel="canonical">` explícito por página apuntando siempre
      a la versión sin `www`.
- [ ] Reemplazar el apple-touch-icon SVG por un PNG 180×180 dedicado.

### Medianas (siguiente sprint de marketing)

- [ ] JSON-LD `Organization` en el layout raíz de marketing (nombre, logo,
      URL, mismas redes que se linkeen en el footer).
- [ ] JSON-LD `Product`/`Offer` en `/precios` con los planes reales.
- [ ] Si `/herramientas` o `/precios` tienen (o van a tener) preguntas
      frecuentes, marcarlas con `FAQPage` schema — habilita el acordeón de
      preguntas directamente en el resultado de búsqueda.
- [ ] Dar de alta el dominio en Google Search Console (verificación DNS a
      nivel de dominio, cubre `www` y apex en una sola propiedad) y en Bing
      Webmaster Tools.
- [ ] Enviar el `sitemap.xml` recién creado en Search Console apenas esté en
      producción.
- [ ] Medir Core Web Vitals (PageSpeed Insights / Lighthouse CI) de la
      landing antes de terminar la migración a shadcn/Tailwind, y de nuevo al
      cerrarla, para detectar regresiones de bundle size a tiempo.

### Estratégicas (a evaluar con el negocio, no solo técnicas)

- [ ] Investigación de keywords por país objetivo (México, Argentina,
      Colombia, Uruguay no necesariamente buscan "CRM" con el mismo volumen
      ni las mismas variantes — "software de ventas", "gestión de clientes",
      etc.) — esto no se resuelve leyendo el código, requiere research
      externo (Google Keyword Planner / Search Console una vez con datos).
  - [ ] Evaluar lanzar `/blog` con contenido evergreen de ventas/CRM en
        español LATAM como canal de adquisición orgánica de mediano plazo.
      - [ ] Si se lanza, definir estructura de URLs (`/blog/[slug]`),
            metadata dinámica por post, y sitemap dinámico que incluya los
            posts.
  - [ ] Revisar copy de `/precios` y `/modulos` con las keywords reales una
        vez completada la investigación — hoy el copy fue escrito sin ese
        research, así que puede estar dejando volumen de búsqueda real sobre
        la mesa.
  - [ ] hreflang / variantes regionales: hoy es un solo `es` genérico —
        evaluar si hace falta diferenciar copy/precio por país (moneda ya es
        un tema aparte: MercadoPago hoy solo cobra en UYU con tipo de cambio
        fijo) antes de invertir en hreflang, que solo tiene sentido si el
        contenido efectivamente varía por región.

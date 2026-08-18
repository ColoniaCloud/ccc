# SSO con Google y Microsoft — guía paso a paso

Estado de partida: la app usa **Better Auth** (`apps/api/src/lib/auth.ts`) con
solo `emailAndPassword` habilitado. El schema de DB (`apps/api/src/db/schema/auth.ts`)
**ya tiene** la tabla `account` con `providerId`, `accountId`, `accessToken`,
`refreshToken`, `idToken`, `scope` — es el schema estándar de Better Auth,
preparado para proveedores OAuth. **No hace falta ninguna migración de DB**
para agregar Google/Microsoft, solo configuración.

Auth está montado en `/api/auth/*` (`apps/api/src/index.ts:48`), así que las
URLs de callback son:

- Prod: `https://api.plata.studio/api/auth/callback/google` y `.../callback/microsoft`
- Dev: `http://localhost:3001/api/auth/callback/google` y `.../callback/microsoft`

---

## Parte A — Google

### 1. Crear el proyecto y la pantalla de consentimiento

1. Entrar a [Google Cloud Console](https://console.cloud.google.com/) → crear
   un proyecto (o reusar uno existente) para "Plata".
2. Ir a **APIs & Services → OAuth consent screen**.
   - User type: **External** (usuarios de cualquier cuenta Google, no solo
     Workspace interno).
   - App name: `Plata`. Support email: el que corresponda.
   - Logo: subir `apps/web/public/isologo.svg` exportado a PNG (Google exige
     PNG/JPG, no SVG).
   - Authorized domains: `plata.studio`.
   - Scopes: dejar solo los no sensibles por defecto — `email`, `profile`,
     `openid`. No hace falta pedir nada más.
   - Test users: mientras la app esté en modo "Testing", agregar los emails
     que vayan a probar el login. Para producción real hay que mandar la app
     a **verificación de Google** (pantalla "In production") — con scopes
     básicos (`email`, `profile`, `openid`) la verificación suele ser rápida
     y sin revisión humana extensa.

### 2. Crear las credenciales OAuth

1. **APIs & Services → Credentials → Create Credentials → OAuth client ID**.
2. Application type: **Web application**.
3. Name: `Plata - API` (o similar, es solo interno).
4. **Authorized JavaScript origins**:
   - `https://app.plata.studio`
   - `https://plata.studio`
   - `https://www.plata.studio`
   - `http://localhost:3000` (dev)
5. **Authorized redirect URIs**:
   - `https://api.plata.studio/api/auth/callback/google`
   - `http://localhost:3001/api/auth/callback/google` (dev)
6. Guardar → copiar **Client ID** y **Client Secret**.

### 3. Variables de entorno

Agregar en `apps/api/.env` (local) y en el `.env` del VPS
(`deploy/.env` — no se commitea, ver `deploy/.env.example`):

```bash
GOOGLE_CLIENT_ID=xxxxxxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=xxxxxxxx
```

Actualizar también `apps/api/.env.example` y `deploy/.env.example` con las
claves vacías, para que quede documentado (mismo patrón que ya usan
`MERCADOPAGO_*`/`NOWPAYMENTS_*` en esos archivos).

---

## Parte B — Microsoft (Entra ID / Azure AD)

### 1. Registrar la aplicación

1. Entrar a [Azure Portal](https://portal.azure.com/) → **Microsoft Entra ID
   → App registrations → New registration**.
2. Name: `Plata`.
3. **Supported account types** — esta elección importa para el `tenantId`
   que después va en el código:
   - **"Accounts in any organizational directory and personal Microsoft
     accounts"** (multitenant + cuentas personales outlook/hotmail) → esta es
     la opción recomendada para un SaaS público como Plata, donde no se sabe
     de antemano en qué org de Microsoft está cada cliente. El `tenantId` a
     usar después es el literal `common`.
   - Si en algún momento Plata se vendiera solo a empresas con Microsoft 365
     propio, ahí sí conviene "Accounts in any organizational directory"
     (sin personales) con `tenantId: organizations`.
4. **Redirect URI**: tipo **Web**, valor
   `https://api.plata.studio/api/auth/callback/microsoft`. Agregar también
   `http://localhost:3001/api/auth/callback/microsoft` como URI adicional
   (Azure permite varias).
5. Registrar.

### 2. Crear el client secret

1. En la app recién creada: **Certificates & secrets → Client secrets → New
   client secret**.
2. Expiración: elegir 12 o 24 meses (Microsoft no permite "nunca expira"
   para secrets nuevos). **Anotar la fecha de expiración en un calendario o
   recordatorio** — a diferencia de Google, esto vence y hay que rotarlo.
3. Copiar el **Value** del secret apenas se crea (no se vuelve a mostrar
   completo después).
4. **Overview** de la app → copiar el **Application (client) ID**.

### 3. Permisos (API permissions)

Por defecto ya viene `User.Read` (Microsoft Graph, delegado) — alcanza para
login básico (email, nombre, foto de perfil). No hace falta agregar nada más
para SSO simple.

### 4. Variables de entorno

```bash
MICROSOFT_CLIENT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
MICROSOFT_CLIENT_SECRET=xxxxxxxx
MICROSOFT_TENANT_ID=common
```

Mismo lugar que Google: `apps/api/.env`, `apps/api/.env.example`,
`deploy/.env` en el VPS, `deploy/.env.example`.

---

## Parte C — Cambios en el backend (`apps/api`)

Editar `apps/api/src/lib/auth.ts` para agregar `socialProviders`:

```ts
export const auth = betterAuth({
  secret: process.env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema: { user, session, account, verification },
  }),
  emailAndPassword: {
    enabled: true,
  },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    },
    microsoft: {
      clientId: process.env.MICROSOFT_CLIENT_ID!,
      clientSecret: process.env.MICROSOFT_CLIENT_SECRET!,
      tenantId: process.env.MICROSOFT_TENANT_ID ?? 'common',
    },
  },
  account: {
    accountLinking: {
      enabled: true,
      trustedProviders: ['google', 'microsoft'],
    },
  },
  trustedOrigins: getAllowedOrigins(),
  advanced: isProduction ? { /* sin cambios */ } : undefined,
})
```

**Por qué `accountLinking`**: sin esto, si alguien ya se registró con
email/password (`juan@empresa.com`) y después toca "Continuar con Google"
usando esa misma cuenta de Gmail, Better Auth por defecto puede rechazar el
login o crear un usuario separado con el mismo email (rompe el unique de
`user.email`). Con `accountLinking.enabled` y el proveedor en
`trustedProviders`, Better Auth vincula la cuenta Google al mismo `user`
existente **siempre que el email venga verificado por el proveedor** (Google
y Microsoft siempre lo marcan verificado). Es el comportamiento correcto acá
porque el email es el identificador real de la persona en todo el sistema
(onboarding, membership, billing).

No hace falta tocar `apps/api/src/routes/auth.ts` — ya delega todo el
handling a `auth.handler(c.req.raw)`, Better Auth resuelve las rutas
`/api/auth/sign-in/social`, `/api/auth/callback/:provider`, etc. por dentro.

---

## Parte D — Cambios en el frontend (`apps/web`)

### 1. Botones de SSO en sign-in y sign-up

`apps/web/src/lib/auth.ts` ya expone `signIn` del `authClient` de Better
Auth — el método social es `signIn.social(...)`, no hace falta agregar
nada al cliente.

En `apps/web/src/app/auth/sign-in/page.tsx`, agregar debajo del formulario
de email/password (mismo patrón para `sign-up/page.tsx`):

```tsx
import { Separator } from '@/components/ui/separator'

// dentro del componente:
async function handleSocial(provider: 'google' | 'microsoft') {
  await signIn.social({
    provider,
    callbackURL: '/app', // AppLayout ya redirige a /onboarding si falta completar
  })
}

// en el JSX, después del <form>:
<div className="auth-divider">
  <Separator />
  <span>o continuá con</span>
  <Separator />
</div>

<div className="flex flex-col gap-2">
  <Button type="button" variant="outline" className="w-full" onClick={() => handleSocial('google')}>
    Continuar con Google
  </Button>
  <Button type="button" variant="outline" className="w-full" onClick={() => handleSocial('microsoft')}>
    Continuar con Microsoft
  </Button>
</div>
```

Notas:

- `callbackURL: '/app'` es suficiente: `apps/web/src/app/app/layout.tsx` ya
  consulta `/api/onboarding/status` al montar y redirige a `/onboarding` si
  el tenant no está creado — el flujo de alta de organización funciona
  igual para usuarios que entraron por SSO, no hay que duplicarlo.
- `signIn.social` hace un redirect de página completa (no es un popup) —
  no hace falta manejar el retorno manualmente, Better Auth setea la cookie
  de sesión en el callback y el browser navega a `callbackURL` solo.
- Para los íconos de marca (G de Google, logo de Microsoft), no hay que
  agregar una librería nueva: `hugeicons` (ya instalado, ver
  `components.json` → `iconLibrary: hugeicons`) no trae logos de marca por
  licencia — lo simple y suficiente es texto ("Continuar con Google/
  Microsoft"), que es además lo que piden las brand guidelines de ambos
  para no usar el logo de forma incorrecta.

### 2. Nada que tocar en `app-context.tsx` ni en el middleware

El tenant se resuelve por `x-tenant-slug` + sesión de Better Auth
(`apps/web/src/app/app/app-context.tsx`, `apps/api/src/middleware/tenant.ts`)
— es agnóstico a cómo se autenticó el usuario. SSO no requiere cambios ahí.

---

## Parte E — Checklist de pruebas

**Dev (local):**
1. Levantar `apps/api` y `apps/web` con las env vars de Google/Microsoft
   cargadas (ambos proveedores toleran `http://localhost` en las redirect
   URIs registradas).
2. Sign-in con Google desde cero (cuenta que nunca usó Plata) → debe crear
   `user` + `account` (`providerId: 'google'`) → debe caer en `/onboarding`.
3. Sign-in con Microsoft desde cero → mismo resultado.
4. Registrarse con email/password usando un email X → cerrar sesión →
   "Continuar con Google" con una cuenta Google que use ese mismo email X →
   debe loguear a la **misma cuenta** (mismo tenant), no crear una duplicada.
5. Repetir sign-in social una segunda vez con la misma cuenta → debe ser
   directo, sin volver a pasar por onboarding.

**Producción:**
1. Cargar `GOOGLE_CLIENT_ID/SECRET` y `MICROSOFT_CLIENT_ID/SECRET/TENANT_ID`
   en `deploy/.env` del VPS (nunca en el repo).
2. Confirmar que las redirect URIs de producción (`api.plata.studio/...`)
   estén dadas de alta en Google Cloud Console y en Azure antes del primer
   intento — si no, el proveedor devuelve `redirect_uri_mismatch` (Google) o
   `AADSTS50011` (Microsoft), no un error de Plata.
3. Repetir el flujo del punto 2-5 de arriba contra `app.plata.studio`.
4. Poner un recordatorio para rotar `MICROSOFT_CLIENT_SECRET` antes de que
   expire (Azure no avisa por email por defecto).

## Seguridad

- Nunca commitear `GOOGLE_CLIENT_SECRET` / `MICROSOFT_CLIENT_SECRET` — van
  solo en `.env` locales y en `deploy/.env` del VPS (gitignored).
- Scopes mínimos (`email`, `profile`, `openid` / `User.Read`) — no pedir
  acceso a Calendar, Drive, etc. si no se va a usar; cada scope de más es
  fricción en la pantalla de consentimiento y superficie de riesgo si el
  token se filtra.
- `accountLinking` con `trustedProviders` limitado a `['google',
  'microsoft']` — no dejarlo abierto a cualquier proveedor sin revisar caso
  por caso, porque vincula cuentas solo confiando en que el proveedor marcó
  el email como verificado.

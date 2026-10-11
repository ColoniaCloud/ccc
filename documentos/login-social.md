# Login social, verificación de email y recuperación de contraseña

Guía paso a paso para crear las credenciales externas que necesita la
autenticación de Plata. **El código ya está implementado** (ver la sección
"Cómo está armado"): cada proveedor se activa solo con cargar sus variables
de entorno en `deploy/.env` del VPS y reiniciar la API. Sin credenciales,
el botón de ese proveedor simplemente no aparece.

| Pieza | Para qué | Estado |
|---|---|---|
| Resend | Correos de verificación y "olvidé mi contraseña" | Obligatorio (sin esto no se pueden crear cuentas nuevas) |
| Google | "Continuar con Google" | Opcional, recomendado |
| Microsoft | "Continuar con Microsoft" | Opcional |
| Meta (Facebook) | "Continuar con Facebook" | **Pospuesto** — ver sección 4 |

URLs de callback (las pide cada consola):

- Producción: `https://api.plata.studio/api/auth/callback/<proveedor>`
- Desarrollo: `http://localhost:3001/api/auth/callback/<proveedor>`

donde `<proveedor>` es `google`, `microsoft` o `facebook`.

---

## Checklist rápido — qué crear y qué variables cargar

| # | Dónde | Qué crear | Variables para `deploy/.env` |
|---|---|---|---|
| 1 | resend.com | Cuenta + API key + dominio `plata.studio` verificado | `RESEND_API_KEY`, `EMAIL_FROM` |
| 2 | Google Cloud Console | Pantalla de consentimiento + OAuth client "Web application" | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` |
| 3 | Azure Portal (Entra ID) | App registration multitenant + client secret | `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, `MICROSOFT_TENANT_ID=common` |
| 4 | Meta for Developers | (más adelante) App de tipo "Consumidor" + Facebook Login | `FACEBOOK_CLIENT_ID`, `FACEBOOK_CLIENT_SECRET` |

Después de cargar variables: `docker compose up -d crm-api` desde
`/opt/plata/app/deploy` (las variables se leen al arrancar; no hace falta
recompilar).

---

## 1. Resend (correos transaccionales)

1. Crear cuenta en [resend.com](https://resend.com) (plan gratis: 3.000
   correos/mes, 100/día — de sobra para verificación y contraseñas).
2. **Domains → Add Domain** → `plata.studio`, región **São Paulo
   (sa-east-1)** (la más cercana a LATAM).
3. Resend muestra 3–4 registros DNS (SPF con `send.plata.studio`, DKIM
   `resend._domainkey`, MX de `send`). Cargarlos en el DNS de `plata.studio`
   (hoy está en Hostinger: hPanel → Dominios → `plata.studio` → DNS). **No
   tocar los MX de la raíz** (`mx1/mx2.hostinger.com`): son los buzones
   actuales; los de Resend van en el subdominio `send`.
4. Volver a Resend y tocar **Verify**. Suele tardar minutos.
5. **API Keys → Create API Key** → permiso **Sending access**, dominio
   `plata.studio`. Copiar la key (empieza con `re_`, se muestra una sola vez).
6. Variables:

```bash
RESEND_API_KEY=re_xxxxxxxx
EMAIL_FROM=Plata <no-responder@plata.studio>
```

Sin `RESEND_API_KEY`: en desarrollo los correos se imprimen en la consola
de la API (con el link, para probar el flujo); en producción el registro y
el "olvidé mi contraseña" fallan con error, a propósito, para no dejar a
nadie esperando un correo que no sale.

---

## 2. Google

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
(`deploy/.env` — no se commitea):

```bash
GOOGLE_CLIENT_ID=xxxxxxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=xxxxxxxx
```

---

## 3. Microsoft (Entra ID / Azure AD)

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

Mismo lugar que Google: `apps/api/.env` y `deploy/.env` en el VPS.

---

---

## 4. Meta / Facebook (pospuesto)

Se dejó para una etapa posterior por costo/beneficio, no por técnica:

- Para pedir el **email** del usuario fuera de los roles de prueba, Meta
  exige **verificación del negocio** (documentación de la empresa) y
  **App Review** con video del flujo. Puede llevar semanas.
- Facebook **no siempre devuelve email** (cuentas creadas con teléfono), y
  sin email no se puede crear la cuenta en Plata.
- Para un CRM B2B, Google y Microsoft cubren a la gran mayoría.

Cuando se retome:

1. [developers.facebook.com](https://developers.facebook.com/) → **My Apps
   → Create App** → caso de uso **"Authenticate and request data from users
   with Facebook Login"** → tipo **Consumer**.
2. **App settings → Basic**: App domains `plata.studio`; Privacy Policy URL
   `https://plata.studio/privacidad` (tiene que existir y ser pública);
   Terms URL; categoría; ícono 1024×1024. Copiar **App ID** y **App Secret**.
3. **Facebook Login → Settings → Valid OAuth Redirect URIs**:
   `https://api.plata.studio/api/auth/callback/facebook`. Activar **Enforce
   HTTPS** y **Use Strict Mode for redirect URIs**.
4. **App Review → Permissions and Features**: pedir **Advanced Access** a
   `email` y `public_profile`.
5. **Business Verification** (Business Manager de la empresa).
6. Pasar la app a **Live**.
7. Variables `FACEBOOK_CLIENT_ID` / `FACEBOOK_CLIENT_SECRET` y agregar el
   proveedor en `apps/api/src/lib/auth.ts` (mismo patrón condicional que
   Google) y su botón en `apps/web/src/components/SocialButtons.tsx`.
   **No** agregarlo a `accountLinking.trustedProviders`: Facebook no
   garantiza que el email esté verificado.

---

## Cómo está armado (para quien toque el código)

**API** (`apps/api/src/lib/auth.ts`):

- `baseURL: API_PUBLIC_URL` — los links de los correos apuntan a la API, que
  valida el token y redirige a la web.
- `requireEmailVerification: true` — sin email verificado no hay sesión. El
  registro no inicia sesión; el login responde `EMAIL_NOT_VERIFIED` y
  reenvía el correo (`sendOnSignIn`). Las cuentas anteriores a esta regla se
  marcaron verificadas en la migración `0009_business_profile`.
- Link de verificación: 24 h, y al abrirlo inicia sesión y lleva a
  `/onboarding` (`autoSignInAfterVerification`).
- "Olvidé mi contraseña": link de 1 h; al cambiarla se cierran las demás
  sesiones (`revokeSessionsOnPasswordReset`). La API responde igual exista o
  no la cuenta.
- `socialProviders` se arma solo con los proveedores que tienen
  credenciales; `GET /api/auth-providers` le dice a la web cuáles mostrar.
- `accountLinking.trustedProviders: ['google']` — ver "Seguridad".
- Correos: `lib/email.ts` (Resend por HTTP, sin SDK) y
  `lib/email-templates.ts`.

**Web** (`apps/web`):

- `components/SocialButtons.tsx` — botones según `/api/auth-providers`.
  Cuenta nueva → `/onboarding`; existente → `/app`; error →
  `/auth/sign-in?error=…`.
- Pantallas: `/auth/verify-email` (revisá tu correo + reenviar),
  `/auth/forgot-password`, `/auth/reset-password`.
- `/onboarding` — "Datos del negocio" (segundo paso del registro, tanto para
  email como para Google/Microsoft). Se guarda versionado en
  `tenants.business_profile` (tipo `BusinessProfile` de `@crm/shared`) y se
  edita en **Configuración → Negocio**.

---

## Checklist de pruebas

1. Registro con email nuevo → llega el correo → el link verifica, inicia
   sesión y lleva a "Datos del negocio" → al completarlo entra a `/app`.
2. Intentar entrar sin haber verificado → pantalla "Revisá tu correo" y
   correo reenviado.
3. Link de verificación viejo/inválido → login con aviso.
4. "Olvidé mi contraseña" → correo → cambiar → las otras sesiones quedan
   cerradas → login con la nueva.
5. Link de contraseña usado dos veces o vencido → pantalla "Link inválido".
6. Google con una cuenta nueva → "Datos del negocio".
7. Registrarse con email X por contraseña → cerrar sesión → Google con el
   mismo email X → entra a la **misma** cuenta.
8. Microsoft con el email de una cuenta que ya existe por contraseña → aviso
   "Ya tenés una cuenta con ese email" (no se vincula, a propósito).
9. Si el proveedor responde `redirect_uri_mismatch` (Google) o `AADSTS50011`
   (Microsoft), falta registrar la URL de callback de la sección de arriba.

---

## Seguridad

- Nunca commitear secrets: van solo en `apps/api/.env` local y en
  `deploy/.env` del VPS (ambos gitignored).
- Scopes mínimos (`openid`, `email`, `profile` / `User.Read`).
- **Vinculación de cuentas solo con Google.** Microsoft con
  `tenantId=common` acepta cuentas de cualquier organización de Entra ID, y
  el email lo puede definir el admin de esa organización sin verificarlo
  (ataque conocido como "nOAuth"). Si se vinculara por email, alguien podría
  entrar a la cuenta de otro. Por eso un usuario con cuenta por contraseña
  que entra con Microsoft recibe `account_not_linked` y debe usar su
  contraseña.
- El client secret de Microsoft **vence** (12–24 meses): agendar la rotación.

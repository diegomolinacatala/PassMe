# Puesta en marcha de PassMe

Guía paso a paso para pasar del **modo demo** a un MVP real. Cada bloque es
independiente: puedes lanzar con Supabase + Vercel y añadir Apple/Google Wallet
cuando tengas las cuentas.

> Tras cada cambio de variables ejecuta `npm run doctor`: comprueba contra los
> servicios reales que todo encaja (sin imprimir secretos).

| Bloque | Tiempo aprox. | Necesitas |
| --- | --- | --- |
| [0. Código](#0-código) | 2 min | — |
| [1. Supabase](#1-supabase) | 20 min | Cuenta gratuita |
| [2. Probar en local](#2-probar-en-local) | 5 min | Node 22+ |
| [3. Vercel](#3-vercel) | 10 min | Cuenta gratuita |
| [4. Email transaccional (Resend)](#4-email-transaccional-resend) | 15 min | Dominio propio |
| [5. Apple Wallet](#5-apple-wallet) | 30 min + espera | Apple Developer Program (99 $/año) |
| [6. Google Wallet](#6-google-wallet) | 30 min | Cuenta de Google |
| [7. Dominio y lanzamiento](#7-dominio-y-lanzamiento) | 15 min | — |

---

## 0. Código

Vercel despliega producción desde `main`. Si hay trabajo pendiente en otra rama (p. ej. `feat/launch-ready`), **aplica primero sus migraciones** (paso 1.3) y después fusiónala (GitHub → *Compare & pull request* → *Merge*).

```bash
git checkout main && git pull
npm install
cp .env.example .env.local
```

Sin tocar nada, `npm run dev` ya funciona en **modo demo**: landing, tarjeta de ejemplo en `/u/demo` y editor en `/dashboard` (no guarda).

---

## 1. Supabase

1. **Crear proyecto** en [supabase.com](https://supabase.com) → *New project*.
   - Región: **Central EU (Frankfurt)** o **West EU (Ireland)**.
   - Guarda la contraseña de la base de datos en tu gestor de contraseñas.
2. **Claves** → *Project Settings → API Keys*:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - *Publishable key* (`sb_publishable_…`) → `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - *Secret key* (`sb_secret_…`, créala si no existe) → `SUPABASE_SECRET_KEY`
   - Si tu proyecto solo muestra las claves antiguas (*Legacy*): `anon` → `NEXT_PUBLIC_SUPABASE_ANON_KEY` y `service_role` → `SUPABASE_SERVICE_ROLE_KEY`. La app acepta ambos nombres.
3. **Base de datos** → *SQL Editor → New query* → pega **todo** el contenido de cada migración, **en orden**, y pulsa *Run* en cada una:
   1. [`supabase/migrations/20260927120000_init.sql`](../supabase/migrations/20260927120000_init.sql) — tablas, políticas RLS, funciones y el bucket `avatars`.
   2. [`supabase/migrations/20260928120000_card_design.sql`](../supabase/migrations/20260928120000_card_design.sql) — diseño del pase (tinta de detalle, motivo y variación).
   3. [`supabase/migrations/20260928180000_pass_redesign.sql`](../supabase/migrations/20260928180000_pass_redesign.sql) — motivos nuevos y letra del nombre. Pasa las tarjetas existentes al motivo más parecido.
   4. [`supabase/migrations/20260929120000_launch_hardening.sql`](../supabase/migrations/20260929120000_launch_hardening.sql) — seguridad para el lanzamiento: historial de enlaces (los QR antiguos siguen funcionando y nadie puede quedarse tu enlace viejo), límites de peticiones compartidos, métricas validadas, tope de dispositivos por pase y limpieza de datos caducados.
   5. [`supabase/migrations/20260929130000_contact_requests.sql`](../supabase/migrations/20260929130000_contact_requests.sql) — «Te dejo mi contacto»: quien ve tu tarjeta puede dejarte sus datos.

   Cada una debe terminar con *Success. No rows returned*. Si ya aplicaste las anteriores, ejecuta solo las que falten. Mientras falte alguna la app sigue funcionando con lo que la base de datos ya conoce (lo avisa en los logs, y `npm run doctor` te dice cuál falta).
   - Alternativa con CLI: `npx supabase login && npx supabase init && npx supabase link --project-ref <ref> && npx supabase db push`.
4. **URLs de autenticación** → *Authentication → URL Configuration*:
   - *Site URL*: `http://localhost:3000` por ahora (en el paso 3 pondrás la de producción).
   - *Redirect URLs* (añade todas):
     - `http://localhost:3000/**`
     - `https://TU-DOMINIO/**`
     - `https://*-TU-EQUIPO.vercel.app/**` (despliegues de preview)
5. **Plantillas de email** → *Authentication → Emails → Templates*:
   - En **Magic Link** *y* en **Confirm signup** pega el HTML de
     [`supabase/templates/magic-link.html`](../supabase/templates/magic-link.html).
   - Asunto: `{{ .Token }} es tu código de PassMe` (con el código delante se lee en la notificación del móvil sin abrir el email).
   - El email lleva primero el **código de un solo uso** (8 dígitos con la configuración de abajo), que se escribe en la misma pantalla donde se pidió, y debajo un **botón que funciona en cualquier dispositivo** (`/auth/confirm`). Si cambias la caducidad, cambia también la frase «Caduca en 10 minutos» de la plantilla.
   - *Authentication → Sign In / Providers → Email*: pon **Email OTP Length** a `8` y **Email OTP Expiration** a `600` segundos (10 min). La app bloquea un email tras 5 intentos, pero la API de verificación de Supabase también es pública: un código de 8 dígitos que caduca pronto hace inviable adivinarlo por esa vía. (La pantalla de login ya acepta de 6 a 10 dígitos.)
   - *Authentication → Rate Limits*: deja **Token verifications** en un valor bajo (p. ej. 30 cada 5 min por IP).
6. **(Opcional) Login con Google** → *Authentication → Sign In / Providers → Google*:
   - En [Google Cloud Console](https://console.cloud.google.com/apis/credentials) crea un *OAuth client ID* (tipo *Web*) con *Authorized redirect URI* `https://<ref>.supabase.co/auth/v1/callback`.
   - Pega *Client ID* y *Client secret* en Supabase y pon `NEXT_PUBLIC_AUTH_GOOGLE_ENABLED=true`.
   - En *Google Auth Platform → Audience* pulsa **Publish app** (pasa a *In production*). Mientras esté en *Testing* solo pueden entrar las cuentas que añadas como usuarios de prueba.
7. **(Opcional, recomendado con tráfico real) CAPTCHA** con Cloudflare Turnstile. Frena a los bots que crean cuentas o envían emails de acceso a terceros:
   1. [dash.cloudflare.com](https://dash.cloudflare.com) → *Turnstile → Add widget* → tu dominio de producción (y `localhost` si quieres probar) → modo *Managed*. Copia **Site key** → `NEXT_PUBLIC_TURNSTILE_SITE_KEY` y **Secret key** → `TURNSTILE_SECRET_KEY`.
   2. Despliega con esas dos variables (el login y el formulario de contacto muestran la verificación).
   3. **Después**, en Supabase → *Authentication → Attack Protection* activa *CAPTCHA protection* con proveedor *Turnstile* y la misma Secret key. Si lo activas antes de desplegar, el login fallará con «Completa la verificación anti-spam».

> ⚠️ El servidor de email por defecto de Supabase **solo envía a los miembros de tu organización** y con un límite muy bajo por hora. Para probar tú mismo vale; para usuarios reales configura SMTP (paso 4).

---

## 2. Probar en local

1. Rellena en `.env.local` las tres variables de Supabase y un secreto de firma:
   ```bash
   openssl rand -base64 48   # → PASSME_SIGNING_SECRET
   ```
2. `npm run doctor` → las secciones *Sitio* y *Supabase* deben salir en ✔.
3. `npm run dev` → abre <http://localhost:3000/login>, entra con tu email (el de tu cuenta de Supabase), rellena tu tarjeta y **Guardar**.
4. Abre `http://localhost:3000/u/<tu-slug>` y prueba *Guardar contacto*.

---

## 3. Vercel

1. [vercel.com](https://vercel.com) → *Add New → Project* → importa `diegomolinacatala/PassMe`. Framework: Next.js (automático).
2. *Environment Variables*: copia todas las de `.env.local` **excepto** `NEXT_PUBLIC_SITE_URL`, que en producción debe ser la URL pública final (`https://passme-xxx.vercel.app` o tu dominio). Márcalas para *Production*; en *Preview* pon solo lo necesario para probar (los despliegues de preview compartirían tu base de datos y tu certificado de Apple).
   - Añade también `CRON_SECRET` (16 caracteres aleatorios o más: `openssl rand -hex 24`). Activa la limpieza diaria de datos caducados que programa `vercel.json`.
3. La región de las funciones ya viene fijada a **Frankfurt (fra1)** en `vercel.json` (misma zona que Supabase = menos latencia). Si creaste Supabase en otra región, cámbiala ahí (p. ej. `dub1` para Irlanda).
4. *Deploy*. Después:
   - Abre `https://TU-URL/api/health` → debe devolver `"supabase": true`.
   - En Supabase → *URL Configuration*, cambia *Site URL* a tu URL de producción.
5. Cada vez que cambies una variable `NEXT_PUBLIC_*` hay que **volver a desplegar** (se incrustan al compilar).

> El QR de cada pase apunta a `NEXT_PUBLIC_SITE_URL`. Decide el dominio definitivo **antes** de repartir pases (ver paso 7).

---

## 4. Email transaccional (Resend)

1. Crea cuenta en [resend.com](https://resend.com) y verifica tu dominio (registros DNS que te indica).
2. Crea una API key.
3. Supabase → *Authentication → Emails → SMTP Settings* → *Enable custom SMTP*:
   - Host `smtp.resend.com`, puerto `465`, usuario `resend`, contraseña = la API key.
   - Remitente: `PassMe <hola@tu-dominio.com>`.
4. *Authentication → Rate Limits*: sube el límite de emails por hora (p. ej. 60).
5. **Avisos de «Te dejo mi contacto»** (opcional): con la misma API key, pon en Vercel `RESEND_API_KEY` y `PASSME_EMAIL_FROM=PassMe <hola@tu-dominio.com>`. Cuando alguien deje su contacto en una tarjeta, su dueño recibe un email.

---

## 5. Apple Wallet

Necesitas el **Apple Developer Program** (99 $/año). Si te das de alta como empresa, Apple pide un número D-U-N-S y tarda unos días; como particular suele ser inmediato.

1. **Pass Type ID** → [developer.apple.com](https://developer.apple.com/account/resources/identifiers/list/passTypeId) → *Identifiers → + → Pass Type IDs*:
   - Descripción `PassMe`, identificador `pass.com.TU-DOMINIO.passme` → `APPLE_PASS_TYPE_ID`.
   - Tu *Team ID* (10 caracteres, en *Membership details*) → `APPLE_TEAM_ID`.
2. **Clave + CSR** (en Git Bash, desde la raíz del repo):
   ```bash
   bash scripts/apple-certs.sh csr tu@email.com
   ```
   Genera `certs/pass.key` (privada, git la ignora) y `certs/pass.csr`.
3. **Certificado**: en tu Pass Type ID → *Create Certificate* → sube `certs/pass.csr` → descarga y guárdalo como `certs/pass.cer`.
4. **Certificado intermedio WWDR G4**: en [apple.com/certificateauthority](https://www.apple.com/certificateauthority/) descarga *Worldwide Developer Relations - G4* y guárdalo como `certs/AppleWWDRCAG4.cer`.
5. **Variables**:
   ```bash
   bash scripts/apple-certs.sh env
   ```
   Comprueba que certificado y clave coinciden e imprime `APPLE_PASS_TYPE_ID`, `APPLE_TEAM_ID`, `APPLE_PASS_CERT`, `APPLE_PASS_KEY` y `APPLE_WWDR_CERT` listas para pegar en `.env.local` y Vercel.
6. `npm run doctor` → sección *Apple Wallet* en ✔.
7. **Prueba**: desde el iPhone, con la sesión iniciada en PassMe, abre `https://TU-URL/api/pass/apple?demo=1` en Safari → *Añadir* (una vez conectado Supabase, el pase de ejemplo solo se descarga con sesión). Luego añade tu tarjeta real desde el editor (o con el QR «¿Estás en el ordenador?»).
8. **Actualizaciones automáticas**: con `https` y `SUPABASE_SECRET_KEY`, cada pase incluye un *web service*. Al guardar cambios, la app envía un push a los iPhone que tienen el pase y Wallet descarga la versión nueva (puede tardar unos segundos o minutos). Si algo falla, busca `[passme]` en los logs de Vercel: Wallet reporta errores en `/api/wallet/v1/log`.

> 🗓️ El certificado caduca al año. Apunta la fecha (el doctor avisa 30 días antes).

---

## 6. Google Wallet

1. [Google Pay & Wallet Console](https://pay.google.com/business/console) → crea el perfil de empresa → *Google Wallet API* → copia el **Issuer ID** → `GOOGLE_WALLET_ISSUER_ID`.
2. [Google Cloud Console](https://console.cloud.google.com) → crea un proyecto → *APIs & Services → Library* → habilita **Google Wallet API**.
3. *IAM & Admin → Service Accounts* → crea `passme-wallet` → *Keys → Add key → JSON* → descarga el archivo (no lo subas al repo).
4. En la Wallet Console → *Users* → invita el email de la cuenta de servicio con rol **Developer**.
5. Variable (Git Bash):
   ```bash
   base64 -w0 ruta/al/service-account.json   # → GOOGLE_WALLET_SERVICE_ACCOUNT_JSON
   ```
6. `npm run doctor` → *Google Wallet* en ✔ (hace un intercambio de token real con Google).
7. **Modo prueba**: hasta que Google apruebe tu cuenta de emisor solo pueden guardar pases los usuarios de prueba. En la Wallet Console añade tu cuenta de Google como *test user*. Prueba con `https://TU-URL/api/pass/google?demo=1` desde Android o Chrome.
8. **Publicar** (imprescindible para que otras personas puedan guardar el pase): cuando todo funcione, *Request publishing access* en la Wallet Console. Google revisa el diseño de la clase y tarda unos días; hasta entonces solo funciona con los *test users*.
9. **Imagen del pase**: el arte de cada tarjeta (el motivo alrededor de la marca) se sirve desde `/u/<slug>/hero`, así que `NEXT_PUBLIC_SITE_URL` debe ser una URL pública para que Google pueda descargarla. Si algún día cambias las filas de la plantilla de la clase (`buildGenericClass`), sube la versión en `GOOGLE_WALLET_CLASS_SUFFIX` (`passme_card_v2`…): Google no actualiza una clase ya creada desde el JWT.

---

## 7. Dominio y lanzamiento

- **Dominio**: Vercel → *Settings → Domains*. Después actualiza `NEXT_PUBLIC_SITE_URL`, redespliega y cambia la *Site URL* de Supabase. Hazlo antes de repartir pases: el QR lleva la URL dentro (los pases de Apple se actualizan solos con el web service, pero los QR ya enseñados no).
- **Legal**: `/privacidad`, `/terminos` y `/aviso-legal` son plantillas honestas con lo que hace la app. Rellena `NEXT_PUBLIC_LEGAL_NAME`, `NEXT_PUBLIC_LEGAL_TAX_ID`, `NEXT_PUBLIC_LEGAL_ADDRESS` y `NEXT_PUBLIC_CONTACT_EMAIL` (hasta entonces salen huecos entre corchetes) y revísalas con alguien que sepa de RGPD y LSSI.
- **Límites de uso**: los contadores viven en Postgres (`rate_limit_hit`, migración 20260929120000), así que valen para todas las instancias de Vercel. Si algún día hay picos serios, añade *Vercel Firewall → Rate limiting* delante.

### Checklist final

- [ ] `/api/health` → `supabase`, `supabaseSecretKey`, `signingSecret` en `true`
- [ ] Login por email (código y botón) funciona en móvil y escritorio; al pedir el código aparece «¡Código enviado!» y la cuenta atrás para reenviar
- [ ] Desde el móvil de otra persona: escanear tu QR → «Crea la tuya» → rellenar → email → código → ver su QR en la bienvenida
- [ ] Guardar tarjeta, subir foto, ocultar un contacto → no aparece en `/u/<slug>`
- [ ] *Guardar contacto* abre la ficha nativa en iPhone y Android
- [ ] Apple Wallet: añadir pase, editar el cargo, ver que se actualiza
- [ ] Google Wallet: añadir pase como usuario de prueba
- [ ] Compartir `/u/<slug>` en WhatsApp muestra la vista previa con tu nombre
- [ ] Activar «Deja que te dejen su contacto», dejarte uno desde otro móvil y verlo en *Contactos recibidos* (y el email, si configuraste Resend)
- [ ] Cambiar tu enlace y comprobar que el antiguo redirige al nuevo
- [ ] Añadir el pase en el móvil de **otra persona** (Apple: cualquier iPhone; Google: exige *publishing access* aprobado)

---

## Problemas frecuentes

| Síntoma | Causa probable | Solución |
| --- | --- | --- |
| El editor dice «modo demo» en producción | Faltan variables de Supabase o no redesplegaste | Revisa variables en Vercel → *Redeploy* |
| No llega el email de acceso | SMTP por defecto de Supabase (solo equipo / límite) | Configura Resend (paso 4) |
| «El enlace ha caducado» al pulsar el email | Plantilla por defecto (PKCE) abierta en otro navegador | Usa la plantilla del paso 1.5 o escribe el código |
| `/api/pass/apple` → 503 `not_configured` | Falta alguna variable `APPLE_*` o no es base64 válido | `npm run doctor` |
| El iPhone dice que el pase no es válido | WWDR incorrecto o Pass Type ID distinto al del certificado | `npm run doctor` te dice cuál |
| El pase de Apple no se actualiza solo | Sitio sin https, falta `SUPABASE_SECRET_KEY` o certificado de otro Pass Type ID | Logs de Vercel (`apple pass push`) |
| Google Wallet: «No se puede añadir» | Tu cuenta no es *test user* o la cuenta de servicio no es *Developer* | Paso 6.4 y 6.7 |
| Usuarios nuevos: el enlace del email falla pero el código funciona | Tu versión de Supabase quiere `type=signup` en *Confirm signup* | En esa plantilla cambia `type=email` por `type=signup` (la app acepta ambos) |
| La foto no se sube | Migración sin el bucket o políticas | Re-ejecuta la migración; `npm run doctor` |
| «Completa la verificación anti-spam» al pedir el email | CAPTCHA activo en Supabase pero falta `NEXT_PUBLIC_TURNSTILE_SITE_KEY` en el despliegue | Añade la variable y redespliega, o desactiva el CAPTCHA en Supabase |
| No aparece «Contactos recibidos» o avisa de un paso pendiente | Falta la migración 20260929130000 | Paso 1.3 |

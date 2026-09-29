@AGENTS.md

# Cómo trabajar en este proyecto

- **Idioma**: habla con el usuario (Diego) en español. Código y comentarios en inglés; UI y documentación en español.
- **Estilo de respuesta**: breve y concreto. Cuando haya pasos manuales para Diego, dáselos **de uno en uno**, clic a clic y con el valor exacto que tiene que poner. Espera a que confirme antes de dar el siguiente. Verifica tú lo que puedas: `curl https://getpassme.com/api/health`, `nslookup`, `npm run doctor`.
- **Repo público**: nunca subas secretos, certificados ni datos personales (NIF, dirección). `.env.local` y `certs/` están ignorados.
- **Antes de subir código**: `npm run lint`, `npm run typecheck`, `npm test` y `npm run e2e:demo`. El modo demo tiene que seguir funcionando.
- **Git**:
  - Las funcionalidades van en una rama y PR hacia `main`. No hay `gh` CLI, así que dale a Diego el enlace `https://github.com/diegomolinacatala/PassMe/compare/main...<rama>?expand=1`.
  - Cada push a `main` despliega producción en Vercel.
  - Commits convencionales (`feat:`, `fix:`, `docs:`…).
- **Migraciones**: archivo nuevo en `supabase/migrations/`; no edites las ya aplicadas. Diego las ejecuta en el SQL Editor de Supabase **antes** de fusionar. El código debe funcionar también sin ellas (hay fallbacks).
- **Al terminar una tarea o una sesión, actualiza tú solo la sección «Estado actual» de este archivo** (fecha, qué se hizo, qué queda y cuál es el siguiente paso exacto) y súbelo con el resto de cambios, sin que Diego tenga que pedirlo.
- **Herramientas**:
  - En esta máquina no hay CLI de `gh`, `vercel` ni `supabase`.
  - El modo automático puede bloquear acciones destructivas de git (p. ej. borrar ramas remotas): déjaselas a Diego.

# Estado actual (29/09/2026, tarde)

**MVP en producción y funcionando en https://getpassme.com.** Rama nueva sin fusionar: `feat/frictionless-exchange` (ver abajo).

## Rama `feat/frictionless-exchange` (pendiente de fusionar)

Mínima fricción entre dos personas:

- **Login arreglado**: la pantalla del código nunca aparecía (estado inicial mal puesto en el formulario), por eso solo servía el botón del email. Ahora: «¡Código enviado!», 8 casillas con autorrelleno (iOS lo sugiere desde Mail), envío automático al completar, cuenta atrás de 60 s para reenviar, «Cambiar» email, atajo «Abrir Gmail/Outlook…» y, si se entra por el botón del email en otra pestaña, la que esperaba continúa sola.
- **`/crear`**: la tarjeta primero (vista previa del pase en vivo) y el email + código al final; la tarjeta se crea al verificar el código. El borrador se guarda 1 h en el navegador para que el botón del email o Google lo terminen. `/dashboard` sin tarjeta redirige aquí.
- **Página pública**: botón «Crea la tuya gratis» arriba y bloque «¿Y tú?» abajo; tras «Te dejo mi contacto», «Crear la mía con estos datos» (prefill).
- **Bienvenida** (`/dashboard?nueva=1`): tu QR grande para enseñarlo en el momento y el botón de cartera que toca según el móvil.
- **Botón del email a prueba de antivirus**: `/auth/confirm` ya no inicia sesión al abrirse (Microsoft Defender y similares abren los enlaces y gastaban el código); lleva a `/auth/entrar`, que pide un toque.
- **Bloqueo del código en dos capas**: 5 intentos por email y dispositivo/IP y 30 por email en total cada 15 min (antes, 5 por email: cualquiera podía bloquear a otra persona). Límites por IP subidos a 10 envíos y 20 comprobaciones cada 10 min, pensando en una sala con la misma Wi-Fi.
- **Modo demo**: el login se simula (código `00000000`), así que todo el flujo tiene E2E.
- Nueva plantilla de email (código primero, botón debajo).
- Revisado con agentes de seguridad y de código; sus hallazgos están corregidos.
- Tests: 247 unitarios y de base de datos, y 84 E2E.

### Pasos manuales para Diego (en orden)

1. Revisar y fusionar el PR de `feat/frictionless-exchange` (no hay migraciones).
2. Supabase → *Authentication → Emails → Templates* → **Magic Link** y **Confirm signup**: pegar el HTML nuevo de `supabase/templates/magic-link.html` y poner de asunto `{{ .Token }} es tu código de PassMe`.
3. Probar en el iPhone: `getpassme.com/crear` → rellenar → email → código (debería sugerirse sobre el teclado) → bienvenida con el QR.
4. (Recomendado) Activar «Continuar con Google» (`docs/SETUP.md` 1.6): el alta más rápida en Android y no gasta emails.
5. Ojo con el volumen de emails: Supabase está limitado a 60 emails/hora y el plan gratuito de Resend a 100 al día. Un evento con muchas altas seguidas los agotaría; Google (paso 4) o subir de plan en Resend lo evitan.

## Configuración en producción

- **Vercel**:
  - Proyecto `passme` (equipo *virtus*, slug `groupy-co`, plan Hobby).
  - Dominio `getpassme.com` comprado en Vercel, con DNS en Vercel. `www` redirige con 308 y `passme-theta.vercel.app` sigue activo.
  - Variables de producción configuradas: Supabase, Apple, Google, `PASSME_SIGNING_SECRET`, `NEXT_PUBLIC_SITE_URL=https://getpassme.com`, `CRON_SECRET`, `NEXT_PUBLIC_LEGAL_*`, `NEXT_PUBLIC_CONTACT_EMAIL` (`diegomolinacatala+passme@gmail.com`), `RESEND_API_KEY` (clave propia `passme-vercel`) y `PASSME_EMAIL_FROM=PassMe <hola@getpassme.com>`.
  - El cron diario `/api/cron/cleanup` está activo.
- **Supabase**:
  - Las 5 migraciones aplicadas (`npm run doctor` las comprueba).
  - Site URL y Redirect URLs apuntan a `https://getpassme.com`.
  - Código de acceso de 8 dígitos que caduca en 600 s.
  - Plantillas *Magic Link* y *Confirm signup* con el HTML **anterior** (botón primero). La versión nueva, con el código primero, está en la rama (paso manual 2).
  - SMTP propio vía Resend con remitente `PassMe <hola@getpassme.com>` y límite de 60 emails/hora.
- **Resend**:
  - Dominio `getpassme.com` verificado (DKIM, SPF y MX en `send.`, más DMARC `p=none`; región eu-west-1).
  - Los emails de acceso llegan a la bandeja principal de Gmail.
- **Apple Wallet**: probado en el iPhone de Diego. Añadir el pase, actualización automática por push y QR hacia `getpassme.com/u/<slug>` funcionan.
- **Código**:
  - `main` incluye el rediseño del pase, el endurecimiento de seguridad (límites de peticiones en Postgres, bloqueo del código de acceso atómico, historial de enlaces, métricas validadas, tope de 10 dispositivos por pase, CAPTCHA opcional…), «Te dejo mi contacto» con el panel «Contactos recibidos», y las páginas `/aviso-legal`, `/terminos` y `/privacidad`.
  - Tests: 202 unitarios y de base de datos, y 70 E2E.

## Después de fusionar: Google Wallet (paso 6 de `docs/SETUP.md`)

1. Probar «Añadir a Google Wallet» desde Android o Chrome con la cuenta de Google de Diego, que debe ser *test user* en la Wallet Console.
2. En la [Google Pay & Wallet Console](https://pay.google.com/business/console), pulsar **Request publishing access**. Sin eso, otras personas no pueden guardar el pase en Android. Google tarda unos días en revisarlo.

## Después

- Probar con móviles de **otras personas**: alta, pase en iPhone y Android, «Guardar contacto» y dejar un contacto (checklist al final de `docs/SETUP.md`).
- Que un abogado revise los textos legales (plantillas).
- Opcional:
  - CAPTCHA con Cloudflare Turnstile (`docs/SETUP.md` 1.7): primero las variables en Vercel y después activarlo en Supabase.
  - Reenvío de `hola@getpassme.com` a Gmail (p. ej. ImprovMX, con un MX en el dominio raíz sin tocar el de `send.`) y luego cambiar `NEXT_PUBLIC_CONTACT_EMAIL` a esa dirección.
  - Añadir la dirección de facturación en Vercel (aviso «Action Required»).
  - Borrar las ramas ya fusionadas: `feat/mvp`, `feat/pass-design`, `feat/pass-redesign` y `feat/launch-ready`.
- Backlog de producto, sin empezar:
  - plan de equipos (B2B),
  - modo evento (pase en la pantalla de bloqueo por fecha/lugar),
  - varias tarjetas por persona,
  - inglés,
  - que despublicar desactive los pases,
  - cuota de subidas de fotos por usuario.

  Para monetizar, la hipótesis es tarjeta gratis + Pro barato + equipos por asiento (informe de negocio local, fuera del repo).

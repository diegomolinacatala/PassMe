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

# Estado actual (29/09/2026)

**MVP en producción y funcionando en https://getpassme.com.**

- **Vercel**:
  - Proyecto `passme` (equipo *virtus*, slug `groupy-co`, plan Hobby).
  - Dominio `getpassme.com` comprado en Vercel, con DNS en Vercel. `www` redirige con 308 y `passme-theta.vercel.app` sigue activo.
  - Variables de producción configuradas: Supabase, Apple, Google, `PASSME_SIGNING_SECRET`, `NEXT_PUBLIC_SITE_URL=https://getpassme.com`, `CRON_SECRET`, `NEXT_PUBLIC_LEGAL_*`, `NEXT_PUBLIC_CONTACT_EMAIL` (`diegomolinacatala+passme@gmail.com`), `RESEND_API_KEY` (clave propia `passme-vercel`) y `PASSME_EMAIL_FROM=PassMe <hola@getpassme.com>`.
  - El cron diario `/api/cron/cleanup` está activo.
- **Supabase**:
  - Las 5 migraciones aplicadas (`npm run doctor` las comprueba).
  - Site URL y Redirect URLs apuntan a `https://getpassme.com`.
  - Código de acceso de 8 dígitos que caduca en 600 s.
  - Plantillas *Magic Link* y *Confirm signup* con el HTML de `supabase/templates/magic-link.html` (ya dicen «10 minutos»).
  - SMTP propio vía Resend con remitente `PassMe <hola@getpassme.com>` y límite de 60 emails/hora.
- **Resend**:
  - Dominio `getpassme.com` verificado (DKIM, SPF y MX en `send.`, más DMARC `p=none`; región eu-west-1).
  - Los emails de acceso llegan a la bandeja principal de Gmail.
- **Apple Wallet**: probado en el iPhone de Diego. Añadir el pase, actualización automática por push y QR hacia `getpassme.com/u/<slug>` funcionan.
- **Código**:
  - `main` incluye el rediseño del pase, el endurecimiento de seguridad (límites de peticiones en Postgres, bloqueo del código de acceso atómico, historial de enlaces, métricas validadas, tope de 10 dispositivos por pase, CAPTCHA opcional…), «Te dejo mi contacto» con el panel «Contactos recibidos», y las páginas `/aviso-legal`, `/terminos` y `/privacidad`.
  - Tests: 202 unitarios y de base de datos, y 70 E2E.

## Siguiente paso: Google Wallet (paso 6 de `docs/SETUP.md`)

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

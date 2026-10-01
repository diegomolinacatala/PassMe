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

# Estado actual (01/10/2026)

**MVP en producción en https://getpassme.com, con todo fusionado en `main`.** Ninguna rama tiene trabajo sin fusionar. La monetización está pensada pero **sin implementar** (ver «Monetización»).

Lo último (01/10/2026, rama `feat/new-motifs` fusionada directamente en `main` a petición de Diego): motivos nuevos. Órbitas, Relieve, Trama y Rayos (a Diego le parecían infantiles) se sustituyen por **Arco** (nuevo por defecto), **Corriente**, **Persiana** y **Pliegue**; Halo, Cinta, Monograma y Liso se quedan. La migración `20261001120000_motif_refresh.sql` ya está aplicada. Las tarjetas con un motivo retirado se leen como su sucesor (órbitas→arco, relieve→corriente, trama→halo, rayos→persiana) y pasan al valor nuevo cuando su dueño vuelve a guardar. Más adelante, una migración de limpieza puede convertirlas todas y quitar los valores retirados del `CHECK`.

**Siguiente paso: «Agendar reunión».** Diego quiere rehacerlo bien. Hoy es solo un tipo de enlace (`booking` en `src/lib/card/links.ts`) a Calendly/Cal.com: una fila más en la página pública, el reverso del pase y la vCard, sin integración ni disponibilidad. Ya se le explicó lo que hay y está pendiente de que diga qué quiere hacer.

## Pasos manuales para Diego (en orden)

1. Borrar las ramas ya fusionadas (el modo automático no deja hacerlo): en GitHub → *Branches*, borrar `feat/frictionless-exchange`, `feat/launch-ready`, `feat/mvp`, `feat/pass-design`, `feat/pass-redesign` y `feat/new-motifs`. En local: `git branch -d` con esos mismos nombres.
2. Si no está hecho: Supabase → *Authentication → Emails → Templates* → **Magic Link** y **Confirm signup**: pegar el HTML de `supabase/templates/magic-link.html` y poner de asunto `{{ .Token }} es tu código de PassMe`.
3. Probar en el iPhone: `getpassme.com/crear` → rellenar → email → código (debería sugerirse sobre el teclado) → bienvenida con el QR.
4. Google Wallet (paso 6 de `docs/SETUP.md`): probar «Añadir a Google Wallet» desde Android o Chrome con la cuenta de Diego (debe ser *test user* en la Wallet Console) y pulsar **Request publishing access** en la [Google Pay & Wallet Console](https://pay.google.com/business/console). Sin eso, otras personas no pueden guardar el pase en Android, y Google tarda unos días en revisarlo.
5. (Recomendado) Activar «Continuar con Google» (`docs/SETUP.md` 1.6): el alta más rápida en Android y no gasta emails.
6. Antes de cualquier evento: Supabase está limitado a 60 emails/hora y el plan gratuito de Resend a 100 al día. Una sala entera dándose de alta los agotaría; Google (paso 5) o subir de plan en Resend lo evitan.

## Configuración en producción

- **Vercel**:
  - Proyecto `passme` (equipo *virtus*, slug `groupy-co`, plan Hobby).
  - Dominio `getpassme.com` comprado en Vercel, con DNS en Vercel. `www` redirige con 308 y `passme-theta.vercel.app` sigue activo.
  - Variables de producción configuradas: Supabase, Apple, Google, `PASSME_SIGNING_SECRET`, `NEXT_PUBLIC_SITE_URL=https://getpassme.com`, `CRON_SECRET`, `NEXT_PUBLIC_LEGAL_*`, `NEXT_PUBLIC_CONTACT_EMAIL` (`diegomolinacatala+passme@gmail.com`), `RESEND_API_KEY` (clave propia `passme-vercel`) y `PASSME_EMAIL_FROM=PassMe <hola@getpassme.com>`.
  - El cron diario `/api/cron/cleanup` está activo.
- **Supabase**:
  - Las 6 migraciones aplicadas. `npm run doctor` comprueba las 5 primeras; la 6.ª (`20261001120000_motif_refresh.sql`, solo un `CHECK`) no se puede comprobar desde fuera.
  - Site URL y Redirect URLs apuntan a `https://getpassme.com`.
  - Código de acceso de 8 dígitos que caduca en 600 s.
  - Plantillas *Magic Link* y *Confirm signup*: la versión nueva (código primero) está en `supabase/templates/magic-link.html`; pegarla si no se ha hecho (paso manual 2).
  - SMTP propio vía Resend con remitente `PassMe <hola@getpassme.com>` y límite de 60 emails/hora.
- **Resend**:
  - Dominio `getpassme.com` verificado (DKIM, SPF y MX en `send.`, más DMARC `p=none`; región eu-west-1).
  - Los emails de acceso llegan a la bandeja principal de Gmail.
- **Apple Wallet**: probado en el iPhone de Diego. Añadir el pase, actualización automática por push y QR hacia `getpassme.com/u/<slug>` funcionan.
- **Código en `main`**:
  - Rediseño del pase, endurecimiento de seguridad (límites de peticiones en Postgres, bloqueo del código de acceso atómico, historial de enlaces, métricas validadas, tope de 10 dispositivos por pase, CAPTCHA opcional…), «Te dejo mi contacto» con el panel «Contactos recibidos», y las páginas `/aviso-legal`, `/terminos` y `/privacidad`.
  - Intercambio sin fricción (PR #5): `/crear` con la tarjeta primero y el email + código al final; login con 8 casillas, autorrelleno y reenvío a los 60 s; «Crea la tuya gratis» y «Crear la mía con estos datos» en la página pública; bienvenida con el QR grande (`/dashboard?nueva=1`); botón del email a prueba de antivirus (`/auth/confirm` → `/auth/entrar`); bloqueo del código en dos capas (5 intentos por email y dispositivo/IP, 30 por email cada 15 min); login simulado en modo demo (código `00000000`).
  - Motivos del pase (01/10/2026): Arco, Corriente, Persiana, Pliegue, Halo, Cinta, Monograma y Liso.
  - Tests: 250 unitarios y de base de datos, y 84 E2E.

## Monetización (decidida como hipótesis, nada implementado)

No empezar nada de esto hasta que Diego lo pida.

- **Precios**: tarjeta y pase gratis para siempre (pase, QR, «Guardar contacto», «Te dejo mi contacto»: son el boca a boca). Pro a **4,99 €/mes o 39 €/año**, IVA incluido, con el anual preseleccionado: varias tarjetas, modo evento, analítica completa, exportar contactos recibidos, motivos extra. Más adelante, equipos por asiento. Base: informe de negocio local en `reports/` (fuera del repo).
- **Pasarela**: Stripe. Si la cuenta tiene acceso, *Managed Payments* (Stripe es el vendedor y gestiona IVA y facturas por un 3,5% extra); si no, Stripe normal con gestoría. Plan técnico: Checkout alojado por Stripe, Customer Portal, webhook que marca el plan en Supabase (migración nueva), comprobación de Pro en el servidor y pagos desactivados en modo demo.
- **Antes del primer cobro real (Diego)**: gestoría → alta en Hacienda (036, con ROI) y en autónomos (RETA, tarifa plana); añadir a la web las condiciones de contratación (renovación automática, cancelación, desistimiento de 14 días). NIF y dirección solo en las variables `NEXT_PUBLIC_LEGAL_*`, nunca en el repo.
- **Lanzamiento**: embajadores que vayan a muchos eventos, con Pro gratis y un motivo exclusivo «Fundadores». Idea de producto: atribuir cada alta a la tarjeta desde la que llegó, para saber quién trae gente.

## Después

- Probar con móviles de **otras personas**: alta, pase en iPhone y Android, «Guardar contacto» y dejar un contacto (checklist al final de `docs/SETUP.md`).
- Que un abogado revise los textos legales (plantillas).
- Opcional:
  - CAPTCHA con Cloudflare Turnstile (`docs/SETUP.md` 1.7): primero las variables en Vercel y después activarlo en Supabase.
  - Reenvío de `hola@getpassme.com` a Gmail (p. ej. ImprovMX, con un MX en el dominio raíz sin tocar el de `send.`) y luego cambiar `NEXT_PUBLIC_CONTACT_EMAIL` a esa dirección.
  - Añadir la dirección de facturación en Vercel (aviso «Action Required»).
- Backlog de producto, sin empezar:
  - pagos y plan Pro (ver «Monetización»),
  - atribución de altas por tarjeta (embajadores),
  - plan de equipos (B2B),
  - modo evento (pase en la pantalla de bloqueo por fecha/lugar),
  - varias tarjetas por persona,
  - inglés,
  - que despublicar desactive los pases,
  - cuota de subidas de fotos por usuario.

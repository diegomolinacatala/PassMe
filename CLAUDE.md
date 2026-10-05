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

# Estado actual (06/10/2026)

**MVP en producción en https://getpassme.com.** La monetización está pensada pero **sin implementar** (ver «Monetización»).

**Lo último (05–06/10/2026): implementación de la auditoría UX** ([`docs/ux/AUDITORIA-UX-2026-10-05.md`](docs/ux/AUDITORIA-UX-2026-10-05.md); progreso, decisiones y notas en [`docs/ux/PROGRESO-UX.md`](docs/ux/PROGRESO-UX.md)). Diego no estaba para responder, así que D1–D8 llevan el valor «seguro por defecto» de la auditoría (se pueden cambiar). Las ramas van **apiladas** (cada una sale de la anterior) y hay que fusionarlas **en orden**:
- P1 `feat/ux-p1-arreglos` — arreglos rápidos (barra de guardar, foco, desbordes, glosario, vCard, demo de reuniones…). Subida; sin migraciones.
- P2 `feat/ux-p2-mi-qr` — pantalla «Mi QR» (`/dashboard/qr`, pantalla siempre encendida, manifest para la pantalla de inicio), acciones arriba del editor, botón de cartera según el móvil, Google Wallet tras `GOOGLE_WALLET_LIVE` (apagado), bienvenida con «Mandarle mi tarjeta a Alex», avisos de pendientes, menú de cuenta y cerrar sesión solo en este dispositivo, «Entrar» siempre visible en la landing. Subida; sin migraciones. **Paso manual:** cuando un pase de Google se guarde bien en un Android real, poner `GOOGLE_WALLET_LIVE=true` en Vercel.

**Siguiente paso exacto:** Diego revisa y fusiona los PRs en orden, empezando por `https://github.com/diegomolinacatala/PassMe/compare/main...feat/ux-p1-arreglos?expand=1`. Las que lleven migración lo dicen en `docs/ux/PROGRESO-UX.md`: aplicarla en el SQL Editor antes de fusionar.

**Antes (05/10/2026): auditoría UX con 6 usuarios simulados.** 142 hallazgos ordenados en 8 PRs (informes en `docs/ux/informes/`).

**Antes (02/10/2026, PR #6 fusionado y en producción): «Agendar reunión».** Es la opción 3 que eligió Diego: PassMe hace de intermediario por email.
- Quien escanea pulsa «Agendar reunión» en la tarjeta y propone hasta 3 horas en dos pasos (cuándo y cómo, y luego sus datos).
- Al dueño le llega un email con un botón por hora. Desde un enlace firmado, sin login, confirma con un toque, propone otras horas o dice que no.
- Los dos reciben la invitación de calendario (`.ics` y enlace a Google Calendar). Cualquiera puede cancelar.
- En el editor hay un interruptor «Deja que te propongan reuniones» en Publicación y un panel «Reuniones».
- Se actualizaron la privacidad (`/privacidad#reuniones`) y los términos. El enlace tipo Calendly (`booking`) pasa a llamarse «Reservar cita».
- La migración `20261002120000_meeting_requests.sql` ya está aplicada (`npm run doctor` la comprueba).
- Pasó revisión de código y de seguridad. Como cualquiera puede crear una tarjeta y responderse a sí mismo:
  - Los emails al visitante (cuya dirección nadie verifica) solo llevan texto fijo.
  - Los enlaces de vídeo solo valen de Meet, Zoom, Teams, Whereby, Jitsi o Webex.
  - Hay topes de 5 correos al día por dirección, 40 por dueño y uno global (`MEETING_EMAIL_DAILY_BUDGET`, 60 por defecto) para no agotar el cupo de Resend que usan los códigos de acceso.
- Tests: 303 unitarios y de base de datos, y 106 E2E.

Pendiente de esa entrega: Diego activa «Deja que te propongan reuniones» en su editor (Publicación → interruptor → Guardar). Luego lo prueba desde otro móvil: proponerse dos horas en `getpassme.com/u/<su-slug>`, confirmar una desde el email y comprobar que les llega la invitación a los dos.

Pendiente de valorar más adelante:
- Un pase de Wallet para cada reunión, que salga en la pantalla de bloqueo ese día.
- Conectar Google o Outlook como función Pro.

Lo último (01/10/2026, rama `feat/new-motifs` fusionada directamente en `main` a petición de Diego): motivos nuevos. Órbitas, Relieve, Trama y Rayos (a Diego le parecían infantiles) se sustituyen por **Arco** (nuevo por defecto), **Corriente**, **Persiana** y **Pliegue**; Halo, Cinta, Monograma y Liso se quedan. La migración `20261001120000_motif_refresh.sql` ya está aplicada. Las tarjetas con un motivo retirado se leen como su sucesor (órbitas→arco, relieve→corriente, trama→halo, rayos→persiana) y pasan al valor nuevo cuando su dueño vuelve a guardar. Más adelante, una migración de limpieza puede convertirlas todas y quitar los valores retirados del `CHECK`.

## Pasos manuales para Diego (en orden)

0. «Agendar reunión»: activar «Deja que te propongan reuniones» en el editor y probarlo desde otro móvil. Los emails van por Resend: el plan gratuito (100 al día) se comparte con los códigos de acceso, y por eso las reuniones tienen su propio tope diario. Recomendado: activar el CAPTCHA (`docs/SETUP.md` 1.7) para frenar bots.
1. Borrar las ramas ya fusionadas (el modo automático no deja hacerlo): en GitHub → *Branches*, borrar `feat/frictionless-exchange`, `feat/launch-ready`, `feat/mvp`, `feat/pass-design`, `feat/pass-redesign`, `feat/new-motifs` y `feat/meetings`. En local: `git branch -d` con esos mismos nombres.
2. Si no está hecho: Supabase → *Authentication → Emails → Templates* → **Magic Link** y **Confirm signup**: pegar el HTML de `supabase/templates/magic-link.html` y poner de asunto `{{ .Token }} es tu código de PassMe`.
3. Probar en el iPhone: `getpassme.com/crear` → rellenar → email → código (debería sugerirse sobre el teclado) → bienvenida con el QR.
4. Google Wallet: **acceso de publicación solicitado el 02/10/2026** (respuesta en 2–3 días hábiles, por email a `passmecorreo@gmail.com`). El emisor bueno es `3388000000023206663` (negocio `BCR2DN6D5LEJNFCZ`, creado con `passmecorreo@gmail.com`; el otro «PassMe», `…LEPFQCA`/`…23213462`, no lo usa la web). Hasta ahora **nadie ha podido guardar nunca un pase**: «Se ha producido un error. Vuelve a intentarlo.» en Chrome y en Android, tanto con la cuenta de Diego (*test user*) como con la administradora, incluso con un pase mínimo creado antes por la API. La API acepta la clase y el objeto completo de Diego, y la clave de firma es válida, pero `POST /walletobjects/v1/jwt` devuelve `INVALID_ARGUMENT` genérico para cualquier JWT del emisor. Cuando Google apruebe: volver a probar. Si sigue fallando, escribir a soporte desde *Contactar con el equipo* con el ID del emisor y este diagnóstico.
5. (Recomendado) Activar «Continuar con Google» (`docs/SETUP.md` 1.6): el alta más rápida en Android y no gasta emails.
6. Antes de cualquier evento: Supabase está limitado a 60 emails/hora y el plan gratuito de Resend a 100 al día. Una sala entera dándose de alta los agotaría; Google (paso 5) o subir de plan en Resend lo evitan.

## Configuración en producción

- **Vercel**:
  - Proyecto `passme` (equipo *virtus*, slug `groupy-co`, plan Hobby).
  - Dominio `getpassme.com` comprado en Vercel, con DNS en Vercel. `www` redirige con 308 y `passme-theta.vercel.app` sigue activo.
  - Variables de producción configuradas: Supabase, Apple, Google, `PASSME_SIGNING_SECRET`, `NEXT_PUBLIC_SITE_URL=https://getpassme.com`, `CRON_SECRET`, `NEXT_PUBLIC_LEGAL_*`, `NEXT_PUBLIC_CONTACT_EMAIL` (`diegomolinacatala+passme@gmail.com`), `RESEND_API_KEY` (clave propia `passme-vercel`) y `PASSME_EMAIL_FROM=PassMe <hola@getpassme.com>`.
  - El cron diario `/api/cron/cleanup` está activo.
- **Supabase**:
  - Las 7 migraciones aplicadas. `npm run doctor` las comprueba todas menos la 6.ª (`20261001120000_motif_refresh.sql`, solo un `CHECK`), que no se puede comprobar desde fuera.
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
  - «Agendar reunión» (PR #6): ver arriba.
  - Tests: 303 unitarios y de base de datos, y 106 E2E.

## Monetización (decidida como hipótesis, nada implementado)

No empezar nada de esto hasta que Diego lo pida.

- **Precios**: tarjeta y pase gratis para siempre (pase, QR, «Guardar contacto», «Te dejo mi contacto»: son el boca a boca). Pro a **4,99 €/mes o 39 €/año**, IVA incluido, con el anual preseleccionado: varias tarjetas, modo evento, analítica completa, exportar contactos recibidos, motivos extra. Más adelante, equipos por asiento. Base: informe de negocio local en `reports/` (fuera del repo).
- **Pasarela**: Stripe *Managed Payments*. Comprobado el 04/10/2026: está disponible para negocios en España. Stripe (vía Link) es el vendedor y se encarga del IVA, las facturas, el fraude y las disputas. Cuesta un 3,5% más, sumado al 1,5% + 0,25 € por tarjeta y al 0,7% de Billing. Neto aproximado por suscriptor español, quitando IVA y comisiones: 3,59 €/mes o 29,76 €/año. Solo funciona con Checkout alojado o Payment Links (sin Elements ni dominio propio en el pago). Plan técnico: Checkout, Customer Portal, webhook que marca el plan en Supabase (migración nueva), comprobación de Pro en el servidor y pagos desactivados en modo demo.
- **Forma jurídica** (recomendación del 04/10/2026, pendiente de que Diego decida):
  - Autónomo persona física, no SL. La SL compensa a partir de unos 40–50 k€ de beneficio al año, o si hay socios o inversores.
  - Darse de alta solo cuando haya demanda validada. La tarifa plana (80 €/mes) solo se puede usar una vez cada 3 años. Además, el Supremo (febrero de 2026) aclaró que ganar menos del SMI no exime del RETA.
  - Primer año: unos 1.400–1.700 € entre cuota y gestoría, lo que se cubre con unos 40–50 suscriptores Pro.
  - Una sola alta en RETA cubre todas las actividades de una persona.
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

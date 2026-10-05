# Progreso de la implementación de la auditoría UX

Registro de trabajo de [`AUDITORIA-UX-2026-10-05.md`](AUDITORIA-UX-2026-10-05.md). Sirve para retomar si la sesión se corta.

## Decisiones aplicadas (Diego no estaba disponible: valores «seguros por defecto»)

| ID | Valor aplicado | Qué implica |
|---|---|---|
| D1 | (b) se mantiene «Agendar reunión» | Único verbo para el visitante; el interruptor del dueño pasa a «Recibir propuestas de reunión» |
| D2 | (b) se mantienen las casillas, mejoradas | Fila de ≥ 44 px y error junto al botón |
| D3 | (b) `/login` sigue creando cuenta | Aviso en `/crear` «¿Ya tenías tarjeta con otro email?» + sugerencia de erratas |
| D4 | (a) Google Wallet tras `GOOGLE_WALLET_LIVE` | Apagado por defecto; Android ve «Mi QR» |
| D5 | (b) se mantiene `PUBLISH` + botón de Google Calendar | P8.3 no se implementa |
| D6 | (b) una sola página con índice fijo y aviso de pendientes | No hay pestañas «Tarjeta · Bandeja · Actividad» |
| D7 | (b) sin modo oscuro | — |
| D8 | (a) tema inicial aleatorio y distinto del de quien te refirió | — |

Diego puede cambiar cualquiera: están aisladas en sus PRs.

## Ramas (apiladas: cada una sale de la anterior; fusionar en orden)

| PR | Rama | Estado |
|---|---|---|
| P1 | `feat/ux-p1-arreglos` | ✅ hecho y subido |
| P2 | `feat/ux-p2-mi-qr` | ✅ hecho (pendiente de subir) |
| P3 | `feat/ux-p3-sistema` | pendiente |
| P4 | `feat/ux-p4-crear` | pendiente |
| P5 | `feat/ux-p5-tarjeta` | pendiente |
| P6 | `feat/ux-p6-reuniones` | pendiente |
| P7 | `feat/ux-p7-editor` | pendiente |
| P8 | `feat/ux-p8-…` | pendiente |

## Notas de implementación

- **P1.20 / P2.5**: «Mandarle mi tarjeta a Alex» guarda el contacto con el origen de la visita (`qr`/`share`/`direct`) y un texto fijo, en vez de un origen nuevo `crear` (eso pediría migración del `CHECK`).
- **P2.7**: la fecha de «Ver» en el aviso de contactos se guarda en una cookie técnica (`passme_contacts_seen`, ruta `/dashboard`, un año) y no en `localStorage`: así el servidor ya pinta el aviso y el editor no da un salto al hidratarse (los clics caían en otro sitio). Por eso se ha actualizado la frase de cookies de `/privacidad`.
- **P2.5**: «Mandarle mi tarjeta» manda solo lo que la tarjeta enseña: el email visible (el de la cuenta solo si la tarjeta no tiene ningún email; uno oculto nunca) y el teléfono o WhatsApp visibles. La frase «Alex verá tu nombre, tu email y tu móvil» se calcula con lo que se va a mandar. Si no hay email ni teléfono visibles, o Alex ya no acepta contactos, se ofrece compartir el enlace. Usa los mismos topes que «Déjale tu contacto» (por IP y por tarjeta) más 5 envíos por cuenta y hora; sin CAPTCHA, porque ya hay sesión. En demo, la cuenta *es* la tarjeta de ejemplo, así que «Vienes de Alex» se permite aunque el slug coincida.
- **P2.3**: «¿Otro móvil?» enseña las carteras que este móvil no muestra ya (no repite la suya). En `/wallet`, un Android solo ve Google (un pase de Apple no le sirve). En ordenador sin el bloque de «pasarlo al móvil» (demo), los botones se ven directamente en vez de plegados.
- **P2.8**: el menú es un desplegable (botón + panel), no un menú ARIA; «Cerrar sesión» va el último, separado. En demo también aparece (lleva a la portada).
- **P2.4**: paso manual para Diego: cuando un pase de Google se guarde bien en un Android real, `GOOGLE_WALLET_LIVE=true` en Vercel. Además de la landing, el título por defecto del sitio y la descripción de `/crear` dejan de nombrar Google Wallet mientras esté apagado. Queda para P4: en `/crear`, un Android sigue viendo la vista previa con estilo Google y «Así se verá en Google Wallet».
- **P2.6**: `favicon.ico` con 16, 32 y 48 px; icono *maskable* con la marca dentro de la zona segura. No se ha pasado Lighthouse (el manifiesto cumple los requisitos: nombre, `start_url`, `standalone`, iconos 192 y 512).
- **P2.9**: Google no tiene un equivalente a «Hecho con PassMe» en el pase (`linksModuleData` solo lleva la tarjeta y sus datos), así que no hay nada que alinear. La visita del dueño a su propia tarjeta sigue contando en las estadísticas.
- **P1.20 (rezagado)**: el email «Alguien te ha dejado su contacto» aún decía «Deja que te dejen su contacto»; ahora dice «Recibir contactos».
- **P1.9**: las páginas demo de reuniones mandan su estado al servidor (`demoState`) para encadenar acciones (confirmar y luego cancelar). Solo en demo; no se guarda nada.

## Notas para retomar

- Antes de cada push: `npm run lint`, `npm run typecheck`, `npm test`, `npm run e2e:demo`.
- No editar `src/` mientras corre `npm run e2e:demo` (el build lee los archivos).
- Los IDs hechos se marcan con ✅ en la auditoría.

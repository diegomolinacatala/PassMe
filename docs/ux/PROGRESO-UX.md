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
| P3 | `feat/ux-p3-sistema` | ✅ hecho (pendiente de subir) |
| P4 | `feat/ux-p4-crear` | ✅ hecho (pendiente de subir) |
| P5 | `feat/ux-p5-tarjeta` | ✅ hecho (pendiente de subir) |
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
- **P3 (componentes)**: todo está en `src/components/ui/`: `field.tsx` (`Field`, `InlineError`, `inputClasses()`), `notice.tsx`, `submit-button.tsx`, `undo-notice.tsx`, `choice.ts` (radios) y `new-tab-hint.tsx`. Las reglas están en `docs/BRAND.md` § 8. `cn()` conoce ahora los tokens (`text-body`, `rounded-panel`, `shadow-press-ink`…): sin eso, tailwind-merge tomaba `text-body` por un color y borraba el `text-white` del botón.
- **P3.1**: los botones llevan una clase sin estilo `btn-<variante>` (no un `data-variant`, porque `buttonClasses()` también se usa en `<a>` y `<Link>`); el E2E cuenta los `.btn-signal` visibles al cargar cada ruta. «Responder» (reuniones del editor) pasa a `ink`. Queda para P5: en la tarjeta pública, el envío de un formulario abierto (o «Crear la mía con estos datos») y el bloque oscuro «Crear mi tarjeta» son los dos `signal`, aunque nunca coinciden en pantalla.
- **P3.2**: el token es `--color-field-border: #8a7f6e`, no `#8f8473`: ese se quedaba en 2,87:1 sobre `paper-deep`. `rg "border-line bg-" src/components` devuelve 0: la única definición de campo es `inputClasses()` (con el token nuevo). Los demás controles con borde (días y horas del selector, horas a confirmar, «Añadir» datos, accesos rápidos) también usan `field-border`; las cajas que no son controles pasan a `hairline`. El campo del enlace (`slug-field`) sube a 16 px y su prefijo se corta con «…» si la letra es muy grande.
- **P3.3**: `tests/design-tokens.test.ts` mide los estados sobre los tokens reales de `globals.css`. Encontró que el título verde de los avisos `ok` (`text-ok` sobre `bg-ok/10`) se quedaba en 4,08:1: ahora el título va en tinta y el verde queda para el icono. Lo mismo en la etiqueta «Publicada» del editor.
- **P3.4**: «Continuar con Google» dice «Conectando con Google…» y «Sí, cancelar…» dice «Cancelando…». El aviso «Casi no se ve sobre el fondo» del diseño no se ha tocado (es una advertencia, no un error).
- **P3.5**: una reunión quitada de la lista se borra en el servidor a los 6 s (o al salir de la página); «Deshacer» solo la vuelve a enseñar. También tienen deshacer las horas propuestas en el selector. En la confirmación de un contacto recibido el foco va a «No borrar» (la opción segura).
- **P3.6**: los 3 `rounded-[…]` que quedan son el móvil dibujado de la landing. `text-[0.9…rem]` también pasa a `text-body`. Para que nada se salga con la letra al 200 %: las cabeceras (landing y editor) y la fila de etiqueta de los campos pueden partirse en dos líneas, la columna derecha del editor tiene `min-w-0` y las filas de reuniones bajan sus botones.
- **P3.7**: el radio es una capa invisible (`absolute inset-0 opacity-0`) sobre toda la opción en vez de `sr-only`: el teclado funciona igual y los toques (y Playwright) caen siempre en el radio. Las horas a confirmar de `meeting-response.tsx` siguen con `sr-only`.
- **P3.8**: con `?nueva=1`, el título de la bienvenida es el H1 y el del editor un H2; al cerrar la bienvenida (`WelcomeContext`) el del editor vuelve a ser H1 y recibe el foco. El H2 del formulario de reunión tiene estilo de *eyebrow* para no cambiar el diseño. `ExternalLink` ya no se usaba.
- **P4.1**: el formulario llama a la misma acción que «Enviarme un código» (`authAction`, `intent=send`: límites, bloqueo y CAPTCHA). Con CAPTCHA activo, el widget va bajo «Crear mi tarjeta». Si el envío falla (CAPTCHA, límites), el error sale junto al botón y se sigue en el formulario. Sin email válido en la tarjeta el botón dice «Continuar», también con el formulario vacío. «Continuar con Google» sigue en el paso del email, que ahora solo se ve si la tarjeta no tiene email o tras «Cambiar email». «Usar otro email» abre «Email para guardarla» bajo el botón (con «Usar el de mi tarjeta» para volver).
- **P4.2**: el borrador se guarda desde el primer cambio (300 ms y también en `pagehide`) y caduca a los 20 min sin cambios (`DRAFT_TTL_MS`). Se sigue borrando al llegar al editor (`SignedInBeacon`). Se restaura justo después de hidratar (`useHydrated`, como antes), así que en un móvil lento puede verse un instante el formulario vacío. Actualizada la frase de almacenamiento de `/privacidad` y `docs/ARCHITECTURE.md` (decía 1 h).
- **P4.3**: `codeSentAt` usa el reloj del navegador y nunca uno posterior al del servidor, para no alargar la vida del código. Al recargar, el aviso dice «Ya te enviamos un código» y la cuenta atrás de reenvío sigue donde iba. El paso del código se oculta con `hidden` y no se desmonta. Con sesión iniciada (`member`) el borrador se guarda sin `pending` ni `authEmail`: las reglas de creación desatendida no cambian.
- **P4.4**: `pickInitialTheme()` en `src/lib/card/design.ts`. Los datos dejados con «Déjale tu contacto» se guardan sin color (tema vacío) para que lo elija `/crear` y no salga el naranja de siempre.
- **P4.5**: en iPhone, «Abrir Gmail» (`googlegmail://`) y «Abrir Mail» (`message://`, para todo lo que no es Gmail, también dominios de empresa) se abren en la misma pestaña. Si la app Gmail no está instalada, Safari dará un error: hay que probarlo en un iPhone real (3.3.4).
- **P4.6**: `suggestEmailFix()` en `src/lib/auth/email-typos.ts`; la lista incluye `gmail.es` (habitual en España y no es de Gmail). La sugerencia no bloquea el envío. En `/crear` sale bajo «Te mandaremos un código a …» y «Sí, corregir» cambia también el email de la tarjeta. D3 (b): «Cerrar sesión y entrar con ese» lleva a `/login`; `/auth/signout` acepta un `next` validado con `safeNextPath` (si no, a la portada).
- **P2.4 (rezagado)**: en `/crear`, un Android ve la vista previa de Apple con «Así se verá tu tarjeta» mientras Google Wallet esté apagado.
- **P5 (estado compartido)**: `src/components/card/card-page-context.tsx` guarda qué panel está abierto, qué se ha enviado y si ya se pulsó «Guardar contacto». `ActionPanel` es el patrón común de «Déjale tu contacto» y «Agendar reunión» (fila con círculo `signal-wash`, `aria-expanded`/`aria-controls`, subtítulo en `aria-describedby`, «Cerrar» de 44×44 que devuelve el foco). El contenedor del panel existe siempre (vacío si está plegado) para que `aria-controls` no apunte a nada.
- **P5.1 / P5.7**: tras enviar un formulario, «Crear la mía con estos datos» es `ink` mientras «Guardar contacto» siga pendiente y pasa a `signal` cuando ya se guardó: así nunca hay dos botones naranjas. Con un formulario abierto en escritorio pueden verse a la vez «Guardar contacto» y el envío del formulario (los dos `signal`); en el móvil no coinciden en pantalla. La vista previa del editor dibuja «Guardar contacto» con los colores `signal` pero sin la clase `btn-signal` (no es una acción).
- **P5.3**: fuera de iOS, «Contacto guardado» llega al volver a la pestaña (`visibilitychange`) o a la ventana (`blur` → `focus`, para el ordenador); en iOS, con el propio toque. iOS se detecta igual que la ruta de la vCard (`servesVCardInline`, que también cuenta el iPad) y el nombre del archivo sale de `vcardDisplayFilename`, el mismo que manda la descarga. El botón redondo de compartir desaparece (`ShareButton` borrado); «Pasarle esta tarjeta a alguien» usa `ShareLinkButton` con el icono de cada plataforma (`shareIcon`).
- **P5.4**: el nombre baja de tamaño a partir de 24 y 36 caracteres (`nameScale()` en `src/lib/card/name-scale.ts`). Se mantiene `break-words` en el nombre solo como último recurso para una palabra más ancha que la tarjeta (no corta a mitad de palabra si cabe). El criterio «con un nombre de 52 caracteres, “Guardar contacto” se ve en 780 px» no tiene E2E (la tarjeta demo tiene un nombre fijo): lo cubre el test unitario del tamaño. Las URL largas siguen abreviándose a 48 caracteres con «…» (`prettyUrl`, lo usan también los pases); el texto de las filas ya no se corta con CSS.
- **P5.5**: `linkVerb()` y `whatsappHrefForPhone()` en `src/lib/card/links.ts`; el segundo vuelve a pasar el número por las reglas de WhatsApp (prefijo obligatorio) y construye el enlace con `linkHref("whatsapp", …)`. Si la tarjeta ya tiene un WhatsApp, los teléfonos no llevan el botón. El clic en el botón cuenta para la fila del teléfono en «Lo más pulsado». La tarjeta demo tiene ahora un móvil visible (`+34 612 345 678`) y conserva el teléfono oculto para los tests de enlaces ocultos.
- **P5.6**: el error de «al menos uno» se guarda en los dos campos (`CONTACT_ONE_OF_ERROR`) y el formulario lo enseña una sola vez bajo Email, con los dos campos en rojo y descritos por él. Lo escrito se guarda en `sessionStorage` (`passme:contact-draft:<slug>`) y se borra al enviar; actualizada la frase de almacenamiento de `/privacidad`. D2 (b): la casilla sigue, con fila de 44 px y su error justo encima del botón. Con D2 (b) son 4 toques (abrir, móvil, casilla, enviar), no 3.
- **P5.8**: el QR solo se ve a partir de 1024 px y no al dueño (él tiene «Mi QR»).
- **P5 (fuera de alcance, para P6)**: el texto de la confirmación de la reunión ya no dice «Ya tenemos tus datos»; el resto de textos y la casilla del formulario de reunión siguen para P6.

## Notas para retomar

- Antes de cada push: `npm run lint`, `npm run typecheck`, `npm test`, `npm run e2e:demo`.
- No editar `src/` mientras corre `npm run e2e:demo` (el build lee los archivos).
- Los IDs hechos se marcan con ✅ en la auditoría.

# Auditoría UX: «Agendar reunión» (los dos lados)

Auditor: Marta (visitante) + Alex (dueño) + la invitación de calendario. Prefijo `MEET-`.
Capturas en esta misma carpeta (`a*.png` = Marta, `b*.png` = Alex/emails, `c*.png` = editor). Scripts: `a-marta.mjs`, `a2-marta.mjs`, `b-alex.mjs`, `c-dash.mjs`, `emails.cjs` (renderiza los emails y los `.ics` reales con el código del repo → `email-*.html`).
Fecha de la prueba: lunes 5/10/2026, ~17:50 hora de Madrid (importa: el selector abre en «Hoy»).

---

## 1. Persona y contexto

- **Marta, 41, directora de compras, iPhone 15 (393×659 útil).** En un evento escanea la tarjeta de Alex y quiere verle la semana que viene, 1 h, en sus oficinas. Tiene prisa y poca paciencia con formularios; usa Outlook/Teams en el trabajo.
- **Alex, dueño de la tarjeta.** Recibe el email en Gmail del móvil entre dos reuniones y quiere responder con el pulgar, sin iniciar sesión.
- **La invitación**: lo que acaba en el calendario de cada uno, y qué pasa si se cancela.

---

## 2. Recorrido narrado

### Marta (visitante)

| # | Qué hace | Toques | Captura |
|---|---|---|---|
| 1 | Abre `/u/demo?src=qr` (128 ms). Ve la tarjeta; «Agendar reunión con Alex» **no está en la primera pantalla** (el CTA empieza en y=818 px, el viewport acaba en 659). Desliza una vez. | 1 deslizar | `a01-tarjeta-viewport.png`, `a02-tarjeta-full.png` |
| 2 | Toca «Agendar reunión con Alex». Se abre el paso 1 en el sitio, el foco va al título «¿Cuándo os veis?». Bien. | 1 | `a03-paso1-viewport.png` |
| 3 | El selector abre en **«Hoy 5 oct»**, con 18 de 22 horas apagadas (son casi las 18:00). Marta piensa «¿y la semana que viene?». Desliza la tira de días; los sábados y domingos se ven igual que los laborables. | 1 deslizar | `a04-paso1-full.png` |
| 4 | Toca «Continuar» sin haber elegido hora, por curiosidad. **No pasa nada visible**: el error «Elige al menos una hora.» sale encima de «Duración», fuera de la pantalla. | 1 (perdido) | `a05-sin-hora.png` |
| 5 | Elige mié 7 · 16:00, mar 13 · 10:00 y 10:30 (dos días, 2 toques de día + 3 de hora). El contador «3/3» y las pastillas con ✕ lo dejan claro. Intenta una cuarta: aviso «Ya tienes 3 horas: quita una para añadir otra.» Se entiende que son 3 como máximo; **no se explica por qué** (está implícito en «Alex elige una»). | 5 | `a07-3horas.png`, `a08-cuarta-hora.png` |
| 6 | «Otra fecha» (dentro de 3 semanas): abre el selector nativo (`min` hoy, `max` +59 días). Elige 27/10. El día se **añade al final de la tira, fuera de la vista**; solo cambia el subtítulo «Martes, 27 de octubre». | 2 | `a09-otra-fecha.png` |
| 7 | Duración «1 h», «Cómo»: prueba Videollamada («Alex añade el enlace… al confirmar») y Llamada («Alex te llamará…»), vuelve a En persona y escribe «Oficinas de Marta, Paseo de la Castellana 100, Madrid». No hay sitio para **su** enlace de Teams. | 3 + teclear | `a10-video.png`, `a11-llamada.png`, `a12-persona.png` |
| 8 | «Continuar» → paso 2 «¿Quién propone?». Resumen con sus horas y «← Cambiar». | 1 | `a13-paso2-viewport.png`, `a14-paso2-full.png` |
| 9 | Envía vacío: errores por campo y la casilla. Claros. | 1 | `a15-paso2-errores.png` |
| 10 | «Cambiar» → vuelve al paso 1 con todo intacto (3/3). Bien. «Continuar». | 2 | `a16-cambiar.png` |
| 11 | Rellena nombre, email, teléfono, «Grupo Aranda S.L.» y como tema «Proveedor de packaging para 2027, nos vimos en el stand de Alex en **Expo.Pack**». Marca la casilla. Envía. Error: **«Sin enlaces ni teléfonos, por favor.»** — no ha escrito ninguno. Además, **la casilla aparece desmarcada** tras el error. | 6 campos + 2 | `a17-relleno.png`, `a18-envio1.png` |
| 12 | Corrige el tema y reenvía → «Propuesta enviada a Alex.» con sus horas en pastillas, «Crear la mía con estos datos» y, debajo, otra vez «Déjale tu contacto a Alex» y otro «Crear mi tarjeta». En real el texto dice «En cuanto elija una hora, te escribimos a …». **Ningún enlace para ver/retirar la propuesta, ningún «añadir como pendiente».** | 1 | `a20-enviado-viewport.png`, `a21-enviado-full.png` |
| 13 | Caminos torpes: **recargar** a mitad → todo perdido, formulario cerrado. **Gesto «atrás»** en el paso 2 → sale de la tarjeta (en la prueba, a `about:blank`). Abrir los dos formularios a la vez (reunión + contacto) → dos bloques con Nombre/Email seguidos. | — | `a22-ambos-abiertos.png` |
| 14 | Zona horaria: con el móvil en Nueva York el texto dice «hora de **New York**»; en Canarias «hora de **Canary**»; en México «hora de **Mexico City**». | — | (log de `a2-marta.mjs`) |
| 15 | Horizontal y escritorio: correcto, la tira de días se corta con scroll. Modo oscuro: la web es siempre clara (coherente). | — | `a24-desktop-paso1.png`, `a25-landscape.png`, `a23-dark-paso1.png` |

**Cuenta mínima (camino feliz, 1 hora, valores por defecto):** abrir (1) + día (1) + hora (1) + Continuar (1) + nombre + email (2 campos, autorrelleno posible) + casilla (1) + Enviar (1) = **6 toques + 2 campos + ~3 deslizamientos**. Caso real de Marta (3 horas en 2 días, 1 h, lugar, tema, teléfono): **≈14 toques + 6 campos**.

### Alex (dueño)

| # | Qué hace | Toques | Captura |
|---|---|---|---|
| 1 | Ve el email en Gmail: asunto «Lucía Martín te propone una reunión», preheader «mar 6 oct · 10:00 y 1 más. Confirma con un toque.». Dentro: Cómo/Duración, un botón por hora (**el primero relleno en naranja**, el resto en contorno), «Proponer otra hora · No puedo». No ve ni el lugar ni el tema (a propósito: texto libre). Pie: «Las horas son de Madrid.» | — | `b00-email-proposal.png` |
| 2 | Toca «martes, 6 de octubre, 12:30». Abre `/reunion/…?hora=1` (147 ms). Título «Lucía quiere reunirse contigo», ficha de Lucía, Cómo/Duración/Tema… y **«Confirmar 12:30» queda a y=922, fuera de pantalla**: tiene que deslizar. La hora que ya eligió aparece marcada, bien. | 1 + deslizar | `b01-hora1-viewport.png`, `b02-hora1-full.png` |
| 3 | Pega un enlace de Google Maps en «Lugar» → «Escribe solo el sitio, sin enlaces ni teléfonos.» | 1 | `b03-lugar-url.png` |
| 4 | «Confirmar 12:30» → banner verde «Confirmada. Os acabamos de enviar la invitación a los dos.», título «Reunión confirmada», botones «Google Calendar» y «Apple / Outlook», «Cancelar reunión». | 1 | `b04-confirmada-viewport.png`, `b05-confirmada-full.png` |
| 5 | «Cancelar reunión» → «Sí, cancelar reunión»: en demo **falla** con «Esta propuesta ya no admite cambios.» y la página se queda sin ninguna acción. | 2 | `b06-cancelar.png`, `b07-cancelada.png` |
| 6 | Desde el enlace «Proponer otra hora» (`?accion=otra`): mismo selector que Marta (abre en «Hoy» casi todo apagado). Enviar sin hora → error visible (aquí el botón está debajo, bien). Nota con «www.misitio.com» → «Sin enlaces, por favor: los veréis en la invitación.» (la invitación no lleva enlaces). Envía → «Esperando a Lucía», con «Tu nota». | 4 | `b08-otra-hora.png`, `b09-otra-sin-hora.png`, `b10-otra-enviada.png` |
| 7 | «No puedo» (`?accion=no`) → nota opcional → «Enviar respuesta» → «Has dicho que no esta vez». | 2 | `b11-no-puedo.png`, `b12-rechazada.png` |
| 8 | Vista de invitado (`/reunion/demo/invitado`): «Esperando a Alex», «Retirar propuesta» → confirmación → título **«Reunión cancelada»** (no era una reunión, era una propuesta) + «Proponer otra fecha» (vuelve a `/u/demo` desde cero). Pie: «Guarda este enlace: desde aquí puedes ver o cancelar la reunión.» incluso ya cancelada. | 2 | `b13-invitado.png`, `b14-invitado-retirada.png` |
| 9 | Enlace manipulado → «Enlace no válido / Ábrelo de nuevo desde el último email…». Correcto. | — | `b15-invalido.png` |

Variantes demo que **no existen** y por tanto no se pueden enseñar ni probar: reunión confirmada vista por el invitado, invitado al que Alex le ha propuesto otra hora («Alex te propone otra hora»), caducada, pasada, videollamada sin enlace. Las revisé leyendo `meeting-response.tsx` y renderizando los emails con `emails.cjs`.

**Cuenta Alex:** confirmar = 1 toque en el email + deslizar + 1 toque = **2 toques** (la promesa en tres sitios es «con un toque»). Otra hora = 4 toques. No puedo = 2.

### Editor (Alex)

- Interruptor «Deja que te propongan reuniones» dentro de **04 Publicación**, en y≈4 850 px. Panel **06 Reuniones** en y≈5 550 px de una página de 7 260 px en el iPhone (≈8 pantallas de scroll). No hay aviso arriba ni ancla a `#reuniones`. `c01-dash-full.png`, `c02-reuniones.png`, `c03-switch.png`.
- El panel está bien ordenado («Te toca responder» → «Próximas» → «Esperando respuesta» → «Ver anteriores»), con «Responder ↗» que abre otra pestaña y una papelera.
- No hay ningún ajuste: ni horario, ni días, ni duración, ni lugar ni enlace de vídeo por defecto, ni qué formatos aceptas.

### La invitación (`.ics` y Google)

Generados con el código real (`emails.cjs`, salida en consola). Resumen:
- `SUMMARY: Reunión con <el otro>`, `DTSTART/DTEND` en UTC (bien), `LOCATION` = lugar (o «Llamada al +34…»), `DESCRIPTION` = «Tema: …» (solo en la copia del dueño) + «Con: Nombre (email · tel)» + «Agendada con PassMe.», alarma −30 min, `ORGANIZER` = Alex con su **email de login**, `METHOD:PUBLISH` sin asistentes, mismo `UID` en ambas copias, `SEQUENCE` = nº de cambios.
- Cancelación: email con `cancelacion.ics` `METHOD:CANCEL` (mismo UID). El propio email reconoce: «en Gmail, bórrala tú». El botón «Google Calendar» crea un evento suelto que **nada puede actualizar ni borrar**.
- Una reunión confirmada **no se puede mover**: solo cancelar y volver a proponer → evento huérfano + uno nuevo.

---

## 3. Hallazgos

### MEET-01 · Marta envía y se queda sin nada en la mano (ni enlace, ni acuse, ni aviso si caduca)
- **Severidad:** ALTA
- **Dónde:** `/u/[slug]` → `src/components/meetings/meeting-request.tsx:47-90` (`SentMessage`), `src/lib/meetings/service.ts:112-127` (`notifyNewProposal` solo escribe al dueño), `src/app/u/[slug]/meeting-actions.ts:303-304`.
- **Qué pasa:** la pantalla «Propuesta enviada a Alex.» (`a20-enviado-viewport.png`) dice «te escribimos… en cuanto elija». No hay enlace a su página de invitada, así que **no puede retirar ni cambiar** la propuesta hasta que Alex responda, aunque la política de privacidad le dice «Puedes retirar la propuesta… desde tu enlace» (`src/app/privacidad/page.tsx:59`). Si Alex no responde, la propuesta caduca cuando pasan las horas **y nadie se lo dice**: Marta queda esperando un email que nunca llega. Es un callejón sin salida.
- **Propuesta (recomendada, sin emails nuevos):**
  1. `submitMeetingAction` devuelve también `guestPath` (`meetingPath(id, "guest")`); en demo, `/reunion/demo/invitado`.
  2. En `SentMessage`, debajo de las pastillas, un botón contorno **«Ver o retirar mi propuesta»** (abre la página de invitada) y el texto literal: «Si Alex no responde antes del {primera hora}, la propuesta caduca sola.»
  3. Opcional (con los topes ya existentes por dirección): un email de texto fijo al caducar: asunto «Tu propuesta a Alex ha caducado», botón «Proponer otra fecha».
- **Criterio de aceptación:** tras enviar, en el mismo viewport hay un enlace que abre la página de invitada de esa propuesta y, desde ella, «Retirar propuesta» funciona; el texto menciona la caducidad con la fecha de la primera hora.

### MEET-02 · Zonas horarias: cada uno puede leer una hora distinta
- **Severidad:** ALTA
- **Dónde:** `meeting-request.tsx:321` (`localTimeZone()` del navegador del visitante), `src/lib/meetings/time.ts:192-195` (`timeZoneCity`), `emails.ts:110` (zona solo en el pie), `meeting-response.tsx:238,331` (Alex responde y contrapropone en la zona del visitante).
- **Qué pasa:** la propuesta se guarda y se muestra **siempre en la zona del móvil de quien propone**. Visitante de Canarias en un evento de Madrid: elige «10:00» (= 11:00 en Madrid). Alex recibe un email con un botón «martes, 6 de octubre, 10:00» y, en letra pequeña al pie, «Las horas son de **Canary**». Su página de respuesta y su selector de «Otra hora» también están en hora canaria. Los nombres salen en inglés («New York», «Mexico City», «Canary»). En un producto para eventos (gente de viaje) es fácil presentarse una hora tarde.
- **Propuesta:**
  1. Guardar la zona del dueño en la tarjeta (se toma del navegador al guardar en el editor; por defecto `Europe/Madrid`).
  2. El selector del visitante trabaja **en la hora del dueño** («hora de Madrid, la de Alex») y, solo si la zona del visitante es distinta, añade bajo cada pastilla «(09:00 donde estás tú)».
  3. Emails y páginas: cada parte ve las horas en **su** zona; si difieren, se añade la otra entre paréntesis: «10:00 (11:00 en Madrid)».
  4. Nombres de zona en español: `Intl.DateTimeFormat("es-ES", { timeZone, timeZoneName: "longGeneric" })` o un mapa corto (Canarias, Nueva York, Ciudad de México, Londres, Lisboa…).
- **Criterio de aceptación:** con el visitante en `Atlantic/Canary` y Alex en `Europe/Madrid`, el email y la página de Alex muestran la hora de Madrid (o ambas); nunca aparece «Canary», «New York» ni «Mexico City».

### MEET-03 · «Confirma con un toque»: el botón de confirmar queda fuera de pantalla
- **Severidad:** ALTA
- **Dónde:** `/reunion/[id]/[sig]?hora=N` → `meeting-response.tsx:489-509` (`header` + `Summary` antes que `ConfirmPanel`), textos que prometen «un toque»: `meeting-request.tsx:104`, `emails.ts:88`, `card-editor.tsx:281`.
- **Qué pasa:** Alex ya eligió la hora en el email, pero aterriza en una página que vuelve a decir «Elige una hora» y le esconde «Confirmar 12:30» en y=922 px (viewport 659): tiene que deslizar (`b01-hora1-viewport.png`). Son 2 toques y un scroll. El segundo toque es correcto por seguridad (los antivirus del correo abren los enlaces), pero ahora parece que el email no ha servido.
- **Propuesta:** cuando llega con `?hora=N` válido, mostrar arriba del todo un bloque compacto:
  - Título: «¿Confirmas el **martes 6** a las **12:30**?»
  - Subtítulo: «Con Lucía Martín (Mirador) · 30 min · En persona · Café Central, Valencia»
  - Botón principal a todo el ancho: «Confirmar 12:30».
  - Debajo, enlace de texto «Elegir otra de sus horas» (despliega los radios) y la fila «Otra hora · No puedo».
  - La ficha de Lucía y el tema van **después**.
  - Cambiar «con un toque» por «en dos toques» no hace falta si se cumple el criterio.
- **Criterio de aceptación:** en iPhone 15 (393×659), al abrir `/reunion/demo/anfitrion?hora=1`, «Confirmar 12:30» se ve entero sin hacer scroll.

### MEET-04 · «Continuar» sin hora: el error aparece donde no se ve
- **Severidad:** ALTA (parece que el botón no funciona)
- **Dónde:** `meeting-request.tsx:358-362` (`setStepError`), error pintado en `slot-picker.tsx` (bloque `{error ? <p role="alert">…`, ≈l. 235-239 del archivo), encima de Duración/Cómo.
- **Qué pasa:** al tocar «Continuar» sin hora no hay ningún cambio en pantalla (`a05-sin-hora.png`). El lector de pantalla sí lo anuncia, pero quien mira no ve nada.
- **Propuesta (recomendada):** que el botón diga lo que falta y cuente lo que hay. Sin horas: botón atenuado con el texto «Elige al menos una hora» (sin `disabled`: al tocarlo hace scroll suave a la tira de días y la marca). Con horas: «Continuar con 2 horas →». Alternativa mínima: `scrollIntoView({block:"center"})` del error y foco en la tira de días.
- **Criterio de aceptación:** tras tocar «Continuar» sin hora, el mensaje o la tira de días quedan visibles en el viewport sin que el usuario haga scroll.

### MEET-05 · El selector abre en «Hoy» aunque casi todo esté pasado; fines de semana iguales; franja fija de 9:00 a 19:30
- **Severidad:** MEDIA
- **Dónde:** `slot-picker.tsx` (`activeKey` inicial, ≈l. 189: solo salta a mañana si ya pasó 19:30), `time.ts:15-18` (`TIME_GROUPS` 9–14 y 14–20), `upcomingDays` sin distinguir fin de semana.
- **Qué pasa:** a las 17:50, «Hoy» abre con 18 de 22 horas apagadas (`a04-paso1-full.png`); lo normal en un evento es quedar otro día. Sábado y domingo se ven como un laborable más. No hay 8:00 ni 20:00 (desayunos, afterworks). El mismo selector, con el mismo problema, es el de «Otra hora» de Alex (`b08-otra-hora.png`).
- **Propuesta:** abrir en el **primer día laborable con ≥4 horas libres** (a partir de las 15:00, mañana; si mañana es sábado, el lunes). Días de fin de semana con la etiqueta en gris claro (se pueden elegir). Cuando exista el horario del dueño (MEET-17), solo se ofrecen sus horas; mientras tanto, añadir un tercer grupo plegado «Más temprano o más tarde» (8:00–8:30, 20:00–21:00).
- **Criterio de aceptación:** abriendo el paso 1 a las 17:50 de un lunes, el día activo es el martes y ninguna hora de la primera fila está apagada.

### MEET-06 · El filtro anti-enlaces rechaza texto normal y no dice qué parte molesta
- **Severidad:** MEDIA
- **Dónde:** `src/lib/meetings/schema.ts:43-47` (`LINKISH_RE`, `PHONEISH_RE`, `NAME_RE`), mensajes en `schema.ts:62-65, 150, 180`.
- **Qué pasa (probado con las mismas expresiones):** fallan «Nos vimos en **Expo.Pack**», empresa «**Acme.io**», «Reunión **27-10-2026 10:30**» (fecha+hora = «teléfono»), «Ref. pedido 123456789», nombre «Marta (Aranda)», «Marta Ruiz, Aranda». El error dice «Sin enlaces ni teléfonos, por favor.» y Marta no ha escrito ninguno (`a18-envio1.png`).
- **Propuesta:**
  - Mensaje que señala la parte exacta: «“Expo.Pack” parece un enlace. Escríbelo sin el punto (Expo Pack).» y «“27-10-2026 10:30” parece un teléfono. Escribe la fecha con palabras.».
  - Afinar las expresiones: para dominios, exigir un TLD conocido (com, es, io, net, org, app, dev…) o `www.`/`/`. Para teléfonos, no contar los dígitos separados por `-`/`/` que formen una fecha `dd-mm-aaaa`. En el nombre, admitir `,` y `()`.
- **Criterio de aceptación:** «Nos vimos en Expo.Pack», «Grupo Aranda S.L.», «Reunión el 27-10-2026» pasan; «visita www.x.com» y «llámame al 612345678» siguen fallando, y el mensaje cita el fragmento.

### MEET-07 · Tras un error del servidor la casilla aparece desmarcada (pero sigue marcada)
- **Severidad:** MEDIA
- **Dónde:** `meeting-request.tsx:273-281` (checkbox controlado dentro de `<form action={submit}>`, `:329`). React 19 resetea el formulario tras la acción; el estado `consent` sigue en `true`.
- **Qué pasa:** tras el error de MEET-06, la casilla se ve vacía (`a18-envio1.png`). Si Marta corrige otro campo, vuelve a aparecer marcada sola. Si la toca para «marcarla», puede acabar desmarcándola. En la prueba, el reenvío sin tocarla **sí** se envió: lo que se ve no coincide con lo que se envía.
- **Propuesta:** no usar el reset automático: `onSubmit={(e) => { e.preventDefault(); startTransition(() => submit(new FormData(e.currentTarget))); }}`, o bien mandar `consent` como `<input type="hidden">` derivado del estado y dejar el checkbox sin `name`. (Seguramente afecta también a `ContactForm`: revisarlo.)
- **Criterio de aceptación:** tras cualquier error devuelto por el servidor, todos los campos y la casilla se ven exactamente como estaban.

### MEET-08 · La casilla de consentimiento: un toque y un error que podrían no existir
- **Severidad:** MEDIA
- **Dónde:** `meeting-request.tsx:272-289`, `schema.ts` (`consent: z.literal(true)`).
- **Qué pasa:** es el único campo que no aporta nada a la reunión y fue uno de los tres errores al enviar vacío. Marta no sabe por qué está («¿me van a apuntar a algo?»). Proponer una reunión **es** pedir que se le pasen sus datos a Alex: la base natural es la ejecución de lo que ella pide (art. 6.1.b), con información clara, no una casilla.
- **Propuesta (a validar por el abogado, ya pendiente en CLAUDE.md):** quitar la casilla y poner bajo «Enviar propuesta», en lugar de «Tus datos solo los ve Alex. No te apuntamos a nada.», el texto literal: «Al enviar, Alex recibe tu nombre, email y teléfono, y PassMe te escribe solo sobre esta reunión. [Más info]». Si el abogado la exige, al menos marcar el error junto al botón, no 4 líneas más arriba.
- **Criterio de aceptación:** el camino feliz del paso 2 son 2 campos + 1 toque.

### MEET-09 · «Atrás» y recargar tiran todo lo hecho
- **Severidad:** MEDIA
- **Dónde:** `meeting-request.tsx:299-307` (todo en `useState`, sin historial ni borrador).
- **Qué pasa:** el gesto de deslizar atrás de iOS en el paso 2 saca a Marta de la tarjeta (a la cámara, o a la página anterior); recargar cierra el formulario y borra horas y datos.
- **Propuesta:** `history.pushState` al pasar al paso 2 (`#reunion-2`) y escuchar `popstate` para volver al paso 1. Guardar `when`/`who` en `sessionStorage` (con try/catch) y, al volver a la tarjeta en la misma sesión, reabrir el formulario donde estaba.
- **Criterio de aceptación:** en el paso 2, «atrás» del navegador muestra el paso 1 con las horas elegidas; recargar en el paso 2 vuelve al paso 2 con los campos rellenos.

### MEET-10 · Pantalla de «enviada»: tres llamadas a la acción que compiten y una que sobra
- **Severidad:** MEDIA
- **Dónde:** `src/app/u/[slug]/page.tsx:58-68` (sigue pintando `ContactForm` y `CreateYoursCta`), `meeting-request.tsx:75-87`.
- **Qué pasa:** debajo de «Propuesta enviada» siguen «Déjale tu contacto a Alex» (Alex ya tiene su nombre, email y teléfono) y el bloque oscuro «Crear mi tarjeta», además de «Crear la mía con estos datos» (`a21-enviado-full.png`).
- **Propuesta:** al enviar la reunión, ocultar `ContactForm` (Alex ya tiene sus datos) y `CreateYoursCta` (su CTA vive ya en `SentMessage`). Mantener solo «Crear la mía con estos datos» + el nuevo «Ver o retirar mi propuesta» (MEET-01) en contorno. Igualmente, abrir un formulario debería plegar el otro (`a22-ambos-abiertos.png`).
- **Criterio de aceptación:** tras enviar, en la página hay un solo botón naranja.

### MEET-11 · El lugar y el enlace de vídeo no admiten lo que la gente pega
- **Severidad:** MEDIA
- **Dónde:** `schema.ts:65` (`place`, sin enlaces), `meeting-request.tsx:164-170` (videollamada: el visitante no puede dar enlace), `meeting-response.tsx:270-291`.
- **Qué pasa:** Alex pega un enlace de Google Maps → error (`b03-lugar-url.png`). Marta quiere Teams (su empresa lo exige) y no hay dónde poner su enlace. Si nadie lo pone, la confirmación dice «pasaos el enlace respondiendo a este correo», un paso manual más.
- **Propuesta:** lista blanca de mapas igual que la de vídeo (`maps.app.goo.gl`, `goo.gl/maps`, `google.com/maps`, `maps.apple.com`), convertidos en «Cómo llegar» en la página firmada y en el `.ics`. En el paso 1, con Videollamada: campo opcional «Enlace (si ya lo tienes)» con la misma lista blanca de vídeo. El dueño lo ve en su página firmada, como ya pasa con el lugar.
- **Criterio de aceptación:** un enlace `https://maps.app.goo.gl/…` se acepta como lugar; un enlace de Teams puesto por la visitante llega a la invitación de los dos.

### MEET-12 · Nombres distintos para lo mismo
- **Severidad:** MEDIA
- **Dónde:** `meeting-response.tsx:77-78, 301-310, 512, 515-526`; `emails.ts:107`; `meeting-request.tsx:104`.
- **Qué pasa:**
  - «Retirar propuesta» acaba con el título «**Reunión cancelada**» y el banner «Cancelada.» (`b14-invitado-retirada.png`).
  - El pie «Guarda este enlace: desde aquí puedes ver o cancelar la reunión» sale también cuando todavía es una propuesta y cuando ya está cancelada.
  - Para lo mismo hay cuatro nombres: «Otra hora» (página), «Proponer otra hora» (email), «Propón otras horas» (panel) y «Proponer otra fecha» (tras un no).
  - «Agendar reunión» convive con «Reservar cita» (MEET-18).
- **Propuesta (glosario):**
  - Acción del dueño: **«Proponer otras horas»** en el email, en el botón y en el título del panel.
  - Tras un rechazo o una retirada: **«Proponer otras horas»**, no «otra fecha».
  - Título tras retirar: «Propuesta retirada».
  - Pie del invitado según la fase: propuesta → «Guarda este enlace: desde aquí puedes ver o retirar tu propuesta.»; confirmada → «…ver o cancelar la reunión.»; cerrada → sin pie.
- **Criterio de aceptación:** `grep` de «Otra hora», «otra fecha» en `src/` devuelve 0; el invitado que retira ve «Propuesta retirada».

### MEET-13 · «Proponer otra fecha» obliga a empezar de cero
- **Severidad:** MEDIA
- **Dónde:** `meeting-response.tsx:515-520` (enlace a `/u/<slug>`); `declinedEmail` en `emails.ts:165`.
- **Qué pasa:** tras un «no puedo» o una cancelación, Marta vuelve a la tarjeta, reabre el formulario y reescribe nombre, email, teléfono, empresa y tema.
- **Propuesta:** que «Proponer otras horas» abra **en la misma página** el `CounterPanel` (ya existe para el dueño) y cree una propuesta nueva con los datos de la anterior (se puede hacer en el servidor a partir del enlace firmado). Alternativa barata: enlace a `/u/<slug>?reunion=1` que abre el formulario con nombre/email/empresa precargados (con `rememberDetails`).
- **Criterio de aceptación:** de «Alex no puede esta vez» a propuesta nueva enviada: día + hora + enviar, sin volver a escribir datos.

### MEET-14 · Calendario: la cancelación deja eventos huérfanos y una reunión confirmada no se puede mover
- **Severidad:** MEDIA
- **Dónde:** `src/lib/meetings/calendar.ts` (`buildIcs` con `PUBLISH`/`CANCEL`, `googleCalendarUrl`), `emails.ts:195`, `state.ts` (`allowedActions`: confirmada → solo `cancel`), `meeting-response.tsx:427-450`.
- **Qué pasa:**
  - El email de confirmación ofrece «Añadir a Google Calendar» (enlace de plantilla), que crea un evento que ningún email posterior puede tocar. El propio texto lo admite: «en Gmail, bórrala tú».
  - Con `PUBLISH` sin asistentes, Gmail y Outlook tratan el `.ics` como un archivo que se importa, no como una invitación que se actualiza sola. El `CANCEL` posterior lleva un `ATTENDEE` que el `PUBLISH` no tenía; en Apple Calendar el resultado es incierto.
  - Para cambiar la hora de una reunión ya confirmada hay que cancelarla y volver a proponer: un evento cancelado más uno nuevo.
- **Propuesta (recomendada):** enviar `METHOD:REQUEST` con **organizador = la dirección remitente de PassMe** (`hola@getpassme.com`, que es el From y evita el aviso de «organizador distinto») y Alex y Marta como asistentes con `RSVP=FALSE`. Así Gmail, Outlook y Apple la añaden y la actualizan solos, y `CANCEL`/`SEQUENCE+1` la borra o la mueve. Quitar el botón «Añadir a Google Calendar» del email (lo hace el propio Gmail) y dejarlo solo en la página.
  - En la página de una reunión confirmada, añadir junto a «Cancelar reunión» un **«Cambiar hora»** que reutilice `counter` (mismo UID, `SEQUENCE` siguiente) y deje la reunión «pendiente» hasta que el otro elija.
- **Criterio de aceptación:** en Gmail, al confirmar aparece el evento con la tarjeta «Añadido al calendario» sin tocar nada; al cancelar desaparece solo. Mover la hora actualiza el mismo evento.

### MEET-15 · El email que recibe Marta es el de login de Alex, no el de su tarjeta
- **Severidad:** MEDIA
- **Dónde:** `src/lib/meetings/model.ts:33` (comentario: login email), `model.ts:103` (`organizer`), `view.ts:55`, `emails.ts:127`, `meeting-response.tsx:297`.
- **Qué pasa:** Alex puede usar un Gmail personal para entrar y tener `alex@estudionorte.com` en la tarjeta. Al confirmar, Marta recibe el personal como «Contacto» y como organizador del evento. El aviso «Lucía recibirá la invitación con tu email» no dice **cuál**.
- **Propuesta:** usar el primer enlace de tipo email visible de la tarjeta; si no hay, el de login. En `ConfirmPanel`, cambiar el texto a «Lucía recibirá la invitación con tu email **alex@estudionorte.com**.»
- **Criterio de aceptación:** con un login distinto del email de la tarjeta, la invitación y el email al invitado muestran el de la tarjeta, y la página de confirmar lo dice antes de confirmar.

### MEET-16 · En el editor, «Reuniones» está a 8 pantallas de distancia y no avisa
- **Severidad:** MEDIA
- **Dónde:** `src/components/editor/card-editor.tsx:326-332` (sección 06, en el `aside`, que en móvil va al final), `meetings-panel.tsx`.
- **Qué pasa:** en el iPhone, «Reuniones» empieza en y≈5 550 de 7 260 px (`c01-dash-full.png`). Si Alex entra al editor (no por el email), no ve que tiene una propuesta pendiente.
- **Propuesta:** banner arriba del editor, solo si hay alguna en «Te toca responder»: «**Lucía Martín** te ha propuesto una reunión · [Responder]» (con varias: «Tienes 2 propuestas de reunión · Ver»), que hace scroll a `#reuniones`. Y en móvil subir «Reuniones» y «Contactos recibidos» por encima de «Estilo» cuando tengan elementos.
- **Criterio de aceptación:** en `/dashboard` (demo, 393 px), sin hacer scroll se ve un aviso con el nombre de Lucía y un botón que lleva a su respuesta.

### MEET-17 · Al dueño le falta lo que esperaría poder configurar
- **Severidad:** MEDIA
- **Dónde:** `card-editor.tsx:276-289` (solo el interruptor).
- **Qué pasa:** Alex espera decir «solo entre semana de 9 a 14», «normalmente 30 min», «siempre por Meet con mi enlace» o «no hago llamadas». Hoy cualquiera le propone domingo a las 19:30, por teléfono.
- **Propuesta (divulgación progresiva):** bajo el interruptor, un enlace «Ajustes de reuniones» que despliega:
  1. «Cómo te pueden ver»: casillas En persona / Videollamada / Llamada (todas marcadas por defecto).
  2. «Cuándo»: días (L–V marcados) y franja (9:00–19:00).
  3. «Duración habitual»: 30 min.
  4. «Tu enlace de videollamada» (lista blanca): se pone solo al confirmar.
  5. «Lugar habitual» (opcional).
  6. «Antelación mínima»: 2 h.
  - El selector y el paso 1 del visitante solo ofrecen lo permitido.
- **Criterio de aceptación:** con «solo L–V 9–14» guardado, el selector del visitante no ofrece sábados ni horas de tarde, y con «Llamada» desmarcada no aparece esa opción.

### MEET-18 · «Reservar cita» y «Agendar reunión» a la vez confunden
- **Severidad:** MEDIA
- **Dónde:** `src/lib/card/links.ts:368-377` (`booking` → «Reservar cita»), `src/app/u/[slug]/page.tsx:58-61`.
- **Qué pasa:** si Alex tiene un Calendly y además el interruptor, la tarjeta muestra un enlace «Reservar cita» (icono de calendario) y debajo «Agendar reunión con Alex»: dos maneras de lo mismo, sin saber cuál usar. Y en el editor nadie le explica la diferencia.
- **Propuesta:**
  - Renombrar la etiqueta por defecto del enlace a **«Mi calendario de reservas»**.
  - Si hay enlace `booking` **y** reuniones activas, el paso 1 añade bajo el título: «¿Prefieres ver sus huecos libres? [Abrir su calendario ↗]», y el enlace no se repite en la lista.
  - En el editor, al añadir un enlace de reservas con el interruptor activo: «Ya tienes “Agendar reunión”. Si usas Calendly o Cal.com, la gente podrá elegir entre los dos.»
- **Criterio de aceptación:** con los dos activos, en la tarjeta hay un único punto de entrada visible para quedar.

### MEET-19 · Quitar una propuesta pendiente deja a la otra persona esperando
- **Severidad:** MEDIA
- **Dónde:** `src/components/editor/meetings-panel.tsx:124` («¿Quitar…? No le avisaremos.»), `:168`.
- **Qué pasa:** si Alex usa la papelera en una propuesta real que no le interesa, Marta no se entera nunca (se suma a MEET-01).
- **Propuesta:** en las de «Te toca responder», que la papelera ofrezca dos opciones: «Decir que no (le avisamos con un mensaje amable)», que hace `decline`, y «Quitar sin avisar (es spam)».
- **Criterio de aceptación:** desde el editor se puede rechazar una propuesta pendiente con un toque, y el invitado recibe el email de «no puede esta vez».

### MEET-20 · Demo: cancelar una reunión confirmada falla y deja la página sin salida; faltan variantes demo
- **Severidad:** MEDIA (Diego enseña y prueba con la demo)
- **Dónde:** `src/app/reunion/actions.ts` (`demoAnswer`, ≈l. 59-80: siempre parte de la propuesta pendiente), `src/app/reunion/[id]/[sig]/page.tsx` (`loadView`, ≈l. 38-44).
- **Qué pasa:** confirmar → «Cancelar reunión» → «Esta propuesta ya no admite cambios.» y la vista vuelve a la propuesta original, sin ningún panel ni botón (`b07-cancelada.png`). Además no hay demo de: invitado con reunión confirmada, invitado ante una contrapropuesta, caducada y pasada.
- **Propuesta:** que el estado demo viaje en el formulario (campo oculto `demoState` con `status`/`confirmedStart`, validado) o en el id (`/reunion/demo-confirmada/anfitrion`, `/reunion/demo-contra/invitado`, `/reunion/demo-caducada/invitado`), reutilizando `demoOwnerMeetings`.
- **Criterio de aceptación:** en demo, confirmar y luego cancelar termina en «Reunión cancelada»; las cuatro variantes existen y tienen un test E2E cada una.

### MEET-21 · Detalles del email de propuesta
- **Severidad:** BAJA
- **Dónde:** `emails.ts:101-105`, `email-layout.ts:87` (el primer botón es el principal).
- **Qué pasa:** el primer horario sale en naranja relleno y el resto en contorno, como si fuera el recomendado (solo es el más temprano). Los botones no dicen cuánto dura.
- **Propuesta:** todos los horarios con el mismo estilo (contorno de tinta) y la duración en el texto: «mar 6 oct · 10:00–10:30». Primera línea del cuerpo, más corta: «Lucía Martín (Mirador) vio tu tarjeta y te propone 2 horas. Toca la que te venga bien.»
- **Criterio de aceptación:** en el HTML del email ningún botón de hora tiene fondo `#c24e1c`.

### MEET-22 · «Otra fecha» añade el día fuera de la vista
- **Severidad:** BAJA
- **Dónde:** `slot-picker.tsx` (`pick` y `strip`, ≈l. 189-215).
- **Qué pasa:** el 27/10 se coloca al final de la tira (posición 15) y no se ve cuál está activo (`a09-otra-fecha.png`).
- **Propuesta:** insertar el día ordenado y hacer `scrollIntoView({inline:"center"})` del día activo al elegirlo.
- **Criterio de aceptación:** tras elegir otra fecha, el día aparece resaltado en la tira visible.

### MEET-23 · Títulos y textos del paso 2
- **Severidad:** BAJA
- **Dónde:** `meeting-request.tsx:203-205, 258-262`.
- **Qué pasa:** «¿Quién propone?» suena raro (ella es quien propone, lo sabe). El tema es un `input` de una línea con 140 caracteres y el texto de ejemplo se corta («Me gustaría habla…»).
- **Propuesta:** título «¿Cómo te **avisamos?**». Subtítulo: «Te escribimos aquí cuando Alex elija una hora.». Tema como `textarea` de 2 líneas con el ejemplo «Nos conocimos en… · Me gustaría hablar de…».
- **Criterio de aceptación:** el ejemplo del tema se lee entero a 393 px.

### MEET-24 · Mensaje engañoso en las notas
- **Severidad:** BAJA
- **Dónde:** `schema.ts:180` («Sin enlaces, por favor: los veréis en la invitación.»).
- **Qué pasa:** la invitación no lleva ningún enlace de la nota.
- **Propuesta:** «Sin enlaces, por favor. Si necesitáis compartir uno, hacedlo respondiendo al email de confirmación.»
- **Criterio de aceptación:** el texto no promete nada que la invitación no haga.

### MEET-25 · Pulido del `.ics`
- **Severidad:** BAJA
- **Dónde:** `model.ts:85-93` y `view.ts:63-73`.
- **Qué pasa:** la descripción del dueño lleva doble paréntesis («Lucía Martín (Mirador) (lucia@… · +34…)»). El botón «Google Calendar» de la página del dueño no lleva el contacto, pero el del email sí. Alarma fija de 30 min también para reuniones en persona.
- **Propuesta:** descripción en líneas: «Con: Lucía Martín · Mirador», «Email: …», «Teléfono: …», «Tema: …». La misma función para la página y el email. Alarma de 1 h en persona y de 10 min en vídeo o llamada.
- **Criterio de aceptación:** el `.ics` del dueño y su enlace de Google tienen la misma descripción, sin paréntesis anidados.

### MEET-26 · El CTA de reunión no se ve en la primera pantalla
- **Severidad:** BAJA (decisión consciente: la tarjeta manda)
- **Dónde:** `src/app/u/[slug]/page.tsx:58`.
- **Qué pasa:** en el iPhone 15 hay que deslizar para descubrir «Agendar reunión» (`a01-tarjeta-viewport.png`). Para Marta, que vino a quedar, es un deslizamiento.
- **Propuesta:** no moverlo. Si en las métricas se ve poco uso, añadir junto al botón de compartir un botón redondo con el icono de calendario («Agendar reunión») que hace scroll y abre el formulario.
- **Criterio de aceptación:** medir aperturas del formulario y comparar antes de decidir.

---

## 4. Cosas que están bien (no romperlas)

- **Dos pasos plegados** dentro de la propia tarjeta, con «1/2 · 2/2», foco al título de cada paso y animación sobria. La tarjeta sigue siendo la protagonista.
- **Selector de horas**: pastillas grandes de 44 px, contador «0/3 → 3/3», puntito en los días con horas, pastillas con ✕ para quitar, aviso al intentar la cuarta. Se entiende el máximo de 3 sin leer instrucciones.
- **Resumen del paso 1 en el paso 2 con «← Cambiar»**, que conserva todo al volver.
- Valores por defecto sensatos: 30 min, En persona, lugar opcional. Llamada → el teléfono se vuelve obligatorio y se explica antes («en el siguiente paso deja tu teléfono»).
- Inputs a 16 px (iOS no hace zoom), `autoComplete` correcto (name, email, tel, organization), errores por campo con texto humano.
- «Crear la mía con estos datos» tras enviar: encaja con la prioridad nº 1 del proyecto.
- **Email del dueño**: asunto claro, preheader útil, un botón por hora que preselecciona esa hora, «Proponer otra hora · No puedo», marca coherente con la web.
- **Seguridad bien pensada y que no se nota**: enlace firmado sin login, el segundo toque protege de los antivirus del correo, texto fijo hacia el invitado, lista blanca de vídeo, topes de emails.
- La página de respuesta: estados con títulos humanos («Lucía quiere reunirse contigo», «Esperando a Lucía», «Has dicho que no esta vez»), banner de resultado con foco, «Tu nota» visible, confirmación en dos pasos para cancelar («No, mantener / Sí, cancelar»).
- Enlace manipulado → mensaje claro y salida a PassMe.
- Los textos de privacidad explican el flujo con detalle (`/privacidad#reuniones`).

---

## 5. «Ya lo había pensado» (lo que un usuario avanzado esperaría)

| Idea | Dónde viviría sin ensuciar el camino simple |
|---|---|
| **Reserva provisional en el calendario de Marta**: un `.ics` con las 3 horas como `STATUS:TENTATIVE`, que se sustituye por la buena al confirmar | Botón contorno «Reservar estas horas en mi calendario» en la pantalla de enviada |
| Recordatorio por email el día antes («Mañana a las 12:30 con Alex») con «Cancelar» | Automático, dentro del presupuesto diario de emails; interruptor en Ajustes de reuniones |
| **Cambiar hora** de una reunión confirmada sin cancelar | Página de la reunión, junto a «Cancelar reunión» (MEET-14) |
| Horario, días, formatos, duración, enlace de vídeo y lugar por defecto | «Ajustes de reuniones» plegado bajo el interruptor (MEET-17) |
| Conectar Google/Outlook para apagar las horas ocupadas y crear el Meet/Teams solo | Función Pro, dentro de «Ajustes de reuniones» (ya en el backlog) |
| Pase de Wallet por reunión en la pantalla de bloqueo ese día | Botón «Añadir a la cartera» en la página de la reunión confirmada (ya en el backlog) |
| Zona horaria del dueño y doble hora cuando difiere | Automático (MEET-02) |
| Nota privada del dueño sobre la reunión («viene por el packaging de 2027») | Página del dueño, campo plegado «Nota para ti» |
| Exportar reuniones a CSV o CRM | Panel «Reuniones», menú «…» (junto a exportar contactos, Pro) |
| Plantillas de rechazo amable («Este mes no puedo, escríbeme en noviembre») | Chips sobre la nota de «No puedo» |
| Proponer el sitio con un buscador de mapas | «Dónde», con sugerencias al escribir (Pro / más adelante) |
| Inglés para visitantes internacionales | Idioma del navegador en la página pública, los emails y el `.ics` |

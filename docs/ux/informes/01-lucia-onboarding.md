# Auditoría UX de PassMe: onboarding (persona «Lucía»)

Carpeta: `scratchpad/ux/lucia/`. Las capturas citadas están en esta misma carpeta. Los scripts que generan las capturas son `s1.cjs`–`s4.cjs`, con Playwright y Chromium emulando un `devices["iPhone 15"]` de 393×659 px.

## 1. Persona y contexto

Lucía tiene 34 años, es comercial en una empresa de software y usa un iPhone 15 (Safari). Está de pie en un congreso, con un café en la mano izquierda y el pulgar derecho libre. Alguien le manda por WhatsApp «aquí tienes mi tarjeta» con el enlace `/u/demo`. Nunca ha oído hablar de PassMe. Quiere tres cosas: guardar el contacto, devolver el suyo y no perder más de un minuto.

## 2. Recorrido narrado

### 2.1 Vista previa en WhatsApp (`03-og-image.png`)
- Título «Alex Rivera · PassMe», descripción «Product Designer · Estudio Norte · Valencia, ES» e imagen 1200×630 con el nombre en grande, el motivo y la URL.
- Antes de tocar, ya sé de quién es y que es «una tarjeta de contacto». Muy bien.
- Nota del entorno: `og:image` apunta a `localhost:3000` porque la URL base del sitio no coincide con el puerto 3200. En producción no pasa.

### 2.2 Primeros 3 segundos en `/u/demo?src=qr` (`01-tarjeta-fold.png`)
- Carga en ~0,9 s.
- Sin hacer scroll veo, por orden: logo PassMe + botón negro «Crea la tuya gratis», la tarjeta naranja «TARJETA DE CONTACTO / Alex Rivera / Product Designer · Estudio Norte», la ubicación, la bio, «Guardar contacto» con un botón redondo de compartir, y los dos primeros enlaces (email y LinkedIn).
- Se entiende de quién es y qué puedo hacer («Guardar contacto»).
- Lo primero que llama la atención, sin embargo, es un botón negro de venta («Crea la tuya gratis») con el mismo peso visual que la acción que he venido a hacer.
- Con `?src=qr` y sin él la página es idéntica; el parámetro solo sirve para analítica.

### 2.3 Guardar el contacto de Alex
- 1 toque en «Guardar contacto». El servidor responde `text/vcard` *inline* a iOS (`/u/demo/vcard`), y Safari abre la hoja nativa del contacto.
- Después hay que tocar «Crear contacto nuevo» y luego «OK». Son **3 toques** en total. Es el comportamiento estándar de iOS; no se puede probar en Chromium.
- La vCard es correcta: nombre, empresa, cargo, email, LinkedIn, web, Instagram y la URL de PassMe. El móvil oculto no aparece. Bien.
- Al volver a la página **no cambia nada**: no hay «guardado», ni pista de qué hacer ahora (ONB-10).

### 2.4 «Quiero la mía»: los dos caminos (`02-tarjeta-full.png`, `11-contact-sent.png`)
- **Camino 1:** «Crea la tuya gratis» (arriba) o «Crear mi tarjeta» (bloque oscuro del final). Las dos llevan a `/crear?de=demo` con el formulario vacío.
- **Camino 2:** «Déjale tu contacto a Alex» abre el formulario (Nombre, Email, Teléfono, Empresa, Mensaje y consentimiento). Tras «Enviar mi contacto» aparece «Alex ya tiene tu contacto» y, debajo, «¿Y si te haces tu propia tarjeta? Ya tenemos tus datos» → **«Crear la mía con estos datos»**.
- «Con estos datos» significa que `/crear` llega ya relleno con nombre, empresa, móvil y email (`12b-crear-prefilled-full.png`); el cargo y el LinkedIn quedan vacíos. Funciona y es la mejor idea del flujo.
- Pero solo aparece *después* de enviar el contacto. Como Lucía, no sé que existe, y no entiendo por qué hay tres botones de «crear» con tres textos distintos (ONB-09).

### 2.5 `/crear` (`21-crear-direct-fold.png`, `22-empty-submit.png`, `24-filled-fold.png`)
- **Arriba:** pastilla «Vienes de la tarjeta de Alex Rivera» (genial), el titular «Tu tarjeta, en un minuto.» y una vista previa del pase que se actualiza mientras escribo. Al elegir el color, el pase cambia al momento. Muy satisfactorio.
- **Campos:** Nombre y apellidos* · Cargo (opcional) · Empresa (opcional) · Móvil · Email · LinkedIn («al menos uno») · Color (10 círculos).
- **Botón «Crear mi tarjeta»:** está a y=1360 en un documento de 1547 px. Con el iPhone hay que hacer 2 scrolls largos, y con el teclado abierto no se ve nunca.
- **Envío vacío:** salen «Tu nombre es obligatorio.» y el aviso de contacto, y el foco va al primer error. Bien.
- **Valores erróneos** («611», «lucia@gmail»): «Número de teléfono no válido.» y «Email no válido.» al salir del campo. Bien.
- **Recargar a mitad: se pierde todo** (el nombre quedó vacío después de `reload`). ONB-01.
- **Recargar en el paso del email:** vuelvo al *formulario* con los datos (se guardaron al pulsar el botón). Pero he perdido el paso en el que estaba (ONB-06).

### 2.6 Email y código (`13-auth-step-prefilled.png`, `14-code-step.png`, `26-wrong-code.png`)
- Tras pulsar «Crear mi tarjeta» **la tarjeta no se crea**. Llega una pantalla nueva: «Último paso · Guárdala con tu email», con el email que ya escribí y otro botón, «Enviarme un código» (ONB-05).
- **Pantalla del código:**
  - «¡Código enviado! … lucia.gomez@gmail.com», con «Cambiar» y 8 casillas que reciben el foco automáticamente (`autocomplete=one-time-code`).
  - «Reenviar en 1:00» y «Abrir Gmail ↗».
  - Al completar las 8 cifras, se envía solo. Excelente.
- **Código erróneo:** casillas en rojo y «Código incorrecto o caducado.»; las casillas se vacían y el foco vuelve. Bien.
- **Reenvío a los 60 s:** se activa «¿No te llega? Reenviar código» y aparece la confirmación. Bien.
- **«Editar mis datos»** tras haber pedido el código: al volver a «Crear mi tarjeta» aparece otra vez el paso del email y hay que pedir *otro* código (ONB-06).
- **Lucía usa la app de Gmail, no Mail:** iOS no le sugerirá el código sobre el teclado. Tiene que salir a Gmail, copiarlo y volver. Si Safari descarta la pestaña mientras tanto, vuelve al formulario (ONB-06). «Abrir Gmail» abre la web de Gmail en Safari, no la app (ONB-14).

### 2.7 Bienvenida `/dashboard?nueva=1&de=demo` (`15-welcome.png`, `30-welcome-scrolled.png`, `43-landscape-welcome.png`)
- Lo primero que veo es **un QR grande** con «ENSÉÑALO: SE ESCANEA CON LA CÁMARA» y «Ya tienes tu tarjeta». Exactamente lo que hay que ver. Es lo mejor del producto.
- **Problemas:**
  - La barra fija «✓ Todo guardado [Guardar]» (Guardar en gris, desactivado) flota sobre la bienvenida. En horizontal tapa la mitad del QR (ONB-07).
  - «Añadir a Apple Wallet» queda bajo el pliegue: hay que hacer scroll (ONB-08).
  - Tocar el QR no hace nada: no hay pantalla completa ni brillo (ONB-08).
  - El texto da por hecho que Alex está delante («Enséñale este QR a Alex»). Lucía recibió el enlace **por WhatsApp**: Alex no está delante, y lo que necesita es *mandarle* su tarjeta (ONB-04).
- **Nota del modo demo:** como el demo reutiliza la tarjeta de Alex, la bienvenida dice «Ya tienes tu tarjeta, Alex» y «a quien quieras». En producción saldría «Lucía» y «a Alex».
- **Botones de la bienvenida:**
  - «Añadir a Apple Wallet»: en iPhone sale solo el de Apple. Bien.
  - «Compartir enlace» (hoja de compartir), «Ver mi tarjeta» (abre una pestaña nueva) y «Personalizar: foto, colores y más ↓».
  - «✕» hace lo mismo que «Personalizar»: los dos cierran la bienvenida.

### 2.8 Al día siguiente (`31-dashboard-return.png`, `50-login.png`, `20-landing-fold.png`)
- **Si añadió el pase a Wallet:** perfecto, el QR está en Wallet.
- **Si no lo añadió** y abre `getpassme.com`, en la landing (iPhone, 393 px) solo hay «Crear mi tarjeta». **«Entrar» está oculto por debajo de 400 px de ancho**: solo aparece en el footer, a 7.300 px de profundidad (ONB-03).
- **Al entrar llega al *editor***, con el título «Tu tarjeta, a tu manera.», el aviso, las pestañas «Apple Wallet / Google Wallet / Al escanear» y un pase de muestra.
- **El QR está a y=659**, justo debajo del pliegue y tapado por la barra de guardar. Mide 112 px y vive dentro de una «Vista aproximada». No hay ningún «Mostrar mi QR» (ONB-02).
- La página del editor se desborda en horizontal: 397 px de contenido en 393 px de pantalla, y 397 en 320 en un iPhone SE (ONB-12).

### 2.9 Recuento de toques: desde que abre el enlace hasta que enseña el QR

Abreviaturas: **T** = toques, **C** = campos, **S** = scrolls.

| Camino | Toques | Campos | Scrolls | Detalle |
|---|---|---|---|---|
| **Mínimo hoy** (solo nombre + email; código autorrellenado desde Mail) | **4** | **2** | 2 | «Crea la tuya gratis» → nombre → email → scroll → «Crear mi tarjeta» → «Enviarme un código» → sugerencia del código → QR |
| **Realista para Lucía** (cargo, empresa, móvil y email; Gmail app) | **7–8** | **5** | 2 | Igual, más: salir a Gmail, abrir el email, copiar, volver, pegar |
| **Guardando antes a Alex** | **+3** | — | — | «Guardar contacto» → «Crear contacto nuevo» → «OK» |
| **Vía «Déjale tu contacto»** (medido en `s2.cjs`) | **6** | **5** | 3 | abrir formulario, 4 campos, consentimiento, «Enviar», «Crear la mía con estos datos», «Crear mi tarjeta», «Enviarme un código», código |
| **Añadirlo a Apple Wallet** desde la bienvenida | **+2** | — | 1 | scroll → «Añadir a Apple Wallet» → «Añadir» (hoja de iOS) |
| **Volver mañana y enseñar el QR** (sin Wallet, sesión viva) | **2–3** | — | 1 | landing → «Crear mi tarjeta» (redirige al editor) → scroll hasta el pase |

**Flujo mínimo ideal: 3 toques + 2 campos, y 0 scrolls.**
1. «Crea la tuya» (1 toque).
2. Una pantalla corta con **Nombre** y **Email**, autorrellenados con QuickType, y el botón «Crear mi tarjeta» pegado al teclado. Ese botón **envía ya el código** a ese email (1 toque).
3. Sugerencia del código sobre el teclado → envío automático (1 toque) → bienvenida con el QR a pantalla completa y «Añadir a Apple Wallet» visible.

Si Lucía viene de un enlace y no de un QR, la acción principal de la bienvenida pasa a ser «**Mandarle mi tarjeta a Alex**» (1 toque). Con Google activado (`docs/SETUP.md` 1.6): «Continuar con Google» → elegir cuenta = **2 toques y 0 campos**.

**Qué hay que cambiar para llegar ahí:**
- ONB-05: fusionar el formulario con el paso del email.
- ONB-04: adaptar la acción principal de la bienvenida según el origen.
- ONB-08: QR a pantalla completa y Wallet visible sin scroll.
- ONB-01 y ONB-06: no perder nada en el camino.

## 3. Hallazgos

### ONB-01 · Lo escrito en `/crear` se pierde al recargar o si iOS descarta la pestaña
- **Severidad:** ALTA
- **Dónde:** `/crear`, en `src/components/create/create-flow.tsx`:
  - :135–146 (`submit`): el borrador solo se escribe en `localStorage` al pulsar el botón.
  - :86: además, se borra en cuanto se restaura.
- **Qué pasa:** relleno nombre, móvil, email y LinkedIn, recargo, y todo vacío (comprobado con `page.reload()`: «after reload name: ''»). En un congreso, Lucía cambia a WhatsApp para copiar su LinkedIn o contesta una llamada; iOS descarta pestañas en segundo plano con frecuencia. Al volver, el formulario está en blanco. En un flujo que promete «en un minuto», eso es abandono.
- **Propuesta:**
  - Guardar el borrador en cada cambio (con un retardo de 300 ms) mediante `writeStoredDraft({ draft, pending: false, from: origin, authEmail: null, viaGoogle: false })`.
  - Restaurarlo al hidratar, como ya se hace.
  - No llamar a `clearStoredDraft()` en el paso del formulario (:86). Solo al crear la tarjeta con éxito, cosa que ya hace el editor.
  - Mantener el TTL de 20 min (`DRAFT_TTL_MS`).
- **Criterio de aceptación:** rellenar 3 campos, recargar y ver los 3 campos y el color tal como estaban. Lo mismo tras cerrar y reabrir la pestaña antes de 20 min.

### ONB-02 · Al volver, no hay forma rápida de enseñar «mi QR»
- **Severidad:** ALTA
- **Dónde:**
  - `/dashboard`: `src/app/dashboard/page.tsx:27–42` (cabecera) y `src/components/editor/card-editor.tsx:185–190` (la vista previa es lo único con QR).
  - `src/components/editor/welcome-panel.tsx:49–53`: al cerrar la bienvenida, el QR grande desaparece para siempre.
- **Qué pasa (`31-dashboard-return.png`):** al día siguiente, la pantalla de Lucía es un editor. El único QR mide 112 px, está bajo el pliegue, tapado por la barra «Todo guardado» y dentro de una «Vista aproximada: cada cartera dibuja el pase a su manera». Además, ese QR se pinta con el *slug* del borrador, sin guardar: si alguien cambia el enlace y no guarda, enseña un QR que da 404.
- **Por qué importa:** la prioridad nº 1 del proyecto es «enseñar tu QR de vuelta». Quien no añadió el pase (Android sin Google Wallet aprobado, o que dijo «luego») no tiene forma de hacerlo en menos de 3 toques más scroll.
- **Propuesta:**
  - En `DashboardHeader`, sustituir el enlace técnico `/u/{slug} ↗` por un botón «**Mi QR**» (icono QR + texto), siempre visible arriba a la derecha.
  - El botón abre la vista de QR a pantalla completa de ONB-08, con el QR del **slug guardado** (`savedSlug`).
  - Aceptar `/dashboard?qr=1` para abrirla directamente.
  - Añadir un `manifest.webmanifest` con `name: "PassMe"`, `start_url: "/dashboard?qr=1"` y `display: "standalone"`. Así, «Añadir a pantalla de inicio» es un acceso directo a «mi QR».
- **Criterio de aceptación:** desde `/dashboard` sin `?nueva=1`, 1 toque muestra un QR de ≥ 280 px escaneable con la cámara, y apunta al slug guardado aunque haya cambios sin guardar.

### ONB-03 · «Entrar» no aparece en la landing en un iPhone normal
- **Severidad:** MEDIA
- **Dónde:** `/`, en `src/components/landing/site-header.tsx:31` (`hidden … min-[400px]:inline-flex`).
- **Qué pasa (`20-landing-fold.png`):** el iPhone 15 mide 393 px, así que la cabecera solo muestra «Crear mi tarjeta». El único «Entrar» está en el footer (`site-footer.tsx:16`), a ~7.300 px. Hoy Lucía solo vuelve a su tarjeta pulsando «Crear mi tarjeta» y confiando en que la redirija, si su sesión sigue viva.
- **Propuesta:**
  - Mostrar siempre «Entrar» como enlace de texto (no como botón) a la izquierda del CTA. Para que quepa en 320 px, acortar el CTA de la cabecera a «Crear» por debajo de 400 px.
  - Si hay sesión (cookie de Supabase leída en el servidor), cambiar el CTA de la cabecera por «**Mi tarjeta**» → `/dashboard?qr=1`.
- **Criterio de aceptación:** con 320 y 393 px, «Entrar» es visible en la cabecera sin scroll. Con sesión iniciada, la cabecera dice «Mi tarjeta».

### ONB-04 · La bienvenida da por hecho que Alex está delante, y Lucía llegó por WhatsApp
- **Severidad:** ALTA
- **Dónde:**
  - `src/components/editor/welcome-panel.tsx:112–117` («Enséñale este QR a {theirName}»).
  - `src/lib/card/quick.ts:174–181` (`createPath`/`welcomePath`) y `src/components/card/create-yours.tsx:24,55`: el origen (`src`) no viaja a `/crear` ni a la bienvenida.
- **Qué pasa:** la visita de Lucía llegó con `src=share` o directa (WhatsApp), no con `src=qr`. Alex no está delante. La bienvenida le dice «Enséñale este QR a Alex: lo escanea con la cámara». Lucía piensa «¿cómo? si no está aquí». La acción útil (devolverle su tarjeta) es «Compartir enlace»: un botón pequeño, secundario y sin destinatario.
- **Propuesta:**
  - Propagar el origen: `createPath(slug, source)` → `/crear?de=demo&via=share`, y de ahí a `welcomePath(from, via)`.
  - **Si `via=qr`:** el texto se queda como está (el QR primero).
  - **Si es un enlace:**
    - La acción principal, encima del QR, es un botón `signal` «**Mandarle mi tarjeta a {Alex}**».
    - Ese botón deja la tarjeta de Lucía en los «Contactos recibidos» de Alex, reutilizando `submitContactAction` con los datos de la tarjeta recién creada y origen `crear`.
    - Debajo, en pequeño: «Alex verá tu nombre, tu email y tu móvil».
    - Si Alex no acepta contactos (`acceptsContactRequests` es falso), el botón principal pasa a ser «Enviarle mi tarjeta por WhatsApp…», que abre `navigator.share({ text: "Esta es mi tarjeta: <url>" })`.
    - El QR baja a un segundo plano con el texto «¿Estáis juntos? Enséñale este QR».
- **Criterio de aceptación:**
  - Abrir `/u/demo` sin `src`, crear la tarjeta: la bienvenida muestra «Mandarle mi tarjeta a Alex» como botón principal, y al pulsarlo aparece «Alex ya tiene tu tarjeta».
  - Con `?src=qr`, se mantiene el diseño actual.

### ONB-05 · «Crear mi tarjeta» no crea la tarjeta: lleva a una segunda pantalla con otro botón y el mismo email
- **Severidad:** ALTA
- **Dónde:**
  - `src/components/create/create-flow.tsx:135–146` (`submit` → `setStep("auth")`), :186–206 (cabecera «Último paso») y :233 (`submitLabel="Crear mi tarjeta"`).
  - `src/components/auth/email-code-auth.tsx` (EmailStep, «Enviarme un código»).
- **Qué pasa (`13-auth-step-prefilled.png`):**
  - El botón promete crear la tarjeta y aparece «Guárdala con tu email», con el email que ya escribí y otro botón que pulsar.
  - Son 1 pantalla y 1 toque de más. El mismo texto, «Crear mi tarjeta», se usa dos veces para cosas distintas: en el formulario lleva al email, y en el código está desactivado.
  - Además, el email aparece dos veces (contacto visible y cuenta), y Lucía no sabe si son lo mismo.
- **Propuesta (recomendada):**
  - Si el campo Email del formulario es válido, debajo del botón del formulario se muestra: «Te mandaremos un código a **lucia.gomez@gmail.com** para guardarla. · Usar otro email».
  - Al pulsar «Crear mi tarjeta», se envía el código directamente: `authAction` con `intent=send` y ese email. La pantalla pasa al *paso del código* con la cabecera «Último paso · Escribe el código».
  - «Usar otro email» despliega en línea un campo de email.
  - Si el formulario no tiene email (solo móvil o LinkedIn), se mantiene el paso actual, pero el botón del formulario dice «**Continuar**», no «Crear mi tarjeta».
  - El botón del paso del código pasa a decir «Crear mi tarjeta» y es el único con ese texto.
- **Criterio de aceptación:**
  - Con email en el formulario: de «Crear mi tarjeta» a la pantalla de 8 casillas en 1 toque, sin la pantalla «Guárdala con tu email».
  - Ningún botón con el texto «Crear mi tarjeta» lleva a otra pantalla que pida más datos.

### ONB-06 · Se pierde el paso del código (al «Editar mis datos», al recargar o al volver de Gmail)
- **Severidad:** MEDIA (ALTA para quien use la app de Gmail)
- **Dónde:** `src/components/create/create-flow.tsx`:
  - :74–84: al restaurar, siempre vuelve a `step="form"`.
  - :189–195: «Editar mis datos» desmonta `EmailCodeAuth` y pierde su estado.
- **Qué pasa:**
  - Recargar en la pantalla del email/código vuelve al formulario («after auth reload: heading Tu tarjeta, en un minuto.»).
  - Tras «Editar mis datos» y «Crear mi tarjeta», la pantalla vuelve a pedir el email y hay que pedir *otro* código, aunque el primero sigue siendo válido. En producción, Supabase obliga a esperar 60 s entre envíos.
  - En iPhone con Gmail app (sin sugerencia de iOS), Lucía sale a Gmail; si Safari descarta la pestaña, vuelve al formulario sin forma de escribir el código que tiene delante.
- **Propuesta:**
  - Guardar en el borrador el paso del código: `{ authEmail, codeSentAt }`. Al restaurar con `pending && authEmail && now - codeSentAt < 10 min`, abrir directamente el paso del código para ese email, con el texto «Ya te enviamos un código a …».
  - «Editar mis datos» no debe desmontar `EmailCodeAuth`: ocultarlo con `hidden` y conservar su estado.
  - Si el email no cambió, al volver se muestra el paso del código.
- **Criterio de aceptación:**
  - Pedir el código, recargar: aparecen las 8 casillas y `00000000` entra.
  - Pedir el código, «Editar mis datos», «Crear mi tarjeta»: aparecen las 8 casillas sin pedir otro código.

### ONB-07 · La barra «Todo guardado / Guardar» tapa la bienvenida (y el QR en horizontal)
- **Severidad:** ALTA
- **Dónde:** `/dashboard?nueva=1`, en `src/components/editor/card-editor.tsx:354` (siempre montada) y :386 (`fixed inset-x-0 bottom-0 z-30`).
- **Qué pasa:**
  - `15-welcome.png`: en vertical, la barra con «Guardar» desactivado (gris) tapa el final del texto de la bienvenida.
  - `43-landscape-welcome.png`: con el iPhone en horizontal (normal cuando lo giras para enseñarlo), **la barra cruza el QR por la mitad**, y un QR tapado no se escanea.
  - Además, un botón gris desactivado en la primera pantalla de un usuario nuevo parece roto.
- **Propuesta:**
  - No mostrar `SaveBar` mientras `!dirty && status.kind === "idle"`. Que aparezca, deslizándose, solo cuando haya cambios sin guardar o tras guardar (y que se oculte a los 3 s).
  - Nunca mostrarla mientras la bienvenida esté abierta y no haya cambios.
- **Criterio de aceptación:** en `/dashboard?nueva=1`, en vertical y en horizontal (852×393), no hay ningún elemento fijo superpuesto al QR. Al editar un campo, la barra aparece.

### ONB-08 · El QR de la bienvenida no se amplía, y Wallet queda bajo el pliegue
- **Severidad:** MEDIA
- **Dónde:** `src/components/editor/welcome-panel.tsx:93–105` (figura del QR, sin interacción) y :119–137 (botones de Wallet).
- **Qué pasa:**
  - El QR mide 224 px sobre fondo oscuro. Tocarlo no hace nada (comprobado: ni diálogo ni cambio de URL).
  - Con el brillo bajo en un pabellón luminoso, o a 1 m de distancia, cuesta escanearlo, y la pantalla se apaga si Alex tarda.
  - «Añadir a Apple Wallet» aparece solo tras hacer scroll (`30-welcome-scrolled.png`).
- **Propuesta:**
  - Al tocar el QR (y desde «Mi QR» de ONB-02), abrir un `<dialog>` a pantalla completa:
    - Fondo blanco y QR al 82vw (máximo 420 px).
    - Nombre encima, en `font-display`, y debajo «Toca para cerrar».
    - `navigator.wakeLock.request("screen")` mientras está abierto.
  - Añadir en la figura la pista «Toca para ampliar».
  - Reordenar la bienvenida en móvil: titular corto («Ya tienes tu tarjeta, Lucía.»), QR y, justo debajo, «Añadir a Apple Wallet». El párrafo explicativo va después.
- **Criterio de aceptación:**
  - En 393×659, el QR y «Añadir a Apple Wallet» se ven sin hacer scroll.
  - Al tocar el QR, se abre a pantalla completa con fondo blanco y la pantalla no se apaga mientras está abierto.

### ONB-09 · Tres caminos para «crear», con tres nombres, y los datos de «Déjale tu contacto» solo viajan por uno
- **Severidad:** MEDIA
- **Dónde:**
  - `src/components/card/create-yours.tsx:28` («Crea la tuya gratis») y :56 («Crear mi tarjeta»).
  - `src/components/card/contact-form.tsx:66–76` («Crear la mía con estos datos», con `rememberDetails` **solo en el `onClick`** de ese enlace), y `src/components/meetings/meeting-request.tsx:80–84` (ídem).
  - Landing: «Crear mi tarjeta gratis» / «Crear mi tarjeta». Login: «Créala en un minuto».
- **Qué pasa:**
  - Si Lucía deja su contacto y luego pulsa «Crea la tuya gratis» (arriba, siempre visible) en vez del enlace del mensaje de confirmación, llega a `/crear` **vacío**, aunque PassMe acaba de decirle «Ya tenemos tus datos».
  - Ver cinco textos distintos para la misma acción hace dudar de si son cosas diferentes.
- **Propuesta:**
  - Llamar a `rememberDetails(...)` en cuanto `state.status === "sent"` (un `useEffect` en `SentMessage`), no en el clic. Así, *cualquier* CTA hacia `/crear` llega relleno.
  - Unificar el texto: el CTA de producto siempre es «**Crear mi tarjeta**» (con «gratis» como subtítulo donde haga falta). En la confirmación del contacto: «Crear mi tarjeta con estos datos».
- **Criterio de aceptación:**
  - Enviar el contacto en `/u/demo`, pulsar «Crear mi tarjeta» de la barra superior: `/crear` muestra nombre, empresa, móvil y email rellenos.
  - Todos los CTA que llevan a `/crear` empiezan por «Crear mi tarjeta».

### ONB-10 · Después de «Guardar contacto» no pasa nada: se pierde el momento de reciprocidad
- **Severidad:** MEDIA
- **Dónde:** `/u/[slug]`, en `src/components/card/profile-card.tsx:153–156` (enlace simple a la vCard, sin estado).
- **Qué pasa:** Lucía guarda a Alex en Contactos, vuelve a Safari y la página sigue igual, con el mismo botón negro. No sabe si se guardó, y no se le invita a lo siguiente. Justo ese es el momento en que está más receptiva («ya tengo su contacto, ¿y él el mío?»).
- **Propuesta:**
  - Convertir el botón en un componente cliente. Al hacer clic (y al volver con `visibilitychange`), su texto pasa a «✓ Contacto guardado», en variante `outline`.
  - Debajo aparece, con `animate-rise`, una línea: «¿Y tú? **Déjale el tuyo a Alex** · **Crear mi tarjeta**». El primer enlace abre `ContactForm` y hace scroll hasta él.
- **Criterio de aceptación:** tras pulsar «Guardar contacto» y volver a la pestaña, el botón dice «Contacto guardado» y se ve la invitación a devolver el contacto sin hacer scroll.

### ONB-11 · El botón de venta compite con la acción del visitante en la primera pantalla
- **Severidad:** MEDIA
- **Dónde:** `src/components/card/create-yours.tsx:23–29` (variante `ink`, la misma que «Guardar contacto»).
- **Qué pasa (`01-tarjeta-fold.png`):**
  - Hay dos botones negros iguales en la primera pantalla, y el de arriba es publicidad de PassMe sobre la tarjeta de *otra persona*.
  - Para Lucía, la tarjeta de Alex debería ser la protagonista; además, el botón de arriba a la derecha es el más lejano para el pulgar.
  - El bloque oscuro del final ya vende muy bien.
- **Propuesta:** bajar la barra superior a variante `ghost` o `outline` («+ Crear la mía», texto `ink-soft`). Mantener el bloque del final y la invitación de ONB-10 como CTA fuertes.
- **Criterio de aceptación:** en la primera pantalla de `/u/[slug]` solo hay un botón relleno oscuro, «Guardar contacto».

### ONB-12 · El editor se desborda en horizontal en móvil
- **Severidad:** MEDIA
- **Dónde:** `/dashboard`, en `src/components/editor/preview-panel.tsx:23` (la `tablist` «Apple Wallet / Google Wallet / Al escanear») y el panel de vista previa (`min-h-[460px]`, con anchos fijos dentro).
- **Qué pasa:** `scrollWidth` 397 en un viewport de 393 (iPhone 15) y en uno de 320 (iPhone SE). En el SE, «Al escanear» queda cortado (`49-se-dashboard.png`) y toda la página baila hacia los lados al hacer scroll con el pulgar.
- **Propuesta:**
  - Añadir `min-w-0` a los contenedores flex/grid del panel y `overflow-hidden` al contenedor del pase.
  - Los botones de la tablist con `flex-1 min-w-0 truncate`, y textos más cortos en móvil: «Apple», «Google», «Web».
- **Criterio de aceptación:** `document.documentElement.scrollWidth === clientWidth` en `/dashboard` a 320, 375 y 393 px.

### ONB-13 · El botón del código se activa con 6 cifras cuando el código tiene 8
- **Severidad:** BAJA
- **Dónde:** `src/components/auth/email-code-auth.tsx:290` (`disabled={code.length < 6}`).
- **Qué pasa:** con 6 o 7 cifras escritas, «Crear mi tarjeta» está activo. Si Lucía lo pulsa, gasta un intento con un código incompleto, y solo hay 5 intentos por email y dispositivo antes del bloqueo.
- **Propuesta:** `disabled={code.length < LOGIN_CODE_LENGTH}`.
- **Criterio de aceptación:** con 7 cifras el botón está desactivado; con 8 se envía solo.

### ONB-14 · «Abrir Gmail» abre la web de Gmail en Safari, no la app
- **Severidad:** BAJA
- **Dónde:** `src/components/auth/email-code-auth.tsx:306–313` y `src/lib/auth/code.ts:38–47`.
- **Qué pasa:** en iPhone, `https://mail.google.com/...` abre Gmail web en otra pestaña, a menudo sin sesión o insistiendo en instalar la app. Lucía tiene la app.
- **Propuesta:**
  - En iOS (detectado como en `detectPlatform`), usar `googlegmail://` para Gmail y `message://` para iCloud, Mail o cualquier otro dominio («Abrir Mail»).
  - En Android, mantener la URL web, que abre la app.
  - Mantener el enlace web como alternativa en escritorio.
- **Criterio de aceptación:** con un User-Agent de iOS y email @gmail.com, el enlace es `googlegmail://`.

### ONB-15 · El botón redondo de compartir junto a «Guardar contacto» es ambiguo
- **Severidad:** BAJA
- **Dónde:** `src/components/card/profile-actions.tsx:87–98`.
- **Qué pasa:** es un icono sin texto pegado al CTA principal. Lucía duda si comparte *su* contacto o el de Alex. Para un visitante, reenviar la tarjeta de otra persona es una acción rara: es la del dueño.
- **Propuesta:** dejar «Guardar contacto» a todo el ancho y mover «Compartir» a un enlace de texto pequeño bajo la lista de enlaces: «Compartir la tarjeta de Alex».
- **Criterio de aceptación:** en la primera pantalla de `/u/[slug]` hay un único botón de acción, y su texto lo explica.

### ONB-16 · El color por defecto de la tarjeta nueva es el mismo naranja que la de Alex
- **Severidad:** BAJA
- **Dónde:** `src/lib/card/quick.ts:38` (`theme: DEFAULT_THEME.id`).
- **Qué pasa:** si Lucía no toca el color, su pase es idéntico en color al de Alex, y con el tiempo todos los de PassMe lo serán. No es lo que ella espera de «mi tarjeta».
- **Propuesta:** elegir el tema inicial en el servidor junto con `initialSeed`: aleatorio entre los 10 y, si hay `referrer`, distinto del suyo.
- **Criterio de aceptación:** `/crear?de=demo` nunca empieza con el tema de la tarjeta `demo`.

### ONB-17 · La tecla «Intro» del teclado en «Nombre» envía todo el formulario
- **Severidad:** BAJA
- **Dónde:** `src/components/create/quick-card-form.tsx:143–161`.
- **Qué pasa:** en iOS, pulsar «Ir» tras escribir el nombre envía el formulario y muestra el error «Añade al menos un teléfono…» antes de tiempo.
- **Propuesta:** `enterKeyHint="next"` en todos los campos menos el último relleno. En `onKeyDown` con Enter, mover el foco al siguiente campo y enviar solo desde el último.
- **Criterio de aceptación:** pulsar Enter en «Nombre» pasa el foco a «Cargo» sin mostrar errores.

### ONB-18 · La vCard no dice dónde os conocisteis y no registra el origen
- **Severidad:** BAJA
- **Dónde:** `src/components/card/profile-card.tsx:68` (enlace sin `?src=`) y `src/app/u/[slug]/vcard/route.ts`.
- **Qué pasa:** el contacto de Alex en el iPhone de Lucía no tiene contexto. Dentro de un mes no recordará de qué congreso es. Además, todas las descargas cuentan como `direct`.
- **Propuesta:**
  - Pasar `?src=` a `vcardHref`.
  - Añadir a la `NOTE` de la vCard una línea final: «Guardado con PassMe el 05/10/2026». La fecha se genera en el servidor, en `Europe/Madrid`.
- **Criterio de aceptación:** la vCard descargada desde `?src=qr` registra `source=qr` y su `NOTE` termina con la fecha.

### ONB-19 · Cabecera del editor con el enlace técnico «/u/demo ↗»
- **Severidad:** BAJA
- **Dónde:** `src/app/dashboard/page.tsx:32–38`.
- **Qué pasa:** para Lucía, «/u/lucia-gomez ↗» parece código. Lo sustituye «Mi QR» (ONB-02); «Ver mi tarjeta» ya existe en Wallet.
- **Propuesta:** ver ONB-02.

### ONB-20 · «Agendar reunión» y «Déjale tu contacto» tienen estilos distintos
- **Severidad:** BAJA
- **Dónde:** `src/components/meetings/meeting-request.tsx` (borde sólido, icono negro) frente a `src/components/card/contact-form.tsx:104–117` (borde discontinuo, icono naranja pastel).
- **Qué pasa (`02-tarjeta-full.png`):** son dos acciones del mismo nivel, una debajo de otra, con dos lenguajes visuales distintos.
- **Propuesta:** el mismo patrón para ambas: borde sólido `hairline`, icono en un círculo `signal-wash` y flecha `→` a la derecha.
- **Criterio de aceptación:** las dos filas comparten clases de contenedor e icono.

## 4. Cosas que están bien (no romper)

- **Vista previa Open Graph:** nombre, cargo, empresa y una imagen con el diseño de la tarjeta. En WhatsApp se entiende antes de abrir.
- **La tarjeta pública:** en 3 s se sabe de quién es y qué hacer, y «Guardar contacto» se ve sin scroll. La vCard es limpia, respeta lo oculto y se muestra *inline* en iOS.
- **El borrador en `/crear`:** la pastilla «Vienes de la tarjeta de Alex Rivera» y la vista previa del pase que cambia al escribir y al elegir color.
- **«Crear la mía con estos datos»:** reutiliza lo que dejó en el formulario de contacto. Es la mejor idea del flujo, solo hay que hacerla general (ONB-09).
- **Validaciones:**
  - Mensajes concretos («Número de teléfono no válido.», «Añade al menos un teléfono, un email o tu LinkedIn: es lo que guardarán de ti.»).
  - Se muestran al salir del campo, y el foco va al primer error.
- **Pantalla del código:**
  - Un solo input invisible sobre 8 casillas, con `autocomplete=one-time-code` y foco automático.
  - Envío al completar, el error vacía las casillas y devuelve el foco.
  - Cuenta atrás de reenvío y opción «Cambiar» email.
  - El aviso «si abres el botón del email en este dispositivo, esta pantalla continuará sola».
- **Bienvenida:**
  - El QR es lo primero que se ve y en grande.
  - Solo sale el botón de la cartera de la plataforma (Apple en iPhone).
  - «Personalizar» se deja para después.
- **Modo demo:** los avisos con el código `00000000` son claros. No mezclarlos con la UI de producción.

## 5. «Ya lo había pensado»: lo que un usuario avanzado esperaría

| Idea | Dónde debería vivir (sin ensuciar el camino simple) |
|---|---|
| **Intercambio sin estar juntos:** «Mandarle mi tarjeta a Alex» desde la bienvenida (ONB-04), y que Alex reciba «Lucía Gómez te ha devuelto su tarjeta» | Botón principal de la bienvenida solo si vienes de un enlace; email al dueño con texto fijo, como hoy |
| **QR a pantalla completa con brillo y sin que se apague** (Wake Lock) | Al tocar el QR, en la bienvenida y en «Mi QR» (ONB-08) |
| **Acceso directo a «mi QR»** (manifest PWA con `start_url=/dashboard?qr=1` e icono) | Invisible: solo se nota al usar «Añadir a pantalla de inicio». Opcional: una línea «Añádelo a tu pantalla de inicio» bajo «Mi QR» en iOS si no hay Wallet |
| **El pase en la pantalla de bloqueo durante el congreso** (`relevantDate` / ubicación del evento) | Futuro «modo evento», dentro de «A la cartera» del editor |
| **«Continuar con Google» o «Iniciar sesión con Apple»** para crear la tarjeta con nombre y email en 2 toques | Debajo del botón principal de `/crear` (ya está programado para Google: activarlo en producción, `docs/SETUP.md` 1.6). «Sign in with Apple» sería el equivalente natural en iPhone |
| **Importar desde LinkedIn** (cargo y empresa) | Enlace pequeño «Rellenar desde LinkedIn» junto a «Quién eres». Fase Pro o posterior |
| **Escanear una tarjeta de papel** (OCR) para crear la tuya | No en el MVP. Si llega, como acción secundaria en `/crear` |
| **Nota de «dónde nos conocimos»** en el contacto guardado y en los contactos recibidos | Automática en la vCard (ONB-18); campo «Mensaje» del formulario, ya existe |
| **Recuperar acceso si cambió de email** | Panel «Cuenta» del editor; enlace «¿Ya no usas ese email?» en `/login` |
| **Varias tarjetas** (trabajo y personal) | Backlog Pro, ya listado en `CLAUDE.md` |

### Notas del entorno, no del producto
- En el modo demo, la bienvenida saluda a «Alex» porque reutiliza la tarjeta de ejemplo.
- La pantalla del código muestra dos avisos de demo.
- `og:image` apunta a `localhost:3000`.
- El sitio no tiene modo oscuro (`prefers-color-scheme: dark` muestra lo mismo; `40-dark-card.png`). Para escanear un QR, el fondo claro es una ventaja, así que no lo marco como hallazgo.
- La landing promete «Doble clic al botón lateral, enseñas el QR». En iOS, el doble clic abre las tarjetas de Apple Pay, no los pases de tarjeta de embarque o de tienda. **Comprobarlo en un iPhone real** y, si no es así, cambiar el texto a «Abres la Cartera, enseñas el QR…».

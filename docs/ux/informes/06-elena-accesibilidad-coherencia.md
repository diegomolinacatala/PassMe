# Auditoría de accesibilidad y coherencia: Elena

Carpeta: `scratchpad/ux/elena/`. Datos crudos: `audit.json` (axe, encabezados, regiones, objetivos táctiles, orden de tabulación y reflow de 21 rutas), `contrast.json`, `aria-*.yml` (árbol de accesibilidad de cada página), `flows.log` y `flows-late.log` (recorridos con teclado) y capturas `m-*.png` (móvil), `w320-*.png` (320 px), `t200-*.png` (texto al 200 %) y `f-*.png` (pasos de los recorridos).

## 1. Persona y contexto

Elena tiene 45 años y baja visión. Usa el iPhone con VoiceOver en los formularios largos, el zoom de Safari (aA) al 150–200 % y, a veces, el texto grande del sistema. Recibe la tarjeta de un contacto en un evento, quiere guardarla, crear la suya y responder a una reunión desde el email. Además hago de **revisor de coherencia del sistema de diseño**: recorro todas las pantallas como lo haría un revisor de Apple (HIG).

## 2. Recorrido narrado

Entorno: el modo demo en `localhost:3200`, con Playwright y Chromium. Usé el perfil del iPhone 15 (393 px) con movimiento reducido, además de 320 px, texto al 200 %, espaciado de texto WCAG 1.4.12, escritorio al 200 % (640 px CSS), modo oscuro y apaisado.

1. **Tarjeta escaneada** (`/u/demo?src=qr`, `m-card-qr.png`). VoiceOver lee bien: H1 «Alex Rivera», `article` «Tarjeta de contacto de Alex Rivera» y enlaces con nombre completo («Email alex@example.com»). Llegar a «Guardar contacto» cuesta **3 tabulaciones**, y llegar a «Agendar reunión» cuesta **9**. Con el texto al 200 % (`f-t200-card.png`), el nombre se parte a mitad de palabra («Ale / x / Riv / era») y el botón «Crea la tuya gratis» se sale de la pantalla. A 320 px no hay scroll horizontal.
2. **Abro «Agendar reunión»** con Enter. El foco va al H3 «¿Cuándo os veis?», bien hecho. Pero ese H3 está bajo un H1, sin H2 entre medias. Desde el título hasta «Continuar» hay **31 tabulaciones**: 14 días, unas 18 horas y el selector de fecha (`f-meeting-slot.png`). En el paso 2 envío vacío y **el foco se pierde en `<body>`**. Solo se anuncia «Revisa los campos marcados.», sin decir cuáles. La casilla de consentimiento mide 16×16 px, aunque toda la etiqueta es pulsable.
3. **«Déjale tu contacto»** (`f-contact-errors.png`). El botón no dice si está plegado o abierto (falta `aria-expanded`) y no hay forma de cerrar el formulario. Al enviarlo vacío, el foco vuelve a perderse. Los errores salen en letra de 12 px, y lo único visible junto al botón es «Revisa los campos marcados.». Al enviarlo bien, el foco va a la confirmación, y eso está bien.
4. **Crear mi tarjeta** solo con teclado (`/crear?de=demo`). Son 19 tabulaciones hasta «Crear mi tarjeta», porque cada color es una parada y las flechas no funcionan en el grupo de colores. Al enviar vacío, el foco va al primer campo con error, bien hecho (`f-crear-errors.png`). Lo malo: los ejemplos en gris («Alex Rivera», «Product Designer») parecen datos ya rellenos para quien ve poco, y los bordes de los campos apenas se distinguen. El paso del email lleva el foco al H1, bien. El código incorrecto devuelve el foco y lo anuncia, bien (`f-crear-wrongcode.png`). Problemas: el botón «Cambiar» mide 24 px de alto, y «Reenviar» es texto de 20 px.
5. **Bienvenida** (`f-welcome.png`). La página carga con el foco en `<body>` y la barra «Todo guardado · Guardar» tapa la parte baja del panel de bienvenida. El encabezado H2 «Ya tienes tu tarjeta» va **antes** del H1 «Tu tarjeta, a tu manera.». Al cerrar la bienvenida con la X, **el foco se pierde**.
6. **Editor** (`/dashboard`). La página no tiene `<main>`. Entre 320 y 393 px hay **scroll horizontal**: el editor mide 381 px de ancho (`f-dash-320.png`). Al tabular hasta «Empresa», el campo queda **debajo de la barra de guardado** (`f-dash-obscured.png`). Al pulsar «Eliminar enlace», el contacto desaparece sin confirmación ni opción de deshacer, y el foco se pierde. Tras «Guardar» con errores, el foco se queda en «Guardar» y el texto pide revisar «los campos marcados en rojo».
7. **Responder a la reunión desde el email** (`/reunion/demo/anfitrion?hora=1`, `f-anf.png`). La página se entiende y la hora llega preseleccionada. «Confirmar 12:30» es un buen botón. Pero «Otra hora», «No puedo», «Volver», «Cancelar…» y «No, mantener» **pierden el foco** al cambiar de panel. Con VoiceOver, Elena se queda al principio de la página sin saber qué ha cambiado.
8. **Invitado** (`/reunion/demo/invitado`). Al pulsar «Retirar propuesta», el foco se pierde.
9. **Páginas legales, 404 y `/wallet`.** Correctas. Dos detalles: la 404 genérica usa el título de la portada, y `/dashboard/contactos` sin sesión devuelve un texto plano «Inicia sesión», sin `<title>` ni `lang` (las dos únicas violaciones de axe en todo el sitio).
10. **Modo oscuro.** No existe: `color-scheme: light` en `globals.css:113`. Es coherente con la marca «papel», pero el blanco cálido deslumbra a parte de la gente con baja visión (ver «Ya lo había pensado»). `prefers-reduced-motion` está bien resuelto: todas las animaciones quedan en 0,001 ms.

**axe** (wcag2a/aa, 21a/aa, 22aa) en las 21 rutas y en 12 estados intermedios (errores, pasos, confirmaciones): **0 violaciones**, salvo en `/dashboard/contactos`. Hay muy buena base. Las de buenas prácticas son estas: en `/dashboard` faltan `landmark-one-main` y `region`, y en el formulario de reunión salta `heading-order`. En todas las páginas axe devuelve el contraste como «incompleto», porque el `body` tiene una textura de fondo. Por eso calculé los ratios a mano (`contrast.mjs` y la tabla del Anexo E): el texto cumple, y fallan los bordes y los estados.

## 3. Hallazgos

### Accesibilidad

**A11Y-01 · El foco se pierde al cambiar de panel o tras un envío con errores**: ALTA
- Dónde:
  - `/reunion/*`: `meeting-response.tsx:302-310` («Otra hora», «No puedo»), `:212-218` («Volver»), `:380-404` («Cancelar…», «No, mantener»).
  - `/u/*`: `contact-form.tsx:230-239` y `meeting-request.tsx:381-386` (envío con errores).
  - `/dashboard`: `welcome-panel.tsx:83-90` y `:169-175` (cerrar la bienvenida) y `links-editor.tsx:142` (eliminar enlace).
- Qué pasa: en las 9 acciones probadas, `document.activeElement` acaba en `body` (`flows.log`). VoiceOver salta al principio o se queda mudo, y Elena no sabe que ha aparecido «Propón otras horas» ni qué campo falla.
- Propuesta:
  1. `CounterPanel` y `DeclinePanel`: `ref` + `tabIndex={-1}` en su `<h2>` y foco al montarlos, el mismo patrón que `StepWhen`.
  2. «Volver» y «No, mantener» devuelven el foco al botón que abrió el panel.
  3. Tras un envío con errores en el contacto o la reunión, foco al primer `[aria-invalid=true]`, como ya hace `quick-card-form.tsx:71`.
  4. Al cerrar la bienvenida, foco al H1 del editor (`card-editor.tsx:160`).
  5. Al eliminar un enlace, foco a la fila siguiente, o a «Añadir» si era la última.
- Criterio: en las 9 acciones, `document.activeElement !== document.body` y el elemento enfocado es el título nuevo, el primer campo con error o el disparador.

**A11Y-02 · La barra de guardado tapa el campo enfocado (WCAG 2.4.11)**: ALTA
- Dónde: `/dashboard`, `card-editor.tsx:386-405` (`fixed bottom-0`).
- Qué pasa: al tabular a «Empresa», el campo queda en y=622–666 y la barra en y=600–654 (`f-dash-obscured.png`). axe marcó 9 controles «OBSCURED» en el recorrido. En la bienvenida, la barra tapa «Añadir a Apple Wallet».
- Propuesta: añadir `scroll-padding-bottom: 6rem` al `html` del editor (o `scroll-margin-bottom` en los campos). Además, **ocultar la barra mientras no haya cambios** («Todo guardado» con un botón desactivado no aporta nada) y mostrarla solo con `dirty`, «Guardando…» o un error.
- Criterio: tabulando por todo el editor a 393×666, ningún control enfocado se solapa con la barra. Con `?nueva=1` y sin cambios, la barra no se ve.

**A11Y-03 · Scroll horizontal en el editor de 320 a 393 px (WCAG 1.4.10)**: ALTA
- Dónde: `/dashboard`, la vista previa móvil `card-editor.tsx:188-190` → `preview-panel.tsx:23-58`.
- Qué pasa: la columna mide 381 px en anchos de 320, 360, 375 y 393 (`ov.mjs`). El selector «Apple Wallet / Google Wallet / Al escanear» y el pase se cortan por la derecha (`f-dash-320.png`). En el iPhone 15 sobran 4 px, y en un SE sobran 61. Con el zoom de Safari al 150 %, toda la pantalla baila de lado a lado.
- Propuesta: `min-w-0 overflow-hidden` en el `tabpanel` y en el pase. Que el pase escale al ancho disponible (`w-full max-w-[330px]` sin mínimo intrínseco). Pestañas con `min-w-0` y `truncate`, o textos cortos: «Apple», «Google», «Web».
- Criterio: en `/dashboard` y `?nueva=1`, `scrollWidth === clientWidth` a 320, 360, 375 y 393 px.

**A11Y-04 · Bordes de campo, interruptores y estados seleccionados casi invisibles (WCAG 1.4.11)**: ALTA (para Elena)
- Dónde:
  - Campos (`border-line`, 1,42:1 sobre `card` y 1,31:1 sobre `paper`): `fields.tsx:7`, `quick-card-form.tsx:12`, `email-code-auth.tsx:15`, `contact-form.tsx:15`, `form-bits.tsx:8`.
  - Interruptor apagado (`bg-line-strong/70`, 1,60:1): `fields.tsx:151`.
  - Opción elegida de `Segmented` (`card` sobre `paper-deep/70`, ~1,1:1, solo con sombra): `form-bits.tsx:78`.
  - Pestañas de la vista previa: `preview-panel.tsx:35`.
  - Borde del botón `danger` (1,98:1): `button.tsx:14`.
- Qué pasa: Elena no ve dónde empieza un campo (`f-crear-errors.png`, `f-contact-errors.png`), no distingue un interruptor apagado del fondo y no sabe qué duración está elegida (`f-meeting-slot.png`, «30 min»).
- Propuesta:
  1. Token nuevo `--color-field-border: #8f8473`, que da ≥3:1 sobre `card` y `paper`. Usarlo en un `INPUT_CLASSES` único (ver COH-07).
  2. Interruptor apagado: `bg-muted`. Apagado con borde de 2 px `border-muted` y fondo transparente, y encendido con `bg-ink`.
  3. Opción elegida de `Segmented` y pestañas: `bg-ink text-paper`, como el día elegido del calendario (`slot-picker.tsx:72`), o borde de 2 px `border-ink`.
- Criterio: todo borde que identifique un control o un estado tiene ≥3:1 frente a los colores vecinos, medido con `contrast.mjs`.

**A11Y-05 · Indicador de foco débil en los campos**: MEDIA
- Dónde: los mismos `INPUT` (`outline-none` + `focus:shadow-[0_0_0_4px_rgb(20_20_20/0.06)]`).
- Qué pasa: el anillo global naranja (`globals.css:131`) se anula en los campos. Solo queda el cambio de borde a `ink` (1 px) y una sombra al 6 %, invisible con baja visión.
- Propuesta: `focus-visible:outline-2 focus-visible:outline-signal focus-visible:outline-offset-2` en el `INPUT` común, o un `ring-2 ring-ink` de 2 px.
- Criterio: el campo enfocado cambia ≥2 px de perímetro con ≥3:1 respecto al estado sin foco (WCAG 2.4.13 como referencia).

**A11Y-06 · Al aumentar el texto se rompen la tarjeta, el login y el editor**: ALTA
- Dónde:
  - `profile-card.tsx:31-36` (`text-[2.7rem]` + `break-words`) y avatar fijo de 88 px.
  - Botones `whitespace-nowrap` en `button.tsx:24`.
  - 22 usos de `text-[10px]`, 13 de `text-[11px]` y 6 de `text-[12px]` en px, que no escalan con la preferencia de tamaño de letra de Android.
- Qué pasa: con la fuente raíz al 200 %, la tarjeta desborda a 554 px y el nombre se parte a mitad de palabra (`f-t200-card.png`). «Crea la tuya gratis» se corta. Desbordan también el login (485 px), `/crear?de` (569 px), la 404 de tarjeta (448 px) y el editor (792 px; `f-dash-t200.png`). Las etiquetas mono de 10 px no crecen nada.
- Propuesta:
  1. Tamaños de texto en `rem` (sustituir los `text-[10px]`/`[11px]` por la clase `.eyebrow`, que ya está en rem, o por un token `--text-mark: 0.72rem`).
  2. Nombre: `overflow-wrap: anywhere` solo a partir de un mínimo (`hyphens: auto` con `lang="es"`) y `clamp()` para el tamaño.
  3. Botones: permitir dos líneas (`whitespace-normal text-balance` con `min-h` en vez de `h`).
- Criterio: con `html{font-size:200%}` a 390 px, ninguna ruta tiene scroll horizontal y ningún nombre de 1–2 palabras se parte dentro de una palabra.

**A11Y-07 · El editor no tiene región principal y los encabezados van desordenados**: MEDIA
- Dónde:
  - `/dashboard`: `dashboard/page.tsx:96-111` y `:134-149`, sin `<main>`.
  - Bienvenida: H2 `welcome-panel.tsx:109` antes del H1 `card-editor.tsx:160`.
  - Formulario de reunión: H3 `meeting-request.tsx:127` y `:202`, con el H2 de la página después.
- Qué pasa: con el rotor de VoiceOver («Regiones» o «Encabezados»), Elena no puede saltar al contenido, y la jerarquía dice que la bienvenida está fuera de la página.
- Propuesta:
  1. Envolver `CardEditor` en `<main id="contenido">`.
  2. Bienvenida: convertir su título en el H1 cuando `?nueva=1` (y el del editor en H2), o meterla dentro de `main` después del H1 como `<section>` con H2.
  3. Formulario de reunión: el `<form>` como `<section aria-labelledby>` con «Agendar reunión» como H2 visible (hoy es una `p.eyebrow`, `meeting-request.tsx:331`) y los títulos de paso en H3.
- Criterio: axe sin `landmark-one-main`, `region` ni `heading-order` en `/dashboard?nueva=1` ni en el formulario de reunión abierto.

**A11Y-08 · Grupos de opciones con `role="radio"` sin flechas: 10–15 paradas de tabulación**: MEDIA
- Dónde:
  - Colores: `quick-card-form.tsx:175-197` y `design-field.tsx:139`.
  - Motivos y letras: `design-field.tsx:191`, `:307`.
  - `Segmented`: `form-bits.tsx:65-86`.
  - Pestañas: `preview-panel.tsx:23-41`.
- Qué pasa: las flechas no hacen nada (ArrowRight en «Naranja» deja el foco y la selección igual; `flows.log`). Llegar a «Crear mi tarjeta» cuesta 19 tabulaciones, y el editor tiene más de 60 paradas antes de «Guardar».
- Propuesta: patrón ARIA de grupo de radio y de pestañas: `tabIndex` móvil (solo la opción elegida con `tabIndex=0`) y flechas para moverse y seleccionar. Alternativa más simple y robusta: `<input type="radio" class="sr-only">` dentro de `<label>`, como ya hace `meeting-response.tsx:251`, que trae las flechas gratis.
- Criterio: en `/crear` hay ≤11 tabulaciones hasta «Crear mi tarjeta», y ArrowRight cambia de color.

**A11Y-09 · Botones que despliegan contenido sin estado y sin forma de cerrar**: MEDIA
- Dónde: `contact-form.tsx:104-116` («Déjale tu contacto a …») y `meeting-request.tsx:94-108` («Agendar reunión con …»).
- Qué pasa: no tienen `aria-expanded` ni `aria-controls`, y una vez abiertos no hay «Cancelar», así que el formulario se queda abierto y ocupando la pantalla. Además, el nombre accesible incluye el subtítulo («… Propón día y hora. Alex confirma con un toque.»), y VoiceOver lee una frase de 15 palabras por botón.
- Propuesta:
  1. `aria-expanded` y que el subtítulo vaya en `aria-describedby`.
  2. Al abrir, añadir arriba a la derecha un botón de texto «Cancelar» (44 px) que pliega y devuelve el foco al disparador.
- Criterio: VoiceOver anuncia «Agendar reunión con Alex, botón, contraído». El formulario se puede cerrar y el foco vuelve.

**A11Y-10 · El texto visible del interruptor no coincide con su nombre accesible (WCAG 2.5.3)**: MEDIA
- Dónde: `card-editor.tsx:279-303`.
- Qué pasa: el texto visible es «Deja que te propongan reuniones» y el `aria-label`, «Agendar reunión en tu página». Igual con «Deja que te dejen su contacto» frente a «Formulario de contacto en tu página». Si Elena dicta «Activar Deja que te propongan reuniones» con Control por voz, no funciona. El interruptor de «Publicación» solo tiene el `aria-label` «Tarjeta publicada».
- Propuesta: quitar el `aria-label` y usar `aria-labelledby` apuntando al `<p>` visible (con `id`), más `aria-describedby` a la descripción. Envolver fila e interruptor en un `<label>` para que toda la fila sea pulsable (hoy el objetivo es de 44×24).
- Criterio: el nombre accesible empieza por el texto visible y toda la fila conmuta el interruptor.

**A11Y-11 · Objetivos táctiles pequeños y pegados, junto a una acción destructiva sin deshacer**: ALTA
- Dónde:
  - `links-editor.tsx` (IconButton de 32×32 con 2 px entre sí): «Ocultar», «Subir», «Bajar», «Eliminar enlace».
  - Contactos recibidos (36×36 con 4 px).
  - «Cerrar la bienvenida» (36×36, `welcome-panel.tsx:86`).
  - Botón «Compartir enlace» y pestañas de la vista previa (32 px).
  - Interruptores (24 px).
  - «Cambiar» email (24 px, `email-code-auth.tsx:243-249`) y «Reenviar código» (20 px).
  - «Eliminar mi cuenta y mi tarjeta» (20 px, `account-panel.tsx:44-47`).
  - Enlaces del pie (20 px, separados 8 px) y el email/teléfono de `/reunion` (20 px separados 4 px, `meeting-response.tsx:121-133`).
  - La casilla de consentimiento (16 px, compensada porque la etiqueta es pulsable).
- Qué pasa: cumplen el mínimo AA de 24 px (2.5.8), pero no los 44 pt de la HIG. «Bajar» y «Eliminar enlace» están a 2 px: un fallo de puntería borra un contacto sin aviso ni deshacer (A11Y-01).
- Propuesta:
  1. IconButton a 44×44 (`size-11`). En móvil, mover «Subir/Bajar» a un único botón «Reordenar» o a un menú «⋯» con «Subir · Bajar · Ocultar · Quitar».
  2. Tras «Quitar», un aviso «Contacto quitado · Deshacer» durante 6 s (en `role=status`).
  3. Enlaces de texto con `min-h-11 inline-flex items-center`.
- Criterio: con `boundingBox` en el iPhone 15, todos los controles miden ≥44×44, salvo los enlaces dentro de párrafos. Quitar un enlace se puede deshacer.

**A11Y-12 · Avisos que no se anuncian o se anuncian de más**: MEDIA
- Dónde:
  - `card-editor.tsx:392-393`: la región `role=status aria-live` envuelve el texto, «⌘S» y el botón «Guardar».
  - Copiar o compartir: `profile-actions.tsx:93` (solo cambia `aria-label`), `welcome-panel.tsx:158-159` y `wallet-panel.tsx:148` («Copiado» sin región viva).
  - `slug-field.tsx:94` (bien).
- Qué pasa: al editar, VoiceOver lee «Cambios sin guardar, Guardar». En escritorio lee además «comando S». Al copiar el enlace, el cambio de etiqueta no se anuncia y Elena no sabe si ha funcionado.
- Propuesta:
  1. Poner `role=status` solo en el `<p>` del mensaje de la barra y sacar `⌘S` con `aria-hidden`.
  2. Una región viva única y global (`<p role="status" class="sr-only">` en el layout) a la que escriben «Enlace copiado» y los demás avisos breves, con el mismo texto que el visible.
- Criterio: al copiar desde cualquier pantalla, VoiceOver dice «Enlace copiado» una vez.

**A11Y-13 · Los ejemplos en gris parecen datos ya escritos**: MEDIA
- Dónde: `quick-card-form.tsx:26-35` («Alex Rivera», «Product Designer», «Estudio Norte», «+34 600 000 000») y en el editor `card-editor.tsx:205-219`.
- Qué pasa: en gris de 2,56:1 y con ampliación, Elena cree que el formulario viene relleno con los datos de otra persona (`f-crear-errors.png`). El patrón del sistema de Apple es campo vacío y etiqueta clara.
- Propuesta: quitar los ejemplos de nombre, cargo y empresa. Si hace falta una pista, ponerla en el texto de ayuda bajo el campo («Por ejemplo, Product Designer»). Mantener solo los ejemplos de formato (`tu@email.com`, `linkedin.com/in/tu-perfil`).
- Criterio: ningún campo de nombre, cargo o empresa muestra un nombre propio como ejemplo.

**A11Y-14 · Mensajes de error genéricos o que dependen del color**: MEDIA
- Dónde: «Revisa los campos marcados.» en `/u/*` (acciones de contacto y reunión) y «Revisa los campos marcados en rojo.» en la barra de guardado.
- Qué pasa: no dicen cuántos ni cuáles, y «en rojo» depende del color (1.4.1 y 1.3.3).
- Propuesta: texto «Faltan 2 datos: Nombre y Email.» (generado a partir de los errores), con cada nombre como enlace que enfoca el campo, y foco al primero (A11Y-01).
- Criterio: el resumen enumera los campos y no menciona colores.

**A11Y-15 · Textos de dos líneas cortados en la barra de guardado**: MEDIA
- Dónde: `card-editor.tsx:399` (`truncate`).
- Qué pasa: «Guardado, salvo algunas opciones nuevas: falta actualizar la base de datos.» y los errores largos se cortan con «…» a 320 px o con zoom (`f-dash-320-savebar.png`).
- Propuesta: `line-clamp-2` y `rounded-3xl` cuando el texto ocupa dos líneas, o abreviar el texto («Guardado (falta actualizar la base de datos)»).
- Criterio: a 320 px se lee el mensaje entero.

**A11Y-16 · Enlaces con nombre poco claro o con símbolos**: BAJA
- Dónde:
  - `dashboard/page.tsx:32-38`: el enlace se llama «/u/demo ↗» y VoiceOver lee «barra u barra demo flecha».
  - «Personalizar: foto, colores y más ↓» (`welcome-panel.tsx:174`).
  - «Cambiar» (dos usos: email y paso de la reunión).
  - «Ver mi tarjeta» y los enlaces http de la tarjeta abren otra pestaña sin avisar.
- Propuesta:
  1. Enlace de la cabecera: texto visible «Ver mi tarjeta» y el slug como detalle con `aria-hidden`.
  2. Las flechas, con `aria-hidden`.
  3. «Cambiar email» y «Cambiar horas» con su objeto en el texto.
  4. Añadir «(se abre en otra pestaña)» en `sr-only` a los `target=_blank`.
- Criterio: ningún nombre accesible contiene «↗», «↓» ni un «Cambiar» suelto.

**A11Y-17 · El botón de enviar el código se activa con 6 de 8 cifras**: BAJA
- Dónde: `email-code-auth.tsx:290` (`code.length < 6`).
- Propuesta: `code.length < LOGIN_CODE_LENGTH`.
- Criterio: con 7 cifras, el botón sigue desactivado.

**A11Y-18 · Respuesta en texto plano al exportar contactos sin sesión**: BAJA
- Dónde: `/dashboard/contactos` (`route.ts:17`).
- Qué pasa: devuelve el texto «Inicia sesión», sin `<title>` ni `lang` (las únicas violaciones de axe del sitio).
- Propuesta: redirigir a `/login?next=/dashboard` si la petición acepta `text/html`.
- Criterio: axe sin `document-title` ni `html-has-lang`.

**A11Y-19 · La 404 genérica usa el título de la portada**: BAJA
- Dónde: `src/app/not-found.tsx`.
- Propuesta: `metadata.title = "Página no encontrada"`.
- Criterio: `document.title` empieza por «Página no encontrada».

**A11Y-20 · Detalles con el movimiento reducido**: BAJA
- Dónde: `create-flow.tsx:145`, `window.scrollTo({ behavior: "smooth" })`.
- Qué pasa: el desplazamiento es suave aunque Elena tenga activado reducir movimiento. El resto se respeta muy bien.
- Propuesta: usar `behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth"`.
- Criterio: con movimiento reducido no hay desplazamiento animado.

### Coherencia del sistema

**COH-01 · Una misma palabra, «contactos», para tres cosas distintas, y «enlace» para dos**: ALTA
- Dónde:
  - «Tus contactos» es la sección 02 con tus propios datos (`card-editor.tsx:225`).
  - «Contactos recibidos» son los datos que te dejan otros (`:335`).
  - «Guardar a Lucía en tus contactos» y «Todos a Contactos (.vcf)» se refieren a la agenda del móvil (`contacts-panel.tsx:64`).
  - «Enlace» es a la vez la URL de tu tarjeta («Copiar enlace», «Compartir enlace») y cada dato del editor («Eliminar enlace», «Tipo de enlace», y el tipo «Enlace»).
- Qué pasa: en `/crear` la misma sección se llama «Cómo contactarte». Elena no sabe si «Eliminar enlace» rompe el enlace de su tarjeta.
- Propuesta (ver el glosario del Anexo D):
  1. La sección 02 pasa a llamarse **«Cómo contactarte»**, igual que en `/crear`.
  2. Cada fila es un **«dato de contacto»**: «Quitar» en vez de «Eliminar enlace» y «Tipo» en vez de «Tipo de enlace».
  3. El tipo «Enlace» pasa a ser «Otra web».
  4. «Enlace» se reserva para la URL de la tarjeta.
- Criterio: en la interfaz, «enlace» solo se refiere a la URL `/u/<slug>`, y «contactos» solo a «Contactos recibidos» y a la app Contactos.

**COH-02 · Seis textos distintos para la misma acción de crear la tarjeta**: MEDIA
- Dónde:
  - «Crea la tuya gratis» (`create-yours.tsx:28`).
  - «Crear mi tarjeta» (`create-yours.tsx:56`, `quick-card-form.tsx`, portada).
  - «Crear mi tarjeta gratis» (portada).
  - «Crear mi propia tarjeta» (`u/[slug]/not-found.tsx`).
  - «Créala en un minuto» (`login/page.tsx:63`).
  - «Crear la mía con estos datos» (este está justificado).
- Propuesta: un único **«Crear mi tarjeta»** en todos los botones. «Gratis» va en el texto de apoyo, no en el botón. La barra superior de la tarjeta, si se queda, dice «Crear la mía» (corto, por espacio). En el login: «¿Aún no tienes tarjeta? Crear mi tarjeta».
- Criterio: la búsqueda en `src` del texto de los CTA de crear solo devuelve «Crear mi tarjeta», «Crear la mía» y «Crear la mía con estos datos».

**COH-03 · El «Te dejo mi contacto» del visitante lleva cuatro nombres**: MEDIA
- Dónde:
  - Botón: «Déjale tu contacto a Alex» (`contact-form.tsx:113`).
  - Etiqueta superior: «Te dejo mi contacto» (`:127`).
  - Envío: «Enviar mi contacto» (`:238`).
  - Editor: «Deja que te dejen su contacto» y su `aria-label` «Formulario de contacto en tu página» (`card-editor.tsx:293, 302`).
- Propuesta:
  1. Para el visitante, **«Déjale tu contacto»** en el botón, la etiqueta y el envío («Dejarle mi contacto»).
  2. Para el dueño, el interruptor se llama **«Recibir contactos»**, con descripción «Quien vea tu tarjeta podrá dejarte su nombre, email o teléfono», y la sección «Contactos recibidos».
- Criterio: cada concepto tiene un único nombre en cada lado.

**COH-04 · Las reuniones mezclan «Agendar reunión», «Reservar cita», «propuesta» y «Retirar»**: MEDIA
- Dónde:
  - Visitante: «Agendar reunión con Alex» (`meeting-request.tsx:103`).
  - Tipo de dato «Reservar cita» (el enlace tipo Calendly, en `links-editor`).
  - Interruptor: «Deja que te propongan reuniones» y su `aria-label` «Agendar reunión en tu página».
  - Invitado: «Retirar propuesta»; confirmada: «Cancelar reunión».
  - Envío: «Enviar propuesta»; contrapropuesta: «Enviar hora» o «Enviar 2 horas».
- Qué pasa: «Agendar» y «Reservar cita» suenan a lo mismo y, si ambos aparecen en una tarjeta, Elena no sabe cuál usar.
- Propuesta:
  1. Visitante: **«Proponer una reunión»**, que es lo que realmente hace. Si Diego prefiere «Agendar reunión», que sea el único verbo.
  2. Tipo Calendly: **«Enlace de reservas»**, y en la tarjeta se muestra el título que ponga el dueño.
  3. Interruptor: «Recibir propuestas de reunión».
  4. «Retirar propuesta» → «Cancelar propuesta» (el verbo de la confirmada es «Cancelar»).
- Criterio: «cita» no aparece junto a «reunión», y cada estado usa «Cancelar».

**COH-05 · Cuatro patrones distintos para borrar**: ALTA
- Dónde:
  - `window.confirm()` nativo: `contacts-panel.tsx:114` y `meetings-panel.tsx:124`.
  - Escribir «BORRAR»: `account-panel.tsx:73`.
  - Confirmación en línea «Sí, cancelar / No, mantener»: `meeting-response.tsx:380-404`.
  - Sin confirmación ni deshacer: `links-editor.tsx:142`.
  - Los verbos también varían: «Borrar», «Eliminar», «Quitar», «Retirar», «Cancelar».
- Propuesta:
  1. **Datos ajenos o permanentes** (contacto recibido, cuenta): confirmación en línea con dos botones, «Borrar» (variante `danger`) y «No borrar». Escribir «BORRAR» solo para la cuenta.
  2. **Cosas propias recuperables** (dato de contacto, reunión de la lista, hora propuesta): sin confirmar y con «Deshacer» durante 6 s.
  3. Verbos: «Borrar» para lo permanente y «Quitar» para lo reversible.
  4. Eliminar `window.confirm`: en iOS rompe la estética y VoiceOver lo lee mal en contexto.
- Criterio: no queda ningún `window.confirm`, y cada acción destructiva sigue uno de los dos patrones.

**COH-06 · No hay regla para el botón principal: el mismo tipo de acción cambia de color**: MEDIA
- Dónde:
  - Envíos finales: «Crear mi tarjeta» (`signal`), «Enviar propuesta» (`signal`), «Confirmar» (`signal`), «Enviarme un código» y «Entrar» (`ink`), «Enviar mi contacto» (`ink`), «Enviar respuesta» (`ink`), «Continuar» (`ink`).
  - Portada: la llamada principal del inicio es `signal` y la del final, `ink`.
  - Tarjeta pública: compiten tres acciones fuertes («Crea la tuya gratis», `ink sm`; «Guardar contacto», `ink lg`; «Crear mi tarjeta», `signal lg`), más dos tarjetas desplegables con estilos distintos (borde sólido frente a discontinuo, `meeting-request.tsx:97` y `contact-form.tsx:107`).
- Propuesta: regla única documentada en `docs/BRAND.md`.
  - `signal` = **la** acción que completa la tarea de esa pantalla. Solo una por pantalla visible.
  - `ink` = acción importante secundaria.
  - `outline` = alternativa.
  - `ghost` o texto = terciaria.
  - `danger` = solo para confirmar algo destructivo.
- Aplicación:
  - En la tarjeta pública, «Guardar contacto» pasa a `signal`, porque es lo que vino a hacer quien escanea. «Crear mi tarjeta» del bloque inferior pasa a `paper` sobre el fondo oscuro, y la barra superior a `outline sm`.
  - Login, contacto y continuar pasan a `signal`.
  - Las dos tarjetas desplegables comparten estilo (borde sólido y mismo icono circular).
- Criterio: en cada captura `m-*.png` se ve como mucho un botón `signal`.

**COH-07 · Cinco estilos de campo y tres tamaños de error**: MEDIA
- Dónde:
  - `INPUT_CLASSES` (h-11, 0.95rem, `bg-card`): `fields.tsx:7`.
  - `INPUT` (h-12, text-base): `quick-card-form.tsx:12`.
  - `INPUT` (h-13, `rounded-2xl`, placeholder al 70 %): `email-code-auth.tsx:15`.
  - `INPUT` (`bg-paper/60`, 0.95rem): `contact-form.tsx:15`.
  - `MEETING_INPUT` (`bg-paper/60`, text-base): `form-bits.tsx:8`.
  - Errores de campo en `text-sm` (`/crear`, editor) frente a `text-xs` (contacto, reunión, `links-editor`).
  - Etiquetas: «Tu email» en `.eyebrow` mono en mayúsculas en el login (`email-code-auth.tsx:119`) frente a etiquetas normales en el resto.
  - Obligatorio: «*» en `/crear` y editor; nada en contacto y reunión, donde solo se marca lo «Opcional».
- Propuesta: un único `components/ui/field.tsx` que exporte `Field` (etiqueta, «Opcional», pista y error) e `inputClasses({ size })`, con h-12, text-base (evita el zoom de iOS), borde con el token de A11Y-04, error en `text-sm` con icono, y la etiqueta siempre en sentence case. Convención: marcar solo «Opcional» (lo que propone la HIG) y quitar los «*».
- Criterio: la búsqueda `border-line bg-` en `src/components` devuelve una sola definición de campo.

**COH-08 · Mensajes de éxito, error y carga sin un patrón común**: MEDIA
- Dónde: inventario en el Anexo B.
  - Éxito: caja verde con icono (código enviado), tarjeta con check y titular en serif (contacto o propuesta enviada), franja verde enfocada (`/reunion`), texto en la barra (guardado) o el texto del botón que cambia 1,8 s («Copiado» / «Enlace copiado»).
  - Error: caja `danger-wash` (`/crear`, `/reunion`), texto rojo suelto (contacto, reunión, email) o error en `text-glow` naranja sobre café (`welcome-panel.tsx:151`).
  - Carga: «Enviando…», «Enviando el código…», «Comprobando…», «Confirmando…», «Guardando…», «Borrando…» y «Enviando otro…». En cambio, «Enviar mi contacto», «Sí, cancelar» y «Continuar con Google» solo muestran un círculo de carga, sin texto.
- Propuesta: tres componentes.
  1. `<Notice tone="ok|error|info">`: caja con icono y texto «qué ha pasado + qué hacer», con `role` según el tono.
  2. `<InlineError>` para los campos.
  3. Un `SubmitButton` único que siempre pone «<verbo>ndo…» (Enviando, Guardando, Confirmando…).
  - Los errores sobre fondo oscuro usan `text-paper` y un icono, no `glow`.
- Criterio: los 23 mensajes del Anexo B usan uno de esos tres componentes.

**COH-09 · Dos versiones del botón «Añadir a Apple/Google Wallet»**: BAJA
- Dónde: `welcome-panel.tsx:27-28` (`WALLET_LINK`, h-13 `rounded-2xl`) frente a `wallet-panel.tsx:87-88` (`walletButton`) y `/wallet` (`buttonClasses ink/outline lg rounded-full`).
- Propuesta: un único `<AddToWalletButton platform>` que siga las guías de las marcas: Apple pide su insignia oficial «Añadir a Apple Wallet», en negro.
- Criterio: un solo componente para los tres sitios.

**COH-10 · Dos botones para la misma acción de cerrar la bienvenida**: BAJA
- Dónde: X (`welcome-panel.tsx:83-90`) y «Personalizar: foto, colores y más ↓» (`:169-175`), que hacen lo mismo.
- Propuesta: dejar solo el texto, renombrado a «Personalizar mi tarjeta». La X sobra (una sola salida, como en la HIG).
- Criterio: la bienvenida tiene una sola acción para cerrarse.

**COH-11 · «Compartir» y «Copiar» se cruzan**: BAJA
- Dónde: «Compartir enlace» (`welcome-panel.tsx:159`) copia al portapapeles cuando no hay `navigator.share` (escritorio); «Copiar enlace» está en `wallet-panel.tsx:148`; «Compartir tarjeta» es el `aria-label` del icono de la tarjeta.
- Propuesta: el texto del botón dice lo que va a pasar. Con `navigator.share`, «Compartir»; sin él, «Copiar enlace». La confirmación siempre es «Enlace copiado».
- Criterio: en Chromium de escritorio, el botón dice «Copiar enlace».

**COH-12 · Escala visual con muchos valores sueltos**: MEDIA
- Dónde:
  - Tipografía: 21 tamaños arbitrarios (`text-[10px]` ×22, `[11px]` ×13, `[0.95rem]` ×10, `[12px]` ×6, `[13px]` ×2, `[9px]`, `[15px]`, `[14px]`, `[0.9rem]`, `[0.98rem]`, más 10 tamaños de titular entre `[1.6rem]` y `[5.5rem]`).
  - La clase `.eyebrow` existe, pero hay 24 copias a mano (`font-mono text-[10/11px] … uppercase`) con 7 espaciados distintos (`tracking-[0.08em]` a `[0.18em]`).
  - Radios: `rounded-full`, `2xl` y `xl`, más 9 valores arbitrarios (`[16]`, `[22]`, `[24]`×8, `[26]`, `[28]`×5, `[30]`, `[36]`, `[42]`, `[52]px`); el token `--radius-pass` casi no se usa.
  - Sombras: 2 tokens (`soft` y `object`), más 15 sombras arbitrarias.
  - Anchos de contenedor: 440, 480, 640, 1120, 1240 px y `max-w-sm`.
- Propuesta (Anexo C):
  - Tokens `--text-mark` (0.72rem, mono en mayúsculas), `--text-small` (0.875rem), `--text-body` (1rem) y `--text-lead` (1.125rem).
  - Radios `--radius-control` (12px), `--radius-panel` (24px) y `--radius-object` (28px).
  - Sombras `--shadow-press-ink`, `--shadow-press-signal` y `--shadow-ring-focus`.
  - Sustituir todas las copias de `.eyebrow` por la clase.
- Criterio: `rg "text-\[\d+px\]" src` devuelve 0, y `rg "rounded-\[" src` ≤3 (solo el arte del pase).

**COH-13 · Tuteo y tono coherentes, con pocas excepciones**: BAJA
- Qué pasa: el tuteo es coherente en todo el producto, y está bien. Hay excepciones:
  - «Inicia sesión» (`route.ts`) frente a «Entrar».
  - «Acceso» (etiqueta del login) frente a «Entrar».
  - En modo demo se enseña `docs/SETUP.md` a cualquier visitante (`card-editor.tsx:179-180`).
  - «Sin configurar» en los botones de cartera.
  - «Excel (CSV)».
  - Mezcla de mayúsculas tipo título en etiquetas de botón («Apple / Outlook») frente a sentence case.
- Propuesta:
  - «Entrar» en todo.
  - En el aviso demo, «Modo demo: los cambios no se guardan.» sin referencia al repositorio.
  - «Sin configurar» → «No disponible todavía».
  - «Excel (CSV)» → «Descargar en Excel».
- Criterio: no hay jerga técnica (`SETUP.md`, CSV, `.vcf`) en textos para el usuario.

**COH-14 · Iconografía casi coherente**: BAJA
- Qué pasa: todo es lucide de 1,5–2 px, salvo los glifos de las carteras y el logo de Google, que es correcto. Hay dos inconsistencias:
  1. Enlaces externos: `ArrowUpRight` en la tarjeta, `ExternalLink` en la bienvenida y «↗» como texto en la cabecera del editor.
  2. Alertas: «Eliminar mi cuenta» usa `TriangleAlert`, que también se usa para avisos (modo demo).
- Propuesta: un solo icono para lo externo (`ArrowUpRight`) y `Trash2` para borrar. `TriangleAlert` queda solo para avisos.
- Criterio: `rg "ExternalLink|↗" src` = 0.

## 4. Cosas que están bien (no romperlas)

- axe está limpio en 33 estados (21 rutas y 12 estados intermedios), y ya hay una prueba `e2e/a11y.spec.ts` que conviene ampliar a los estados de error y a `moderate`.
- El texto cumple AA en todas partes: muted 5,41:1, signal-deep 5,26:1, blanco sobre signal-strong 4,77:1, y `readableOn()` garantiza ≥4,5:1 en el nombre y en las etiquetas de cualquier color de tarjeta (`colors.ts`).
- `prefers-reduced-motion` está bien resuelto en `globals.css:137-145`.
- La gestión del foco es ejemplar en `/crear`: primer error, H1 del paso del email, código (incluido un código erróneo), confirmaciones de contacto y propuesta, y la franja de estado de `/reunion` tras confirmar.
- El código de 8 cifras es un único input real con `autocomplete="one-time-code"` y `aria-label`; acepta pegar «1234 5678».
- Enlaces de la tarjeta con nombre completo («Email alex@example.com»), H1 = nombre y `lang="es"`.
- Horas en `/reunion` como radios nativos dentro de etiquetas de 64 px y botón «Confirmar 12:30», que dice exactamente lo que pasa.
- Las horas del selector se anuncian con el día («18:30, lunes, 5 de octubre») y el límite de 3 se explica en una región viva.
- No hay scroll horizontal a 320 px en ninguna página excepto el editor, y el espaciado de texto WCAG 1.4.12 no rompe nada salvo el editor.

## 5. «Ya lo había pensado» (lo que un usuario avanzado esperaría)

- **Modo oscuro** («Café de noche»): fondo `ink` y texto `paper` (14,8:1), siguiendo `prefers-color-scheme`. Ayuda a la baja visión con fotofobia, y una tarjeta escaneada de noche en un evento no deslumbra. Dónde: tokens en `globals.css` bajo `@media (prefers-color-scheme: dark)`, sin interruptor visible (automático, como en iOS).
- **Contraste aumentado** (`prefers-contrast: more`): bordes `ink` y quitar la textura de papel. Dónde: el mismo archivo, sin interfaz.
- **Modo de alto contraste de Windows y Android** (`forced-colors`): comprobar que interruptores, colores y horas elegidas usan `border` o `outline` y no solo el fondo.
- **Saltar al contenido**: enlace «Saltar al editor» visible al enfocarlo, solo en `/dashboard`, que es largo.
- **Índice del editor**: en móvil, un selector fijo «01 Quién eres ▾» para saltar entre las 9 secciones sin desplazarse por 60 controles. Dónde: la cabecera del editor.
- **Atajos documentados**: «⌘S» ya existe. Un «?» en la cabecera del editor podría listar los atajos.
- **Tamaño de la tarjeta pública**: respetar la letra del sistema (`font: -apple-system-body` como base en iOS), para que el texto grande de Ajustes funcione sin tocar el zoom.
- **Audio del QR**: en la bienvenida, el `aria-label` del QR podría incluir la URL («QR que abre getpassme.com/u/alex»), para que quien usa lector de pantalla pueda dictarla.

---

## Anexo A: Inventario de botones y enlaces de acción

Variantes: S = `signal`, I = `ink`, O = `outline`, G = `ghost`, P = `paper`, D = `danger`, T = texto o enlace, Ic = solo icono.

| Pantalla | Texto literal | Variante · tamaño | Nota |
|---|---|---|---|
| Portada `/` | Crear mi tarjeta (cabecera) | I · sm (36 px) | |
| | Crear mi tarjeta gratis (inicio) | S · lg | Duplica el anterior |
| | Ver un ejemplo | G · lg | |
| | Crear mi tarjeta (final) | I · lg | Mismo texto, otra variante |
| | Ejemplo / Entrar / Privacidad / Términos / Aviso legal | T (20 px) | Separados 8–24 px |
| Tarjeta `/u/[slug]` | Crea la tuya gratis | I · sm (36 px) | Competencia de llamadas principales |
| | Guardar contacto | I · lg | Tarea principal del visitante |
| | (Compartir tarjeta) | Ic · O · lg 56 px | Solo icono, nombre por `aria-label` |
| | Email / LinkedIn / Portfolio / Instagram… | Fila de enlace de 68 px | OK |
| | Agendar reunión con Alex · subtítulo | Tarjeta con borde sólido | Sin `aria-expanded` |
| | Déjale tu contacto a Alex · subtítulo | Tarjeta con borde discontinuo | Otro estilo para lo mismo |
| | Crear mi tarjeta → | S · lg | |
| | Hecho con PassMe | T (36 px) | |
| Formulario de reunión | Días (14) / horas (19) | Pulsadores de 56×72 y 44 px | 31 tabulaciones |
| | Elegir otra fecha | input date (36 px) | |
| | Duración: 15 min / 30 min / 45 min / 1 h | Segmented (44) | Estado elegido poco visible |
| | Cómo: En persona / Videollamada / Teléfono | Segmented (56) | |
| | Continuar → | I · lg | |
| | ← Cambiar | T (36) | Sin objeto |
| | Enviar propuesta | S · lg | |
| | Crear la mía con estos datos → | S · md | |
| Formulario de contacto | Enviar mi contacto | I · lg | Sin texto de carga |
| | Más info | T, en línea | |
| `/crear` | Entrar | T, en línea (18 px) | |
| | 10 colores | Radio de 40×40 | Sin flechas |
| | Crear mi tarjeta | S · lg | |
| | ← Editar mis datos | T (~28 px) | |
| | Enviarme un código | I · lg | En `/crear` debería ser S |
| | Continuar con Google | O · lg | Solo con Supabase |
| | ✎ Cambiar | T (24 px) | → «Cambiar email» |
| | ¿No te llega? Reenviar código / Reenviar en 0:57 | T (20 px) | |
| | Abrir Gmail ↗ | T | |
| | Crear mi tarjeta (paso del código) | I · lg | |
| `/login` | Enviarme un código / Entrar | I · lg | |
| | Créala en un minuto | T | → «Crear mi tarjeta» |
| Bienvenida | (Cerrar la bienvenida) | Ic, 36 px | Duplicado |
| | Añadir a Apple Wallet / Añadir a Google Wallet | P o borde · h-13 | Tercer estilo de botón de cartera |
| | ¿Estás en el ordenador? Añádela desde tu móvil | T | |
| | Compartir enlace / Enlace copiado | P · sm | Copia en escritorio |
| | Ver mi tarjeta | T con forma de botón (36) | |
| | Personalizar: foto, colores y más ↓ | T con forma de botón (36) | Duplica la X |
| Editor: cabecera | /u/demo ↗ | T (30) | |
| Editor: barra fija | Guardar | S (con cambios) o I · sm (36) | Desactivado casi siempre |
| Editor 01 | Subir foto / Cambiar foto | O (36) | |
| Editor 02 | Tipo de enlace (select) | 40×40 | |
| | Ocultar de la tarjeta / Mostrar en la tarjeta / Subir / Bajar / Eliminar enlace | Ic, 32×32, separados 2 px | Destructivo sin deshacer |
| | Email · Teléfono · WhatsApp · LinkedIn · Web · Instagram · X · GitHub · TikTok · YouTube · Telegram · Reservar cita · Enlace | Pastillas + (36) | «Reservar cita» y «Enlace» confunden |
| Editor 03 | 10 temas, 8 motivos y 4 letras | Radio | |
| | Volver a la variación anterior (Ic) / Otra variación | O (40) | |
| | Color de fondo / Color de detalle | input color 50×27 | |
| | Auto | T (32) | |
| Editor 04 | (Tarjeta publicada) / (Agendar reunión en tu página) / (Formulario de contacto en tu página) | Switch 44×24 | El nombre no coincide con el texto visible |
| | Usar «…» (sugerencia de slug) | T | |
| Editor 05 | Añadir a Apple Wallet / Añadir a Google Wallet | `walletButton` | |
| | Ver mi tarjeta / Copiar enlace / QR para imprimir | O · sm (36) | |
| Editor 06 | Responder / Ver (reunión) | S u O · sm | |
| | (Quitar la reunión con …) | Ic, 36 | `window.confirm` |
| | Ver anteriores (n) / Ocultar anteriores | T | |
| Editor 07 | (Guardar a … en tus contactos) / (Borrar el contacto de …) | Ic, 36, separados 4 px | `window.confirm` |
| | Excel (CSV) / Todos a Contactos (.vcf) | O · sm | Jerga |
| | Ver los n / Ver menos | T | |
| Editor 09 | Cerrar sesión | O · sm | |
| | Eliminar mi cuenta y mi tarjeta | T, D (20 px) | |
| | Eliminar definitivamente / Cancelar | D / G · sm | Escribir «BORRAR» |
| `/reunion` (anfitrión) | lucia@example.com / +34 600… | T (20 px, separados 4 px) | |
| | Confirmar 12:30 | S · lg | |
| | Otra hora | O · md | Pierde el foco |
| | No puedo | G · md | Pierde el foco |
| | Enviar hora / Enviar n horas | S · lg | |
| | Enviar respuesta | I · lg | |
| | ← Volver | T (40) | Pierde el foco |
| | Google Calendar / Apple / Outlook | I / O · md | |
| | Cancelar reunión → Sí, cancelar reunión / No, mantener | T, D → D / G | |
| `/reunion` (invitado) | Retirar propuesta | T, D (40) | Verbo distinto |
| 404 de tarjeta | Crear mi propia tarjeta | I · md | Texto distinto |
| 404 genérica | Volver al inicio | I · md | |
| `/wallet` | Añadir a Apple Wallet / Google Wallet | I / O · lg | |

## Anexo B: Inventario de mensajes

| Tipo | Texto | Dónde aparece y cómo | ¿Causa + solución? |
|---|---|---|---|
| Error de campo | Tu nombre es obligatorio. | Bajo el campo, `text-sm`, rojo | Sí |
| Error de campo | Añade al menos un teléfono, un email o tu LinkedIn: es lo que guardarán de ti. | Bajo el grupo, `role=alert` | Sí (modelo a seguir) |
| Error de campo | Dinos cómo te llamas. / Deja al menos un email o un teléfono. / Marca la casilla para poder enviar tus datos. | Bajo el campo, `text-xs` | Sí, pero en 12 px |
| Resumen | Revisa los campos marcados. | Texto rojo junto al botón | No dice cuáles |
| Resumen | Revisa los campos marcados en rojo. | Barra de guardado | Depende del color |
| Error | Elige al menos una hora. | `role=alert` bajo el selector | Sí |
| Aviso | Ya tienes 3 horas: quita una para añadir otra. | `text-xs` en `signal-deep`, región viva | Sí |
| Error | Código incorrecto o caducado. | Rojo, `role=alert`, casillas en rojo | Falta «Pide otro abajo» |
| Error | El enlace ha caducado o ya se usó. Pide uno nuevo. | Login | Sí |
| Error | No hemos podido subir la foto. Prueba con otra imagen. | Editor | Sí |
| Error | Elige una imagen (JPG, PNG, HEIC…). / La imagen es demasiado grande (máx. 15 MB). | Editor | Sí |
| Error | (error de `handoff`) | `text-glow` sobre café | Otro color |
| Error | Enlace no válido / Esta reunión ya no está | Página completa | Sí |
| Aviso | Casi no se ve sobre el fondo: usamos uno automático. | Editor de diseño | Sí |
| Éxito | ¡Código enviado! Lo hemos mandado a … | Caja verde con icono | Sí |
| Éxito | Alex ya tiene tu contacto. | Tarjeta con check, serif, foco | Sí |
| Éxito | Propuesta enviada a Alex. | Ídem | Sí |
| Éxito | Confirmada. Os acabamos de enviar la invitación a los dos. | Franja verde con foco | Sí |
| Éxito | Guardado. Los pases se actualizarán en unos segundos. | Barra (se corta) | Sí |
| Éxito | Copiado / Enlace copiado | Texto del botón 1,8 s, no se anuncia | Sí |
| Éxito | ¡Disponible! | Slug, región viva | Sí |
| Carga | Creando tu tarjeta… / Enviando el código… / Comprobando… / Enviando… / Confirmando… / Guardando… / Borrando… / Enviando otro… | En el botón | Formato coherente |
| Carga | (solo el círculo) | Enviar mi contacto, Sí cancelar, Google | Falta texto |

## Anexo C: Escala propuesta

- **Texto**:
  - `mark` 0.72rem (mono en mayúsculas, `tracking-[0.14em]`; sustituye `[9–12px]`).
  - `small` 0.875rem.
  - `body` 1rem (sustituye `[0.95rem]`, `[0.98rem]` y `[0.9rem]`).
  - `lead` 1.125rem.
  - `title` / `display` / `hero` (ya existen).
  - `name` = `clamp(2rem, 1.6rem + 2vw, 2.7rem)`.
- **Radios**: `control` 12px (campos y pastillas), `panel` 24px (formularios, secciones), `object` 28px (tarjeta, bloques oscuros) y `full`.
- **Sombras**: `soft`, `object`, `press-ink`, `press-signal` y `focus-ring`. Fuera las 15 arbitrarias.
- **Alturas**: control mínimo 44px (`h-11`); botones `sm` a 40px solo en escritorio y `md` 44px en móvil.

## Anexo D: Glosario

| Concepto | Término único | Hoy también se dice | Dónde cambiarlo |
|---|---|---|---|
| Lo que tienes y compartes | **tarjeta** | pase, página, perfil, «Tarjeta de contacto» | «tu página» en `card-editor.tsx:191, 243, 281, 295`. «Pase» solo para lo que vive en Wallet («Vista previa del pase») |
| El objeto de Apple/Google | **pase** (en botones, la marca: «Añadir a Apple Wallet») | cartera, Wallet | Sección «A la cartera» → «En tu móvil» o «Wallet» |
| URL `/u/slug` | **enlace de tu tarjeta** | slug, «/u/demo ↗» | `dashboard/page.tsx:37`, `slug-field.tsx` |
| Tus teléfonos, emails y redes | **datos de contacto** (sección «Cómo contactarte») | Tus contactos, enlaces, Tipo de enlace | `card-editor.tsx:225`, `links-editor.tsx:57, 142` |
| Datos que te dejan los visitantes | **contactos recibidos** | Te dejo mi contacto, Formulario de contacto | `contact-form.tsx:127`, `card-editor.tsx:293, 302` |
| Acción del visitante para dejar sus datos | **Déjale tu contacto** | Te dejo mi contacto, Enviar mi contacto | `contact-form.tsx:113, 127, 238` |
| Descargar la vCard | **Guardar contacto** | Guardar en contactos, Todos a Contactos (.vcf) | `contacts-panel.tsx:64-65` → «Guardar en Contactos» |
| Proponer una reunión | **Proponer reunión** (o «Agendar reunión», pero solo uno) | Agendar, propuesta, Deja que te propongan reuniones | `meeting-request.tsx:103, 192`, `card-editor.tsx:279, 288` |
| Enlace tipo Calendly | **Enlace de reservas** | Reservar cita | El tipo `booking` en `lib/card/links` |
| Anular una reunión o propuesta | **Cancelar** | Retirar, Quitar | `meeting-response.tsx` (etiqueta del `CancelBlock` del invitado) |
| Borrar para siempre | **Borrar** | Eliminar, Eliminar definitivamente | `account-panel.tsx`, `contacts-panel.tsx` |
| Quitar de una lista (recuperable) | **Quitar** | Eliminar enlace | `links-editor.tsx:142`, `meetings-panel.tsx` |
| Crear tu tarjeta | **Crear mi tarjeta** | Crea la tuya gratis, Créala en un minuto, Crear mi propia tarjeta | `create-yours.tsx:28`, `login/page.tsx:63`, `u/[slug]/not-found.tsx` |
| Acceder | **Entrar** | Acceso, Inicia sesión | `login/page.tsx:35`, `dashboard/contactos/route.ts:17` |
| Mandar la URL | **Compartir** (con hoja nativa) o **Copiar enlace** (sin ella) | Compartir enlace que copia | `welcome-panel.tsx:159` |

## Anexo E: Contraste de los tokens (calculado)

| Par | Ratio | Uso | ¿Cumple? |
|---|---|---|---|
| ink / paper | 14,79 | Texto | AA ✔ |
| muted / paper · card · paper-deep | 5,41 · 5,90 · 4,86 | Texto secundario | AA ✔ |
| signal / paper | 3,21 | Cursivas de titulares (grandes) y anillo de foco | Solo texto grande ✔; foco ✔ (≥3) |
| signal-deep / paper | 5,26 | Texto pequeño naranja | ✔ |
| blanco / signal-strong | 4,77 | Botón principal | ✔ |
| paper al 60 % / ink | 6,09 | Etiquetas sobre fondo oscuro | ✔ |
| ok / paper | 4,63 | Texto de éxito | ✔ por poco |
| danger / paper | 5,73 | Errores | ✔ |
| line / card | 1,42 | **Borde de campo** | ✘ (1.4.11 pide 3) |
| line-strong al 70 % / card | 1,60 | **Interruptor apagado** | ✘ |
| danger al 40 % / paper | 1,98 | Borde del botón `danger` | ✘ |
| muted al 60 % / card | 2,56 | Texto de ejemplo en campos | Aceptable solo si no parece un valor (A11Y-13) |
| signal (foco) / naranja de la tarjeta #EF7A4A | 1,33 | Foco sobre el color de la tarjeta | ✘ si algún control enfocable cae sobre la cabecera de color (hoy ninguno) |

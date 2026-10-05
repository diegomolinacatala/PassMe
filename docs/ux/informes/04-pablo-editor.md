# Auditoría UX del editor `/dashboard`: Pablo, diseñador exigente

Capturas en esta carpeta (`m-*` = iPhone 15, 393×659; `d-*` = escritorio 1440×900). Scripts: `s1.mjs` a `s4.mjs`.

## 1. Persona y contexto

Pablo tiene 29 años y es diseñador freelance. Ya tiene tarjeta y entra a dejarla perfecta: foto bien encuadrada, sus 10–15 enlaces en orden, colores exactos y un QR para imprimir en su papelería. Le importan el detalle, la coherencia y que el producto "ya lo haya pensado". Usa el iPhone en la calle y el portátil en el estudio, y compara los dos.

## 2. Recorrido narrado

**Entrar (iPhone).** Abre `/login`, escribe el email, pulsa «Enviarme un código» y pega `00000000`. Llega a `/dashboard` en unos 1,7 s, con 3 toques. Sin problemas (`m-01-login.png`, `m-02-code.png`).

**Primera pantalla del editor** (`m-05-preview-settled.png`). Ve el título «Tu tarjeta, a tu manera.», la etiqueta «PUBLICADA», el aviso de demo y las pestañas Apple / Google / Al escanear. Del pase solo asoma la mitad: el QR queda debajo de la barra «Todo guardado · Guardar».
- Lo que piensa: «¿Dónde enseño mi QR? ¿Dónde lo comparto?». No hay ninguna acción arriba. Las acciones están en «A la cartera», en el bloque 05.
- Altura total de la página en el móvil: **7 262 px, unas 11 pantallas** (`m-04-dash-full.png`). Posición de cada bloque: Quién eres 927 · Tus contactos 1 805 · Estilo 3 147 · Publicación 4 599 · A la cartera 5 198 · Reuniones 5 553 · Contactos recibidos 5 958 · Actividad 6 420 · Cuenta 6 986.

**01 Quién eres** (`m-sec-01.png`).
- La foto se recorta sola por el centro y no hay forma de encuadrarla.
- Escribe la bio y la vista previa queda 960 px más arriba, fuera de la pantalla (`m-11-editing-bio.png`). No ve el efecto de lo que escribe.
- Con un nombre de 60 caracteres, el pase lo corta con «…» y las iniciales salen «PC» (`m-16-preview-longname.png`).

**02 Tus contactos** (`m-sec-02.png`).
- Cada enlace ocupa unos 120 px en el móvil, porque sus 4 iconos (ojo, subir, bajar, papelera) van apilados en vertical. Cada icono mide 32×32 px.
- El input queda estrecho y la URL de LinkedIn se corta.
- Para cambiar el tipo hay que tocar el icono negro, que esconde un `<select>` invisible. Pablo no lo descubre.
- Añade «Web: mi portfolio» y «Enlace: behance.net/pablo» sin título, y salen los errores en línea (`m-14-link-errors.png`). Bien.
- Llega a 15 enlaces y la página crece hasta **8 982 px** (`m-15-15links-save.png`).
- Los 13 chips de «Añadir contacto» ocupan 6 filas.

**Guardar con errores.** Vacía el nombre, baja al final y pulsa «Guardar».
- La barra dice «Revisa los campos marcados en r…», **cortado**, y la página no se mueve: se queda en `scrollY = 6622`, con el error 5 700 px más arriba (`m-12-save-error-bottom.png`).
- No dice cuántos errores hay ni dónde están.

**03 Estilo** (`m-sec-03.png`, `d-06-estilo.png`). Es la mejor parte: las opciones muestran su propia tarjeta. Pero ocupa unos 1 450 px en el móvil (10 temas, 8 motivos, variación, 4 letras y «Tintas a medida»). En el móvil, mientras elige motivo no ve el pase entero, solo las miniaturas.

**04 Publicación** (`m-sec-04.png`, `m-13-slug.png`).
- El slug valida en directo: «Entre 3 y 32 caracteres.», «Ese nombre está reservado.», y convierte espacios en guiones.
- Pero `pablo_serrano` da error en vez de convertir el guion bajo.
- Los interruptores «reuniones» y «contactos» viven aquí aunque no tienen nada que ver con publicar. Al activarlos, la vista previa «Al escanear» **no cambia**: no muestra «Agendar reunión» ni «Déjale tu contacto».

**05 A la cartera** (`m-sec-05.png`). En el iPhone aparecen «Añadir a Apple Wallet» **y** «Añadir a Google Wallet», los dos con el mismo peso. Debajo, «Ver mi tarjeta», «Copiar enlace» y «QR para imprimir», que descarga directamente un SVG sin previsualizarlo. No hay «Compartir» con la hoja nativa, aunque la bienvenida sí lo tiene.

**06 Reuniones** (`m-sec-06.png`). Lo urgente («Te toca responder») está en el píxel 5 553, a unas 8,5 pantallas de scroll. El grupo «Te toca responder» repite su etiqueta «TE TOCA» en cada fila.

**07 Contactos recibidos.**
- Borra a Lucía: aparece un `confirm()` nativo y se borra.
- La cabecera sigue diciendo **«1 en total»** mientras el cuerpo dice «Aún no te ha dejado nadie su contacto…» (`m-19-contacts-empty.png`).
- El texto vacío dice «te avisaremos por email si está configurado», que es jerga de desarrollador.
- `/dashboard/contactos` no es una página: es una descarga CSV/VCF. En demo devuelve texto plano «Inicia sesión» con estado 401.

**08 Actividad** (`m-sec-08.png`). Las métricas «Visitas», «Desde el QR», «Contactos guardados» y «Añadidos a cartera» se entienden. «Contactos más usados» en realidad son clics en enlaces.

**09 Cuenta** (`m-10-bottom.png`). En demo, «Eliminar mi cuenta y mi tarjeta» está desactivado sin explicación. «Cerrar sesión» solo existe aquí, al fondo de 7 000 px; no hay menú de cuenta en la cabecera.

**Salir con cambios.** `beforeunload` salta al navegar fuera (comprobado en escritorio). No hay botón para **descartar cambios** ni para deshacer.

**Escritorio** (`d-05-top.png`, `d-07-publicacion.png`, `d-08-aside-bottom.png`, `d-09-links.png`).
- Dos columnas, con la vista previa fija a la derecha. Bien.
- Pero la columna derecha tiene **su propio scroll** con 6 bloques (vista previa, cartera, reuniones, contactos recibidos, actividad, cuenta). Si Pablo la baja para ver la actividad, la vista previa desaparece mientras edita a la izquierda (`d-09-links.png`: edita los enlaces y a la derecha ve «Actividad»).
- La barra de guardar tapa texto de las dos columnas (`d-08`: «Lo verás en «…» tapado).
- En Windows enseña el atajo «⌘S».

**Modo oscuro** (`m-20-dark.png`). Con `prefers-color-scheme: dark` la página sale idéntica. No hay tema oscuro.

**Bienvenida** (`/dashboard?nueva=1`, `m-21-welcome.png`). Es excelente: QR grande, un solo botón de cartera según la plataforma y «Compartir enlace» nativo. Pero al cerrarla, todo eso desaparece para siempre del editor.

Toques y scroll de las tareas típicas en el móvil:

| Tarea | Toques | Scroll |
|---|---|---|
| Cambiar el tema y guardar | 2 | unos 3 100 px |
| Responder una reunión | 1 | unos 5 500 px |
| Cerrar sesión | 1 | unos 7 000 px |
| Enseñar mi QR a alguien (usuario recurrente) | no hay acción | queda el QR del pase de la vista previa, medio tapado por la barra |

## 3. Hallazgos

### EDIT-01: No hay forma rápida de enseñar el QR al volver al editor
- **Severidad:** ALTA
- **Dónde:** `/dashboard`, `src/components/editor/card-editor.tsx:351-384`. La acción solo existe en `welcome-panel.tsx:474-487`, que se muestra únicamente con `?nueva=1`.
- **Qué pasa:** la prioridad nº 1 del producto es enseñar tu QR de vuelta. Un usuario que vuelve solo tiene el QR dentro de una «Vista aproximada» del pase, medio tapado por la barra de guardar (`m-05-preview-settled.png`). «QR para imprimir» descarga un SVG, no lo enseña.
- **Propuesta:** debajo del título, una fila fija de acciones:
  - **«Enseñar mi QR»** (primario, tinta) abre una hoja a pantalla completa con el QR, que sube el brillo (en iOS basta fondo blanco), con el nombre y un botón «Cerrar».
  - **«Compartir»** (secundario) abre `navigator.share`, o copia el enlace si no hay hoja nativa.
  - En el móvil, **un solo botón de cartera** según la plataforma.
  - Es reutilizar el `WelcomePanel` en versión compacta.
- **Aceptación:** en el iPhone, desde `/dashboard` sin parámetros, 1 toque muestra un QR escaneable de 240 px o más sin hacer scroll.

### EDIT-02: Guardar con errores no lleva al error y el mensaje sale cortado
- **Severidad:** ALTA
- **Dónde:** `card-editor.tsx:281-286` (sin foco ni scroll) y `card-editor.tsx:593` (`truncate`).
- **Qué pasa:** al guardar desde abajo con el nombre vacío, la barra muestra «Revisa los campos marcados en r…» y la página no se mueve; el campo está 5 700 px más arriba (`m-12-save-error-bottom.png`). Con 15 enlaces y 10 errores, el mensaje es el mismo.
- **Propuesta:**
  - Al fallar, hacer `scrollIntoView({block:"center"})` y `focus()` sobre el primer `[aria-invalid=true]`.
  - Texto nuevo: **«Falta tu nombre»** si hay un solo error; **«3 campos por revisar · Ver»** si hay varios. «Ver» salta al siguiente error.
  - Quitar `truncate` en el móvil y permitir 2 líneas.
- **Aceptación:** tras pulsar Guardar con errores, el primer campo erróneo queda visible y con foco, y el mensaje se lee completo a 393 px.

### EDIT-03: En el móvil la vista previa desaparece en cuanto editas
- **Severidad:** ALTA
- **Dónde:** `card-editor.tsx:382-384` (`PreviewPanel` solo arriba en el móvil).
- **Qué pasa:** mientras escribe la bio o elige un motivo, el pase está 960 px o más por encima (`m-11-editing-bio.png`). Para ver el resultado hay que subir y volver a bajar.
- **Propuesta:** en menos de 1 024 px, cuando la vista previa sale de pantalla, mostrar una **mini vista previa fija** (una píldora de 64 px con la miniatura del pase, encima de la barra de guardar). Al tocarla se abre una hoja inferior con la vista previa completa y sus 3 pestañas. Alternativa más simple: botón «Vista previa» en la barra de guardar que abre esa hoja.
- **Aceptación:** desde cualquier campo del editor en el iPhone, el pase actualizado se ve con 1 toque y sin perder la posición de scroll.

### EDIT-04: Página de 11 pantallas sin índice; lo urgente queda al fondo
- **Severidad:** ALTA
- **Dónde:** `card-editor.tsx:379-545`, con orden fijo 01→09; `page.tsx:27-42`, cabecera sin navegación.
- **Qué pasa:** 7 262 px en el móvil (8 982 px con 15 enlaces). «Te toca responder» una reunión está a 5 553 px y «Cerrar sesión» a unos 7 000 px. No hay pestañas, índice ni saltos. El email de contacto nuevo enlaza a `/dashboard#contactos` (`src/app/u/[slug]/actions.ts:77`), pero dentro del editor no hay forma de llegar.
- **Propuesta:**
  1. Bajo la cabecera, una **barra fija de 3 segmentos**: **«Tarjeta» · «Bandeja (2)» · «Actividad»**.
     - «Tarjeta» agrupa 01–04 y la cartera.
     - «Bandeja» agrupa Reuniones y Contactos recibidos, con un contador de pendientes.
     - En escritorio se mantienen las dos columnas, pero la Bandeja pasa a ser una pestaña de la columna derecha.
  2. Si hay pendientes, un aviso arriba: **«Tienes 1 reunión por responder →»**, que lleva al ítem.
  3. Cuenta en un menú de la cabecera (avatar o email): «Cerrar sesión», «Eliminar cuenta…».
- **Aceptación:** en el iPhone, llegar a «Responder» una reunión o a «Cerrar sesión» cuesta 2 toques o menos y nada de scroll largo.

### EDIT-05: «Contactos» significa cuatro cosas distintas
- **Severidad:** MEDIA, pero de coherencia grave.
- **Dónde:**
  - «Tus contactos»: tus enlaces, `card-editor.tsx:419`.
  - «Añadir contacto»: `links-editor.tsx:530`.
  - «Contactos recibidos»: personas que te dejaron sus datos, `card-editor.tsx:529`.
  - «Contactos guardados»: descargas de vCard, `stats-panel.tsx:271`.
  - «Contactos más usados»: clics en enlaces, `stats-panel.tsx:299`.
  - «Guardar contacto»: botón público.
- **Propuesta:**
  - Bloque 02 → **«Tus enlaces»** y botón **«Añadir enlace»**.
  - En Actividad: **«Guardaron tu contacto»** y **«Enlaces más pulsados»**.
  - Reservar «contactos» para los que recibes: **«Contactos recibidos»**.
- **Aceptación:** la palabra «contacto» solo designa a personas (la tuya guardada por otros, o la de otros recibida por ti).

### EDIT-06: El contador de la cabecera no se actualiza al borrar
- **Severidad:** MEDIA
- **Dónde:** `card-editor.tsx:523` y `:530` usan `meetings.items.length` y `contacts.requests.length`, que vienen del servidor. Los paneles filtran de forma optimista (`contacts-panel.tsx:108-110`, `meetings-panel.tsx:298-300`).
- **Qué pasa:** después de borrar a Lucía se lee «1 en total» junto a «Aún no te ha dejado nadie su contacto» (`m-19-contacts-empty.png`).
- **Propuesta:** que el panel calcule y pinte su propio contador (subir `list.length` con un callback o mover la descripción al panel). Sin elementos, sin descripción.
- **Aceptación:** al borrar el último contacto, la cabecera ya no muestra contador.

### EDIT-07: Enlaces poco manejables en el móvil (filas altas, controles de 32 px, tipo oculto)
- **Severidad:** ALTA para alguien con 10–15 enlaces.
- **Dónde:** `links-editor.tsx:490-507` (4 `IconButton` de 32 px apilados con `flex-col`), `:414-434` (select invisible sobre el icono, `title="Cambiar tipo"`) y `:533-549` (13 chips).
- **Qué pasa:** cada fila mide unos 120 px y el input queda estrecho. Los objetivos de 32 px no llegan al mínimo de 44 pt de Apple. Subir o bajar es de uno en uno: llevar un enlace de la posición 15 a la 1 son 14 toques. El cambio de tipo no se descubre en táctil. Hay 6 filas de chips.
- **Propuesta:**
  - Fila compacta: icono · valor · un solo botón **«⋯»** (44×44) con un menú: «Ocultar de la tarjeta / Mostrar», «Subir al principio», «Cambiar tipo», «Duplicar», «Eliminar».
  - Reordenar arrastrando un asa «⠿» de 44 px (pulsación larga en táctil).
  - Sustituir los 13 chips por **un campo «Pega un enlace, email o teléfono»** que detecta el tipo (linkedin.com → LinkedIn, `@` → Email, `+34…` → Teléfono, cualquier otra URL → Web), más un botón «Elegir tipo…» con la lista completa.
- **Aceptación:**
  - Fila de 72 px o menos en el iPhone.
  - Todos los controles de 44 px o más.
  - Pegar `https://www.behance.net/pablo` crea un enlace del tipo correcto en 2 toques.
  - Mover del 15 al 1 en 2 gestos o menos.

### EDIT-08: «Web» y «Enlace» son casi lo mismo
- **Severidad:** MEDIA
- **Dónde:** `src/lib/card/links.ts:297` («Web») y `:381` («Enlace»); `links-editor.tsx:374` (`LABELLED_KINDS`).
- **Qué pasa:** dos tipos de URL genérica, uno con título opcional y otro con título obligatorio. Pablo no sabe cuál usar; «Enlace» sin título da error (`m-14-link-errors.png`).
- **Propuesta:** un solo tipo **«Web»** con título opcional («Título (opcional)»). Si está vacío, se muestra el dominio. Migrar los `custom` a `website` al leer, igual que se hace con los motivos retirados.
- **Aceptación:** la lista de tipos tiene 12 entradas y ningún enlace web exige título.

### EDIT-09: Foto: sin encuadre, y el formato HEIC promete más de lo que da
- **Severidad:** MEDIA (ALTA para un diseñador)
- **Dónde:** `avatar-field.tsx:14-38` (recorte central fijo), `:56` («Elige una imagen (JPG, PNG, HEIC…)») y `:116`.
- **Qué pasa:**
  - No se puede mover ni ampliar la foto: en un retrato con la cara descentrada, la cara se corta.
  - Un `.heic` en Chromium o Android da «No hemos podido subir la foto. Prueba con otra imagen.» (`m-18-avatar-error.png`), aunque el mensaje anterior anunciaba HEIC.
- **Propuesta:**
  - Tras elegir la foto, una hoja **«Encuadra tu foto»** con máscara circular, arrastrar y pellizcar (o un deslizador de zoom en escritorio), y los botones «Usar foto» y «Cancelar».
  - Para HEIC sin soporte, el mensaje **«Tu navegador no abre fotos HEIC. Expórtala como JPG o hazle una captura.»**
  - Cambiar «Cuadrada, se recorta sola» por **«Podrás encuadrarla. Sale en el pase y al guardar tu contacto.»**
- **Aceptación:** se puede reencuadrar antes de usar la foto, y un HEIC no compatible da un mensaje específico.

### EDIT-10: No hay «Descartar cambios» ni deshacer
- **Severidad:** MEDIA
- **Dónde:** `SaveBar` (`card-editor.tsx:561-602`); `useCardDraft` ya tiene `saved` y `reset` (`use-card-draft.ts:161-162`), pero sin interfaz.
- **Qué pasa:** si Pablo prueba cinco temas y borra un enlace sin querer, la única forma de volver es recargar y aceptar el aviso del navegador.
- **Propuesta:**
  - Con cambios pendientes, la barra muestra **«Descartar»** (ghost) a la izquierda de «Guardar».
  - Al borrar un enlace, un aviso temporal **«Enlace eliminado · Deshacer»** durante 5 s.
  - `Ctrl/⌘+Z` deshace el último cambio del borrador.
- **Aceptación:** con cambios pendientes, 1 toque devuelve el estado guardado; un enlace borrado se recupera en 1 toque.

### EDIT-11: La barra de guardar enseña «⌘S» en Windows y tapa contenido en escritorio
- **Severidad:** BAJA
- **Dónde:** `card-editor.tsx:594` y `:580-585`.
- **Propuesta:**
  - Mostrar «Ctrl S» fuera de macOS (`navigator.platform` o `userAgentData`).
  - En `lg`, alinear la barra a la columna izquierda (`max-w` igual a la columna, sin centrarla en la ventana) para que no pise la derecha.
- **Aceptación:** en Windows se lee «Ctrl S», y la barra no tapa texto de la columna derecha a 1440 px (`d-08`).

### EDIT-12: En escritorio la columna derecha tiene scroll propio y se lleva la vista previa
- **Severidad:** MEDIA
- **Dónde:** `card-editor.tsx:506` (`aside … lg:overflow-y-auto`).
- **Qué pasa:** al bajar en la columna derecha para ver la Actividad, la vista previa se pierde mientras se edita a la izquierda (`d-09-links.png`). Dos scrolls anidados en la misma página.
- **Propuesta:** la columna derecha solo contiene la **vista previa fija y la cartera** (las acciones de EDIT-01). Bandeja, Actividad y Cuenta pasan a las pestañas de EDIT-04.
- **Aceptación:** a 1440×900 la vista previa está siempre visible mientras se edita cualquier campo.

### EDIT-13: Los interruptores de reuniones y contactos no viven en «Publicación» ni se ven en la vista previa
- **Severidad:** MEDIA
- **Dónde:** `card-editor.tsx:471-498`; `profile-card.tsx:144-158` no dibuja los botones «Agendar reunión» ni «Déjale tu contacto» en modo `preview`.
- **Qué pasa:**
  - «Publicación» mezcla tres cosas: publicar, el enlace (slug) y dos funciones de la página.
  - Al activar los interruptores, la vista previa «Al escanear» no cambia, así que Pablo no sabe cómo queda.
  - Los textos de ayuda son largos (4 líneas en el móvil).
- **Propuesta:**
  - Nueva sección **«Tu página»** con dos filas cortas: **«Agendar reunión»** («Te proponen hora y la confirmas desde el email») y **«Déjame tu contacto»** («Un formulario para que te dejen sus datos»).
  - La vista previa muestra esos botones en gris, sin acción.
  - «Publicación» se queda con el interruptor y el enlace.
- **Aceptación:** al activar o desactivar cada opción, la vista previa «Al escanear» muestra u oculta su botón.

### EDIT-14: La cartera enseña Apple y Google a la vez y ofrece «¿Estás en el ordenador?» en el móvil
- **Severidad:** MEDIA
- **Dónde:** `wallet-panel.tsx:152-155` (los dos botones siempre) y `:157` (handoff sin comprobar la plataforma). La bienvenida sí filtra (`welcome-panel.tsx:428-429`).
- **Propuesta:**
  - Pasar `platform` a `WalletPanel`: en iOS solo Apple, en Android solo Google, y debajo un enlace pequeño «¿Otra cartera?».
  - El bloque «¿Estás en el ordenador?» solo cuando `platform === "other"`.
- **Aceptación:** en el iPhone, el panel muestra un único botón de cartera y no muestra el bloque del ordenador.

### EDIT-15: No hay «Compartir» nativo y el QR para imprimir no tiene opciones
- **Severidad:** MEDIA
- **Dónde:** `wallet-panel.tsx:196-222`; `src/app/u/[slug]/qr/route.ts`, que solo genera un SVG en `#221b17` sobre blanco.
- **Propuesta:**
  - Sustituir «Copiar enlace» por **«Compartir»**: hoja nativa, o copiar como alternativa, con el mismo componente que la bienvenida.
  - «QR para imprimir» abre una hoja con la vista previa y **«Descargar SVG» / «Descargar PNG (1024 px)»**, y opcionalmente «Usar el color de mi tarjeta».
  - El nombre del archivo ya es bueno (`passme-<slug>-qr.svg`).
- **Aceptación:** desde el editor en el iPhone, 1 toque abre la hoja de compartir; se puede descargar PNG y SVG.

### EDIT-16: Estilo ocupa casi dos pantallas; lo avanzado no está escondido
- **Severidad:** MEDIA
- **Dónde:** `design-field.tsx:291-356`.
- **Qué pasa:** «Tintas a medida» (dos selectores con hex y «Auto») y «Variación» están siempre abiertos. «Tintas» y «Detalle» son jerga.
- **Propuesta:**
  - Visible: Tema → Motivo → Letra.
  - Tras **«Más opciones de estilo»** (plegable): «Variación» y **«Colores a medida»**, con las filas «Fondo» y «Color de los trazos».
  - Arreglar la ayuda de Variación (`design-field.tsx:490`), que solo nombra 3 de los 6 motivos con variaciones. Texto nuevo: «Este motivo no tiene variaciones.»
  - Permitir escribir o pegar el hex directamente (hoy solo hay selector nativo, `:604-611`).
- **Aceptación:** Estilo plegado mide 1 000 px o menos en el iPhone, y se puede pegar `#1F3A5F`.

### EDIT-17: Slug: guion bajo rechazado y sin alternativa si está cogido
- **Severidad:** BAJA
- **Dónde:** `slug-field.tsx:210` (solo convierte espacios) y `src/app/dashboard/actions.ts:98` («Ese enlace ya está cogido.»).
- **Propuesta:**
  - Convertir `_` y `.` en `-` al escribir, y quitar acentos (`normalize("NFD")`).
  - Si está cogido: **«Ese ya está cogido. ¿Te vale `pablo-serrano-2` o `pabloserrano`?»**, con chips que lo aplican.
- **Aceptación:** escribir `pablo_serrano` da `pablo-serrano`, y un slug cogido ofrece 2 alternativas libres.

### EDIT-18: «Ver mi tarjeta» con cambios sin guardar abre la versión antigua sin avisar
- **Severidad:** BAJA
- **Dónde:** `page.tsx:32-38` (`/u/slug ↗` en la cabecera) y `wallet-panel.tsx:197-204`.
- **Propuesta:** si `dirty`, el texto pasa a **«Ver mi tarjeta (sin tus cambios)»**, o se ofrece «Guarda para verlo publicado». Mejor aún: añadir **«Ver como visitante»** con la vista previa «Al escanear» a pantalla completa, que sí incluye el borrador.
- **Aceptación:** nunca se abre la página pública con cambios pendientes sin indicarlo.

### EDIT-19: Textos de sistema y estados vacíos con jerga
- **Severidad:** BAJA
- **Dónde:**
  - `contacts-panel.tsx:141` («si está configurado»).
  - `card-editor.tsx:420` («Lo oculto nunca sale del servidor»).
  - `contacts-panel.tsx:131` y `meetings-panel.tsx:321` (número de migración visible al usuario).
  - `account-panel.tsx:360-369` (borrar desactivado en demo sin motivo).
- **Propuesta:**
  - «Cuando alguien te lo deje, te avisaremos por email y lo verás aquí.»
  - «Lo que ocultes no lo verá nadie.»
  - Errores de migración: «Esta función aún no está disponible.» (el número, solo en el log).
  - En demo: «En la demo no se puede borrar la cuenta.»
- **Aceptación:** ningún texto visible menciona servidor, configuración ni migraciones.

### EDIT-20: Etiqueta repetida en Reuniones
- **Severidad:** BAJA
- **Dónde:** `meetings-panel.tsx:261` y `:288`.
- **Qué pasa:** debajo del grupo «TE TOCA RESPONDER», cada fila vuelve a decir «TE TOCA».
- **Propuesta:** dentro de un grupo, no repetir el estado del grupo; mostrar solo la fecha. Mantener la etiqueta solo en «Anteriores» (Rechazada, Cancelada…).
- **Aceptación:** ninguna fila repite el título de su grupo.

### EDIT-21: Nombres de temas cortados en el móvil
- **Severidad:** BAJA
- **Dónde:** `design-field.tsx:415` (`truncate` a 5 columnas): «MELOCOT…», «TERRACO…» (`m-sec-03.png`).
- **Propuesta:** 4 columnas en menos de 400 px, o el nombre en 2 líneas con `text-[9px]`.
- **Aceptación:** los 10 nombres se leen completos a 393 px.

### EDIT-22: Iniciales y nombre largo en el pase
- **Severidad:** BAJA
- **Dónde:** `src/components/card/avatar.tsx:11-17` (primera y última palabra: «Pablo Serrano … Castellanos» da «PC»).
- **Propuesta:** en nombres de 3 palabras o más, usar el nombre y la primera palabra que no sea partícula (de, del, la, y): «PS». En el editor, avisar por debajo del campo cuando el nombre no cabe en el pase: «En el pase se verá cortado: prueba con nombre y primer apellido».
- **Aceptación:** «Pablo Serrano Iglesias de la Fuente» da «PS», y se avisa antes de guardar si el nombre no cabe en el pase.

### EDIT-23: Pronombres en primera línea
- **Severidad:** BAJA
- **Dónde:** `card-editor.tsx:408`.
- **Qué pasa:** en España casi nadie los usa y ocupan media fila del bloque principal.
- **Propuesta:** «Pronombres» y «Ubicación» pasan a un **«Añadir más datos»** dentro de 01, abierto si ya tienen valor.
- **Aceptación:** con los dos campos vacíos, 01 muestra foto, nombre, cargo, empresa y bio.

### EDIT-24: Sin modo oscuro
- **Severidad:** BAJA
- **Dónde:** `src/app/globals.css` (sin `prefers-color-scheme`), `m-20-dark.png`.
- **Propuesta:** como mínimo, no deslumbrar de noche: una variante `paper` oscuro del editor. El pase y la tarjeta pública mantienen su color.
- **Aceptación:** con `colorScheme: dark`, el fondo del editor es oscuro y los contrastes cumplen AA.

### Orden ideal propuesto (móvil)

1. Cabecera con menú de cuenta.
2. **Acciones de la tarjeta**: Enseñar QR · Compartir · Añadir a la cartera (una, según la plataforma).
3. Aviso de pendientes si los hay.
4. **Pestañas Tarjeta · Bandeja · Actividad.**
5. Dentro de «Tarjeta»:
   - 01 Quién eres (más datos plegados).
   - 02 Tus enlaces.
   - 03 Estilo (más opciones plegadas).
   - 04 Tu página (reuniones y contactos).
   - 05 Publicación y enlace.
6. «Bandeja»: Reuniones y Contactos recibidos.
7. «Actividad»: estadísticas.

La cuenta va en el menú de la cabecera. La mini vista previa fija acompaña siempre.

## 4. Cosas que están bien (no romper)

- **Opciones de Estilo con la propia tarjeta**: cada miniatura de tema, motivo y letra usa el nombre y la foto del dueño (`design-field.tsx:432-469`). Es lo mejor del editor.
- **Variación con «Anterior»** (historial de 20) y sin números a la vista.
- **Validación en línea** con mensajes claros y en español («Incluye el prefijo internacional (ej. +34).», «Ponle un título al enlace.»), solo tras salir del campo.
- **Slug** con comprobación en directo, conversión de espacios y la tranquilidad de «el enlace antiguo seguirá llevando a tu tarjeta».
- **Barra de guardar**:
  - Estados claros: «Cambios sin guardar» con punto naranja, «Guardado. Los pases se actualizarán en unos segundos.».
  - `Ctrl/⌘+S` funciona.
  - Aviso de `beforeunload` al salir con cambios.
  - Los botones de cartera se bloquean con «Guarda antes».
- **Vista previa con tres pestañas** (Apple, Google, Al escanear) que se actualiza al teclear.
- **Bienvenida tras el alta**: QR grande, cartera según la plataforma, compartir nativo y saludo al que te refirió.
- **Contactos recibidos** con confirmación al borrar, exportación CSV y VCF, y botón por contacto para guardarlo.
- **Reuniones** agrupadas por urgencia («Te toca responder» primero) y las cerradas plegadas.
- **Borrar cuenta** separado, en rojo, tras escribir «BORRAR».
- El texto de privacidad de Actividad («Sin cookies ni IPs…»).

## 5. «Ya lo había pensado»: lo que un usuario avanzado esperaría

| Idea | Dónde viviría sin ensuciar lo simple |
|---|---|
| **Enseñar mi QR a pantalla completa** (con brillo alto) | Botón primario arriba del editor (EDIT-01) y atajo en la página pública si eres el dueño |
| **Compartir con la hoja nativa** | Junto a «Enseñar QR» |
| **Descargar el QR en PNG/SVG**, con color de la tarjeta o negro | Hoja «QR para imprimir» (EDIT-15) |
| **Ver como visitante** (borrador a pantalla completa) | Botón dentro de la vista previa «Al escanear» |
| **Deshacer / descartar cambios** | Barra de guardar y aviso temporal (EDIT-10) |
| **Duplicar enlace** | Menú «⋯» del enlace |
| **Pegar cualquier cosa y que detecte el tipo** | Campo único «Pega un enlace, email o teléfono» (EDIT-07) |
| **Arrastrar para reordenar** | Asa «⠿» en cada enlace |
| **Encuadrar la foto** | Hoja tras elegir la foto (EDIT-09) |
| **Hex editable y «copiar estilo»** | «Más opciones de estilo» |
| **Modo oscuro del editor** (y pase oscuro con un toque: tema «Tinta») | Automático por sistema |
| **Programar visibilidad de enlaces** (p. ej. WhatsApp solo en eventos) | Futuro modo evento, menú «⋯» del enlace |
| **Historial de versiones / restaurar diseño anterior** | «Más opciones de estilo» → «Volver al diseño anterior» |
| **Varias tarjetas o perfiles** (freelance y estudio) | Selector en el menú de cuenta (Pro) |
| **Notificaciones**: activar o desactivar los emails de contactos y reuniones | Menú de cuenta → «Avisos» |
| **Cambiar el email de acceso** | Menú de cuenta |
| **Exportar mis datos** (RGPD) | Menú de cuenta, junto a «Eliminar cuenta» |
| **Saber si el pase está en mi cartera** y reenviarlo a otro móvil | Bloque de cartera: «Ya en 1 dispositivo · Añadir a otro móvil» |

# Auditoría UX: escanear una tarjeta (Javier) · prefijo SCAN

Carpeta de capturas: `scratchpad/ux/javier/`. Scripts: `s1-landing.mjs`, `s2-flows.mjs`, `s3-extra.mjs` y `s4-edge.mjs`. Probado contra `http://localhost:3200` en modo demo el 05/10/2026.

## 1. Persona y contexto

Javier tiene 58 años y una empresa de reformas. Usa un Android (Pixel 7, 412×839) y lleva gafas de cerca. Es poco técnico y desconfía de los enlaces. En una feria, Alex le enseña el QR de su pase y él lo escanea con la cámara, lo que abre `/u/demo?src=qr`. Lo que quiere es guardarse a Alex en la agenda y, si acaso, que Alex tenga su teléfono. Lo que no quiere es «registrarse en nada».

## 2. Recorrido narrado

**Paso 1. Aterrizaje** (`01-aterrizaje-pixel7-viewport.png`, `02-tarjeta-pixel7-full.png`)
- La página carga en unos 0,7 s. El título de la pestaña es «Alex Rivera · PassMe». Bien.
- Lo primero que se lee es el nombre, enorme y en serif, sobre el naranja. Javier piensa: «es la tarjeta de Alex».
- Pero el primer botón negro que ve no es de Alex. Es la píldora «+ Crea la tuya gratis», arriba a la derecha y antes que la tarjeta. Javier piensa: «ya me quieren vender algo».
- «Guardar contacto» aparece en la mitad inferior de la primera pantalla. Pesa visualmente lo mismo que la píldora de arriba: dos botones negros compitiendo.
- Ni «Agendar reunión» ni «Déjale tu contacto» se ven sin hacer scroll. Empiezan en y≈816 y y≈926, con un viewport de 839.
- Nada en la primera pantalla dice «no tienes que instalar nada». La tranquilidad no hace falta hasta que pulsa «Guardar contacto» y Android descarga un archivo (ver SCAN-02). La frase «Gratis y sin instalar nada» solo está en el bloque oscuro del final.

**Paso 2. Elemento a elemento** (tamaños medidos con Playwright)

| Elemento | Tamaño | Qué hace | ¿Se entiende sin leer? |
|---|---|---|---|
| Logo «PassMe» (enlace a `/`) | 80×32 | Saca de la tarjeta y lleva a la landing | Toque accidental fácil; es menor de 44 px |
| «+ Crea la tuya gratis» | 169×**36** | `/crear?de=demo` | Sí, pero roba el protagonismo y mide menos de 44 px |
| Etiqueta «TARJETA DE CONTACTO» | Texto de 10 px | Decorativa | Ilegible para Javier |
| Nombre, cargo y empresa | 43 px / 15 px | — | Muy bien |
| Avatar «AR» sin foto | 88 px | Iniciales | Correcto, aunque una cara daría más confianza |
| «VALENCIA, ES» | Mono de 11 px | — | Pequeño |
| Bio | 15 px | — | Bien |
| **Guardar contacto** | 276×56 | Descarga `demo.vcf` (en Android) | El texto es correcto, pero no dice que se descarga un archivo |
| Icono de compartir | 56×56 | Hoja de compartir del sistema, o copia el enlace (en escritorio) | Es el glifo de iOS (cuadrado con flecha); en Android no se reconoce. ¿Por qué querría Javier compartir a Alex? |
| Filas de enlaces (Email, LinkedIn, Portfolio, Instagram) | 340×68 | `mailto:`; https en pestaña nueva | Los iconos son claros. La etiqueta en mayúsculas de 10 px no se lee. La flecha ↗ es igual en todas, aunque el email abre Gmail y no una web |
| «Agendar reunión con Alex» | 380×98 | Despliega un formulario de 2 pasos | Sí. Su borde es sólido y destaca más que el del contacto |
| «Déjale tu contacto a Alex» | 380×98 | Despliega un formulario | Sí. Su borde es discontinuo y parece secundario |
| Bloque oscuro «Crear mi tarjeta» | 332×56 | `/crear?de=demo` | Sí |
| «Hecho con PassMe» | 164×36 | Lleva a `/` | Mide menos de 44 px |

**Paso 3. Guardar contacto** (`12-tras-guardar-Pixel7.png`, `demo.vcf`)
- En Android, la respuesta llega con `attachment` y Chrome descarga `demo.vcf`. La página no cambia en absoluto.
- Javier tiene que encontrar la barra «Descarga completada → Abrir», elegir Contactos y quizá también la cuenta. Son unos 4 toques sin ninguna guía, y muchos usuarios se quedan ahí.
- En iPhone llega `inline`, y se abre la hoja nativa. Bien.
- Contenido de la vCard:
  - Incluye N, FN, ORG, TITLE, ADR con la ciudad, EMAIL, tres URL con su etiqueta y la URL de PassMe. La NOTE lleva la bio.
  - No hay foto porque la demo no tiene. No hay teléfono porque en la demo está oculto.
  - La NOTE no dice cuándo ni dónde se conocieron.
  - `splitName` parte por la primera palabra, así que «Ana María López Gil» acabaría como nombre «Ana» y apellidos «María López Gil».

**Paso 4. Te dejo mi contacto** (`13`, `14`, `15`, `16`, `17`, `18` y `19-*.png`)
- Toques: scroll, «Déjale tu contacto», nombre (con autofocus), saltar el email, teléfono, casilla y «Enviar mi contacto». Son **4 toques y 2 textos**, más el scroll, para dejar nombre y teléfono.
- **Formulario vacío.** Salen errores en Nombre y en *Email* («Deja al menos un email o un teléfono») y en la casilla, más «Revisa los campos marcados.». El campo Teléfono no se marca, aunque es el que Javier iba a rellenar.
- **Teléfono mal («612 34»).** Sale «Número de teléfono no válido.» y se conservan los valores. Bien.
- **Texto largo.** El mensaje se corta en seco a 500 caracteres y la empresa a 80, sin contador ni aviso.
- **Envío correcto con nombre y teléfono.** El estado «Alex ya tiene tu contacto.» aparece en 74 ms. Debajo pone «¿Y si te haces tu propia tarjeta? **Ya tenemos tus datos.**» y el botón «Crear la mía con estos datos».
- «Más info» (consentimiento) navega en la misma pestaña. Al volver atrás, el formulario está cerrado y lo escrito se ha perdido (comprobado con recarga y con atrás).
- Una vez abiertos, ni el formulario ni la reunión se pueden cerrar (no hay botón Cerrar ni Cancelar). Pueden estar los dos abiertos a la vez (`27-ambos-abiertos-full.png`).

**Paso 5. Intercambio recíproco** (`20-crear-prefill-viewport.png`, `21-crear-prefill-full.png`)
- «Crear la mía con estos datos» lleva a `/crear?de=demo` con «Vienes de la tarjeta de Alex Rivera». Nombre y Móvil ya vienen rellenos. Muy bien.
- **Pero** si, después de enviar, Javier pulsa el botón naranja grande del bloque oscuro («Crear mi tarjeta») o el de arriba («Crea la tuya gratis»), llega a `/crear` **con todo vacío**. Comprobado: `fullName=` y `phone=`.

**Paso 6. Casos raros** (`22-noexiste.png`, `28-simulado-nombre-largo-sin-enlaces-360.png`, `29-simulado-palabra-larga-360.png`)
- `/u/noexiste` devuelve un 404 con «ERROR 404 · Esta tarjeta no existe». El texto es bueno («Pídele que te la enseñe de nuevo»). La única salida es «Crear mi propia tarjeta».
- Una tarjeta despublicada se ve igual que una inexistente (`get_public_card` exige `is_published`).
- Sin enlaces, el visitante ve «Todavía no hay enlaces visibles.», un mensaje pensado para el dueño.
- Un nombre de 5 palabras ocupa 5 líneas, y la cabecera, unos 580 px a 360 px de ancho.
- Un nombre compuesto se corta antes del guion («Maximiliano / -Bartolomé»).

**Paso 7. Letra grande, 360 px, horizontal, escritorio y QR**
- Con letra al 130% en el Pixel 7, **el botón de compartir se sale de la tarjeta y queda cortado** (`03-fuente130-pixel7-full.png`).
- A 360 px con letra al 130%, **desaparece del todo**. El email se trunca («alex@exampl…»), y la píldora «Crea la tuya gratis» toca el borde derecho (`05-360px-fuente130-viewport.png`, `05-360px-fuente130-full.png`).
- Las etiquetas de 10 y 11 px **no crecen** con la letra, porque están en px.
- En horizontal, la primera pantalla es solo la cabecera naranja, sin ninguna acción (`07-horizontal-viewport.png`).
- En escritorio a 1440 px se ve una columna de 440 px con mucho vacío alrededor (`08-escritorio-1440-viewport.png`, `09-escritorio-1440-full.png`).
  - No hay forma de pasarse la tarjeta al móvil.
  - «Compartir» copia el enlace y solo lo confirma cambiando el icono por un check (`10-escritorio-compartir-copiado.png`).
- Con el modo oscuro del sistema, la página se queda clara (`06-oscuro-full.png`). Es coherente y no hay roturas.
- `/u/demo/qr` descarga `passme-demo-qr.svg` y el QR es correcto (`24-qr-svg.png`). Solo lo enlaza el editor.

## 3. Hallazgos

### SCAN-01 · Al enviar el contacto, dos de los tres botones de «crear la mía» pierden los datos
- **Severidad:** ALTA
- **Dónde:** `/u/[slug]` tras enviar.
  - `src/components/card/create-yours.tsx:23-29` (barra superior) y `:55` (bloque oscuro): no llaman a `rememberDetails`.
  - Solo lo hace `src/components/card/contact-form.tsx:126-138`.
  - Lo mismo ocurre tras proponer una reunión (`src/components/meetings/meeting-request.tsx:77-85`).
- **Qué pasa:**
  - Tras «Alex ya tiene tu contacto», justo debajo está el bloque oscuro con un botón naranja grande, «Crear mi tarjeta». Es igual de llamativo que «Crear la mía con estos datos».
  - Si Javier pulsa ese, o el de arriba, llega a `/crear` vacío y tiene que volver a teclear nombre y móvil (`19-enviado-full.png`; `s3-extra.mjs` muestra `fullName=` y `phone=`).
  - Además hay dos llamadas a crear tarjeta seguidas.
- **Propuesta:**
  1. Cuando `ContactForm` o `MeetingRequest` estén en estado `sent`, guarda los datos en cuanto se envían (llama a `rememberDetails` al recibir `sent`, no al hacer clic). Así cualquier botón de crear los recoge.
  2. Oculta `CreateYoursCta` cuando el formulario ya está enviado. Por ejemplo, convierte la página en un pequeño componente cliente o pasa el estado por contexto. El bloque de confirmación ya es la llamada a la acción.
- **Criterio de aceptación:** tras enviar el contacto, cualquiera de los botones «Crea la tuya gratis», «Crear mi tarjeta» o «Crear la mía con estos datos» abre `/crear` con nombre y móvil rellenos. En la página solo hay una llamada grande a crear tarjeta visible a la vez.

### SCAN-02 · «Guardar contacto» en Android descarga un archivo sin ninguna guía
- **Severidad:** ALTA
- **Dónde:**
  - `src/app/u/[slug]/vcard/route.ts:180-191`: `attachment` si no es iOS.
  - `src/components/card/profile-card.tsx:153-156`: un enlace plano sin feedback.
- **Qué pasa:**
  - Javier pulsa y la página no cambia. Chrome descarga `demo.vcf` (con slug real sería `alex-rivera.vcf`) y lo avisa con una barrita abajo.
  - Para que el contacto acabe en la agenda hay que pulsar «Abrir», elegir la app Contactos y, a veces, la cuenta.
  - Para alguien desconfiado, «me ha descargado un archivo» es una señal de alarma. Ahí abandona o cree que ya está guardado y no lo está. Es el botón principal de la página.
- **Propuesta:**
  1. En navegadores que no sean iOS, al pulsar, mantén la descarga y abre bajo el botón un aviso en línea (no un modal):
     - Título: «Casi está. Abre "Alex Rivera.vcf" para guardarlo en tus contactos.»
     - Un dibujo pequeño de la barra de descargas con «Abrir» resaltado.
     - Un enlace secundario: «¿No lo ves? Volver a descargar».
  2. Nombra el archivo con el nombre de la persona: `filename*=UTF-8''Alex%20Rivera.vcf`, con la versión ASCII como respaldo. Así lo reconoce en Descargas.
  3. Tras el clic, cambia el texto del botón durante 3 s a «✓ Descargado: ábrelo para guardar».
- **Criterio de aceptación:** en el Pixel 7, tras pulsar «Guardar contacto», aparece en la página un texto que nombra el archivo y explica el siguiente toque. El archivo descargado se llama como el dueño de la tarjeta.

### SCAN-03 · Con letra grande o 360 px, el botón de compartir se sale y el email se corta
- **Severidad:** ALTA (accesibilidad; la persona tiene gafas de cerca)
- **Dónde:**
  - `src/components/card/profile-card.tsx:144`: `grid-cols-[1fr_auto]`, más el `whitespace-nowrap` de `buttonClasses` en `src/components/ui/button.tsx:25`.
  - `:173`: `truncate` en el valor del enlace.
  - `src/components/card/create-yours.tsx:16-29`: la barra superior.
- **Qué pasa:**
  - A 412 px con letra al 130%, el botón de compartir queda medio fuera de la tarjeta (`03-fuente130-pixel7-full.png`). A 360 px con 130%, desaparece (`05-360px-fuente130-viewport.png`, `05-360px-fuente130-full.png`).
  - «alex@example.com» se ve como «alex@exampl…»: el dato que Javier necesita está cortado.
  - La píldora superior toca el borde de la pantalla.
- **Propuesta:**
  - `grid-cols-[minmax(0,1fr)_auto]` y, en el enlace de «Guardar contacto», `whitespace-normal text-center leading-tight`.
  - En las filas de enlaces, cambia `truncate` por `break-all` para email y teléfono (o `break-words` en general). Los datos de contacto nunca deben llevar puntos suspensivos.
  - En la barra superior, `flex-wrap`, o acorta el texto a «Crea la tuya» por debajo de 380 px.
- **Criterio de aceptación:** a 360 px con `html{font-size:130%}`, se ven enteros «Guardar contacto», el botón de compartir dentro de la tarjeta y el email completo. `scrollWidth` es igual a `clientWidth`.

### SCAN-04 · Textos de 10–11 px fijos (en px) que no crecen con la letra del sistema
- **Severidad:** MEDIA
- **Dónde:**
  - `src/components/card/profile-card.tsx:91` («TARJETA DE CONTACTO»), `:96` (pronombres), `:134` (ubicación, 11 px) y `:170` (etiquetas EMAIL, LINKEDIN…, 10 px).
  - `contact-form.tsx:99` («OPCIONAL»).
- **Qué pasa:** a 130% siguen midiendo 10 px (`05-360px-fuente130-full.png`). Las etiquetas que dicen qué es cada fila («EMAIL», «INSTAGRAM») son justo lo que Javier no puede leer, y el espaciado en mayúsculas las hace aún más difíciles.
- **Propuesta:**
  - Pásalas a rem con un mínimo de 12 px: `text-[0.75rem]` en etiquetas y `text-[0.8125rem]` en ubicación.
  - Quita «TARJETA DE CONTACTO» del encabezado de la tarjeta pública. No aporta nada; el logo ya está en la barra superior. Sustitúyelo por nada o por los pronombres.
- **Criterio de aceptación:** ningún texto con contenido de la página pública mide menos de 12 px a 100%, y todos crecen al subir la letra.

### SCAN-05 · La jerarquía de la primera pantalla compite: «Crea la tuya gratis» pesa tanto como «Guardar contacto»
- **Severidad:** MEDIA
- **Dónde:** `src/components/card/create-yours.tsx:23-29` (variante `ink`, tamaño `sm`, 36 px de alto); `src/app/u/[slug]/page.tsx:55`.
- **Qué pasa:**
  - El primer botón negro del recorrido es una invitación a registrarse, antes incluso que la tarjeta. Para un usuario desconfiado parece publicidad.
  - Además mide 36 px de alto, por debajo de los 44 recomendados (`01-aterrizaje-pixel7-viewport.png`).
  - La invitación a crear tarjeta ya está, mejor explicada, en el bloque oscuro y tras enviar el contacto.
- **Propuesta:** deja la barra con variante `outline` (borde fino, sin relleno), alto `h-11` y texto «Crea la tuya». Así «Guardar contacto» queda como única acción rellena en la primera pantalla. No recomiendo quitarla del todo: es la prioridad nº1 del proyecto, pero en segundo plano.
- **Criterio de aceptación:** en la primera pantalla del Pixel 7 solo hay un botón relleno oscuro (Guardar contacto). Todos los elementos tocables miden 44 px de alto o más.

### SCAN-06 · Formulario «Te dejo mi contacto»: email antes que teléfono, ninguno marcado y la casilla de más
- **Severidad:** MEDIA
- **Dónde:** `src/components/card/contact-form.tsx:208-236` (orden y etiquetas), `:272-288` (casilla) y `:250-261` (mensaje); `src/lib/card/contact.ts:291-296` (el error va solo a `email`).
- **Qué pasa:**
  - Javier tiene móvil, no email. El primer campo de contacto es Email, y ni Email ni Teléfono dicen si son obligatorios (solo Empresa y Mensaje dicen «OPCIONAL»).
  - Con el formulario vacío, el error «Deja al menos un email o un teléfono» marca solo Email (`15-form-vacio-errores.png`).
  - La casilla obligatoria añade un toque, y su recuadro visible mide 16 px.
  - El mensaje se corta en seco a 500 caracteres, sin contador.
  - Hay 6 controles para lo que en la feria es «apúntate mi móvil».
- **Propuesta:**
  - Orden: Nombre → **Móvil** → Email, con un texto bajo el título: «Con el móvil o el email basta.».
  - El error de «al menos uno» marca ambos campos.
  - Empresa y Mensaje, plegados tras «+ Añadir empresa o un mensaje».
  - Sustituye la casilla por un texto bajo el botón: «Al enviar, Alex recibe tu nombre y lo que escribas. Más info». Es una acción afirmativa clara; validarlo con el abogado que revisará los textos legales. Si se mantiene la casilla, que toda la fila tenga al menos 44 px.
  - Mensaje con contador «0/500» desde 400.
- **Criterio de aceptación:** con nombre y móvil, enviar cuesta 3 toques (abrir, campo móvil, enviar). Con el formulario vacío, el error resalta Móvil y Email.

### SCAN-07 · Lo escrito se pierde al pulsar «Más info» o atrás, y los paneles no se pueden cerrar
- **Severidad:** MEDIA
- **Dónde:** `src/components/card/contact-form.tsx:283` (enlace en la misma pestaña) y `:151` (`open` solo en estado local); `meeting-request.tsx` (sin botón de cerrar en el paso 1).
- **Qué pasa:**
  - Javier pulsa «Más info» para ver qué se hace con sus datos (es desconfiado, así que lo hará). Navega a `/privacidad`, y al volver el formulario está cerrado y vacío.
  - Si abre «Agendar reunión» por error, no hay forma de plegarlo; pueden quedar los dos paneles abiertos (`27-ambos-abiertos-full.png`).
- **Propuesta:**
  - Que «Más info» abra con `target="_blank"` (en `meeting-request.tsx:284` también), o mejor, que despliegue en línea dos frases sobre qué se guarda y durante cuánto tiempo.
  - Guarda el borrador en `sessionStorage` mientras se escribe.
  - Añade un «×» de cerrar arriba a la derecha de cada panel abierto. Abrir uno pliega el otro.
- **Criterio de aceptación:** escribir el nombre, pulsar «Más info» y volver deja el formulario abierto con el nombre. Cada panel abierto tiene un control «Cerrar» de al menos 44×44.

### SCAN-08 · Orden y nombres de las acciones secundarias: «Agendar reunión» manda sobre «Déjale tu contacto»
- **Severidad:** MEDIA
- **Dónde:** `src/app/u/[slug]/page.tsx:58-67` (la reunión va primero); `meeting-request.tsx:92-109` (borde sólido e icono negro); `contact-form.tsx:164-178` (borde discontinuo, aspecto secundario), `:175` y `:189`.
- **Qué pasa:**
  - En una feria, lo natural y recíproco es dejar tu contacto, y esa es la prioridad nº1 del proyecto. Reunirse es menos frecuente y más pesado (formulario de 2 pasos). Sin embargo, la reunión va primero y con más peso visual.
  - Hay tres nombres para lo mismo: el botón dice «Déjale tu contacto a Alex», el formulario «Te dejo mi contacto» y el envío «Enviar mi contacto».
  - Si la tarjeta tiene además un enlace «Reservar cita», hay dos caminos de agenda con iconos casi iguales (`CalendarDays` frente a `CalendarClock`).
- **Propuesta:**
  - Primero «Déjale tu contacto a Alex», con el estilo sólido. Después «Agendar reunión», con el estilo discontinuo.
  - Usa una sola expresión: botón «Déjale tu contacto a Alex», título del formulario «Déjale tu contacto a Alex» y envío «Enviar a Alex».
  - Si la tarjeta tiene un enlace `booking` y además acepta reuniones, muestra solo uno: el enlace externo dentro del panel de reunión, como «¿Prefieres su calendario? Reservar cita».
- **Criterio de aceptación:** en `/u/demo`, el primer bloque bajo la tarjeta es «Déjale tu contacto». Los tres textos del flujo usan el mismo verbo.

### SCAN-09 · El texto de confirmación asusta: «Ya tenemos tus datos»
- **Severidad:** MEDIA (confianza)
- **Dónde:** `src/components/card/contact-form.tsx:122` y `:125`; `meeting-request.tsx:76`.
- **Qué pasa:**
  - Para Javier, ¿quién es «tenemos»? Acaba de leer que sus datos eran solo para Alex («Nada más.»), y ahora una empresa dice tenerlos.
  - «Te escribirá cuando pueda» no encaja si solo dejó el teléfono.
- **Propuesta:**
  - «¿Te haces tu propia tarjeta? **Empieza con lo que acabas de escribir.**»
  - Texto según el canal: con teléfono, «Alex te llamará o te escribirá cuando pueda.»; solo con email, «Alex te escribirá cuando pueda.»
- **Criterio de aceptación:** ningún texto de la página pública dice «tenemos tus datos».

### SCAN-10 · Las acciones de las filas de contacto no se distinguen; ni teléfono ni WhatsApp en la demo
- **Severidad:** MEDIA
- **Dónde:** `src/components/card/profile-card.tsx:175-178` (la misma flecha ↗ en todas); `src/lib/card/demo.ts:35` (teléfono `visible: false`); `src/lib/card/quick.ts:43-47` (la tarjeta rápida crea un enlace `phone`, nunca `whatsapp`).
- **Qué pasa:**
  - La flecha «sale a una web» aparece también en el email, que abre la app de correo.
  - Para un autónomo de reformas, el teléfono y WhatsApp son el canal. La tarjeta de ejemplo, que es lo que ve quien llega desde la landing, no tiene ninguno visible.
  - Una tarjeta creada en `/crear` tiene «Móvil», pero el visitante no puede escribir por WhatsApp a ese número.
- **Propuesta:**
  - Sustituye la flecha por un verbo corto a la derecha, en texto de 13 px: «Llamar», «Escribir», «Abrir» o «WhatsApp».
  - En las filas `phone`, añade un segundo botón de icono WhatsApp (44×44) que abra `wa.me/<número>`, si el número tiene prefijo internacional, o deja que el dueño lo active con un interruptor «También por WhatsApp» en el editor.
  - Pon el teléfono visible en la tarjeta demo.
- **Criterio de aceptación:** cada fila dice qué pasará al tocarla. Una tarjeta con móvil +34 ofrece llamar y WhatsApp.

### SCAN-11 · Tarjeta sin enlaces: el visitante ve un mensaje pensado para el dueño
- **Severidad:** MEDIA
- **Dónde:** `src/components/card/profile-card.tsx:195-199`.
- **Qué pasa:** «Todavía no hay enlaces visibles.» es un aviso de editor. El visitante, en un recuadro discontinuo, lo lee como «esta tarjeta está rota» (`28-simulado-nombre-largo-sin-enlaces-360.png`).
- **Propuesta:** con `preview=false`, no muestres nada: «Guardar contacto» ya cubre el caso. Mantén el aviso solo en la vista previa del editor, con el texto «Añade un teléfono o un email para que puedan contactarte.».
- **Criterio de aceptación:** una tarjeta pública sin enlaces no muestra ningún recuadro vacío.

### SCAN-12 · El origen QR se pierde al guardar el contacto (estadísticas del dueño)
- **Severidad:** MEDIA
- **Dónde:** `src/components/card/profile-card.tsx:68` (`vcardHref` sin `?src=`). La ruta sí lo lee (`vcard/route.ts:184`).
- **Qué pasa:** el enlace es `/u/demo/vcard` aunque la visita venga de `?src=qr`, así que todas las descargas de vCard cuentan como «direct». El panel de estadísticas mezcla «escanearon y guardaron» con el resto.
- **Propuesta:** pasa `source` de `page.tsx:34` a `ProfileCard` y construye `/u/<slug>/vcard?src=<source>` cuando no sea `direct`.
- **Criterio de aceptación:** en `/u/demo?src=qr`, el `href` de «Guardar contacto» termina en `?src=qr`.

### SCAN-13 · vCard: la nota no recuerda dónde os conocisteis y los nombres españoles compuestos se parten mal
- **Severidad:** BAJA
- **Dónde:** `src/lib/card/vcard.ts:114-118` (`splitName`) y `:158` (NOTE).
- **Qué pasa:**
  - Dentro de un mes, Javier abrirá «Alex Rivera» en Contactos y no sabrá de qué lo conoce.
  - «Ana María López Gil» se guarda con el nombre «Ana» y los apellidos «María López Gil».
- **Propuesta:**
  - Añade al final de la NOTE: «Guardado con PassMe el 05/10/2026 · getpassme.com/u/alex» (fecha del servidor, hora de Madrid).
  - En `splitName`, con 3 palabras o más, toma las **dos últimas** como apellidos («Ana María» / «López Gil»). Sigue siendo una heurística, pero acierta mucho más en España.
- **Criterio de aceptación:** la vCard de «Ana María López Gil» tiene `N:López Gil;Ana María;;;` y la NOTE incluye la fecha.

### SCAN-14 · Nombre muy largo: la cabecera crece a 580 px y los compuestos se cortan feo
- **Severidad:** BAJA
- **Dónde:** `src/components/card/profile-card.tsx:31-36` y `:104`.
- **Qué pasa:** con 5 palabras, el nombre ocupa 5 líneas a 43 px y empuja «Guardar contacto» fuera de la primera pantalla. «Maximiliano-Bartolomé» se corta antes del guion (`29-simulado-palabra-larga-360.png`).
- **Propuesta:** tamaño según la longitud: con más de 24 caracteres, `text-[2.1rem]`, y con más de 36, `text-[1.75rem]`. Añade `text-wrap: balance` y `hyphens: manual`, cortando solo en espacios o tras el guion.
- **Criterio de aceptación:** a 360 px, con el nombre de 52 caracteres, «Guardar contacto» se ve en la primera pantalla de 780 px de alto.

### SCAN-15 · Escritorio: no hay forma de pasarse la tarjeta al móvil
- **Severidad:** BAJA
- **Dónde:** `src/app/u/[slug]/page.tsx:54` (una sola columna de 440 px en cualquier ancho).
- **Qué pasa:** quien abre el enlace en un ordenador (por ejemplo, le llegó por email) ve una columna estrecha con 500 px vacíos a cada lado. «Guardar contacto» descarga un `.vcf` en el PC, cuando lo que quiere es tenerlo en el móvil (`08-escritorio-1440-viewport.png`).
- **Propuesta:** a partir de 1024 px, una columna lateral fija con el QR de la tarjeta (el componente `QrCode` ya existe) y el texto «Escanéalo con tu móvil para guardar a Alex».
- **Criterio de aceptación:** a 1440 px se ve un QR que abre `/u/<slug>?src=qr`.

### SCAN-16 · La página 404 suena a error técnico y solo ofrece crear una tarjeta
- **Severidad:** BAJA
- **Dónde:** `src/app/u/[slug]/not-found.tsx:236-243`.
- **Qué pasa:** «ERROR 404» no le dice nada a Javier y le hace desconfiar. La única salida es crearse una tarjeta, cuando lo que buscaba era la de otra persona. Una tarjeta despublicada (pausada) muestra «no existe».
- **Propuesta:**
  - Quita la etiqueta «Error 404».
  - Título «Esta tarjeta no está disponible», más neutro y válido también para las despublicadas.
  - Botón principal «Ir a PassMe» y, como enlace secundario, «Crear mi propia tarjeta».
- **Criterio de aceptación:** la 404 no contiene la palabra «Error» y ofrece dos salidas.

### SCAN-17 · Botón de compartir: el icono es de iOS y su utilidad para quien escanea es dudosa
- **Severidad:** BAJA
- **Dónde:** `src/components/card/profile-actions.tsx:373-402`; `profile-card.tsx:158`.
- **Qué pasa:** en Android, el icono de cuadrado con flecha no significa «compartir». En escritorio, la única confirmación es que el icono pasa a un check durante 1,8 s, sin texto. Ocupa el sitio contiguo a la acción principal.
- **Propuesta:**
  - Muestra el icono según la plataforma (`Share2`, los tres nodos, en Android y escritorio; `Share` en iOS).
  - En escritorio, un aviso «Enlace copiado» bajo el botón.
  - Opcional: llévalo a una fila de texto bajo los enlaces, «Pasarle esta tarjeta a alguien», y deja «Guardar contacto» a todo el ancho.
- **Criterio de aceptación:** en Pixel 7 se ve el icono de compartir de Android. En escritorio aparece el texto «Enlace copiado».

### SCAN-18 · En horizontal, la primera pantalla no tiene ninguna acción
- **Severidad:** BAJA
- **Dónde:** `profile-card.tsx:79-123` (cabecera de alto fijo, con `mt-10`).
- **Qué pasa:** en horizontal (839×412), lo único visible es la cabecera naranja (`07-horizontal-viewport.png`).
- **Propuesta:** con `@media (max-height: 500px)`, reduce `mt-10` a `mt-4` y el nombre a `2rem`.
- **Criterio de aceptación:** en el Pixel 7 en horizontal, «Guardar contacto» asoma en la primera pantalla.

## 4. Cosas que están bien (no romper)

- **Carga rápida** (~0,7 s). Nada que instalar ni registro para ver la tarjeta. Título de pestaña con el nombre de la persona.
- El **nombre es el protagonista** de la cabecera, con buena legibilidad. El naranja tiene suficiente contraste con el texto café.
- Filas de enlaces de 68 px de alto: dianas cómodas. Iconos claros y reconocibles (email, LinkedIn, globo, Instagram).
- **Las validaciones conservan lo escrito** tras un error, porque `values` repuebla los campos. Los mensajes de error son humanos («Dinos cómo te llamas.»).
- El autofocus en Nombre al abrir el formulario y «Alex recibirá lo que escribas aquí. Nada más.» generan confianza.
- **Reciprocidad real:** «Crear la mía con estos datos» llega a `/crear` con nombre y móvil, y con «Vienes de la tarjeta de Alex Rivera».
- En iPhone, la vCard se abre en línea con la hoja nativa. La vCard solo lleva enlaces visibles y añade la URL de PassMe con su etiqueta.
- El texto de la 404 («Pídele que te la enseñe de nuevo») es el adecuado para una feria.
- No hay desbordamiento horizontal de página en ningún ancho probado. Con el modo oscuro del sistema, la página se mantiene clara y coherente.
- El QR SVG tiene margen y buen contraste, y codifica `?src=qr`.

## 5. «Ya lo había pensado» (lo que un usuario avanzado esperaría)

| Idea | Dónde debería vivir para no ensuciar el camino simple |
|---|---|
| **WhatsApp directo** desde el móvil de la tarjeta, sin que el dueño tenga que añadir un enlace aparte | Botón de icono junto a la fila «Móvil» (ver SCAN-10) |
| **«Guardado el 05/10 en…»**: recordar dónde se conocieron en la nota del contacto | Automático en la vCard (SCAN-13). Si el dueño activa un «modo evento», usar el nombre del evento |
| **Respuesta inmediata del dueño**: tras dejar tu contacto, que Alex reciba un aviso con botón «Llamar a Javier» | Email al dueño (hoy sin datos por seguridad). Mejor como notificación del pase de Wallet («Javier te ha dejado su contacto») |
| **Pasar la tarjeta al móvil** desde un ordenador | QR lateral solo en escritorio (SCAN-15) |
| **Recibir tu propia vCard**: «Mándame la tarjeta de Alex por WhatsApp/SMS» para quien no sabe abrir archivos | Enlace pequeño bajo el aviso de descarga de Android (SCAN-02): «Enviármela por WhatsApp», con `wa.me/?text=<url>` hacia sí mismo |
| **Idioma**: un visitante extranjero en una feria internacional | Detectar `Accept-Language` y traducir solo la interfaz de la página pública; un selector «ES/EN» en el pie |
| **Descargar el QR en PNG**: el SVG no se abre en la galería ni en WhatsApp de Android | Editor → Wallet, junto a la descarga SVG actual (para el dueño, no para el visitante) |
| **Volver a la tarjeta de Alex** días después: la vCard tiene la URL, pero en el móvil se pierde | Tras guardar, «Añadir a la pantalla de inicio» no tiene sentido. Mejor que el pase propio de Javier tenga un apartado «Personas que he guardado», como función futura |
| **Tarjeta pausada** frente a borrada: el visitante no distingue | Si el dueño despublica, la página podría mostrar el nombre y «Esta tarjeta está en pausa», si el dueño lo permite (opción en Publicación) |

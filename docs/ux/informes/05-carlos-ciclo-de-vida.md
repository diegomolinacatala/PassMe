# Auditoría UX — Carlos (ciclo de vida fuera del primer intercambio)

Capturas: en el scratchpad de la sesión de auditoría del 05/10/2026 (no incluidas en el repo; las rutas `*.png` de abajo son solo referencia). Scripts: `shots1.mjs`, `shots2.mjs`, `login.mjs`, `editor.mjs`, `misc.mjs`.

## 1. Persona y contexto

Carlos, 38 años, organiza eventos. Es escéptico y le preocupa la privacidad. Usa un Pixel 7 (Android, Chrome) y un portátil de 1440×900. Nadie le ha pasado un enlace: le han hablado de PassMe y escribe la dirección a mano. Quiere saber qué es, qué hace con sus datos y si puede fiarse. Después quiere volver a entrar otro día, llevar el pase en la cartera, enseñar su QR 50 veces en una noche, saber a quién conoció ese día y, si un día se cansa, borrarlo todo sin dejar rastro.

## 2. Recorrido narrado

### 2.1 Landing `/` (móvil y escritorio)
- **Primeros 5 s, en el móvil** (`m01-landing-fold.png`): el titular «Tu tarjeta de visita, *en la cartera* del móvil» se entiende al instante. «Crear mi tarjeta gratis» es la acción clara. Pero el subtítulo empieza con «Doble clic al botón lateral»: eso es un gesto de iPhone. En su Pixel, el doble toque al botón de encendido abre la cámara. Carlos piensa: «esto no es para Android». En el primer pantallazo del móvil no sale el producto (el teléfono de muestra empieza hacia los 750 px).
- **Precio**: dice «gratis» en el botón y en el bloque final. En `/terminos` lee «Mientras sea una versión inicial el servicio es gratuito», y el escéptico concluye que algún día lo van a cobrar.
- **¿Por qué esto y no papel, Linktree o NameDrop?** Ninguna sección lo responde. «Siempre al día» (cambias de trabajo y el pase se actualiza solo) es el mejor argumento contra el papel, pero aparece en la 6.ª sección.
- **Secciones** (`mland-00…08.png`): hero → marquesina de redes (decorativa, `aria-hidden`) → Cómo funciona (3 pasos) → Tu diseño (temas, motivos, letras) → Privacidad → Siempre al día → CTA final → footer. Mide 7.271 px en el Pixel (≈8,7 pantallas). No hay preguntas frecuentes.
- **Demostración real**: el QR del teléfono de muestra es real y lleva a `/u/demo?src=qr`. En el escritorio es la mejor demo posible (escanearlo con tu propio móvil), pero no se dice en ningún sitio. «Ver un ejemplo» abre `/u/demo` en la misma pestaña.
- **Escritorio** (`d01-landing-fold.png`): muy bien resuelto. El nav tiene Cómo funciona · Privacidad · Ejemplo · Entrar · Crear mi tarjeta.
- **Header en móviles estrechos** (`m60-header-375.png`): por debajo de 400 px, **«Entrar» desaparece**. Queda solo «Crear mi tarjeta».

### 2.2 Confianza y privacidad
- La sección «Tú decides *qué* se ve» de la landing (`mland-05.png`) es lo que más tranquiliza a Carlos («lo oculto no sale del servidor», «sin IPs»).
- `/privacidad` en el móvil (`mpriv-00…03.png`) mide 5.250 px y tiene 9 secciones numeradas, sin índice ni resumen arriba. Para quien busque «¿cuándo se borra?», no hay atajo. La fecha dice «septiembre de 2026», aunque la sección de reuniones se añadió el 2 de octubre (`src/lib/legal.ts:30`).
- Lo que se pide al crear: nombre, un contacto y el email. Bien explicado en `/crear` («Solo te pediremos tu email para guardarla»).
- «Nadie necesita la app»: lo dicen «0 apps que instalar» y «Sin apps que instalar». No queda claro si se refiere a quien escanea, a ti o a los dos.

### 2.3 Vuelve días después desde otro móvil (`/login`)
- Desde la landing en el Pixel 7 (412 px): toca «Entrar» (1 toque) → `/login` con el campo de email ya enfocado (`m11-login-arrive.png`). Bien.
- Escribe mal: `carlos@gmial` → «Introduce un email válido.» (`m12-login-bad-email.png`). Correcto.
- Escribe `carlos@gmial.com` (errata con formato válido): **se acepta sin avisar** y pasa a la pantalla del código (`m13-login-code-step.png`). En producción, Supabase crearía una **cuenta nueva** (`shouldCreateUser: true`, `src/app/login/actions.ts:197`), y `/dashboard` le mandaría a `/crear` (`src/app/dashboard/page.tsx:120`). Carlos creería que su tarjeta ha desaparecido.
- Código erróneo: las casillas se ponen en rojo y sale «Código incorrecto o caducado.» (`m14-login-wrong-code.png`). Bien. «Cambiar» vuelve al email. «Reenviar en 0:59» y «Abrir Gmail» funcionan bien.
- Código correcto: lleva a `/dashboard` en ~350 ms (`m16-after-login.png`). Total: **4–5 toques más el email escrito**.
- **¿Dónde aterriza?** En el editor «Tu tarjeta, a tu manera.», con una vista previa pequeña del pase arriba. Para **añadir el pase** a la cartera tiene que bajar **5.178 px** (≈6 pantallas). Para «Cerrar sesión» o «Eliminar», 6.966 px (las posiciones las mide `login.mjs`).
- «Continuar con Google» existe en código (`src/components/auth/email-code-auth.tsx:144`), debajo del botón de email, pero solo aparece si `isGoogleAuthEnabled()`. Hoy no está activo en producción (paso manual 5 del CLAUDE.md).
- Desde **su propia tarjeta pública** `/u/<slug>`, el único botón es «Crea la tuya gratis» (`m50-public-demo.png`). No hay «Entrar» ni «Editar mi tarjeta».
- Sesión: se mantiene (Supabase con cookies). Si va a `/login` con la sesión abierta, el proxy le redirige a `/dashboard` (`src/proxy.ts:87`). Bien.

### 2.4 Wallet
- Bienvenida en Android (`m28-welcome-android.png`): muestra **solo** «Añadir a Google Wallet». Está bien filtrado por plataforma, pero en producción Google Wallet **todavía no funciona** (página de Google con «Se ha producido un error»). Para Carlos, el único botón de la cartera lleva a un error.
- Editor, sección 05 «A la cartera» (`m23-editor-cartera.png`): en el Pixel salen **los dos botones**, Apple primero, aunque está en Android. En Android, «Añadir a Apple Wallet» descarga un `.pkpass` que no sabe abrir.
- En el escritorio, los botones de Apple y Google son los protagonistas, y el QR para pasarlo al móvil («¿Estás en el ordenador?») queda debajo como secundario. En Windows, el botón de Apple descarga un archivo inútil.
- `/wallet` sin token o caducado (`m31-wallet.png`): pone «Este enlace ha caducado» **sin ningún botón**. Es un callejón sin salida en el móvil.
- `/api/pass/apple|google` sin sesión responde con **JSON en crudo**: `{"error":"unauthorized","message":"Inicia sesión para descargar tu pase."}`. Pasa con una pestaña vieja o con la sesión caducada en el móvil.
- No se explica qué es un pase ni por qué tenerlo (pantalla de bloqueo, sin conexión, sin abrir el navegador). Solo hay «Y para la próxima, llévala en la cartera del móvil».

### 2.5 Fin del ciclo
- **Despublicar** (`m21-editor-unpublish.png`): es un interruptor arriba a la derecha de «04 Publicación», sin confirmación. El texto avisa: «Despublicada: el enlace y el QR mostrarán «no encontrada»». Al guardar, el pase se queda igual en la cartera, con su QR, que ahora lleva a «Esta tarjeta no existe». No se marca como anulado.
- **Cambiar el enlace** (`m22-editor-slug.png`): «Si lo cambias, el enlace antiguo seguirá llevando a tu tarjeta y los pases se actualizan solos.» Está bien resuelto: el historial de enlaces redirige y queda reservado a su dueño (`supabase/migrations/20260929120000_launch_hardening.sql:25`).
- **Cerrar sesión**: está al fondo de «09 Cuenta» y en demo no se ve (`src/components/editor/account-panel.tsx:182`). Llama a `supabase.auth.signOut()` sin `scope` (`src/app/auth/signout/route.ts:7`): por defecto es **global** y cierra la sesión en **todos** sus dispositivos sin avisar.
- **Borrar la cuenta** (`m27-editor-cuenta.png`; en demo está deshabilitado): pide escribir BORRAR, que es una buena fricción. El texto dice «Borraremos tu tarjeta, tu foto y tus estadísticas», pero no menciona los contactos recibidos ni las reuniones, que también se borran según `/privacidad`. No ofrece descargarlos antes. Después del borrado redirige a `/?cuenta=borrada` (`src/app/dashboard/actions.ts:170`), pero la landing **no lee ese parámetro**: no hay confirmación (`d03-landing-cuenta-borrada.png`). Si falla, sale un mensaje técnico, «Falta SUPABASE_SECRET_KEY en el servidor.» (`actions.ts:158`).

### 2.6 En un evento, como organizador
- Para enseñar el QR 50 veces: con el pase de Apple Wallet es perfecto (doble clic). **En Android hoy no hay pase**, así que la única pantalla con un QR grande es la bienvenida, y solo aparece con `?nueva=1` la primera vez (`src/app/dashboard/page.tsx:61`).
- Si Carlos vuelve, le quedan dos opciones: la vista previa del editor (QR de ~130 px sobre fondo naranja, con la barra «Todo guardado» casi encima) o su página pública, que **no tiene QR**.
- No hay modo pantalla completa, ni wake lock (búsqueda en `src`: 0 resultados), ni un recordatorio de subir el brillo.
- En horizontal, la barra de guardado tapa el QR de la bienvenida (`m71-welcome-landscape.png`).
- «¿A quién conocí ese día?»: el panel «Contactos recibidos» lista nombre, empresa, fecha y origen, y exporta CSV/vCard. Pero no se puede filtrar por día ni por evento, y quien solo escaneó y guardó no deja rastro (es lo correcto por privacidad, pero conviene decirlo).

### 2.7 Metadatos
- Título de pestaña correcto: «Mi tarjeta · PassMe», «Entrar · PassMe»… La página 404 genérica hereda el título de la landing («PassMe — Tu tarjeta de visita…»).
- Favicon: hay `icon.svg` y `apple-icon.png`. `/favicon.ico` → 404 (algunos lectores de RSS, Slack y Windows lo piden).
- `manifest.webmanifest` → **404**: no hay PWA. Al «Añadir a pantalla de inicio» en Android se crea un acceso genérico con el título largo, que abre la landing en lugar de su QR.
- OG: `/opengraph-image` (`og-home.png`) y `/u/demo/opengraph-image` (`og-demo.png`) están muy cuidadas.
- 404 de tarjeta: «Esta tarjeta no existe… su dueño la haya retirado», con «Crear mi propia tarjeta». Bien.
- Modo oscuro: la web se queda en claro (`m70-landing-dark.png`), de forma coherente. Con movimiento reducido, la marquesina se detiene (`globals.css:131`). Bien.

## 3. Hallazgos

### LIFE-01 · En Android, el único botón de la cartera lleva a un error (Google Wallet no funciona en producción)
- **Severidad**: ALTA (BLOQUEANTE para el objetivo «llevarla en la cartera» en Android)
- **Dónde**: `/dashboard?nueva=1`, en `src/components/editor/welcome-panel.tsx:47,127-135`; `/dashboard` 05, en `src/components/editor/wallet-panel.tsx:88`; `/wallet`, en `src/app/wallet/page.tsx:42`; landing, en `src/app/page.tsx:26`, `src/components/landing/sections.tsx:204` y `:241` («iPhone y Android»).
- **Qué pasa**: en el Pixel, la bienvenida solo ofrece «Añadir a Google Wallet» (`m28-welcome-android.png`). En producción, Google responde «Se ha producido un error» (CLAUDE.md, paso manual 4). Mientras tanto, la landing promete «Apple Wallet & Google Wallet», «Actualización automática en Apple y Google Wallet» e «iPhone y Android». Para el escéptico, es la prueba de que «esto no funciona».
- **Propuesta**:
  1. Añadir una variable `GOOGLE_WALLET_LIVE` (por defecto `false`). Con ella apagada, en el editor, la bienvenida y `/wallet` se sustituye el botón por una fila no clicable: «Google Wallet · muy pronto». Debajo, una acción útil: **«Guardar mi QR en el móvil»**, que abre la pantalla de QR de LIFE-03 y explica cómo anclarla a la pantalla de inicio.
  2. En la landing, mientras siga apagada: eyebrow «Pásame tu contacto · Apple Wallet · Android, muy pronto en Google Wallet». En el bloque final, cambiar «iPhone y Android» por «Funciona en cualquier móvil con cámara» (verdad para quien escanea).
- **Criterio de aceptación**: con `GOOGLE_WALLET_LIVE=false`, ninguna pantalla enlaza a `/api/pass/google`. Un Android que acaba de crear su tarjeta ve una acción que funciona.

### LIFE-02 · El usuario que vuelve aterriza en el editor y su pase o QR está a 6 pantallas
- **Severidad**: ALTA
- **Dónde**: `/dashboard`, en `src/components/editor/card-editor.tsx:185-351` (la columna `aside` con 05 «A la cartera» se apila debajo de 01–04 en el móvil).
- **Qué pasa**: tras entrar (`m16-after-login.png`), «Añadir a Apple/Google Wallet» queda a 5.178 px. «Ver mi tarjeta», «Copiar enlace» y «QR para imprimir», a 5.366–5.410 px. Lo que quiere quien vuelve («enséñame mi QR», «ponlo en mi cartera nueva») está debajo de cuatro formularios.
- **Propuesta**: en el móvil, encima de la vista previa, una franja fija de dos acciones antes de «01 Quién eres»:
  - **«Enseñar mi QR»** (botón principal, abre LIFE-03).
  - **«Añadir a [Apple|Google] Wallet»** (solo el de la plataforma; ver LIFE-04).

  «Ver mi tarjeta», «Copiar enlace» y «QR para imprimir» pasan a un menú «Compartir ▾» junto al enlace `/u/slug` del header. En el escritorio no cambia nada, porque el aside ya está a la vista.
- **Criterio de aceptación**: en el Pixel 7, tras iniciar sesión, «Enseñar mi QR» y el botón de la cartera están visibles sin hacer scroll (y < 839 px).

### LIFE-03 · No hay una pantalla «Enseñar mi QR» para usar en un evento
- **Severidad**: ALTA (lo es para un organizador y para todo Android hasta que funcione Google Wallet)
- **Dónde**: no existe. La bienvenida solo sale una vez (`src/app/dashboard/page.tsx:61`). La página pública no tiene QR (`src/app/u/[slug]/page.tsx`).
- **Qué pasa**: para enseñar el QR 50 veces, Carlos no tiene una vista de QR a pantalla completa, con el brillo alto y la pantalla siempre encendida. En horizontal, la barra de guardado tapa el QR (`m71-welcome-landscape.png`).
- **Propuesta**: una ruta nueva `/dashboard/qr` (con sesión) que:
  - Muestre el QR a pantalla completa en blanco puro, con el nombre debajo y sin barra de guardado.
  - Pida `navigator.wakeLock.request("screen")` y vuelva a pedirlo en `visibilitychange`.
  - Muestre una pista: «Sube el brillo para que se lea a la primera».
  - Tenga un botón «Compartir enlace» (Web Share) por si el otro no puede escanear.

  Se llega desde LIFE-02 y desde la bienvenida (que pasa a reutilizar su `figure`). Con el `manifest` de LIFE-12, `start_url: "/dashboard/qr"` convierte el icono de la pantalla de inicio en «mi QR en un toque».
- **Criterio de aceptación**: desde el icono en la pantalla de inicio de Android, el QR aparece en ≤ 1 toque. La pantalla no se apaga en 2 min sin tocarla y nada tapa el QR en vertical ni en horizontal.

### LIFE-04 · El panel «A la cartera» del editor ignora la plataforma
- **Severidad**: MEDIA
- **Dónde**: `src/components/editor/wallet-panel.tsx:86-89` frente a `welcome-panel.tsx:46-47` (que sí filtra).
- **Qué pasa**: en el Pixel salen Apple primero y Google después (`m23-editor-cartera.png`). En Windows salen los dos como acción principal, aunque ninguno sirve en el ordenador. El paso útil («¿Estás en el ordenador?») queda debajo. Incoherente con la bienvenida.
- **Propuesta**: pasar `platform` (de `detectPlatform`) a `WalletPanel`.
  - Android: solo Google (o la alternativa de LIFE-01).
  - iOS: solo Apple.
  - `other` (ordenador): el bloque de QR para pasarlo al móvil va primero, con el texto «Escanéalo con tu móvil para añadir el pase», y los dos botones quedan en un enlace pequeño «Descargar el archivo del pase».

  En todas, un enlace «¿Otro móvil?» que muestre ambos.
- **Criterio de aceptación**: el Pixel ve un solo botón de cartera. En el escritorio, lo primero es el QR para pasarlo al móvil.

### LIFE-05 · Un email con errata crea una cuenta nueva y la tarjeta «desaparece»
- **Severidad**: ALTA
- **Dónde**: `/login`, en `src/app/login/actions.ts:195-202` (`shouldCreateUser: true`) y `src/app/dashboard/page.tsx:120` (redirige a `/crear`).
- **Qué pasa**: `carlos@gmial.com` o el email del trabajo en lugar del personal se aceptan (`m13-login-code-step.png`). En producción crean una cuenta vacía y llevan a «Tu tarjeta, en un minuto». Carlos piensa que ha perdido su tarjeta y acaba creando una segunda. Además, «Si es tu primera vez, se crea tu cuenta al entrar» (`login/page.tsx:67`) normaliza el problema.
- **Propuesta**:
  1. Sugerir correcciones de dominio en el cliente antes de enviar (gmial/gmai/hotmial/outlok…): «¿Querías decir carlos@**gmail.com**?», con un botón «Sí, corregir».
  2. Desde `/login`, `shouldCreateUser: false`. Si la cuenta no existe, quedarse en la pantalla del email con: «No hay ninguna tarjeta con carlos@gmial.com. ¿Lo has escrito bien? · Crear una tarjeta nueva con este email». La creación de cuentas solo ocurre en `/crear`.
  3. En `/crear` con sesión (`mode === "member"`), cambiar «Con tu cuenta X.» por: «Has entrado como **X**. ¿Ya tenías tarjeta con otro email? Cerrar sesión y entrar con ese».
- **Criterio de aceptación**: entrar desde `/login` con un email sin cuenta no crea ninguna cuenta y muestra el aviso con las dos salidas. `gmial.com` muestra la sugerencia.

### LIFE-06 · «Entrar» desaparece del header en móviles de menos de 400 px
- **Severidad**: ALTA (en móviles de 360/375 px, que son muy comunes)
- **Dónde**: `src/components/landing/site-header.tsx:284` (`hidden … min-[400px]:inline-flex`).
- **Qué pasa**: a 375 px solo queda «Crear mi tarjeta» (`m60-header-375.png`). Quien vuelve tiene que bajar 7.000 px hasta el footer o adivinar que `/crear` tiene «Entrar» arriba.
- **Propuesta**: por debajo de 400 px, mantener «Entrar» como enlace de texto y acortar el botón a «Crear» (o reducir el logo a solo la marca). Nunca esconder «Entrar».
- **Criterio de aceptación**: a 320, 360 y 375 px se ven «Entrar» y el botón de crear sin desbordar.

### LIFE-07 · El dueño no se reconoce en su propia página pública ni en el reverso de su pase
- **Severidad**: MEDIA
- **Dónde**: `src/components/card/create-yours.tsx:14-31` (siempre «Crea la tuya gratis») y `src/lib/pass/apple.ts:67-72` (reverso del pase: «Hecho con PassMe · Crea tu tarjeta gratis»).
- **Qué pasa**: Carlos abre su `/u/carlos` en un móvil nuevo y solo le ofrecen crear otra tarjeta. El reverso del pase solo lo ve su dueño, y le invita a «crear tu tarjeta gratis». En ninguno de los dos sitios está el camino natural para editarla.
- **Propuesta**:
  1. En `CreateYoursBar`, si hay sesión y `card.slug` es la del usuario, sustituir el botón por «Editar mi tarjeta» → `/dashboard`. Ocultar `CreateYoursCta` y mostrar en su lugar «Así la ven los demás · Editar».
  2. Sin sesión, añadir en el footer de la tarjeta: «¿Es tu tarjeta? Entrar».
  3. En el reverso del pase de Apple, cambiar el campo `passme` por la etiqueta «Tu tarjeta», el valor `${site}/dashboard` y el enlace «Editar mi tarjeta».
- **Criterio de aceptación**: con sesión iniciada, en `/u/<mi-slug>` no aparece «Crea la tuya». El reverso del pase enlaza a `/dashboard`.

### LIFE-08 · Borrar la cuenta: el texto no dice todo lo que se borra, no deja exportar antes y no confirma después
- **Severidad**: MEDIA
- **Dónde**: `src/components/editor/account-panel.tsx:202-205`; `src/app/dashboard/actions.ts:158,170`; `src/app/page.tsx` (no lee `?cuenta=borrada`).
- **Qué pasa**: el texto dice «tu tarjeta, tu foto y tus estadísticas», pero también se borran los contactos recibidos y las reuniones (`/privacidad`, «Cuánto tiempo»). A quien le importa la privacidad le importa la exactitud. Las reuniones confirmadas con otras personas desaparecen sin avisar a nadie. Después del borrado, la landing no confirma nada. Si falla, sale «Falta SUPABASE_SECRET_KEY en el servidor.».
- **Propuesta**:
  - Texto nuevo: «Esto no se puede deshacer. Borraremos tu tarjeta, tu foto, tus estadísticas, los N contactos que te han dejado y tus reuniones. Tu enlace /u/slug dejará de funcionar y quedará reservado 90 días. El pase que tengas en la cartera dejará de actualizarse: quítalo desde la app Cartera.»
  - Si N > 0, mostrar antes el enlace «Descargar mis contactos (.csv)».
  - Si hay reuniones confirmadas futuras, avisar: «Tienes 1 reunión confirmada: cancélala antes para que le llegue el aviso».
  - En la landing, leer `?cuenta=borrada` y mostrar el aviso «Tu cuenta y tu tarjeta se han borrado. Gracias por probar PassMe.».
  - Error genérico: «No hemos podido borrar la cuenta. Escríbenos a <contacto> y lo hacemos a mano.».
- **Criterio de aceptación**: el texto coincide con `/privacidad`, la exportación es accesible desde el diálogo y tras borrar se ve la confirmación.

### LIFE-09 · Despublicar o borrar no actualiza el pase: sigue mostrando un QR que lleva a «no existe»
- **Severidad**: MEDIA
- **Dónde**: `src/app/api/wallet/v1/passes/[passTypeId]/[serialNumber]/route.ts:25` (devuelve 404 sin anular), `src/lib/pass/google.ts:91` (`state: "ACTIVE"` siempre); interruptor en `card-editor.tsx:261`.
- **Qué pasa**: Carlos despublica para un tiempo y su pase sigue en la cartera, con un QR que acaba en 404. El interruptor no pide confirmación, aunque rompe todos los QR impresos y los pases (`m21-editor-unpublish.png`).
- **Propuesta**:
  - Al despublicar, enviar un push con un pase que lleve `voided: true` y el aviso «Tarjeta en pausa», o `state: "INACTIVE"` en Google. Al volver a publicar, restaurarlo.
  - En el borrado, empujar el pase anulado antes de eliminar los registros.
  - Al desactivar el interruptor, mostrar un diálogo: «¿Despublicar tu tarjeta? Quien escanee tu QR (también los impresos) verá «no encontrada» y tu pase quedará en pausa. Puedes volver a publicarla cuando quieras.» Botones: [Despublicar] [Cancelar].
- **Criterio de aceptación**: tras despublicar y guardar, el pase de Apple aparece como anulado en el iPhone y vuelve a activo al republicar. Hay confirmación antes de despublicar.

### LIFE-10 · «Cerrar sesión» cierra la sesión en todos los dispositivos y está al fondo de la página
- **Severidad**: MEDIA
- **Dónde**: `src/app/auth/signout/route.ts:7` (`signOut()` global por defecto) y `account-panel.tsx:182-188` (sección 09, a ~7.000 px). El header del editor (`dashboard/page.tsx:27-42`) no tiene menú de cuenta.
- **Qué pasa**: si cierra sesión en el portátil del recinto, también se le cierra en el móvil justo antes de enseñar el QR. Además, nadie encuentra «Cerrar sesión» sin bajar todo el editor.
- **Propuesta**:
  - Cambiar a `signOut({ scope: "local" })` y añadir, en Cuenta, un enlace secundario «Cerrar sesión en todos mis dispositivos» (scope global).
  - En el header del editor, añadir a la derecha un avatar o las iniciales con un menú: «Ver mi tarjeta ↗ · Compartir · Cerrar sesión · Cuenta y privacidad».
- **Criterio de aceptación**: cerrar sesión en el navegador A no la cierra en B. «Cerrar sesión» se alcanza en ≤ 2 toques desde la parte de arriba del editor.

### LIFE-11 · Callejones sin salida en `/wallet` caducado y JSON en crudo en `/api/pass/*`
- **Severidad**: MEDIA
- **Dónde**: `src/app/wallet/page.tsx:14-21`, `src/app/api/pass/google/route.ts:37-41` y `src/app/api/pass/apple/route.ts` (mismo patrón).
- **Qué pasa**: «Este enlace ha caducado» no tiene ningún botón (`m31-wallet.png`). Con la sesión caducada en el móvil, tocar «Añadir a Apple Wallet» muestra `{"error":"unauthorized",…}`.
- **Propuesta**:
  - En `Expired`, añadir el botón «Entrar y añadir el pase» → `/login?next=/dashboard`, y cambiar el texto a: «Este QR ya no vale (duran 30 minutos). Entra con tu email en este móvil y añade el pase desde ahí.».
  - En las rutas de pases, cuando la petición acepte `text/html` (navegación), redirigir: 401 → `/login?next=/dashboard`; 404 o 409 → `/dashboard?pase=error`, con un aviso legible. Dejar el JSON para `fetch`.
- **Criterio de aceptación**: ninguna navegación de usuario muestra JSON. El `/wallet` caducado tiene una acción.

### LIFE-12 · Sin manifest ni PWA: «Añadir a pantalla de inicio» no lleva al QR
- **Severidad**: MEDIA (es la alternativa natural mientras Google Wallet no funcione)
- **Dónde**: no existe `src/app/manifest.ts`; `/manifest.webmanifest` y `/favicon.ico` → 404.
- **Propuesta**: crear `src/app/manifest.ts` con:
  - `name: "PassMe"`, `short_name: "PassMe"`, `start_url: "/dashboard/qr"`, `display: "standalone"`, `background_color` y `theme_color` `#f3efe6`.
  - Iconos de 192 y 512 px (también maskable) a partir de `icon.svg`.

  Añadir también un `favicon.ico`. En la pantalla de LIFE-03, en Android, mostrar una pista que se pueda cerrar: «Añádela a tu pantalla de inicio: ⋮ → Añadir a pantalla de inicio».
- **Criterio de aceptación**: Lighthouse marca la app como instalable. El icono abre el QR en modo standalone.

### LIFE-13 · El subtítulo del hero es de iPhone y no explica por qué es mejor que las alternativas
- **Severidad**: MEDIA
- **Dónde**: `src/app/page.tsx:34-37` y `src/components/landing/sections.tsx:56`.
- **Qué pasa**: «Doble clic al botón lateral» no aplica a Android. La landing no responde a «¿por qué no papel, Linktree o NameDrop?», que es la pregunta del escéptico.
- **Propuesta**:
  - Nuevo subtítulo del hero: «Enseñas un QR y tu contacto aparece en su móvil, sea iPhone o Android. Nadie instala nada, y tú eliges qué datos se ven.».
  - En el paso 03, cambiar el texto a «En iPhone, doble clic al botón lateral y aparece tu pase; en cualquier móvil, abre tu QR con un toque…».
  - Añadir antes del CTA final un bloque **«Preguntas rápidas»** (acordeón `<details>`, 5 preguntas, cerradas por defecto):
    1. «¿La otra persona necesita una app?» → No, solo la cámara.
    2. «¿En qué se diferencia de NameDrop o de un Linktree?» → Funciona entre iPhone y Android, a distancia y con QR impreso. Tu contacto se guarda con un toque, decides qué se ve y el pase se actualiza solo.
    3. «¿Cuánto cuesta?» (ver LIFE-14).
    4. «¿Qué datos guardáis?» → enlace a `/privacidad`.
    5. «¿Y si me arrepiento?» → despublicar o borrar en un toque.
- **Criterio de aceptación**: el hero no menciona gestos de una sola plataforma. Hay una sección de preguntas con esas 5 respuestas.

### LIFE-14 · El precio es ambiguo: «gratis» en la landing y «gratuito mientras sea versión inicial» en los términos
- **Severidad**: MEDIA
- **Dónde**: `src/app/terminos/page.tsx:21` frente a `sections.tsx:241` y `create-yours.tsx:53`.
- **Qué pasa**: el escéptico lee los términos y concluye que lo van a cobrar.
- **Propuesta** (alineada con «Monetización» del CLAUDE.md: tarjeta y pase gratis para siempre):
  - Términos: «Tu tarjeta, tu QR y tu pase son gratis, para siempre. Si en el futuro añadimos funciones de pago, serán opcionales y nunca te cobraremos nada sin que lo aceptes.».
  - Landing: cambiar «Gratis» por «Gratis para siempre».
- **Criterio de aceptación**: los mismos términos en la landing, en `/crear` y en `/terminos`.

### LIFE-15 · Textos legales largos sin índice y con la fecha desactualizada
- **Severidad**: BAJA
- **Dónde**: `src/components/legal/legal-page.tsx:26-56` y `src/lib/legal.ts:30`.
- **Qué pasa**: `/privacidad` ocupa 6,3 pantallas en el móvil, sin índice ni resumen. Dice «septiembre de 2026» aunque cambió el 2/10.
- **Propuesta**:
  - Después del `intro`, añadir un bloque «En 30 segundos» con 4 viñetas: «Solo pedimos tu email»; «Lo oculto no sale del servidor»; «Sin cookies de seguimiento ni IPs en las estadísticas»; «Lo borras todo con un botón».
  - Añadir un índice con anclas a las 9 secciones (dar `id` a todas).
  - Actualizar la fecha a «octubre de 2026» y derivarla de un único sitio que se revise en cada PR que toque estas páginas.
  - Añadir un enlace «← Volver» además del logo.
- **Criterio de aceptación**: el índice salta a cada sección en el móvil y la fecha coincide con el último cambio.

### LIFE-16 · El QR de la landing es real, pero nadie lo dice
- **Severidad**: BAJA (oportunidad)
- **Dónde**: `src/components/landing/phone-showcase.tsx:385` («Acerca el QR a la cámara», dentro del teléfono de muestra).
- **Propuesta**: en el escritorio (`lg:`), poner debajo del teléfono de muestra una etiqueta fuera del mock: «Pruébalo: escanéalo con tu móvil →», que lleva a la tarjeta de ejemplo en tu propio teléfono. Es la demo interactiva más convincente posible, y sin código nuevo.
- **Criterio de aceptación**: la etiqueta se ve a 1440 px y el QR abre `/u/demo?src=qr`.

### LIFE-17 · La barra de guardado siempre está ahí y tapa contenido
- **Severidad**: BAJA
- **Dónde**: `card-editor.tsx:367-407`.
- **Qué pasa**: «Todo guardado · Guardar (deshabilitado)» ocupa el pie de la pantalla aunque no haya nada que guardar. Tapa la nota de la vista previa (`m16-after-login.png`) y el QR en horizontal (`m71-welcome-landscape.png`). Además muestra «⌘S» en Windows.
- **Propuesta**:
  - Ocultar la barra cuando `!dirty && status.kind === "idle"`. Que entre con animación al primer cambio y, tras «Guardado…», se vaya a los 3 s.
  - Mostrar «Ctrl S» si `navigator.platform` no es Mac.
  - Mientras la bienvenida esté abierta, no mostrar la barra.
- **Criterio de aceptación**: al cargar el editor sin cambios, no hay barra. En Windows se lee «Ctrl S».

### LIFE-18 · No se explica qué es un pase ni por qué tenerlo
- **Severidad**: BAJA
- **Dónde**: `wallet-panel.tsx:76-89` y `welcome-panel.tsx:116`.
- **Propuesta**: bajo el título «A la cartera», una línea: «Tu tarjeta como un pase más, junto a tus tarjetas y billetes: se abre sin conexión y sin buscarla, y se actualiza sola cuando cambias algo.».
- **Criterio de aceptación**: la frase está visible encima de los botones de la cartera.

### LIFE-19 · Detalles de metadatos
- **Severidad**: BAJA
- **Dónde**: `src/app/not-found.tsx` (sin `metadata`) y `site-header.tsx:270` (enlace «Privacidad» a `#privacidad`, mientras el footer lleva a `/privacidad`).
- **Propuesta**:
  - `export const metadata = { title: "Página no encontrada" }` en `not-found.tsx`.
  - En el header, renombrar el ancla a «Tus datos», o hacer que apunte a `/privacidad`, para que un mismo nombre no lleve a dos sitios distintos.
- **Criterio de aceptación**: la pestaña de un 404 dice «Página no encontrada · PassMe». No hay dos destinos distintos con el mismo nombre.

### LIFE-20 · En la landing con sesión iniciada, el header ofrece «Entrar» y «Crear»
- **Severidad**: BAJA
- **Dónde**: `site-header.tsx` (estático).
- **Qué pasa**: funciona, porque el proxy y `/crear` redirigen al editor, pero obliga a pensar.
- **Propuesta**: si hay cookie de sesión (comprobarlo en el servidor), mostrar un solo botón «Mi tarjeta» → `/dashboard` y quitar «Entrar» y «Crear mi tarjeta».
- **Criterio de aceptación**: con sesión iniciada, el header de `/` muestra solo «Mi tarjeta».

## 4. Cosas que están bien (no romper)
- **Login con código**: el campo de email llega enfocado y las 8 casillas autoenvían. «Cambiar», «Reenviar en 0:59», «Abrir Gmail», el error en rojo que se limpia al teclear y la redirección automática si el botón del email se abre en otra pestaña.
- **El proxy**: `/login` con sesión iniciada va a `/dashboard`, y `/crear` con tarjeta ya hecha también.
- **El historial de enlaces**: el antiguo redirige, queda reservado para su dueño y se explica en una línea («el enlace antiguo seguirá llevando a tu tarjeta»).
- **El borrado con «BORRAR» escrito** y el slug en cuarentena 90 días contra suplantaciones.
- **La sección de privacidad de la landing y la política, coherentes con el código**: IP con hash y clave, conservación que refleja `cleanup_expired_data()`, sin banner de cookies porque no hacen falta.
- **La bienvenida**: el QR grande, un solo botón de cartera según la plataforma y el texto con el nombre de quien te trajo.
- **Exportar los contactos recibidos** (CSV/vCard) y la confirmación antes de borrar un contacto.
- **Las imágenes OG** de la home y de cada tarjeta, el 404 de tarjeta con salida («Crear mi propia tarjeta») y el respeto a `prefers-reduced-motion`.
- **La landing en el escritorio**: jerarquía clara y una sola acción principal repetida de forma coherente («Crear mi tarjeta»).

## 5. «Ya lo había pensado» (lo que espera un usuario avanzado)
1. **Pantalla «Mi QR» con wake lock y acceso desde la pantalla de inicio** (LIFE-03 y LIFE-12). Vive en `/dashboard/qr` y no ensucia nada.
2. **Modo evento** (en el editor, un interruptor dentro de «Publicación → Más opciones», cerrado por defecto):
   - Nombre y fecha del evento.
   - Durante ese día, los contactos recibidos y las reuniones se etiquetan con el evento, y el pase de Apple añade `relevantDate` y `locations` para salir en la pantalla de bloqueo al llegar al recinto.
   - Al terminar, un email: «Ayer en <evento>: 12 visitas desde el QR, 4 contactos» (ya está en el backlog; aquí se concreta dónde vive).
3. **Filtro por día o evento en «Contactos recibidos»**, con exportación de ese día. Sería un selector encima de la lista; hoy solo hay «todos».
4. **Nota rápida tras enseñar el QR** («he conocido a Ana, de Kobalt»): un campo en `/dashboard/qr` que se guarda como contacto propio con fecha. Es la respuesta a «¿a quién conocí?» cuando el otro no deja sus datos.
5. **Sesiones y dispositivos** en Cuenta: «Este navegador · Pixel 7 · ahora», «Cerrar en todos».
6. **«Descargar todos mis datos (JSON)»** en Cuenta, para el derecho de portabilidad sin tener que escribir un email.
7. **Pausar la tarjeta hasta una fecha** («Despublicar hasta el lunes») como opción secundaria del diálogo de LIFE-09.
8. **QR para imprimir en PNG y PDF** además de SVG (hoy descarga `passme-<slug>-qr.svg`, que no se puede usar desde el móvil), con la URL corta debajo. En «Compartir ▾».
9. **Recordatorio del enlace de acceso**: en el email de bienvenida, «Guarda este email: para editar tu tarjeta, entra en getpassme.com/login con esta dirección».

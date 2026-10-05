# Auditoría UX de PassMe: plan de cambios para implementar

**Fecha:** 05/10/2026 · **Para:** el agente que va a implementar los cambios (otra conversación de este proyecto) · **Autor:** auditoría con 6 usuarios simulados sobre el modo demo.

> **Cómo usar este documento.** Es una especificación, no un informe para leer en diagonal. Está ordenado en **8 PRs** (sección 4). Cada cambio tiene un ID (`P1.3`…), los hallazgos de origen (`ONB-05`, `SCAN-01`…), los archivos, el cambio exacto y un criterio de aceptación verificable. Los informes completos de cada usuario, con más detalle y capturas citadas, están en [`docs/ux/informes/`](informes/). Si un ID de origen no te basta, búscalo allí.
>
> **Antes de empezar:** lee `CLAUDE.md`, `AGENTS.md`, `docs/BRAND.md` y la sección 2 de este documento (reglas). Las decisiones de la sección 3 son de Diego: **pregúntaselas antes de tocar los cambios marcados con ⚖️**. Para todo lo demás, actúa.

---

## 0. Resumen ejecutivo

PassMe ya hace bien lo difícil: la tarjeta pública carga en menos de 1 s y se entiende en 3, la vCard es limpia, el código de 8 cifras se autocompleta y se envía solo, la bienvenida tras el alta enseña el QR en grande, el editor de estilo usa la propia tarjeta del dueño, axe está limpio en 33 estados y la seguridad (enlaces firmados, texto fijo a direcciones sin verificar, topes de emails) no se nota. **No hay nada bloqueante en el flujo principal.**

Lo que falla es la **filosofía Apple**: hay pasos de más, botones que no dicen lo que hacen, cosas importantes enterradas y el mismo concepto con nombres distintos. Los 6 usuarios chocaron, por separado, con los mismos cinco problemas:

1. **No existe «Mi QR».** La prioridad nº 1 del producto (enseñar tu QR de vuelta) solo funciona la primera vez, en la bienvenida. Al volver, el QR es una miniatura de 112 px dentro de la vista previa, medio tapada por la barra de guardar, a la que se llega tras 6 pantallas de scroll en Android. Sin Google Wallet operativo, un usuario de Android **no tiene ninguna forma** de enseñar su QR en un evento.
2. **Se pierden datos y pasos.** El borrador de `/crear` se borra al recargar, el paso del código se pierde al ir a Gmail, y dos de los tres botones de «crear la mía» llegan con el formulario vacío aunque la página acaba de decir «Ya tenemos tus datos».
3. **«Crear mi tarjeta» no crea la tarjeta.** Lleva a otra pantalla que vuelve a pedir el email ya escrito y otro toque.
4. **El editor es una página de 7.262 px sin índice** (11 pantallas en el iPhone). Lo urgente (responder una reunión) está a 5.500 px, «Cerrar sesión» a 7.000 px, y la barra fija de guardar tapa campos, el QR y la bienvenida aunque no haya nada que guardar.
5. **Vocabulario incoherente.** «Contactos» significa 4 cosas, «enlace» 2, hay 6 textos para «Crear mi tarjeta», 4 para «Déjale tu contacto», y «Agendar reunión» convive con «Reservar cita».

**Toques medidos hoy frente al objetivo:**

| Tarea | Hoy | Objetivo | Cambios clave |
|---|---|---|---|
| Del enlace recibido a enseñar mi QR (caso realista, iPhone con app Gmail) | 7–8 toques + 5 campos + 2 scrolls | **3 toques + 2 campos, 0 scrolls** | P4.1, P4.2, P2.5 |
| Volver otro día y enseñar mi QR | no hay acción (scroll de 5.000 px) | **1 toque** (o 0 desde el icono de inicio) | P2.1, P2.2, P2.4 |
| Dejar mi contacto (nombre + móvil) en una tarjeta | 4 toques + 2 campos + scroll | **3 toques + 2 campos** | P5.6 |
| Proponer una reunión (camino feliz) | 6 toques + 2 campos + 3 scrolls | 5 toques + 2 campos | P6.x |
| Confirmar una reunión desde el email | 2 toques + 1 scroll (se promete «un toque») | 2 toques, **0 scrolls** | P6.3 |
| Responder una reunión desde el editor | scroll de 5.500 px | 1 toque desde un aviso arriba | P2.7, P7.1 |
| Cerrar sesión | scroll de 7.000 px | 2 toques (menú de cuenta) | P2.8 |

---

## 1. Cómo se hizo

- **Entorno:** build de producción en **modo demo** (`next build` sin variables de Supabase) servido en `localhost:3200`. Nada se guardó ni se envió. No se tocó producción.
- **Herramienta:** Playwright + Chromium emulando iPhone 15 (393×659), Pixel 7 (412×839), 360 px, 320 px, texto al 130 % y al 200 %, horizontal, `prefers-reduced-motion`, `prefers-color-scheme: dark` y escritorio 1440×900. Cada usuario leyó además el código de los componentes implicados, para citar `archivo:línea` y entender estados que no podía provocar. Los números de línea son de `main` en `42418c4`; **pueden haberse movido**: localiza por el contenido.
- **Usuarios simulados:**

| Informe | Persona | Recorrido | Prefijo | Hallazgos |
|---|---|---|---|---|
| [01](informes/01-lucia-onboarding.md) | Lucía, 34, comercial, iPhone, en un congreso | Recibe el enlace por WhatsApp → guarda el contacto → se crea la tarjeta → enseña su QR | `ONB` | 20 |
| [02](informes/02-javier-escaneo.md) | Javier, 58, autónomo, Android, gafas, desconfiado | Escanea el QR → revisa cada botón → guarda el contacto → deja el suyo | `SCAN` | 18 |
| [03](informes/03-marta-reuniones.md) | Marta (visitante) + Alex (dueño) + la invitación | «Agendar reunión» por los dos lados, emails y `.ics` | `MEET` | 26 |
| [04](informes/04-pablo-editor.md) | Pablo, 29, diseñador exigente, iPhone + escritorio | El editor entero, control a control | `EDIT` | 24 |
| [05](informes/05-carlos-ciclo-de-vida.md) | Carlos, 38, organizador escéptico, Android + portátil | Landing → privacidad → volver a entrar → Wallet → despublicar/borrar → uso en un evento | `LIFE` | 20 |
| [06](informes/06-elena-accesibilidad-coherencia.md) | Elena, 45, baja visión con VoiceOver + revisora del sistema de diseño | axe, teclado, zoom y contraste en todas las rutas; inventario de botones y glosario | `A11Y`, `COH` | 34 |

**Comprobado a mano en el código** (para que no arrastres errores de los informes): `rememberDetails` solo se llama en el `onClick` de un enlace (`contact-form.tsx`, `meeting-request.tsx`); el botón del código se activa con `code.length < 6` siendo `LOGIN_CODE_LENGTH = 8`; «Entrar» tiene `hidden … min-[400px]:inline-flex`; `/login` usa `shouldCreateUser: true`; `signOut()` sin `scope` (global); `WalletPanel` pinta Apple y Google siempre; la propuesta de reunión usa la zona horaria del visitante; `/?cuenta=borrada` no se lee en la landing; no hay `manifest` ni `wakeLock` en `src/`; la `SaveBar` se monta siempre y trunca el mensaje.

---

## 2. Reglas para el agente que implementa

1. **Una rama y un PR por bloque de la sección 4**, en el orden indicado (`feat/ux-p1-arreglos`, `feat/ux-p2-mi-qr`…). Commits convencionales. No hay `gh`: dale a Diego el enlace `https://github.com/diegomolinacatala/PassMe/compare/main...<rama>?expand=1`.
2. **Antes de cada push:** `npm run lint`, `npm run typecheck`, `npm test` y `npm run e2e:demo`. Muchos cambios tocan textos que usan los E2E como selectores (`e2e/*.spec.ts`): **actualiza los tests a la vez que el texto** y añade tests para lo nuevo (cada criterio de aceptación de este documento debería acabar siendo un test E2E o unitario siempre que sea razonable).
3. **El modo demo tiene que seguir funcionando** (lo usan el E2E, el CI y Diego para enseñarlo). Todo lo nuevo necesita su variante demo.
4. **Invariantes de seguridad de `AGENTS.md`**: no las rompas. En particular: nada de enlaces ocultos en el navegador; toda Server Action revalida la sesión; emails a direcciones sin verificar solo con texto fijo; `linkHref()` para construir hrefs; `createSharedRateLimiter` para límites; nuevas funciones SQL con `revoke … from public, anon, authenticated`; sin `<script>` inline (CSP con nonce en `src/proxy.ts`).
5. **Migraciones:** archivo nuevo en `supabase/migrations/`, nunca editar uno aplicado, y **el código tiene que funcionar sin la migración** (fallback). Diego la aplica en el SQL Editor antes de fusionar: díselo en el PR, con el nombre del archivo.
6. **Estilo de la marca:** editorial cálido (`paper`, `ink` café, `signal` naranja, `glow` melocotón), titulares en serif con acento en cursiva, etiquetas mono en mayúsculas. **No introduzcas colores fríos** (Diego rechazó violeta y lima). Iconos solo de `lucide-react`.
7. **UI y documentación en español con tuteo; código y comentarios en inglés.** Usa el glosario del apartado 3.1 para cualquier texto nuevo.
8. **No rompas lo que funciona** (sección 6).
9. **Al terminar cada PR**, actualiza la sección «Estado actual» de `CLAUDE.md` (qué se hizo, qué queda, siguiente paso exacto) y súbelo con el resto. Marca en este documento los IDs hechos (`✅ P1.3`).
10. Si algo de este documento resulta ser falso al mirar el código, **no lo implementes a ciegas**: compruébalo, corrígelo aquí y sigue.

---

## 3. Decisiones de producto

### 3.1 Glosario único (ya decidido: aplícalo en todo)

Es la base de la coherencia. Cualquier texto nuevo o tocado debe usar estos términos. P1.20 hace la pasada completa.

| Concepto | Término único | Hoy también se dice (eliminar) |
|---|---|---|
| Lo que tienes y compartes | **tarjeta** | perfil, página («tu página»), «Tarjeta de contacto» |
| El objeto en Apple/Google Wallet | **pase**; en botones, la marca: «Añadir a Apple Wallet» | cartera (como sustantivo de sección) |
| La URL `/u/<slug>` | **enlace de tu tarjeta** (o «tu enlace») | slug, «/u/demo ↗» |
| Teléfonos, emails y redes del dueño | **datos de contacto**; la sección se llama **«Cómo contactarte»** (como en `/crear`) | «Tus contactos», «enlaces», «Tipo de enlace», «Añadir contacto» |
| Personas que te dejan sus datos | **contactos recibidos** | «Formulario de contacto», «Te dejo mi contacto» |
| Acción del visitante de dejar sus datos | **«Déjale tu contacto»** (botón, título y envío: «Dejarle mi contacto») | «Te dejo mi contacto», «Enviar mi contacto» |
| Interruptor del dueño para eso | **«Recibir contactos»** | «Deja que te dejen su contacto» |
| Descargar la vCard | **«Guardar contacto»** / en el editor «Guardar en Contactos» | «Todos a Contactos (.vcf)» |
| Estadística de vCards descargadas | **«Guardaron tu contacto»** | «Contactos guardados» |
| Estadística de clics | **«Lo más pulsado»** | «Contactos más usados» |
| Crear tu tarjeta | **«Crear mi tarjeta»** (en la barra superior de una tarjeta ajena, por espacio: «Crear la mía»; tras dejar datos: «Crear la mía con estos datos») | «Crea la tuya gratis», «Crear mi tarjeta gratis», «Crear mi propia tarjeta», «Créala en un minuto» |
| Acceder | **«Entrar»** | «Acceso», «Inicia sesión» |
| Anular una reunión o propuesta | **«Cancelar»** («Cancelar propuesta», «Cancelar reunión») | «Retirar» |
| Proponer horas alternativas | **«Proponer otras horas»** | «Otra hora», «Proponer otra hora», «Propón otras horas», «Proponer otra fecha» |
| Borrar algo permanente | **«Borrar»** | «Eliminar», «Eliminar definitivamente» |
| Quitar algo recuperable de una lista | **«Quitar»** | «Eliminar enlace» |
| Mandar la URL | **«Compartir»** si hay `navigator.share`; si no, **«Copiar enlace»**. Confirmación: «Enlace copiado» | «Compartir enlace» que en realidad copia |
| Enlace tipo Calendly (`booking`) | **«Enlace de reservas»** (en la tarjeta se ve el título que ponga el dueño) | «Reservar cita» |

### 3.2 Decisiones que necesitan a Diego ⚖️

El agente debe preguntárselas (con `AskUserQuestion`, una a una y con la opción recomendada primero) **antes** del PR que las usa. Mientras no conteste, aplica el valor por defecto **solo** si está marcado como «seguro por defecto».

| ID | Pregunta | Opciones | Recomendado | ¿Seguro por defecto? | PR |
|---|---|---|---|---|---|
| D1 | Nombre de la función de reuniones para el visitante | (a) «Proponer una reunión» (lo que hace de verdad) · (b) mantener «Agendar reunión» | (a). Sea cual sea, es el único verbo en toda la app; el interruptor del dueño pasa a «Recibir propuestas de reunión» | Sí: (b), sin cambiar nada | P6 |
| D2 | Casillas de consentimiento en «Déjale tu contacto» y en la propuesta de reunión | (a) quitarlas y poner un texto informativo bajo el botón (base: art. 6.1.b, lo pide el propio usuario) · (b) mantenerlas mejoradas | (a), **pendiente de que lo valide el abogado** (ya está en «Después» de `CLAUDE.md`) | Sí: (b) | P5, P6 |
| D3 | `/login` con un email que no tiene cuenta | (a) `shouldCreateUser: false` y aviso «No hay ninguna tarjeta con ese email» (revela si un email tiene cuenta) · (b) mantener la creación y avisar en `/crear` «¿Ya tenías tarjeta con otro email?» | (b) + sugerencia de erratas (P4.6): resuelve el 90 % sin enumeración de cuentas | Sí: (b) | P4 |
| D4 | Google Wallet mientras Google no apruebe el emisor | (a) ocultar el botón tras la variable `GOOGLE_WALLET_LIVE` y ofrecer «Mi QR» en Android · (b) dejarlo como está | (a). Diego pone `GOOGLE_WALLET_LIVE=true` en Vercel cuando funcione | Sí: (a) | P2 |
| D5 | Invitaciones de calendario | (a) `METHOD:REQUEST` con PassMe (`hola@getpassme.com`) como organizador y los dos como asistentes: se añaden, mueven y borran solas · (b) mantener `PUBLISH` + botón de Google Calendar | (a), pero probarlo antes con Gmail, Outlook y Apple Calendar en cuentas reales | Sí: (b) | P8 |
| D6 | Editor en pestañas | (a) control segmentado «Tarjeta · Bandeja · Actividad» (P7.1) · (b) una sola página con índice fijo y aviso de pendientes | (a) | Sí: (b) con P2.7 ya hecho | P7 |
| D7 | Modo oscuro | (a) ahora · (b) más adelante | (b). La web «papel» es coherente, el fondo claro ayuda a escanear y no se rompe nada en oscuro. Valorarlo cuando haya usuarios que lo pidan | Sí: (b) | — |
| D8 | Tema inicial de una tarjeta nueva | (a) aleatorio y distinto del de quien te refirió · (b) siempre el naranja por defecto | (a): si no, todas las tarjetas de PassMe acaban siendo iguales | Sí: (a) | P4 |

### 3.3 Cosas que Diego tiene que verificar en un móvil real (no se pueden emular)

1. **El texto de la landing «Doble clic al botón lateral»**: en iPhone, el doble clic abre las tarjetas de Apple Pay; los pases de tienda (`storeCard`) no salen por defecto. Si no aparece el pase de PassMe, cambiar el texto (P8.3).
2. **Android: «Guardar contacto»** descarga un `.vcf` y hay que abrirlo desde la barra de descargas. Verificar cuántos toques son en Chrome de Android real tras P5.3.
3. **`navigator.wakeLock` en Safari de iOS** (soportado desde 16.4): comprobar que la pantalla «Mi QR» no se apaga.
4. **La app Gmail en iOS** con el enlace `googlegmail://` (P4.5).

---

## 4. Plan de trabajo por PRs

Orden pensado para entregar valor pronto y no pisarse: **P1** arregla fallos sueltos; **P2** resuelve la prioridad nº 1 del producto; **P3** crea los componentes comunes que usan P4–P7; después cada PR toca una superficie distinta.

Severidad de origen entre corchetes: **[A]** alta, **[M]** media, **[B]** baja.

---

### P1 · Arreglos rápidos y fallos visibles · rama `feat/ux-p1-arreglos`

Cambios pequeños, de bajo riesgo, sin rediseño. Ninguno necesita migración.

**✅ P1.1 · El botón del código se activa con 6 de 8 cifras** [B] · ONB-13, A11Y-17
- `src/components/auth/email-code-auth.tsx` (`disabled={code.length < 6}`).
- Cambiar a `code.length < LOGIN_CODE_LENGTH` (importar de `src/lib/auth/code.ts`).
- ✔ Con 7 cifras el botón está desactivado; con 8 se envía solo. Un intento incompleto ya no gasta uno de los 5 intentos.

**✅ P1.2 · Los datos de «Déjale tu contacto» y de la propuesta solo viajan por un botón** [A] · SCAN-01, ONB-09, MEET-10
- `src/components/card/contact-form.tsx` y `src/components/meetings/meeting-request.tsx`: hoy `rememberDetails(...)` está en el `onClick` de «Crear la mía con estos datos».
- Llamarlo **en cuanto el estado pasa a `sent`** (un `useEffect` en `SentMessage`). Así cualquier CTA hacia `/crear` (barra superior, bloque oscuro) llega relleno.
- ✔ Enviar el contacto en `/u/demo` y pulsar el botón de la barra superior: `/crear` muestra nombre, empresa, móvil y email. Igual tras proponer una reunión. Test E2E.

**✅ P1.3 · El editor se desborda en horizontal de 320 a 393 px** [A] · A11Y-03, ONB-12
- `src/components/editor/preview-panel.tsx` (tablist y pase) y el contenedor de `card-editor.tsx`.
- `min-w-0` + `overflow-hidden` en el `tabpanel` y en el contenedor del pase; el pase escala al ancho disponible (`w-full max-w-[330px]`, sin mínimo intrínseco); pestañas con `flex-1 min-w-0` y textos cortos en móvil: «Apple», «Google», «Al escanear».
- ✔ `document.documentElement.scrollWidth === clientWidth` en `/dashboard` y `/dashboard?nueva=1` a 320, 360, 375 y 393 px. Test E2E en el proyecto `mobile` (y otro a 320 px).

**✅ P1.4 · La barra de guardar: oculta sin cambios, sin tapar nada, sin cortar el texto** [A] · ONB-07, A11Y-02, A11Y-15, LIFE-17, EDIT-11, A11Y-12
- `src/components/editor/card-editor.tsx` (`SaveBar`, `fixed inset-x-0 bottom-0 z-30`, `truncate`).
- No mostrarla con `!dirty && status.kind === "idle"`. Aparece (deslizando desde abajo, 200 ms, respetando movimiento reducido) al primer cambio, mientras guarda, si hay error, y tras «Guardado…» se va a los 3 s. Nunca visible con la bienvenida abierta si no hay cambios.
- Mientras esté visible: `scroll-padding-bottom` en el `html` del editor (o `scroll-margin-bottom` en los campos) igual a su altura + 16 px, para que un campo enfocado nunca quede debajo (WCAG 2.4.11).
- Mensaje con `line-clamp-2` en vez de `truncate`.
- Atajo: «⌘S» solo en macOS/iOS; «Ctrl S» en el resto; el atajo con `aria-hidden`.
- `role="status"` solo en el `<p>` del mensaje (hoy envuelve también el botón y el atajo).
- En escritorio (`lg`), alinear la barra a la columna izquierda para que no pise la derecha.
- ✔ En `/dashboard` recién cargado no hay barra; al editar un campo aparece; en `?nueva=1` en vertical y en horizontal (852×393) nada tapa el QR; tabulando por todo el editor a 393×666 ningún control enfocado se solapa con la barra; en Windows se lee «Ctrl S».

**✅ P1.5 · Guardar con errores no lleva al error** [A] · EDIT-02, A11Y-14, A11Y-01
- `card-editor.tsx` (función de guardar y mensaje de error).
- Al fallar la validación: `scrollIntoView({ block: "center" })` + `focus()` del primer `[aria-invalid="true"]`.
- Texto según el número de errores, sin depender del color: «Falta tu nombre.» (1 error, con el nombre del campo) / «Hay 3 campos por revisar.» + botón «Ver» que salta al siguiente error.
- ✔ Pulsar «Guardar» desde el final de la página con el nombre vacío deja el campo visible y enfocado, y el mensaje se lee entero a 393 px. Test E2E.

**✅ P1.6 · El foco se pierde en 9 acciones** [A] · A11Y-01
- `meeting-response.tsx`: «Proponer otras horas», «No puedo», «Volver», «Cancelar…», «No, mantener». `contact-form.tsx` y `meeting-request.tsx` (envío con errores). `welcome-panel.tsx` (cerrar). `links-editor.tsx` (quitar un dato).
- Paneles nuevos (`CounterPanel`, `DeclinePanel`): `ref` + `tabIndex={-1}` en su `<h2>` y foco al montarlos (el mismo patrón que `StepWhen`). «Volver» y «No, mantener» devuelven el foco al botón que abrió el panel. Envío con errores: foco al primer `[aria-invalid=true]` (como ya hace `quick-card-form.tsx`). Cerrar la bienvenida: foco al H1 del editor. Quitar un dato: foco a la fila siguiente, o a «Añadir» si era la última.
- ✔ En las 9 acciones, `document.activeElement !== document.body`. Ampliar `e2e/a11y.spec.ts`.

**✅ P1.7 · Reuniones: «Continuar» sin hora no muestra nada** [A] · MEET-04
- `meeting-request.tsx` + `slot-picker.tsx` (el error se pinta encima de «Duración», fuera de la vista).
- El botón cuenta lo que hay: sin horas, «Elige al menos una hora» (atenuado, sin `disabled`: al tocarlo hace `scrollIntoView` suave a la tira de días y la resalta); con horas, «Continuar con 2 horas».
- ✔ Tras tocarlo sin hora, el mensaje o la tira de días quedan visibles en el viewport sin hacer scroll.

**✅ P1.8 · Reuniones: tras un error del servidor la casilla aparece desmarcada (pero sigue marcada)** [M] · MEET-07
- `meeting-request.tsx` (y revisar `contact-form.tsx`, que usa el mismo patrón): React 19 resetea el `<form action>` tras la acción y el estado `consent` sigue en `true`.
- No depender del reset: `onSubmit` con `preventDefault` + `startTransition(() => action(new FormData(form)))`, o mandar el valor como `<input type="hidden">` derivado del estado.
- ✔ Tras cualquier error devuelto por el servidor, todos los campos y la casilla se ven exactamente como estaban. Test E2E (forzando un error del servidor, p. ej. con el texto «Expo.Pack» antes de P6.5).

**✅ P1.9 · Demo: cancelar una reunión confirmada falla y deja la página sin salida** [M] · MEET-20
- `src/app/reunion/actions.ts` (`demoAnswer` parte siempre de la propuesta pendiente) y `src/app/reunion/[id]/[sig]/page.tsx`.
- Ids demo con estado: `/reunion/demo-confirmada/anfitrion`, `/reunion/demo-confirmada/invitado`, `/reunion/demo-contra/invitado` (Alex propone otras horas), `/reunion/demo-caducada/invitado`, `/reunion/demo-pasada/anfitrion`, reutilizando los datos demo existentes. `demoAnswer` usa el estado del id.
- ✔ En demo, confirmar y luego cancelar termina en «Reunión cancelada»; las cinco variantes existen y cada una tiene un test E2E.

**✅ P1.10 · El contador de la cabecera no baja al borrar** [M] · EDIT-06
- `card-editor.tsx` usa `meetings.items.length` y `contacts.requests.length` del servidor; los paneles filtran de forma optimista (`contacts-panel.tsx`, `meetings-panel.tsx`).
- El panel calcula y pinta su propio contador (o lo sube con un callback). Sin elementos, sin contador.
- ✔ Al borrar el último contacto recibido no queda «1 en total» junto a «Aún no te ha dejado nadie…».

**✅ P1.11 · Callejones sin salida y respuestas en crudo** [M] · LIFE-11, A11Y-18
- `src/app/wallet/page.tsx` (`Expired`, sin botón): texto «Este QR ya no vale (dura 30 minutos). Entra con tu email en este móvil y añade el pase desde ahí.» + botón «Entrar y añadir el pase» → `/login?next=/dashboard`.
- `src/app/api/pass/apple/route.ts` y `google/route.ts`: si la petición es una navegación (`Accept` incluye `text/html`), redirigir 401 → `/login?next=/dashboard` y 404/409 → `/dashboard?pase=error` con un aviso legible; JSON solo para `fetch`.
- `src/app/dashboard/contactos/route.ts`: igual, 401 → `/login?next=/dashboard`.
- ✔ Ninguna navegación de usuario muestra JSON ni texto plano; `/wallet` caducado tiene una acción.

**✅ P1.12 · Metadatos y 404** [B] · LIFE-19, A11Y-19, SCAN-16
- `src/app/not-found.tsx`: `metadata.title = "Página no encontrada"`.
- `src/app/u/[slug]/not-found.tsx`: quitar la etiqueta «Error 404»; título «Esta tarjeta no está disponible» (vale también para una despublicada); botón principal «Ir a PassMe» y enlace secundario «Crear mi tarjeta». Mantener «Pídele que te la enseñe de nuevo».
- ✔ La 404 de tarjeta no contiene «Error» y tiene dos salidas; la pestaña de la 404 genérica dice «Página no encontrada · PassMe».

**✅ P1.13 · Confirmación tras borrar la cuenta y texto exacto del borrado** [M] · LIFE-08
- `src/app/page.tsx`: leer `?cuenta=borrada` y mostrar un aviso (`role="status"`): «Tu cuenta y tu tarjeta se han borrado. Gracias por probar PassMe.»
- `src/components/editor/account-panel.tsx`: texto «Esto no se puede deshacer. Borraremos tu tarjeta, tu foto, tus estadísticas, los contactos que te han dejado y tus reuniones. Tu enlace dejará de funcionar y quedará reservado 90 días. El pase que tengas en la cartera dejará de actualizarse: quítalo desde la app Cartera.» (Comprobar que coincide con `/privacidad` y con `cleanup`/borrado reales.) Si hay contactos recibidos, enlace «Descargar mis contactos» antes del botón.
- `src/app/dashboard/actions.ts`: el error de configuración («Falta SUPABASE_SECRET_KEY…») no se muestra al usuario; mensaje genérico «No hemos podido borrar la cuenta. Escríbenos y lo hacemos a mano.» y el detalle al log.
- ✔ Tras borrar, la landing muestra la confirmación; el texto del diálogo coincide con la política.

**✅ P1.14 · Textos con jerga** [B] · EDIT-19, COH-13
- «si está configurado» (`contacts-panel.tsx`) → «Cuando alguien te lo deje, te avisaremos por email y lo verás aquí.»
- «Lo oculto nunca sale del servidor» (`card-editor.tsx`) → «Lo que ocultes no lo verá nadie.»
- Errores que nombran una migración (`contacts-panel.tsx`, `meetings-panel.tsx`) → «Esta función aún no está disponible.» (el detalle, al log).
- Aviso demo con `docs/SETUP.md` (`card-editor.tsx`) → «Modo demo: los cambios no se guardan.»
- Borrar cuenta desactivado en demo: añadir «En la demo no se puede borrar la cuenta.»
- Botones de cartera «Sin configurar» → «No disponible todavía».
- «Excel (CSV)» → «Descargar para Excel»; «Todos a Contactos (.vcf)» → «Guardar todos en Contactos».
- ✔ Ningún texto visible menciona servidor, configuración, migraciones, `SETUP.md`, CSV ni `.vcf`.

**✅ P1.15 · vCard: origen, nota con fecha y nombres compuestos** [M] · SCAN-12, ONB-18, SCAN-13
- `src/components/card/profile-card.tsx`: pasar `source` desde `page.tsx` y construir `/u/<slug>/vcard?src=<source>` cuando no sea `direct` (la ruta ya lo lee).
- `src/lib/card/vcard.ts`: añadir al final de `NOTE` «Guardado con PassMe el 05/10/2026 · getpassme.com/u/<slug>» (fecha del servidor en `Europe/Madrid`). `splitName`: con 3 palabras o más, las **dos últimas** son apellidos («Ana María» / «López Gil»).
- `vcard/route.ts`: nombre de archivo con el nombre de la persona (`filename*=UTF-8''Alex%20Rivera.vcf` + respaldo ASCII).
- ✔ Desde `?src=qr` la descarga cuenta como `qr`; la vCard de «Ana María López Gil» tiene `N:López Gil;Ana María;;;`; tests unitarios en `vcard`.

**✅ P1.16 · Tarjeta sin datos de contacto: el visitante ve un aviso de editor** [M] · SCAN-11
- `profile-card.tsx`: con `preview=false` no mostrar «Todavía no hay enlaces visibles.»; en la vista previa del editor, «Añade un teléfono o un email para que puedan contactarte.»
- ✔ Una tarjeta pública sin datos no muestra ningún recuadro vacío.

**✅ P1.17 · Detalles del formulario de `/crear`** [B] · ONB-17, A11Y-20
- `quick-card-form.tsx`: `enterKeyHint="next"` en todos los campos menos el último; Enter mueve el foco al siguiente campo sin enviar ni validar; el último envía.
- `create-flow.tsx`: `scrollTo` con `behavior: "auto"` si `prefers-reduced-motion: reduce`.
- ✔ Enter en «Nombre» pasa a «Cargo» sin mostrar errores.

**✅ P1.18 · Reuniones: etiqueta repetida y textos sueltos** [B] · EDIT-20, MEET-24
- `meetings-panel.tsx`: dentro del grupo «Te toca responder» no repetir «TE TOCA» en cada fila (solo la fecha); la etiqueta de estado solo en «Anteriores».
- `src/lib/meetings/schema.ts`: «Sin enlaces, por favor: los veréis en la invitación.» → «Sin enlaces, por favor. Si necesitáis compartir uno, hacedlo respondiendo al email de confirmación.»
- ✔ Ninguna fila repite el título de su grupo.

**✅ P1.19 · Temas con el nombre cortado** [B] · EDIT-21
- `design-field.tsx`: 4 columnas por debajo de 400 px (o nombre en dos líneas).
- ✔ Los 10 nombres se leen enteros a 393 px.

**✅ P1.20 · Pasada del glosario** [A] · COH-01–04, EDIT-05, SCAN-08, MEET-12, LIFE-14
- Aplicar la tabla 3.1 en todo `src/` (componentes, emails en `src/lib/meetings/emails.ts`, `/privacidad` y `/terminos` si nombran las secciones) **salvo** lo que depende de D1 (el verbo de reuniones, que se hace en P6).
- Incluye: sección 02 del editor → «Cómo contactarte»; «Añadir contacto» → «Añadir»; «Eliminar enlace» → «Quitar»; tipo «Enlace» → «Otra web» (o desaparece con P7.3); «Tipo de enlace» → «Tipo»; estadísticas «Guardaron tu contacto» / «Lo más pulsado»; todos los CTA de crear → «Crear mi tarjeta» / «Crear la mía»; `/login` «Créala en un minuto» → «¿Aún no tienes tarjeta? Crear mi tarjeta»; «Acceso» → «Entrar»; «Retirar propuesta» → «Cancelar propuesta» y su título final «Propuesta cancelada» (no «Reunión cancelada»); los 4 nombres de «otras horas» → «Proponer otras horas»; el pie del invitado según la fase («…ver o cancelar tu propuesta» / «…ver o cancelar la reunión» / nada si está cerrada).
- Precio: la landing y `/terminos` dicen lo mismo. Landing: «Gratis para siempre». Términos: «Tu tarjeta, tu QR y tu pase son gratis, para siempre. Si en el futuro añadimos funciones de pago, serán opcionales y nunca te cobraremos nada sin que lo aceptes.» (Coherente con «Monetización» de `CLAUDE.md`: tarjeta y pase gratis para siempre.)
- Interruptores del editor: el texto visible es el nombre accesible (quitar `aria-label` que no coincide y usar `aria-labelledby` + `aria-describedby`; toda la fila conmuta el interruptor) · A11Y-10.
- ✔ `rg -i "otra fecha|otra hora|Crea la tuya|Créala|Retirar|Tus contactos|Eliminar enlace|Inicia sesión"` sobre `src/` no devuelve textos visibles. El nombre accesible de cada interruptor empieza por su texto visible.

---

### P2 · «Mi QR» y la vuelta al producto · rama `feat/ux-p2-mi-qr`

La prioridad nº 1 del proyecto. Origen: ONB-02, ONB-04, ONB-08, EDIT-01, EDIT-14, EDIT-15, LIFE-01–04, LIFE-07, LIFE-10, LIFE-12, LIFE-20, ONB-03, LIFE-06, COH-09, COH-10, COH-11.

**P2.1 · Pantalla «Mi QR» a pantalla completa** [A]
- Ruta nueva `/dashboard/qr` (con sesión; sin sesión → `/login?next=/dashboard/qr`; en demo, la tarjeta demo).
- Contenido: fondo blanco puro, QR del **slug guardado** (nunca el del borrador) al 82 vw con máximo 420 px, el nombre encima en `font-display`, y debajo «Sube el brillo para que se lea a la primera». Sin barra de guardar ni cabecera del sitio. Botón «Compartir» (Web Share; sin ella, «Copiar enlace») por si el otro no puede escanear, y «Cerrar» (vuelve a `/dashboard`). En horizontal, el QR se centra y nada lo tapa.
- `navigator.wakeLock.request("screen")` al montar, renovarlo en `visibilitychange`, liberarlo al salir. Sin soporte, no pasa nada (sin avisos).
- QR reutilizando `src/components/card/qr-code.tsx`, con `?src=qr`.
- ✔ La pantalla no se apaga en 2 min sin tocarla (Diego lo verifica en iPhone, 3.3); nada tapa el QR en vertical ni en horizontal; con cambios sin guardar en el slug, el QR apunta al guardado. Test E2E (contenido, slug guardado, enlace de cierre).

**P2.2 · Acciones arriba del editor** [A]
- `src/app/dashboard/page.tsx` (cabecera) y `card-editor.tsx`.
- Cabecera: sustituir el enlace técnico «/u/<slug> ↗» por un botón **«Mi QR»** (icono `QrCode` + texto, siempre visible arriba a la derecha) que abre `/dashboard/qr`, y un **menú de cuenta** (P2.8).
- Bajo el título del editor, en móvil, una fila de acciones antes de «01»: **«Compartir»** (Web Share / «Copiar enlace»), **un solo botón de cartera según la plataforma** (P2.3) y «Ver mi tarjeta». Con cambios sin guardar en el slug o la tarjeta, «Ver mi tarjeta» se acompaña de «(sin tus cambios)» · EDIT-18.
- ✔ En el iPhone, desde `/dashboard` sin parámetros, 1 toque muestra un QR escaneable ≥ 280 px; el botón de cartera está visible sin scroll (y < 659) en iPhone 15 y Pixel 7.

**P2.3 · Cartera según la plataforma, en todas partes** [M] · EDIT-14, LIFE-04, COH-09
- Componente único `<AddToWalletButton platform>` usado en `welcome-panel.tsx`, `wallet-panel.tsx` y `/wallet` (hoy hay tres estilos). Respetar las guías de marca (Apple pide su insignia «Añadir a Apple Wallet» en negro).
- `WalletPanel` recibe `platform` (de `src/lib/platform.ts` → `detectPlatform`): iOS → solo Apple; Android → solo Google (o la alternativa de P2.4); ordenador → primero el bloque «Escanéalo con tu móvil para añadir el pase» (el *handoff* actual) y los dos botones quedan como enlace pequeño «Descargar el archivo del pase». En móvil, enlace pequeño «¿Otro móvil?» que muestra ambos. El bloque «¿Estás en el ordenador?» solo en ordenador.
- Una línea bajo el título de la sección: «Tu tarjeta como un pase más, junto a tus tarjetas y billetes: se abre sin conexión y sin buscarla, y se actualiza sola cuando cambias algo.» · LIFE-18
- ✔ El iPhone ve un único botón de cartera; el escritorio ve primero el QR para pasarlo al móvil.

**P2.4 · Google Wallet tras una variable** ⚖️ D4 [A] · LIFE-01
- Variable de servidor `GOOGLE_WALLET_LIVE` (por defecto `false`; documentarla en `docs/SETUP.md` y en `npm run doctor`).
- Apagada: ninguna pantalla enlaza a `/api/pass/google`. En Android, el lugar del botón lo ocupa **«Guardar mi QR en el móvil»**, que abre `/dashboard/qr` y explica en una línea cómo anclarlo a la pantalla de inicio (P2.6). Fila no clicable «Google Wallet · muy pronto».
- Landing (`src/app/page.tsx`, `src/components/landing/sections.tsx`) mientras esté apagada: no prometer «Google Wallet» ni «actualización automática en Apple y Google Wallet»; en el bloque final, «Funciona en cualquier móvil con cámara» en vez de «iPhone y Android».
- ✔ Con `GOOGLE_WALLET_LIVE=false`, `rg "/api/pass/google"` solo aparece detrás de la comprobación; un Android que acaba de crear su tarjeta ve una acción que funciona. Tests con la variable a `true` y a `false`.
- **Paso manual para Diego** (díselo en el PR): cuando Google apruebe el emisor y funcione, poner `GOOGLE_WALLET_LIVE=true` en Vercel.

**P2.5 · Bienvenida: QR primero, ampliable y adaptada al origen** [A] · ONB-04, ONB-08, COH-10
- `welcome-panel.tsx`.
- Orden en móvil: titular corto («Ya tienes tu tarjeta, Lucía.»), QR y, justo debajo, el botón de cartera. El párrafo explicativo, después. Una sola forma de cerrarla: el texto «Personalizar mi tarjeta» (quitar la X duplicada).
- Tocar el QR abre `/dashboard/qr` (pista «Toca para ampliar»).
- **Origen:** propagar cómo llegó el visitante (`src` de `/u/<slug>?src=…`) por `createPath(slug, source)` → `/crear?de=<slug>&via=<qr|share|direct>` → `welcomePath(from, via)` (`src/lib/card/quick.ts`, `create-yours.tsx`).
  - `via=qr`: igual que hoy («Enséñale este QR a Alex»).
  - Si no: botón principal **«Mandarle mi tarjeta a Alex»** encima del QR. Crea un contacto recibido en la tarjeta de Alex con los datos de la tarjeta recién creada (reutilizando la lógica de `submitContactAction`, con origen `crear`, mismas validaciones, límites y email al dueño con texto fijo). Debajo, en pequeño: «Alex verá tu nombre, tu email y tu móvil.» Tras enviarlo: «Alex ya tiene tu tarjeta.» El QR pasa a segundo plano con «¿Estáis juntos? Enséñale este QR».
  - Si Alex no acepta contactos (`acceptsContactRequests` falso): el botón principal es «Mandarle mi tarjeta por WhatsApp…» → `navigator.share({ text: "Esta es mi tarjeta: <url>" })`.
  - En demo, simulado como el resto.
- ✔ En 393×659 el QR y el botón de cartera se ven sin scroll; abrir `/u/demo` sin `src`, crear la tarjeta → la bienvenida muestra «Mandarle mi tarjeta a Alex» y al pulsarlo aparece «Alex ya tiene tu tarjeta»; con `?src=qr` se mantiene el diseño actual. Tests E2E de las dos variantes.

**P2.6 · Manifest: «Añadir a pantalla de inicio» lleva a mi QR** [M] · LIFE-12, ONB-02
- `src/app/manifest.ts`: `name: "PassMe"`, `short_name: "PassMe"`, `start_url: "/dashboard/qr"`, `display: "standalone"`, `background_color` y `theme_color` = `paper` (`#f3efe6`, comprobar el token), iconos 192 y 512 (también `maskable`) generados desde `src/app/icon.svg` (ampliar `npm run brand` si hace falta). Añadir `favicon.ico`.
- En `/dashboard/qr`, en Android y sin Google Wallet, una pista que se puede cerrar: «Añádela a tu pantalla de inicio: ⋮ → Añadir a pantalla de inicio». En iOS: «Compartir → Añadir a pantalla de inicio».
- ✔ `/manifest.webmanifest` y `/favicon.ico` responden 200; Lighthouse la marca como instalable.

**P2.7 · Aviso de pendientes arriba del editor** [A] · MEET-16, EDIT-04
- `card-editor.tsx`: si hay reuniones en «Te toca responder» o contactos recibidos sin ver, un aviso arriba (antes de «01»): «**Lucía Martín** te ha propuesto una reunión · Responder» (varias: «Tienes 2 propuestas de reunión · Ver»), que lleva a `#reuniones` o directamente a la página firmada. Lo mismo para «Javier te ha dejado su contacto · Ver».
- ✔ En `/dashboard` (demo, 393 px), sin hacer scroll se ve el aviso con el nombre y un botón que lleva a la respuesta.

**P2.8 · Menú de cuenta y cerrar sesión solo en este dispositivo** [M] · LIFE-10, EDIT-04
- Cabecera del editor: iniciales/avatar con un menú (`<details>` o `popover` accesible, sin JS inline): «Ver mi tarjeta», «Compartir», «Cerrar sesión», «Cuenta y privacidad» (salta a la sección Cuenta).
- `src/app/auth/signout/route.ts`: `signOut({ scope: "local" })`. En la sección Cuenta, enlace secundario «Cerrar sesión en todos mis dispositivos» (`scope: "global"`).
- ✔ «Cerrar sesión» a ≤ 2 toques desde arriba; cerrar sesión en un navegador no la cierra en otro.

**P2.9 · El dueño se reconoce en su propia tarjeta y en el reverso de su pase** [M] · LIFE-07
- `src/components/card/create-yours.tsx` + `src/app/u/[slug]/page.tsx`: si hay sesión y la tarjeta es suya, la barra superior dice «Editar mi tarjeta» → `/dashboard`, y en lugar del bloque de crear: «Así la ven los demás · Editar · Mi QR». Sin sesión, al pie: «¿Es tu tarjeta? Entrar».
- `src/lib/pass/apple.ts`: el campo del reverso «Hecho con PassMe · Crea tu tarjeta gratis» → etiqueta «Tu tarjeta», valor `${site}/dashboard`, texto «Editar mi tarjeta» (el reverso solo lo ve el dueño). Revisar el equivalente en Google.
- ✔ Con sesión, en `/u/<mi-slug>` no aparece «Crear»; el reverso del pase enlaza a `/dashboard`.

**P2.10 · Cabecera de la landing: «Entrar» siempre visible y «Mi tarjeta» con sesión** [A] · LIFE-06, ONB-03, LIFE-20
- `src/components/landing/site-header.tsx`: quitar `hidden … min-[400px]:inline-flex` de «Entrar»; por debajo de 400 px, el botón de crear dice «Crear». Con sesión (cookie de Supabase leída en el servidor): un único botón «Mi tarjeta» → `/dashboard` y sin «Entrar» ni «Crear».
- El ancla «Privacidad» de la cabecera (`#privacidad`) se llama «Tus datos» para no chocar con el enlace «Privacidad» del pie, que va a `/privacidad` · LIFE-19.
- ✔ A 320, 360 y 375 px se ven «Entrar» y «Crear» sin desbordar; con sesión solo «Mi tarjeta».

**P2.11 · Compartir nativo y QR para imprimir con opciones** [M] · EDIT-15, COH-11
- `wallet-panel.tsx`: «Copiar enlace» → «Compartir» (Web Share; sin ella, «Copiar enlace»), con el mismo componente que la bienvenida y `/dashboard/qr`. Confirmación «Enlace copiado» anunciada en una región viva global (P3.4).
- «QR para imprimir» abre una hoja con vista previa y «Descargar SVG» / «Descargar PNG (1024 px)». Ampliar `src/app/u/[slug]/qr/route.ts` con `?format=png` (con `sharp`, ya es dependencia). Nombre de archivo actual (`passme-<slug>-qr.*`).
- ✔ Desde el editor en el iPhone, 1 toque abre la hoja de compartir; se puede descargar PNG y SVG.

---

### P3 · Componentes comunes y reglas visuales · rama `feat/ux-p3-sistema`

Base para P4–P7: si se hace antes, los PRs siguientes usan los componentes nuevos y no vuelven a inventar estilos. Origen: COH-05–08, COH-12, COH-14, A11Y-04, A11Y-05, A11Y-06, A11Y-07, A11Y-08, A11Y-11, A11Y-12, A11Y-16.

**P3.1 · Regla de botones (documentarla en `docs/BRAND.md`)** [M] · COH-06
- `signal` = **la** acción que completa la tarea de la pantalla, **una sola** visible a la vez. `ink` = acción importante secundaria. `outline` = alternativa. `ghost`/texto = terciaria. `danger` = solo al confirmar algo destructivo.
- Alturas: mínimo 44 px en móvil (`h-11`); `sm` de 36–40 px solo en escritorio.
- Aplicarlo a los envíos que hoy van en `ink` cuando son la acción principal («Enviarme un código» en `/crear`, «Entrar», «Dejarle mi contacto», «Continuar», «Enviar respuesta»), y al revés.
- ✔ En cada pantalla se ve como mucho un botón `signal`.

**P3.2 · Un único campo de formulario** [M] · COH-07, A11Y-04, A11Y-05, A11Y-13
- `src/components/ui/field.tsx` que exporte `Field` (etiqueta, «Opcional», pista, error con icono) e `inputClasses({ size })`. Sustituye a `INPUT_CLASSES` (`fields.tsx`), `INPUT` (`quick-card-form.tsx`, `email-code-auth.tsx`, `contact-form.tsx`) y `MEETING_INPUT` (`form-bits.tsx`).
- h-12, `text-base` (evita el zoom de iOS), etiqueta en minúsculas normales (no `.eyebrow` en el login), error en `text-sm`.
- **Borde con contraste ≥ 3:1**: token nuevo `--color-field-border` (≈ `#8f8473`; verificar ≥ 3:1 sobre `card` y `paper`).
- **Foco visible**: `focus-visible:outline-2 outline-signal outline-offset-2` (hoy una sombra al 6 %).
- Convención: marcar solo «Opcional» (HIG) y quitar los «*».
- Ejemplos de texto (placeholders): quitar los nombres propios en nombre, cargo y empresa («Alex Rivera», «Product Designer», «Estudio Norte»); dejar solo los de formato (`tu@email.com`, `linkedin.com/in/tu-perfil`). Si hace falta una pista, va como ayuda bajo el campo.
- ✔ `rg "border-line bg-" src/components` devuelve una sola definición; todo borde de control mide ≥ 3:1.

**P3.3 · Estados visibles: interruptores, segmentados y pestañas** [A] · A11Y-04
- Interruptor apagado: borde de 2 px `muted` y fondo transparente; encendido, `bg-ink` (hoy 1,60:1).
- Opción elegida de `Segmented` (`form-bits.tsx`) y pestañas de la vista previa: `bg-ink text-paper` (como el día elegido del calendario), no una sombra sobre `card`.
- Borde del botón `danger` con ≥ 3:1.
- ✔ Medido con un script de contraste (puedes partir de `docs/ux/informes/06-…` anexo E): todos los estados ≥ 3:1.

**P3.4 · Avisos: `Notice`, `InlineError`, `SubmitButton` y una región viva global** [M] · COH-08, A11Y-12
- `<Notice tone="ok|error|info">`: caja con icono y «qué ha pasado + qué hacer», `role` según el tono. Sobre fondo oscuro, `text-paper` + icono (no `text-glow`).
- `<InlineError>` para campos.
- Un `SubmitButton` único que siempre muestra «<Verbo>ndo…» (hoy «Enviar mi contacto», «Sí, cancelar» y «Continuar con Google» solo muestran un círculo).
- Una región `<p role="status" class="sr-only">` en el layout, con un helper `announce(text)` para «Enlace copiado» y demás avisos breves (hoy solo cambia un `aria-label`).
- ✔ Los mensajes del anexo B del informe 06 usan uno de estos componentes; al copiar el enlace desde cualquier pantalla, VoiceOver dice «Enlace copiado» una vez.

**P3.5 · Borrar y quitar: dos patrones, sin `window.confirm`** [A] · COH-05, A11Y-11, EDIT-10
- **Permanente o ajeno** (contacto recibido, cuenta): confirmación en línea con dos botones, «Borrar» (`danger`) y «No borrar». Escribir «BORRAR» solo para la cuenta (ya existe).
- **Propio y recuperable** (dato de contacto, reunión de la lista, hora propuesta): sin confirmar y con un aviso «Teléfono quitado · Deshacer» durante 6 s (`role="status"`).
- Eliminar `window.confirm` (`contacts-panel.tsx`, `meetings-panel.tsx`).
- ✔ `rg "window.confirm|confirm\(" src` = 0; cada acción destructiva sigue uno de los dos patrones; quitar un dato se deshace en 1 toque.

**P3.6 · Escala: texto en `rem`, radios y sombras con tokens** [M] · COH-12, A11Y-06, SCAN-04
- Tokens en `src/app/globals.css`: `--text-mark` (0.75rem, mono en mayúsculas, **mínimo 12 px**), `--text-small` (0.875rem), `--text-body` (1rem), `--text-lead` (1.125rem); radios `--radius-control` (12px), `--radius-panel` (24px), `--radius-object` (28px); sombras `press-ink`, `press-signal`, `focus-ring`.
- Sustituir las 41 clases `text-[10px]`/`[11px]`/`[12px]` por la clase `.eyebrow` o `--text-mark` (que escalan con la letra del sistema), y las 24 copias a mano de `.eyebrow` por la clase. Quitar los radios y sombras arbitrarios salvo el arte del pase (`pass-art.tsx` va inline por Satori: **no lo toques**).
- Botones: permitir dos líneas (`whitespace-normal text-balance` con `min-h` en vez de `h`).
- ✔ `rg "text-\[\d+px\]" src` = 0 (fuera de `pass-art.tsx`); `rg "rounded-\[" src` ≤ 3; con `html{font-size:200%}` a 390 px ninguna ruta tiene scroll horizontal.

**P3.7 · Grupos de opciones con flechas** [M] · A11Y-08
- Colores (`quick-card-form.tsx`, `design-field.tsx`), motivos, letras, `Segmented`, pestañas de la vista previa: usar `<input type="radio" class="sr-only">` dentro de `<label>` (como ya hace `meeting-response.tsx`), que da las flechas gratis; las pestañas, patrón ARIA de pestañas con `tabIndex` móvil.
- ✔ En `/crear`, ≤ 11 tabulaciones hasta «Crear mi tarjeta» y la flecha derecha cambia de color.

**P3.8 · Regiones, encabezados e iconos** [M] · A11Y-07, A11Y-16, COH-14
- `/dashboard`: envolver el editor en `<main id="contenido">`; la bienvenida va dentro de `main`, después del H1, como `<section>` con H2 (o su título es el H1 con `?nueva=1`).
- Formulario de reunión: `<section aria-labelledby>` con un H2 visible (hoy es una `p.eyebrow`) y los pasos en H3.
- Nombres accesibles sin símbolos: flechas «↗», «↓», «→» con `aria-hidden`; «Cambiar» suelto → «Cambiar email» / «Cambiar horas»; `target=_blank` con «(se abre en otra pestaña)» en `sr-only`.
- Iconos: `ArrowUpRight` para lo externo (quitar `ExternalLink` y el «↗» de texto), `Trash2` para borrar, `TriangleAlert` solo para avisos.
- ✔ axe sin `landmark-one-main`, `region` ni `heading-order` en `/dashboard?nueva=1` y con el formulario de reunión abierto; `rg "ExternalLink" src` = 0.

---

### P4 · Crear la tarjeta sin pasos de más · rama `feat/ux-p4-crear`

Origen: ONB-01, ONB-05, ONB-06, ONB-14, ONB-16, LIFE-05.

**P4.1 · «Crear mi tarjeta» envía ya el código** [A] · ONB-05
- `src/components/create/create-flow.tsx` + `src/components/auth/email-code-auth.tsx`.
- Si el campo Email del formulario es válido, bajo el botón se ve: «Te mandaremos un código a **lucia@…** para guardarla. · Usar otro email». Al pulsar «Crear mi tarjeta» se envía el código directamente (la misma acción que hoy hace «Enviarme un código», con todos sus límites y el CAPTCHA si está activo) y se pasa al paso del código, con la cabecera «Último paso · Escribe el código».
- «Usar otro email» despliega en línea un campo de email (para separar el email de la cuenta del email visible).
- Si el formulario no tiene email (solo móvil o LinkedIn), se mantiene el paso actual, pero el botón del formulario dice «Continuar», no «Crear mi tarjeta».
- El botón del paso del código es el único que se llama «Crear mi tarjeta» después del formulario.
- «Continuar con Google» sigue apareciendo donde está si `isGoogleAuthEnabled()`.
- ✔ Con email en el formulario: de «Crear mi tarjeta» a las 8 casillas en 1 toque, sin la pantalla «Guárdala con tu email»; ningún botón «Crear mi tarjeta» lleva a otra pantalla que pida más datos. Actualizar `e2e/onboarding.spec.ts`.

**P4.2 · El borrador de `/crear` se guarda mientras escribes** [A] · ONB-01
- `create-flow.tsx` + `src/lib/card/draft-storage.ts`: escribir el borrador en cada cambio (retardo 300 ms) y restaurarlo al hidratar; no llamar a `clearStoredDraft()` al restaurar en el paso del formulario, solo al crear la tarjeta con éxito. Mantener el TTL actual (`DRAFT_TTL_MS`). Todo en `try/catch` (Safari privado).
- ✔ Rellenar 3 campos y el color, recargar: todo sigue igual; lo mismo tras cerrar y reabrir la pestaña antes del TTL.

**P4.3 · No perder el paso del código** [M] · ONB-06
- Guardar en el borrador `{ authEmail, codeSentAt }`. Al restaurar con `pending && authEmail && now - codeSentAt < 10 min`, abrir directamente el paso del código para ese email, con «Ya te enviamos un código a …».
- «Editar mis datos» no desmonta `EmailCodeAuth` (ocultarlo con `hidden` y conservar el estado); si el email no cambió, al volver se muestra el paso del código sin pedir otro.
- ✔ Pedir el código y recargar: aparecen las 8 casillas y `00000000` entra (demo). Pedir el código, «Editar mis datos», «Crear mi tarjeta»: las 8 casillas sin pedir otro.

**P4.4 · Tema inicial distinto** ⚖️ D8 [B] · ONB-16
- `src/lib/card/quick.ts` (`theme: DEFAULT_THEME.id`): elegir el tema inicial en el servidor junto con `initialSeed`, aleatorio entre los 10 y, si hay `de=<slug>`, distinto del de esa tarjeta.
- ✔ `/crear?de=demo` nunca empieza con el tema de la tarjeta `demo` (test unitario con la semilla).

**P4.5 · «Abrir Gmail» abre la app** [B] · ONB-14
- `email-code-auth.tsx` + `src/lib/auth/code.ts`: en iOS (`detectPlatform`), `googlegmail://` para Gmail y `message://` para el resto («Abrir Mail»); en Android y escritorio, la URL web actual.
- ✔ Con un User-Agent de iOS y un email `@gmail.com`, el enlace es `googlegmail://` (test unitario).

**P4.6 · Erratas en el email y cuentas duplicadas** ⚖️ D3 [A] · LIFE-05
- Sugerencia de dominio en el cliente, en `/login` y en `/crear`, antes de enviar: «¿Querías decir carlos@**gmail.com**?» con «Sí, corregir» (lista corta: gmial/gmai/gamil/gmail.co, hotmial/hotmal, outlok/outllok, yaho, icloud.con…). Función pura en `src/lib/auth/` con tests.
- Con D3 = (b): en `/crear` con sesión y sin tarjeta, cambiar «Con tu cuenta X.» por «Has entrado como **X**. ¿Ya tenías tarjeta con otro email? Cerrar sesión y entrar con ese». En `/login`, quitar «Si es tu primera vez, se crea tu cuenta al entrar».
- Con D3 = (a): `shouldCreateUser: false` en `src/app/login/actions.ts` y, si la cuenta no existe, quedarse en el paso del email con «No hay ninguna tarjeta con … ¿Lo has escrito bien? · Crear una tarjeta nueva con este email». Las cuentas solo se crean en `/crear`.
- ✔ `gmial.com` muestra la sugerencia; con D3 = (b), un usuario sin tarjeta en `/crear` ve la salida «entrar con otro email».

---

### P5 · La tarjeta pública · rama `feat/ux-p5-tarjeta`

Lo que ve quien escanea. Origen: SCAN-01–10, SCAN-14, SCAN-15, SCAN-17, SCAN-18, ONB-10, ONB-11, ONB-15, ONB-20, A11Y-06, A11Y-09, COH-03, COH-06, MEET-10, MEET-26.

**P5.1 · Jerarquía: la tarjeta de la otra persona es la protagonista** [M] · SCAN-05, ONB-11, COH-06
- `create-yours.tsx` (barra superior: hoy `ink`, 36 px, «Crea la tuya gratis»): variante `outline`, alto 44 px, texto «Crear la mía».
- «Guardar contacto» es el único botón `signal` de la primera pantalla.
- El bloque oscuro del final se mantiene (es el que vende); su botón pasa a `paper` sobre el fondo oscuro.
- ✔ En la primera pantalla del iPhone 15 y del Pixel 7 solo hay un botón relleno: «Guardar contacto».

**P5.2 · Orden y forma de las acciones secundarias** [M] · SCAN-08, ONB-20, A11Y-09, SCAN-07
- `src/app/u/[slug]/page.tsx`: primero «Déjale tu contacto» (el gesto recíproco), después la reunión.
- Las dos con el mismo patrón visual: borde sólido `hairline`, icono en un círculo `signal-wash`, flecha a la derecha (hoy una es sólida y otra discontinua).
- `aria-expanded` + `aria-controls`; el subtítulo va en `aria-describedby` (no en el nombre del botón).
- Una vez abierto, un botón «Cerrar» (44×44, arriba a la derecha) que lo pliega y devuelve el foco. Abrir uno pliega el otro.
- ✔ En `/u/demo`, el primer bloque bajo la tarjeta es «Déjale tu contacto»; VoiceOver anuncia «… botón, contraído»; cada panel abierto se puede cerrar.

**P5.3 · «Guardar contacto» con respuesta, sobre todo en Android** [A] · SCAN-02, ONB-10, SCAN-17, ONB-15
- `profile-card.tsx`: convertir el botón en un componente cliente pequeño.
- Fuera de iOS (descarga como adjunto): al pulsar, mantener la descarga y mostrar bajo el botón, en línea (no modal): «Casi está. Abre **Alex Rivera.vcf** para guardarlo en tus contactos.» + un dibujo simple de la barra de descargas con «Abrir» resaltado + «¿No lo ves? Volver a descargar».
- En todos: al volver a la pestaña (`visibilitychange`) o tras el clic, el botón pasa a «Contacto guardado» (variante `outline`, con check) y aparece debajo, con la animación `rise` existente: «¿Y tú? **Déjale el tuyo a Alex** · **Crear mi tarjeta**». El primero abre el formulario y hace scroll hasta él.
- El botón redondo de compartir junto a «Guardar contacto» sale de ahí: «Guardar contacto» a todo el ancho y, bajo los datos de contacto, un enlace de texto «Pasarle esta tarjeta a alguien» (con el icono de compartir de cada plataforma: `Share` en iOS, `Share2` en el resto; en escritorio, «Enlace copiado» visible).
- ✔ En el Pixel 7, tras pulsar «Guardar contacto», aparece el texto que nombra el archivo; tras volver a la pestaña, el botón dice «Contacto guardado» y se ve la invitación sin scroll; en la primera pantalla hay un único botón de acción.

**P5.4 · Letra grande y pantallas estrechas** [A] · SCAN-03, A11Y-06, SCAN-14, SCAN-18
- `profile-card.tsx`: `grid-cols-[minmax(0,1fr)_auto]` (si queda alguna rejilla tras P5.3); los datos de contacto nunca con puntos suspensivos (email y teléfono con `break-all`, el resto con `break-words`).
- Nombre: `clamp(2rem, 1.6rem + 2vw, 2.7rem)` y además más pequeño según la longitud (> 24 caracteres y > 36); `text-wrap: balance`; cortar solo en espacios o tras un guion (no `overflow-wrap: anywhere` a mitad de palabra).
- Quitar la etiqueta «TARJETA DE CONTACTO» de la cabecera de la tarjeta pública (no aporta; el logo ya está arriba).
- Horizontal (`@media (max-height: 500px)`): menos margen superior y nombre a `2rem`, para que «Guardar contacto» asome en la primera pantalla.
- ✔ A 360 px con `html{font-size:130%}`: «Guardar contacto» y el email completos, sin scroll horizontal; con un nombre de 52 caracteres, «Guardar contacto» se ve en una primera pantalla de 780 px; en el Pixel 7 en horizontal asoma «Guardar contacto».

**P5.5 · Cada fila dice qué hace; teléfono y WhatsApp** [M] · SCAN-10
- `profile-card.tsx`: sustituir la flecha ↗ común por un verbo corto a la derecha según el tipo: «Llamar», «Escribir» (email), «Abrir» (webs y redes), «WhatsApp».
- Filas `phone` con prefijo internacional: un segundo botón de icono WhatsApp (44×44) que abre `wa.me/<número>` (construido con `linkHref()` o una función hermana con tests; nunca concatenando el valor sin validar).
- `src/lib/card/demo.ts`: teléfono visible en la tarjeta demo.
- ✔ Cada fila dice qué pasa al tocarla; una tarjeta con móvil +34 ofrece llamar y WhatsApp.

**P5.6 · «Déjale tu contacto» en 3 toques** ⚖️ D2 [M] · SCAN-06, SCAN-09, COH-03
- `contact-form.tsx`: orden Nombre → **Móvil** → Email, con «Con el móvil o el email basta.» bajo el título; el error de «al menos uno» marca **los dos** campos (`src/lib/card/contact.ts`); Empresa y Mensaje plegados tras «+ Añadir empresa o un mensaje»; contador «0/500» a partir de 400 caracteres.
- Con D2 = (a): sin casilla, y bajo el botón: «Al enviar, Alex recibe tu nombre y lo que escribas. Más info». Con D2 = (b): la fila de la casilla mide ≥ 44 px y su error sale junto al botón.
- «Más info» abre `/privacidad#contactos` en otra pestaña (o despliega dos frases en línea), y lo escrito se guarda en `sessionStorage` para no perderlo al volver.
- Textos: botón, título y envío con el mismo verbo («Déjale tu contacto a Alex» / «Dejarle mi contacto»). Confirmación sin «Ya tenemos tus datos»: «¿Te haces tu propia tarjeta? **Empieza con lo que acabas de escribir.**». Respuesta según el canal: con teléfono, «Alex te llamará o te escribirá cuando pueda.»; solo con email, «Alex te escribirá cuando pueda.»
- ✔ Con nombre y móvil, enviar cuesta 3 toques (abrir, móvil, enviar) con D2 = (a); con el formulario vacío, el error resalta Móvil y Email; ningún texto dice «tenemos tus datos».

**P5.7 · Tras enviar, una sola llamada a crear** [M] · SCAN-01, MEET-10
- `src/app/u/[slug]/page.tsx`: cuando el formulario de contacto o el de reunión está enviado, ocultar el bloque oscuro de crear y, si se envió la reunión, también «Déjale tu contacto» (Alex ya tiene los datos). Requiere convertir la parte inferior en un pequeño componente cliente o compartir el estado por contexto.
- ✔ Tras enviar, en la página hay un solo botón naranja.

**P5.8 · Escritorio: pasarse la tarjeta al móvil** [B] · SCAN-15
- `page.tsx`: a partir de 1024 px, una columna lateral con el QR de la tarjeta (`QrCode`, `?src=qr`) y «Escanéalo con tu móvil para guardar a Alex».
- ✔ A 1440 px se ve el QR y abre `/u/<slug>?src=qr`.

---

### P6 · Reuniones, parte 1 (sin migraciones) · rama `feat/ux-p6-reuniones`

Origen: MEET-01, MEET-03, MEET-05, MEET-06, MEET-08, MEET-09, MEET-11–13, MEET-15, MEET-18, MEET-19, MEET-21–23, MEET-25, COH-04. Pregunta D1 y D2 antes de empezar.

**P6.1 · Verbo único** ⚖️ D1 [M] · COH-04, MEET-12
- Aplicar el verbo elegido en el botón de la tarjeta, títulos, emails (`src/lib/meetings/emails.ts`), privacidad y editor. Interruptor del dueño: «Recibir propuestas de reunión».
- ✔ `rg` del verbo descartado en `src/` = 0.

**P6.2 · Quien propone se queda con algo en la mano** [A] · MEET-01
- `src/app/u/[slug]/meeting-actions.ts`: devolver también `guestPath` (`meetingPath(id, "guest")`; en demo `/reunion/demo/invitado`).
- `meeting-request.tsx` (`SentMessage`): botón `outline` **«Ver o cancelar mi propuesta»** y el texto «Si Alex no responde antes del {primera hora}, la propuesta caduca sola.»
- ✔ Tras enviar, en el mismo viewport hay un enlace a la página de invitado y desde ella «Cancelar propuesta» funciona.
- (El email al invitado cuando caduca va en P8.2.)

**P6.3 · «Confirma con un toque» de verdad** [A] · MEET-03
- `meeting-response.tsx`: con `?hora=N` válido, arriba del todo un bloque compacto: «¿Confirmas el **martes 6** a las **12:30**?», «Con Lucía Martín (Mirador) · 30 min · En persona · Café Central», botón a todo el ancho «Confirmar 12:30», y debajo «Elegir otra de sus horas» (despliega los radios) y la fila «Proponer otras horas · No puedo». La ficha de Lucía y el tema, después. Se mantiene el segundo toque (protege de los antivirus del correo).
- ✔ En iPhone 15 (393×659), al abrir `/reunion/demo/anfitrion?hora=1`, «Confirmar 12:30» se ve entero sin scroll. Test E2E.

**P6.4 · El selector abre en un día útil** [M] · MEET-05, MEET-22
- `slot-picker.tsx`: abrir en el primer día laborable con ≥ 4 horas libres (desde las 15:00, mañana; si mañana es sábado, el lunes). Sábados y domingos con la etiqueta atenuada (se pueden elegir). Añadir un grupo plegado «Más temprano o más tarde» (8:00–8:30, 20:00–21:00) en `src/lib/meetings/time.ts` (`TIME_GROUPS`), comprobando que el esquema del servidor lo acepta.
- «Elegir otra fecha»: insertar el día ordenado en la tira y `scrollIntoView({ inline: "center" })` del día activo.
- ✔ Abriendo el paso 1 un lunes a las 17:50, el día activo es el martes y ninguna hora de la primera fila está apagada. Test unitario con `now` fijo.

**P6.5 · El filtro anti-enlaces no rechaza texto normal** [M] · MEET-06
- `src/lib/meetings/schema.ts` (`LINKISH_RE`, `PHONEISH_RE`, `NAME_RE`):
  - Dominios: exigir `www.`, `://`, `/` o un TLD de una lista (com, es, net, org, io, app, dev, co, eu, info, me…) **seguido de fin o espacio**. «Expo.Pack» y «S.L.» pasan; «visita www.x.com» y «acme.io/precios» no.
  - Teléfonos: no contar como teléfono una fecha `dd-mm-aaaa`/`dd/mm/aaaa` ni una hora.
  - Nombre: admitir `,` y `()`.
  - Mensajes que señalan el fragmento: «“Expo.Pack” parece un enlace. Escríbelo sin el punto.» / «“612 345 678” parece un teléfono: ponlo en su campo.»
- **Seguridad:** este filtro existe porque los emails van a direcciones sin verificar (ver `AGENTS.md`). No lo debilites para enlaces o teléfonos reales: añade tests con los casos que deben seguir fallando.
- ✔ «Nos vimos en Expo.Pack», «Grupo Aranda S.L.», «Reunión el 27-10-2026» y «Marta (Aranda)» pasan; «visita www.x.com», «llámame al 612345678» y «acme.io/precios» fallan, y el mensaje cita el fragmento. Tests unitarios.

**P6.6 · Paso 2 más corto y que no se pierde** ⚖️ D2 [M] · MEET-08, MEET-09, MEET-23
- Casilla: según D2 (igual que P5.6). Con (a), bajo «Enviar propuesta»: «Al enviar, Alex recibe tu nombre, email y teléfono, y PassMe te escribe solo sobre esta reunión. Más info».
- Título del paso 2: «¿Cómo te **avisamos**?» con el subtítulo «Te escribimos aquí cuando Alex elija una hora.». El tema, un `textarea` de 2 líneas con el ejemplo «Nos conocimos en… · Me gustaría hablar de…».
- Historial: `history.pushState` al pasar al paso 2 (`#reunion-2`) y `popstate` vuelve al paso 1; guardar el estado en `sessionStorage` (con `try/catch`) y, al recargar en la misma sesión, reabrir el formulario donde estaba.
- ✔ En el paso 2, «atrás» del navegador muestra el paso 1 con las horas; recargar en el paso 2 vuelve al paso 2 relleno.

**P6.7 · Lugar con mapas y enlace de vídeo de quien propone** [M] · MEET-11
- Lista blanca de mapas igual que la de vídeo (`maps.app.goo.gl`, `goo.gl/maps`, `google.com/maps`, `maps.apple.com`) para el lugar; en la página firmada y en el `.ics` se muestra como «Cómo llegar». En el paso 1, con Videollamada, campo opcional «Enlace (si ya lo tienes)» con la lista blanca de vídeo existente.
- **Seguridad:** los emails al invitado siguen sin incluir enlaces escritos por el visitante (texto fijo); los enlaces solo aparecen en páginas firmadas y en el `.ics` del dueño, como hoy con el vídeo. Revisa `AGENTS.md` y `src/lib/meetings/emails.ts` antes de tocarlo.
- ✔ `https://maps.app.goo.gl/…` se acepta como lugar; un enlace de Teams puesto por la visitante llega a la invitación de los dos.

**P6.8 · «Proponer otras horas» sin empezar de cero** [M] · MEET-13
- Tras un «no puedo» o una cancelación, «Proponer otras horas» abre en la misma página firmada el selector (el `CounterPanel` que ya existe) y crea una propuesta nueva con los datos de la anterior (en el servidor, a partir del enlace firmado). Si es demasiado, la alternativa: `/u/<slug>?reunion=1` con nombre, email y empresa precargados vía `rememberDetails`.
- ✔ De «Alex no puede esta vez» a una propuesta nueva enviada: día + hora + enviar, sin reescribir datos.

**P6.9 · El email que recibe el invitado es el de la tarjeta** [M] · MEET-15
- `src/lib/meetings/model.ts`, `view.ts`, `emails.ts`, `meeting-response.tsx`: usar el primer dato de contacto de tipo email **visible** de la tarjeta; si no hay, el de login. `ConfirmPanel`: «Lucía recibirá la invitación con tu email **alex@estudionorte.com**.»
- ✔ Con un login distinto del email de la tarjeta, la invitación y el email al invitado muestran el de la tarjeta, y la página lo dice antes de confirmar.

**P6.10 · Un solo punto de entrada para quedar** [M] · MEET-18
- Si la tarjeta tiene un enlace `booking` **y** reuniones activas: el enlace no se repite en la lista y el paso 1 añade bajo el título «¿Prefieres ver sus huecos libres? Abrir su calendario».
- En el editor, al añadir un enlace de reservas con las reuniones activas: «Ya recibes propuestas de reunión. Con Calendly o Cal.com, la gente podrá elegir entre los dos.»
- ✔ Con los dos activos, en la tarjeta hay un único punto de entrada visible para quedar.

**P6.11 · Rechazar desde el editor** [M] · MEET-19
- `meetings-panel.tsx`: en «Te toca responder», la papelera ofrece «Decir que no (le avisamos con un mensaje amable)» → `decline`, y «Quitar sin avisar (es spam)».
- ✔ Desde el editor se rechaza una propuesta pendiente en 1 toque y el invitado recibe el email de «no puede esta vez».

**P6.12 · Pulido de emails y `.ics`** [B] · MEET-21, MEET-25
- `emails.ts` + `src/lib/email-layout.ts`: todos los botones de hora con el mismo estilo (contorno de tinta) y la duración en el texto («mar 6 oct · 10:00–10:30»); primera línea «Lucía Martín (Mirador) vio tu tarjeta y te propone 2 horas. Toca la que te venga bien.»
- `.ics` y enlace de Google: misma descripción en página y email, en líneas («Con: …», «Email: …», «Teléfono: …», «Tema: …»), sin paréntesis anidados. Alarma de 1 h en persona y de 10 min en vídeo o llamada.
- ✔ En el HTML del email ningún botón de hora tiene el fondo naranja; el `.ics` del dueño y su enlace de Google tienen la misma descripción. Tests unitarios.

---

### P7 · El editor · rama `feat/ux-p7-editor`

Origen: EDIT-03, EDIT-04, EDIT-07–09, EDIT-12, EDIT-13, EDIT-16, EDIT-17, EDIT-22, EDIT-23, A11Y-11. Pregunta D6.

**P7.1 · Estructura: «Tarjeta · Bandeja · Actividad»** ⚖️ D6 [A] · EDIT-04, EDIT-12, MEET-16
- Con D6 = (a): bajo la cabecera, un control segmentado fijo **«Tarjeta» · «Bandeja (n)» · «Actividad»** (estado en la URL: `?vista=bandeja`, para enlazarlo desde los emails: el email de contacto nuevo hoy enlaza a `/dashboard#contactos`).
  - «Tarjeta»: 01 Quién eres, 02 Cómo contactarte, 03 Estilo, 04 Tu página (P7.2), 05 Publicación y enlace, y la cartera.
  - «Bandeja»: Reuniones y Contactos recibidos, con contador de pendientes.
  - «Actividad»: estadísticas.
  - Cuenta: en el menú de la cabecera (P2.8).
  - Escritorio: dos columnas; la derecha solo con la vista previa fija y la cartera (sin scroll propio), y la Bandeja/Actividad como pestañas.
- Con D6 = (b): índice fijo «01 Quién eres ▾» en la cabecera para saltar entre secciones, y en móvil «Reuniones» y «Contactos recibidos» suben por encima de «Estilo» cuando tienen elementos.
- ✔ En el iPhone, llegar a responder una reunión o a cerrar sesión cuesta ≤ 2 toques y ningún scroll largo; a 1440×900 la vista previa está siempre visible mientras se edita.

**P7.2 · «Tu página»: las funciones de la página, separadas de publicar** [M] · EDIT-13
- Nueva sección con dos filas cortas: «{Verbo de D1}» («Te proponen hora y la confirmas desde el email») y «Recibir contactos» («Un formulario para que te dejen sus datos»). «Publicación» se queda con el interruptor de publicar y el enlace.
- La vista previa «Al escanear» muestra esos botones (sin acción) cuando están activos: hoy `profile-card.tsx` no los pinta en `preview`.
- ✔ Al activar o desactivar cada opción, la vista previa los muestra u oculta.

**P7.3 · Datos de contacto manejables** [A] · EDIT-07, EDIT-08, A11Y-11
- `links-editor.tsx`:
  - Fila compacta (≤ 72 px en el iPhone): icono · valor · un solo botón «⋯» (44×44) con un menú: «Ocultar de la tarjeta / Mostrar», «Subir al principio», «Cambiar tipo», «Duplicar», «Quitar» (con deshacer, P3.5).
  - Reordenar arrastrando un asa de 44 px (pulsación larga en táctil; flechas de teclado como alternativa accesible). Sin librerías nuevas pesadas: si hace falta una, justifícala en el PR.
  - Sustituir los 13 chips de «Añadir» por un campo **«Pega un enlace, email o teléfono»** que detecta el tipo (`linkedin.com` → LinkedIn, `@` sin espacios → Email, `+34…` → Teléfono, `wa.me` → WhatsApp, `instagram.com` → Instagram…, cualquier otra URL → Web) + «Elegir tipo…» con la lista completa. La detección, función pura con tests en `src/lib/card/`.
  - Un solo tipo de web: fusionar «Web» y «Enlace» (`custom`) en «Web» con título opcional (si está vacío, se muestra el dominio). Los `custom` existentes se leen como `website` (mismo patrón que `toPatternKind()` con los motivos retirados) y, si cambias el `CHECK`, **migración nueva** y fallback.
- ✔ Todos los controles ≥ 44 px; pegar `https://www.behance.net/pablo` crea una Web en 2 toques; mover del 15 al 1 en ≤ 2 gestos; la lista de tipos no tiene «Enlace».

**P7.4 · Vista previa siempre a mano en el móvil** [A] · EDIT-03
- Por debajo de 1024 px, cuando la vista previa sale de la pantalla: una píldora fija de 64 px con la miniatura del pase, encima de la barra de guardar (o en su lugar si no hay cambios). Al tocarla, una hoja inferior con la vista previa completa y sus tres pestañas, sin perder la posición de scroll.
- ✔ Desde cualquier campo del editor en el iPhone, el pase actualizado se ve con 1 toque.

**P7.5 · Encuadrar la foto** [M] · EDIT-09
- `avatar-field.tsx`: tras elegir la foto, hoja «Encuadra tu foto» con máscara circular, arrastrar y pellizcar (deslizador de zoom en escritorio), «Usar foto» y «Cancelar». El recorte se aplica en el cliente antes de subir (como hoy el recorte central).
- HEIC sin soporte: «Tu navegador no abre fotos HEIC. Expórtala como JPG o hazle una captura.» Ayuda: «Podrás encuadrarla. Sale en el pase y al guardar tu contacto.»
- ✔ Se reencuadra antes de usarla; un HEIC no compatible da el mensaje específico.

**P7.6 · Descartar cambios** [M] · EDIT-10
- `SaveBar`: con cambios, «Descartar» (`ghost`) a la izquierda de «Guardar», usando el `reset` que ya existe en `use-card-draft.ts`.
- ✔ Con cambios pendientes, 1 toque vuelve al estado guardado.

**P7.7 · Estilo: lo avanzado, plegado** [M] · EDIT-16
- `design-field.tsx`: visibles Tema → Motivo → Letra. Tras «Más opciones de estilo»: «Variación» y «Colores a medida» («Fondo» y «Color de los trazos», con campo de texto para pegar el hex además del selector nativo). Arreglar la ayuda de Variación, que nombra solo 3 de los 6 motivos: «Este motivo no tiene variaciones.»
- ✔ Estilo plegado mide ≤ 1.000 px en el iPhone y se puede pegar `#1F3A5F`.

**P7.8 · Enlace de la tarjeta: convierte y sugiere** [B] · EDIT-17
- `slug-field.tsx`: convertir `_` y `.` en `-` y quitar acentos (`normalize("NFD")`) al escribir. Si está cogido: «Ese ya está cogido. ¿Te vale `pablo-serrano-2` o `pabloserrano`?» con chips que lo aplican (comprobando disponibilidad con la acción existente, respetando su límite de peticiones).
- ✔ `pablo_serrano` da `pablo-serrano`; un enlace cogido ofrece 2 alternativas libres.

**P7.9 · «Quién eres» más corto e iniciales mejores** [B] · EDIT-22, EDIT-23
- «Pronombres» y «Ubicación» tras «Añadir más datos» (abierto si ya tienen valor).
- `src/components/card/avatar.tsx`: con 3 palabras o más, iniciales del nombre y de la primera palabra que no sea partícula (de, del, la, las, los, y): «Pablo Serrano Iglesias de la Fuente» → «PS». Aviso bajo el nombre si no cabe en el pase: «En el pase se verá cortado: prueba con nombre y primer apellido.» (Recuerda: `pass-art.tsx` lo renderiza también Satori; no metas hooks ahí.)
- ✔ Tests unitarios de iniciales; con los dos campos vacíos, 01 muestra foto, nombre, cargo, empresa y bio.

---

### P8 · Reuniones parte 2, pases y landing (con migraciones) · rama `feat/ux-p8-…` (puede partirse)

Cambios de más calado. Cada uno, si es grande, en su propio PR.

**P8.1 · Zona horaria del dueño** [A] · MEET-02
- Migración nueva: columna de zona horaria en la tarjeta (por defecto `Europe/Madrid`), tomada del navegador al guardar en el editor. Fallback sin la migración: `Europe/Madrid`.
- El selector del visitante trabaja en la hora del dueño («hora de Madrid, la de Alex») y, si la del visitante es distinta, añade bajo cada pastilla «(09:00 donde estás tú)». Emails y páginas: cada parte ve su zona y, si difieren, la otra entre paréntesis.
- Nombres de zona en español (`Intl.DateTimeFormat("es-ES", { timeZone, timeZoneName: "longGeneric" })` o un mapa corto: Canarias, Nueva York, Ciudad de México, Londres, Lisboa…). Hoy salen «Canary», «New York».
- ✔ Visitante en `Atlantic/Canary`, dueño en `Europe/Madrid`: el email y la página del dueño muestran la hora de Madrid (o las dos); nunca aparece un nombre de zona en inglés.

**P8.2 · Avisar al invitado cuando su propuesta caduca** [M] · MEET-01 (parte 2)
- Email de texto fijo al caducar (desde el cron diario de limpieza), dentro de los topes existentes por dirección y del presupuesto global (`MEETING_EMAIL_DAILY_BUDGET`): asunto «Tu propuesta a Alex ha caducado», botón «Proponer otras horas».
- ✔ Test del cron con una propuesta caducada.

**P8.3 · Invitaciones de calendario que se actualizan solas** ⚖️ D5 [M] · MEET-14
- Con D5 = (a): `METHOD:REQUEST`, organizador `hola@getpassme.com` (el remitente), los dos como asistentes con `RSVP=FALSE`; cancelar → `CANCEL` con el mismo UID; mover → `SEQUENCE+1`. Quitar «Añadir a Google Calendar» del email (lo hace Gmail) y dejarlo solo en la página.
- Reunión confirmada: «Cambiar hora» junto a «Cancelar reunión», que reutiliza el flujo de contrapropuesta con el mismo UID y deja la reunión pendiente hasta que el otro elija (revisar `allowedActions` en `state.ts`).
- ✔ En Gmail, al confirmar aparece el evento sin tocar nada; al cancelar desaparece; mover la hora actualiza el mismo evento (Diego lo verifica con cuentas reales).

**P8.4 · Ajustes de reuniones** [M] · MEET-17
- Migración nueva. Bajo el interruptor, «Ajustes de reuniones» plegado: formatos aceptados (En persona / Videollamada / Llamada), días (L–V por defecto) y franja (9:00–19:00), duración habitual (30 min), enlace de videollamada por defecto (lista blanca), lugar habitual, antelación mínima (2 h). El selector del visitante solo ofrece lo permitido, y el servidor lo valida.
- ✔ Con «solo L–V 9–14» guardado, el selector no ofrece sábados ni tardes; con «Llamada» desmarcada no aparece esa opción.

**P8.5 · Despublicar con confirmación y pase en pausa** [M] · LIFE-09
- Diálogo al desactivar «Publicada»: «¿Despublicar tu tarjeta? Quien escanee tu QR (también los impresos) verá que no está disponible y tu pase quedará en pausa. Puedes volver a publicarla cuando quieras.» [Despublicar] [Cancelar].
- Al despublicar: push del pase de Apple con `voided: true` y un aviso «Tarjeta en pausa»; en Google, `state: "INACTIVE"` (si `GOOGLE_WALLET_LIVE`). Al republicar, restaurarlo. Al borrar la cuenta, empujar el pase anulado antes de borrar los registros. (Ya está en el backlog de `CLAUDE.md`: «que despublicar desactive los pases».)
- ✔ Tras despublicar, el pase aparece anulado en el iPhone y vuelve a activo al republicar (Diego lo verifica).

**P8.6 · Landing: Android, alternativas y preguntas** [M] · LIFE-13, LIFE-16
- Subtítulo del hero sin gestos de una sola plataforma: «Enseñas un QR y tu contacto aparece en su móvil, sea iPhone o Android. Nadie instala nada, y tú eliges qué datos se ven.» Paso 03: «En iPhone, doble clic al botón lateral…» solo si 3.3.1 lo confirma; si no, «Abres la Cartera…».
- Antes del CTA final, «Preguntas rápidas» (`<details>`, cerradas): ¿La otra persona necesita una app? · ¿En qué se diferencia de NameDrop o de un Linktree? · ¿Cuánto cuesta? · ¿Qué datos guardáis? · ¿Y si me arrepiento?
- En escritorio, bajo el teléfono de muestra: «Pruébalo: escanéalo con tu móvil →» (el QR ya es real).
- ✔ El hero no menciona gestos de una sola plataforma; existen las 5 preguntas; la pista se ve a 1440 px.

**P8.7 · Textos legales legibles** [B] · LIFE-15
- `src/components/legal/legal-page.tsx` + `src/lib/legal.ts`: bloque «En 30 segundos» tras la introducción (4 viñetas: solo pedimos tu email; lo oculto no se ve; sin cookies de seguimiento ni IPs en las estadísticas; lo borras todo con un botón), índice con anclas a todas las secciones (`id` en cada una) y fecha actualizada («octubre de 2026»).
- ✔ El índice salta a cada sección en el móvil y la fecha coincide con el último cambio.

---

## 5. No hacer ahora (y por qué)

| Idea | Motivo | Cuándo |
|---|---|---|
| Modo oscuro (D7) | La web «papel» es coherente, el fondo claro ayuda a escanear y no hay roturas en oscuro | Si hay usuarios que lo piden |
| Importar desde LinkedIn / escanear una tarjeta de papel (OCR) | Mucho trabajo, poco frecuente | Fase Pro |
| Inglés en la página pública, emails e `.ics` | Ya en el backlog de `CLAUDE.md` | Antes del primer evento internacional |
| Modo evento (pase en la pantalla de bloqueo por fecha/lugar, etiquetar contactos y reuniones por evento, resumen del día) | Backlog; los informes 01, 05 y 06 detallan dónde viviría | Tras P2 |
| Conectar Google/Outlook para horas ocupadas | Backlog Pro | Con los pagos |
| Varias tarjetas por persona | Backlog Pro | Con los pagos |
| Nota rápida «he conocido a Ana» en «Mi QR» | Buena idea (informe 05), pero ensucia la pantalla más simple | Con el modo evento |
| Sign in with Apple | Coste de configuración; «Continuar con Google» ya está programado | Tras activar Google (`docs/SETUP.md` 1.6) |

---

## 6. Lo que funciona y no hay que romper

- **Tarjeta pública:** carga en < 1 s; el nombre es el protagonista; vCard limpia que respeta lo oculto y se abre en línea en iOS; filas de 68 px con iconos claros; imágenes OG muy cuidadas (`/opengraph-image`, `/u/<slug>/opengraph-image`).
- **«Crear la mía con estos datos»** y la pastilla «Vienes de la tarjeta de Alex Rivera» en `/crear`: la mejor idea del flujo (P1.2 la generaliza).
- **`/crear`:** vista previa del pase que cambia al escribir y al elegir color; errores claros al salir del campo y foco al primer error.
- **Código de acceso:** un único input real con `autocomplete="one-time-code"`, 8 casillas, envío automático al completar, error que vacía y devuelve el foco, cuenta atrás de reenvío, «Cambiar» email, continuación automática si se abre el botón del email en el mismo dispositivo.
- **Bienvenida:** QR grande primero, un solo botón de cartera según la plataforma, saludo a quien te trajo.
- **Editor de estilo:** cada miniatura de tema, motivo y letra usa la propia tarjeta del dueño; «Anterior» en las variaciones.
- **Barra de guardar:** estados claros, Ctrl/⌘+S, aviso al salir con cambios, carteras bloqueadas con «Guarda antes» (P1.4 cambia cuándo se ve, no esto).
- **Enlace de la tarjeta:** comprobación en directo, conversión de espacios y el historial de enlaces (el antiguo redirige y queda reservado).
- **Reuniones:** dos pasos plegados en la tarjeta con foco en cada título; selector con pastillas de 44 px, contador «n/3» y aviso al intentar la cuarta; resumen con «Cambiar» que conserva todo; enlace firmado sin login con segundo toque (protege de los antivirus); texto fijo al invitado; lista blanca de vídeo; topes de emails; estados con títulos humanos.
- **Accesibilidad:** axe limpio en 33 estados; el texto cumple AA en todas partes; `readableOn()` garantiza ≥ 4,5:1 en cualquier color de tarjeta; `prefers-reduced-motion` bien resuelto; foco ejemplar en `/crear` y en la confirmación de `/reunion`.
- **Borrado de cuenta** escribiendo «BORRAR», con el enlace en cuarentena 90 días.
- **Privacidad:** la sección de la landing y la política coinciden con el código (IP con hash y clave, sin cookies de seguimiento, conservación según `cleanup_expired_data()`).

---

## 7. Comprobación final antes de dar todo por cerrado

Cuando estén fusionados P1–P7, repite la auditoría con la misma metodología (modo demo, iPhone 15, Pixel 7, 320 px, texto al 200 %) y verifica la tabla del resumen ejecutivo:

- [ ] Del enlace recibido a enseñar el QR: ≤ 3 toques + 2 campos, 0 scrolls (iPhone, con el email en el formulario).
- [ ] Volver y enseñar el QR: 1 toque desde `/dashboard`; 0 desde el icono de inicio.
- [ ] Dejar un contacto: 3 toques + 2 campos.
- [ ] Confirmar una reunión desde el email: 0 scrolls.
- [ ] Ninguna ruta con scroll horizontal a 320 px ni con el texto al 200 %.
- [ ] axe sin violaciones (incluidas `moderate`) en todas las rutas y estados de error.
- [ ] `rg` del glosario: ningún término descartado en textos visibles.
- [ ] En cada pantalla, como mucho un botón `signal`.
- [ ] `npm run lint`, `typecheck`, `test` y `e2e:demo` en verde.

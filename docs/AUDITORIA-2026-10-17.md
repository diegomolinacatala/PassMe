# Auditoría de seguridad, funcionamiento y móviles modestos (17/10/2026)

Rama `fix/auditoria-seguridad-movil`. Ocho auditores revisaron el código en paralelo, cada uno desde un punto de vista:

1. acceso y sesiones;
2. tarjeta pública y editor;
3. «Agendar reunión»;
4. pases de Wallet, cron y coste de servidor;
5. base de datos;
6. rendimiento en móviles modestos;
7. fallos funcionales;
8. errores silenciosos.

Después, cinco trabajadores arreglaron lo encontrado, cada uno en sus propios archivos, y dos revisores finales (código y seguridad) repasaron el resultado.

**Resultado:** ningún hallazgo crítico. Había unos 60 medios y bajos; están arreglados salvo los que se indican al final.

## Lo más importante

| Antes | Ahora |
|---|---|
| Next.js 16.3.6 con 6 avisos de seguridad altos | 16.3.8, que los corrige todos |
| En iPhone con iOS 15–16.3 no arrancaba el JavaScript de la portada, `/crear` ni la tarjeta pública: una expresión regular con *lookbehind* rompía el archivo entero | Corregida, con un test que impide volver a usarla y `browserslist` desde iOS 15.4 |
| La tarjeta pública descargaba 1.115 KB de JavaScript (Zod y todo «Agendar reunión» aunque nadie lo pulsara) | 695 KB (−38 %): Zod fuera del navegador, formularios de contacto y reunión bajo demanda, QR dibujado en el servidor. Portada 1.108 → 677 KB; `/crear` 1.125 → 715 KB |
| La invitación `.ics` que descarga el invitado llevaba el **email de acceso privado** del dueño | Lleva el email visible de la tarjeta, como el correo |
| Un anónimo podía bloquear las propuestas de una tarjeta (30 pendientes) o provocar que se borraran **reuniones confirmadas** | Como mucho 2 propuestas vivas por email y tarjeta; la limpieza nunca borra reuniones pendientes o por venir |
| Alguien podía registrar el email de otra persona con contraseña directamente en Supabase y entrar después en su cuenta | La app rechaza sesiones con contraseña o anónimas y la base de datos vacía cualquier contraseña |
| Si se cortaba la conexión al guardar, el editor se cambiaba por la pantalla de error y **se perdían los cambios** | Aviso «No hemos podido conectar. Tus cambios siguen aquí.» en todas las acciones; lo escrito mientras se guarda ya no se revierte |
| Un fallo de Supabase al comprobar el código se mostraba como «código incorrecto» y gastaba intentos | Se distingue, se devuelve el intento y se pide repetir |
| Los avisos de «Te dejo mi contacto» no tenían tope global y podían agotar el cupo de Resend que usan los códigos de acceso | 10 al día por dueño y 20 al día en total (`CONTACT_EMAIL_DAILY_BUDGET`); los mismos datos, 2 veces por hora en una tarjeta (una sala con la misma Wi-Fi sí puede dejar sus contactos) |
| La imagen de previsualización (`opengraph-image`) no tenía límite y se cacheaba un año | Límite por IP y caché de 1 h en la CDN |
| Una tarjeta en pausa seguía enviando todos sus datos a los pases ya instalados | El pase en pausa solo dice «Tarjeta en pausa» |
| `/api/health` enseñaba qué secretos estaban configurados | En público solo `{ "ok": true }`; el detalle pide `CRON_SECRET` |

## Por áreas

**Acceso:**
- Cookies `Secure` en producción.
- El botón del email tiene límite por IP y solo acepta `type=email`.
- «Cerrar sesión en todos mis dispositivos» avisa si falla.
- El cierre de sesión rechaza peticiones de otras webs.
- Las IPv4 mapeadas ya no comparten un mismo contador.
- El login del panel privado falla cerrado si la base de datos no responde, y su tope global pasa a 1000 por hora para que nadie pueda dejarte fuera.

**Tarjeta y editor:**
- Fotos de más de 1024 px o que no sean JPEG/PNG/WebP rechazadas al guardar.
- Como mucho 20 fotos de 1 MiB por persona.
- Límite a la comprobación de enlaces.
- Nombres reservados nuevos (`soporte`, `hola`, `equipo`, `passme-…`) solo para enlaces nuevos.
- Los nombres de archivo de la exportación ya no rompen los acentos.
- Si no se pueden cargar los contactos, las reuniones o las estadísticas, el editor lo dice en vez de enseñar «aún no hay nada» o ceros.
- Un ajuste de reuniones oculto ya no bloquea el guardado.
- `mailto:a%` ya no tumba el editor.
- Teléfonos con «(0)» bien marcados.
- El código pegado con texto alrededor se limpia antes de enviarse.
- «Continuar con Google» se oculta dentro de Instagram o LinkedIn (Google no deja entrar desde ahí).
- `/crear` respeta el color elegido al recargar.

**Reuniones:**
- Topes por bandeja normalizada (`ana+1@gmail.com` cuenta como `ana@gmail.com`).
- Un cupo propio para lo que provoca un anónimo.
- `List-Unsubscribe` en los correos al invitado.
- Sin `Reply-To` antes de confirmar.
- El nombre del dueño que parezca un enlace no llega al calendario del invitado.
- Normalización de puntos «disfrazados» (`evil。com`).
- El cron limpia primero y limita los avisos de caducidad.
- Si un correo no sale, la pantalla lo dice.

**Wallet:**
- APNs solo borra dispositivos con el token muerto (antes, un error de configuración los borraba todos).
- 503 en vez de 401 si la base de datos falla, para que Wallet reintente.
- Límites en el *web service*.
- Claves de caché con SHA-256.
- Al borrar la cuenta, el pase de Google pasa a caducado.

**Base de datos** (migración `20261017120000_security_audit.sql`):
- Forma de los enlaces validada.
- Reglas públicas de reuniones por lista blanca.
- Índices para la limpieza.
- Motivos retirados convertidos.
- Permisos sobrantes retirados.
- Un test que vigila que ninguna función nueva quede abierta.

**Rendimiento en móviles modestos:**
- Motivos generativos solo cuando entran en pantalla.
- Escribir el nombre en la portada o en `/crear` ya no redibuja todo en cada letra.
- El editor dibuja una sola vista previa.
- Sin efecto 3D ni desenfoques en el móvil.
- Foto de 320 px en vez de 512.
- Conexión previa a Storage.
- Pantalla de carga para `/crear`.
- Las tres consultas del editor en paralelo.
- Respaldo para las unidades de contenedor en Safari < 16.

**Tests:** 885 unitarios y de base de datos (antes 474) y 362 E2E en verde.

## Pasos manuales (Diego)

1. **Antes de fusionar:** Supabase → *SQL Editor* → pegar `supabase/migrations/20261017120000_security_audit.sql` → *Run*. Debe terminar en *Success*. Después, `npm run doctor` lo confirma. Si tras aplicarla el login diera problemas, el comentario junto al *trigger* `passme_blank_password` trae la línea para quitarlo.
2. Supabase → *Authentication → Sign In / Providers*: **Allow anonymous sign-ins** desactivado y, en *Email*, **Confirm email** activado.
3. Recomendado: activar Turnstile (`docs/SETUP.md` 1.7). Es la defensa contra los envíos masivos de códigos y propuestas que llama a Supabase directamente.
4. Probar en un iPhone viejo (iOS 15 o 16.0–16.3) si hay alguno a mano: la portada, abrir «Agendar reunión» y «Déjale tu contacto» en una tarjeta, y `/crear`.

## Lo que no se ha hecho (y por qué)

- **`node-forge`** (dependencia de `passkit-generator`) tiene un aviso alto sin parche. Solo afecta a *verificar* firmas, y PassMe solo firma pases: no es explotable aquí.
- **Copias de Apple tras borrar la cuenta:** no se pueden retirar. El token desaparece con la cuenta y Wallet recibe 401. Haría falta un borrado diferido (despublicar, avisar y borrar minutos después): es una decisión de producto.
- **Nombres no latinos y emojis en las imágenes del pase:** `next/og` pide esas letras a Google Fonts y a un CDN, con el texto. Para nombres en español no ocurre. Si se abre a otros alfabetos, conviene incluir una fuente Noto y mencionarlo en la privacidad.
- **QR del editor:** sigue dibujándose en el navegador (lo usa el dueño en su móvil; se carga bajo demanda).
- **El aviso de propuesta caducada al invitado** se mantiene (lo pediste en P8), pero con el tope por bandeja normalizada.
- **Zona horaria del dueño:** se sigue tomando del navegador en cada guardado. Si guardas estando de viaje, cambia; mostrarla o fijarla sería otra tarea.

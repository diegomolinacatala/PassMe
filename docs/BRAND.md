# Marca PassMe

> **Pásame tu contacto.** PassMe convierte tu tarjeta de visita en un pase de
> Apple Wallet y Google Wallet. La marca es **papelería cálida**: papel beige,
> tinta café y un naranja suave. El pase se dibuja para cada persona: un
> **motivo generativo** de líneas finas, su variación y la letra del nombre
> hacen que no haya dos iguales.

## 1. Idea

| | |
| --- | --- |
| **Nombre** | *PassMe* se lee «pásame»: lo que dices cuando alguien te pide el contacto. |
| **Promesa** | Tu tarjeta de visita, en la cartera del móvil. Siempre al día, tú decides qué se ve. |
| **Recurso gráfico** | El **motivo**: un arco, líneas que fluyen, la luz de una persiana… dibujados alrededor de tu foto a partir de una semilla que no se ve. «Otra variación» dibuja otro; nadie más tiene el tuyo. |
| **Personalidad** | Sencilla y cercana, con el cuidado de la buena papelería. Editorial, nunca corporativa. |

## 2. Paleta

Pocas tintas, cálidas y suaves.

| Tinta | Hex | Uso |
| --- | --- | --- |
| **Papel** | `#F3EFE6` | El fondo de todo, con un grano sutil. |
| **Café** | `#221B17` | Texto y superficies oscuras. Un negro tostado. |
| **Naranja** | `#E4572A` | El único acento: acciones, enlaces, cursivas de los titulares (3,2:1 sobre papel, para texto grande). |
| **Melocotón** | `#F6C6A6` | El pastel: bloques suaves con texto Café y detalles sobre superficies Café. |

Derivados en `src/app/globals.css` (`--color-*`): `paper-deep #E9E3D6` (arena), `card #FBF9F4`, `ink-soft #463B33`, `muted #6A5F55` (≥ 4,5:1 sobre papel), `line #DBD2C3`, `signal-strong #C24E1C` (rellenos con texto blanco, 4,8:1), `signal-deep #A9421A` (texto pequeño sobre papel y sobre `signal-wash #FBE2D4`).

**Reglas**

- Una superficie, un acento: Naranja sobre papel; Melocotón sobre Café.
- Texto pequeño en naranja, siempre en `signal-deep`.
- Los estados (OK `#1F7A4D`, error `#B42318`) no se usan como decoración.

## 3. Tipografía

| Rol | Familia | Uso |
| --- | --- | --- |
| Display | **Instrument Serif** (regular + *itálica*) | Titulares y el nombre en el pase. La cursiva en naranja marca la frase clave: «Tu tarjeta, *a tu manera.*» |
| Texto / UI | **Geist** | Todo lo funcional, y la letra «Moderna» del pase. |
| Marcas | **Geist Mono**, mayúsculas espaciadas | *Eyebrows*, números de sección (`01`), etiquetas. |

Las tres son OFL; las copias `.woff` de `assets/fonts` alimentan las imágenes generadas en el servidor (Satori).

## 4. El logotipo

Una tarjeta en primer plano con el hueco del avatar y, detrás, el contorno de
otra tarjeta girada: **un contacto que se pasa**.

- **Icono de app / notificaciones**: tarjeta Papel sobre placa Café, recortes y eco en Naranja (`appIconSvg()` en `src/lib/brand.ts`; `npm run brand` regenera favicon, icono de iOS y logo de Google Wallet).
- **En la web**: marca en Café con el eco en Naranja, junto a «Pass*Me*» en Instrument Serif con «Me» en cursiva naranja.
- **En el pase**: la marca se dibuja con la tinta de las etiquetas del propio pase, así siempre se lee.
- No girar más de −6° (es el gesto del *hover*), no añadir sombras, no cambiar proporciones.

## 5. Sistema del pase

El pase es el producto. Anatomía en Apple Wallet (estilo *store card*):

```
┌──────────────────────────────────────────┐
│ ◧ Estudio Norte                           │  logo (tinta de etiquetas) + empresa
├──────────────────────────────────────────┤
│                        ·  ╭────────╮   ·  │
│ Alex Rivera           (  ( ( foto ) )  )  │  banda de arte 375×144 pt,
│                           ╰────────╯      │  generada en el servidor con Satori
├──────────────────────────────────────────┤
│ CARGO               UBICACIÓN             │  campos reales (VoiceOver, Watch)
│ Product Designer    Valencia, ES          │
│                  ▣ QR                     │  sin texto debajo
└──────────────────────────────────────────┘
```

En Google Wallet el arte va en la imagen *hero* (1032×336 px) **sin el nombre**, como piden sus directrices: el motivo alrededor de la marca (con Monograma, la inicial).

**Lo que el usuario edita** (todo, siempre; cada opción se previsualiza con su propia tarjeta):

| Ajuste | Opciones | Dónde vive |
| --- | --- | --- |
| **Tema** | 10 combinaciones suaves: Naranja, Melocotón, Papel, Arena, Caramelo, Terracota, Café, Tinta, Salvia, Mostaza | `CARD_THEMES` en `src/lib/card/design.ts` |
| **Motivo** | Arco, Corriente, Persiana, Pliegue, Halo, Cinta, Monograma, Liso | `pattern` · `src/lib/card/pattern.ts` |
| **Variación** | «Otra variación» vuelve a dibujar el motivo; «Anterior» lo deshace. La semilla nunca se muestra | `pattern_seed` |
| **Letra** | Clásica, Cursiva, Editorial (nombre recto y apellidos en cursiva), Moderna (Geist) | `typeface` · `src/lib/card/design.ts` |
| **Tintas** | Fondo y detalle libres (selector de color), detalle «Auto» | `accent_color`, `detail_color` |

**Los motivos**

| Motivo | Qué dibuja |
| --- | --- |
| **Arco** | Un arco de medio punto que enmarca la foto, como un retrato en su hornacina: relleno tono sobre tono, doble o solo de línea. El motivo por defecto. |
| **Corriente** | Líneas finas que llegan desde el nombre y se abren alrededor de la foto, como el agua al pasar una piedra. |
| **Persiana** | La luz de la tarde entrando por una persiana: unas lamas inclinadas, con su penumbra, que cruzan detrás de la foto. |
| **Pliegue** | La tarjeta doblada como una carta: uno o dos pliegues y el papel que se oscurece suavemente junto a cada uno. |
| **Halo** | Tres discos tintados, descentrados como un eclipse: tono sobre tono. |
| **Cinta** | Una cinta de hilos que pasa bajo el nombre, se retuerce y sube por detrás de la foto. |
| **Monograma** | La inicial en cursiva, enorme y cortada por los bordes, como un sello de papelería. |
| **Liso** | Solo color y el aro de la foto. |

**Reglas del motivo**

- Siempre en la tinta de detalle, con trazos finos (0,4–1 pt) y aire alrededor de la foto; el aro fino de la foto es común a todos.
- Un solo gesto, no un estampado: un arco, una corriente, una luz. Nada que llene la tarjeta de dibujitos.
- Nunca compite con el nombre: los de líneas (Corriente, Cinta) se desvanecen hacia la izquierda; los de tinta plana (Arco, Persiana, Pliegue, Halo, Monograma) son tono sobre tono.
- Sin texto decorativo: ni números de serie ni microtexto. Todo lo que se lee en el pase es información.

**Garantías automáticas**: el texto se pone blanco o Café según el fondo (≥ 4,5:1; en los tonos medios en que el Café no llega, negro); las etiquetas usan la tinta de detalle solo si llega a 4,5:1; si el detalle elegido apenas se ve (< 1,6:1) se sustituye por uno tonal automático.

## 6. Voz

- Tuteo, frases cortas, verbos al principio. «Guárdala en tu cartera.»
- Juega con el nombre sin abusar: *Pásame tu contacto*, *Pásate*.
- Concreto antes que abstracto: «2 min», «0 apps», «8 motivos».
- La privacidad se explica con hechos («lo oculto no sale del servidor»), no con promesas.

## 7. Detalles de oficio

- **Motivo de marca** (`BrandMotif`) como textura: detrás de objetos protagonistas, con viñeta, nunca detrás de texto largo.
- **Marcas de corte** (`.crop-marks`) alrededor de los objetos de escaparate.
- **Números de sección** en mono (`01`, `02`…) y *eyebrows* en mayúsculas espaciadas.

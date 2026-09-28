# Marca PassMe

> **Pásame tu contacto.** PassMe convierte tu tarjeta de visita en un pase de
> Apple Wallet y Google Wallet. La marca es **papelería cálida**: papel beige,
> tinta café y un naranja suave. El pase toma prestado el oficio de la
> **impresión de seguridad** (guilloché, microtexto, números de sello) para
> que cada tarjeta sea única.

## 1. Idea

| | |
| --- | --- |
| **Nombre** | *PassMe* se lee «pásame»: lo que dices cuando alguien te pide el contacto. |
| **Promesa** | Tu tarjeta de visita, en la cartera del móvil. Siempre al día, tú decides qué se ve. |
| **Recurso gráfico** | El **sello**: un rosetón de guilloché generado para cada tarjeta a partir de su número (`Sello Nº 048213`). Nadie más tiene el mismo. |
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
| Texto / UI | **Geist** | Todo lo funcional. |
| Marcas | **Geist Mono**, mayúsculas espaciadas | *Eyebrows*, números de sección (`01`), números de sello, microtexto. |

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
│ SELLO Nº 048213            ╭─────────╮    │
│                           ( guilloché )   │  banda de arte 375×144 pt,
│ Alex Rivera               (  ( foto )  )  │  generada en el servidor con Satori
│                            ╰─────────╯    │
│ PASSME · ALEX RIVERA · PASSME · …         │  microtexto
├──────────────────────────────────────────┤
│ CARGO               UBICACIÓN             │  campos reales (VoiceOver, Watch)
│ Product Designer    Valencia, ES          │
│                  ▣ QR                     │
└──────────────────────────────────────────┘
```

En Google Wallet el arte va en la imagen *hero* (1032×336 px) **sin texto**, como piden sus directrices: guilloché y sello con la marca.

**Lo que el usuario edita** (todo, siempre):

| Ajuste | Opciones | Dónde vive |
| --- | --- | --- |
| **Tema** | 10 combinaciones suaves: Naranja, Melocotón, Papel, Arena, Caramelo, Terracota, Café, Tinta, Salvia, Mostaza | `CARD_THEMES` en `src/lib/card/design.ts` |
| **Tintas** | Fondo y detalle libres (selector de color), detalle «Auto» | `accent_color`, `detail_color` |
| **Motivo** | Sello (rosetón), Ondas (billete), Señal (anillos *contactless*), Liso | `pattern` · `src/lib/card/pattern.ts` |
| **Sello** | Número de 6 cifras que genera el motivo; «Otro sello» lo cambia | `pattern_seed` |

**Garantías automáticas**: el texto se pone blanco o Café según el fondo (≥ 4,5:1; en los tonos medios en que el Café no llega, negro); las etiquetas usan la tinta de detalle solo si llega a 4,5:1; si el detalle elegido apenas se ve (< 1,6:1) se sustituye por uno tonal automático.

## 6. Voz

- Tuteo, frases cortas, verbos al principio. «Guárdala en tu cartera.»
- Juega con el nombre sin abusar: *Pásame tu contacto*, *Pásate*.
- Concreto antes que abstracto: «2 min», «0 apps», «Nº 048213».
- La privacidad se explica con hechos («lo oculto no sale del servidor»), no con promesas.

## 7. Detalles de oficio

- **Guilloché** como textura: detrás de objetos protagonistas, con viñeta, nunca detrás de texto largo.
- **Microtexto** (`.microtext`): línea de mayúsculas diminutas en pies y bordes, como en un billete.
- **Marcas de corte** (`.crop-marks`) alrededor de los objetos de escaparate.
- **Números de sección** en mono (`01`, `02`…) y *eyebrows* en mayúsculas espaciadas.

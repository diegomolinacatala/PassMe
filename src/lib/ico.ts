/**
 * Minimal .ico writer: an ICONDIR header plus one entry per image, each
 * embedding a whole PNG (allowed since Windows Vista and read by every
 * browser). Used by `npm run brand` for src/app/favicon.ico, since sharp
 * can't write ICO. No imports, so the script can load it with Node's type
 * stripping.
 */

export interface IcoImage {
  /** Square size in pixels (1–256). */
  size: number;
  png: Uint8Array;
}

const HEADER_BYTES = 6;
const ENTRY_BYTES = 16;

export function encodeIco(images: ReadonlyArray<IcoImage>): Uint8Array {
  if (images.length === 0) throw new Error("An .ico needs at least one image.");
  const total = HEADER_BYTES + ENTRY_BYTES * images.length + images.reduce((sum, image) => sum + image.png.length, 0);
  const bytes = new Uint8Array(total);
  const view = new DataView(bytes.buffer);

  view.setUint16(0, 0, true); // reserved
  view.setUint16(2, 1, true); // type: icon
  view.setUint16(4, images.length, true);

  let offset = HEADER_BYTES + ENTRY_BYTES * images.length;
  images.forEach(({ size, png }, index) => {
    if (!Number.isInteger(size) || size < 1 || size > 256) throw new Error(`Invalid icon size: ${size}`);
    const entry = HEADER_BYTES + ENTRY_BYTES * index;
    view.setUint8(entry, size === 256 ? 0 : size); // width (0 means 256)
    view.setUint8(entry + 1, size === 256 ? 0 : size); // height
    view.setUint8(entry + 2, 0); // palette colors
    view.setUint8(entry + 3, 0); // reserved
    view.setUint16(entry + 4, 1, true); // color planes
    view.setUint16(entry + 6, 32, true); // bits per pixel
    view.setUint32(entry + 8, png.length, true); // image size
    view.setUint32(entry + 12, offset, true); // image offset
    bytes.set(png, offset);
    offset += png.length;
  });
  return bytes;
}

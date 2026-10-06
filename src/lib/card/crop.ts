/**
 * Framing a photo inside a circle: pure math shared by the crop sheet and its
 * tests. Offsets are in screen pixels, from the viewport's center.
 */

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 4;

export interface CropView {
  /** Image size in pixels. */
  width: number;
  height: number;
  /** Side of the square viewport on screen. */
  viewport: number;
  zoom: number;
  x: number;
  y: number;
}

/** Screen pixels per image pixel: the image always covers the viewport. */
export function displayScale(view: Pick<CropView, "width" | "height" | "viewport" | "zoom">): number {
  return (view.viewport / Math.min(view.width, view.height)) * view.zoom;
}

/** The same view with the zoom in range and the image still covering the circle. */
export function clampView(view: CropView): CropView {
  const zoom = Math.min(Math.max(view.zoom, MIN_ZOOM), MAX_ZOOM);
  const scale = displayScale({ ...view, zoom });
  const maxX = Math.max(0, (view.width * scale - view.viewport) / 2);
  const maxY = Math.max(0, (view.height * scale - view.viewport) / 2);
  return { ...view, zoom, x: Math.min(Math.max(view.x, -maxX), maxX), y: Math.min(Math.max(view.y, -maxY), maxY) };
}

/** New zoom around the center: the point in the middle stays in the middle. */
export function zoomView(view: CropView, zoom: number): CropView {
  const ratio = Math.min(Math.max(zoom, MIN_ZOOM), MAX_ZOOM) / view.zoom;
  return clampView({ ...view, zoom, x: view.x * ratio, y: view.y * ratio });
}

/** The square of the source image that ends up inside the circle. */
export function cropRect(view: CropView): { sx: number; sy: number; size: number } {
  const clamped = clampView(view);
  const scale = displayScale(clamped);
  const size = Math.min(clamped.viewport / scale, clamped.width, clamped.height);
  const sx = clamped.width / 2 - clamped.x / scale - size / 2;
  const sy = clamped.height / 2 - clamped.y / scale - size / 2;
  return {
    sx: Math.min(Math.max(sx, 0), clamped.width - size),
    sy: Math.min(Math.max(sy, 0), clamped.height - size),
    size,
  };
}

/** HEIC/HEIF by type or by name (some browsers leave the type empty). */
export function isHeic(file: { name: string; type: string }): boolean {
  return /hei[cf]/i.test(file.type) || /\.hei[cf]$/i.test(file.name);
}

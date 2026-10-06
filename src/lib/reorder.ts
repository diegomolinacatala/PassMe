/** Small list helpers for drag-and-drop and keyboard reordering. Pure. */

/** A copy of `list` with the item at `from` moved to `to` (both clamped). */
export function moveItem<T>(list: ReadonlyArray<T>, from: number, to: number): T[] {
  const copy = [...list];
  if (from < 0 || from >= copy.length) return copy;
  const target = Math.min(Math.max(to, 0), copy.length - 1);
  const [item] = copy.splice(from, 1);
  copy.splice(target, 0, item!);
  return copy;
}

/**
 * Where a dragged row lands: how many of the *other* rows have their middle
 * above the pointer. `middles` are the other rows' vertical centers, in order.
 */
export function dropIndex(middles: ReadonlyArray<number>, pointerY: number): number {
  return middles.filter((middle) => middle < pointerY).length;
}

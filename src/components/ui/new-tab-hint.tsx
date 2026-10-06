/** For links that open in another tab: says so to screen readers, nothing on screen. */
export function NewTabHint() {
  return <span className="sr-only"> (se abre en otra pestaña)</span>;
}

/** Same, for links named by aria-label. */
export const NEW_TAB_SUFFIX = " (se abre en otra pestaña)";

/**
 * Option groups built from native radios (arrow keys move and select, one Tab
 * stop per group). The radio is an invisible layer over its whole <label>
 * (which must be `relative`), so a tap anywhere on the option lands on it.
 */
export const CHOICE_INPUT = "absolute inset-0 z-10 m-0 size-full cursor-pointer appearance-none opacity-0";

/** The focus outline goes on the option (its <label>), since the radio itself is invisible. */
export const CHOICE_FOCUS =
  "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-signal";

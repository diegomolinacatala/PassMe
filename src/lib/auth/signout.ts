/**
 * "Cerrar sesión" ends the session on this device only; "Cerrar sesión en
 * todos mis dispositivos" (Cuenta) asks for every session explicitly.
 */
export type SignOutScope = "local" | "global";

export function parseSignOutScope(value: unknown): SignOutScope {
  return value === "global" ? "global" : "local";
}

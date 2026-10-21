import "server-only";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import {
  ADMIN_COOKIE,
  ADMIN_SESSION_SECONDS,
  createAdminToken,
  getAdminCredentials,
  isValidAdminToken,
  type AdminCredentials,
} from "./auth";

/** Where the private CRM lives; its cookie is only ever sent there. */
export const CRM_PATH = "/crm";
export const CRM_LOGIN_PATH = "/crm/entrar";

export async function hasAdminSession(credentials: AdminCredentials): Promise<boolean> {
  return isValidAdminToken((await cookies()).get(ADMIN_COOKIE)?.value, credentials);
}

/** "off": no credentials configured (the CRM is a 404); "out": no valid session; "in": signed in. */
export async function adminSessionStatus(): Promise<"off" | "out" | "in"> {
  const credentials = getAdminCredentials();
  if (!credentials) return "off";
  return (await hasAdminSession(credentials)) ? "in" : "out";
}

/** First line of every CRM page: a 404 while the CRM is off, the login page without a session. */
export async function requireAdminSession(): Promise<void> {
  const status = await adminSessionStatus();
  if (status === "off") notFound();
  if (status === "out") redirect(CRM_LOGIN_PATH);
}

/** Server Functions only (cookies can't be set while rendering). */
export async function startAdminSession(credentials: AdminCredentials): Promise<void> {
  (await cookies()).set(ADMIN_COOKIE, createAdminToken(credentials), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: CRM_PATH,
    maxAge: ADMIN_SESSION_SECONDS,
  });
}

export async function endAdminSession(): Promise<void> {
  (await cookies()).delete({ name: ADMIN_COOKIE, path: CRM_PATH });
}

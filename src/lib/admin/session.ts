import "server-only";
import { cookies } from "next/headers";
import {
  ADMIN_COOKIE,
  ADMIN_SESSION_SECONDS,
  createAdminToken,
  isValidAdminToken,
  type AdminCredentials,
} from "./auth";

export async function hasAdminSession(credentials: AdminCredentials): Promise<boolean> {
  return isValidAdminToken((await cookies()).get(ADMIN_COOKIE)?.value, credentials);
}

/** Server Functions only (cookies can't be set while rendering). */
export async function startAdminSession(credentials: AdminCredentials): Promise<void> {
  (await cookies()).set(ADMIN_COOKIE, createAdminToken(credentials), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/admin",
    maxAge: ADMIN_SESSION_SECONDS,
  });
}

export async function endAdminSession(): Promise<void> {
  (await cookies()).delete({ name: ADMIN_COOKIE, path: "/admin" });
}

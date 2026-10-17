import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * Server Actions that touch the account itself: asking whether a link is free
 * (rate-limited per person) and deleting the account (photo first, abort if it
 * can't go, wallet pass withdrawn, then the account).
 */

class Redirect extends Error {
  constructor(readonly url: string) {
    super(`redirect ${url}`);
  }
}

const state = vi.hoisted(() => ({
  user: null as { id: string; email: string | null } | null,
  admin: null as unknown,
  calls: [] as string[],
  listPages: [] as Array<{ data?: Array<{ id: string | null; name: string }>; error?: { message: string } | null }>,
  removeError: null as { message: string } | null,
  deleteUserError: null as { message: string } | null,
  withdraw: vi.fn(),
  slugFree: vi.fn(async () => true),
}));

vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-forwarded-for": "203.0.113.9" }) }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Redirect(url);
  },
}));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: async () => ({ marker: "session-client", auth: { signOut: async () => ({ error: null }) } }),
  getSessionUser: async () => state.user,
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabase: () => state.admin }));
vi.mock("@/lib/data/cards", () => ({
  findOwnerCard: async () => null,
  getPublicCard: async () => null,
  lookupPublicCard: async () => ({ status: "missing" }),
  isSlugAvailable: state.slugFree,
  saveOwnerCard: async () => ({ ok: false, errors: {} }),
}));
vi.mock("@/lib/pass/service", () => ({
  notifyWalletsOfUpdate: async () => undefined,
  withdrawWalletPasses: async (id: string) => {
    state.calls.push(`withdraw:${id}`);
    return state.withdraw(id);
  },
}));

const { checkSlugAction, deleteAccountAction } = await import("@/app/dashboard/actions");

const USER = { id: "11111111-1111-4111-8111-111111111111", email: "ana@example.com" };
const WRITE_US = "No hemos podido borrar la cuenta. Escríbenos y lo hacemos a mano.";

function makeAdmin() {
  let page = 0;
  return {
    storage: {
      from: () => ({
        list: async (folder: string, options: { limit: number }) => {
          state.calls.push(`list:${folder}:${options.limit}`);
          const answer = state.listPages[Math.min(page, state.listPages.length - 1)] ?? { data: [] };
          page += 1;
          return { data: answer.data ?? null, error: answer.error ?? null };
        },
        remove: async (paths: string[]) => {
          state.calls.push(`remove:${paths.join(",")}`);
          return { data: state.removeError ? null : paths.map((name) => ({ name })), error: state.removeError };
        },
      }),
    },
    auth: {
      admin: {
        deleteUser: async (id: string) => {
          state.calls.push(`deleteUser:${id}`);
          return { error: state.deleteUserError };
        },
      },
    },
  };
}

async function redirectOf(promise: Promise<unknown>): Promise<string> {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  if (!(error instanceof Redirect)) throw new Error(`expected a redirect, got ${JSON.stringify(error)}`);
  return error.url;
}

beforeEach(() => {
  state.user = USER;
  state.admin = makeAdmin();
  state.calls = [];
  state.listPages = [{ data: [] }];
  state.removeError = null;
  state.deleteUserError = null;
  state.withdraw.mockReset();
  state.withdraw.mockResolvedValue({ google: "off" });
  state.slugFree.mockClear();
});

describe("checkSlugAction", () => {
  it("answers, and tells whoever asks too often to wait (60 a minute per person)", async () => {
    state.admin = null; // per-instance counters, like tests and demo
    state.user = { id: "slug-asker", email: null };
    for (let i = 0; i < 60; i += 1) expect(await checkSlugAction("ana-gil")).toEqual({ status: "available" });
    expect(await checkSlugAction("ana-gil")).toEqual({
      status: "invalid",
      message: "Demasiadas comprobaciones seguidas. Espera un momento.",
    });
    expect(state.slugFree).toHaveBeenCalledTimes(60);
    // Somebody else is not affected.
    state.user = { id: "another-asker", email: null };
    expect(await checkSlugAction("ana-gil")).toEqual({ status: "available" });
  });

  it("still rejects invalid links without spending the budget, and needs a session", async () => {
    state.admin = null;
    state.user = { id: "slug-asker-2", email: null };
    for (let i = 0; i < 100; i += 1) expect((await checkSlugAction("no")).status).toBe("invalid");
    expect(await checkSlugAction("ana-gil")).toEqual({ status: "available" });
    state.user = null;
    expect(await checkSlugAction("ana-gil")).toEqual({ status: "invalid", message: "Tu sesión ha caducado." });
  });
});

describe("deleteAccountAction", () => {
  it("empties the avatar folder page by page, withdraws the wallet pass, then deletes the account", async () => {
    state.listPages = [
      { data: [{ id: "f1", name: "a.jpg" }, { id: "f2", name: "b.jpg" }] },
      { data: [{ id: "f3", name: "c.jpg" }] },
      { data: [] },
    ];
    expect(await redirectOf(deleteAccountAction("borrar"))).toBe("/?cuenta=borrada");
    expect(state.calls).toEqual([
      `list:${USER.id}:100`,
      `remove:${USER.id}/a.jpg,${USER.id}/b.jpg`,
      `list:${USER.id}:100`,
      `remove:${USER.id}/c.jpg`,
      `list:${USER.id}:100`,
      `withdraw:${USER.id}`,
      `deleteUser:${USER.id}`,
    ]);
  });

  it("does nothing without the exact confirmation, or without a session", async () => {
    expect(await deleteAccountAction("borra")).toEqual({ ok: false, error: 'Escribe "BORRAR" para confirmar.' });
    state.user = null;
    expect(await deleteAccountAction("BORRAR")).toEqual({ ok: false, error: "Tu sesión ha caducado." });
    expect(state.calls).toEqual([]);
  });

  it("ignores folders, which hold nothing to remove", async () => {
    state.listPages = [{ data: [{ id: null, name: "subcarpeta" }] }];
    expect(await redirectOf(deleteAccountAction("BORRAR"))).toBe("/?cuenta=borrada");
    expect(state.calls.some((call) => call.startsWith("remove:"))).toBe(false);
  });

  it("keeps the account when the folder can't be listed, and logs it with the user id", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    state.listPages = [{ error: { message: "storage down" } }];
    expect(await deleteAccountAction("BORRAR")).toEqual({ ok: false, error: WRITE_US });
    expect(state.calls.some((call) => call.startsWith("deleteUser") || call.startsWith("withdraw"))).toBe(false);
    expect(errorLog).toHaveBeenCalled();
    expect(String(errorLog.mock.calls[0]![0])).toContain(USER.id);
    errorLog.mockRestore();
  });

  it("keeps the account when a photo can't be removed", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    state.listPages = [{ data: [{ id: "f1", name: "a.jpg" }] }];
    state.removeError = { message: "forbidden" };
    expect(await deleteAccountAction("BORRAR")).toEqual({ ok: false, error: WRITE_US });
    expect(state.calls.some((call) => call.startsWith("deleteUser"))).toBe(false);
    expect(String(errorLog.mock.calls[0]![0])).toContain(USER.id);
    errorLog.mockRestore();
  });

  it("gives up (and keeps the account) if the folder never empties", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    state.listPages = [{ data: [{ id: "f1", name: "stubborn.jpg" }] }];
    expect(await deleteAccountAction("BORRAR")).toEqual({ ok: false, error: WRITE_US });
    expect(state.calls.filter((call) => call.startsWith("list:")).length).toBe(20);
    expect(state.calls.some((call) => call.startsWith("deleteUser"))).toBe(false);
    errorLog.mockRestore();
  });

  it("reports a failed deleteUser", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    state.deleteUserError = { message: "constraint" };
    expect(await deleteAccountAction("BORRAR")).toEqual({ ok: false, error: WRITE_US });
    expect(String(errorLog.mock.calls[0]![0])).toContain(USER.id);
    errorLog.mockRestore();
  });

  it("without the secret key it can't delete, and says so", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    state.admin = null;
    expect(await deleteAccountAction("BORRAR")).toEqual({ ok: false, error: WRITE_US });
    expect(state.calls).toEqual([]);
    errorLog.mockRestore();
  });
});

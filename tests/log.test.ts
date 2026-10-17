import { afterEach, describe, expect, it, vi } from "vitest";
import { isTransientAuthError } from "@/lib/auth/otp-errors";
import { log, serializeError } from "@/lib/log";

describe("serializeError", () => {
  it("keeps what supabase-js and PostgREST put on their errors", () => {
    const postgrest = { message: "duplicate key", code: "23505", details: "Key (slug)=(ana) already exists.", hint: "pick another" };
    // Which key clashed stays; the value (it can be someone's email) doesn't.
    expect(serializeError(postgrest)).toEqual({ ...postgrest, details: "Key (slug)=(…) already exists." });

    const auth = Object.assign(new Error("Too many requests"), { name: "AuthApiError", status: 429, code: "over_request_rate_limit" });
    expect(serializeError(auth)).toMatchObject({
      name: "AuthApiError",
      message: "Too many requests",
      status: 429,
      code: "over_request_rate_limit",
    });
  });

  it("never copies a rejected row (a visitor's name, email, phone) into the log", () => {
    const check = {
      message: 'new row violates check constraint "meeting_requests_guest_email_no_control"',
      code: "23514",
      details: "Failing row contains (5f1c…, Marta Gil, marta@example.com, +34 600 000 000, …).",
    };
    const out = serializeError(check)!;
    expect(out.message).toContain("meeting_requests_guest_email_no_control");
    expect(JSON.stringify(out)).not.toMatch(/marta|600 000/);
  });

  it("keeps the cause chain and a trimmed stack", () => {
    const root = new TypeError("socket hang up");
    const wrapped = new Error("fetch failed", { cause: root });
    const out = serializeError(wrapped)!;
    expect(out.name).toBe("Error");
    expect((out.cause as Record<string, unknown>).message).toBe("socket hang up");
    expect((out.cause as Record<string, unknown>).name).toBe("TypeError");
    const stack = String(out.stack);
    expect(stack).toContain("fetch failed");
    expect(stack.split("\n").length).toBeLessThanOrEqual(6);
  });

  it("stops following causes that loop", () => {
    const a = new Error("a");
    const b = new Error("b", { cause: a });
    (a as { cause?: unknown }).cause = b;
    expect(() => JSON.stringify(serializeError(a))).not.toThrow();
  });

  it("handles things that aren't errors", () => {
    expect(serializeError(undefined)).toBeUndefined();
    expect(serializeError("boom")).toEqual({ message: "boom" });
    expect(serializeError(42)).toEqual({ message: "42" });
    expect(serializeError(null)).toEqual({ message: "null" });
  });

  it("leaves out fields that aren't there", () => {
    const out = serializeError({ message: "x" })!;
    expect(Object.keys(out)).toEqual(["message"]);
  });
});

describe("log", () => {
  afterEach(() => vi.restoreAllMocks());

  it("writes the error details into the line", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    log.error("deleteUser failed", { userId: "u1" }, { message: "nope", code: "unexpected_failure", status: 500 });
    const line = String(spy.mock.calls[0]![0]);
    expect(line.startsWith("[passme] ")).toBe(true);
    const entry = JSON.parse(line.slice("[passme] ".length));
    expect(entry).toMatchObject({ level: "error", message: "deleteUser failed", userId: "u1", error: { code: "unexpected_failure", status: 500 } });
  });
});

describe("isTransientAuthError", () => {
  it("tells 'we couldn't judge the code' from 'the code is wrong'", () => {
    expect(isTransientAuthError({ status: 429 })).toBe(true);
    expect(isTransientAuthError({ status: 500 })).toBe(true);
    expect(isTransientAuthError({ status: 502 })).toBe(true);
    expect(isTransientAuthError({ status: 0 })).toBe(true);
    expect(isTransientAuthError({ name: "AuthRetryableFetchError" })).toBe(true);

    expect(isTransientAuthError({ status: 400 })).toBe(false);
    expect(isTransientAuthError({ status: 403, code: "otp_expired" })).toBe(false);
    expect(isTransientAuthError({ status: 422 })).toBe(false);
    expect(isTransientAuthError({ message: "Token has expired or is invalid" })).toBe(false);
    // An expired code is a wrong code whatever the status says.
    expect(isTransientAuthError({ status: 500, code: "otp_expired" })).toBe(false);
  });
});

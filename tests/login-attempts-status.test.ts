import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * What the code screen says for each answer of the attempt counter: "locked"
 * is the person's doing (too many wrong codes), "unavailable" is ours (the
 * counters are down) and must neither read as a lockout nor check the code.
 */

const state = vi.hoisted(() => ({
  attempt: "ok" as "ok" | "locked" | "unavailable",
  verifyOtp: vi.fn(),
  register: vi.fn(),
  forget: vi.fn(async () => undefined),
  clear: vi.fn(async () => undefined),
}));

vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-forwarded-for": "203.0.113.50" }) }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`redirect ${url}`);
  },
}));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: async () => ({ auth: { verifyOtp: state.verifyOtp } }),
  getSessionUser: async () => null,
}));
vi.mock("@/lib/data/otp-attempts", () => ({
  registerOtpAttempt: state.register,
  forgetOtpAttempt: state.forget,
  clearOtpFailures: state.clear,
}));

const { authAction } = await import("@/app/login/actions");

function verifyForm(): FormData {
  const data = new FormData();
  data.set("intent", "verify");
  data.set("email", "ana@example.com");
  data.set("code", "12345678");
  return data;
}

const CODE_STEP = { step: "code", email: "ana@example.com", sentAt: 1, resendIn: 60 } as const;

beforeEach(() => {
  state.verifyOtp.mockReset();
  state.register.mockReset();
  state.register.mockImplementation(async () => state.attempt);
  state.forget.mockClear();
  state.clear.mockClear();
  state.attempt = "ok";
});

describe("the attempt counter's answer", () => {
  it("'locked' says to wait and does not check the code", async () => {
    state.attempt = "locked";
    const result = await authAction(CODE_STEP, verifyForm());
    expect(result).toMatchObject({ rejected: false, error: expect.stringMatching(/Demasiados códigos incorrectos/) });
    expect(state.verifyOtp).not.toHaveBeenCalled();
  });

  it("'unavailable' is our problem: try later, no lockout text, no wrong-code state, code not checked", async () => {
    state.attempt = "unavailable";
    const result = await authAction(CODE_STEP, verifyForm());
    expect(result).toMatchObject({ step: "code", rejected: false, error: "Ahora mismo no podemos comprobar códigos. Inténtalo más tarde." });
    expect(result.step === "code" && result.error).not.toMatch(/Demasiados|incorrecto/);
    expect(state.verifyOtp).not.toHaveBeenCalled();
    expect(state.forget).not.toHaveBeenCalled();
  });

  it("'ok' checks the code, and a transient failure refunds exactly that attempt", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    state.verifyOtp.mockResolvedValue({ data: { user: null }, error: { status: 429, message: "slow down" } });
    await authAction(CODE_STEP, verifyForm());
    expect(state.verifyOtp).toHaveBeenCalledWith({ email: "ana@example.com", token: "12345678", type: "email" });
    expect(state.forget).toHaveBeenCalledWith("ana@example.com", "203.0.113.50");
    expect(state.clear).not.toHaveBeenCalled();
  });

  it("a wrong code keeps its attempt (no refund)", async () => {
    state.verifyOtp.mockResolvedValue({ data: { user: null }, error: { status: 403, code: "otp_expired", message: "expired" } });
    await authAction(CODE_STEP, verifyForm());
    expect(state.forget).not.toHaveBeenCalled();
  });
});

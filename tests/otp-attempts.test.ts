import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearOtpFailures,
  forgetOtpAttempt,
  hashEmail,
  OTP_LOCK_WINDOW_MS,
  OTP_MAX_ATTEMPTS,
  OTP_MAX_ATTEMPTS_PER_EMAIL,
  registerOtpAttempt,
} from "@/lib/data/otp-attempts";

afterEach(() => vi.unstubAllEnvs());

// No Supabase env in tests → exercises the in-memory fallback path.
describe("OTP lockout", () => {
  it("hashes emails case-insensitively", () => {
    expect(hashEmail(" Alex@Example.com ")).toBe(hashEmail("alex@example.com"));
    expect(hashEmail("a@example.com")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("keys the hash with the signing secret when there is one", () => {
    const plain = hashEmail("alex@example.com");
    vi.stubEnv("PASSME_SIGNING_SECRET", "s".repeat(40));
    const keyed = hashEmail("alex@example.com");
    expect(keyed).toMatch(/^[0-9a-f]{64}$/);
    expect(keyed).not.toBe(plain);
  });

  it("allows a few attempts per client, then locks until the window passes", async () => {
    const email = "victim@example.com";
    const t0 = 1_000_000;
    for (let i = 0; i < OTP_MAX_ATTEMPTS; i += 1) {
      expect(await registerOtpAttempt(email, "ip-a", t0 + i)).toBe("ok");
    }
    expect(await registerOtpAttempt(email, "ip-a", t0 + 10)).toBe("locked");
    expect(await registerOtpAttempt("other@example.com", "ip-a", t0 + 10)).toBe("ok");
    expect(await registerOtpAttempt(email, "ip-a", t0 + 20 + OTP_LOCK_WINDOW_MS)).toBe("ok");
  });

  it("someone else's wrong guesses don't lock the owner out", async () => {
    const email = "owner@example.com";
    const t0 = 5_000_000;
    for (let i = 0; i < OTP_MAX_ATTEMPTS + 1; i += 1) await registerOtpAttempt(email, "attacker", t0 + i);
    expect(await registerOtpAttempt(email, "attacker", t0 + 10)).toBe("locked");
    expect(await registerOtpAttempt(email, "owner-phone", t0 + 10)).toBe("ok");
  });

  it("still caps the email across every client", async () => {
    const email = "spread@example.com";
    const t0 = 9_000_000;
    for (let i = 0; i < OTP_MAX_ATTEMPTS_PER_EMAIL; i += 1) {
      expect(await registerOtpAttempt(email, `ip-${i}`, t0 + i)).toBe("ok");
    }
    expect(await registerOtpAttempt(email, "fresh-ip", t0 + 100)).toBe("locked");
  });

  it("starts from zero after a successful login", async () => {
    const email = "ok@example.com";
    for (let i = 0; i < OTP_MAX_ATTEMPTS; i += 1) await registerOtpAttempt(email, "ip-ok");
    expect(await registerOtpAttempt(email, "ip-ok")).toBe("locked");
    await clearOtpFailures(email, "ip-ok");
    expect(await registerOtpAttempt(email, "ip-ok")).toBe("ok");
  });

  it("reports once that a production project has no secret key (the lockout is then per instance only)", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubEnv("NODE_ENV", "production");
    await registerOtpAttempt("prod-a@example.com", "ip-prod");
    await registerOtpAttempt("prod-b@example.com", "ip-prod");
    await registerOtpAttempt("prod-c@example.com", "ip-prod");
    expect(errorLog).toHaveBeenCalledTimes(1);
    expect(String(errorLog.mock.calls[0]![0])).toContain("SUPABASE_SECRET_KEY");
    errorLog.mockRestore();
  });

  it("stays quiet about it outside production (tests, demo)", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await registerOtpAttempt("dev@example.com", "ip-dev");
    expect(errorLog).not.toHaveBeenCalled();
    errorLog.mockRestore();
  });

  it("gives an attempt back when the code was never judged", async () => {
    const email = "refund@example.com";
    for (let i = 0; i < OTP_MAX_ATTEMPTS; i += 1) {
      expect(await registerOtpAttempt(email, "ip-refund")).toBe("ok");
      await forgetOtpAttempt(email, "ip-refund");
    }
    // Five tries went out and came back: the person still has all five.
    for (let i = 0; i < OTP_MAX_ATTEMPTS; i += 1) expect(await registerOtpAttempt(email, "ip-refund")).toBe("ok");
    expect(await registerOtpAttempt(email, "ip-refund")).toBe("locked");
  });

  it("refunds only the newest attempt, and nothing when there is none", async () => {
    const email = "partial@example.com";
    await forgetOtpAttempt(email, "ip-partial");
    for (let i = 0; i < OTP_MAX_ATTEMPTS; i += 1) await registerOtpAttempt(email, "ip-partial");
    await forgetOtpAttempt(email, "ip-partial");
    expect(await registerOtpAttempt(email, "ip-partial")).toBe("ok");
    expect(await registerOtpAttempt(email, "ip-partial")).toBe("locked");
  });
});

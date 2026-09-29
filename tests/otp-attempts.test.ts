import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearOtpFailures,
  hashEmail,
  OTP_LOCK_WINDOW_MS,
  OTP_MAX_ATTEMPTS,
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

  it("allows a few attempts, then locks until the window passes", async () => {
    const email = "victim@example.com";
    const t0 = 1_000_000;
    for (let i = 0; i < OTP_MAX_ATTEMPTS; i += 1) {
      expect(await registerOtpAttempt(email, t0 + i)).toBe(true);
    }
    expect(await registerOtpAttempt(email, t0 + 10)).toBe(false);
    expect(await registerOtpAttempt("other@example.com", t0 + 10)).toBe(true);
    expect(await registerOtpAttempt(email, t0 + 20 + OTP_LOCK_WINDOW_MS)).toBe(true);
  });

  it("starts from zero after a successful login", async () => {
    const email = "ok@example.com";
    for (let i = 0; i < OTP_MAX_ATTEMPTS; i += 1) await registerOtpAttempt(email);
    expect(await registerOtpAttempt(email)).toBe(false);
    await clearOtpFailures(email);
    expect(await registerOtpAttempt(email)).toBe(true);
  });
});

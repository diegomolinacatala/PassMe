import { describe, expect, it } from "vitest";
import {
  clearOtpFailures,
  hashEmail,
  isOtpLocked,
  OTP_LOCK_WINDOW_MS,
  OTP_MAX_FAILURES,
  recordOtpFailure,
} from "@/lib/data/otp-attempts";

// No Supabase env in tests → exercises the in-memory fallback path.
describe("OTP lockout", () => {
  it("hashes emails case-insensitively", () => {
    expect(hashEmail(" Alex@Example.com ")).toBe(hashEmail("alex@example.com"));
    expect(hashEmail("a@example.com")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("locks an email after too many failures and unlocks after the window", async () => {
    const email = "victim@example.com";
    const t0 = 1_000_000;
    for (let i = 0; i < OTP_MAX_FAILURES - 1; i += 1) await recordOtpFailure(email, t0 + i);
    expect(await isOtpLocked(email, t0 + 10)).toBe(false);

    await recordOtpFailure(email, t0 + 20);
    expect(await isOtpLocked(email, t0 + 30)).toBe(true);
    expect(await isOtpLocked("other@example.com", t0 + 30)).toBe(false);
    expect(await isOtpLocked(email, t0 + 20 + OTP_LOCK_WINDOW_MS)).toBe(false);
  });

  it("clears failures after a successful login", async () => {
    const email = "ok@example.com";
    for (let i = 0; i < OTP_MAX_FAILURES; i += 1) await recordOtpFailure(email);
    expect(await isOtpLocked(email)).toBe(true);
    await clearOtpFailures(email);
    expect(await isOtpLocked(email)).toBe(false);
  });
});

import "server-only";
import http2 from "node:http2";
import type { AppleWalletConfig } from "@/lib/config.server";
import { log } from "@/lib/log";

/**
 * Apple Wallet pass updates: an empty APNs push (topic = pass type id,
 * authenticated with the pass certificate) tells each device to call our web
 * service and download the latest pass.
 */

const REQUEST_TIMEOUT_MS = 10_000;
/** APNs device tokens are hex strings (64 chars today; allow some headroom). */
const PUSH_TOKEN_RE = /^[0-9a-fA-F]{32,200}$/;
/** Error bodies are tiny JSON ({"reason":"BadDeviceToken"}); never buffer more than this. */
const MAX_BODY_BYTES = 2_048;

export function isValidPushToken(value: unknown): value is string {
  return typeof value === "string" && PUSH_TOKEN_RE.test(value);
}

export interface PushOutcome {
  /** HTTP status; 0 when no answer came (timeout, connection error). */
  status: number;
  /** APNs `reason` for a rejection ("BadDeviceToken", "TopicDisallowed"…), or why we got no answer. */
  reason: string;
}

export interface PushSummary {
  sent: number;
  failed: number;
  /**
   * Tokens APNs said are dead: 410 (unregistered) or 400 BadDeviceToken. Any other
   * failure (bad topic, bad certificate, throttling, outage) is about us, not
   * the device, so its registration must survive.
   */
  invalidTokens: string[];
  /** How many pushes ended in each "status:reason" (e.g. {"200:ok": 3, "400:BadTopic": 1}). */
  outcomes: Record<string, number>;
}

/** Whether an answer proves the device token itself is no longer valid. */
export function isDeadTokenOutcome({ status, reason }: PushOutcome): boolean {
  return status === 410 || (status === 400 && reason === "BadDeviceToken");
}

function parseReason(body: string): string {
  try {
    const reason = (JSON.parse(body) as { reason?: unknown }).reason;
    return typeof reason === "string" && /^[A-Za-z0-9_]{1,64}$/.test(reason) ? reason : "unknown";
  } catch {
    return "unknown";
  }
}

function pushOne(session: http2.ClientHttp2Session, config: AppleWalletConfig, token: string): Promise<PushOutcome> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (outcome: PushOutcome) => {
      if (settled) return;
      settled = true;
      resolve(outcome);
    };

    const request = session.request({
      ":method": "POST",
      ":path": `/3/device/${token}`,
      "apns-topic": config.passTypeId,
      "content-type": "application/json",
    });
    request.setTimeout(REQUEST_TIMEOUT_MS, () => {
      request.close(http2.constants.NGHTTP2_CANCEL);
      finish({ status: 0, reason: "timeout" });
    });
    request.on("error", (error: NodeJS.ErrnoException) => finish({ status: 0, reason: `error:${error.code ?? "unknown"}` }));

    let status = 0;
    let body = "";
    request.setEncoding("utf8");
    request.on("response", (headers) => {
      status = Number(headers[":status"] ?? 0);
    });
    request.on("data", (chunk: string) => {
      if (body.length < MAX_BODY_BYTES) body += chunk;
    });
    // A 200 has an empty body; a rejection carries the reason. Wait for the end of the stream to read it.
    request.on("end", () => finish({ status, reason: status === 200 ? "ok" : parseReason(body) }));
    request.on("close", () => finish({ status, reason: status === 200 ? "ok" : parseReason(body) }));
    request.end("{}");
  });
}

export async function sendPassUpdatePushes(config: AppleWalletConfig, pushTokens: string[]): Promise<PushSummary> {
  const tokens = pushTokens.filter(isValidPushToken);
  const summary: PushSummary = { sent: 0, failed: 0, invalidTokens: [], outcomes: {} };
  if (tokens.length === 0) return summary;

  let session: http2.ClientHttp2Session | null = null;
  try {
    session = http2.connect(config.apnsHost, {
      cert: config.signerCert,
      key: config.signerKey,
      passphrase: config.signerKeyPassphrase,
    });
    session.on("error", (error) => log.warn("APNs session error", {}, error));

    const outcomes = await Promise.all(tokens.map((token) => pushOne(session!, config, token)));
    outcomes.forEach((outcome, index) => {
      const label = `${outcome.status}:${outcome.reason}`;
      summary.outcomes[label] = (summary.outcomes[label] ?? 0) + 1;
      if (outcome.status === 200) summary.sent += 1;
      else {
        summary.failed += 1;
        if (isDeadTokenOutcome(outcome)) summary.invalidTokens.push(tokens[index]!);
      }
    });
  } catch (error) {
    log.warn("APNs push failed", { count: tokens.length }, error);
    summary.failed = tokens.length;
    summary.outcomes["0:connect"] = tokens.length;
  } finally {
    session?.close();
  }
  return summary;
}

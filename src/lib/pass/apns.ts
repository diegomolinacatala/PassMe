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

export function isValidPushToken(value: unknown): value is string {
  return typeof value === "string" && PUSH_TOKEN_RE.test(value);
}

export interface PushSummary {
  sent: number;
  failed: number;
  /** Tokens Apple reported as no longer valid; their registrations should be deleted. */
  invalidTokens: string[];
}

function pushOne(session: http2.ClientHttp2Session, config: AppleWalletConfig, token: string): Promise<number> {
  return new Promise((resolve) => {
    const request = session.request({
      ":method": "POST",
      ":path": `/3/device/${token}`,
      "apns-topic": config.passTypeId,
      "content-type": "application/json",
    });
    request.setTimeout(REQUEST_TIMEOUT_MS, () => {
      request.close(http2.constants.NGHTTP2_CANCEL);
      resolve(0);
    });
    request.on("response", (headers) => resolve(Number(headers[":status"] ?? 0)));
    request.on("error", () => resolve(0));
    request.end("{}");
  });
}

export async function sendPassUpdatePushes(config: AppleWalletConfig, pushTokens: string[]): Promise<PushSummary> {
  const tokens = pushTokens.filter(isValidPushToken);
  const summary: PushSummary = { sent: 0, failed: 0, invalidTokens: [] };
  if (tokens.length === 0) return summary;

  let session: http2.ClientHttp2Session | null = null;
  try {
    session = http2.connect(config.apnsHost, {
      cert: config.signerCert,
      key: config.signerKey,
      passphrase: config.signerKeyPassphrase,
    });
    session.on("error", (error) => log.warn("APNs session error", {}, error));

    const statuses = await Promise.all(tokens.map((token) => pushOne(session!, config, token)));
    statuses.forEach((status, index) => {
      if (status === 200) summary.sent += 1;
      else {
        summary.failed += 1;
        // 410: device no longer registered; 400 usually BadDeviceToken.
        if (status === 410 || status === 400) summary.invalidTokens.push(tokens[index]!);
      }
    });
  } catch (error) {
    log.warn("APNs push failed", { count: tokens.length }, error);
    summary.failed = tokens.length;
  } finally {
    session?.close();
  }
  return summary;
}

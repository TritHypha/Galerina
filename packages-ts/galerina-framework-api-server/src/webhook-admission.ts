import { createHmac, timingSafeEqual } from "node:crypto";
import type {
  AtomicAdmissionStore,
  AtomicClaimResult,
} from "../../galerina-core-network/dist/index.js";

export const WEBHOOK_REPLAY_SCOPE = "replay";

export type WebhookAdmissionRefusal = "hmac" | "replay" | "malformed";

export interface WebhookAdmissionHooks {
  readonly onHmac?: (ok: boolean) => void;
  readonly onReplayClaim?: (result: AtomicClaimResult) => void;
  readonly onDecode?: () => void;
}

export interface WebhookAdmissionInput {
  readonly body: Uint8Array;
  readonly headers: Readonly<Record<string, string | undefined>>;
  readonly secret: string | Uint8Array;
  readonly signatureHeader: string;
  readonly eventIdHeader: string;
  readonly replayStore: AtomicAdmissionStore;
  readonly replayTtlSeconds: number;
  readonly signaturePrefix?: string;
  readonly decode?: (body: Uint8Array) => unknown;
  readonly hooks?: WebhookAdmissionHooks;
}

export type WebhookAdmissionOutcome =
  | { readonly ok: true; readonly eventId: string }
  | { readonly ok: false; readonly reason: WebhookAdmissionRefusal };

function headerValue(
  headers: Readonly<Record<string, string | undefined>>,
  name: string,
): string | undefined {
  const wanted = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === wanted) return value;
  }
  return undefined;
}

function bodyMacHex(body: Uint8Array, secret: string | Uint8Array): string {
  return createHmac("sha256", secret).update(body).digest("hex");
}

function verifyHmacSha256(
  body: Uint8Array,
  signatureHeader: string,
  secret: string | Uint8Array,
  prefix: string | undefined,
): boolean {
  const provided = prefix !== undefined && signatureHeader.startsWith(prefix)
    ? signatureHeader.slice(prefix.length)
    : signatureHeader;
  if (!/^[0-9a-fA-F]+$/.test(provided) || provided.length % 2 !== 0) return false;
  const expectedHex = bodyMacHex(body, secret);
  const expected = Buffer.from(expectedHex, "hex");
  const actual = Buffer.from(provided, "hex");
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}

export async function admitWebhookReplay(
  input: WebhookAdmissionInput,
): Promise<WebhookAdmissionOutcome> {
  const signature = headerValue(input.headers, input.signatureHeader);
  const eventId = headerValue(input.headers, input.eventIdHeader);
  const hmacOk = typeof signature === "string" && signature.length > 0
    && verifyHmacSha256(input.body, signature, input.secret, input.signaturePrefix);
  input.hooks?.onHmac?.(hmacOk);
  if (!hmacOk) {
    return { ok: false, reason: "hmac" };
  }
  if (typeof eventId !== "string" || eventId.trim().length === 0) {
    return { ok: false, reason: "malformed" };
  }

  // Replay identity is the authenticated body MAC. An unsigned event-id header
  // cannot mint a fresh replay slot for the same signed payload.
  const replayIdentity = `body:${bodyMacHex(input.body, input.secret)}`;

  let claim: AtomicClaimResult;
  try {
    claim = await input.replayStore.claim(
      WEBHOOK_REPLAY_SCOPE,
      replayIdentity,
      input.replayTtlSeconds,
    );
  } catch {
    return { ok: false, reason: "malformed" };
  }
  input.hooks?.onReplayClaim?.(claim);
  if (claim !== "claimed" && claim !== "duplicate") {
    return { ok: false, reason: "malformed" };
  }
  if (claim === "duplicate") {
    return { ok: false, reason: "replay" };
  }

  if (input.decode !== undefined) {
    input.hooks?.onDecode?.();
    input.decode(input.body);
  }
  return { ok: true, eventId };
}

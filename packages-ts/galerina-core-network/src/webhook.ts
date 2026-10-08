// Webhook verification contracts (TODO pass, Grok 2026-10-05).
//
// Fail-closed HMAC-SHA256 webhook verification, timestamp freshness, and replay /
// idempotency admission over the atomic `AtomicAdmissionStore` claim (a read followed
// by a write is not admission, see index.ts). No clock is chosen here: callers pass
// `nowSeconds`. The SHA-256/HMAC are dependency-free so the package keeps no Node
// typings; tests cross-check them against node:crypto.

import type { AtomicAdmissionStore, NetworkDiagnostic } from "./index.js";

export type WebhookHmacAlgorithm = "sha256";

export interface WebhookVerificationConfig {
  readonly secret: string;
  readonly algorithm: WebhookHmacAlgorithm;
  readonly headerName: string;
  readonly timestampHeader?: string;
  readonly maxAgeSeconds: number;
}

export interface WebhookVerificationResult {
  readonly valid: boolean;
  readonly reason?: string;
  readonly diagnostics: readonly NetworkDiagnostic[];
}

export const WEBHOOK_MIN_SECRET_BYTES = 32;
export const WEBHOOK_MAX_SECRET_BYTES = 4096;
export const WEBHOOK_MAX_AGE_CEILING_SECONDS = 600;
// Bounds synchronous hashing work and temporary copies. HTTP adapters must enforce this
// while reading the request stream too; checking here cannot undo an upstream allocation.
export const WEBHOOK_MAX_PAYLOAD_BYTES = 1_048_576;

const UTF8 = new TextEncoder();
const ok: WebhookVerificationResult = Object.freeze({ valid: true, diagnostics: Object.freeze([]) });
// Measure TextEncoder-compatible UTF-8 length without allocating an encoded copy.
// Undefined means the limit was crossed. The length fast-path also bounds scan time.
function utf8ByteLengthUpTo(value: string, limit: number): number | undefined {
  if (value.length > limit) return undefined;
  let bytes = 0;
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code <= 0x7f) bytes += 1;
    else if (code <= 0x7ff) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) { bytes += 4; i += 1; }
      else bytes += 3; // TextEncoder replaces an unpaired surrogate with U+FFFD.
    } else bytes += 3; // Includes standalone low surrogates, also replaced by U+FFFD.
    if (bytes > limit) return undefined;
  }
  return bytes;
}

function invalid(code: string, reason: string, path: string): WebhookVerificationResult {
  return Object.freeze({ valid: false, reason, diagnostics: Object.freeze([Object.freeze({ code, severity: "error" as const, message: reason, path })]) });
}

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

export function sha256Bytes(bytes: Uint8Array): Uint8Array {
  const padded = new Uint8Array(((bytes.length + 9 + 63) >> 6) << 6);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const view = new DataView(padded.buffer);
  const bitLength = bytes.length * 8;
  view.setUint32(padded.length - 8, Math.floor(bitLength / 0x100000000));
  view.setUint32(padded.length - 4, bitLength >>> 0);
  const h = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const w = new Uint32Array(64);
  const rotr = (x: number, n: number): number => (x >>> n) | (x << (32 - n));
  for (let offset = 0; offset < padded.length; offset += 64) {
    for (let i = 0; i < 16; i += 1) w[i] = view.getUint32(offset + i * 4);
    for (let i = 16; i < 64; i += 1) {
      const a = w[i - 15] as number;
      const b = w[i - 2] as number;
      w[i] = ((w[i - 16] as number) + (rotr(a, 7) ^ rotr(a, 18) ^ (a >>> 3)) + (w[i - 7] as number) + (rotr(b, 17) ^ rotr(b, 19) ^ (b >>> 10))) >>> 0;
    }
    let a = h[0] as number, b = h[1] as number, c = h[2] as number, d = h[3] as number;
    let e = h[4] as number, f = h[5] as number, g = h[6] as number, hh = h[7] as number;
    for (let i = 0; i < 64; i += 1) {
      const t1 = (hh + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + (K[i] as number) + (w[i] as number)) >>> 0;
      const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
      hh = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    const add = [a, b, c, d, e, f, g, hh];
    for (let i = 0; i < 8; i += 1) h[i] = ((h[i] as number) + (add[i] as number)) >>> 0;
  }
  const out = new Uint8Array(32);
  const outView = new DataView(out.buffer);
  for (let i = 0; i < 8; i += 1) outView.setUint32(i * 4, h[i] as number);
  return out;
}

export function hmacSha256(key: Uint8Array, message: Uint8Array): Uint8Array {
  const block = new Uint8Array(64);
  block.set(key.length > 64 ? sha256Bytes(key) : key);
  const inner = new Uint8Array(64 + message.length);
  const outer = new Uint8Array(64 + 32);
  for (let i = 0; i < 64; i += 1) {
    inner[i] = (block[i] as number) ^ 0x36;
    outer[i] = (block[i] as number) ^ 0x5c;
  }
  inner.set(message, 64);
  outer.set(sha256Bytes(inner), 64);
  return sha256Bytes(outer);
}

const toHex = (bytes: Uint8Array): string => Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

// Both inputs are validated 64-digit hex strings; every position is compared, with no early exit.
function constantTimeEqualHex64(a: string, b: string): boolean {
  let diff = 0;
  for (let i = 0; i < 64; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0 && a.length === 64 && b.length === 64;
}

export function validateWebhookConfig(config: WebhookVerificationConfig): WebhookVerificationResult {
  if (config === null || typeof config !== "object") return invalid("Galerina_NETWORK_WEBHOOK_CONFIG", "Webhook configuration must be an object.", "config");
  if (typeof config.secret !== "string" || utf8ByteLengthUpTo(config.secret, WEBHOOK_MAX_SECRET_BYTES) === undefined) {
    return invalid("Galerina_NETWORK_WEBHOOK_SECRET_INVALID", `Webhook secret must be a string no longer than ${WEBHOOK_MAX_SECRET_BYTES} UTF-8 bytes.`, "secret");
  }
  if (config.algorithm !== "sha256") return invalid("Galerina_NETWORK_WEBHOOK_ALGORITHM", "Only HMAC-SHA256 is accepted.", "algorithm");
  const secretBytes = utf8ByteLengthUpTo(config.secret, WEBHOOK_MAX_SECRET_BYTES);
  if (secretBytes === undefined) return invalid("Galerina_NETWORK_WEBHOOK_SECRET_INVALID", `Webhook secret exceeds ${WEBHOOK_MAX_SECRET_BYTES} UTF-8 bytes.`, "secret");
  if (secretBytes < WEBHOOK_MIN_SECRET_BYTES) return invalid("Galerina_NETWORK_WEBHOOK_SECRET_WEAK", `Webhook secrets need at least ${WEBHOOK_MIN_SECRET_BYTES} bytes.`, "secret");
  if (typeof config.headerName !== "string" || config.headerName.trim().length === 0) return invalid("Galerina_NETWORK_WEBHOOK_HEADER", "A signature header name is required.", "headerName");
  if (config.timestampHeader !== undefined && (typeof config.timestampHeader !== "string" || config.timestampHeader.trim().length === 0)) {
    return invalid("Galerina_NETWORK_WEBHOOK_TIMESTAMP_HEADER", "timestampHeader must be a non-empty string when supplied.", "timestampHeader");
  }
  if (!Number.isSafeInteger(config.maxAgeSeconds) || config.maxAgeSeconds <= 0 || config.maxAgeSeconds > WEBHOOK_MAX_AGE_CEILING_SECONDS) {
    return invalid("Galerina_NETWORK_WEBHOOK_MAX_AGE", `maxAgeSeconds must be an integer in 1..${WEBHOOK_MAX_AGE_CEILING_SECONDS}.`, "maxAgeSeconds");
  }
  return ok;
}

// Accepts `<hex>` or `sha256=<hex>` (lower-case, 64 hex digits). When the config names a
// timestamp header, the signed message is `<timestamp>.<payload>`, binding freshness into
// the MAC; a timestamp is then mandatory.
export function verifyWebhookHmac(
  payload: string | Uint8Array,
  signature: string,
  config: WebhookVerificationConfig,
  timestamp = "",
): WebhookVerificationResult {
  const configCheck = validateWebhookConfig(config);
  if (!configCheck.valid) return configCheck;
  if (typeof signature !== "string") return invalid("Galerina_NETWORK_WEBHOOK_SIGNATURE_FORMAT", "Signature must be a string.", "signature");
  if (typeof payload === "string") {
    if (utf8ByteLengthUpTo(payload, WEBHOOK_MAX_PAYLOAD_BYTES) === undefined) return invalid("Galerina_NETWORK_WEBHOOK_PAYLOAD_TOO_LARGE", `Webhook payload exceeds ${WEBHOOK_MAX_PAYLOAD_BYTES} UTF-8 bytes.`, "payload");
  } else if (!(payload instanceof Uint8Array)) {
    return invalid("Galerina_NETWORK_WEBHOOK_PAYLOAD_INVALID", "Webhook payload must be a string or Uint8Array.", "payload");
  } else if (payload.byteLength > WEBHOOK_MAX_PAYLOAD_BYTES) {
    return invalid("Galerina_NETWORK_WEBHOOK_PAYLOAD_TOO_LARGE", `Webhook payload exceeds ${WEBHOOK_MAX_PAYLOAD_BYTES} bytes.`, "payload");
  }
  const provided = signature.startsWith("sha256=") ? signature.slice(7) : signature;
  if (!/^[0-9a-f]{64}$/.test(provided)) {
    return invalid("Galerina_NETWORK_WEBHOOK_SIGNATURE_FORMAT", "Signature must be 64 lower-case hex digits.", "signature");
  }
  const bound = config.timestampHeader !== undefined;
  if (bound && !/^[0-9]{1,12}$/.test(timestamp)) return invalid("Galerina_NETWORK_WEBHOOK_TIMESTAMP_REQUIRED", "A signed timestamp is required by this config.", "timestamp");
  const body = typeof payload === "string" ? UTF8.encode(payload) : payload;
  if (body.byteLength > WEBHOOK_MAX_PAYLOAD_BYTES) return invalid("Galerina_NETWORK_WEBHOOK_PAYLOAD_TOO_LARGE", `Webhook payload exceeds ${WEBHOOK_MAX_PAYLOAD_BYTES} bytes.`, "payload");
  const prefix = bound ? UTF8.encode(`${timestamp}.`) : undefined;
  const message = prefix
    ? (() => { const bytes = new Uint8Array(prefix.length + body.length); bytes.set(prefix); bytes.set(body, prefix.length); return bytes; })()
    : body;
  const expected = toHex(hmacSha256(UTF8.encode(config.secret), message));
  return constantTimeEqualHex64(expected, provided)
    ? ok
    : invalid("Galerina_NETWORK_WEBHOOK_SIGNATURE_MISMATCH", "Webhook signature does not verify.", "signature");
}

// Integer seconds only. Future timestamps refuse (no clock-skew allowance by default) and
// anything older than maxAgeSeconds refuses.
export function validateWebhookTimestamp(timestamp: string | number, maxAgeSeconds: number, nowSeconds: number): WebhookVerificationResult {
  const text = String(timestamp);
  if (!/^[0-9]{1,12}$/.test(text)) return invalid("Galerina_NETWORK_WEBHOOK_TIMESTAMP_FORMAT", "Timestamp must be integer seconds.", "timestamp");
  if (!Number.isSafeInteger(maxAgeSeconds) || maxAgeSeconds <= 0 || maxAgeSeconds > WEBHOOK_MAX_AGE_CEILING_SECONDS) {
    return invalid("Galerina_NETWORK_WEBHOOK_MAX_AGE", `maxAgeSeconds must be an integer in 1..${WEBHOOK_MAX_AGE_CEILING_SECONDS}.`, "maxAgeSeconds");
  }
  if (!Number.isSafeInteger(nowSeconds) || nowSeconds < 0) return invalid("Galerina_NETWORK_WEBHOOK_CLOCK", "The caller clock must be integer seconds.", "nowSeconds");
  const value = Number(text);
  if (value > nowSeconds) return invalid("Galerina_NETWORK_WEBHOOK_TIMESTAMP_FUTURE", "Webhook timestamp is in the future.", "timestamp");
  if (nowSeconds - value > maxAgeSeconds) return invalid("Galerina_NETWORK_WEBHOOK_TIMESTAMP_STALE", "Webhook timestamp is too old.", "timestamp");
  return ok;
}

const ADMISSION_KEY = /^[A-Za-z0-9._:-]{8,200}$/;

async function claimOnce(scope: string, key: string, store: AtomicAdmissionStore, ttlSeconds: number, code: string): Promise<readonly NetworkDiagnostic[]> {
  if (!ADMISSION_KEY.test(key)) return [{ code: `${code}_KEY_INVALID`, severity: "error", message: "Admission keys must be 8..200 safe characters.", path: "key" }];
  if (!Number.isSafeInteger(ttlSeconds) || ttlSeconds <= 0) return [{ code: `${code}_TTL_INVALID`, severity: "error", message: "TTL must be a positive integer.", path: "ttlSeconds" }];
  let result: unknown;
  try {
    result = await store.claim(scope, key, ttlSeconds);
  } catch {
    return [{ code: `${code}_STORE_FAILED`, severity: "error", message: "Admission store failed; refusing (fail-closed).", path: "store" }];
  }
  if (result === "claimed") return [];
  if (result === "duplicate") return [{ code: `${code}_DUPLICATE`, severity: "error", message: "Key was already admitted.", path: "key" }];
  return [{ code: `${code}_STORE_FAILED`, severity: "error", message: "Admission store returned an unknown result; refusing.", path: "store" }];
}

// Replay protection: a delivery id is admitted exactly once, via one atomic claim.
export function validateReplayProtection(id: string, store: AtomicAdmissionStore, ttlSeconds = WEBHOOK_MAX_AGE_CEILING_SECONDS): Promise<readonly NetworkDiagnostic[]> {
  return claimOnce("webhook-replay", id, store, ttlSeconds, "Galerina_NETWORK_REPLAY");
}

// Idempotency: an idempotency key is processed exactly once in its scope.
export function validateIdempotency(key: string, store: AtomicAdmissionStore, ttlSeconds = 86_400): Promise<readonly NetworkDiagnostic[]> {
  return claimOnce("idempotency", key, store, ttlSeconds, "Galerina_NETWORK_IDEMPOTENCY");
}

/** True only when `claim` is present. get/put alone is observational, not admission. */
export function isAtomicAdmissionStore(value: unknown): value is AtomicAdmissionStore {
  if (value === null || typeof value !== "object") return false;
  return typeof (value as { claim?: unknown }).claim === "function";
}

/** Observational IdempotencyStore shape: get+put and no claim. Never treat as admission. */
export function observationalIdempotencyStoreLooksLikeGetPut(value: unknown): boolean {
  if (value === null || typeof value !== "object") return false;
  const rec = value as { get?: unknown; put?: unknown; claim?: unknown };
  return typeof rec.get === "function" && typeof rec.put === "function" && typeof rec.claim !== "function";
}

/**
 * Always refuses. Does not call get or put. Observational IdempotencyStore is
 * not an admission gate; wiring to app-kernel IdempotencyStore.claim stays HOLD.
 */
export function refuseObservationalIdempotencyAdmission(store: unknown): readonly NetworkDiagnostic[] {
  void store;
  return Object.freeze([
    Object.freeze({
      code: "Galerina_NETWORK_IDEMPOTENCY_STORE_FAILED",
      severity: "error" as const,
      message: "Observational IdempotencyStore get/put is not admission. Use AtomicAdmissionStore.claim; never read-then-write.",
      path: "store",
    }),
  ]);
}

export interface WebhookAdmissionInput {
  readonly payload: string | Uint8Array;
  readonly signature: string;
  readonly timestamp: string;
  readonly deliveryId: string;
  readonly config: WebhookVerificationConfig;
  readonly nowSeconds: number;
  readonly store: AtomicAdmissionStore;
}

// One admit path (SuperGrok batch-3 NB-2): the config must bind the timestamp into the MAC,
// then MAC -> freshness -> one replay claim, in that order, so an unauthenticated or stale
// request can never consume a delivery id. Any failure refuses with its diagnostics.
export async function admitWebhook(input: WebhookAdmissionInput): Promise<WebhookVerificationResult> {
  if (input === null || typeof input !== "object") return invalid("Galerina_NETWORK_WEBHOOK_INPUT", "Webhook admission input must be an object.", "input");
  const configCheck = validateWebhookConfig(input.config);
  if (!configCheck.valid) return configCheck;
  if (input.config.timestampHeader === undefined) {
    return invalid("Galerina_NETWORK_WEBHOOK_TIMESTAMP_UNBOUND", "admitWebhook needs a config whose timestampHeader binds the timestamp into the MAC.", "config.timestampHeader");
  }
  const mac = verifyWebhookHmac(input.payload, input.signature, input.config, input.timestamp);
  if (!mac.valid) return mac;
  const fresh = validateWebhookTimestamp(input.timestamp, input.config.maxAgeSeconds, input.nowSeconds);
  if (!fresh.valid) return fresh;
  const replay = await validateReplayProtection(input.deliveryId, input.store, input.config.maxAgeSeconds);
  if (replay.length > 0) return Object.freeze({ valid: false, reason: replay[0]?.message ?? "Replay admission refused.", diagnostics: Object.freeze([...replay]) });
  return ok;
}

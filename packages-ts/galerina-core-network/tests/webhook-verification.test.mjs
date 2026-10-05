import assert from "node:assert/strict";
import { createHmac, createHash } from "node:crypto";
import { describe, it } from "node:test";

import * as N from "../dist/index.js";

const SECRET = "s".repeat(32);
const base = { secret: SECRET, algorithm: "sha256", headerName: "X-Signature", maxAgeSeconds: 300 };
const sign = (msg, secret = SECRET) => createHmac("sha256", secret).update(msg).digest("hex");
const code = (r) => r.diagnostics.map((d) => d.code);

describe("dependency-free SHA-256 / HMAC match node:crypto", () => {
  it("sha256 and hmac agree across block boundaries and long keys", () => {
    for (const s of ["", "abc", "x".repeat(55), "y".repeat(64), "z".repeat(1000)]) {
      const bytes = new TextEncoder().encode(s);
      assert.equal(Buffer.from(N.sha256Bytes(bytes)).toString("hex"), createHash("sha256").update(s).digest("hex"));
      for (const key of ["k", "q".repeat(64), "w".repeat(100)]) {
        assert.equal(Buffer.from(N.hmacSha256(new TextEncoder().encode(key), bytes)).toString("hex"), createHmac("sha256", key).update(s).digest("hex"));
      }
    }
  });
});

describe("verifyWebhookHmac", () => {
  const payload = '{"event":"push"}';
  it("accepts a correct signature, bare or sha256= prefixed", () => {
    assert.deepEqual(N.verifyWebhookHmac(payload, sign(payload), base), { valid: true, diagnostics: [] });
    assert.equal(N.verifyWebhookHmac(new TextEncoder().encode(payload), `sha256=${sign(payload)}`, base).valid, true);
  });
  it("refuses a tampered payload, wrong secret, malformed or upper-case signatures", () => {
    assert.deepEqual(code(N.verifyWebhookHmac(`${payload} `, sign(payload), base)), ["Galerina_NETWORK_WEBHOOK_SIGNATURE_MISMATCH"]);
    assert.deepEqual(code(N.verifyWebhookHmac(payload, sign(payload, "t".repeat(32)), base)), ["Galerina_NETWORK_WEBHOOK_SIGNATURE_MISMATCH"]);
    for (const bad of ["", "abc", sign(payload).toUpperCase(), `sha1=${sign(payload)}`, `${sign(payload)}00`]) {
      assert.deepEqual(code(N.verifyWebhookHmac(payload, bad, base)), ["Galerina_NETWORK_WEBHOOK_SIGNATURE_FORMAT"], bad);
    }
  });
  it("refuses weak secrets, other algorithms, empty header names and unbounded max age", () => {
    assert.deepEqual(code(N.verifyWebhookHmac(payload, sign(payload, "short"), { ...base, secret: "short" })), ["Galerina_NETWORK_WEBHOOK_SECRET_WEAK"]);
    assert.deepEqual(code(N.verifyWebhookHmac(payload, sign(payload), { ...base, algorithm: "sha1" })), ["Galerina_NETWORK_WEBHOOK_ALGORITHM"]);
    assert.deepEqual(code(N.verifyWebhookHmac(payload, sign(payload), { ...base, headerName: " " })), ["Galerina_NETWORK_WEBHOOK_HEADER"]);
    for (const maxAgeSeconds of [0, 601, 1.5, Infinity]) assert.deepEqual(code(N.validateWebhookConfig({ ...base, maxAgeSeconds })), ["Galerina_NETWORK_WEBHOOK_MAX_AGE"]);
  });
  it("binds the timestamp into the MAC when the config names a timestamp header", () => {
    const bound = { ...base, timestampHeader: "X-Timestamp" };
    assert.equal(N.verifyWebhookHmac(payload, sign(`1700000000.${payload}`), bound, "1700000000").valid, true);
    assert.deepEqual(code(N.verifyWebhookHmac(payload, sign(`1700000000.${payload}`), bound, "1700000001")), ["Galerina_NETWORK_WEBHOOK_SIGNATURE_MISMATCH"]);
    assert.deepEqual(code(N.verifyWebhookHmac(payload, sign(payload), bound)), ["Galerina_NETWORK_WEBHOOK_TIMESTAMP_REQUIRED"]);
  });
});

describe("validateWebhookTimestamp (caller clock, no future, bounded age)", () => {
  const now = 1_700_000_000;
  it("accepts fresh integer timestamps", () => {
    assert.equal(N.validateWebhookTimestamp(now, 300, now).valid, true);
    assert.equal(N.validateWebhookTimestamp(String(now - 300), 300, now).valid, true);
  });
  it("refuses stale, future, malformed timestamps and bad clocks", () => {
    assert.deepEqual(code(N.validateWebhookTimestamp(now - 301, 300, now)), ["Galerina_NETWORK_WEBHOOK_TIMESTAMP_STALE"]);
    assert.deepEqual(code(N.validateWebhookTimestamp(now + 1, 300, now)), ["Galerina_NETWORK_WEBHOOK_TIMESTAMP_FUTURE"]);
    for (const t of ["", "1.5", "-1", "1e9", " 1"]) assert.deepEqual(code(N.validateWebhookTimestamp(t, 300, now)), ["Galerina_NETWORK_WEBHOOK_TIMESTAMP_FORMAT"], t);
    assert.deepEqual(code(N.validateWebhookTimestamp(now, 300, 1.5)), ["Galerina_NETWORK_WEBHOOK_CLOCK"]);
  });
});

describe("replay protection and idempotency use one atomic claim", () => {
  const memoryStore = () => {
    const seen = new Set();
    return { calls: [], claim(scope, key, ttl) { this.calls.push([scope, key, ttl]); const k = `${scope}|${key}`; if (seen.has(k)) return "duplicate"; seen.add(k); return "claimed"; } };
  };
  it("admits a delivery id once and refuses the replay", async () => {
    const store = memoryStore();
    assert.deepEqual(await N.validateReplayProtection("delivery-0001", store), []);
    assert.deepEqual((await N.validateReplayProtection("delivery-0001", store)).map((d) => d.code), ["Galerina_NETWORK_REPLAY_DUPLICATE"]);
    assert.deepEqual(store.calls[0], ["webhook-replay", "delivery-0001", 600]);
  });
  it("keeps replay and idempotency scopes apart", async () => {
    const store = memoryStore();
    assert.deepEqual(await N.validateIdempotency("delivery-0001", store), []);
    assert.deepEqual(await N.validateReplayProtection("delivery-0001", store), []);
    assert.deepEqual((await N.validateIdempotency("delivery-0001", store)).map((d) => d.code), ["Galerina_NETWORK_IDEMPOTENCY_DUPLICATE"]);
  });
  it("fails closed on bad keys, bad TTLs, throwing, rejecting or unknown store results", async () => {
    const c = async (p) => (await p).map((d) => d.code);
    assert.deepEqual(await c(N.validateReplayProtection("short", memoryStore())), ["Galerina_NETWORK_REPLAY_KEY_INVALID"]);
    assert.deepEqual(await c(N.validateReplayProtection("bad key with spaces", memoryStore())), ["Galerina_NETWORK_REPLAY_KEY_INVALID"]);
    assert.deepEqual(await c(N.validateIdempotency("idem-key-01", memoryStore(), 0)), ["Galerina_NETWORK_IDEMPOTENCY_TTL_INVALID"]);
    assert.deepEqual(await c(N.validateReplayProtection("delivery-0002", { claim() { throw new Error("down"); } })), ["Galerina_NETWORK_REPLAY_STORE_FAILED"]);
    assert.deepEqual(await c(N.validateReplayProtection("delivery-0002", { claim: async () => { throw new Error("down"); } })), ["Galerina_NETWORK_REPLAY_STORE_FAILED"]);
    assert.deepEqual(await c(N.validateReplayProtection("delivery-0002", { claim: () => "ok" })), ["Galerina_NETWORK_REPLAY_STORE_FAILED"]);
  });
});

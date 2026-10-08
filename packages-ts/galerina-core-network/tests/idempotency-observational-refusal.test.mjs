import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  isAtomicAdmissionStore,
  observationalIdempotencyStoreLooksLikeGetPut,
  refuseObservationalIdempotencyAdmission,
  validateIdempotency,
  validateReplayProtection,
} from "../dist/index.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const WEBHOOK_SRC = join(ROOT, "src", "webhook", "webhook-verification.ts");
const INDEX_SRC = join(ROOT, "src", "index.ts");

describe("observational IdempotencyStore is not admission", () => {
  it("always refuses get/put stores and never calls get or put", () => {
    const calls = [];
    const observational = {
      get(key) { calls.push(["get", key]); throw new Error("get must not run"); },
      put(record) { calls.push(["put", record]); throw new Error("put must not run"); },
    };
    assert.equal(observationalIdempotencyStoreLooksLikeGetPut(observational), true);
    assert.equal(isAtomicAdmissionStore(observational), false);
    const first = refuseObservationalIdempotencyAdmission(observational);
    const second = refuseObservationalIdempotencyAdmission(observational);
    assert.deepEqual(first.map((d) => d.code), ["Galerina_NETWORK_IDEMPOTENCY_STORE_FAILED"]);
    assert.equal(first[0].severity, "error");
    assert.match(first[0].message, /never read-then-write/);
    assert.equal(Object.isFrozen(first), true);
    assert.equal(JSON.stringify(first), JSON.stringify(second));
    assert.deepEqual(calls, []);
  });

  it("recognises AtomicAdmissionStore.claim and not a get/put pair", () => {
    const atomic = { claim() { return "claimed"; } };
    assert.equal(isAtomicAdmissionStore(atomic), true);
    assert.equal(observationalIdempotencyStoreLooksLikeGetPut(atomic), false);
    assert.equal(isAtomicAdmissionStore(null), false);
    assert.equal(observationalIdempotencyStoreLooksLikeGetPut({ get() { return undefined; } }), false);
  });

  it("keeps live admission on claimOnce; webhook source has no store.get or store.put", () => {
    const source = readFileSync(WEBHOOK_SRC, "utf8");
    assert.equal(/\bstore\.get\s*\(/.test(source), false);
    assert.equal(/\bstore\.put\s*\(/.test(source), false);
    assert.match(source, /store\.claim\s*\(/);
    const claimOnce = source.slice(source.indexOf("async function claimOnce"), source.indexOf("export function validateReplayProtection"));
    assert.equal(/\.get\s*\(/.test(claimOnce), false);
    assert.equal(/\.put\s*\(/.test(claimOnce), false);
    assert.match(claimOnce, /store\.claim/);
  });

  it("index.ts IdempotencyStore stays observational get/put; AtomicAdmissionStore stays claim", () => {
    const source = readFileSync(INDEX_SRC, "utf8");
    assert.match(source, /export interface AtomicAdmissionStore\s*\{/);
    assert.match(source, /export interface IdempotencyStore\s*\{/);
    const idemStart = source.indexOf("export interface IdempotencyStore");
    const idemEnd = source.indexOf("export interface NetworkPolicy", idemStart);
    const idem = source.slice(idemStart, idemEnd);
    assert.match(idem, /get\(key: string\)/);
    assert.match(idem, /put\(record: IdempotencyRecord/);
    assert.equal(/claim\(/.test(idem), false);
  });

  it("validateIdempotency still admits through claim and fails closed without it", async () => {
    const seen = new Set();
    const store = {
      claim(scope, key) {
        const k = `${scope}|${key}`;
        if (seen.has(k)) return "duplicate";
        seen.add(k);
        return "claimed";
      },
    };
    assert.deepEqual(await validateIdempotency("idem-key-01", store), []);
    assert.deepEqual((await validateIdempotency("idem-key-01", store)).map((d) => d.code), ["Galerina_NETWORK_IDEMPOTENCY_DUPLICATE"]);
    assert.deepEqual((await validateReplayProtection("delivery-0001", { get() { return false; }, put() {} })).map((d) => d.code), ["Galerina_NETWORK_REPLAY_STORE_FAILED"]);
  });
});

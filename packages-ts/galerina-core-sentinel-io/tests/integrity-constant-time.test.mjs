// integrity-constant-time.test.mjs — the integrity gate compares digests in constant time.
//
// In keyed mode the expected hex is attacker-supplied (it rides in the manifest) and the actual hex
// is an HMAC under the border key. A short-circuiting `===` leaks, through timing, how long a prefix
// of the guess matches the real MAC — the classic byte-at-a-time MAC forgery oracle. The comparison
// now goes through crypto.timingSafeEqual after a length check; verdicts are unchanged.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import { createRequire, syncBuiltinESMExports } from "node:module";
import { IntegrityMonitor } from "../dist/index.js";

const require = createRequire(import.meta.url);
const cryptoCjs = require("node:crypto");
const originalTimingSafeEqual = cryptoCjs.timingSafeEqual;
let calls = 0;
cryptoCjs.timingSafeEqual = (a, b) => {
  calls += 1;
  return originalTimingSafeEqual(a, b);
};
syncBuiltinESMExports();
after(() => {
  cryptoCjs.timingSafeEqual = originalTimingSafeEqual;
  syncBuiltinESMExports();
});

const KEY = new Uint8Array(32).fill(3);
const BYTES = new TextEncoder().encode("governed block bytes");
const MAC = createHmac("sha256", KEY).update(BYTES).digest("hex");
const SHA = createHash("sha256").update(BYTES).digest("hex");

test("keyed verifyBlock uses a constant-time comparison", () => {
  const before = calls;
  const m = new IntegrityMonitor({ hmacKey: KEY });
  assert.equal(m.verifyBlock(BYTES, MAC, "b0").ok, true);
  assert.ok(calls > before, "timingSafeEqual must back the keyed digest comparison");
});

test("plain-SHA verifyBlock uses the same constant-time comparison", () => {
  const before = calls;
  assert.equal(new IntegrityMonitor().verifyBlock(BYTES, SHA, "b0").ok, true);
  assert.ok(calls > before);
});

test("verdicts are unchanged: near-miss, wrong-length, uppercase and non-hex expectations all fail closed", () => {
  const m = new IntegrityMonitor({ hmacKey: KEY });
  const flipped = (MAC[0] === "0" ? "1" : "0") + MAC.slice(1);
  for (const expected of [flipped, MAC.slice(0, -1), MAC + "0", MAC.toUpperCase(), "zz" + MAC.slice(2), ""]) {
    const r = m.verifyBlock(BYTES, expected, "b0");
    assert.equal(r.ok, false, `expected ${JSON.stringify(expected)} must not verify`);
    assert.equal(r.expected, expected);
    assert.equal(r.actual, MAC);
  }
  assert.throws(() => m.enforceBlock(BYTES, flipped, "b0"), (e) => e.code === "LSIO-INTEGRITY-001");
  assert.doesNotThrow(() => m.enforceBlock(BYTES, MAC, "b0"));
});

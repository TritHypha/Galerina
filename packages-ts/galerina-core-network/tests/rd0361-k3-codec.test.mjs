// rd0361-k3-codec.test.mjs: K3-UNKNOWN-NOT-ZERO (owner decision D-A, Phillip 2026-10-25 18:28 GMT). The test codec
// between native K3 Ints and the shipped TS Verdict is identity-only and fail-closed. NON_AUTHORIZING.
import { test } from "node:test";
import assert from "node:assert/strict";
import { K3_UNKNOWN } from "../../galerina-tower-citizen/dist/three-valued-governance.js";
import { decodeK3, encodeK3, NATIVE_UNKNOWN } from "./fixtures/rd0361-k3-codec.mjs";

test("K3U2-CODEC: -128 <-> the one K3_UNKNOWN object; trits pass through; 0 stays NEUTRAL; junk and forgeries throw", () => {
  assert.equal(NATIVE_UNKNOWN, -128);
  assert.equal(decodeK3(-128), K3_UNKNOWN);
  assert.equal(encodeK3(K3_UNKNOWN), -128);
  for (const t of [-1, 0, 1]) { assert.equal(decodeK3(t), t); assert.equal(encodeK3(t), t); }
  assert.notEqual(encodeK3(K3_UNKNOWN), 0, "UNKNOWN never encodes to the trit 0");
  for (const junk of [-127, -129, 2, 0.5, NaN, "-128", null, undefined, K3_UNKNOWN]) assert.throws(() => decodeK3(junk), /k3 codec/);
  const forged = Object.freeze({ kind: "K3_UNKNOWN", toString: () => "UNKNOWN" });
  for (const junk of [forged, { kind: "K3_UNKNOWN" }, -128, 2, NaN, "0", null, undefined]) assert.throws(() => encodeK3(junk), /k3 codec/);
});

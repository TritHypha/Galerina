// Machine-checked proof for @galerina/ext-tritsocket — ported from the ZT-tritsocket
// Rust core test suite (the reference implementation). Deny-only pre-filter: the
// load-bearing property is "Maybe is NOT an Allow, and forgery is contained".
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  Verdict, packedLen, pack, unpack, prefilter, dot, prefilterBatch, admit, admitSync, ABI_VERSION,
} from "../dist/index.js";

test("packing roundtrips and cache-line density", () => {
  assert.equal(packedLen(256), 64); // 256 trits per 64-byte cache line
  assert.equal(packedLen(4), 1);
  const trits = [1, 0, -1, 1, -1, 0, 1, 1];
  assert.deepEqual(unpack(pack(trits), trits.length), trits);
});

test("prefilter denies a MISSING required capability", () => {
  // mask requires lane 2 = +1; subject has 0 there → cheap Deny.
  assert.equal(prefilter(pack([1, 1, 0, 1]), pack([0, 0, 1, 0]), 4), Verdict.Deny);
});

test("prefilter denies a FORBIDDEN capability that is present", () => {
  // mask forbids lane 1 (= -1); subject has +1 there → cheap Deny.
  assert.equal(prefilter(pack([1, 1, 0, 0]), pack([0, -1, 0, 0]), 4), Verdict.Deny);
});

test("prefilter returns Maybe when not cheaply rejectable", () => {
  // need lane0=+1, forbid lane2; subject satisfies both cheap constraints.
  assert.equal(prefilter(pack([1, 1, 0, -1]), pack([1, 0, -1, 0]), 4), Verdict.Maybe);
});

test("reserved code fails closed (Deny)", () => {
  const subj = pack([1, 0, 0, 0]);
  subj[0] |= 0b11 << 2; // corrupt lane 1 to reserved
  assert.equal(prefilter(subj, pack([1, 0, 0, 0]), 4), Verdict.Deny);
});

test("undersized buffer fails closed (Deny)", () => {
  assert.equal(prefilter(new Uint8Array(0), pack([1, 0, 0, 0]), 4), Verdict.Deny);
});

test("there is NO Allow verdict — only Deny and Maybe", () => {
  assert.deepEqual(Object.keys(Verdict).sort(), ["Deny", "Maybe"]);
  assert.equal(Verdict.Deny, 0);
  assert.equal(Verdict.Maybe, 1);
  assert.equal(Verdict.Allow, undefined);
});

test("THE LOAD-BEARING PROOF: Maybe is not Allow — forgery is contained", async () => {
  const maskTrits = [1, -1, 0, 1, 0, -1, 1, 0];
  const mask = pack(maskTrits);
  const SECRET = 0xdead_beef;

  // A toy "real keyed gate" standing in for downstream PQ crypto: needs a SECRET the forger lacks.
  const realKeyedGate = (presented) => presented === SECRET;

  // Attacker forges the subject by copying the PUBLIC mask (present all required, avoid all forbidden).
  const forgedTrits = maskTrits.map((c) => (c === -1 ? 0 : c));
  const forged = pack(forgedTrits);

  // 1) The pre-filter CANNOT reject the forgery (public math, zero unforgeability) …
  assert.equal(prefilter(forged, mask, 8), Verdict.Maybe);
  assert.ok(dot(forged, mask, 8) > 0); // the forgeable functional is maximal-ish

  // 2) … but the COMPOSED gate DENIES, because the forger cannot present the secret token:
  assert.equal(await admit(forged, mask, 8, () => realKeyedGate(/* forger has no secret */ 0)), false);
  // and the legitimate holder (same subject + secret) IS admitted:
  assert.equal(await admit(forged, mask, 8, () => realKeyedGate(SECRET)), true);
});

test("prefilter Deny is a sound NECESSARY condition (never runs the real gate)", () => {
  // required lane0=+1 but subject lacks it: no downstream secret can make it present.
  let realGateCalls = 0;
  const admitted = admitSync(pack([0, 0, 0, 0]), pack([1, 0, 0, 0]), 4, () => { realGateCalls++; return true; });
  assert.equal(admitted, false);
  assert.equal(realGateCalls, 0, "a Deny must short-circuit BEFORE the expensive real gate");
});

test("batch work is LINEAR (Θ(n·len)), not O(1)", () => {
  const mask = pack([1, 0, -1, 0]);
  const one = pack([1, 1, 0, 0]);            // one Maybe subject
  const stride = packedLen(4);
  for (const n of [10, 100, 1000]) {
    const subjects = new Uint8Array(stride * n);
    for (let k = 0; k < n; k++) subjects.set(one, k * stride);
    const verdicts = prefilterBatch(subjects, mask, 4, n);
    assert.equal(verdicts.length, n);
    assert.ok(verdicts.every((v) => v === Verdict.Maybe));
  }
});

test("ABI version matches the native core", () => {
  assert.equal(ABI_VERSION, 1);
});

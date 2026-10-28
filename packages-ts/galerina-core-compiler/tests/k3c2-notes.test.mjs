// K3C-2 review notes N-g / N-h / N-i (ACK-WITH-NOTES AGENTS 6edfbbe) - regression gate.
// N-i: CompilerTrust carries the K3C-2 wire token UNKNOWN = -128 (0x80) in its TYPE and every trust
//      function treats it zero-trust: it never outranks REFUTED, never releases a boundary, never
//      leaks out of combine/discharge, and names as "Unverified". Any other non-trit fails closed.
// N-g: interpreter diagnostics state the K3 lattice order correctly (Deny < Unknown < Allow, in-memory
//      -1/0/+1; Unknown crosses the wire as -128) - never "Unknown(-128) < Allow". Phrased so the
//      K3-COPIES gate (no literal "Unknown(0)" in interpreter.ts) still holds.
// N-h: inference-governance.fungi no longer documents the undischarged trit as "UNKNOWN (0)".
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as L from "../dist/index.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG = join(HERE, "..");
const ROOT = join(PKG, "..", "..");
const { CompilerTrust, trustName, combineTrust, dischargeTrust, boundaryTrusted } = L;
const { PROVEN, UNVERIFIED, UNKNOWN, REFUTED } = CompilerTrust;
const TRITS = [PROVEN, UNVERIFIED, REFUTED];

test("N-i: UNKNOWN is the -128 wire token and the type admits it", () => {
  assert.equal(UNKNOWN, -128);
  const src = readFileSync(join(PKG, "src", "hardening-residency.ts"), "utf8");
  assert.match(src, /export type CompilerTrust = 1 \| 0 \| -1 \| -128;/, "CompilerTrust type must include -128");
  assert.doesNotMatch(src, /REFUTED=0, UNKNOWN=1, PROVEN=2/, "stale encoding comment must be gone");
});

test("N-i: trustName(-128) is Unverified, never Refuted or Trusted", () => {
  assert.equal(trustName(UNKNOWN), "Unverified");
  assert.equal(trustName(PROVEN), "Trusted");
  assert.equal(trustName(UNVERIFIED), "Unverified");
  assert.equal(trustName(REFUTED), "Refuted");
});

test("N-i: combineTrust - -128 behaves as UNVERIFIED, REFUTED stays absorbing, result is a trit", () => {
  for (const t of TRITS) {
    assert.equal(combineTrust(UNKNOWN, t), combineTrust(UNVERIFIED, t), `combine(-128,${t})`);
    assert.equal(combineTrust(t, UNKNOWN), combineTrust(t, UNVERIFIED), `combine(${t},-128)`);
  }
  assert.equal(combineTrust(UNKNOWN, REFUTED), REFUTED, "-128 must not outrank REFUTED");
  assert.equal(combineTrust(REFUTED, UNKNOWN), REFUTED);
  assert.equal(combineTrust(UNKNOWN, PROVEN), UNVERIFIED, "-128 must never lift to PROVEN");
  assert.equal(combineTrust(UNKNOWN, UNKNOWN), UNVERIFIED, "the wire token never leaks out of combine");
  for (const a of [...TRITS, UNKNOWN]) for (const b of [...TRITS, UNKNOWN]) {
    assert.ok(TRITS.includes(combineTrust(a, b)), `combine(${a},${b}) must be a trit`);
  }
});

test("N-i: dischargeTrust from -128 follows UNVERIFIED and never returns -128", () => {
  for (const v of [true, false, undefined]) {
    assert.equal(dischargeTrust(UNKNOWN, v), dischargeTrust(UNVERIFIED, v), `discharge(-128,${v})`);
  }
  assert.equal(dischargeTrust(UNKNOWN, undefined), UNVERIFIED);
  assert.equal(dischargeTrust(REFUTED, true), REFUTED, "REFUTED stays sticky");
});

test("N-i: boundaryTrusted(-128) denies; garbage fails closed everywhere", () => {
  assert.equal(boundaryTrusted(UNKNOWN), false);
  assert.equal(boundaryTrusted(PROVEN), true);
  for (const junk of [2, -2, 127, 0x80, NaN, 0.5, -127]) {
    assert.equal(trustName(junk), "Refuted", `trustName(${junk})`);
    assert.equal(boundaryTrusted(junk), false, `boundary(${junk})`);
    assert.equal(combineTrust(junk, PROVEN), REFUTED, `combine(${junk},PROVEN)`);
    assert.equal(combineTrust(PROVEN, junk), REFUTED, `combine(PROVEN,${junk})`);
    assert.equal(dischargeTrust(junk, true), REFUTED, `discharge(${junk},true)`);
  }
});

test("N-g: interpreter states the K3 lattice order correctly", () => {
  const src = readFileSync(join(PKG, "src", "interpreter.ts"), "utf8");
  assert.doesNotMatch(src, /Unknown\(-128\) < Allow/, "lattice order must not put the wire sentinel in the in-memory order");
  assert.doesNotMatch(src, /Deny\(-1\), Unknown\(-128\), or Allow\(\+1\)/, "snapshot verdict accepts in-memory -1/0/+1 only");
  assert.match(src, /Deny\(-1\) < Unknown < Allow\(\+1\); in memory Unknown is 0 and it crosses the wire as Unknown\(-128\)/);
  assert.match(src, /-1 \(Deny\), 0 \(Unknown\) or \+1 \(Allow\); Unknown\(-128\) is the wire form only/);
});

test("N-h: inference-governance.fungi no longer documents UNKNOWN (0)", () => {
  const f = readFileSync(join(ROOT, "packages-ts", "galerina-tower-citizen", "src", "self-hosted", "inference-governance.fungi"), "utf8");
  assert.doesNotMatch(f, /UNKNOWN \(0\)/);
  assert.match(f, /UNVERIFIED \(0\)/);
});
test("K3C-2 follow-up: the SLIDE discharge oracle maps the inconclusive trit through UNVERIFIED, not -128", () => {
  const oracle = readFileSync(join(ROOT, "scripts", "tests", "discharge-trust-fungi-slide.integration.test.mjs"), "utf8");
  // dischargeTrust returns UNVERIFIED (0) for an inconclusive verification; comparing against UNKNOWN (-128)
  // would map that result to 1 (PROVEN) - a fail-open oracle.
  assert.doesNotMatch(oracle, /result === CompilerTrust\.UNKNOWN/);
  assert.match(oracle, /result === CompilerTrust\.UNVERIFIED/);
  assert.equal(dischargeTrust(UNVERIFIED, undefined), UNVERIFIED);
});

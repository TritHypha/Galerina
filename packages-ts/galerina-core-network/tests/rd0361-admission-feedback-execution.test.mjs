// rd0361-admission-feedback-execution.test.mjs — RD-0361 (TLSTP): the admission-feedback `.fungi` twin
// EXECUTES; its degrade-only telemetry→K3 side-signal fold is proven EQUAL to spec.
//   R0 build → WASM · R1 sign + #105-admit · R3 exhaustive Int-fold differential (verdicts are trits or the native UNKNOWN sentinel -128).
// Moves admission-feedback shadow → differential. R4 authority = #143.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { twinSourceWithK3Wire } from "../../galerina-core-logic/tests/k3-wire-consumer-source.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const COMPILER = join(HERE, "..", "..", "galerina-core-compiler", "dist", "index.js");
const TWIN = join(HERE, "..", "src", "self-hosted", "admission-feedback.fungi");
// K3-UNKNOWN-NOT-ZERO (owner decision D-A, Phillip 2026-10-25 18:28 GMT): a degrade the twin cannot decide
// (health not UP, garbage score, throttle) is UNKNOWN, the native sentinel k3Unknown() = -128, never the trit 0.
// Rejected: 0 (conflates NEUTRAL); NEUTRAL for throttle (a computed 0 reads as settled, UNKNOWN fails closed and
// matches the shipped .ts, whose INDETERMINATE is now the K3_UNKNOWN alias).
const UNKNOWN = -128;
const TRITS = [-1, 0, 1];
const VALUES = [UNKNOWN, -1, 0, 1];
const B = [false, true];
const bit = (b) => (b ? 1 : 0);

// The degrade-only side-signal fold, from the twin's spec (starts at +1, vAnd's in each factor).
const refSideSignal = (health, present, garbage, hardDeny, throttle) => {
  let v = 1;
  if (health) v = Math.min(v, UNKNOWN);
  if (present) {
    if (garbage) v = Math.min(v, UNKNOWN);
    else if (hardDeny) v = Math.min(v, -1);
    else if (throttle) v = Math.min(v, UNKNOWN);
  }
  return v;
};

test("RD-0361 TLSTP · admission-feedback: R0 build → R1 #105-admit → R3 WASM ≡ degrade-only side-signal", async () => {
  assert.ok(existsSync(COMPILER), "core-compiler dist not built — run the full suite first");
  const L = await import(pathToFileURL(COMPILER).href);
  let src = readFileSync(TWIN, "utf8"); if (src.charCodeAt(0) === 0xFEFF) src = src.slice(1);
  src = twinSourceWithK3Wire(src);
  const prog = L.parseProgram(src, "admission-feedback.fungi");
  assert.equal((prog.diagnostics ?? []).filter((d) => d.severity === "error").length, 0, "twin parses clean (R0)");
  const fx = L.checkEffects(prog.flows, prog.ast);
  const { gir } = L.emitGIR(prog.ast, prog.flows, fx);
  const wat = L.renderWAT(L.buildWATModuleFromGIR(gir, undefined, "admission-feedback", prog.ast, true));
  const asm = await L.assembleWAT(wat);
  assert.ok(asm.valid && asm.diagnostics.length === 0, `twin WAT assembles (R0): ${JSON.stringify(asm.diagnostics)}`);
  const host = L.createHostRuntime();
  const kp = L.generateRunnerKeypair();
  const att = L.signWasm(asm.wasm, kp.privateKeyPem, "dev");
  const { instance } = await L.admitAndInstantiate({ wasm: asm.wasm, attestation: att, policy: { requireSigned: true, publicKeyPem: kp.publicKeyPem }, host });
  const X = instance.exports;
  for (const f of ["vAnd", "telemetrySideSignal", "k3Unknown"]) assert.equal(typeof X[f], "function", `${f} admitted (R1)`);
  assert.equal(X.k3Unknown(), UNKNOWN, "native UNKNOWN sentinel is -128, never the trit 0");

  for (const a of VALUES) for (const b of VALUES) assert.equal(X.vAnd(a, b), Math.min(a, b), `vAnd(${a},${b})`);
  for (const h of B) for (const p of B) for (const g of B) for (const hd of B) for (const t of B)
    assert.equal(X.telemetrySideSignal(bit(h), bit(p), bit(g), bit(hd), bit(t)), refSideSignal(h, p, g, hd, t),
      `telemetrySideSignal(${h},${p},${g},${hd},${t})`);
  // the safety property: the side-signal is always <= +1 (can only lower, never lift)
  for (const h of B) for (const p of B) for (const g of B) for (const hd of B) for (const t of B)
    assert.ok(X.telemetrySideSignal(bit(h), bit(p), bit(g), bit(hd), bit(t)) <= 1, "No-Coercion: side-signal <= +1");
  // K3U2: the side-signal is ALLOW, DENY or UNKNOWN; a degrade is never the trit 0
  for (const h of B) for (const p of B) for (const g of B) for (const hd of B) for (const t of B)
    assert.notEqual(X.telemetrySideSignal(bit(h), bit(p), bit(g), bit(hd), bit(t)), 0, "a side-signal is never the trit 0");
});

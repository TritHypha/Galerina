/**
 * #132 / FUNGI-LAYOUT-001 — a record field whose type does NOT lower to a 4-byte WASM `i32` slot must be
 * REFUSED at WASM-lowering time, not silently mis-laid-out. The record layout stores EVERY field via a
 * 4-byte `i32.store` at offset = index·4 (record-abi.ts: WAT_REC_FIELD_SIZE = 4), so any field wider than
 * an i32 — f64 (Float/Float64/Double), i64 (Int64/UInt64), or f32 (Float32/Float16) — cannot round-trip.
 * Measured 2026-07-19: every such record field builds an INVALID module (rejected at instantiate) or reads
 * back the WRONG value. The guard converts both into one early, actionable compile refusal.
 *
 * The boundary is a PROPERTY: `galerinaTypeToWAT(fieldType) !== "i32"` — drift-proof (reuses the emitter's
 * own type→wasm mapping) and self-correcting (a type is admitted the moment its lowering becomes an i32
 * handle). `Decimal` maps to f64 today (a latent inconsistency — it is designed as a bignum i32-handle),
 * so a Decimal record field is refused today and measurably breaks; it will be admitted with no edit once
 * its lowering is fixed. i32-handle occupants (String / Array / nested record / enum) are admitted.
 *
 * VALUE-DISCRIMINATING (not vacuous): the guard fires on EXACTLY the non-i32 field types and NOT on i32 /
 * i32-handle fields (Int-only records still compile + instantiate + return the right value), NOT on scalar
 * Float returns, and NOT on Array<Float> / String / nested-record fields (all i32 handles).
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as L from "../dist/index.js";

/** parse (assert clean — the guard is emitter-only, so these still TYPE-CHECK clean) → GIR → build. */
function toGir(program) {
  const prog = L.parseProgram(program, "wat-float-record-refusal.fungi");
  const errs = (prog.diagnostics ?? []).filter((d) => d.severity === "error");
  assert.equal(errs.length, 0, "program parses/type-checks clean (guard is WASM-emit-only): " + JSON.stringify(errs.slice(0, 3)));
  const fx = L.checkEffects(prog.flows, prog.ast);
  const { gir } = L.emitGIR(prog.ast, prog.flows, fx);
  return { gir, prog };
}
function buildModule(program, exportName) {
  const { gir, prog } = toGir(program);
  const mod = L.buildWATModuleFromGIR(gir, undefined, exportName, prog.ast, true);
  return { mod, prog };
}
/** true iff building the WASM module throws FUNGI-LAYOUT-001 specifically (not some other error). */
function refusedByLayoutGuard(program) {
  try { buildModule(program, "f"); return false; }
  catch (e) { return /FUNGI-LAYOUT-001/.test(String(e && e.message ? e.message : e)); }
}
const trivialFlow = `pure flow f() -> Int contract { intent { "x" } } { return 0 }`;

// Every type whose field lowers to a WASM value wider than the 4-byte i32 slot (f64 / i64 / f32),
// plus Decimal (maps to f64 today). A record DECLARING any of these must be refused.
const REFUSED = ["Float", "Float64", "Double", "Float32", "Float16", "Int64", "UInt64", "Decimal"];

describe("FUNGI-LAYOUT-001 — record fields wider than a 4-byte i32 slot are refused (fail-closed)", () => {
  it("refuses every non-i32 field type (f64 / i64 / f32 / Decimal) — declaration alone suffices", () => {
    for (const T of REFUSED) {
      const program = `record S { x: ${T} }\n${trivialFlow}`;
      assert.ok(refusedByLayoutGuard(program), `must refuse a record with a ${T} field`);
    }
  });

  it("the refusal names the offending field and its lowered wasm type (checkable, actionable)", () => {
    let msg = "";
    try { buildModule(`record Money { amount: Decimal }\n${trivialFlow}`, "f"); }
    catch (e) { msg = String(e && e.message ? e.message : e); }
    assert.ok(/FUNGI-LAYOUT-001/.test(msg), "carries the code");
    assert.ok(/Money\.amount/.test(msg), "names the offending record.field: " + msg.slice(0, 180));
    assert.ok(/f64/.test(msg), "names the lowered wasm type (f64 for Decimal today)");
  });

  it("does NOT refuse i32 / i32-handle fields — no false-refusal", () => {
    for (const decl of [
      `record S { x: Int }`,
      `record S { x: Bool; y: Byte }`,
      `record S { s: String; n: Int }`,                          // String = i32 handle
      `record S { xs: Array<Float>; n: Int }`,                   // Array<Float> = an i32 handle, NOT an f64 slot
      `record Inner { a: Int }\nrecord S { inner: Inner; n: Int }`, // nested record = i32 handle
    ]) {
      const program = `${decl}\n${trivialFlow}`;
      assert.equal(refusedByLayoutGuard(program), false, `must NOT refuse: ${decl.replace(/\n/g, " ")}`);
    }
  });

  it("an Int-only record still compiles, instantiates, and returns the right value (value-discriminating)", async () => {
    const program = `
record Pt { a: Int; b: Int }
pure flow readB() -> Int
contract { intent { "an Int-only record is unaffected by the layout guard" } }
{ let r = Pt { a: 3, b: 7 } return r.b }
`;
    assert.equal(refusedByLayoutGuard(program), false, "Int-only record must NOT be refused");
    const { mod, prog } = buildModule(program, "readB");
    const asm = await L.assembleWAT(L.renderWAT(mod));
    assert.ok(asm.valid && asm.diagnostics.length === 0, "Int record module assembles: " + JSON.stringify(asm.diagnostics));
    const host = L.createHostRuntime();
    for (const e of L.getInternedStrings()) host.seedString(e.handle, e.value);
    const kp = L.generateRunnerKeypair();
    const att = L.signWasm(asm.wasm, kp.privateKeyPem, "dev");
    const { instance } = await L.admitAndInstantiate({
      wasm: asm.wasm, attestation: att, policy: { requireSigned: true, publicKeyPem: kp.publicKeyPem }, host,
    });
    const wasmVal = Number(instance.exports.readB());
    const ir = await L.executeFlow("readB", new Map(), prog.ast, prog.flows, undefined, undefined, { pureFastPath: true });
    const interpVal = Number(ir?.value?.value ?? ir?.value ?? ir);
    assert.equal(wasmVal, 7, "Int record reads r.b = 7 in WASM");
    assert.equal(wasmVal, interpVal, "Int record: WASM matches interpreter");
  });

  it("does NOT over-refuse a SCALAR Float return (only record FIELDS are gated)", async () => {
    // A scalar Float value/return is supported (f64.* / f64.const). The layout guard must not touch it.
    const program = `
pure flow addF() -> Float
contract { intent { "scalar float return is supported, not a record field" } }
{ return 1.5 + 2.25 }
`;
    assert.equal(refusedByLayoutGuard(program), false, "scalar Float return must NOT be refused");
    const { mod } = buildModule(program, "addF");
    const asm = await L.assembleWAT(L.renderWAT(mod));
    assert.ok(asm.valid, "scalar Float module assembles");
    const host = L.createHostRuntime();
    for (const e of L.getInternedStrings()) host.seedString(e.handle, e.value);
    const kp = L.generateRunnerKeypair();
    const att = L.signWasm(asm.wasm, kp.privateKeyPem, "dev");
    const { instance } = await L.admitAndInstantiate({
      wasm: asm.wasm, attestation: att, policy: { requireSigned: true, publicKeyPem: kp.publicKeyPem }, host,
    });
    assert.equal(Number(instance.exports.addF()), 3.75, "scalar Float 1.5 + 2.25 = 3.75");
  });
});

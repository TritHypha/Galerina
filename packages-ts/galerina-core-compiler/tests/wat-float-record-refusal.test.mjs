/**
 * #132 / FUNGI-LAYOUT-001 — typed natural alignment admits faithful i32, i64 and f64 fields. The guard
 * still refuses Float16/Float32 until the scalar f32 expression lane exists. Decimal record
 * fields lower as i32 host handles (C02) and must not be treated as inexact f64. Tests prove
 * both the refusal and admission directions so the boundary cannot be weakened or left
 * permanently closed.
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

// Float32/Float16 do not yet have a scalar f32 expression lane. Decimal is an i32 host
// handle after C02 and is admitted; these tests still refuse the unfinished f32 lane.
const REFUSED = ["Float32", "Float16"];

describe("FUNGI-LAYOUT-001 — unfaithful record field representations are refused (fail-closed)", () => {
  it("refuses f32 fields without a scalar f32 lane", () => {
    for (const T of REFUSED) {
      const program = `record S { x: ${T} }\n${trivialFlow}`;
      assert.ok(refusedByLayoutGuard(program), `must refuse a record with a ${T} field`);
    }
  });

  it("admits naturally aligned f64 and i64 fields", () => {
    for (const T of ["Float", "Float64", "Double", "Int64", "UInt64"]) {
      const program = `record S { x: ${T} }\n${trivialFlow}`;
      assert.equal(refusedByLayoutGuard(program), false, `must admit a record with a ${T} field`);
    }
  });

  it("the refusal names the offending field and its lowered wasm type (checkable, actionable)", () => {
    let msg = "";
    try { buildModule(`record Sample { amount: Float32 }\n${trivialFlow}`, "f"); }
    catch (e) { msg = String(e && e.message ? e.message : e); }
    assert.ok(/FUNGI-LAYOUT-001/.test(msg), "carries the code");
    assert.ok(/Sample\.amount/.test(msg), "names the offending record.field: " + msg.slice(0, 180));
    assert.ok(/f32/.test(msg), "names the lowered wasm type (f32 for Float32)");
  });

  it("does NOT refuse i32 / i32-handle fields — no false-refusal", () => {
    for (const decl of [
      `record S { x: Int }`,
      `record S { x: Bool; y: Byte }`,
      `record S { s: String; n: Int }`,                          // String = i32 handle
      `record S { amount: Decimal; n: Int }`,                    // Decimal = i32 host handle, NOT an f64 slot
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

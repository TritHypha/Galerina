// float-nonfinite WASM parity (#55, increment 2 — 0014 differential). The tree-walker traps on a non-finite
// float (mkFloat / floatCmp, SPORE-FLOAT-NAN-001); the WASM tier must trap IDENTICALLY or the fail-open simply
// moves to the opt-in WASM path. The wat-emitter now wraps every f64 arithmetic RESULT and ordering-compare
// OPERAND in $spore_assert_finite_f64 (traps `unreachable` on NaN/±Inf) and rejects a non-finite f64.const.
// This asserts: non-finite ⇒ BOTH tiers fail closed; finite ⇒ BOTH tiers compute the same value.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as L from "../dist/index.js";

async function walkerTraps(src, flow) {
  const p = L.parseProgram(src, "p.spore");
  assert.equal(p.diagnostics.filter((d) => d.severity === "error").length, 0, "parse");
  try { L.resolveSymbols(p.ast); L.checkTypes(p.ast); } catch {}
  const r = await L.executeFlow(flow, new Map(), p.ast);
  return r?.value?.__tag === "runtimeError" && r.value.message === "NonFiniteFloat";
}
async function runWasm(src, flow) {
  const p = L.parseProgram(src, "p.spore");
  assert.equal(p.diagnostics.filter((d) => d.severity === "error").length, 0, "parse");
  const fx = L.checkEffects(p.flows, p.ast);
  const { gir } = L.emitGIR(p.ast, p.flows, fx);
  const wat = L.renderWAT(L.buildWATModuleFromGIR(gir, undefined, "p", p.ast, true));
  const asm = await L.assembleWAT(wat);
  assert.ok(asm.valid, `assembles: ${JSON.stringify(asm.diagnostics)}`);
  const kp = L.generateRunnerKeypair();
  const att = L.signWasm(asm.wasm, kp.privateKeyPem, "dev");
  const { instance } = await L.admitAndInstantiate({ wasm: asm.wasm, attestation: att,
    policy: { requireSigned: true, publicKeyPem: kp.publicKeyPem }, host: L.createHostRuntime() });
  return instance.exports[flow]; // a thunk; calling it traps for the non-finite cases
}
const F = (body, ret = "Float") => `pure flow f() -> ${ret}\ncontract { effects {} }\n{ ${body} }`;

const NONFINITE = [
  ["0.0/0.0 → NaN", F("let z: Float = 0.0  return 0.0 / z")],
  ["NaN passes upper guard", F("let z: Float = 0.0  let a: Float = 0.0 / z  return a > 1000000.0", "Bool")],
  ["x/0.0 → +Inf", F("let z: Float = 0.0  return 1.0 / z")],
  ["overflow → +Inf", F("let a: Float = 1.0e308  return a * 10.0")],
  ["1e400 literal → +Inf", F("return 1e400")],
];

describe("Float non-finite: BOTH tiers fail closed (#55 0014 parity)", () => {
  for (const [label, src] of NONFINITE) {
    it(`${label} — walker traps AND WASM traps`, async () => {
      assert.equal(await walkerTraps(src, "f"), true, `walker must trap on: ${label}`);
      const thunk = await runWasm(src, "f");
      assert.throws(() => thunk(), `WASM must trap (unreachable) on: ${label}`);
    });
  }

  it("FINITE floats compute the SAME value on both tiers (no false trap)", async () => {
    const cases = [
      [F("return 1.5 + 2.5"), 4],
      [F("let z: Float = 2.0  return 3.0 / z"), 1.5],
      [F("let a: Float = 1.0e308  return a"), 1e308], // large but finite — must NOT trap
    ];
    for (const [src, expected] of cases) {
      assert.equal(await walkerTraps(src, "f"), false, `finite must not trap (walker): ${expected}`);
      const thunk = await runWasm(src, "f");
      assert.equal(Number(thunk()), expected, `WASM finite value: ${expected}`);
    }
  });
});

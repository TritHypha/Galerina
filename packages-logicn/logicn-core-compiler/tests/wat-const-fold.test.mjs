/**
 * AOT #1 — constant-expression folding in the WAT emitter (R&D 0036, 2026-06-19).
 *
 * `foldToInt` now folds `const <op> const` arithmetic at build time using the SAME checked i32 ops as
 * runtime → emits `(i32.const RESULT)` instead of the runtime op. Trap-safe: a constant op that would
 * OVERFLOW / div0 is NOT folded (foldToInt returns null) so the runtime checked op is emitted and fails
 * closed (Fork-A=TRAP / 0038). Fidelity-safe: folding is semantics-preserving, so WASM ≡ interpreter.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as L from "../dist/index.js";

function compileWAT(src) {
  const p = L.parseProgram(src, "cf.lln");
  const errs = p.diagnostics.filter((d) => d.severity === "error");
  assert.equal(errs.length, 0, "parse: " + errs.map((e) => e.message).join("; "));
  const fx = L.checkEffects(p.flows, p.ast);
  const { gir } = L.emitGIR(p.ast, p.flows, fx);
  return { wat: L.renderWAT(L.buildWATModuleFromGIR(gir, undefined, "cf", p.ast, true)), prog: p };
}
async function run(src, flow, args = []) {
  const { wat } = compileWAT(src);
  const asm = await L.assembleWAT(wat);
  assert.ok(asm.valid && asm.diagnostics.length === 0, `assembles: ${JSON.stringify(asm.diagnostics)}`);
  const kp = L.generateRunnerKeypair();
  const att = L.signWasm(asm.wasm, kp.privateKeyPem, "dev");
  const { instance } = await L.admitAndInstantiate({ wasm: asm.wasm, attestation: att, policy: { requireSigned: true, publicKeyPem: kp.publicKeyPem }, host: L.createHostRuntime() });
  let trapped = false, val;
  try { val = instance.exports[flow](...args); } catch { trapped = true; }
  return { wat, val, trapped };
}

describe("AOT #1: const-expression folding (WAT emitter)", () => {
  it("folds `60 * 24` to (i32.const 1440) — no runtime mul emitted", () => {
    const { wat } = compileWAT(`pure flow scale() -> Int\ncontract { effects {} }\n{ let s: Int = 60 * 24  return s }`);
    assert.ok(wat.includes("(i32.const 1440)"), `expected folded constant 1440:\n${wat}`);
    assert.ok(!wat.includes("$lln_checked_mul_i32"), `the constant mul must be folded away, not emitted:\n${wat}`);
  });

  it("folds a nested const chain `2 * 3 + 4` to (i32.const 10)", () => {
    const { wat } = compileWAT(`pure flow k() -> Int\ncontract { effects {} }\n{ return 2 * 3 + 4 }`);
    assert.ok(wat.includes("(i32.const 10)"), `expected folded 10:\n${wat}`);
  });

  it("a folded constant flow EXECUTES to the folded value", async () => {
    const { val, trapped } = await run(`pure flow scale() -> Int\ncontract { effects {} }\n{ return 60 * 24 }`, "scale");
    assert.equal(trapped, false);
    assert.equal(val, 1440);
  });

  it("does NOT fold a TRAPPING constant (overflow) — emits the runtime checked-mul, stays fail-closed", async () => {
    const { wat, trapped } = await run(`pure flow ovf() -> Int\ncontract { effects {} }\n{ return 2000000000 * 2000000000 }`, "ovf");
    // the PRODUCT must not be folded — the runtime checked op must be present (operands stay i32.const literals)
    assert.ok(wat.includes("$lln_checked_mul_i32"), `an overflowing const must keep the runtime checked mul (not fold to a literal):\n${wat}`.slice(0, 400));
    assert.equal(trapped, true, "the overflowing constant must trap at runtime (Fork-A=TRAP), not fold to a wrong value");
  });

  it("fidelity: const-fold + dynamic part is byte-identical interp ≡ WASM", async () => {
    const src = `pure flow h(n: Int) -> Int\ncontract { effects {} }\n{ let scale: Int = 60 * 24  return n * scale }`;
    for (const n of [0, 1, 7, 100]) {
      const { val } = await run(src, "h", [n]);
      const p = L.parseProgram(src, "h.lln");
      const ref = (await L.executeFlow("h", new Map([["n", { __tag: "int", value: n }]]), p.ast, p.flows)).value;
      assert.equal(ref.__tag, "int");
      assert.ok(Object.is(val, ref.value), `n=${n}: WASM ${val} must equal interp ${ref.value}`);
    }
  });
});

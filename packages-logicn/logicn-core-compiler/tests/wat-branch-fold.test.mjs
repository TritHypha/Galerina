/**
 * AOT #2 — branch-folding + dead-arm DCE in the WAT emitter (R&D 0036, 2026-06-19).
 *
 * `foldToBool` folds a compile-time-constant `if` condition (bool literals, `!`, const-int comparisons,
 * const `&&`/`||`) to true/false. At the ifStmt site the emitter then emits ONLY the taken arm inline —
 * the dead arm + its locals are never emitted. Semantics-preserving: the interpreter evaluates the same
 * constant condition and takes the same branch, so WASM ≡ interpreter (0014-safe). A non-constant
 * condition is unaffected (the runtime `(if …)` is emitted unchanged).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as L from "../dist/index.js";

function compileWAT(src) {
  const p = L.parseProgram(src, "bf.lln");
  const errs = p.diagnostics.filter((d) => d.severity === "error");
  assert.equal(errs.length, 0, "parse: " + errs.map((e) => e.message).join("; "));
  const fx = L.checkEffects(p.flows, p.ast);
  const { gir } = L.emitGIR(p.ast, p.flows, fx);
  return { wat: L.renderWAT(L.buildWATModuleFromGIR(gir, undefined, "bf", p.ast, true)), prog: p };
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

describe("AOT #2: branch-folding + dead-arm DCE (WAT emitter)", () => {
  it("a const-TRUE condition keeps the then-arm and DROPS the else-arm", async () => {
    const src = `pure flow pick() -> Int\ncontract { effects {} }\n{ if 5 > 0 { return 111 } else { return 222 } }`;
    const { wat, val, trapped } = await run(src, "pick");
    assert.equal(trapped, false);
    assert.equal(val, 111, "takes the then-arm of a const-true if");
    assert.ok(wat.includes("(i32.const 111)"), `then value present:\n${wat}`);
    assert.ok(!wat.includes("(i32.const 222)"), `dead else-arm must be dropped (no 222):\n${wat}`);
  });

  it("a const-FALSE condition keeps the else-arm and DROPS the then-arm", async () => {
    const src = `pure flow pick() -> Int\ncontract { effects {} }\n{ if 3 >= 9 { return 111 } else { return 222 } }`;
    const { wat, val } = await run(src, "pick");
    assert.equal(val, 222, "takes the else-arm of a const-false if");
    assert.ok(!wat.includes("(i32.const 111)"), `dead then-arm must be dropped (no 111):\n${wat}`);
  });

  it("folds `!false` (bool literal + unary) and `1 == 1 && 2 < 3` (const &&)", async () => {
    const a = await run(`pure flow u() -> Int\ncontract { effects {} }\n{ if !false { return 111 } else { return 222 } }`, "u");
    assert.equal(a.val, 111);
    const b = await run(`pure flow c() -> Int\ncontract { effects {} }\n{ if 1 == 1 && 2 < 3 { return 111 } else { return 222 } }`, "c");
    assert.equal(b.val, 111);
  });

  it("a folded-FALSE if with NO else emits nothing (falls through to the next statement)", async () => {
    const src = `pure flow g() -> Int\ncontract { effects {} }\n{ if 1 > 2 { return 111 } return 222 }`;
    const { wat, val } = await run(src, "g");
    assert.equal(val, 222, "the dead if is dropped; control falls to the trailing return");
    assert.ok(!wat.includes("(i32.const 111)"), `dead then-arm dropped:\n${wat}`);
  });

  it("a NON-constant condition is NOT folded (the runtime if is still emitted)", () => {
    const { wat } = compileWAT(`pure flow d(n: Int) -> Int\ncontract { effects {} }\n{ if n > 0 { return 111 } else { return 222 } }`);
    assert.ok(wat.includes("(if "), `a dynamic condition must keep the runtime if:\n${wat}`);
    assert.ok(wat.includes("(i32.const 111)") && wat.includes("(i32.const 222)"), "both arms emitted for a dynamic if");
  });

  it("fidelity: a folded branch over a dynamic tail is byte-identical interp ≡ WASM", async () => {
    const src = `pure flow h(n: Int) -> Int\ncontract { effects {} }\n{ if 10 > 3 { return 100 + n } else { return 200 + n } }`;
    for (const n of [0, 1, 7, 100]) {
      const { val } = await run(src, "h", [n]);
      const p = L.parseProgram(src, "h.lln");
      const ref = (await L.executeFlow("h", new Map([["n", { __tag: "int", value: n }]]), p.ast, p.flows)).value;
      assert.equal(ref.__tag, "int");
      assert.ok(Object.is(val, ref.value), `n=${n}: WASM ${val} must equal interp ${ref.value} (folded branch)`);
    }
  });
});

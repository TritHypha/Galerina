/**
 * S2 / Tri-Fuse A — per-operand static elision of a governance min-chain in the invariant-gate emitter
 * (RD-0456, 2026-07-18). `extractInvariantEnsures` decomposes an `ensure a && b && …` conjunction and elides
 * each operand that `tryConstantFold` proves ALLOW (min-identity `true && x = x`), collapses on a proven-DENY
 * operand (annihilator → governance verifier's FUNGI-INV-001), and keeps the gate over the unknown operands.
 *
 * The load-bearing properties: (1) a proven operand IS elided (real win, not a no-op); (2) a runtime operand is
 * NEVER elided (no fail-open — the gate still enforces it); (3) an all-unknown conjunction is byte-identical
 * (only conjunctions with something to elide change); (4) runtime behaviour is identical (WASM still traps).
 * Oracle for the maths: verify-governance-algebra SUITE 4 (elision-soundness), 169/169.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as L from "../dist/index.js";

function compileWAT(src) {
  const p = L.parseProgram(src, "a.fungi");
  const errs = p.diagnostics.filter((d) => d.severity === "error");
  assert.equal(errs.length, 0, "parse: " + errs.map((e) => e.message).join("; "));
  const fx = L.checkEffects(p.flows, p.ast);
  const { gir } = L.emitGIR(p.ast, p.flows, fx);
  return L.renderWAT(L.buildWATModuleFromGIR(gir, undefined, "a", p.ast, true));
}
const ensureGates = (wat) => wat.split("\n").filter((l) => l.includes(";; ensure")).map((l) => l.trim());
async function run(src, flow, args) {
  const wat = compileWAT(src);
  const asm = await L.assembleWAT(wat);
  assert.ok(asm.valid, `assembles: ${JSON.stringify(asm.diagnostics)}`);
  const kp = L.generateRunnerKeypair();
  const att = L.signWasm(asm.wasm, kp.privateKeyPem, "dev");
  const { instance } = await L.admitAndInstantiate({ wasm: asm.wasm, attestation: att, policy: { requireSigned: true, publicKeyPem: kp.publicKeyPem }, host: L.createHostRuntime() });
  let trapped = false, val;
  try { val = instance.exports[flow](...args); } catch { trapped = true; }
  return { trapped, val };
}

describe("S2/A: per-operand static elision (Tri-Fuse min-chain)", () => {
  it("★ elides a statically-ALLOW operand: `true && x > 0` gates ONLY x > 0", () => {
    const gates = ensureGates(compileWAT(`pure flow f(x: Int) -> Int\ncontract { invariant { ensure true && x > 0 } effects {} }\n{ return x }`));
    assert.equal(gates.length, 1, `one gate expected: ${gates}`);
    assert.match(gates[0], /;; ensure x > 0$/, "the elided gate comment must be the surviving operand, not the conjunction");
    assert.match(gates[0], /i32\.gt_s .*local\.get \$p0/, "the x > 0 runtime check must survive");
    assert.doesNotMatch(gates[0], /i32\.and/, "no conjunction remains — the `true` operand was elided");
  });

  it("★ fail-CLOSED: a runtime operand is NEVER elided even beside constants (`x > 0 && true && x < 100`)", () => {
    const gates = ensureGates(compileWAT(`pure flow f(x: Int) -> Int\ncontract { invariant { ensure x > 0 && true && x < 100 } effects {} }\n{ return x }`));
    assert.equal(gates.length, 1, `one gate: ${gates}`);
    assert.match(gates[0], /local\.get \$p0/, "both runtime operands survive");
    // the two runtime operands are kept (x>0 AND x<100); the `true` between them is gone → still a conjunction of 2.
    assert.match(gates[0], /i32\.gt_s/, "x > 0 kept");
    assert.match(gates[0], /i32\.lt_s/, "x < 100 kept");
  });

  it("all-unknown conjunction is byte-identical (nothing to elide): `x > 0 && y > 0` keeps the full i32.and", () => {
    const gates = ensureGates(compileWAT(`pure flow g(x: Int, y: Int) -> Int\ncontract { invariant { ensure x > 0 && y > 0 } effects {} }\n{ return x }`));
    assert.equal(gates.length, 1);
    assert.match(gates[0], /i32\.and/, "the whole conjunction is gated unchanged");
    assert.match(gates[0], /;; ensure x > 0 && y > 0$/);
  });

  it("★ runtime behaviour is IDENTICAL — the elided gate still enforces x > 0 at run time", async () => {
    const src = `pure flow f(x: Int) -> Int\ncontract { invariant { ensure true && x > 0 } effects {} }\n{ return x }`;
    assert.equal((await run(src, "f", [7])).val, 7, "x=7 satisfies x>0 → returns 7");
    assert.equal((await run(src, "f", [0])).trapped, true, "x=0 violates x>0 → the surviving gate traps (fail-closed)");
  });
});

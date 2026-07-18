// wat-tri-fuse-b-deny-sentinel.test.mjs — pins S2 / Tri-Fuse B (RD-0456): the deny-sentinel codegen convention.
//
// B is the init-DENY discipline for the verdict slot that C (verdict-as-mask, S4) will materialize: a slot must
// initialize to DENY(-1) BEFORE any write, so a codegen path that forgets to write it reads DENY, never
// 0/undefined/ALLOW — the fail-open is structurally UNWRITABLE. Today no slot is emitted (C is S4), so B is the
// CONVENTION + its pin: a named sentinel + an emit helper, DORMANT (byte-parity-safe — it changes no emitted
// WASM), so C's future slot is born fail-closed rather than retrofitted.
//
// The maths that -1 (the sentinel) can never authorize is bound to the REAL `authorize` in
// galerina-tower-citizen/tests/governance-algebra-binding.test.mjs (authorize(-1) === false). Here we pin the
// codegen value + helper, and prove the primitive is dormant so landing it is byte-identical.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { GOVERNANCE_VERDICT_DENY_SENTINEL, emitVerdictSlotInitWAT } from "../dist/wat-emitter.js";
import * as L from "../dist/index.js";

function compileWAT(src) {
  const p = L.parseProgram(src, "b.fungi");
  const errs = p.diagnostics.filter((d) => d.severity === "error");
  assert.equal(errs.length, 0, "parse: " + errs.map((e) => e.message).join("; "));
  const fx = L.checkEffects(p.flows, p.ast);
  const { gir } = L.emitGIR(p.ast, p.flows, fx);
  return L.renderWAT(L.buildWATModuleFromGIR(gir, undefined, "b", p.ast, true));
}

describe("S2/B: deny-sentinel codegen convention (Tri-Fuse)", () => {
  it("★ the sentinel is DENY(-1) — an unwritten verdict slot reads DENY, never ALLOW/INDETERMINATE", () => {
    assert.equal(GOVERNANCE_VERDICT_DENY_SENTINEL, -1, "the deny sentinel must be -1 (DENY in the K3 verdict lattice)");
    // Regression bite: flipping the sentinel to ALLOW(+1) or INDETERMINATE(0) would be a fail-open — pin it out.
    assert.notEqual(GOVERNANCE_VERDICT_DENY_SENTINEL, 0, "sentinel must NOT be 0 (INDETERMINATE) — 0-init is the fail-open B cures");
    assert.notEqual(GOVERNANCE_VERDICT_DENY_SENTINEL, 1, "sentinel must NOT be +1 (ALLOW) — an unwritten slot must never authorize");
  });

  it("★ emitVerdictSlotInitWAT emits the DENY init: (local.set $v (i32.const -1)) — fail-closed before any write", () => {
    const wat = emitVerdictSlotInitWAT("v0");
    assert.match(wat, /\(i32\.const -1\)/, "the init must store the DENY sentinel -1");
    assert.match(wat, /local\.set \$v0/, "the init must target the named verdict local");
    // the const must be the sentinel constant, not a hard-coded literal that could drift from it
    assert.ok(wat.includes(`(i32.const ${GOVERNANCE_VERDICT_DENY_SENTINEL})`), "the emitted const must be the sentinel constant");
  });

  it("★ B is DORMANT — a compiled governance flow emits NO verdict-slot init today (byte-parity-safe until C/S4)", () => {
    // A flow with a runtime invariant gate is the shape C will later hoist a verdict slot for. Prove that TODAY
    // the emitter does not reference the deny-sentinel init — so landing B changes no emitted WASM. When C wires
    // it (S4), this expectation flips deliberately, and the "S2/B deny-sentinel" marker makes the wiring visible.
    const wat = compileWAT(`pure flow f(x: Int) -> Int\ncontract { invariant { ensure x > 0 } effects {} }\n{ return x }`);
    assert.doesNotMatch(wat, /S2\/B deny-sentinel/, "the deny-sentinel init must be dormant (unreferenced by live emission) until C");
  });
});

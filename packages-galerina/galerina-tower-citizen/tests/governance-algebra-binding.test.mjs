// governance-algebra-binding.test.mjs — BIND the standard governance algebra to Galerina's REAL shipped ops.
//
// tools/verify-governance-algebra.mjs re-verifies the STANDARD mathematical definitions (K3, balanced
// ternary, Tri-Fuse) against inline reference operators — a self-contained "the maths is internally sound"
// proof. On its own that does NOT prove main's ACTUAL functions match those definitions (a self-contained
// oracle can pass while a buggy `sumTrit` ships). This counted test closes that gap two ways:
//   (1) it RUNS the oracle in the `npm test` suite, so a divergence in the standard-defs proof is caught by
//       CI, not only at a manual checkpoint; and
//   (2) it binds the arith-family separation (SUITE 3 — the RD-0510 brand justification) and the Tri-Fuse
//       min-identity / no-coercion (SUITE 4 A/B) to the REAL exported ops, so a regression in the shipped
//       gate turns this red.
// The Kleene faces (vAnd=minTrit ∧, vOr=maxTrit ∨, vNot=negTrit ¬) are already bound against independent
// hand-authored K3 tables by three-valued-governance.test.mjs; this file covers the arith + Tri-Fuse maths
// that main cites (tpl-simulator / trit-brand / wat-tri-fuse-a-elision) but did not previously re-run.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  Verdict, vAnd, authorize,
  sumTrit, mulTrit, consensusTrit,
} from "../dist/index.js";
import { verifyGovernanceAlgebra } from "../../../tools/verify-governance-algebra.mjs";

const T = [-1, 0, 1]; // the trit lattice
const { ALLOW, DENY, INDETERMINATE } = Verdict;

// Standard reference operators (the definitions the oracle proves; re-declared here to bind the REAL ops to).
const stdMin = (a, b) => (a < b ? a : b);
const stdSum = (a, b) => { const s = a + b; return s === 2 ? -1 : s === -2 ? 1 : s; };
const stdMul = (a, b) => { const p = a * b; return p === 0 ? 0 : p; };
const stdCons = (a, b, c) => { const s = a + b + c; return s > 0 ? 1 : s < 0 ? -1 : 0; };

describe("governance-algebra: the standard-definitions oracle runs green in the counted suite", () => {
  it("★ verifyGovernanceAlgebra() — every check passes (a divergence is a fail-open in the algebra)", () => {
    const { n, bad, failures } = verifyGovernanceAlgebra();
    assert.equal(bad, 0, `oracle divergences: ${failures.join(" · ")}`);
    // Non-vacuity: the five suites are exhaustive over the lattice — guard against a silent shrink.
    assert.ok(n >= 150, `oracle ran only ${n} checks (expected the full exhaustive suite)`);
    assert.equal(n, 169, `oracle check count changed from 169 to ${n} — update the citations if intended`);
  });

  it("the oracle is importable as a pure function (no process.exit on import)", () => {
    // If importing had exited, this test file would never have loaded; asserting the shape documents the contract.
    assert.equal(typeof verifyGovernanceAlgebra, "function");
    assert.doesNotMatch(fileURLToPath(import.meta.url), /tools[\\/]/, "binding test lives in the package, imports the root tool");
  });
});

describe("governance-algebra: SUITE 4 (A/B) Tri-Fuse maths bound to the REAL governance gate", () => {
  it("★ (A) min-identity holds on the REAL vAnd: vAnd(ALLOW, x) === x ∀x → a proven-ALLOW operand elides soundly", () => {
    for (const x of T) assert.equal(vAnd(ALLOW, x), x, `vAnd(ALLOW,${x}) must be ${x} (min-identity) — the S2/A elision soundness`);
  });

  it("★ (A) annihilator holds on the REAL vAnd: vAnd(DENY, x) === DENY ∀x → a proven-DENY operand collapses the chain", () => {
    for (const x of T) assert.equal(vAnd(DENY, x), DENY, `vAnd(DENY,${x}) must be DENY (annihilator)`);
  });

  it("★ (B) no-coercion on the REAL authorize∘vAnd: authorize(vAnd(v,s)) ⇔ v=ALLOW ∧ s=ALLOW", () => {
    for (const v of T) for (const s of T) {
      assert.equal(authorize(vAnd(v, s)), v === ALLOW && s === ALLOW, `no-coercion violated at (${v},${s})`);
    }
  });

  it("★ (B) only an explicit ALLOW authorizes on the REAL authorize (unwritten/INDETERMINATE/DENY never do)", () => {
    assert.equal(authorize(ALLOW), true, "ALLOW authorizes");
    assert.equal(authorize(INDETERMINATE), false, "INDETERMINATE (unwritten slot) never authorizes — fail-closed");
    assert.equal(authorize(DENY), false, "DENY never authorizes");
  });

  it("(B) the deny-sentinel value INDETERMINATE(0)/DENY(-1) both collapse to non-authorization (fail-open unwritable)", () => {
    // The S2/B codegen convention inits a verdict slot to DENY(-1); this pins that an unwritten-then-read slot
    // (0 or -1) can never be observed as authorized on the real authorize — the algebra behind the codegen rule.
    for (const s of T) if (s !== ALLOW) assert.equal(authorize(s), false, `slot value ${s} must not authorize`);
  });
});

describe("governance-algebra: SUITE 3 arith-family separation bound to the REAL arith ops (RD-0510 brand justification)", () => {
  it("★ the REAL sumTrit RAISES a verdict (sumTrit(DENY,DENY) === ALLOW) — why arith must be brand-separated from Verdict", () => {
    assert.equal(sumTrit(DENY, DENY), ALLOW, "sumTrit(-1,-1) must be +1 — an arith op manufactures ALLOW from two DENYs");
  });

  it("★ the REAL consensusTrit outvotes a lone DENY (consensusTrit(ALLOW,ALLOW,DENY) === ALLOW)", () => {
    assert.equal(consensusTrit(ALLOW, ALLOW, DENY), ALLOW, "consensus(1,1,-1) must be +1 — majority overrides a DENY");
  });

  it("the REAL arith ops match their standard definitions exhaustively (sumTrit / mulTrit / consensusTrit)", () => {
    for (const a of T) for (const b of T) {
      assert.equal(sumTrit(a, b), stdSum(a, b), `sumTrit(${a},${b})`);
      assert.equal(mulTrit(a, b), stdMul(a, b), `mulTrit(${a},${b})`);
      for (const c of T) assert.equal(consensusTrit(a, b, c), stdCons(a, b, c), `consensusTrit(${a},${b},${c})`);
    }
  });

  it("★ the REAL arith SUM truth-table is DISJOINT from the REAL governance min (they cannot be confused)", () => {
    const sumTable = T.flatMap((a) => T.map((b) => sumTrit(a, b))).join(",");
    const minTable = T.flatMap((a) => T.map((b) => vAnd(a, b))).join(",");
    assert.notEqual(sumTable, minTable, "arith SUM and governance min must be distinct functions — the brand keeps them non-assignable");
    // and the governance min IS the standard min (bind the fail-closed conjunction to the real vAnd)
    assert.equal(minTable, T.flatMap((a) => T.map((b) => stdMin(a, b))).join(","), "real vAnd must equal the standard Kleene min");
  });
});

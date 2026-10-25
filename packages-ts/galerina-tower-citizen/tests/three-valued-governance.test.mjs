// Three-valued governance verdicts (Direction A) — truth-table ORACLE + proved
// fail-closed soundness. Follows the #166/#185 oracle pattern: each table is pinned
// against an INDEPENDENT Kleene K3 reference written out by hand (not derived from
// min/max/neg), so a bug in the delegation can't hide behind a self-consistent check.
//
// Spec + proofs: ../ZTF-Knowledge-Bases/galerina-three-valued-governance.md
import assert from "node:assert/strict";
import { describe, it, test } from "node:test";
import {
  Verdict, vAnd, vOr, vNot, allOf, anyOf, collapse, authorize,
  decideAtBoundary, GOV_3VL_DIAGNOSTIC, SecurityTrap,
} from "../dist/index.js";
// The underlying #173/#196 gates are now INTERNAL number primitives — the RD-0510 arith-Trit brand de-exported
// them from the barrel (a bare-number arith surface is the laundering path). Import from the module directly to
// pin "reuse, no semantics changed" (this test proves vAnd=minTrit etc., which needs the raw primitive).
import { minTrit, maxTrit, negTrit } from "../dist/tpl-simulator.js";

const TRITS = [Verdict.DENY, Verdict.NEUTRAL, Verdict.ALLOW]; // the computed trits -1, 0, 1
// K3U2 (2026-10-25): the fourth lattice value is the typed UNKNOWN sentinel (not the trit 0).
const U = Verdict.UNKNOWN;
const VALS = [...TRITS, U];
const key = (v) => (v === U ? "U" : String(v));

// -- Independent Kleene K3 reference tables over the computed trits (F=-1, N=0, T=+1) --
// Hand-authored from the K3 definition, NOT from minTrit/maxTrit/negTrit. UNKNOWN is
// infectious (weak Kleene): any U operand gives U, so U can never be lifted to ALLOW.
const K3_AND = {
  "-1,-1": -1, "-1,0": -1, "-1,1": -1,
  "0,-1": -1, "0,0": 0, "0,1": 0,
  "1,-1": -1, "1,0": 0, "1,1": 1,
};
const K3_OR = {
  "-1,-1": -1, "-1,0": 0, "-1,1": 1,
  "0,-1": 0, "0,0": 0, "0,1": 1,
  "1,-1": 1, "1,0": 1, "1,1": 1,
};
const K3_NOT = { "-1": 1, "0": 0, "1": -1, "U": "U" };
const ref2 = (table, a, b) => (a === U || b === U ? U : table[`${a},${b}`]);

// -- 1. Kleene oracle (agenda acceptance #1) --

describe("3VL oracle: Kleene AND = vAnd (16/16, UNKNOWN infectious)", () => {
  it("matches the independent K3 AND table for all 16 cases", () => {
    for (const a of VALS) for (const b of VALS) {
      assert.equal(vAnd(a, b), ref2(K3_AND, a, b), `vAnd(${key(a)},${key(b)})`);
    }
  });
});

describe("3VL oracle: Kleene OR = vOr (16/16, UNKNOWN infectious)", () => {
  it("matches the independent K3 OR table for all 16 cases", () => {
    for (const a of VALS) for (const b of VALS) {
      assert.equal(vOr(a, b), ref2(K3_OR, a, b), `vOr(${key(a)},${key(b)})`);
    }
    assert.equal(vOr(U, Verdict.ALLOW), U, "UNKNOWN is never lifted to ALLOW by OR");
  });
});

describe("3VL oracle: Kleene NOT = vNot (4/4)", () => {
  it("matches the independent K3 NOT table; NEUTRAL and UNKNOWN are fixed points", () => {
    for (const a of VALS) {
      const r = vNot(a);
      assert.equal(key(r), String(K3_NOT[key(a)]), `vNot(${key(a)})`);
    }
    assert.equal(vNot(U), U, "not unknown = unknown");
    assert.equal(vNot(Verdict.NEUTRAL), Verdict.NEUTRAL);
  });
});

describe("3VL calculus reuses tpl-simulator gates verbatim on the computed trits", () => {
  it("vAnd=minTrit, vOr=maxTrit, vNot=negTrit for all trit inputs; UNKNOWN short-circuits before the gate", () => {
    for (const a of TRITS) {
      assert.equal(vNot(a), negTrit(a), `vNot vs negTrit (${a})`);
      for (const b of TRITS) {
        assert.equal(vAnd(a, b), minTrit(a, b), `vAnd vs minTrit (${a},${b})`);
        assert.equal(vOr(a, b), maxTrit(a, b), `vOr vs maxTrit (${a},${b})`);
      }
    }
    for (const a of VALS) {
      assert.equal(vAnd(a, U), U); assert.equal(vAnd(U, a), U);
      assert.equal(vOr(a, U), U); assert.equal(vOr(U, a), U);
    }
  });
});

// -- 2. Collapse rule (agenda acceptance, collapse) --

test("collapse rule: UNKNOWN, NEUTRAL and DENY -> deny; ALLOW -> allow", () => {
  assert.equal(collapse(Verdict.ALLOW), "allow");
  assert.equal(collapse(Verdict.INDETERMINATE), "deny");
  assert.equal(collapse(Verdict.NEUTRAL), "deny");
  assert.equal(collapse(Verdict.DENY), "deny");
});

// -- 3. Fail-closed soundness, Theorem 1 (agenda acceptance #2) --

test("authorize(v) <=> v = ALLOW (+1), exhaustive over the 4 lattice values", () => {
  assert.equal(authorize(Verdict.ALLOW), true);
  assert.equal(authorize(Verdict.INDETERMINATE), false, "unknown must NEVER authorize");
  assert.equal(authorize(Verdict.NEUTRAL), false, "neutral must NEVER authorize");
  assert.equal(authorize(Verdict.DENY), false);
});

function* clauseSets(maxN) {
  for (let n = 1; n <= maxN; n++) {
    const total = VALS.length ** n;
    for (let code = 0; code < total; code++) {
      const clauses = [];
      let c = code;
      for (let i = 0; i < n; i++) { clauses.push(VALS[c % VALS.length]); c = (c / VALS.length) | 0; }
      yield clauses;
    }
  }
}

test("allOf authorizes <=> EVERY clause is ALLOW (exhaustive over 4 values, n=1..4)", () => {
  for (const clauses of clauseSets(4)) {
    const everyAllow = clauses.every((v) => v === Verdict.ALLOW);
    assert.equal(authorize(allOf(clauses)), everyAllow, `allOf(${clauses.map(key)})`);
  }
});

test("anyOf authorizes <=> SOME clause is ALLOW and NO clause is UNKNOWN (exhaustive, n=1..4)", () => {
  // Zero trust (K3U2): an UNKNOWN clause is an undischarged obligation; it infects the disjunction
  // rather than being outvoted by an ALLOW. Rejected: strong-Kleene OR (T or U = T), which lets an
  // unverified clause ride along on another clause's ALLOW.
  for (const clauses of clauseSets(4)) {
    const expected = clauses.some((v) => v === Verdict.ALLOW) && !clauses.some((v) => v === U);
    assert.equal(authorize(anyOf(clauses)), expected, `anyOf(${clauses.map(key)})`);
  }
});
// ── 4. Undischarged obligation → audited deny (agenda acceptance #3) ───────────

describe("indeterminate at a trust boundary → deny + FUNGI-GOV-3VL-001 (never silent)", () => {
  it("decideAtBoundary(INDETERMINATE) denies, is unauthorized, and emits the diagnostic", () => {
    const seen = [];
    const d = decideAtBoundary(Verdict.INDETERMINATE, (diag) => seen.push(diag));
    assert.equal(d.decision, "deny");
    assert.equal(d.authorized, false);
    assert.equal(d.diagnostic.kind, "PRESENT", "diagnostic must be present in the result (structurally non-silent)");
    assert.equal(d.diagnostic.code, GOV_3VL_DIAGNOSTIC);
    assert.equal(d.diagnostic.code, "FUNGI-GOV-3VL-001");
    assert.equal(d.diagnostic.name, "INDETERMINATE_COLLAPSED_TO_DENY");
    assert.equal(d.diagnostic.severity, "warning");
    assert.equal(seen.length, 1, "sink invoked exactly once");
  });

  it("an undischarged obligation among allow clauses yields INDETERMINATE → audited deny", () => {
    const verdict = allOf([Verdict.ALLOW, Verdict.INDETERMINATE, Verdict.ALLOW]);
    assert.equal(verdict, Verdict.INDETERMINATE, "one undischarged clause poisons the conjunction");
    const d = decideAtBoundary(verdict);
    assert.equal(d.decision, "deny");
    assert.equal(d.diagnostic.kind, "PRESENT", "audited");
  });

  it("an ordinary DENY at the boundary is NOT a 3VL diagnostic (it is a policy denial)", () => {
    const seen = [];
    const d = decideAtBoundary(Verdict.DENY, (diag) => seen.push(diag));
    assert.equal(d.decision, "deny");
    assert.equal(d.authorized, false);
    assert.equal(d.diagnostic.kind, "NONE", "DENY is definite — no FUNGI-GOV-3VL-001");
    assert.equal(seen.length, 0);
  });

  it("ALLOW at the boundary authorizes with no diagnostic", () => {
    const d = decideAtBoundary(Verdict.ALLOW);
    assert.equal(d.decision, "allow");
    assert.equal(d.authorized, true);
    assert.equal(d.diagnostic.kind, "NONE");
  });
});

// ── 5. No-Coercion — Theorem 2: 0 is never load-bearing for a definite verdict ─
// For any expression E: eval(E)=+1 ⟹ eval(E[0→-1])=+1, and eval(E)=-1 ⟹ eval(E[0→-1])=-1.
// Consequence: a 0 can never be coerced into the +1 that authorizes, anywhere in composition.

function evalTree(t) {
  switch (t.op) {
    case "leaf": return t.v;
    case "not": return vNot(evalTree(t.a));
    case "and": return vAnd(evalTree(t.a), evalTree(t.b));
    case "or": return vOr(evalTree(t.a), evalTree(t.b));
    default: throw new Error(`bad node ${t.op}`);
  }
}
function replaceZeros(t, repl) {
  switch (t.op) {
    case "leaf": return { op: "leaf", v: t.v === 0 ? repl : t.v };
    case "not": return { op: "not", a: replaceZeros(t.a, repl) };
    case "and": return { op: "and", a: replaceZeros(t.a, repl), b: replaceZeros(t.b, repl) };
    case "or": return { op: "or", a: replaceZeros(t.a, repl), b: replaceZeros(t.b, repl) };
    default: throw new Error(`bad node ${t.op}`);
  }
}
function hasZeroLeaf(t) {
  switch (t.op) {
    case "leaf": return t.v === 0;
    case "not": return hasZeroLeaf(t.a);
    default: return hasZeroLeaf(t.a) || hasZeroLeaf(t.b);
  }
}
// All expression trees of height ≤ depth over the given leaf set.
function enumLE(depth, leaves) {
  if (depth === 0) return leaves.map((v) => ({ op: "leaf", v }));
  const lower = enumLE(depth - 1, leaves);
  const out = [...lower];
  for (const a of lower) out.push({ op: "not", a });
  for (const a of lower) for (const b of lower) {
    out.push({ op: "and", a, b });
    out.push({ op: "or", a, b });
  }
  return out;
}
// Deterministic PRNG (no Math.random — reproducible, per Galerina determinism discipline).
function makeRng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 0x100000000; };
}
function randomTree(rng, maxDepth) {
  if (maxDepth <= 0 || rng() < 0.3) return { op: "leaf", v: TRITS[(rng() * 3) | 0] };
  const r = rng();
  if (r < 1 / 3) return { op: "not", a: randomTree(rng, maxDepth - 1) };
  if (r < 2 / 3) return { op: "and", a: randomTree(rng, maxDepth - 1), b: randomTree(rng, maxDepth - 1) };
  return { op: "or", a: randomTree(rng, maxDepth - 1), b: randomTree(rng, maxDepth - 1) };
}

function assertNoCoercion(t, label) {
  const r = evalTree(t);
  const rNeg = evalTree(replaceZeros(t, Verdict.DENY)); // every 0 → deny
  if (r === Verdict.ALLOW) {
    assert.equal(rNeg, Verdict.ALLOW, `P+ violated (${label}): an ALLOW depended on an indeterminate`);
  }
  if (r === Verdict.DENY) {
    assert.equal(rNeg, Verdict.DENY, `P- violated (${label}): a DENY depended on an indeterminate`);
  }
  // Boundary soundness composed: authorize ⇔ eval===ALLOW, for every tree.
  assert.equal(authorize(r), r === Verdict.ALLOW, `boundary soundness (${label})`);
}

describe("no-coercion: 0 never becomes the +1 that authorizes (Theorem 2)", () => {
  it("exhaustive over ALL expression trees of height ≤ 2 (~1.2k trees)", () => {
    const trees = enumLE(2, TRITS);
    assert.ok(trees.length > 1000, `expected full enumeration, got ${trees.length}`);
    for (const t of trees) assertNoCoercion(t, "h≤2");
  });

  it("deterministic fuzz: 100k random trees up to depth 6", () => {
    const rng = makeRng(0x5eed1234); // fixed seed → reproducible
    let zeroBearingAllows = 0; // expected to stay 0
    for (let i = 0; i < 100_000; i++) {
      const t = randomTree(rng, 6);
      assertNoCoercion(t, `fuzz#${i}`);
      // direct corollary: if it allows, denying every unknown still allows
      if (evalTree(t) === Verdict.ALLOW && hasZeroLeaf(t)) {
        if (evalTree(replaceZeros(t, Verdict.DENY)) !== Verdict.ALLOW) zeroBearingAllows++;
      }
    }
    assert.equal(zeroBearingAllows, 0, "no ALLOW was ever caused by an indeterminate clause");
  });
});

// ── 6. Differential / no-regression vs two-valued (agenda acceptance #4) ───────
// With leaves restricted to {DENY, ALLOW} no 0 ever arises, and the calculus is
// exactly classical Boolean — and NO FUNGI-GOV-3VL-001 is ever emitted.

function boolEval(t) { // reference: plain JS booleans, leaf -1=false, +1=true
  switch (t.op) {
    case "leaf": return t.v === Verdict.ALLOW;
    case "not": return !boolEval(t.a);
    case "and": return boolEval(t.a) && boolEval(t.b);
    case "or": return boolEval(t.a) || boolEval(t.b);
    default: throw new Error(`bad node ${t.op}`);
  }
}

describe("differential: two-valued policies behave identically when no 0 arises", () => {
  it("over ALL boolean-leaf trees (height ≤ 2): 3VL ≡ classical Bool, never indeterminate", () => {
    const trees = enumLE(2, [Verdict.DENY, Verdict.ALLOW]);
    for (const t of trees) {
      const v = evalTree(t);
      assert.notEqual(v, Verdict.INDETERMINATE, "no 0 may arise from boolean-only inputs");
      assert.equal(v === Verdict.ALLOW, boolEval(t), "verdict matches classical truth");
      // collapse/authorize behave as the classical "allow iff true"
      assert.equal(authorize(v), boolEval(t));
      assert.equal(collapse(v), boolEval(t) ? "allow" : "deny");
      // and the indeterminate diagnostic is NEVER emitted in the two-valued regime
      assert.equal(decideAtBoundary(v).diagnostic.kind, "NONE", "no 3VL diagnostic without a 0");
    }
  });
});

// ── 7. Out-of-set inputs trap (no silent coercion of toxic input) ─────────────

test("non-trit verdicts trap (SecurityTrap), inherited from the gate guards", () => {
  assert.throws(() => vAnd(2, 0), SecurityTrap);
  assert.throws(() => vOr(0, 7), SecurityTrap);
  assert.throws(() => vNot(5), SecurityTrap);
  assert.throws(() => allOf([Verdict.ALLOW, 3]), SecurityTrap);
});

// ── 8. Empty-set deny-by-default ──────────────────────────────────────────────

test("empty clause set is INDETERMINATE → deny (deny-by-default, not vacuous allow)", () => {
  assert.equal(allOf([]), Verdict.INDETERMINATE, "empty conjunction is NOT a vacuous allow");
  assert.equal(anyOf([]), Verdict.INDETERMINATE);
  assert.equal(decideAtBoundary(allOf([])).decision, "deny");
  assert.equal(decideAtBoundary(anyOf([])).decision, "deny");
  // a single ALLOW clause is still preserved (seed does not pollute)
  assert.equal(allOf([Verdict.ALLOW]), Verdict.ALLOW);
  assert.equal(anyOf([Verdict.ALLOW]), Verdict.ALLOW);
});

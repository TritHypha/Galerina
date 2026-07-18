// invariant-discharge.test.mjs — pins the ONE shared static-discharge oracle (S2 fuller-A, RD-0456).
// The whole point of this module is that the governance-verifier and the WAT emitter fold governance
// operands through the SAME function, so they cannot drift. These tests pin the fold's trit for every
// case it proves (and the fail-closed 0 for everything else), plus the conjunction decomposition and the
// structured per-operand discharge.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  foldStaticVerdict,
  flattenGovernanceConjunction,
  dischargeEnsureOperands,
} from "../dist/invariant-discharge.js";

const bool = (v) => ({ kind: "boolLiteral", value: v });
const num = (v) => ({ kind: "numberLiteral", value: String(v) });
const bin = (op, l, r) => ({ kind: "binaryExpr", value: op, children: [l, r] });
const not = (x) => ({ kind: "unaryExpr", value: "!", children: [x] });
const id = (v) => ({ kind: "identifier", value: v }); // a runtime operand (never a constant)

test("foldStaticVerdict: boolean literals → ±1", () => {
  assert.equal(foldStaticVerdict(bool("true")), 1);
  assert.equal(foldStaticVerdict(bool("false")), -1);
});

test("foldStaticVerdict: numeric-literal comparisons fold to the right trit", () => {
  assert.equal(foldStaticVerdict(bin(">", num(5), num(0))), 1);
  assert.equal(foldStaticVerdict(bin(">", num(0), num(5))), -1);
  assert.equal(foldStaticVerdict(bin("==", num(3), num(3))), 1);
  assert.equal(foldStaticVerdict(bin("!=", num(3), num(3))), -1);
  assert.equal(foldStaticVerdict(bin("<=", num(2), num(2))), 1);
  assert.equal(foldStaticVerdict(bin(">=", num(1), num(2))), -1);
});

test("foldStaticVerdict: negation of a bool literal (the case the emitter historically missed)", () => {
  // This is the single-witness win: the verifier always proved `!false`/`!true`; now the emitter agrees.
  assert.equal(foldStaticVerdict(not(bool("false"))), 1);  // !false = true
  assert.equal(foldStaticVerdict(not(bool("true"))), -1);  // !true = false
});

test("foldStaticVerdict: anything runtime-dependent is 0 (unknown → keep the gate, fail-closed)", () => {
  assert.equal(foldStaticVerdict(id("x")), 0);
  assert.equal(foldStaticVerdict(bin(">", id("x"), num(0))), 0); // a real param compare — never elided
  assert.equal(foldStaticVerdict(not(id("flag"))), 0);          // negation of a non-constant
  assert.equal(foldStaticVerdict(bin("&&", bool("true"), id("x"))), 0); // a conjunction is not itself a constant
});

test("flattenGovernanceConjunction: left-assoc && chain → ordered operands; non-conjunction → singleton", () => {
  const chain = bin("&&", bin("&&", bool("true"), id("x")), bin(">", id("y"), num(0)));
  const ops = flattenGovernanceConjunction(chain);
  assert.equal(ops.length, 3);
  assert.equal(ops[0].value, "true");
  assert.equal(ops[1].value, "x");
  assert.equal(ops[2].value, ">");
  // `and` keyword flattens the same as `&&`
  assert.equal(flattenGovernanceConjunction(bin("and", bool("true"), id("z"))).length, 2);
  // a bare comparison is one operand
  assert.equal(flattenGovernanceConjunction(bin(">", id("x"), num(0))).length, 1);
});

test("dischargeEnsureOperands: structured per-operand trit, order-stable", () => {
  // `true && x && (5 > 0)` → [ALLOW(elide), UNKNOWN(keep), ALLOW(elide)]
  const chain = bin("&&", bin("&&", bool("true"), id("x")), bin(">", num(5), num(0)));
  const d = dischargeEnsureOperands(chain);
  assert.deepEqual(d, [
    { operandIdx: 0, staticVerdict: 1 },
    { operandIdx: 1, staticVerdict: 0 },
    { operandIdx: 2, staticVerdict: 1 },
  ]);
  // a statically-DENY operand surfaces as -1 (the emitter collapses the whole min-chain → FUNGI-INV-001)
  const withDeny = bin("&&", id("x"), bool("false"));
  assert.deepEqual(dischargeEnsureOperands(withDeny), [
    { operandIdx: 0, staticVerdict: 0 },
    { operandIdx: 1, staticVerdict: -1 },
  ]);
});

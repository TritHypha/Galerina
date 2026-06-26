// Balanced-ternary logic gate truth tables (#196 / #173).
// The photonic substrate's algebra over {-1 (REJECT), 0 (HOLD), +1 (COMMIT)}.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  negTrit, sumTrit, xorTrit, carryTrit, addTrit, mulTrit,
  minTrit, maxTrit, consensusTrit, SecurityTrap,
} from "../dist/index.js";

const TRITS = [-1, 0, 1];

test("negTrit (NOT): +1 ↔ -1, 0 ↦ 0", () => {
  assert.equal(negTrit(-1), 1);
  assert.equal(negTrit(0), 0);
  assert.equal(negTrit(1), -1);
});

test("sumTrit (== ternary XOR): carry-free balanced sum, full 3×3 truth table", () => {
  const table = [
    [-1, -1, 1], [-1, 0, -1], [-1, 1, 0],
    [0, -1, -1], [0, 0, 0], [0, 1, 1],
    [1, -1, 0], [1, 0, 1], [1, 1, -1],
  ];
  for (const [a, b, e] of table) {
    assert.equal(sumTrit(a, b), e, `sumTrit(${a},${b})`);
    assert.equal(xorTrit(a, b), e, `xorTrit(${a},${b}) must alias sumTrit`);
  }
});

test("sumTrit is commutative", () => {
  for (const a of TRITS) for (const b of TRITS) {
    assert.equal(sumTrit(a, b), sumTrit(b, a), `commute(${a},${b})`);
  }
});

test("addTrit half-adder identity: 3·carry + sum === a + b", () => {
  for (const a of TRITS) for (const b of TRITS) {
    const { sum, carry } = addTrit(a, b);
    assert.equal(3 * carry + sum, a + b, `addTrit(${a},${b})`);
    assert.equal(carryTrit(a, b), carry, `carryTrit(${a},${b})`);
    assert.ok(TRITS.includes(sum) && TRITS.includes(carry), "sum and carry are trits");
  }
});

test("mulTrit: 0 dominates, like signs → +1, unlike → -1", () => {
  for (const a of TRITS) for (const b of TRITS) {
    assert.equal(mulTrit(a, b), (a * b) || 0, `mulTrit(${a},${b})`);
  }
  assert.equal(mulTrit(1, 1), 1);
  assert.equal(mulTrit(-1, -1), 1);
  assert.equal(mulTrit(1, -1), -1);
  assert.equal(mulTrit(0, 1), 0);
});

test("minTrit (AND, fail-closed) / maxTrit (OR)", () => {
  for (const a of TRITS) for (const b of TRITS) {
    assert.equal(minTrit(a, b), Math.min(a, b), `min(${a},${b})`);
    assert.equal(maxTrit(a, b), Math.max(a, b), `max(${a},${b})`);
  }
  // AND of COMMIT(+1) and REJECT(-1) → REJECT (fail-closed); OR → COMMIT.
  assert.equal(minTrit(1, -1), -1);
  assert.equal(maxTrit(1, -1), 1);
});

test("consensusTrit (3-input majority): tie / all-HOLD → 0 (HOLD)", () => {
  assert.equal(consensusTrit(1, 1, -1), 1);
  assert.equal(consensusTrit(-1, -1, 1), -1);
  assert.equal(consensusTrit(1, -1, 0), 0);   // perfect split → HOLD
  assert.equal(consensusTrit(0, 0, 0), 0);
  assert.equal(consensusTrit(1, 1, 1), 1);
  assert.equal(consensusTrit(-1, -1, -1), -1);
});

test("out-of-set inputs trap (SecurityTrap), no silent coercion", () => {
  assert.throws(() => sumTrit(2, 0), SecurityTrap);
  assert.throws(() => negTrit(5), SecurityTrap);
  assert.throws(() => minTrit(0, 7), SecurityTrap);
  assert.throws(() => consensusTrit(0, 0, 3), SecurityTrap);
});

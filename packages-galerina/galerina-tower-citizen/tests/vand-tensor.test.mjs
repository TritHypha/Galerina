// vAndTensor — Tensorized No-Coercion (notes/62 net-new). Element-wise Kleene ∧ over two trit
// tensors: a deny-by-default arity wrapper over the scalar vAnd. The load-bearing property is
// No-Coercion held element-wise: the untrusted operand can only LOWER each verdict, never lift it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { vAndTensor, vAndTensor2D } from "../dist/index.js";

const A = (xs) => Int8Array.from(xs);

test("vAndTensor: element-wise min (the No-Coercion fold)", () => {
  assert.deepEqual([...vAndTensor(A([1, 1, 0, -1, 1]), A([1, 0, 1, 1, -1]))], [1, 0, 0, -1, -1]);
});

test("vAndTensor: an all-ALLOW untrusted operand cannot LIFT the core (No-Coercion)", () => {
  // The strongest possible untrusted signal (+1 everywhere) leaves the core unchanged — it can
  // never manufacture an ALLOW the core did not already hold.
  assert.deepEqual([...vAndTensor(A([-1, 0, 1]), A([1, 1, 1]))], [-1, 0, 1]);
});

test("vAndTensor: result is element-wise ≤ core (only ever lowers toward DENY)", () => {
  const core = A([1, 1, 1, 0, 0, -1]);
  const out = vAndTensor(core, A([1, 0, -1, 1, -1, 1]));
  for (let i = 0; i < core.length; i++) assert.ok(out[i] <= core[i], `out[${i}] must not exceed core[${i}]`);
});

test("vAndTensor: an all-DENY operand zeroes the tensor to DENY (fully cautious)", () => {
  assert.deepEqual([...vAndTensor(A([1, 1, 0]), A([-1, -1, -1]))], [-1, -1, -1]);
});

test("vAndTensor: length mismatch is fail-closed (throws — no pad/truncate)", () => {
  assert.throws(() => vAndTensor(A([1, 0]), A([1])), /length mismatch/);
});

test("vAndTensor: a non-trit element is fail-closed (throws, never coerced)", () => {
  assert.throws(() => vAndTensor(A([1, 2]), A([1, 1])), /non-trit/);
  assert.throws(() => vAndTensor(A([1, 1]), A([1, 5])), /non-trit/);
});

test("vAndTensor: empty tensors are vacuously valid (no verdicts)", () => {
  assert.deepEqual([...vAndTensor(A([]), A([]))], []);
});

test("vAndTensor2D: shape validation + element-wise fold (row-major)", () => {
  assert.deepEqual([...vAndTensor2D(A([1, 1, 0, -1]), A([0, 1, 1, 1]), 2, 2)], [0, 1, 0, -1]);
  assert.throws(() => vAndTensor2D(A([1, 1, 0, -1]), A([0, 1, 1, 1]), 3, 2), /rows\*cols/);
  assert.throws(() => vAndTensor2D(A([1]), A([1]), -1, 1), /invalid shape/);
});

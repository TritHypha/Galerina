// =============================================================================
// Record-update spread { ...base, field: v } on the INTERPRETER path (regression)
//
// The arrays/objects R&D (2026-06-25) found that `{ ...base, f: v }` was parsed,
// value-state-checked, and WAT-emitted (#163), but the tree-walker interpreter
// had NO #record-update case — so run()/embedders returned a runtimeError while
// the WASM tier worked (a walker≠WASM divergence). This pins the interpreter fix:
// spread copies the base, later spreads + field updates override in source order.
// =============================================================================

import { test } from "node:test";
import assert from "node:assert/strict";
import { run } from "../dist/index.js";

const evalInt = async (body) => {
  const src = `pure flow main() -> Int contract { effects {} } { ${body} }`;
  const r = await run(src, "spread.spore", "main", new Map(), {});
  return r;
};

test("record-update spread: { ...base, field: v } overrides one field", async () => {
  const r = await evalInt(`let base = { name: "alice", age: 30 }  let u = { ...base, age: 31 }  return u.age`);
  assert.equal(r.ok, true, `expected ok, got: ${JSON.stringify(r.value)}`);
  assert.equal(r.value?.value ?? r.value, 31);
});

test("record-update spread: unspread fields are preserved from the base", async () => {
  const r = await evalInt(`let base = { a: 7, b: 9 }  let u = { ...base, a: 1 }  return u.b`);
  assert.equal(r.ok, true);
  assert.equal(r.value?.value ?? r.value, 9); // b carried through untouched
});

test("record-update spread: multiple spreads + field override compose in source order", async () => {
  // { ...a, ...b, y: 5 }: b.x(9) overrides a.x(1); y:5 overrides both → x=9, y=5 → 14
  const r = await evalInt(`let a = { x: 1, y: 2 }  let b = { x: 9 }  let c = { ...a, ...b, y: 5 }  return c.x + c.y`);
  assert.equal(r.ok, true);
  assert.equal(r.value?.value ?? r.value, 14);
});

test("record-update spread: a non-record spread base is a clean runtimeError (fail-safe, not a crash)", async () => {
  const r = await evalInt(`let base = 5  let u = { ...base, age: 1 }  return u.age`);
  assert.equal(r.ok, false);
  assert.match(JSON.stringify(r.value), /not a record|runtimeError/i);
});

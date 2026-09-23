import { test } from "node:test";
import assert from "node:assert/strict";
import { refuseVacuousWasmSweep } from "../audit-wasm-validate.mjs";

test("refuseVacuousWasmSweep rejects absent corpus", () => {
  const r = refuseVacuousWasmSweep(0, 0, 0);
  assert.equal(r.ok, false);
  assert.match(r.reason, /absent corpus/);
});

test("hostile: entire sweep skipped is not a clean result", () => {
  const r = refuseVacuousWasmSweep(4, 4, 0);
  assert.equal(r.ok, false);
  assert.match(r.reason, /skipped or unassessed/);
});

test("an assessed sweep is admitted", () => {
  const r = refuseVacuousWasmSweep(4, 1, 3);
  assert.equal(r.ok, true);
});

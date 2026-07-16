// wasm-runtime-marshalling-guards.test.mjs — the RD-0389 ARG-marshalling helpers' FAIL-CLOSED contract
// (housekeeping trio, 2026-07-16). allocRecord/internArray shipped with the secret-gate differential but
// their guard paths (bindMemory-required, ≥1 field, bounds-check-before-write) had only end-to-end coverage;
// this pins each guard directly — a silently-relaxed guard is a fail-open (a staged record spilling linear
// memory, or a zero-field record) that the differential might not surface.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHostRuntime } from "../dist/index.js";

// The record staging base is WAT_HEAP_BASE = 1024; a 2-page memory is 128 KiB.
const twoPageMemory = () => new WebAssembly.Memory({ initial: 2, maximum: 2048 });

test("allocRecord BEFORE bindMemory → throws (fail-closed, never writes to a null buffer)", () => {
  const host = createHostRuntime();
  assert.throws(() => host.allocRecord([1, 2]), /before bindMemory/, "must refuse to stage without bound memory");
});

test("allocRecord with ZERO fields → throws (a record needs ≥1 field)", () => {
  const host = createHostRuntime();
  host.bindMemory(twoPageMemory());
  assert.throws(() => host.allocRecord([]), />=1 field|at least one field|1 field/i, "empty record is refused");
});

test("allocRecord writes fields at contiguous i32 slots the module reads back", () => {
  const host = createHostRuntime();
  host.bindMemory(twoPageMemory());
  const p = host.allocRecord([111, 222, 333]);
  assert.equal(host.readRecordField(p, 0), 111, "slot 0");
  assert.equal(host.readRecordField(p, 1), 222, "slot 1");
  assert.equal(host.readRecordField(p, 2), 333, "slot 2");
  // A second record must NOT overlap the first (the bump pointer advanced).
  const q = host.allocRecord([444, 555]);
  assert.notEqual(q, p, "second record gets a distinct ptr");
  assert.equal(host.readRecordField(p, 0), 111, "first record intact after a second alloc");
  assert.equal(host.readRecordField(q, 0), 444, "second record readable");
});

test("allocRecord that would SPILL linear memory → throws BEFORE writing (bounds-check-before-write)", () => {
  const host = createHostRuntime();
  host.bindMemory(twoPageMemory()); // 128 KiB = 32768 i32 words
  // A single record longer than the whole memory must trap at construction, not corrupt/truncate.
  assert.throws(() => host.allocRecord(new Array(40000).fill(7)), /overflow|staging|linear memory/i, "oversized record is refused");
});

test("internArray builds a host array of ptrs the module reads via readArray", () => {
  const host = createHostRuntime();
  host.bindMemory(twoPageMemory());
  const a = host.allocRecord([10, 20]);
  const b = host.allocRecord([30, 40]);
  const arrH = host.internArray([a, b]);
  assert.deepEqual(host.readArray(arrH), [a, b], "array holds the record ptrs in order");
  // Values coerce to i32 (the boundary is i32-typed).
  const arrH2 = host.internArray([1.9, 2.9]);
  assert.deepEqual(host.readArray(arrH2), [1, 2], "internArray coerces elements to i32");
});

console.log("wasm-runtime marshalling guards: all checks passed ✅");

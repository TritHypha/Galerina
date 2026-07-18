// record-abi.test.mjs — pins the record-layout ABI constants. These are the single source of truth the
// WAT emitter and the WASM TCB both bind to; a change here is a deliberate ABI change, not an accident.
import { test } from "node:test";
import assert from "node:assert/strict";
import { WAT_HEAP_BASE, WAT_REC_FIELD_SIZE } from "../dist/index.js";

test("record-ABI constants are the pinned layout", () => {
  assert.equal(WAT_HEAP_BASE, 1024, "records bump-allocate above 1024; low region stays null/scratch");
  assert.equal(WAT_REC_FIELD_SIZE, 4, "each record field is one i32 slot");
});

test("record-ABI constants are plain integers (no drift-prone objects)", () => {
  assert.equal(typeof WAT_HEAP_BASE, "number");
  assert.equal(typeof WAT_REC_FIELD_SIZE, "number");
  assert.equal(Number.isInteger(WAT_HEAP_BASE), true);
  assert.equal(Number.isInteger(WAT_REC_FIELD_SIZE), true);
});

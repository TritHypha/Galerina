import { test } from "node:test";
import assert from "node:assert/strict";
import * as L from "../dist/index.js";
import { finalizeSecretExportResult, invokeAdmittedExport, WAT_HEAP_BASE } from "@galerina/core-runtime-wasm";

async function trapOnWipeModule() {
  const wat = `(module
    (memory (export "memory") 1)
    (global $__fungi_heap (mut i32) (i32.const ${WAT_HEAP_BASE + 4}))
    (global $__fungi_ret_is_heap (mut i32) (i32.const 1))
    (global $__fungi_ret_words (mut i32) (i32.const 1))
    (global $wipe_count (mut i32) (i32.const 0))
    (func (export "__fungi_wipe_count") (result i32) (global.get $wipe_count))
    (func (export "__fungi_wipe_owned")
      (global.set $wipe_count (i32.add (global.get $wipe_count) (i32.const 1)))
      (unreachable))
    (func (export "__fungi_ret_is_heap_get") (result i32) (global.get $__fungi_ret_is_heap))
    (func (export "__fungi_ret_words_get") (result i32) (global.get $__fungi_ret_words))
    (func (export "h") (result i32) (i32.const ${WAT_HEAP_BASE}))
  )`;
  const assembled = await L.assembleWAT(wat);
  assert.equal(assembled.valid, true, `assemble: ${(assembled.diagnostics ?? []).map((d) => d.message).join("; ")}`);
  const { instance } = await WebAssembly.instantiate(assembled.wasm);
  new Int32Array(instance.exports.memory.buffer)[WAT_HEAP_BASE >>> 2] = 0x53454352;
  return instance;
}

test("wipe trap after would-be secret copy returns refusal, not copied success, and is attempted once", async () => {
  const instance = await trapOnWipeModule();
  const result = invokeAdmittedExport(instance, "h", []);

  assert.equal(result.ok, false, "cleanup trap must not be converted into successful result delivery");
  assert.equal(Object.hasOwn(result, "result"), false, "no copied payload may escape on cleanup failure");
  assert.match(result.reason, /wipe|cleanup/i);
  assert.equal(instance.exports.__fungi_wipe_count(), 1, "one operation gets one cleanup attempt");
  assert.equal(new Int32Array(instance.exports.memory.buffer)[WAT_HEAP_BASE >>> 2], 0x53454352,
    "a failed wipe must leave the bytes visibly unresolved, not pretend they were cleared");
});

test("ret-state getter trap in direct finalizer still attempts owned cleanup once", async () => {
  const wat = `(module
    (memory (export "memory") 1)
    (global $__fungi_ret_is_heap (mut i32) (i32.const 1))
    (global $wipe_count (mut i32) (i32.const 0))
    (func (export "__fungi_wipe_count") (result i32) (global.get $wipe_count))
    (func (export "__fungi_wipe_owned")
      (global.set $wipe_count (i32.add (global.get $wipe_count) (i32.const 1)))
      (memory.fill (i32.const ${WAT_HEAP_BASE}) (i32.const 0) (i32.const 4)))
    (func (export "__fungi_ret_is_heap_get") (result i32) (unreachable))
    (func (export "h") (result i32) (i32.const ${WAT_HEAP_BASE}))
  )`;
  const assembled = await L.assembleWAT(wat);
  assert.equal(assembled.valid, true, `assemble: ${(assembled.diagnostics ?? []).map((d) => d.message).join("; ")}`);
  const { instance } = await WebAssembly.instantiate(assembled.wasm);
  new Int32Array(instance.exports.memory.buffer)[WAT_HEAP_BASE >>> 2] = 0x53454352;

  assert.throws(() => finalizeSecretExportResult(instance, instance.exports.h()), /unreachable/i);
  assert.equal(instance.exports.__fungi_wipe_count(), 1, "a getter trap must not skip cleanup or trigger a duplicate cleanup");
  assert.equal(new Int32Array(instance.exports.memory.buffer)[WAT_HEAP_BASE >>> 2], 0,
    "the successful cleanup helper must clear the sentinel after the getter trap");
});

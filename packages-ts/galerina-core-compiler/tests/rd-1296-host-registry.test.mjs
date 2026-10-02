/**
 * RD-1296 host-registry typed identity — wrap trap wipe and guest-wipe vs host
 * registry. Raw-helper witnesses are not secret-flow leak proof.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import * as L from "../dist/index.js";
import {
  createHostRuntime,
  generateRunnerKeypair,
  signWasm,
  admitAndInstantiate,
  WAT_HEAP_BASE,
} from "@galerina/core-runtime-wasm";

async function admitWat(wat, host, extra = {}) {
  const asm = await L.assembleWAT(wat);
  assert.ok(asm.valid, `assemble: ${(asm.diagnostics ?? []).map((d) => d.message).join("; ")}`);
  const { publicKeyPem, privateKeyPem } = generateRunnerKeypair();
  const attestation = signWasm(asm.wasm, privateKeyPem, "dev");
  return admitAndInstantiate({
    wasm: asm.wasm,
    attestation,
    policy: { requireSigned: true, publicKeyPem },
    host,
    ...extra,
  });
}

test("hostile: wrapped export trap still wipes owned guest secrets", async () => {
  const wat = `(module
    (memory (export "memory") 1)
    (global $__fungi_heap (mut i32) (i32.const ${WAT_HEAP_BASE}))
    (func (export "__fungi_wipe_owned")
      (memory.fill (i32.const ${WAT_HEAP_BASE}) (i32.const 0)
        (i32.sub (global.get $__fungi_heap) (i32.const ${WAT_HEAP_BASE})))
      (global.set $__fungi_heap (i32.const ${WAT_HEAP_BASE})))
    (func (export "h") (result i32)
      (global.set $__fungi_heap (i32.const ${WAT_HEAP_BASE + 4}))
      (i32.store (i32.const ${WAT_HEAP_BASE}) (i32.const 1094795585))
      unreachable)
  )`;
  const { instance } = await admitWat(wat, createHostRuntime());
  const view = new Int32Array(instance.exports.memory.buffer);
  assert.throws(() => instance.exports.h(), /unreachable|trap/);
  assert.equal(view[WAT_HEAP_BASE >>> 2], 0, "wrapped trap path must wipe owned guest words");
});

test("guest wipe leaves host String/Array/Option/Decimal intact", async () => {
  const host = createHostRuntime();
  const s = host.internString("keep");
  const arr = host.internArray([1, 2]);
  const opt = host.imports.host.__option_some_v2(8);
  const dec = host.internDecimal("3.00");
  const wat = `(module
    (memory (export "memory") 1)
    (global $__fungi_heap (mut i32) (i32.const ${WAT_HEAP_BASE + 4}))
    (func $__fungi_wipe_owned (export "__fungi_wipe_owned")
      (memory.fill (i32.const ${WAT_HEAP_BASE}) (i32.const 0)
        (i32.sub (global.get $__fungi_heap) (i32.const ${WAT_HEAP_BASE})))
      (global.set $__fungi_heap (i32.const ${WAT_HEAP_BASE})))
    (func (export "h") (result i32)
      (i32.store (i32.const ${WAT_HEAP_BASE}) (i32.const 7))
      (call $__fungi_wipe_owned)
      (i32.const 0))
  )`;
  const { instance } = await admitWat(wat, host);
  instance.exports.h();
  assert.equal(host.readString(s), "keep");
  assert.deepEqual([...host.readArray(arr)], [1, 2]);
  assert.deepEqual(host.readOption(opt), { tag: "some", value: 8 });
  assert.equal(host.readDecimal(dec), "3.00");
});

const OUTER_LAYOUT = [{ kind: "record", fields: [{ kind: "i32" }] }, { kind: "i32" }];
const NESTED_RET = `(module
  (memory (export "memory") 1)
  (global $__fungi_heap (mut i32) (i32.const ${WAT_HEAP_BASE}))
  (global $__fungi_ret_is_heap (mut i32) (i32.const 0))
  (global $__fungi_ret_words (mut i32) (i32.const 0))
  (func (export "__fungi_wipe_owned")
    (memory.fill (i32.const ${WAT_HEAP_BASE}) (i32.const 0)
      (i32.sub (global.get $__fungi_heap) (i32.const ${WAT_HEAP_BASE})))
    (global.set $__fungi_heap (i32.const ${WAT_HEAP_BASE})))
  (func (export "__fungi_ret_is_heap_get") (result i32)
    (global.get $__fungi_ret_is_heap))
  (func (export "__fungi_ret_words_get") (result i32)
    (global.get $__fungi_ret_words))
  (func (export "h") (result i32)
    (i32.store (i32.const ${WAT_HEAP_BASE}) (i32.const 7))
    (i32.store (i32.const ${WAT_HEAP_BASE + 4}) (i32.const ${WAT_HEAP_BASE}))
    (i32.store (i32.const ${WAT_HEAP_BASE + 8}) (i32.const 99))
    (global.set $__fungi_heap (i32.const ${WAT_HEAP_BASE + 12}))
    (global.set $__fungi_ret_is_heap (i32.const 1))
    (global.set $__fungi_ret_words (i32.const 2))
    (i32.const ${WAT_HEAP_BASE + 4}))
)`;

test("positive: wrapped export with returnLayouts owns nested rows then wipes", async () => {
  const { instance } = await admitWat(NESTED_RET, createHostRuntime(), {
    returnLayouts: { h: OUTER_LAYOUT },
  });
  const copied = instance.exports.h();
  assert.deepEqual(copied, [[7], 99]);
  const view = new Int32Array(instance.exports.memory.buffer);
  assert.equal(view[WAT_HEAP_BASE >>> 2], 0, "wrapped layout copy must wipe guest inner word");
});

test("hostile: wrapped export without returnLayouts still returns a live inner pointer", async () => {
  const { instance } = await admitWat(NESTED_RET, createHostRuntime());
  assert.deepEqual(instance.exports.h(), [WAT_HEAP_BASE, 99]);
});

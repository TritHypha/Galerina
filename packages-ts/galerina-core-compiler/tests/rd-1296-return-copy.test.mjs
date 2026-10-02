/**
 * RD-1296 exact typed return copy — synthetic admitted-module fixtures plus
 * one Fungi producer probe. Hostile: 65 tagged words, zero/negative tags,
 * short memory, trap-after-secret-write, flat padded [i32,i64,i32].
 * Positive: exact-width three-word copy. Does not overwrite historical
 * RD-1296 probe receipts.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import * as L from "../dist/index.js";
import {
  finalizeSecretExportResult,
  invokeAdmittedExport,
  WAT_HEAP_BASE,
} from "@galerina/core-runtime-wasm";

const HELPERS = `
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
`;

async function instantiateWat(bodyFuncs) {
  const wat = `(module\n${HELPERS}\n${bodyFuncs}\n)`;
  const asm = await L.assembleWAT(wat);
  assert.ok(asm.valid, `assemble: ${(asm.diagnostics ?? []).map((d) => d.message).join("; ")}`);
  const { instance } = await WebAssembly.instantiate(asm.wasm);
  return instance;
}

function storeWords(instance, ptr, words) {
  const view = new Int32Array(instance.exports.memory.buffer);
  const start = ptr >>> 2;
  for (let i = 0; i < words.length; i++) view[start + i] = words[i];
}

test("positive: exact-width three-word heap copy", async () => {
  const instance = await instantiateWat(`
    (func (export "h") (result i32)
      (global.set $__fungi_heap (i32.const ${WAT_HEAP_BASE + 12}))
      (global.set $__fungi_ret_is_heap (i32.const 1))
      (global.set $__fungi_ret_words (i32.const 3))
      (i32.const ${WAT_HEAP_BASE}))
  `);
  storeWords(instance, WAT_HEAP_BASE, [7, 8, 9]);
  const copied = finalizeSecretExportResult(instance, instance.exports.h());
  assert.deepEqual(copied, [7, 8, 9]);
});

test("hostile: 65 tagged words refuse incomplete copy (FUNGI-WASM-RET-001)", async () => {
  const instance = await instantiateWat(`
    (func (export "h") (result i32)
      (global.set $__fungi_heap (i32.const ${WAT_HEAP_BASE + 65 * 4}))
      (global.set $__fungi_ret_is_heap (i32.const 1))
      (global.set $__fungi_ret_words (i32.const 65))
      (i32.const ${WAT_HEAP_BASE}))
  `);
  storeWords(instance, WAT_HEAP_BASE, Array.from({ length: 65 }, (_, i) => i + 1));
  assert.throws(
    () => finalizeSecretExportResult(instance, instance.exports.h()),
    /FUNGI-WASM-RET-001.*taggedWords=65/,
  );
  const invoked = invokeAdmittedExport(instance, "h", []);
  assert.equal(invoked.ok, false);
  assert.match(String(invoked.reason), /FUNGI-WASM-RET-001/);
});

test("hostile: zero tagged words refuse", async () => {
  const instance = await instantiateWat(`
    (func (export "h") (result i32)
      (global.set $__fungi_heap (i32.const ${WAT_HEAP_BASE + 4}))
      (global.set $__fungi_ret_is_heap (i32.const 1))
      (global.set $__fungi_ret_words (i32.const 0))
      (i32.const ${WAT_HEAP_BASE}))
  `);
  storeWords(instance, WAT_HEAP_BASE, [42]);
  assert.throws(
    () => finalizeSecretExportResult(instance, instance.exports.h()),
    /FUNGI-WASM-RET-001.*taggedWords=0/,
  );
});

test("hostile: negative tagged words refuse", async () => {
  const instance = await instantiateWat(`
    (func (export "h") (result i32)
      (global.set $__fungi_heap (i32.const ${WAT_HEAP_BASE + 4}))
      (global.set $__fungi_ret_is_heap (i32.const 1))
      (global.set $__fungi_ret_words (i32.const -1))
      (i32.const ${WAT_HEAP_BASE}))
  `);
  assert.throws(
    () => finalizeSecretExportResult(instance, instance.exports.h()),
    /FUNGI-WASM-RET-001.*taggedWords=-1/,
  );
});

test("hostile: short remaining memory refuses truncated copy", async () => {
  const last = 65532;
  const instance = await instantiateWat(`
    (func (export "h") (result i32)
      (global.set $__fungi_heap (i32.const 65536))
      (global.set $__fungi_ret_is_heap (i32.const 1))
      (global.set $__fungi_ret_words (i32.const 8))
      (i32.const ${last}))
  `);
  assert.throws(
    () => finalizeSecretExportResult(instance, instance.exports.h()),
    /FUNGI-WASM-RET-001.*short memory/,
  );
});

test("hostile: trap after secret write still wipes via invokeAdmittedExport", async () => {
  const instance = await instantiateWat(`
    (func (export "h") (result i32)
      (global.set $__fungi_heap (i32.const ${WAT_HEAP_BASE + 4}))
      (i32.store (i32.const ${WAT_HEAP_BASE}) (i32.const 1094795585))
      unreachable)
  `);
  const view = new Int32Array(instance.exports.memory.buffer);
  const invoked = invokeAdmittedExport(instance, "h", []);
  assert.equal(invoked.ok, false);
  assert.match(String(invoked.reason), /trap during 'h'/);
  assert.equal(view[WAT_HEAP_BASE >>> 2], 0, "owned secret word must be wiped after trap");
});

test("producer: flat padded [i32,i64,i32] packs or records the exact refuse gate", async () => {
  const src = `record Pad { a: Int, b: Int64, c: Int }
pure flow h() -> Pad
contract { intent { "rd1296 padded scalar" } privacy { contains PII } }
{ return Pad { a: 1, b: 2, c: 3 } }
`;
  const prog = L.parseProgram(src, "rd1296-pad.fungi");
  const parseErrs = (prog.diagnostics ?? []).filter((d) => d.severity === "error");
  if (parseErrs.length > 0) {
    assert.ok(parseErrs[0].code, `producer parse refuse: ${parseErrs.map((d) => d.code).join(",")}`);
    return;
  }
  const fx = L.checkEffects(prog.flows, prog.ast);
  const { gir } = L.emitGIR(prog.ast, prog.flows, fx);
  let wat;
  try {
    wat = L.renderWAT(L.buildWATModuleFromGIR(gir, undefined, "wasm-standalone", prog.ast, true));
  } catch (err) {
    assert.match(String(err.message ?? err), /FUNGI-|LAYOUT|NUMERIC|Int64/, String(err));
    return;
  }
  assert.match(wat, /\$__fungi_flat/, "padded layout must pack into a contiguous dest");
  assert.match(wat, /i32\.const 16/, "final i32 field at offset 16 must be loaded into the packed copy");
  const asm = await L.assembleWAT(wat);
  if (!asm.valid) {
    assert.ok((asm.diagnostics ?? [])[0], "producer assemble refuse recorded");
    return;
  }
  const { instance } = await WebAssembly.instantiate(asm.wasm);
  const copied = finalizeSecretExportResult(instance, instance.exports.h());
  assert.equal(Array.isArray(copied), true, `packed result must be words, got ${String(copied)}`);
  assert.equal(copied.length, 4, "semantic payload is 4 i32 words (i32 + i64 + i32), not a 24-byte physical span");
  assert.equal(copied[0], 1);
  assert.equal(copied[3], 3, "final i32 field must be present (contiguous 4-word copy from the padded record omits it)");
});

const OUTER_LAYOUT = [{ kind: "record", fields: [{ kind: "i32" }] }, { kind: "i32" }];

test("positive: secret nested layout copy owns inner rows then wipes guest", async () => {
  const instance = await instantiateWat(`
    (func (export "h") (result i32)
      (i32.store (i32.const ${WAT_HEAP_BASE}) (i32.const 7))
      (i32.store (i32.const ${WAT_HEAP_BASE + 4}) (i32.const ${WAT_HEAP_BASE}))
      (i32.store (i32.const ${WAT_HEAP_BASE + 8}) (i32.const 99))
      (global.set $__fungi_heap (i32.const ${WAT_HEAP_BASE + 12}))
      (global.set $__fungi_ret_is_heap (i32.const 1))
      (global.set $__fungi_ret_words (i32.const 2))
      (i32.const ${WAT_HEAP_BASE + 4}))
  `);
  const flat = finalizeSecretExportResult(instance, instance.exports.h());
  assert.deepEqual(flat, [WAT_HEAP_BASE, 99], "without layout the inner field is still a guest pointer");
  const instance2 = await instantiateWat(`
    (func (export "h") (result i32)
      (i32.store (i32.const ${WAT_HEAP_BASE}) (i32.const 7))
      (i32.store (i32.const ${WAT_HEAP_BASE + 4}) (i32.const ${WAT_HEAP_BASE}))
      (i32.store (i32.const ${WAT_HEAP_BASE + 8}) (i32.const 99))
      (global.set $__fungi_heap (i32.const ${WAT_HEAP_BASE + 12}))
      (global.set $__fungi_ret_is_heap (i32.const 1))
      (global.set $__fungi_ret_words (i32.const 2))
      (i32.const ${WAT_HEAP_BASE + 4}))
  `);
  const copied = finalizeSecretExportResult(instance2, instance2.exports.h(), OUTER_LAYOUT);
  assert.deepEqual(copied, [[7], 99]);
  const view = new Int32Array(instance2.exports.memory.buffer);
  assert.equal(view[WAT_HEAP_BASE >>> 2], 0, "guest inner word must be wiped after layout copy");
  assert.deepEqual(copied, [[7], 99], "owned nested rows survive guest wipe");
});

test("positive: secret nested layout copy zeros an omitted inner pointer", async () => {
  const instance = await instantiateWat(`
    (func (export "h") (result i32)
      (i32.store (i32.const ${WAT_HEAP_BASE}) (i32.const 0))
      (i32.store (i32.const ${WAT_HEAP_BASE + 4}) (i32.const 99))
      (global.set $__fungi_heap (i32.const ${WAT_HEAP_BASE + 8}))
      (global.set $__fungi_ret_is_heap (i32.const 1))
      (global.set $__fungi_ret_words (i32.const 2))
      (i32.const ${WAT_HEAP_BASE}))
  `);
  const copied = finalizeSecretExportResult(instance, instance.exports.h(), OUTER_LAYOUT);
  assert.deepEqual(copied, [[0], 99]);
});

test("hostile: secret nested layout copy refuses a cyclic inner pointer then wipes", async () => {
  const instance = await instantiateWat(`
    (func (export "h") (result i32)
      (i32.store (i32.const ${WAT_HEAP_BASE}) (i32.const ${WAT_HEAP_BASE}))
      (i32.store (i32.const ${WAT_HEAP_BASE + 4}) (i32.const 1))
      (global.set $__fungi_heap (i32.const ${WAT_HEAP_BASE + 8}))
      (global.set $__fungi_ret_is_heap (i32.const 1))
      (global.set $__fungi_ret_words (i32.const 2))
      (i32.const ${WAT_HEAP_BASE}))
  `);
  const view = new Int32Array(instance.exports.memory.buffer);
  assert.throws(
    () => finalizeSecretExportResult(instance, instance.exports.h(), OUTER_LAYOUT),
    /FUNGI-WASM-HOST-001.*cyclic/,
  );
  assert.equal(view[WAT_HEAP_BASE >>> 2], 0, "guest must be wiped after cyclic layout refuse");
});

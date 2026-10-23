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
  invokeAdmittedExport,
  finalizeSecretExportResult,
  wasmHash,
  WAT_HEAP_BASE,
} from "@galerina/core-runtime-wasm";
import { createWasmInvocationAuthority } from "../../galerina-core-runtime-wasm/dist/wasm-runtime.js";

async function admitWat(wat, host, extra = {}) {
  const asm = await L.assembleWAT(wat);
  assert.ok(asm.valid, `assemble: ${(asm.diagnostics ?? []).map((d) => d.message).join("; ")}`);
  return admitBytes(asm.wasm, host, extra);
}

async function admitBytes(wasm, host, extra = {}) {
  const { publicKeyPem, privateKeyPem } = generateRunnerKeypair();
  const attestation = signWasm(wasm, privateKeyPem, "dev");
  return admitAndInstantiate({
    wasm,
    attestation,
    policy: { requireSigned: true, publicKeyPem },
    host,
    ...extra,
  });
}

function encodeU32(value) {
  const bytes = [];
  let remaining = value >>> 0;
  do {
    let byte = remaining & 0x7f;
    remaining >>>= 7;
    if (remaining !== 0) byte |= 0x80;
    bytes.push(byte);
  } while (remaining !== 0);
  return bytes;
}

function appendCustomSection(wasm, name, text) {
  const nameBytes = new TextEncoder().encode(name);
  const dataBytes = new TextEncoder().encode(text);
  const payload = Uint8Array.from([
    ...encodeU32(nameBytes.length), ...nameBytes, ...dataBytes,
  ]);
  const section = Uint8Array.from([0, ...encodeU32(payload.length), ...payload]);
  const result = new Uint8Array(wasm.length + section.length);
  result.set(wasm);
  result.set(section, wasm.length);
  return result;
}

function hostWords(host) {
  const snapshot = host.snapshotMemory();
  assert.ok(snapshot, "admitted host must expose its memory snapshot");
  assert.equal(snapshot.byteLength, 65_536, "the one-page fixture snapshot must have its exact length");
  return new Int32Array(snapshot.buffer, snapshot.byteOffset, snapshot.byteLength / Int32Array.BYTES_PER_ELEMENT);
}

function observeInheritedDescriptorGetter(secretValue, invoke) {
  const prior = Object.getOwnPropertyDescriptor(Object.prototype, "get");
  let leaked;
  let result;
  let thrown;
  Object.defineProperty(Object.prototype, "get", {
    configurable: true,
    get() {
      if (this !== null && this !== undefined && this.value === secretValue) leaked = this.value;
      return undefined;
    },
  });
  try {
    result = invoke();
  } catch (error) {
    thrown = error;
  } finally {
    if (prior === undefined) delete Object.prototype.get;
    else Object.defineProperty(Object.prototype, "get", prior);
  }
  return { leaked, result, thrown };
}

function observeInheritedDescriptorContainerGetter(invoke) {
  const prior = Object.getOwnPropertyDescriptor(Object.prototype, "get");
  const leakedContainers = [];
  let result;
  let thrown;
  Object.defineProperty(Object.prototype, "get", {
    configurable: true,
    get() {
      const value = Object.getOwnPropertyDescriptor(this, "value")?.value;
      if (Array.isArray(value)) leakedContainers.push(value);
      return undefined;
    },
  });
  try {
    result = invoke();
  } catch (error) {
    thrown = error;
  } finally {
    if (prior === undefined) delete Object.prototype.get;
    else Object.defineProperty(Object.prototype, "get", prior);
  }
  return { leakedContainers, result, thrown };
}

function observeInheritedDescriptorValueSetter(secretValue, invoke) {
  const prior = Object.getOwnPropertyDescriptor(Object.prototype, "value");
  let leaked;
  let result;
  let thrown;
  Object.defineProperty(Object.prototype, "value", {
    configurable: true,
    set(value) {
      if (value === secretValue) leaked = value;
    },
  });
  try {
    result = invoke();
  } catch (error) {
    thrown = error;
  } finally {
    if (prior === undefined) delete Object.prototype.value;
    else Object.defineProperty(Object.prototype, "value", prior);
  }
  return { leaked, result, thrown };
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
      (i32.store (i32.const ${WAT_HEAP_BASE + 64}) (i32.const 305419896))
      unreachable)
  )`;
  const host = createHostRuntime();
  const { instance } = await admitWat(wat, host);
  assert.throws(() => instance.exports.h(), /unreachable|trap/);
  const words = hostWords(host);
  assert.equal(words[WAT_HEAP_BASE >>> 2], 0,
    "wrapped trap path must wipe owned guest words");
  assert.equal(words[(WAT_HEAP_BASE + 64) >>> 2], 305419896,
    "the non-owned sentinel must survive trap cleanup");
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
  (global $guest_calls (export "guest_calls") (mut i32) (i32.const 0))
  (global $wipe_calls (export "wipe_calls") (mut i32) (i32.const 0))
  (global $__fungi_ret_is_heap (mut i32) (i32.const 0))
  (global $__fungi_ret_words (mut i32) (i32.const 0))
  (func (export "__fungi_wipe_owned")
    (global.set $wipe_calls (i32.add (global.get $wipe_calls) (i32.const 1)))
    (memory.fill (i32.const ${WAT_HEAP_BASE}) (i32.const 0)
      (i32.sub (global.get $__fungi_heap) (i32.const ${WAT_HEAP_BASE})))
    (global.set $__fungi_heap (i32.const ${WAT_HEAP_BASE})))
  (func (export "__fungi_ret_is_heap_get") (result i32)
    (global.get $__fungi_ret_is_heap))
  (func (export "__fungi_ret_words_get") (result i32)
    (global.get $__fungi_ret_words))
  (func (export "h") (result i32)
    (global.set $guest_calls (i32.add (global.get $guest_calls) (i32.const 1)))
    (i32.store (i32.const ${WAT_HEAP_BASE}) (i32.const 7))
    (i32.store (i32.const ${WAT_HEAP_BASE + 4}) (i32.const ${WAT_HEAP_BASE}))
    (i32.store (i32.const ${WAT_HEAP_BASE + 8}) (i32.const 99))
    (i32.store (i32.const ${WAT_HEAP_BASE + 64}) (i32.const 305419896))
    (global.set $__fungi_heap (i32.const ${WAT_HEAP_BASE + 12}))
    (global.set $__fungi_ret_is_heap (i32.const 1))
    (global.set $__fungi_ret_words (i32.const 2))
    (i32.const ${WAT_HEAP_BASE + 4}))
)`;

test("positive: wrapped export with returnLayouts owns nested rows then wipes", async () => {
  const host = createHostRuntime();
  const { instance } = await admitWat(NESTED_RET, host, {
    returnLayouts: { h: OUTER_LAYOUT },
  });
  const copied = instance.exports.h();
  assert.deepEqual(copied, [[7], 99]);
  const view = hostWords(host);
  assert.deepEqual(
    Array.from(view.slice(WAT_HEAP_BASE >>> 2, (WAT_HEAP_BASE >>> 2) + 3)),
    [0, 0, 0],
    "wrapped layout copy must wipe all three words in the guest-owned interval",
  );
  assert.equal(view[(WAT_HEAP_BASE + 64) >>> 2], 305419896, "cleanup must preserve the non-owned sentinel");
});

test("invokeAdmittedExport uses the same admission-captured nested layout as direct exports", async () => {
  const host = createHostRuntime();
  const { instance } = await admitWat(NESTED_RET, host, {
    returnLayouts: { h: OUTER_LAYOUT },
  });
  const direct = instance.exports.h();
  assert.deepEqual(direct, [[7], 99]);
  assert.equal(instance.exports.guest_calls.value, 1);
  assert.equal(instance.exports.wipe_calls.value, 1);

  const invoked = invokeAdmittedExport(instance, "h", []);
  assert.deepEqual(invoked, { ok: true, result: [[7], 99] },
    "both public invocation routes must apply the immutable admission-time layout");
  assert.equal(instance.exports.guest_calls.value, 2);
  assert.equal(instance.exports.wipe_calls.value, 2);
  const words = hostWords(host);
  assert.deepEqual(
    Array.from(words.slice(WAT_HEAP_BASE >>> 2, (WAT_HEAP_BASE >>> 2) + 3)),
    [0, 0, 0],
    "the helper route must wipe every word in the guest-owned interval",
  );
  assert.equal(words[(WAT_HEAP_BASE + 64) >>> 2], 305419896,
    "the non-owned sentinel must survive helper-route cleanup");

  const override = invokeAdmittedExport(instance, "h", [], [{ kind: "i32" }, { kind: "i32" }]);
  assert.equal(override.ok, false, "an admitted instance cannot replace its captured return layout per call");
  assert.equal(instance.exports.guest_calls.value, 2,
    "a refused layout override must not execute the guest export");
  assert.equal(instance.exports.wipe_calls.value, 2,
    "a refused layout override must not perform another cleanup pass");
});

test("hostile: proxy alias of an admitted instance is refused before guest call or cleanup", async () => {
  const { instance } = await admitWat(NESTED_RET, createHostRuntime(), {
    returnLayouts: { h: OUTER_LAYOUT },
  });
  let traps = 0;
  const alias = new Proxy(instance, {
    get(target, property, receiver) {
      traps += 1;
      return Reflect.get(target, property, receiver);
    },
  });
  const result = invokeAdmittedExport(alias, "h", [], [{ kind: "i32" }, { kind: "i32" }]);
  assert.equal(result.ok, false, "an unregistered proxy alias cannot invoke an admitted instance");
  assert.equal(traps, 0, "refusal must precede caller-controlled proxy traps");
  assert.equal(instance.exports.guest_calls.value, 0, "refusal must precede guest execution");
  assert.equal(instance.exports.wipe_calls.value, 0, "refusal must not run a duplicate cleanup pass");
});

test("hostile: return-layout root Proxy cannot hide a required nested layout", async () => {
  const asm = await L.assembleWAT(NESTED_RET);
  assert.ok(asm.valid, `assemble: ${(asm.diagnostics ?? []).map((d) => d.message).join("; ")}`);
  let traps = 0;
  const returnLayouts = new Proxy({ h: OUTER_LAYOUT }, {
    ownKeys() {
      traps += 1;
      return [];
    },
  });
  const originalInstantiate = WebAssembly.instantiate;
  let instantiateCalls = 0;
  WebAssembly.instantiate = async function (...args) {
    instantiateCalls += 1;
    return originalInstantiate.apply(WebAssembly, args);
  };
  try {
    await assert.rejects(admitBytes(asm.wasm, createHostRuntime(), { returnLayouts }), /proxy/i);
    assert.equal(traps, 0, "proxy rejection must occur before caller traps execute");
    assert.equal(instantiateCalls, 0, "malformed layouts must refuse before module instantiation");

    const host = createHostRuntime();
    const { instance } = await admitBytes(asm.wasm, host, { returnLayouts: { h: OUTER_LAYOUT } });
    assert.equal(instantiateCalls, 1, "valid-layout positive control must exercise the observed instantiation boundary");
    assert.deepEqual(instance.exports.h(), [[7], 99]);
    const words = hostWords(host);
    assert.deepEqual(
      Array.from(words.slice(WAT_HEAP_BASE >>> 2, (WAT_HEAP_BASE >>> 2) + 3)),
      [0, 0, 0],
      "valid-layout positive control must wipe every word in the guest-owned interval",
    );
  } finally {
    WebAssembly.instantiate = originalInstantiate;
  }
});

test("hostile: return-layout array and field Proxies are rejected before traps execute", async () => {
  const asm = await L.assembleWAT(NESTED_RET);
  assert.ok(asm.valid, `assemble: ${(asm.diagnostics ?? []).map((d) => d.message).join("; ")}`);
  for (const layer of ["array", "field"]) {
    let traps = 0;
    const trapHandler = {
      getPrototypeOf(target) {
        traps += 1;
        return Reflect.getPrototypeOf(target);
      },
      ownKeys(target) {
        traps += 1;
        return Reflect.ownKeys(target);
      },
      getOwnPropertyDescriptor(target, key) {
        traps += 1;
        return Reflect.getOwnPropertyDescriptor(target, key);
      },
    };
    const returnLayouts = layer === "array"
      ? { h: new Proxy(OUTER_LAYOUT, trapHandler) }
      : { h: [{ kind: "record", fields: [new Proxy({ kind: "i32" }, trapHandler)] }, { kind: "i32" }] };
    const originalInstantiate = WebAssembly.instantiate;
    let instantiateCalls = 0;
    WebAssembly.instantiate = async function (...args) {
      instantiateCalls += 1;
      return originalInstantiate.apply(WebAssembly, args);
    };
    try {
      await assert.rejects(admitBytes(asm.wasm, createHostRuntime(), { returnLayouts }), /proxy/i, layer);
      assert.equal(traps, 0, `${layer} Proxy must be refused before trap execution`);
      assert.equal(instantiateCalls, 0, `${layer} malformed layout must refuse before instantiation`);
    } finally {
      WebAssembly.instantiate = originalInstantiate;
    }
  }
});

test("admission snapshots return layouts before asynchronous compilation yields", async () => {
  const asm = await L.assembleWAT(NESTED_RET);
  assert.ok(asm.valid, `assemble: ${(asm.diagnostics ?? []).map((d) => d.message).join("; ")}`);
  const { publicKeyPem, privateKeyPem } = generateRunnerKeypair();
  const attestation = signWasm(asm.wasm, privateKeyPem, "dev");
  const returnLayouts = { h: OUTER_LAYOUT };
  const host = createHostRuntime();
  const originalCompile = WebAssembly.compile;
  let signalCompileStarted;
  let releaseCompile;
  const compileStarted = new Promise((resolve) => { signalCompileStarted = resolve; });
  const compileRelease = new Promise((resolve) => { releaseCompile = resolve; });

  WebAssembly.compile = async function (wasm) {
    signalCompileStarted();
    await compileRelease;
    return originalCompile.call(WebAssembly, wasm);
  };
  try {
    const pending = admitAndInstantiate({
      wasm: asm.wasm,
      attestation,
      policy: { requireSigned: true, publicKeyPem },
      host,
      returnLayouts,
    });
    await compileStarted;
    returnLayouts.h = undefined;
    releaseCompile();
    const admitted = await pending;
    assert.deepEqual(admitted.instance.exports.h(), [[7], 99],
      "the admitted copy/wipe behavior must use the layout captured at the call boundary");
    const words = hostWords(host);
    assert.deepEqual(
      Array.from(words.slice(WAT_HEAP_BASE >>> 2, (WAT_HEAP_BASE >>> 2) + 3)),
      [0, 0, 0],
      "captured layout cleanup must wipe every word in the guest-owned interval",
    );
    assert.equal(words[(WAT_HEAP_BASE + 64) >>> 2], 305419896,
      "the non-owned sentinel must survive captured-layout cleanup");
  } finally {
    releaseCompile();
    WebAssembly.compile = originalCompile;
  }
});

test("admission snapshots nested return-layout fields before asynchronous compilation yields", async () => {
  const asm = await L.assembleWAT(NESTED_RET);
  assert.ok(asm.valid, `assemble: ${(asm.diagnostics ?? []).map((d) => d.message).join("; ")}`);
  const { publicKeyPem, privateKeyPem } = generateRunnerKeypair();
  const attestation = signWasm(asm.wasm, privateKeyPem, "dev");
  const nestedField = { kind: "i32" };
  const nestedFields = [nestedField];
  const returnLayouts = { h: [{ kind: "record", fields: nestedFields }, { kind: "i32" }] };
  const host = createHostRuntime();
  const originalCompile = WebAssembly.compile;
  let signalCompileStarted;
  let releaseCompile;
  const compileStarted = new Promise((resolve) => { signalCompileStarted = resolve; });
  const compileRelease = new Promise((resolve) => { releaseCompile = resolve; });

  WebAssembly.compile = async function (wasm) {
    signalCompileStarted();
    await compileRelease;
    return originalCompile.call(WebAssembly, wasm);
  };
  try {
    const pending = admitAndInstantiate({
      wasm: asm.wasm,
      attestation,
      policy: { requireSigned: true, publicKeyPem },
      host,
      returnLayouts,
    });
    await compileStarted;
    nestedField.kind = "record";
    nestedField.fields = [];
    nestedFields.push({ kind: "record", fields: [] });
    releaseCompile();
    const admitted = await pending;
    assert.deepEqual(admitted.instance.exports.h(), [[7], 99],
      "nested copy/wipe behavior must use the deeply captured field descriptors");
    const words = hostWords(host);
    assert.deepEqual(
      Array.from(words.slice(WAT_HEAP_BASE >>> 2, (WAT_HEAP_BASE >>> 2) + 3)),
      [0, 0, 0],
      "captured nested layout cleanup must wipe every word in the guest-owned interval",
    );
    assert.equal(words[(WAT_HEAP_BASE + 64) >>> 2], 305419896,
      "the non-owned sentinel must survive captured nested-layout cleanup");
  } finally {
    releaseCompile();
    WebAssembly.compile = originalCompile;
  }
});

test("characterization: legacy wrapped export without returnLayouts returns the inner pointer", async () => {
  const host = createHostRuntime();
  const { instance } = await admitWat(NESTED_RET, host);
  assert.deepEqual(instance.exports.h(), [WAT_HEAP_BASE, 99]);
  const words = hostWords(host);
  assert.deepEqual(
    Array.from(words.slice(WAT_HEAP_BASE >>> 2, (WAT_HEAP_BASE >>> 2) + 3)),
    [0, 0, 0],
    "legacy wrapped export must wipe every word in the guest-owned interval",
  );
});

const TRANSITIVE_HOST_RESULT = `(module
  (import "host" "__array_create" (func $array_create (result i32)))
  (import "host" "__array_append" (func $array_append (param i32 i32) (result i32)))
  (import "host" "__result_ok" (func $result_ok (param i32) (result i32)))
  (memory (export "memory") 1)
  (global $__fungi_heap (mut i32) (i32.const ${WAT_HEAP_BASE}))
  (func (export "__fungi_ret_is_heap_get") (result i32) (i32.const 0))
  (func (export "__fungi_wipe_owned")
    (memory.fill (i32.const ${WAT_HEAP_BASE}) (i32.const 0)
      (i32.sub (global.get $__fungi_heap) (i32.const ${WAT_HEAP_BASE})))
    (global.set $__fungi_heap (i32.const ${WAT_HEAP_BASE})))
  (func (export "run") (result i32) (local $array i32)
    (i32.store (i32.const ${WAT_HEAP_BASE}) (i32.const 7))
    (i32.store (i32.const ${WAT_HEAP_BASE + 4}) (i32.const 42))
    (global.set $__fungi_heap (i32.const ${WAT_HEAP_BASE + 8}))
    (local.set $array (call $array_create))
    (drop (call $array_append (local.get $array) (i32.const ${WAT_HEAP_BASE})))
    (call $result_ok (local.get $array)))
)`;

test("signed owned-return section snapshots Result<Array<Record>> before guest memory wipe", async () => {
  const host = createHostRuntime();
  const asm = await L.assembleWAT(TRANSITIVE_HOST_RESULT);
  assert.ok(asm.valid, `assemble: ${(asm.diagnostics ?? []).map((d) => d.message).join("; ")}`);
  const schema = JSON.stringify({
    version: 1,
    exports: {
      run: {
        kind: "result",
        ok: {
          kind: "array",
          element: { kind: "record", fields: [{ kind: "i32" }, { kind: "i32" }] },
        },
        err: { kind: "i32" },
      },
    },
  });
  const wasm = appendCustomSection(asm.wasm, "fungi.owned-returns.v1", schema);
  const { instance } = await admitBytes(wasm, host, { requireOwnedReturnSchemas: true });

  const result = instance.exports.run();
  assert.deepEqual(result, { tag: "ok", value: [[7, 42]] });
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.value), true);
  assert.equal(Object.isFrozen(result.value[0]), true);
  assert.deepEqual(
    Array.from(hostWords(host).slice(WAT_HEAP_BASE >>> 2, (WAT_HEAP_BASE >>> 2) + 2)),
    [0, 0],
    "the guest record is wiped only after the complete owned result has been copied",
  );
  const invoked = invokeAdmittedExport(instance, "run", []);
  assert.deepEqual(invoked, { ok: true, result: { tag: "ok", value: [[7, 42]] } },
    "the governed invocation helper must use the same admission-captured schema and private copier");
  assert.deepEqual(
    Array.from(hostWords(host).slice(WAT_HEAP_BASE >>> 2, (WAT_HEAP_BASE >>> 2) + 2)),
    [0, 0],
    "the helper route must also wipe after publishing only the owned snapshot",
  );
});

test("hostile: mutable TextDecoder cannot replace the signed owned-return schema", async () => {
  const host = createHostRuntime();
  const asm = await L.assembleWAT(TRANSITIVE_HOST_RESULT);
  assert.ok(asm.valid, `assemble: ${(asm.diagnostics ?? []).map((d) => d.message).join("; ")}`);
  const schema = JSON.stringify({
    version: 1,
    exports: {
      run: {
        kind: "result",
        ok: { kind: "array", element: { kind: "record", fields: [{ kind: "i32" }, { kind: "i32" }] } },
        err: { kind: "i32" },
      },
    },
  });
  const alteredSchema = JSON.stringify({ version: 1, exports: { run: { kind: "i32" } } });
  const wasm = appendCustomSection(asm.wasm, "fungi.owned-returns.v1", schema);
  const originalDecode = TextDecoder.prototype.decode;
  TextDecoder.prototype.decode = function (input, options) {
    const decoded = Reflect.apply(originalDecode, this, [input, options]);
    return decoded === schema ? alteredSchema : decoded;
  };
  let admitted;
  try {
    admitted = await admitBytes(wasm, host, { requireOwnedReturnSchemas: true });
  } finally {
    TextDecoder.prototype.decode = originalDecode;
  }

  assert.deepEqual(admitted.instance.exports.run(), { tag: "ok", value: [[7, 42]] },
    "admission must use the schema bound to the signed bytes, not mutable decoder output");
});

test("hostile: mutable Uint8Array.subarray cannot replace owned-return bytes", async () => {
  const host = createHostRuntime();
  const asm = await L.assembleWAT(TRANSITIVE_HOST_RESULT);
  assert.ok(asm.valid, `assemble: ${(asm.diagnostics ?? []).map((d) => d.message).join("; ")}`);
  const schema = JSON.stringify({
    version: 1,
    exports: {
      run: {
        kind: "result",
        ok: { kind: "array", element: { kind: "record", fields: [{ kind: "i32" }, { kind: "i32" }] } },
        err: { kind: "i32" },
      },
    },
  });
  const alteredSchema = JSON.stringify({ version: 1, exports: { run: { kind: "i32" } } });
  const wasm = appendCustomSection(asm.wasm, "fungi.owned-returns.v1", schema);
  const originalSubarray = Uint8Array.prototype.subarray;
  const originalDecode = TextDecoder.prototype.decode;
  let intercepted = false;
  Uint8Array.prototype.subarray = function (start, end) {
    const bytes = Reflect.apply(originalSubarray, this, [start, end]);
    const decoded = Reflect.apply(originalDecode, new TextDecoder("utf-8", { fatal: true }), [bytes]);
    if (decoded !== schema) return bytes;
    intercepted = true;
    return new TextEncoder().encode(alteredSchema);
  };
  let admitted;
  try {
    admitted = await admitBytes(wasm, host, { requireOwnedReturnSchemas: true });
  } finally {
    Uint8Array.prototype.subarray = originalSubarray;
  }

  assert.equal(intercepted, false,
    "metadata parsing must not dispatch through the mutable Uint8Array.subarray method");
  assert.deepEqual(admitted.instance.exports.run(), { tag: "ok", value: [[7, 42]] },
    "admission must use the schema bytes bound to the signed module");
});

test("hostile: captured subarray cannot dispatch through mutable Uint8Array species", async () => {
  const host = createHostRuntime();
  const asm = await L.assembleWAT(TRANSITIVE_HOST_RESULT);
  assert.ok(asm.valid, `assemble: ${(asm.diagnostics ?? []).map((d) => d.message).join("; ")}`);
  const schema = JSON.stringify({
    version: 1,
    exports: {
      run: {
        kind: "result",
        ok: { kind: "array", element: { kind: "record", fields: [{ kind: "i32" }, { kind: "i32" }] } },
        err: { kind: "i32" },
      },
    },
  });
  const alteredSchema = JSON.stringify({ version: 1, exports: { run: { kind: "i32" } } });
  const schemaBytes = new TextEncoder().encode(schema);
  const alteredBytes = new TextEncoder().encode(alteredSchema);
  const wasm = appendCustomSection(asm.wasm, "fungi.owned-returns.v1", schema);
  const originalSpecies = Object.getOwnPropertyDescriptor(Uint8Array, Symbol.species);
  let intercepted = false;
  function MutatingSpecies(buffer, byteOffset, length) {
    const candidate = new Uint8Array(buffer, byteOffset, length);
    if (candidate.length === schemaBytes.length
      && schemaBytes.every((byte, index) => candidate[index] === byte)) {
      intercepted = true;
      return new Uint8Array(alteredBytes.buffer, alteredBytes.byteOffset, alteredBytes.byteLength);
    }
    return candidate;
  }
  Object.defineProperty(Uint8Array, Symbol.species, {
    configurable: true,
    value: MutatingSpecies,
  });
  let admitted;
  let admissionError;
  try {
    admitted = await admitBytes(wasm, host, { requireOwnedReturnSchemas: true });
  } catch (error) {
    admissionError = error;
  } finally {
    if (originalSpecies === undefined) delete Uint8Array[Symbol.species];
    else Object.defineProperty(Uint8Array, Symbol.species, originalSpecies);
  }

  assert.equal(intercepted, false,
    "metadata slicing must not dispatch through mutable Uint8Array species");
  assert.ifError(admissionError);
  assert.deepEqual(admitted.instance.exports.run(), { tag: "ok", value: [[7, 42]] },
    "admission must retain the schema bytes bound to the signed module");
});

test("hostile: failed owned cleanup quarantines host-side result registries", async () => {
  const cleanupFailure = TRANSITIVE_HOST_RESULT
    .replace(
      `(memory.fill (i32.const ${WAT_HEAP_BASE}) (i32.const 0)
      (i32.sub (global.get $__fungi_heap) (i32.const ${WAT_HEAP_BASE})))
    (global.set $__fungi_heap (i32.const ${WAT_HEAP_BASE}))`,
      "unreachable",
    )
    .replace(
      `(drop (call $array_append (local.get $array) (i32.const ${WAT_HEAP_BASE})))`,
      "(drop (call $array_append (local.get $array) (i32.const 42)))",
    );
  const asm = await L.assembleWAT(cleanupFailure);
  assert.ok(asm.valid, `assemble: ${(asm.diagnostics ?? []).map((d) => d.message).join("; ")}`);
  const schema = JSON.stringify({
    version: 1,
    exports: {
      run: {
        kind: "result",
        ok: { kind: "array", element: { kind: "i32" } },
        err: { kind: "i32" },
      },
    },
  });
  const host = createHostRuntime();
  const wasm = appendCustomSection(asm.wasm, "fungi.owned-returns.v1", schema);
  const { instance } = await admitBytes(wasm, host, { requireOwnedReturnSchemas: true });

  assert.throws(() => instance.exports.run(), /unreachable|trap/);
  assert.throws(() => host.readArray(0), /QUARANTINED/iu,
    "a cleanup failure must make retained host result arrays unreadable");
  assert.throws(() => host.imports.host.__array_get(0, 0), /QUARANTINED/iu,
    "the raw import surface must not bypass host-runtime quarantine");
  assert.throws(() => host.imports.host.__result_value(0), /QUARANTINED/iu,
    "the raw Result import surface must not bypass host-runtime quarantine");
});

test("hostile: failure decoration cannot prevent cleanup quarantine", async () => {
  const failedWipeWat = TRANSITIVE_HOST_RESULT.replace(
    `(memory.fill (i32.const ${WAT_HEAP_BASE}) (i32.const 0)
      (i32.sub (global.get $__fungi_heap) (i32.const ${WAT_HEAP_BASE})))
    (global.set $__fungi_heap (i32.const ${WAT_HEAP_BASE}))`,
    "unreachable",
  );
  const asm = await L.assembleWAT(failedWipeWat);
  assert.ok(asm.valid, `assemble: ${(asm.diagnostics ?? []).map((d) => d.message).join("; ")}`);
  const host = createHostRuntime();
  const { instance } = await admitBytes(asm.wasm, host);
  const originalDefineProperty = Object.defineProperty;
  try {
    Object.defineProperty = function (target, property, descriptor) {
      if (property === "cause") throw new Error("hostile cause decoration");
      return originalDefineProperty(target, property, descriptor);
    };
    const first = invokeAdmittedExport(instance, "run", []);
    assert.equal(first.ok, false);
  } finally {
    Object.defineProperty = originalDefineProperty;
  }
  const second = invokeAdmittedExport(instance, "run", []);
  assert.equal(second.ok, false);
  assert.match(second.reason, /QUARANTINED/iu,
    "a secondary cleanup-reporting failure must still revoke future calls");
});

test("hostile: replacement Error constructor cannot prevent cleanup quarantine", async () => {
  const failedWipeWat = TRANSITIVE_HOST_RESULT
    .replace(
      `(memory.fill (i32.const ${WAT_HEAP_BASE}) (i32.const 0)
      (i32.sub (global.get $__fungi_heap) (i32.const ${WAT_HEAP_BASE})))
    (global.set $__fungi_heap (i32.const ${WAT_HEAP_BASE}))`,
      "unreachable",
    )
    .replace(
      `(drop (call $array_append (local.get $array) (i32.const ${WAT_HEAP_BASE})))`,
      "(drop (call $array_append (local.get $array) (i32.const 42)))",
    );
  const asm = await L.assembleWAT(failedWipeWat);
  assert.ok(asm.valid, `assemble: ${(asm.diagnostics ?? []).map((d) => d.message).join("; ")}`);
  const host = createHostRuntime();
  const { instance } = await admitBytes(asm.wasm, host);
  const originalError = globalThis.Error;
  try {
    globalThis.Error = function Error() {
      throw new originalError("hostile Error constructor");
    };
    const first = invokeAdmittedExport(instance, "run", []);
    assert.equal(first.ok, false);
  } finally {
    globalThis.Error = originalError;
  }

  assert.throws(() => host.readArray(0), /QUARANTINED/iu,
    "cleanup failure must quarantine retained host-side result bytes even when diagnostics throw");
  const second = invokeAdmittedExport(instance, "run", []);
  assert.equal(second.ok, false);
  assert.match(second.reason, /QUARANTINED/iu,
    "the instance must reject later exports after cleanup reporting fails");
});

test("hostile: failed cleanup quarantines before replacement Error can reenter host registries", async () => {
  const failedWipeWat = TRANSITIVE_HOST_RESULT
    .replace(
      `(memory.fill (i32.const ${WAT_HEAP_BASE}) (i32.const 0)
      (i32.sub (global.get $__fungi_heap) (i32.const ${WAT_HEAP_BASE})))
    (global.set $__fungi_heap (i32.const ${WAT_HEAP_BASE}))`,
      "unreachable",
    )
    .replace(
      `(drop (call $array_append (local.get $array) (i32.const ${WAT_HEAP_BASE})))`,
      "(drop (call $array_append (local.get $array) (i32.const 42)))",
    );
  const asm = await L.assembleWAT(failedWipeWat);
  assert.ok(asm.valid, `assemble: ${(asm.diagnostics ?? []).map((d) => d.message).join("; ")}`);
  const schema = JSON.stringify({
    version: 1,
    exports: {
      run: {
        kind: "result",
        ok: { kind: "array", element: { kind: "i32" } },
        err: { kind: "i32" },
      },
    },
  });
  const wasm = appendCustomSection(asm.wasm, "fungi.owned-returns.v1", schema);
  const originalError = globalThis.Error;

  for (const route of ["direct", "helper"]) {
    const host = createHostRuntime();
    const { instance } = await admitBytes(wasm, host, { requireOwnedReturnSchemas: true });
    let insideReplacement = false;
    let registryReadSucceeded = false;
    let importReadSucceeded = false;
    try {
      globalThis.Error = function Error(message) {
        if (!insideReplacement) {
          insideReplacement = true;
          try {
            host.readArray(0);
            registryReadSucceeded = true;
          } catch {
            // Quarantine refusal is the required result.
          }
          try {
            host.imports.host.__array_get(0, 0);
            importReadSucceeded = true;
          } catch {
            // The raw import surface must be closed at the same ordering point.
          } finally {
            insideReplacement = false;
          }
        }
        throw new originalError(String(message ?? "hostile Error constructor"));
      };

      if (route === "direct") {
        assert.throws(() => instance.exports.run());
      } else {
        const first = invokeAdmittedExport(instance, "run", []);
        assert.equal(first.ok, false);
      }
    } finally {
      globalThis.Error = originalError;
    }

    assert.equal(registryReadSucceeded, false,
      `${route} route must quarantine before replacement Error can read the host array registry`);
    assert.equal(importReadSucceeded, false,
      `${route} route must quarantine before replacement Error can use the raw array import`);
    assert.throws(() => host.readArray(0), /QUARANTINED/iu,
      `${route} route must remain quarantined after diagnostic construction`);
    if (route === "direct") {
      assert.throws(() => instance.exports.run(), /QUARANTINED/iu);
    } else {
      const second = invokeAdmittedExport(instance, "run", []);
      assert.equal(second.ok, false);
      assert.match(second.reason, /QUARANTINED/iu);
    }
  }
});

test("hostile: inherited cleanup failure setter cannot reenter host registries before quarantine", async () => {
  const failedWipeWat = TRANSITIVE_HOST_RESULT.replace(
    `(memory.fill (i32.const ${WAT_HEAP_BASE}) (i32.const 0)
      (i32.sub (global.get $__fungi_heap) (i32.const ${WAT_HEAP_BASE})))
    (global.set $__fungi_heap (i32.const ${WAT_HEAP_BASE}))`,
    "unreachable",
  ).replace(
    `(drop (call $array_append (local.get $array) (i32.const ${WAT_HEAP_BASE})))`,
    "(drop (call $array_append (local.get $array) (i32.const 42)))",
  );
  const asm = await L.assembleWAT(failedWipeWat);
  assert.ok(asm.valid, `assemble: ${(asm.diagnostics ?? []).map((d) => d.message).join("; ")}`);
  const schema = JSON.stringify({
    version: 1,
    exports: {
      run: {
        kind: "result",
        ok: { kind: "array", element: { kind: "i32" } },
        err: { kind: "i32" },
      },
    },
  });
  const wasm = appendCustomSection(asm.wasm, "fungi.owned-returns.v1", schema);
  const originalDescriptor = Object.getOwnPropertyDescriptor(Object.prototype, "failure");
  const observations = [];

  for (const route of ["direct", "helper"]) {
    const host = createHostRuntime();
    const { instance } = await admitBytes(wasm, host, { requireOwnedReturnSchemas: true });
    let setterTriggered = false;
    let registryReadSucceeded = false;
    let importReadSucceeded = false;
    Object.defineProperty(Object.prototype, "failure", {
      configurable: true,
      set(value) {
        if (typeof value !== "string" || !value.includes("FUNGI-WASM-CLEANUP-001")) return;
        setterTriggered = true;
        try {
          host.readArray(0);
          registryReadSucceeded = true;
        } catch {
          // Quarantine refusal is required before inherited setter dispatch.
        }
        try {
          host.imports.host.__array_get(0, 0);
          importReadSucceeded = true;
        } catch {
          // The raw import surface must be closed at the same ordering point.
        }
      },
    });
    try {
      if (route === "direct") assert.throws(() => instance.exports.run());
      else assert.equal(invokeAdmittedExport(instance, "run", []).ok, false);
    } finally {
      if (originalDescriptor) Object.defineProperty(Object.prototype, "failure", originalDescriptor);
      else delete Object.prototype.failure;
    }

    let quarantinedReadRefused = false;
    try {
      host.readArray(0);
    } catch (error) {
      quarantinedReadRefused = /QUARANTINED/iu.test(String(error));
    }
    observations.push({ route, setterTriggered, registryReadSucceeded, importReadSucceeded, quarantinedReadRefused });
  }
  assert.deepEqual(observations, ["direct", "helper"].map((route) => ({
    route,
    setterTriggered: false,
    registryReadSucceeded: false,
    importReadSucceeded: false,
    quarantinedReadRefused: true,
  })));
});

test("hostile: exported finalizer refuses an admitted instance already quarantined by failed cleanup", async () => {
  const failFirstWipe = NESTED_RET.replace(
    `(func (export "__fungi_wipe_owned")
    (global.set $wipe_calls (i32.add (global.get $wipe_calls) (i32.const 1)))
    (memory.fill (i32.const ${WAT_HEAP_BASE}) (i32.const 0)
      (i32.sub (global.get $__fungi_heap) (i32.const ${WAT_HEAP_BASE})))
    (global.set $__fungi_heap (i32.const ${WAT_HEAP_BASE})))`,
    `(func (export "__fungi_wipe_owned")
    (global.set $wipe_calls (i32.add (global.get $wipe_calls) (i32.const 1)))
    (if (i32.eq (global.get $wipe_calls) (i32.const 1)) (then unreachable))
    (memory.fill (i32.const ${WAT_HEAP_BASE}) (i32.const 0)
      (i32.sub (global.get $__fungi_heap) (i32.const ${WAT_HEAP_BASE})))
    (global.set $__fungi_heap (i32.const ${WAT_HEAP_BASE})))`,
  );
  const host = createHostRuntime();
  const { instance } = await admitWat(failFirstWipe, host, {
    returnLayouts: { h: OUTER_LAYOUT },
  });

  assert.throws(() => instance.exports.h(), /unreachable|trap/iu,
    "first cleanup failure must not return the copied record");
  assert.throws(
    () => finalizeSecretExportResult(instance, WAT_HEAP_BASE + 4, OUTER_LAYOUT),
    /QUARANTINED/iu,
    "the exported finalizer must refuse before copying from an already-quarantined admitted instance",
  );
});

test("hostile: exported finalizer refuses re-entry while an admitted guest call is active", async () => {
  let instance;
  let nestedResult;
  let nestedError;
  const host = createHostRuntime(undefined, {
    effectHandlers: {
      "audit.write": () => {
        try {
          nestedResult = finalizeSecretExportResult(instance, WAT_HEAP_BASE + 4, OUTER_LAYOUT);
        } catch (error) {
          nestedError = error;
        }
        return 0;
      },
    },
  });
  const wat = NESTED_RET
    .replace(
      "(module\n",
      '(module\n  (import "host" "audit.write" (func $audit_write (param i32 i32) (result i32)))\n',
    )
    .replace(
      "(global.set $__fungi_ret_words (i32.const 2))",
      "(global.set $__fungi_ret_words (i32.const 2))\n    (drop (call $audit_write (i32.const 0) (i32.const 0)))",
    );
  const admitted = await admitWat(wat, host, { returnLayouts: { h: OUTER_LAYOUT } });
  instance = admitted.instance;

  const outer = invokeAdmittedExport(instance, "h", []);
  assert.equal(outer.ok, true, "the legitimate outer call should still complete and finalize its result");
  assert.deepEqual(outer.result, [[7], 99], "active-call refusal must preserve ordinary result copying");
  assert.equal(nestedResult, undefined,
    "a nested finalizer must not expose guest bytes while the outer admitted export is active");
  assert.match(String(nestedError), /FUNGI-WASM-REENTRANT-001/iu,
    "active-call refusal must use the existing reentrancy boundary");
});

test("hostile: direct finalization holds the admitted-call guard across guest metadata callbacks", async () => {
  let instance;
  let callbackEntered = false;
  let nestedInvocation;
  const host = createHostRuntime(undefined, {
    effectHandlers: {
      "audit.write": () => {
        if (!callbackEntered) {
          callbackEntered = true;
          nestedInvocation = invokeAdmittedExport(instance, "h", []);
        }
        return 0;
      },
    },
  });
  const wat = NESTED_RET
    .replace(
      "(module\n",
      '(module\n  (import "host" "audit.write" (func $audit_write (param i32 i32) (result i32)))\n',
    )
    .replace(
      "(func (export \"__fungi_ret_is_heap_get\") (result i32)\n    (global.get $__fungi_ret_is_heap))",
      '(func (export "__fungi_ret_is_heap_get") (result i32)\n    (drop (call $audit_write (i32.const 0) (i32.const 0)))\n    (global.get $__fungi_ret_is_heap))',
    );
  instance = (await admitWat(wat, host, { returnLayouts: { h: OUTER_LAYOUT } })).instance;

  const finalized = finalizeSecretExportResult(instance, 42);
  assert.equal(nestedInvocation?.ok, false,
    "a metadata callback cannot enter an admitted export during direct finalization");
  assert.match(nestedInvocation?.reason ?? "", /FUNGI-WASM-REENTRANT-001/iu);
  assert.equal(instance.exports.guest_calls.value, 0,
    "re-entry must refuse before executing the guest export");
  assert.equal(finalized, 42, "the outer direct finalization should retain its scalar result");
});

test("hostile: generic invocation refuses the reserved wipe helper without retrying cleanup", async () => {
  const failFirstWipe = NESTED_RET.replace(
    `(func (export "__fungi_wipe_owned")
    (global.set $wipe_calls (i32.add (global.get $wipe_calls) (i32.const 1)))
    (memory.fill (i32.const ${WAT_HEAP_BASE}) (i32.const 0)
      (i32.sub (global.get $__fungi_heap) (i32.const ${WAT_HEAP_BASE})))
    (global.set $__fungi_heap (i32.const ${WAT_HEAP_BASE})))`,
    `(func (export "__fungi_wipe_owned")
    (global.set $wipe_calls (i32.add (global.get $wipe_calls) (i32.const 1)))
    (if (i32.eq (global.get $wipe_calls) (i32.const 1)) (then unreachable))
    (memory.fill (i32.const ${WAT_HEAP_BASE}) (i32.const 0)
      (i32.sub (global.get $__fungi_heap) (i32.const ${WAT_HEAP_BASE})))
    (global.set $__fungi_heap (i32.const ${WAT_HEAP_BASE})))`,
  );
  const aliasedWipe = failFirstWipe.replace(
    '(func (export "__fungi_wipe_owned")',
    '(func (export "__fungi_wipe_owned") (export "wipeAlias")',
  );
  const { instance } = await admitWat(aliasedWipe, createHostRuntime(), {
    returnLayouts: { h: OUTER_LAYOUT },
  });

  const result = invokeAdmittedExport(instance, "__fungi_wipe_owned", []);
  assert.equal(result.ok, false, "the cleanup primitive is not an application-callable export");
  assert.equal(instance.exports.wipe_calls.value, 0, "refusal must precede the first wipe attempt");
  assert.equal(instance.exports.guest_calls.value, 0);
  const aliasResult = invokeAdmittedExport(instance, "wipeAlias", []);
  assert.equal(aliasResult.ok, false, "an alias of a reserved helper is not an application export");
  assert.equal(instance.exports.wipe_calls.value, 0, "identity-based refusal must precede helper execution");
  assert.equal(instance.exports.guest_calls.value, 0);
  const normal = (await admitWat(NESTED_RET, createHostRuntime(), {
    returnLayouts: { h: OUTER_LAYOUT },
  })).instance;
  const next = invokeAdmittedExport(normal, "h", []);
  assert.equal(next.ok, true, "ordinary admitted exports remain callable");
  assert.equal(normal.exports.guest_calls.value, 1);
  assert.equal(normal.exports.wipe_calls.value, 1, "the guest call owns exactly one cleanup attempt");
});

test("hostile: direct wipe-helper aliases use helper failure handling and quarantine after one attempt", async () => {
  const failFirstWipe = NESTED_RET.replace(
    `(func (export "__fungi_wipe_owned")
    (global.set $wipe_calls (i32.add (global.get $wipe_calls) (i32.const 1)))
    (memory.fill (i32.const ${WAT_HEAP_BASE}) (i32.const 0)
      (i32.sub (global.get $__fungi_heap) (i32.const ${WAT_HEAP_BASE})))
    (global.set $__fungi_heap (i32.const ${WAT_HEAP_BASE})))`,
    `(func (export "__fungi_wipe_owned")
    (global.set $wipe_calls (i32.add (global.get $wipe_calls) (i32.const 1)))
    (if (i32.eq (global.get $wipe_calls) (i32.const 1)) (then unreachable))
    (memory.fill (i32.const ${WAT_HEAP_BASE}) (i32.const 0)
      (i32.sub (global.get $__fungi_heap) (i32.const ${WAT_HEAP_BASE})))
    (global.set $__fungi_heap (i32.const ${WAT_HEAP_BASE})))`,
  );
  const aliasedWipe = failFirstWipe.replace(
    '(func (export "__fungi_wipe_owned")',
    '(func (export "__fungi_wipe_owned") (export "wipeAlias")',
  );
  const { instance } = await admitWat(aliasedWipe, createHostRuntime(), {
    returnLayouts: { h: OUTER_LAYOUT },
  });

  assert.throws(() => instance.exports.wipeAlias(), /trap|unreachable|CLEANUP-001/iu);
  assert.equal(instance.exports.wipe_calls.value, 1,
    "a direct function-identity alias must not receive a second cleanup attempt");
  const later = invokeAdmittedExport(instance, "h", []);
  assert.equal(later.ok, false, "a failed direct helper call must quarantine the admitted instance");
  assert.match(later.reason, /FUNGI-WASM-QUARANTINED-001/iu);
  assert.equal(instance.exports.wipe_calls.value, 1,
    "quarantine must prevent later application calls from retrying the wipe");
});

test("positive: direct wipe-helper aliases retain exactly-once helper behavior", async () => {
  const aliasedWipe = NESTED_RET.replace(
    '(func (export "__fungi_wipe_owned")',
    '(func (export "__fungi_wipe_owned") (export "wipeAlias")',
  );
  const { instance } = await admitWat(aliasedWipe, createHostRuntime(), {
    returnLayouts: { h: OUTER_LAYOUT },
  });

  instance.exports.wipeAlias();
  assert.equal(instance.exports.wipe_calls.value, 1,
    "the alias must use the same one-call helper wrapper as the named export");
  const later = invokeAdmittedExport(instance, "h", []);
  assert.equal(later.ok, true, "a successful helper alias must not quarantine the instance");
  assert.equal(instance.exports.wipe_calls.value, 2,
    "the subsequent application call owns one additional cleanup attempt");
});

test("hostile: one function cannot satisfy two distinct reserved helper identities", async () => {
  const collidingHelpers = NESTED_RET.replace(
    '(func (export "__fungi_wipe_owned")',
    '(func (export "__fungi_wipe_owned") (export "__fungi_heap_get")',
  );

  await assert.rejects(
    admitWat(collidingHelpers, createHostRuntime()),
    /reserved secret helper exports must not alias the same function/iu,
    "ambiguous identity cannot be safely canonicalized as both cleanup and value helper",
  );
});

test("hostile: another reserved helper collision quarantines without returning an instance", async () => {
  const withoutWordsHelper = NESTED_RET.replace(
    '(func (export "__fungi_ret_words_get")',
    '(func (export "plain_words_get")',
  );
  const collidingHelpers = withoutWordsHelper.replace(
    '(func (export "__fungi_wipe_owned")',
    '(func (export "__fungi_wipe_owned") (export "__fungi_ret_words_get")',
  );
  const host = createHostRuntime();
  let violations = 0;

  await assert.rejects(
    admitWat(collidingHelpers, host, {
      observe: { onViolation() { violations += 1; } },
    }),
    /reserved secret helper exports must not alias the same function/iu,
  );
  assert.equal(violations, 1, "failed finalization must report one admission violation");
  assert.throws(() => host.snapshotMemory(), /host-runtime quarantine/iu,
    "the host runtime must remain quarantined after rejected admission");
});

test("hostile: callable-table wipe helper failure quarantines without retry", async () => {
  const failFirstWipe = NESTED_RET.replace(
    `(func (export "__fungi_wipe_owned")
    (global.set $wipe_calls (i32.add (global.get $wipe_calls) (i32.const 1)))
    (memory.fill (i32.const ${WAT_HEAP_BASE}) (i32.const 0)
      (i32.sub (global.get $__fungi_heap) (i32.const ${WAT_HEAP_BASE})))
    (global.set $__fungi_heap (i32.const ${WAT_HEAP_BASE})))`,
    `(func (export "__fungi_wipe_owned")
    (global.set $wipe_calls (i32.add (global.get $wipe_calls) (i32.const 1)))
    (if (i32.eq (global.get $wipe_calls) (i32.const 1)) (then unreachable))
    (memory.fill (i32.const ${WAT_HEAP_BASE}) (i32.const 0)
      (i32.sub (global.get $__fungi_heap) (i32.const ${WAT_HEAP_BASE})))
    (global.set $__fungi_heap (i32.const ${WAT_HEAP_BASE})))`,
  ).replace(
    '(func (export "__fungi_wipe_owned")',
    '(func $wipe_owned (export "__fungi_wipe_owned")',
  ).replace(
    "\n)",
    '\n  (table (export "dispatch") 1 funcref)\n  (elem (i32.const 0) $wipe_owned)\n)',
  );
  const { instance } = await admitWat(failFirstWipe, createHostRuntime());

  assert.throws(() => instance.exports.dispatch.get(0)(), /trap|unreachable|CLEANUP-001/iu);
  assert.equal(instance.exports.wipe_calls.value, 1,
    "table-dispatched helper failure must not retry cleanup");
  const later = invokeAdmittedExport(instance, "h", []);
  assert.equal(later.ok, false, "a failed table-dispatched wipe must quarantine later calls");
  assert.match(later.reason, /FUNGI-WASM-QUARANTINED-001/iu);
  assert.equal(instance.exports.guest_calls.value, 0,
    "quarantine must refuse before a later guest application call");
  assert.equal(instance.exports.wipe_calls.value, 1);
});

test("positive: callable-table wipe helper uses exactly-once helper behavior", async () => {
  const tableWat = NESTED_RET.replace(
    '(func (export "__fungi_wipe_owned")',
    '(func $wipe_owned (export "__fungi_wipe_owned")',
  ).replace(
    "\n)",
    '\n  (table (export "dispatch") 1 funcref)\n  (elem (i32.const 0) $wipe_owned)\n)',
  );
  const { instance } = await admitWat(tableWat, createHostRuntime());

  instance.exports.dispatch.get(0)();
  assert.equal(instance.exports.wipe_calls.value, 1,
    "table-dispatched helper should perform one cleanup attempt");
  const later = invokeAdmittedExport(instance, "h", []);
  assert.equal(later.ok, true, "successful table cleanup must not quarantine later calls");
  assert.equal(instance.exports.guest_calls.value, 1);
  assert.equal(instance.exports.wipe_calls.value, 2,
    "the later guest call owns exactly one additional cleanup attempt");
});

test("hostile: legacy return-layout copying cannot leak a field through mutable Array.push before wipe", async () => {
  const failFirstWipe = NESTED_RET.replace(
    `(func (export "__fungi_wipe_owned")
    (global.set $wipe_calls (i32.add (global.get $wipe_calls) (i32.const 1)))
    (memory.fill (i32.const ${WAT_HEAP_BASE}) (i32.const 0)
      (i32.sub (global.get $__fungi_heap) (i32.const ${WAT_HEAP_BASE})))
    (global.set $__fungi_heap (i32.const ${WAT_HEAP_BASE})))`,
    `(func (export "__fungi_wipe_owned")
    (global.set $wipe_calls (i32.add (global.get $wipe_calls) (i32.const 1)))
    (if (i32.eq (global.get $wipe_calls) (i32.const 1)) (then unreachable))
    (memory.fill (i32.const ${WAT_HEAP_BASE}) (i32.const 0)
      (i32.sub (global.get $__fungi_heap) (i32.const ${WAT_HEAP_BASE})))
    (global.set $__fungi_heap (i32.const ${WAT_HEAP_BASE})))`,
  );
  const { instance } = await admitWat(failFirstWipe, createHostRuntime(), {
    returnLayouts: { h: OUTER_LAYOUT },
  });
  const originalPush = Array.prototype.push;
  let leakedSecretField;
  Array.prototype.push = function (...items) {
    if (items.includes(7)) leakedSecretField = items[0];
    return Reflect.apply(originalPush, this, items);
  };
  try {
    assert.throws(() => instance.exports.h(), /CLEANUP-001|trap/iu);
  } finally {
    Array.prototype.push = originalPush;
  }
  assert.equal(leakedSecretField, undefined,
    "a failed wipe must not leave a copied secret field retained by a replaced intrinsic");
});

test("hostile: legacy nested-copy descriptors cannot leak fields through inherited accessors", async () => {
  const { instance } = await admitWat(NESTED_RET, createHostRuntime(), {
    returnLayouts: { h: OUTER_LAYOUT },
  });
  const observed = observeInheritedDescriptorGetter(7, () => invokeAdmittedExport(instance, "h", []));
  assert.equal(observed.leaked, undefined,
    "legacy record and frozen-row descriptors must not dispatch through Object.prototype.get");
  assert.deepEqual(observed.result, { ok: true, result: [[7], 99] },
    "a prototype-free copy descriptor should preserve the owned result without invoking inherited accessors");
  assert.equal(instance.exports.wipe_calls.value, 1, "successful copy must attempt cleanup once");
});

test("hostile: flat-word copy descriptors cannot leak fields through inherited accessors", async () => {
  const flatWordSecret = NESTED_RET.replace(
    `(i32.const ${WAT_HEAP_BASE + 4}))`,
    `(i32.const ${WAT_HEAP_BASE}))`,
  );
  const { instance } = await admitWat(flatWordSecret, createHostRuntime());
  const observed = observeInheritedDescriptorGetter(7, () => invokeAdmittedExport(instance, "h", []));
  assert.equal(observed.leaked, undefined,
    "flat-word descriptors must not dispatch through Object.prototype.get");
  assert.deepEqual(observed.result, { ok: true, result: [7, WAT_HEAP_BASE] },
    "prototype-free flat-word descriptors should preserve the copied words without accessor dispatch");
  assert.equal(instance.exports.wipe_calls.value, 1, "successful copy must attempt cleanup once");
});

test("hostile: signed owned-return descriptors cannot leak fields through inherited accessors", async () => {
  const host = createHostRuntime();
  const asm = await L.assembleWAT(TRANSITIVE_HOST_RESULT);
  assert.ok(asm.valid, `assemble: ${(asm.diagnostics ?? []).map((d) => d.message).join("; ")}`);
  const schema = JSON.stringify({
    version: 1,
    exports: {
      run: {
        kind: "result",
        ok: {
          kind: "array",
          element: { kind: "record", fields: [{ kind: "i32" }, { kind: "i32" }] },
        },
        err: { kind: "i32" },
      },
    },
  });
  const wasm = appendCustomSection(asm.wasm, "fungi.owned-returns.v1", schema);
  const { instance } = await admitBytes(wasm, host, { requireOwnedReturnSchemas: true });
  const observed = observeInheritedDescriptorGetter(7, () => instance.exports.run());
  assert.equal(observed.leaked, undefined,
    "owned-return record descriptors must not dispatch through Object.prototype.get");
  assert.deepEqual(observed.result, { tag: "ok", value: [[7, 42]] },
    "prototype-free signed owned-return descriptors should preserve the authorized owned result");
  assert.equal(observed.thrown, undefined);
  assert.deepEqual(Array.from(hostWords(host).slice(WAT_HEAP_BASE >>> 2, (WAT_HEAP_BASE >>> 2) + 2)), [0, 0],
    "the successfully copied owned result attempts to wipe the guest-owned record");
});

test("hostile: inherited descriptor getter cannot capture a container-valued secret copy", async () => {
  const { instance } = await admitWat(NESTED_RET, createHostRuntime(), {
    returnLayouts: { h: OUTER_LAYOUT },
  });
  const observed = observeInheritedDescriptorContainerGetter(() => instance.exports.h());

  assert.deepEqual(observed.leakedContainers, [],
    "container-valued copied fields must not pass through inherited descriptor getters");
  assert.deepEqual(observed.result, [[7], 99]);
  assert.equal(observed.thrown, undefined);
  assert.equal(instance.exports.wipe_calls.value, 1);
});

test("hostile: inherited descriptor value setter cannot capture a copied secret", async () => {
  const { instance } = await admitWat(NESTED_RET, createHostRuntime(), {
    returnLayouts: { h: OUTER_LAYOUT },
  });
  const observed = observeInheritedDescriptorValueSetter(7, () => instance.exports.h());

  assert.equal(observed.leaked, undefined,
    "own descriptor fields must not dispatch through Object.prototype.value setters");
  assert.deepEqual(observed.result, [[7], 99]);
  assert.equal(observed.thrown, undefined);
  assert.equal(instance.exports.wipe_calls.value, 1);
});

test("hostile: inherited descriptor accessor cannot observe copied secret when cleanup fails", async () => {
  const failFirstWipe = NESTED_RET.replace(
    `(func (export "__fungi_wipe_owned")
    (global.set $wipe_calls (i32.add (global.get $wipe_calls) (i32.const 1)))
    (memory.fill (i32.const ${WAT_HEAP_BASE}) (i32.const 0)
      (i32.sub (global.get $__fungi_heap) (i32.const ${WAT_HEAP_BASE})))
    (global.set $__fungi_heap (i32.const ${WAT_HEAP_BASE})))`,
    `(func (export "__fungi_wipe_owned")
    (global.set $wipe_calls (i32.add (global.get $wipe_calls) (i32.const 1)))
    (if (i32.eq (global.get $wipe_calls) (i32.const 1)) (then unreachable))
    (memory.fill (i32.const ${WAT_HEAP_BASE}) (i32.const 0)
      (i32.sub (global.get $__fungi_heap) (i32.const ${WAT_HEAP_BASE})))
    (global.set $__fungi_heap (i32.const ${WAT_HEAP_BASE})))`,
  );
  const { instance } = await admitWat(failFirstWipe, createHostRuntime(), {
    returnLayouts: { h: OUTER_LAYOUT },
  });

  const observed = observeInheritedDescriptorGetter(7, () => instance.exports.h());
  assert.equal(observed.leaked, undefined,
    "failed cleanup must not expose the pre-wipe copied value through descriptor lookup");
  assert.match(String(observed.thrown), /CLEANUP-001|trap/iu);
  assert.equal(instance.exports.wipe_calls.value, 1);
});

test("hostile: replacing Object.create after admission cannot observe copied secrets", async () => {
  const { instance } = await admitWat(NESTED_RET, createHostRuntime(), {
    returnLayouts: { h: OUTER_LAYOUT },
  });
  const originalCreate = Object.create;
  let intercepted = false;
  let result;
  try {
    Object.create = function (...args) {
      intercepted = true;
      return Reflect.apply(originalCreate, this, args);
    };
    result = instance.exports.h();
  } finally {
    Object.create = originalCreate;
  }

  assert.equal(intercepted, false,
    "secret-copy descriptors must use the captured Object.create intrinsic after admission");
  assert.deepEqual(result, [[7], 99]);
  assert.equal(instance.exports.wipe_calls.value, 1);
});

test("strict admission refuses a module without attested owned-return metadata before instantiation", async () => {
  const asm = await L.assembleWAT(TRANSITIVE_HOST_RESULT);
  assert.ok(asm.valid, `assemble: ${(asm.diagnostics ?? []).map((d) => d.message).join("; ")}`);
  const originalInstantiate = WebAssembly.instantiate;
  let calls = 0;
  WebAssembly.instantiate = async function (...args) {
    calls += 1;
    return originalInstantiate.apply(WebAssembly, args);
  };
  try {
    await assert.rejects(
      admitBytes(asm.wasm, createHostRuntime(), { requireOwnedReturnSchemas: true }),
      /requires attested owned-return metadata/,
    );
    assert.equal(calls, 0, "missing result authority must be rejected before guest instantiation");
  } finally {
    WebAssembly.instantiate = originalInstantiate;
  }
});

test("hostile: strict owned-return metadata cannot be admitted by hash-only policy", async () => {
  const asm = await L.assembleWAT(TRANSITIVE_HOST_RESULT);
  assert.ok(asm.valid, `assemble: ${(asm.diagnostics ?? []).map((d) => d.message).join("; ")}`);
  const schema = JSON.stringify({
    version: 1,
    exports: {
      run: {
        kind: "result",
        ok: { kind: "array", element: { kind: "record", fields: [{ kind: "i32" }, { kind: "i32" }] } },
        err: { kind: "i32" },
      },
    },
  });
  const wasm = appendCustomSection(asm.wasm, "fungi.owned-returns.v1", schema);
  await assert.rejects(admitAndInstantiate({
    wasm,
    attestation: { sha256: wasmHash(wasm), profile: "dev" },
    policy: { requireSigned: false },
    host: createHostRuntime(),
    requireOwnedReturnSchemas: true,
  }), /signature required|public key configured/);
});

test("hostile: strict owned-return policy is captured before asynchronous compilation", async () => {
  const asm = await L.assembleWAT(TRANSITIVE_HOST_RESULT);
  assert.ok(asm.valid, `assemble: ${(asm.diagnostics ?? []).map((d) => d.message).join("; ")}`);
  const { publicKeyPem, privateKeyPem } = generateRunnerKeypair();
  const attestation = signWasm(asm.wasm, privateKeyPem, "dev");
  let policyReads = 0;
  const options = {
    wasm: asm.wasm,
    attestation,
    policy: { requireSigned: true, publicKeyPem },
    host: createHostRuntime(),
  };
  Object.defineProperty(options, "requireOwnedReturnSchemas", {
    enumerable: true,
    get() {
      policyReads += 1;
      return policyReads === 1;
    },
  });
  await assert.rejects(admitAndInstantiate(options), /requires attested owned-return metadata/);
  assert.equal(policyReads, 1, "mutable caller policy must be captured exactly once before compilation yields");
});

test("hostile: duplicate owned-return metadata refuses admission", async () => {
  const asm = await L.assembleWAT(TRANSITIVE_HOST_RESULT);
  assert.ok(asm.valid, `assemble: ${(asm.diagnostics ?? []).map((d) => d.message).join("; ")}`);
  const schema = JSON.stringify({ version: 1, exports: { run: { kind: "i32" } } });
  const once = appendCustomSection(asm.wasm, "fungi.owned-returns.v1", schema);
  const duplicate = appendCustomSection(once, "fungi.owned-returns.v1", schema);
  await assert.rejects(admitBytes(duplicate, createHostRuntime()), /duplicate metadata sections/);
});

test("hostile: duplicate JSON members in owned-return metadata refuse admission", async () => {
  const asm = await L.assembleWAT(TRANSITIVE_HOST_RESULT);
  assert.ok(asm.valid, `assemble: ${(asm.diagnostics ?? []).map((d) => d.message).join("; ")}`);
  const ambiguous = '{"version":1,"exports":{"run":{"kind":"result","ok":{"kind":"array","element":{"kind":"record","fields":[{"kind":"i32"},{"kind":"i32"}]}},"err":{"kind":"i32"}}},"exports":{"run":{"kind":"i32"}}}';
  const wasm = appendCustomSection(asm.wasm, "fungi.owned-returns.v1", ambiguous);
  await assert.rejects(
    admitBytes(wasm, createHostRuntime(), { requireOwnedReturnSchemas: true }),
    /canonical JSON/,
    "duplicate members must not let the verifier and consumer resolve different return schemas",
  );
});

test("hostile: invalid nested record pointer refuses the result and still wipes guest bytes", async () => {
  const badPointerWat = TRANSITIVE_HOST_RESULT.replace(
    `(call $array_append (local.get $array) (i32.const ${WAT_HEAP_BASE}))`,
    "(call $array_append (local.get $array) (i32.const 0))",
  );
  const host = createHostRuntime();
  const asm = await L.assembleWAT(badPointerWat);
  assert.ok(asm.valid, `assemble: ${(asm.diagnostics ?? []).map((d) => d.message).join("; ")}`);
  const schema = JSON.stringify({
    version: 1,
    exports: {
      run: {
        kind: "result",
        ok: { kind: "array", element: { kind: "record", fields: [{ kind: "i32" }, { kind: "i32" }] } },
        err: { kind: "i32" },
      },
    },
  });
  const wasm = appendCustomSection(asm.wasm, "fungi.owned-returns.v1", schema);
  const { instance } = await admitBytes(wasm, host);
  assert.throws(() => instance.exports.run(), /record pointer is not aligned inside the guest heap/);
  assert.deepEqual(
    Array.from(hostWords(host).slice(WAT_HEAP_BASE >>> 2, (WAT_HEAP_BASE >>> 2) + 2)),
    [0, 0],
    "failed nested copies must still wipe the guest-owned range",
  );
});

test("hostile: owned result is never published when its cleanup attempt fails", async () => {
  const failedWipeWat = TRANSITIVE_HOST_RESULT.replace(
    `(memory.fill (i32.const ${WAT_HEAP_BASE}) (i32.const 0)
      (i32.sub (global.get $__fungi_heap) (i32.const ${WAT_HEAP_BASE})))
    (global.set $__fungi_heap (i32.const ${WAT_HEAP_BASE}))`,
    "unreachable",
  );
  const asm = await L.assembleWAT(failedWipeWat);
  assert.ok(asm.valid, `assemble: ${(asm.diagnostics ?? []).map((d) => d.message).join("; ")}`);
  const schema = JSON.stringify({
    version: 1,
    exports: {
      run: {
        kind: "result",
        ok: { kind: "array", element: { kind: "record", fields: [{ kind: "i32" }, { kind: "i32" }] } },
        err: { kind: "i32" },
      },
    },
  });
  const wasm = appendCustomSection(asm.wasm, "fungi.owned-returns.v1", schema);
  const { instance } = await admitBytes(wasm, createHostRuntime());
  assert.throws(() => instance.exports.run(), /unreachable|trap/,
    "the copied candidate must not be returned when wipe fails");
  assert.throws(() => instance.exports.run(), /QUARANTINED|quarantined/,
    "cleanup failure must quarantine future calls before guest execution");
});

test("hostile: strict owned-return admission refuses an exported callable table", async () => {
  const tableWat = TRANSITIVE_HOST_RESULT.replace(
    '(func (export "run")',
    '(func $run (export "run")',
  ).replace(
    "\n)",
    '\n  (table (export "dispatch") 1 funcref)\n  (elem (i32.const 0) $run)\n)',
  );
  const asm = await L.assembleWAT(tableWat);
  assert.ok(asm.valid, `assemble: ${(asm.diagnostics ?? []).map((d) => d.message).join("; ")}`);
  const schema = JSON.stringify({
    version: 1,
    exports: {
      run: {
        kind: "result",
        ok: { kind: "array", element: { kind: "record", fields: [{ kind: "i32" }, { kind: "i32" }] } },
        err: { kind: "i32" },
      },
    },
  });
  const wasm = appendCustomSection(asm.wasm, "fungi.owned-returns.v1", schema);
  await assert.rejects(
    admitBytes(wasm, createHostRuntime(), { requireOwnedReturnSchemas: true }),
    /exported callable table/,
    "strict owned-return schemas cannot cover a table callable outside the named-export wrapper",
  );
});

test("hostile: synchronous invocation refuses metadata it cannot finalize safely", async () => {
  const asm = await L.assembleWAT(TRANSITIVE_HOST_RESULT);
  assert.ok(asm.valid, `assemble: ${(asm.diagnostics ?? []).map((d) => d.message).join("; ")}`);
  const schema = JSON.stringify({
    version: 1,
    exports: {
      run: {
        kind: "result",
        ok: { kind: "array", element: { kind: "record", fields: [{ kind: "i32" }, { kind: "i32" }] } },
        err: { kind: "i32" },
      },
    },
  });
  const wasm = appendCustomSection(asm.wasm, "fungi.owned-returns.v1", schema);
  const { publicKeyPem, privateKeyPem } = generateRunnerKeypair();
  const attestation = signWasm(wasm, privateKeyPem, "dev");
  const authority = createWasmInvocationAuthority({ requireSigned: true, publicKeyPem });
  const permit = authority.prepare({
    wasm,
    attestation,
    artifactSha256: wasmHash(wasm),
    exportName: "run",
    args: [],
  });
  assert.equal(permit, false,
    "the synchronous route must refuse an owned return until it applies the same copy-before-wipe finalizer");
});

test("hostile: mutable Array.map cannot leak an owned return before failed cleanup", async () => {
  const failedWipeWat = TRANSITIVE_HOST_RESULT.replace(
    `(memory.fill (i32.const ${WAT_HEAP_BASE}) (i32.const 0)
      (i32.sub (global.get $__fungi_heap) (i32.const ${WAT_HEAP_BASE})))
    (global.set $__fungi_heap (i32.const ${WAT_HEAP_BASE}))`,
    "unreachable",
  );
  const asm = await L.assembleWAT(failedWipeWat);
  assert.ok(asm.valid, `assemble: ${(asm.diagnostics ?? []).map((d) => d.message).join("; ")}`);
  const schema = JSON.stringify({
    version: 1,
    exports: {
      run: {
        kind: "result",
        ok: { kind: "array", element: { kind: "record", fields: [{ kind: "i32" }, { kind: "i32" }] } },
        err: { kind: "i32" },
      },
    },
  });
  const wasm = appendCustomSection(asm.wasm, "fungi.owned-returns.v1", schema);
  const { instance } = await admitBytes(wasm, createHostRuntime());

  const originalMap = Array.prototype.map;
  let escaped;
  Array.prototype.map = function (callback, receiver) {
    const copied = Reflect.apply(originalMap, this, [callback, receiver]);
    if (copied.length === 2 && copied[0] === 7 && copied[1] === 42) escaped = copied;
    return copied;
  };
  try {
    assert.throws(() => instance.exports.run(), /unreachable|trap/);
    assert.equal(escaped, undefined,
      "the candidate result must not be observable through replaceable array dispatch before wipe success");
  } finally {
    Array.prototype.map = originalMap;
  }
});

test("hostile: mutable Object.freeze cannot observe an owned return before failed cleanup", async () => {
  const failedWipeWat = TRANSITIVE_HOST_RESULT.replace(
    `(memory.fill (i32.const ${WAT_HEAP_BASE}) (i32.const 0)
      (i32.sub (global.get $__fungi_heap) (i32.const ${WAT_HEAP_BASE})))
    (global.set $__fungi_heap (i32.const ${WAT_HEAP_BASE}))`,
    "unreachable",
  );
  const asm = await L.assembleWAT(failedWipeWat);
  assert.ok(asm.valid, `assemble: ${(asm.diagnostics ?? []).map((d) => d.message).join("; ")}`);
  const schema = JSON.stringify({
    version: 1,
    exports: {
      run: {
        kind: "result",
        ok: { kind: "array", element: { kind: "record", fields: [{ kind: "i32" }, { kind: "i32" }] } },
        err: { kind: "i32" },
      },
    },
  });
  const wasm = appendCustomSection(asm.wasm, "fungi.owned-returns.v1", schema);
  const { instance } = await admitBytes(wasm, createHostRuntime());

  const originalFreeze = Object.freeze;
  let escaped;
  Object.freeze = function (candidate) {
    if (Array.isArray(candidate) && candidate.length === 2 && candidate[0] === 7 && candidate[1] === 42) {
      escaped = candidate;
    }
    return Reflect.apply(originalFreeze, Object, [candidate]);
  };
  try {
    assert.throws(() => instance.exports.run(), /unreachable|trap/);
    assert.equal(escaped, undefined,
      "a replaceable freeze hook must not observe a candidate result before cleanup succeeds");
  } finally {
    Object.freeze = originalFreeze;
  }
});

test("hostile: mutable Number.isInteger cannot observe owned scalars before failed cleanup", async () => {
  const failedWipeWat = TRANSITIVE_HOST_RESULT.replace(
    `(memory.fill (i32.const ${WAT_HEAP_BASE}) (i32.const 0)
      (i32.sub (global.get $__fungi_heap) (i32.const ${WAT_HEAP_BASE})))
    (global.set $__fungi_heap (i32.const ${WAT_HEAP_BASE}))`,
    "unreachable",
  );
  const asm = await L.assembleWAT(failedWipeWat);
  assert.ok(asm.valid, `assemble: ${(asm.diagnostics ?? []).map((d) => d.message).join("; ")}`);
  const schema = JSON.stringify({
    version: 1,
    exports: {
      run: {
        kind: "result",
        ok: { kind: "array", element: { kind: "record", fields: [{ kind: "i32" }, { kind: "i32" }] } },
        err: { kind: "i32" },
      },
    },
  });
  const wasm = appendCustomSection(asm.wasm, "fungi.owned-returns.v1", schema);
  const { instance } = await admitBytes(wasm, createHostRuntime());

  const originalIsInteger = Number.isInteger;
  const observed = [];
  Number.isInteger = function (candidate) {
    if (candidate === 7 || candidate === 42) observed.push(candidate);
    return Reflect.apply(originalIsInteger, Number, [candidate]);
  };
  try {
    assert.throws(() => instance.exports.run(), /unreachable|trap/);
    assert.deepEqual(observed, [],
      "integer validation must not expose copied protected scalars before cleanup succeeds");
  } finally {
    Number.isInteger = originalIsInteger;
  }
});

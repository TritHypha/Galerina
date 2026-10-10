// Q1 hostile differential: secret-heap wipe versus the returned value.
// A G5c WAT substring ("memory.fill before (return") does not prove evaluation
// order. This file asserts WASM return values, post-exit memory, traps, nested
// calls, and heap-pointer results. The smallest 7-to-0 regression is an EARLY
// return of a heap load: G5c inserts memory.fill as a sibling before `(return`,
// so `(return (i32.load …))` zeros the record and then loads 0.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as L from "../dist/index.js";
import {
  createLowLevelWasmExecutor,
  createHostRuntime,
  generateRunnerKeypair,
  signWasm,
  admitAndInstantiate,
  invokeAdmittedExport,
  finalizeSecretExportResult,
} from "@galerina/core-runtime-wasm";

const HEAP_BASE = 1024;

// These are existing lowering lanes, not a claim of strict source admission.
// In particular f64 integral Numbers can look like addresses to the finalizer;
// i64 BigInts cannot, but must still publish this call's scalar metadata.
for (const type of ['Int', 'Int8', 'Int16', 'Int32', 'Byte', 'Bool',
  'UInt8', 'UInt16', 'UInt32', 'Float', 'Float64', 'Double', 'Float32', 'Float16', 'Int64', 'UInt64']) {
  for (const mode of ['public-only', 'sequential', 'nested']) {
    test(`Q1 scalar ABI metadata ${type} ${mode}`, async () => {
      const wide = type === 'Int64' || type === 'UInt64';
      const floating = type.startsWith('Float') || type === 'Double';
      const values = wide ? [9007199254740993n] : floating ? [2048, 128.5, -0]
        : ['Int8', 'UInt8', 'Byte'].includes(type) ? [127] : type === 'Bool' ? [1] : [2048];
      const source = `${mode === 'public-only' ? '' : `record Sec { a: Int, b: Int }
pure flow produceSecret() -> Sec
contract { intent { "metadata producer" } privacy { contains PII } }
{ return Sec { a: 7, b: 9 } }`}
pure flow scalar(x: ${type}) -> ${type}
contract { intent { "scalar metadata ownership" } }
{ ${mode === 'nested' ? 'let inner: Sec = produceSecret()' : ''} return x }`;
      const parsed = L.parseProgram(source, 'scalar-abi-metadata.fungi');
      assert.deepEqual(parsed.diagnostics.filter(d => d.severity === 'error'), []);
      assert.deepEqual(L.checkTypes(parsed.ast).diagnostics.filter(d => d.severity === 'error'), []);
      const { instance } = await build(source, 'scalar-abi-metadata.fungi', module => {
        assert.deepEqual(module.functions.find(fn => fn.name === 'scalar').type.results,
          [wide ? 'i64' : floating ? 'f64' : 'i32']);
        return module;
      });
      for (const value of values) {
        if (mode !== 'public-only') {
          const pointer = instance.exports.produceSecret();
          assert.equal(instance.exports.__fungi_ret_is_heap_get(), 1, 'record must remain a pointer');
          assert.deepEqual(finalizeSecretExportResult(instance, pointer), [7, 9]);
        }
        const raw = instance.exports.scalar(value);
        assert.equal(typeof raw, wide ? 'bigint' : 'number');
        assert.equal(raw, value, 'raw Wasm result must preserve exact scalar value');
        const tag = instance.exports.__fungi_ret_is_heap_get?.();
        assert.equal(finalizeSecretExportResult(instance, raw), value, 'finalization must not decode a scalar as a record');
        if (mode !== 'public-only') assert.equal(tag, 0, 'completed scalar owns metadata even for BigInt');
      }
    });
  }
}

for (const type of ['UInt8', 'UInt16', 'UInt32', 'Float', 'Float32', 'Int64', 'UInt64']) {
  test(`Q1 secret scalar ${type} early return preserves its ABI value`, async () => {
    const value = type.endsWith('64') ? 9007199254740993n : type === 'UInt8' ? 127 : 2048;
    const source = `record Pair { a: Int, b: Int }
pure flow scalar(x: ${type}, early: Bool) -> ${type}
contract { intent { "secret scalar early return" } privacy { contains PII } }
{ let pair: Pair = Pair { a: 7, b: 9 }
  if early { return x }
  return x }`;
    const parsed = L.parseProgram(source, 'scalar-early.fungi');
    assert.deepEqual(parsed.diagnostics.filter(d => d.severity === 'error'), []);
    assert.deepEqual(L.checkTypes(parsed.ast).diagnostics.filter(d => d.severity === 'error'), []);
    const { instance } = await build(source, 'scalar-early.fungi');
    for (const early of [0, 1]) {
      const raw = instance.exports.scalar(value, early);
      assert.equal(raw, value);
      assert.equal(instance.exports.__fungi_ret_is_heap_get(), 0);
      assert.equal(finalizeSecretExportResult(instance, raw), value);
      assert.ok(new Uint8Array(instance.exports.memory.buffer, HEAP_BASE, 8).every(b => b === 0));
    }
  });
}

// A flat record can still need packing: the Int64 field introduces padding.
// Literal expected words are independent of the emitter's layout plan. This
// covers bootstrap/Wasm behavior, not protected-host or full RD acceptance.
for (const early of [false, true]) {
  test(`Q1 padded Int/Int64/Int return preserves all fields before cleanup; early=${early}`, async () => {
    const source = `record Wide { tag: Int, count: Int64, tail: Int }
pure flow h(tag: Int, count: Int64, tail: Int) -> Wide
contract { intent { "padded return regression" } privacy { contains PII } }
{
  let value: Wide = Wide { tag: tag, count: count, tail: tail }
  ${early ? 'if tag > 0 { return value }' : ''}
  return value
}`;
    const parsed = L.parseProgram(source, "padded-return.fungi");
    assert.deepEqual(parsed.diagnostics.filter(d => d.severity === "error"), []);
    assert.equal(parsed.flows.length, 1);
    const { instance } = await build(source, "padded-return.fungi");
    const pointer = instance.exports.h(7, 0x1122334455667788n, 9);
    assert.deepEqual(finalizeSecretExportResult(instance, pointer),
      [7, 0x55667788, 0x11223344, 9]);
    const bytes = new Uint8Array(instance.exports.memory.buffer);
    assert.ok(bytes.subarray(HEAP_BASE, HEAP_BASE + 40).every(byte => byte === 0),
      "original padded record and packed owned result must be wiped after copy");
  });
}

async function build(src, filename = "q1.fungi", transformModule = module => module) {
  const prog = L.parseProgram(src, filename);
  const errs = (prog.diagnostics ?? []).filter((d) => d.severity === "error");
  assert.equal(errs.length, 0, `parse errors: ${errs.map((d) => d.message).join("; ")}`);
  const fx = L.checkEffects(prog.flows, prog.ast);
  const { gir } = L.emitGIR(prog.ast, prog.flows, fx);
  const wat = L.renderWAT(transformModule(L.buildWATModuleFromGIR(gir, undefined, "wasm-standalone", prog.ast, true)));
  const asm = await L.assembleWAT(wat);
  assert.ok(asm.valid, `must assemble: ${asm.valid ? "" : asm.diagnostics.map((d) => d.message).join("; ")}`);
  const { instance } = await WebAssembly.instantiate(asm.wasm);
  return { wat, instance, wasm: asm.wasm, memory: new Int32Array(instance.exports.memory.buffer) };
}

for (const packed of [true, false]) {
test(`Q1 ${packed ? "packed" : "null-result"} reservation guards the i32 watermark at a simulated 4-GiB ceiling`, async () => {
  const src = packed ? `record Node { n: Int, child: Node }
pure flow h() -> Node
contract { intent { "q1 wasm32 address ceiling" } privacy { contains PII } }
{ return Node { n: 73, child: Node { n: 2, child: Node { n: 3 } } } }
` : `record Triple { a: Int, b: Int, c: Int }
pure flow h() -> Triple
contract { intent { "q1 null reservation ceiling" } privacy { contains PII } }
{ return Triple { a: 1, b: 2, c: 3 } }`;
  const prog = L.parseProgram(src, "q1-wasm32-address-ceiling.fungi");
  const errors = (prog.diagnostics ?? []).filter((d) => d.severity === "error");
  assert.equal(errors.length, 0, `parse errors: ${errors.map((d) => d.message).join("; ")}`);
  const effects = L.checkEffects(prog.flows, prog.ast);
  const { gir } = L.emitGIR(prog.ast, prog.flows, effects);
  const module = L.buildWATModuleFromGIR(gir, undefined, "wasm-standalone", prog.ast, true);
  const wat = L.renderWAT({ ...module, memory: { minPages: 2, maxPages: 65_536 } });

  assert.ok(wat.includes("(memory 2 65536)"), "exercise the full wasm32 page-count ceiling without allocating 4 GiB");
  const capacityGuard = wat.indexOf("(i64.gt_u (i64.add (i64.extend_i32_u (local.get $__fungi_flat))");
  const representableEndGuard = wat.indexOf("(i64.gt_u (i64.add (i64.extend_i32_u (local.get $__fungi_flat)) (i64.const 12)) (i64.const 4294967295))");
  const reserve = wat.indexOf("(global.set $__fungi_heap (i32.add (local.get $__fungi_flat)");
  const refusingRepresentabilityGuard = /\(if \(i64\.gt_u \(i64\.add \(i64\.extend_i32_u \(local\.get \$__fungi_flat\)\) \(i64\.const 12\)\) \(i64\.const 4294967295\)\)\s*\(then unreachable\)\s*\)/g;
  assert.equal(wat.match(refusingRepresentabilityGuard)?.length, 1,
    "an unrepresentable i32 cleanup watermark must trap before reservation, not merely emit a comparison");
  assert.ok(capacityGuard >= 0 && representableEndGuard > capacityGuard && reserve > representableEndGuard,
    `the exclusive reservation end must fit the i32 cleanup watermark before ownership is advanced (capacity=${capacityGuard}, representable=${representableEndGuard}, reserve=${reserve}, guard=${wat.match(/i64\.const 4294967295/g)?.join(",") ?? "none"})`);

  const extractGuard = (marker, from = 0) => {
    const markerAt = wat.indexOf(marker, from);
    assert.notEqual(markerAt, -1, `generated WAT must contain guard marker ${marker}`);
    const guardStart = wat.lastIndexOf("(if ", markerAt);
    let depth = 0;
    for (let i = guardStart; i < wat.length; i += 1) {
      if (wat[i] === "(") depth += 1;
      else if (wat[i] === ")") {
        depth -= 1;
        if (depth === 0) return wat.slice(guardStart, i + 1);
      }
    }
    assert.fail(`generated guard is not a balanced WAT expression: ${marker}`);
  };
  const capacityIf = extractGuard("(i64.shl (i64.extend_i32_u (memory.size)) (i64.const 16))");
  const watermarkIf = extractGuard("(i64.const 4294967295)", representableEndGuard);
  const probeGuard = (guard) => guard
    .replaceAll("(local.get $__fungi_flat)", "(local.get $flat)")
    .replaceAll("(memory.size)", "(local.get $pages)");
  const probeWat = `(module
    (memory 1)
    (global $watermark (mut i32) (i32.const 1024))
    (func (export "probe") (param $flat i32) (param $pages i32) (result i32)
      ${probeGuard(capacityIf)}
      ${probeGuard(watermarkIf)}
      (global.set $watermark (i32.add (local.get $flat) (i32.const 12)))
      (i32.const 1))
    (export "watermark" (global $watermark)))`;
  const probeAssembly = await L.assembleWAT(probeWat);
  assert.ok(probeAssembly.valid, `boundary probe must assemble: ${probeAssembly.diagnostics.map((d) => d.message).join("; ")}`);
  const { instance } = await WebAssembly.instantiate(probeAssembly.wasm);

  assert.equal(instance.exports.probe(0xfffffff0, 65_536), 1,
    "the highest aligned 12-byte extent ending at 0xfffffffc remains representable");
  assert.equal(instance.exports.watermark.value >>> 0, 0xffff_fffc);

  const wrapProbe = await WebAssembly.instantiate(probeAssembly.wasm);
  assert.throws(() => wrapProbe.instance.exports.probe(0xfffffff4, 65_536), WebAssembly.RuntimeError,
    "a 12-byte extent ending at 2^32 must refuse even when simulated memory capacity is exactly 4 GiB");
  assert.equal(wrapProbe.instance.exports.watermark.value >>> 0, 1024,
    "refusal at the wrap boundary must precede watermark mutation");

  const capacityProbe = await WebAssembly.instantiate(probeAssembly.wasm);
  assert.throws(() => capacityProbe.instance.exports.probe(65_528, 1), WebAssembly.RuntimeError,
    "an extent one 12-byte allocation past one-page capacity must refuse");
  assert.equal(capacityProbe.instance.exports.watermark.value >>> 0, 1024,
    "capacity refusal must precede watermark mutation");

  const exactCapacityProbe = await WebAssembly.instantiate(probeAssembly.wasm);
  assert.equal(exactCapacityProbe.instance.exports.probe(65_524, 1), 1,
    "an extent ending exactly at one-page capacity remains valid");
  assert.equal(exactCapacityProbe.instance.exports.watermark.value >>> 0, 65_536,
    "the exact-fit extent records its representable exclusive end");
});
}

// Inject only a producer body to reach exact allocator states without a giant
// allocation. The return adapter, guards, Wasm memory and runtime cleanup are real;
// these low-level fixtures are not public typechecked-program admission evidence.
for (const start of [65_524, 65_528]) {
  test(`Q1 null-result reservation uses actual one-page memory; start=${start}`, async () => {
    const source = `record Triple { a: Int, b: Int, c: Int }
pure flow h() -> Triple
contract { intent { "null-result boundary" } privacy { contains PII } }
{ return Triple { a: 1, b: 2, c: 3 } }`;
    const { instance } = await build(source, "null-reservation.fungi", module => ({
      ...module, memory:{minPages:1,maxPages:1},
      functions:module.functions.map(fn => ({...fn,
        body:`(global.set $__fungi_heap (i32.const ${start}))\n(i32.const 0)`,
      })),
    }));
    const bytes = new Uint8Array(instance.exports.memory.buffer);
    bytes.fill(0x5a, HEAP_BASE);
    bytes[HEAP_BASE - 1] = 0x31;
    const result = invokeAdmittedExport(instance, "h", []);
    assert.equal(result.ok, start === 65_524);
    const end = start === 65_524 ? 65_536 : start;
    if (result.ok) assert.deepEqual(result.result, [0,0,0]);
    else assert.match(result.reason, /trap during 'h':.*unreachable/);
    assert.equal(instance.exports.__fungi_heap_get() >>> 0, end);
    assert.ok(bytes.subarray(HEAP_BASE, end).every(byte => byte === 0));
    assert.ok(bytes.subarray(end).every(byte => byte === 0x5a), "unowned tail remains intact");
    assert.equal(bytes[HEAP_BASE - 1], 0x31);
  });
}

for (const start of [65_528, 65_532]) {
  test(`Q1 packed reservation uses actual one-page memory; start=${start}`, async () => {
    const source = `record Cell { n: Int }
record Outer { inner: Cell, tail: Int }
pure flow h() -> Outer
contract { intent { "packed boundary" } privacy { contains PII } }
{ return Outer { inner: Cell { n: 7 }, tail: 9 } }`;
    const { instance } = await build(source, "packed-reservation.fungi", module => ({
      ...module, memory:{minPages:1,maxPages:1},
      functions:module.functions.map(fn => ({...fn,
        body:`(i32.store (i32.const 1024) (i32.const 1032))
(i32.store (i32.const 1028) (i32.const 9))
(i32.store (i32.const 1032) (i32.const 7))
(global.set $__fungi_heap (i32.const ${start}))
(i32.const 1024)`,
      })),
    }));
    const bytes = new Uint8Array(instance.exports.memory.buffer);
    bytes.fill(0x5a, HEAP_BASE);
    bytes[HEAP_BASE - 1] = 0x31;
    const result = invokeAdmittedExport(instance, "h", []);
    assert.equal(result.ok, start === 65_528);
    const end = start === 65_528 ? 65_536 : start;
    assert.equal(instance.exports.__fungi_heap_get() >>> 0, end);
    assert.ok(bytes.subarray(HEAP_BASE, end).every(byte => byte === 0));
    assert.ok(bytes.subarray(end).every(byte => byte === 0x5a), "no unreserved partial secret write");
    assert.equal(bytes[HEAP_BASE - 1], 0x31);
    if (result.ok) assert.deepEqual(result.result, [7,9]);
    else assert.match(result.reason, /trap during 'h':.*unreachable/);
  });
}

test("Q1 exact Int64 local recognition does not match an i32 name substring", async () => {
  const source = `pure flow narrow(x: Int) -> Int64
contract { intent { "exact local width" } }
{ let prefix_a: Int64 = 9007199254740993 let a: Int = x if x > 0 { return a } return prefix_a }
pure flow wide(x: Int64) -> Int64
contract { intent { "wide local twin" } }
{ let a: Int64 = x if x > 0 { return a } return a }`;
  const { instance } = await build(source, "exact-i64-local.fungi");
  assert.equal(instance.exports.narrow(7), 7n);
  assert.equal(instance.exports.narrow(-1), 9007199254740993n);
  assert.equal(instance.exports.wide(9007199254740993n), 9007199254740993n);
});

const EARLY_HEAP = (privacy) => `record Wide { a: Int, b: Int, c: Int }
pure flow g(s: Int) -> Int
contract { intent { "q1 early heap scalar" }${privacy ? " privacy { contains PII }" : ""} }
{ let w: Wide = Wide { a: s, b: s, c: s } if s <= 10 { return w.a } return 1 }
`;

test("Q1 smallest 7-to-0: secret EARLY return of a heap load preserves 7", async () => {
  const { wat, instance, memory } = await build(EARLY_HEAP(true));
  assert.ok(wat.includes("G5c capture-then-wipe"),
    "this case is the G5c early-return path (substring is setup, not the oracle)");
  const got = instance.exports.g(7);
  assert.equal(memory[HEAP_BASE / 4], 0, "secret word @1024 must be zero after the call");
  assert.equal(memory[HEAP_BASE / 4 + 1], 0, "secret word @1028 must be zero after the call");
  assert.equal(memory[HEAP_BASE / 4 + 2], 0, "secret word @1032 must be zero after the call");
  assert.equal(got, 7,
    `g(7) must return w.a=7; G5c wipe-before-operand currently returns ${got}`);
});

test("Q1 control: identical NON-secret early heap return still returns 7", async () => {
  const { wat, instance } = await build(EARLY_HEAP(false));
  assert.equal(wat.includes("G5c secret-wipe before early return"), false);
  assert.equal(instance.exports.g(7), 7);
  assert.equal(instance.exports.g(11), 1);
});

test("Q1 mixed-body fall-through heap load returns 7 and zeros the arena", async () => {
  const src = `record Wide { a: Int, b: Int, c: Int }
pure flow g(s: Int) -> Int
contract { intent { "q1 fallthrough" } privacy { contains PII } }
{ let w: Wide = Wide { a: s, b: s, c: s } if s > 10 { return 1 } return w.a }
`;
  const { wat, instance, memory } = await build(src);
  assert.ok(wat.includes("G5c capture-then-wipe") || wat.includes("$__fungi_xl"),
    "mixed bodies wipe on the early-return path and on the fall-through tail");
  assert.equal(instance.exports.g(7), 7);
  assert.equal(memory[HEAP_BASE / 4], 0);
  assert.equal(memory[HEAP_BASE / 4 + 1], 0);
  assert.equal(memory[HEAP_BASE / 4 + 2], 0);
  assert.equal(instance.exports.g(11), 1);
});

test("Q1 constant early return is not heap-derived and stays 1", async () => {
  const { instance } = await build(EARLY_HEAP(true));
  assert.equal(instance.exports.g(11), 1);
});

test("Q1 nested branches: every early heap return preserves the stored field", async () => {
  const src = `record Wide { a: Int, b: Int, c: Int }
pure flow g(s: Int) -> Int
contract { intent { "q1 nested" } privacy { contains PII } }
{ let w: Wide = Wide { a: s, b: s, c: s }
  if s < 100 {
    if s <= 10 { return w.b }
    return w.c
  }
  return 1
}
`;
  const { instance } = await build(src);
  assert.equal(instance.exports.g(7), 7, "nested early return of w.b at s=7");
  assert.equal(instance.exports.g(11), 11, "nested early return of w.c at s=11");
});

test("Q1 multiple returns: each heap-derived early return preserves its field", async () => {
  const src = `record Wide { a: Int, b: Int, c: Int }
pure flow g(s: Int) -> Int
contract { intent { "q1 multi" } privacy { contains PII } }
{ let w: Wide = Wide { a: s, b: 3, c: 9 } if s < 0 { return w.c } if s <= 10 { return w.a } return w.b }
`;
  const { instance } = await build(src);
  assert.equal(instance.exports.g(7), 7, "second early return is w.a");
  assert.equal(instance.exports.g(11), 3, "fall-through last expression is w.b");
});

test("Q1 return-expression call still sees the heap operand", async () => {
  const src = `record Wide { a: Int, b: Int, c: Int }
pure flow id(x: Int) -> Int
contract { intent { "id" } }
{ return x }
pure flow g(s: Int) -> Int
contract { intent { "q1 call" } privacy { contains PII } }
{ let w: Wide = Wide { a: s, b: s, c: s } if s <= 10 { return id(w.a) } return 1 }
`;
  const { wat, instance } = await build(src);
  const callCount = (wat.match(/\(call \$id\b/g) ?? []).length;
  assert.equal(callCount, 1, "return-expression must emit exactly one call $id");
  assert.equal(instance.exports.g(7), 7, "id(w.a) must run AFTER the load, with operand 7");
});

test("Q1 emitZeroOnExit fall-through captures then zeros (correct order)", async () => {
  const src = `record Sec { a: Int, b: Int }
pure flow leak(s: Int) -> Int
contract { intent { "q1 zero-on-exit" } privacy { contains PII } }
{ let w: Sec = Sec { a: s, b: s } return w.a + w.b }
`;
  const { wat, instance, memory } = await build(src);
  assert.ok(wat.includes("$__fungi_xl"), "no WAT (return in the body → capture-then-wipe");
  const r = instance.exports.leak(7);
  assert.equal(r, 14);
  assert.equal(memory[HEAP_BASE / 4], 0);
  assert.equal(memory[HEAP_BASE / 4 + 1], 0);
});

test("Q1 trap path: invariant breach still traps; happy path must not return 0 for 7", async () => {
  const src = `record Wide { a: Int, b: Int, c: Int }
pure flow checkPos(s: Int) -> Int
contract { intent { "q1 trap" } privacy { contains PII } invariant { ensure s > 0; } }
{ let w: Wide = Wide { a: s, b: s, c: s } if s <= 10 { return w.a } return 1 }
`;
  const { instance } = await build(src);
  assert.equal(instance.exports.checkPos(7), 7, "happy path must return the heap field");
  assert.throws(() => instance.exports.checkPos(0), "ensure s > 0 is a WASM unreachable trap");
});

test("Q1 heap-pointer result must not be destroyed and called success", async () => {
  const src = `record Sec { a: Int }
pure flow h(s: Int) -> Sec
contract { intent { "q1 heap pointer" } privacy { contains PII } }
{ return Sec { a: s } }
`;
  const { wat, instance, memory } = await build(src);
  assert.equal(wat.includes("$__fungi_xl"), false,
    "heap-returning secret leaf must not zero-on-exit over the returned object");
  const ptr = instance.exports.h(7);
  assert.equal(typeof ptr, "number");
  assert.ok(ptr >= HEAP_BASE, "returned pointer must address the arena");
  assert.equal(memory[ptr / 4], 7,
    "host-readable field of a heap-pointer result must still be 7");
});

test("Q1 host cleanup after copy zeros the arena and keeps the copied field", async () => {
  const src = `record Sec { a: Int }
pure flow h(s: Int) -> Sec
contract { intent { "q1 host cleanup" } privacy { contains PII } }
{ return Sec { a: s } }
`;
  const { wat, instance, memory } = await build(src);
  assert.equal(wat.includes("$__fungi_xl"), false);
  const ptr = instance.exports.h(7);
  assert.equal(instance.exports.__fungi_heap, undefined, "the bump pointer must not be a host-writable export");
  const copied = L.copyI32ThenWipeSecretHeap(instance, ptr);
  assert.equal(copied, 7, "the host copy is independent of WASM memory");
  assert.equal(memory[ptr / 4], 0, "owned arena word is zero after guest wipe");
});

test("Q1 wasm-standalone secret fixture has no host imports — host-exception wipe is NOT VERIFIABLE here", async () => {
  const { wat } = await build(EARLY_HEAP(true));
  assert.equal((wat.match(/\(import\b/g) ?? []).length, 0,
    "this lane uses wasm-standalone without host imports; genuine host/import exceptions remain NOT VERIFIABLE");
});

test("Q1 nested secret call preserves caller allocation: outer.a + inner = 14", async () => {
  const src = `record Cell { a: Int }
pure flow inner(s: Int) -> Int
contract { intent { "inner secret" } privacy { contains PII } }
{ let w: Cell = Cell { a: s } if s <= 10 { return w.a } return 1 }
pure flow outer(s: Int) -> Int
contract { intent { "outer secret" } privacy { contains PII } }
{ let o: Cell = Cell { a: s } let x: Int = inner(s) return o.a + x }
`;
  const { instance, memory } = await build(src, "nested.fungi");
  assert.equal(instance.exports.outer(7), 14, "inner must not wipe the caller's live Cell");
  assert.equal(memory[HEAP_BASE / 4], 0);
});

test("Q1 host cleanup must not erase a sentinel above the active heap", async () => {
  const src = `record Sec { a: Int }
pure flow h(s: Int) -> Sec
contract { intent { "q1 sentinel" } privacy { contains PII } }
{ return Sec { a: s } }
`;
  const { instance, memory } = await build(src);
  const ptr = instance.exports.h(7);
  const heap = instance.exports.__fungi_heap_get();
  const sentinelAt = (Math.max(heap, HEAP_BASE) + 64) & ~3;
  memory[sentinelAt / 4] = 0x11111111;
  const copied = L.copyI32ThenWipeSecretHeap(instance, ptr);
  assert.equal(copied, 7);
  assert.equal(memory[ptr / 4], 0);
  assert.equal(memory[sentinelAt / 4], 0x11111111, "bytes past the live heap must survive host cleanup");
});

test("Q1 production executor keeps a large scalar Int instead of treating it as a pointer", async () => {
  const src = `record Cell { a: Int }
pure flow g(s: Int) -> Int
contract { intent { "q1 scalar 1024" } privacy { contains PII } }
{ let w: Cell = Cell { a: 1 } return s }
`;
  const { wasm } = await build(src);
  const r = createLowLevelWasmExecutor().instantiateAndCall({
    artifactBytes: wasm,
    exportName: "g",
    args: [1024],
  });
  assert.equal(r.ok, true);
  assert.equal(r.result, 1024, "Int 1024 after an allocation is a scalar, not a heap pointer");
});

test("Q1 production executor nested outer Int + inner Sec keeps the scalar 1024", async () => {
  const src = `record Sec { a: Int }
pure flow inner(s: Int) -> Sec
contract { intent { "inner heap" } privacy { contains PII } }
{ return Sec { a: s } }
pure flow g(s: Int) -> Int
contract { intent { "outer scalar" } privacy { contains PII } }
{ let _w: Sec = inner(s) return s }
`;
  const { wasm } = await build(src, "nested-prod-int.fungi");
  const r = createLowLevelWasmExecutor().instantiateAndCall({
    artifactBytes: wasm,
    exportName: "g",
    args: [1024],
  });
  assert.equal(r.ok, true);
  assert.equal(r.result, 1024, "inner heap return must not leave ret_is_heap set for the outer Int");
});

test("Q1 public scalar export after a secret heap export is not decoded with stale heap metadata", async () => {
  const src = `record Sec { a: Int }
pure flow secretRecord(s: Int) -> Sec
contract { intent { "secret record export" } privacy { contains PII } }
{ return Sec { a: s } }
pure flow publicScalar() -> Int
contract { intent { "public scalar export after secret record" } }
{ return 2048 }
`;
  const { instance } = await build(src, "mixed-export-return-metadata.fungi");

  const secretPointer = instance.exports.secretRecord(7);
  assert.equal(finalizeSecretExportResult(instance, secretPointer), 7);

  const scalar = instance.exports.publicScalar();
  assert.equal(finalizeSecretExportResult(instance, scalar), 2048,
    "a later public scalar export must not inherit a previous export's heap-result tag");
});

test("Q1 public scalar export clears heap metadata set by a nested secret record call", async () => {
  const src = `record Sec { a: Int }
pure flow secretRecord(s: Int) -> Sec
contract { intent { "nested secret record" } privacy { contains PII } }
{ return Sec { a: s } }
pure flow publicAfterNested(s: Int) -> Int
contract { intent { "public scalar after nested record" } }
{ let _record: Sec = secretRecord(s) return 2048 }
`;
  const { instance } = await build(src, "nested-return-metadata.fungi");

  const scalar = instance.exports.publicAfterNested(7);
  assert.equal(finalizeSecretExportResult(instance, scalar), 2048,
    "the caller's scalar return must overwrite metadata changed by an internal callee");
});

test("Q1 multi-field secret export cannot leave stale heap metadata for a later public scalar", async () => {
  const src = `record Sec { a: Int, b: Int }
pure flow secretRecord(s: Int) -> Sec
contract { intent { "two-field secret record export" } privacy { contains PII } }
{ return Sec { a: s, b: s + 2 } }
pure flow publicScalar() -> Int
contract { intent { "public scalar after two-field secret export" } }
{ return 2048 }
`;
  const { instance } = await build(src, "multi-field-mixed-return-metadata.fungi");

  assert.equal(finalizeSecretExportResult(instance, instance.exports.publicScalar()), 2048);
  const copied = finalizeSecretExportResult(instance, instance.exports.secretRecord(7));
  assert.deepEqual(copied, [7, 9]);
  assert.equal(finalizeSecretExportResult(instance, instance.exports.publicScalar()), 2048);
});

test("Q1 scalar metadata wrapper names do not collide with Fungi flow names", async () => {
  const src = `record Sec { a: Int }
pure flow secretRecord(s: Int) -> Sec
contract { intent { "secret record for wrapper naming" } privacy { contains PII } }
{ return Sec { a: s } }
pure flow publicScalar() -> Int
contract { intent { "scalar wrapper name collision control" } }
{ return 17 }
pure flow publicScalar_impl() -> Int
contract { intent { "source flow uses generated suffix" } }
{ return 23 }
pure flow publicScalar_impl_1() -> Int
contract { intent { "source flow uses numbered suffix" } }
{ return 29 }
`;
  const { instance } = await build(src, "wrapper-name-collision.fungi");
  assert.equal(instance.exports.publicScalar(), 17);
  assert.equal(instance.exports.publicScalar_impl(), 23);
  assert.equal(instance.exports.publicScalar_impl_1(), 29);
});

test("Q1 production executor early heap return still copies the field", async () => {
  const src = `record Sec { a: Int }
pure flow h(s: Int) -> Sec
contract { intent { "early heap" } privacy { contains PII } }
{ if s <= 10 { return Sec { a: s } } return Sec { a: 1 } }
`;
  const { wasm } = await build(src, "early-heap-prod.fungi");
  const r = createLowLevelWasmExecutor().instantiateAndCall({
    artifactBytes: wasm,
    exportName: "h",
    args: [7],
  });
  assert.equal(r.ok, true);
  assert.equal(r.result, 7, "early (return Sec) must tag heap so the host copies");
});

test("Q1 production executor nested outer Sec + inner Int copies the outer field", async () => {
  const src = `record Sec { a: Int }
pure flow inner(s: Int) -> Int
contract { intent { "inner scalar" } privacy { contains PII } }
{ return s }
pure flow h(s: Int) -> Sec
contract { intent { "outer heap" } privacy { contains PII } }
{ let _x: Int = inner(s) return Sec { a: s } }
`;
  const { wasm } = await build(src, "nested-prod-sec.fungi");
  const r = createLowLevelWasmExecutor().instantiateAndCall({
    artifactBytes: wasm,
    exportName: "h",
    args: [7],
  });
  assert.equal(r.ok, true);
  assert.equal(r.result, 7, "outer heap return must copy the field after inner Int");
});

test("Q1 production executor copies only the returned record, not later allocations", async () => {
  const src = `record Sec { a: Int }
pure flow h(s: Int) -> Sec
contract { intent { "q1 extra alloc" } privacy { contains PII } }
{ let r: Sec = Sec { a: s } let _x: Sec = Sec { a: 99 } return r }
`;
  const { wasm } = await build(src, "extra-alloc.fungi");
  const r = createLowLevelWasmExecutor().instantiateAndCall({
    artifactBytes: wasm,
    exportName: "h",
    args: [7],
  });
  assert.equal(r.ok, true);
  assert.equal(r.result, 7, "later allocations must not be appended to the copied record");
});

test("Q1 production executor copies every word of a multi-field heap record", async () => {
  const src = `record Wide { a: Int, b: Int, c: Int }
pure flow h(s: Int) -> Wide
contract { intent { "q1 wide host" } privacy { contains PII } }
{ return Wide { a: s, b: s, c: s } }
`;
  const { wasm } = await build(src, "wide-host.fungi");
  const r = createLowLevelWasmExecutor().instantiateAndCall({
    artifactBytes: wasm,
    exportName: "h",
    args: [7],
  });
  assert.equal(r.ok, true);
  assert.deepEqual(r.result, [7, 7, 7], "host must copy returnWordCount fields, not only word 0");
});

test("Q1 secret heap return null-checks $__fungi_heap_ret before flatten", async () => {
  const src = `record Sec { a: Int }
pure flow h(s: Int) -> Sec
contract { intent { "q1 heap_ret guard" } privacy { contains PII } }
{ return Sec { a: s } }
`;
  const { wat, wasm } = await build(src, "heap-ret-guard.fungi");
  assert.match(wat, /i32\.lt_u \(local\.get \$__fungi_heap_ret\) \(i32\.const 1024\)/);
  const r = createLowLevelWasmExecutor().instantiateAndCall({
    artifactBytes: wasm,
    exportName: "h",
    args: [7],
  });
  assert.equal(r.ok, true);
  assert.equal(r.result, 7);
});

test("Q1 flatten does not load a nested record through address 0", async () => {
  const src = `record Node { child: Node, n: Int }
pure flow h(s: Int) -> Node
contract { intent { "q1 null child" } privacy { contains PII } }
{ return Node { n: s } }
`;
  const { instance, memory } = await build(src, "null-child.fungi");
  memory[0] = 0x11111111;
  memory[1] = 0x22222222;
  const copied = finalizeSecretExportResult(instance, instance.exports.h(7));
  const words = Array.isArray(copied) ? copied : [copied];
  assert.equal(words.includes(0x11111111), false, "flatten must not load a nested record at address 0");
  assert.equal(words.includes(0x22222222), false);
  assert.deepEqual(words, [0, 0, 7], "omitted recursive child zeros one closed layout then copies n");
});

test("Q1 flatten of a finite nested Node with omitted inner child zeros one closed layout (not a runtime-cycle witness)", async () => {
  const src = `record Node { child: Node, n: Int }
pure flow h(s: Int) -> Node
contract { intent { "q1 omitted inner child" } privacy { contains PII } }
{ return Node { child: Node { n: 1 }, n: s } }
`;
  const { wasm } = await build(src, "cyclic-node.fungi");
  const r = createLowLevelWasmExecutor().instantiateAndCall({
    artifactBytes: wasm,
    exportName: "h",
    args: [7],
  });
  assert.equal(r.ok, true);
  assert.deepEqual(
    r.result,
    [0, 1, 7],
    "recursive child keeps one closed layout (zero grandchild + inner n) plus outer n; not [0,7] data-loss, an 8-hop pad, or a live pointer",
  );
  assert.equal(Array.isArray(r.result) && r.result.every((w) => typeof w === "number" && w < HEAP_BASE), true);
});

test("Q1 recursive flatten refuses a non-null child beyond its closed expansion", async () => {
  const src = `record Node { child: Node, n: Int }
pure flow h(s: Int) -> Node
contract { intent { "q1 over-depth recursive return" } privacy { contains PII } }
{ return Node { child: Node { child: Node { n: 3 }, n: 2 }, n: s } }
`;
  const { wasm } = await build(src, "deep-recursive-node-refusal.fungi");
  const r = createLowLevelWasmExecutor().instantiateAndCall({
    artifactBytes: wasm,
    exportName: "h",
    args: [1],
  });
  assert.equal(r.ok, false, "deeper non-null children must refuse instead of silently truncating the return value");
});

test("Q1 recursive flatten refusal wipes its partial secret copy without widening cleanup", async () => {
  const src = `record Node { n: Int, child: Node }
pure flow h() -> Node
contract { intent { "q1 refused partial recursive return" } privacy { contains PII } }
{ return Node { n: 73, child: Node { n: 2, child: Node { n: 3 } } } }
`;
  const { instance, memory, wat } = await build(src, "recursive-partial-copy-wipe.fungi");
  const destinationWord = (HEAP_BASE + 24) / 4;
  const unrelatedWord = HEAP_BASE / 4 + 32;
  memory[unrelatedWord] = 0x12345678;

  const capacityGuard = wat.indexOf("(i64.gt_u (i64.add (i64.extend_i32_u (local.get $__fungi_flat))");
  const reserve = wat.indexOf("(global.set $__fungi_heap (i32.add (local.get $__fungi_flat)");
  assert.ok(capacityGuard >= 0 && reserve > capacityGuard,
    "packed-return capacity must be checked before its range is registered for cleanup");

  // Establish that this fixture really writes a secret to the packed destination
  // before refusing. A zero-initialized destination alone is not cleanup evidence.
  assert.throws(() => instance.exports.h(), WebAssembly.RuntimeError);
  assert.equal(memory[destinationWord], 73);
  assert.equal(instance.exports.__fungi_heap_get(), HEAP_BASE + 36);
  instance.exports.__fungi_wipe_owned();
  assert.ok(memory.slice(HEAP_BASE / 4, destinationWord + 3).every(word => word === 0));
  assert.equal(memory[unrelatedWord], 0x12345678);

  const result = invokeAdmittedExport(instance, "h", []);

  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.reason, /trap during 'h':.*unreachable/);
  assert.deepEqual(Array.from(memory.slice(destinationWord, destinationWord + 3)), [0, 0, 0],
    "partial flattened secret words outside the source-record range must be included in trap cleanup");
  assert.equal(memory[unrelatedWord], 0x12345678,
    "trap cleanup must not widen beyond the owned source and reserved return-copy allocation");
});

for (const nonNullTail of [true, false]) {
test(`Q1 maximum flatten depth has a discriminating null twin; nonNullTail=${nonNullTail}`, async () => {
  const declarations = ["record R10 { n: Int }"];
  for (let i = 9; i >= 0; i -= 1) {
    declarations.push(`record R${i} { child: R${i + 1}, n: Int }`);
  }
  let value = nonNullTail ? "R10 { n: 10 }" : "R8 { n: 8 }";
  for (let i = nonNullTail ? 9 : 7; i >= 0; i -= 1) {
    value = `R${i} { child: ${value}, n: ${i} }`;
  }
  const src = `${declarations.join("\n")}
pure flow h() -> R0
contract { intent { "q1 maximum flatten depth" } privacy { contains PII } }
{ return ${value} }
`;
  const { instance } = await build(src, "maximum-flatten-depth-refusal.fungi");
  const memory = new Uint8Array(instance.exports.memory.buffer);
  memory[HEAP_BASE - 1] = 0x31;
  memory[HEAP_BASE + 256] = 0x53;
  const result = invokeAdmittedExport(instance, "h", []);
  assert.equal(result.ok, !nonNullTail, "non-null cutoff must refuse, null cutoff must preserve representable fields");
  if (!result.ok) assert.match(result.reason, /trap during 'h':.*unreachable/);
  else assert.deepEqual(result.result, [0,8,7,6,5,4,3,2,1,0]);
  const end = instance.exports.__fungi_heap_get();
  assert.ok(end > HEAP_BASE && end < HEAP_BASE + 256);
  assert.ok(memory.subarray(HEAP_BASE, end).every(byte => byte === 0));
  assert.equal(memory[HEAP_BASE - 1], 0x31);
  assert.equal(memory[HEAP_BASE + 256], 0x53);
});
}

test("Q1 production executor flattens nested heap records", async () => {
  const src = `record Sec { a: Int }
record Outer { inner: Sec, n: Int }
pure flow h(s: Int) -> Outer
contract { intent { "q1 nested rec" } privacy { contains PII } }
{ return Outer { inner: Sec { a: s }, n: 99 } }
`;
  const { wasm } = await build(src, "nested-rec.fungi");
  const r = createLowLevelWasmExecutor().instantiateAndCall({
    artifactBytes: wasm,
    exportName: "h",
    args: [7],
  });
  assert.equal(r.ok, true);
  assert.deepEqual(r.result, [7, 99], "nested Sec must be inlined, not a dangling pointer");
});

test("Q1 admitAndInstantiate callers copy-then-wipe via invokeAdmittedExport", async () => {
  const src = `record Sec { a: Int }
pure flow h(s: Int) -> Sec
contract { intent { "q1 admit host" } privacy { contains PII } }
{ return Sec { a: s } }
`;
  const { wasm } = await build(src, "admit-host.fungi");
  const { publicKeyPem, privateKeyPem } = generateRunnerKeypair();
  const attestation = signWasm(wasm, privateKeyPem, "dev");
  const { instance } = await admitAndInstantiate({
    wasm,
    attestation,
    policy: { requireSigned: true, publicKeyPem },
    host: createHostRuntime(),
  });
  const invoked = invokeAdmittedExport(instance, "h", [7]);
  assert.equal(invoked.ok, true);
  assert.equal(invoked.result, 7);
  const direct = instance.exports.h(7);
  assert.equal(direct, 7, "wrapped exports must finalize so skip-copy is impossible");
  const again = invokeAdmittedExport(instance, "h", [1024]);
  assert.equal(again.ok, true);
  assert.equal(again.result, 1024, "admit+invoke must not double-finalize a heap copy into 0");
});

test("Q1 production executor copies a heap-pointer field then guest-wipes", async () => {
  const src = `record Sec { a: Int }
pure flow h(s: Int) -> Sec
contract { intent { "q1 prod host" } privacy { contains PII } }
{ return Sec { a: s } }
`;
  const { wasm } = await build(src);
  const r = createLowLevelWasmExecutor().instantiateAndCall({
    artifactBytes: wasm,
    exportName: "h",
    args: [7],
  });
  assert.equal(r.ok, true);
  assert.equal(r.result, 7, "production host must return the copied field, not a live WASM pointer");
});

test("Q1 mutation control: wipe-before-load returns 0; capture-then-wipe returns 7", async () => {
  const wat = `(module
  (memory (export "memory") 1)
  (func (export "before") (result i32)
    (i32.store (i32.const 1024) (i32.const 7))
    (memory.fill (i32.const 1024) (i32.const 0) (i32.const 12))
    (i32.load (i32.const 1024)))
  (func (export "after") (result i32)
    (local $r i32)
    (i32.store (i32.const 1024) (i32.const 7))
    (local.set $r (i32.load (i32.const 1024)))
    (memory.fill (i32.const 1024) (i32.const 0) (i32.const 12))
    (local.get $r))
)`;
  const asm = await L.assembleWAT(wat);
  assert.ok(asm.valid, "hand WAT must assemble");
  const { instance } = await WebAssembly.instantiate(asm.wasm);
  assert.equal(instance.exports.before(), 0, "wipe-before-load is the 7-to-0 defect");
  assert.equal(instance.exports.after(), 7, "capture-then-wipe preserves 7");
  const mem = new Int32Array(instance.exports.memory.buffer);
  assert.equal(mem[1024 / 4], 0, "both orders still erase the arena word");
});

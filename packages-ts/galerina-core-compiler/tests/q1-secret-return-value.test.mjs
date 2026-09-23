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

async function build(src, filename = "q1.fungi") {
  const prog = L.parseProgram(src, filename);
  const errs = (prog.diagnostics ?? []).filter((d) => d.severity === "error");
  assert.equal(errs.length, 0, `parse errors: ${errs.map((d) => d.message).join("; ")}`);
  const fx = L.checkEffects(prog.flows, prog.ast);
  const { gir } = L.emitGIR(prog.ast, prog.flows, fx);
  const wat = L.renderWAT(L.buildWATModuleFromGIR(gir, undefined, "wasm-standalone", prog.ast, true));
  const asm = await L.assembleWAT(wat);
  assert.ok(asm.valid, `must assemble: ${asm.valid ? "" : asm.diagnostics.map((d) => d.message).join("; ")}`);
  const { instance } = await WebAssembly.instantiate(asm.wasm);
  return { wat, instance, wasm: asm.wasm, memory: new Int32Array(instance.exports.memory.buffer) };
}

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

test("Q1 production executor does not copy a cyclic nested child pointer", async () => {
  const src = `record Node { child: Node, n: Int }
pure flow h(s: Int) -> Node
contract { intent { "q1 cyclic node" } privacy { contains PII } }
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

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

function refusalOutputRangeViolations(memory, beforeWords, startByte, endByte, heapEnd) {
  if (
    !Number.isInteger(heapEnd)
    || (heapEnd & 3) !== 0
    || heapEnd < startByte
    || heapEnd > endByte
    || (startByte & 3) !== 0
    || (endByte & 3) !== 0
    || beforeWords.length !== (endByte - startByte) / 4
  ) {
    return [`invalid candidate output range or heap end ${String(heapEnd)}`];
  }
  const startWord = startByte / 4;
  const endWord = endByte / 4;
  const afterWords = memory.subarray(startWord, endWord);
  if (afterWords.length !== beforeWords.length) return ["candidate output range exceeds current memory"];
  const unchanged = afterWords.every((word, i) => word === beforeWords[i]);
  if (heapEnd === startByte) {
    return unchanged
      ? []
      : ["empty heap watermark changed the candidate output range"];
  }
  const ownedEndWord = heapEnd / 4;
  if (!memory.subarray(startWord, ownedEndWord).every((word) => word === 0)) {
    return ["non-empty owned output range contains nonzero data after refusal"];
  }
  if (!memory.subarray(ownedEndWord, endWord).every((word, i) => word === beforeWords[ownedEndWord - startWord + i])) {
    return ["bytes beyond the reported owned range changed during refusal"];
  }
  return [];
}

test("Q1 refusal-range oracle catches dirty tails after a rewound heap cursor", () => {
  const startByte = HEAP_BASE;
  const endByte = HEAP_BASE + 20;
  const before = Int32Array.of(0x51a7e001, 0x51a7e002, 0x51a7e003, 0x51a7e004, 0x51a7e005);
  const unchanged = new Int32Array(endByte / 4);
  unchanged.set(before, startByte / 4);
  assert.deepEqual(refusalOutputRangeViolations(unchanged, before, startByte, endByte, startByte), []);
  const wiped = new Int32Array(endByte / 4);
  assert.notDeepEqual(
    refusalOutputRangeViolations(wiped, before, startByte, endByte, startByte),
    [],
      "an empty reported extent cannot claim ownership of a changed range, including a fully-zeroed range",
  );

  for (const dirtyTailWord of [2, 4]) {
    const mutated = unchanged.slice();
    mutated[startByte / 4 + dirtyTailWord] = 0x13579bdf;
    assert.notDeepEqual(
      refusalOutputRangeViolations(mutated, before, startByte, endByte, startByte),
      [],
      `a dirty candidate-output word at ${startByte + dirtyTailWord * 4} must be detected even when word zero is unchanged`,
    );
  }

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

test("Q1 recursive secret return never silently truncates a grandchild value", async () => {
  const src = `record Node { n: Int, child: Node }
pure flow h(s: Int) -> Node
contract { intent { "q1 recursive grandchild" } privacy { contains PII } }
{ return Node { n: 2, child: Node { n: 1, child: Node { n: s } } } }
`;
  const { wasm } = await build(src, "recursive-grandchild.fungi");
  const { publicKeyPem, privateKeyPem } = generateRunnerKeypair();
  const attestation = signWasm(wasm, privateKeyPem, "dev");
  const { instance } = await admitAndInstantiate({
    wasm,
    attestation,
    policy: { requireSigned: true, publicKeyPem },
    host: createHostRuntime(),
  });
  const invoked = invokeAdmittedExport(instance, "h", [7]);
  assert.equal(
    invoked.ok,
    false,
    `the current closed return layout cannot represent a grandchild; it must refuse before publishing a flattened result: ${JSON.stringify(invoked)}`,
  );
  const memory = new Int32Array(instance.exports.memory.buffer);
  const heapEnd = instance.exports.__fungi_heap_get();
  assert.ok(
    memory.subarray(HEAP_BASE / 4, heapEnd / 4).every((word) => word === 0),
    "refusal cleanup must wipe every word in the owned recursive source range, including the grandchild",
  );
  assert.equal(memory[heapEnd / 4], 0, "fresh memory beyond the owned range is initially zero; this is not proof of wiping it");
});

test("Q1 flatten accepts the exact-null terminal recursive pointer as omitted", async () => {
  const src = `record Filler { a: Int, b: Int }
record Node { n: Int, child: Node }
pure flow echo(input: Node) -> Node
contract { intent { "q1 terminal omitted recursive pointer" } privacy { contains PII } }
{ let pad0: Filler = Filler { a: 0, b: 0 }
  let pad1: Filler = Filler { a: 0, b: 0 }
  let pad2: Filler = Filler { a: 0, b: 0 }
  return Node { n: input.n, child: input.child }
}
`;
  const { instance } = await build(src, "terminal-omitted-pointer.fungi");
  const host = createHostRuntime();
  host.bindMemory(instance.exports.memory);
  for (let i = 0; i < 8; i++) host.allocRecord([0, 0]); // stage inputs beyond the flow's allocations and output
  const child = host.allocRecord([1, 0]); // exact zero is the omitted-child sentinel
  const root = host.allocRecord([2, child]);
  const result = finalizeSecretExportResult(instance, instance.exports.echo(root));
  assert.deepEqual(
    result,
    [2, 1, 0],
    "the exact-null terminal pointer is represented as zero in the flattened result",
  );
});

test("Q1 flatten refuses nonzero low terminal recursive pointers instead of treating them as absent", async () => {
  const src = `record Filler { a: Int, b: Int }
record Node { n: Int, child: Node }
pure flow echo(input: Node) -> Node
contract { intent { "q1 malformed low recursive pointer" } privacy { contains PII } }
{ let pad0: Filler = Filler { a: 0, b: 0 }
  let pad1: Filler = Filler { a: 0, b: 0 }
  let pad2: Filler = Filler { a: 0, b: 0 }
  return Node { n: input.n, child: input.child }
}
`;
  const { instance } = await build(src, "malformed-low-recursive-pointer.fungi");
  const host = createHostRuntime();
  host.bindMemory(instance.exports.memory);
  for (let i = 0; i < 8; i++) host.allocRecord([0, 0]);

  for (const malformedPointer of [1, HEAP_BASE - 4]) {
    const child = host.allocRecord([1, malformedPointer]);
    const root = host.allocRecord([2, child]);
    assert.throws(
      () => instance.exports.echo(root),
      `nonzero low pointer ${malformedPointer} must trap, not be canonicalized to an absent child`,
    );
  }
});

test("Q1 root record returns accept exact null and refuse nonzero low pointers in both flatten paths", async () => {
  const cases = [
    {
      name: "flat",
      source: `record Pair { a: Int, b: Int }
record Filler { x: Int, y: Int }
pure flow echo(input: Pair) -> Pair
contract { intent { "q1 flat root pointer" } privacy { contains PII } }
{ let pad: Filler = Filler { x: 0, y: 0 } return input }
`,
    },
    {
      name: "packed",
      source: `record Inner { a: Int }
record Outer { inner: Inner, b: Int }
record Filler { x: Int, y: Int }
pure flow echo(input: Outer) -> Outer
contract { intent { "q1 packed root pointer" } privacy { contains PII } }
{ let pad: Filler = Filler { x: 0, y: 0 } return input }
`,
    },
  ];

  for (const { name, source } of cases) {
    const { instance } = await build(source, `root-pointer-${name}.fungi`);
    assert.doesNotThrow(() => instance.exports.echo(0), `${name} exact-null root remains the omission sentinel`);
    for (const malformedPointer of [1, HEAP_BASE - 4]) {
      assert.throws(
        () => instance.exports.echo(malformedPointer),
        `nonzero low ${name} root pointer ${malformedPointer} must trap instead of being canonicalized to an omitted record`,
      );
    }
  }
});

test("Q1 flatten must refuse an unstaged nested pointer behind a staged root", async () => {
  const src = `record Node { n: Int, child: Node }
pure flow echo(input: Node) -> Node
contract { intent { "q1 foreign in-range nested pointer" } privacy { contains PII } }
{ return Node { n: input.n, child: input.child } }
`;
  const { instance, wasm } = await build(src, "foreign-in-range-nested-pointer.fungi");
  const host = createHostRuntime();
  host.bindMemory(instance.exports.memory);
  for (let i = 0; i < 8; i++) host.allocRecord([0, 0]);

  const foreignPointer = 8192; // in linear memory, but not allocated by this host record stager
  const memory = new Int32Array(instance.exports.memory.buffer);
  memory[foreignPointer / 4] = 0x13579bdf;
  memory[foreignPointer / 4 + 1] = 0;
  const root = host.allocRecord([2, foreignPointer]);
  // This flow allocates an 8-byte Node, then a 12-byte flattened result.
  // Snapshot the full independently derived candidate write range, not only its first word.
  const candidateOutputStart = HEAP_BASE;
  const candidateOutputEnd = HEAP_BASE + 20;
  const candidateOutputBefore = Int32Array.of(0x51a7e001, 0x51a7e002, 0x51a7e003, 0x51a7e004, 0x51a7e005);
  memory.set(candidateOutputBefore, candidateOutputStart / 4);
  assert.ok(foreignPointer >= root + 8,
    "the foreign child must be beyond the root and every earlier staged record");
  assert.ok(foreignPointer + 8 <= memory.byteLength,
    "both words of the foreign child must remain inside linear memory");

  let returned;
  let failure;
  let rawHeapEnd;
  try {
    const rawResult = instance.exports.echo(root);
    rawHeapEnd = instance.exports.__fungi_heap_get();
    returned = finalizeSecretExportResult(instance, rawResult);
  } catch (error) {
    failure = error;
    // A raw export has no admitted-wrapper catch/finally. Capture its owned
    // extent before any host cleanup so a trapping path cannot hide a leak.
    rawHeapEnd = instance.exports.__fungi_heap_get();
  }
  const violations = [];
  if (!(failure instanceof WebAssembly.RuntimeError)) {
    violations.push(`expected RuntimeError refusal; observed ${failure === undefined ? "successful return" : String(failure)}`);
  }
  if (returned !== undefined) {
    violations.push(`a flattened result escaped: ${JSON.stringify(returned)}`);
  }
  if (!Number.isInteger(rawHeapEnd) || rawHeapEnd < HEAP_BASE || rawHeapEnd > foreignPointer) {
    violations.push(`raw arm reported an invalid guest-owned extent before finalization: ${String(rawHeapEnd)}`);
  } else {
    violations.push(...refusalOutputRangeViolations(
      memory, candidateOutputBefore, candidateOutputStart, candidateOutputEnd, rawHeapEnd,
    ));
  }
  if (memory[foreignPointer / 4] !== 0x13579bdf) {
    violations.push(`foreign sentinel changed to ${memory[foreignPointer / 4]}`);
  }
  const { publicKeyPem, privateKeyPem } = generateRunnerKeypair();
  const attestation = signWasm(wasm, privateKeyPem, "dev");
  const makeAdmittedCase = async () => {
    const host = createHostRuntime();
    const { instance } = await admitAndInstantiate({
      wasm,
      attestation,
      policy: { requireSigned: true, publicKeyPem },
      host,
    });
    for (let i = 0; i < 8; i++) host.allocRecord([0, 0]);
    const child = host.allocRecord([1, 0]);
    return { host, instance, child };
  };

  const { host: validHost, instance: validAdmitted, child: validChild } = await makeAdmittedCase();
  const validRoot = validHost.allocRecord([2, validChild]);
  assert.equal(validChild, HEAP_BASE + 8 * 8, "the eight two-word filler records must end before the staged child");
  assert.equal(validRoot, validChild + 8, "the staged root must immediately follow the staged child");
  const validControl = invokeAdmittedExport(validAdmitted, "echo", [validRoot]);
  assert.deepEqual(
    validControl,
    { ok: true, result: [2, 1, 0] },
    "a fresh signed/admitted instance must accept the valid staged root and child",
  );

  const { host: foreignHost, instance: admitted, child: foreignChild } = await makeAdmittedCase();
  const admittedMemory = new Int32Array(admitted.exports.memory.buffer);
  const admittedRoot = foreignHost.allocRecord([2, foreignPointer]);
  admittedMemory.set(candidateOutputBefore, candidateOutputStart / 4);
  assert.equal(foreignChild, validChild, "the negative case must stage its unused child slot at the same base");
  assert.equal(admittedRoot, validRoot, "the positive and negative root records must have the same base");
  assert.ok(foreignPointer >= admittedRoot + 8, "the unregistered sentinel must be outside all staged record extents");
  assert.ok(foreignPointer + 8 <= admittedMemory.byteLength,
    "the unregistered sentinel must remain inside linear memory");
  admittedMemory[foreignPointer / 4] = 0x13579bdf;
  admittedMemory[foreignPointer / 4 + 1] = 0;

  assert.equal(typeof admitted.exports.echo, "function", "the admitted module must expose the tested flow");
  const invoked = invokeAdmittedExport(admitted, "echo", [admittedRoot]);
  const admittedViolations = [];
  if (invoked.ok) {
    admittedViolations.push(`admitted executor accepted a foreign nested pointer and returned ${JSON.stringify(invoked.result)}`);
  } else if (!invoked.reason.startsWith("trap during 'echo': ")) {
    admittedViolations.push(`expected the admitted export to refuse through its trap path, observed ${invoked.reason}`);
  }
  if (admittedMemory[admittedRoot / 4] !== 2 || admittedMemory[admittedRoot / 4 + 1] !== foreignPointer) {
    admittedViolations.push("nested-pointer handling changed the host-staged root record");
  }
  if (admittedMemory[foreignChild / 4] !== 1 || admittedMemory[foreignChild / 4 + 1] !== 0) {
    admittedViolations.push("nested-pointer handling changed the unused host-staged child slot");
  }
  const admittedHeapEnd = admitted.exports.__fungi_heap_get();
  if (!Number.isInteger(admittedHeapEnd) || admittedHeapEnd < HEAP_BASE || admittedHeapEnd > admittedMemory.byteLength) {
    admittedViolations.push(`invalid post-call heap end ${String(admittedHeapEnd)}`);
  } else if (admittedHeapEnd > foreignPointer) {
    admittedViolations.push("the unregistered sentinel overlaps the guest-owned heap extent");
  } else {
    admittedViolations.push(...refusalOutputRangeViolations(
      admittedMemory, candidateOutputBefore, candidateOutputStart, candidateOutputEnd, admittedHeapEnd,
    ));
  }
  if (admittedMemory[foreignPointer / 4] !== 0x13579bdf) {
    admittedViolations.push(`guarded executor changed foreign sentinel to ${admittedMemory[foreignPointer / 4]}`);
  }
  assert.deepEqual(
    { rawExport: violations, admittedExecutor: admittedViolations },
    { rawExport: [], admittedExecutor: [] },
    "both raw and signed/admitted paths must refuse the foreign nested pointer before returning it, then wipe only guest-owned bytes",
  );
});

test("Q1 in-range root pointer outside host staging is still refused", async () => {
  const src = `record Node { n: Int, child: Node }
pure flow echo(input: Node) -> Node
contract { intent { "q1 foreign in-range root pointer" } privacy { contains PII } }
{ return Node { n: input.n, child: input.child } }
`;
  const { wasm } = await build(src, "foreign-in-range-root-pointer.fungi");
  const { publicKeyPem, privateKeyPem } = generateRunnerKeypair();
  const attestation = signWasm(wasm, privateKeyPem, "dev");
  const host = createHostRuntime();
  const { instance } = await admitAndInstantiate({
    wasm,
    attestation,
    policy: { requireSigned: true, publicKeyPem },
    host,
  });
  const memory = new Int32Array(instance.exports.memory.buffer);
  for (let i = 0; i < 8; i++) host.allocRecord([0, 0]);
  const child = host.allocRecord([1, 0]);
  const foreignRoot = 4096;
  assert.equal(child, HEAP_BASE + 8 * 8, "the staged child must follow exactly eight two-word filler records");
  assert.ok(foreignRoot >= child + 8, "the foreign root extent must be outside the complete host-staged extent");
  assert.ok(foreignRoot + 8 <= memory.byteLength,
    "the foreign root must remain inside linear memory");
  memory[foreignRoot / 4] = 2;
  memory[foreignRoot / 4 + 1] = child;
  const candidateOutputStart = HEAP_BASE;
  const candidateOutputEnd = HEAP_BASE + 20;
  const candidateOutputBefore = Int32Array.of(0x51a7e001, 0x51a7e002, 0x51a7e003, 0x51a7e004, 0x51a7e005);
  memory.set(candidateOutputBefore, candidateOutputStart / 4);

  const invoked = invokeAdmittedExport(instance, "echo", [foreignRoot]);
  const violations = [];
  if (invoked.ok) {
    violations.push(`an in-range root pointer outside host staging was accepted: ${JSON.stringify(invoked.result)}`);
  } else if (!invoked.reason.startsWith("trap during 'echo': ")) {
    violations.push(`expected the export trap path, observed ${invoked.reason}`);
  }
  const heapEnd = instance.exports.__fungi_heap_get();
  if (!Number.isInteger(heapEnd) || heapEnd < HEAP_BASE || heapEnd > memory.byteLength) {
    violations.push(`invalid post-call heap end ${String(heapEnd)}`);
  } else if (heapEnd > foreignRoot) {
    violations.push("the foreign root overlaps the guest-owned heap extent");
  } else {
    violations.push(...refusalOutputRangeViolations(
      memory, candidateOutputBefore, candidateOutputStart, candidateOutputEnd, heapEnd,
    ));
  }
  if (memory[foreignRoot / 4] !== 2 || memory[foreignRoot / 4 + 1] !== child) {
    violations.push("refusal cleanup changed the foreign root record");
  }
  if (memory[child / 4] !== 1 || memory[child / 4 + 1] !== 0) {
    violations.push("refusal cleanup changed the staged child record");
  }
  assert.deepEqual(violations, [], "root refusal must preserve host-owned records and wipe only the guest-owned heap");
});

test("Q1 flat exact-null return may fill a result ending exactly at linear-memory end", async () => {
  const fillerCount = 16_255; // 1,024 + 16,255 x 8 leaves exactly 8 bytes in the default 2-page memory.
  const src = `record Pair { a: Int, b: Int }
record Filler { x: Int, y: Int }
pure flow echo(input: Pair) -> Pair
contract { intent { "q1 exact-end flat null return" } privacy { contains PII } }
{ mut i: Int = 0
  while i < ${fillerCount} {
    let pad: Filler = Filler { x: 0, y: 0 }
    i = i + 1
  }
  return input
}
`;
  const { instance } = await build(src, "exact-end-flat-null-return.fungi");
  const memory = new Int32Array(instance.exports.memory.buffer);
  assert.equal(memory.byteLength, 131_072, "the fixture is pinned to its two-page memory boundary");
  const result = instance.exports.echo(0);
  assert.equal(result, memory.byteLength - 8);
  assert.equal(instance.exports.__fungi_heap_get(), memory.byteLength);
  assert.deepEqual(Array.from(memory.subarray(memory.length - 2)), [0, 0]);
});

test("Q1 packed 12-byte result may end exactly at linear-memory end", async () => {
  const fillerCount = 32_505; // 1,024 + 32,505 x 4 + two 8-byte Nodes leaves exactly 12 bytes.
  const src = `record Filler { a: Int }
record Node { n: Int, child: Node }
pure flow h(s: Int) -> Node
contract { intent { "q1 exact-end packed return" } privacy { contains PII } }
{ mut i: Int = 0
  while i < ${fillerCount} {
    let pad: Filler = Filler { a: s }
    i = i + 1
  }
  return Node { n: 2, child: Node { n: 1 } }
}
`;
  const { instance } = await build(src, "exact-end-packed-return.fungi");
  const memory = new Int32Array(instance.exports.memory.buffer);
  assert.equal(memory.byteLength, 131_072, "the fixture is pinned to its two-page memory boundary");
  const result = instance.exports.h(7);
  assert.equal(result, memory.byteLength - 12);
  assert.equal(instance.exports.__fungi_heap_get(), memory.byteLength);
  assert.deepEqual(Array.from(memory.subarray(memory.length - 3)), [2, 1, 0]);
});

test("Q1 recursive flatten refuses before stores when its destination exceeds linear memory", async () => {
  const fillerCount = 16_253; // 16,253 x 8 bytes + base + two Node records leaves 8 bytes at the output cursor.
  const src = `record Filler { a: Int, b: Int }
record Node { n: Int, child: Node }
pure flow h(s: Int) -> Node
contract { intent { "q1 late recursive output trap" } privacy { contains PII } }
{ mut i: Int = 0
  while i < ${fillerCount} {
    let f: Filler = Filler { a: s, b: s }
    i = i + 1
  }
  return Node { n: 2, child: Node { n: 1 } }
}
  `;
  const { wasm } = await build(src, "late-recursive-output-trap.fungi");
  const { instance: rawInstance } = await WebAssembly.instantiate(wasm);
  const rawMemory = new Int32Array(rawInstance.exports.memory.buffer);
  const rawSentinels = [0x13579bdf, 0x2468ace0];
  rawMemory.set(rawSentinels, rawMemory.length - rawSentinels.length);
  assert.throws(() => rawInstance.exports.h(7), WebAssembly.RuntimeError);
  assert.equal(
    rawInstance.exports.__fungi_heap_get(),
    rawMemory.byteLength - 8,
    "raw refusal must not reserve an extent that crosses linear memory",
  );
  assert.deepEqual(
    Array.from(rawMemory.subarray(rawMemory.length - rawSentinels.length)),
    rawSentinels,
    "the raw refusal must leave nonzero out-of-bounds destination sentinels untouched before cleanup",
  );

  const { publicKeyPem, privateKeyPem } = generateRunnerKeypair();
  const attestation = signWasm(wasm, privateKeyPem, "dev");
  const { instance } = await admitAndInstantiate({
    wasm,
    attestation,
    policy: { requireSigned: true, publicKeyPem },
    host: createHostRuntime(),
  });
  const memory = new Int32Array(instance.exports.memory.buffer);
  const admittedSentinels = [0x13579bdf, 0x2468ace0];
  memory.set(admittedSentinels, memory.length - admittedSentinels.length);
  const invoked = invokeAdmittedExport(instance, "h", [7]);
  assert.equal(invoked.ok, false, "the 12-byte recursive result cannot fit in the final 8 bytes of linear memory");
  const heapEnd = instance.exports.__fungi_heap_get();
  assert.equal(heapEnd, memory.byteLength - 8, "the setup must place the output cursor with exactly 8 bytes remaining");
  assert.ok(
    memory.subarray(HEAP_BASE / 4, heapEnd / 4).every((word) => word === 0),
    "trap cleanup must wipe all source allocations",
  );
  assert.deepEqual(
    Array.from(memory.subarray(memory.length - admittedSentinels.length)),
    admittedSentinels,
    "cleanup must not modify the rejected destination beyond the guest-owned range",
  );
});

test("Q1 cleanup owns partial flattened output when a later source scalar load traps", async () => {
  const src = `record Pair { a: Int, b: Int }
record Outer { inner: Pair, n: Int }
pure flow wrap(input: Pair) -> Outer
  contract { intent { "q1 late recursive source trap" } privacy { contains PII } }
{ return Outer { inner: input, n: 9 } }
`;
  const { wasm } = await build(src, "late-recursive-source-trap.fungi");
  const { instance: rawInstance } = await WebAssembly.instantiate(wasm);
  const rawMemory = new Int32Array(rawInstance.exports.memory.buffer);
  const sourcePtr = rawMemory.byteLength - 4; // first scalar is in bounds; Pair.b is the following OOB load
  rawMemory[sourcePtr / 4] = 0x13579bdf;
  assert.throws(() => rawInstance.exports.wrap(sourcePtr), WebAssembly.RuntimeError);
  const rawHeapEnd = rawInstance.exports.__fungi_heap_get();
  assert.equal(rawHeapEnd, HEAP_BASE + 4 * 2 + 4 * 3, "the complete output range is reserved before flatten stores");
  assert.equal(
    rawMemory[(HEAP_BASE + 8) / 4],
    0x13579bdf,
    "the unwrapped trap control proves the first flattened output store happened before the second source load trapped",
  );

  const { publicKeyPem, privateKeyPem } = generateRunnerKeypair();
  const attestation = signWasm(wasm, privateKeyPem, "dev");
  const { instance } = await admitAndInstantiate({
    wasm,
    attestation,
    policy: { requireSigned: true, publicKeyPem },
    host: createHostRuntime(),
  });
  const memory = new Int32Array(instance.exports.memory.buffer);
  memory[sourcePtr / 4] = 0x13579bdf;
  const invoked = invokeAdmittedExport(instance, "wrap", [sourcePtr]);
  assert.equal(invoked.ok, false, "the second scalar load must trap at the end of WASM memory");
  const heapEnd = instance.exports.__fungi_heap_get();
  assert.equal(heapEnd, HEAP_BASE + 4 * 2 + 4 * 3, "the 8-byte source record and 12-byte output range must be reserved");
  assert.ok(
    memory.subarray(HEAP_BASE / 4, heapEnd / 4).every((word) => word === 0),
    "cleanup must erase both the source record and the first partially written output word",
  );
  assert.equal(memory[sourcePtr / 4], 0x13579bdf, "cleanup must not claim ownership of host-staged bytes beyond its heap range");
});

test("Q1 secret return refuses a nested record beyond the flatten depth limit", async () => {
  const depth = 10;
  const records = Array.from({ length: depth }, (_, i) => {
    const type = `R${depth - i - 1}`;
    const child = depth - i - 1;
    return child === depth - 1
      ? `record ${type} { n: Int }`
      : `record ${type} { n: Int, child: R${child + 1} }`;
  }).join("\n");
  let value = `R${depth - 1} { n: s }`;
  for (let i = depth - 2; i >= 0; i--) {
    value = `R${i} { n: ${i + 1}, child: ${value} }`;
  }
  const src = `${records}\npure flow h(s: Int) -> R0\ncontract { intent { "q1 deep nested return" } privacy { contains PII } }\n{ return ${value} }\n`;
  const { wasm } = await build(src, "deep-nested-return.fungi");
  const r = createLowLevelWasmExecutor().instantiateAndCall({
    artifactBytes: wasm,
    exportName: "h",
    args: [7],
  });
  assert.equal(
    r.ok,
    false,
    `the bounded return layout must refuse rather than silently zero a non-null record past its depth limit: ${JSON.stringify(r)}`,
  );
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

// Execute the emitted packed-return guards at simulated wasm32 boundaries.
// The actual module keeps one memory page; only the generated capacity operand
// is replaced, so no test allocates or accesses a multi-gigabyte memory.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as L from "../dist/index.js";
import {
  admitAndInstantiate,
  createHostRuntime,
  generateRunnerKeypair,
  invokeAdmittedExport,
  signWasm,
} from "@galerina/core-runtime-wasm";

const source = `record Cell { n: Int }
record Outer { inner: Cell, tail: Int }
pure flow h() -> Outer
contract { intent { "RD-1414 packed return boundary probe" } privacy { contains PII } }
{ return Outer { inner: Cell { n: 7 }, tail: 9 } }
`;

for (const { label, heapStart, simulatedCapacity, success = false } of [
  { label: "in-bounds-control", heapStart: 1040, simulatedCapacity: 65_536, success: true },
  { label: "exact-capacity-control", heapStart: 65_528, simulatedCapacity: 65_536, success: true },
  { label: "capacity", heapStart: 0xffff0000, simulatedCapacity: 0xffff0000 },
  { label: "i32-exclusive-end", heapStart: 0xfffffff8, simulatedCapacity: 0x1_0000_0000 },
]) {
  test(`RD-1414 emitted packed-return ${label} control`, async () => {
    const parsed = L.parseProgram(source, `rd1414-${label}.fungi`);
    assert.deepEqual(parsed.diagnostics.filter(d => d.severity === "error"), []);
    assert.deepEqual(L.checkTypes(parsed.ast).diagnostics.filter(d => d.severity === "error"), []);
    const effects = L.checkEffects(parsed.flows, parsed.ast);
    const { gir } = L.emitGIR(parsed.ast, parsed.flows, effects);
    const emitted = L.buildWATModuleFromGIR(gir, undefined, "wasm-standalone", parsed.ast, true);
    const signedI32 = heapStart > 0x7fffffff ? heapStart - 0x1_0000_0000 : heapStart;
    const module = {
      ...emitted,
      memory: { minPages: 1, maxPages: 1 },
      functions: emitted.functions.map(fn => ({
        ...fn,
        // Reach the real emitted flatten/reservation adapter without allocating
        // a 4-GiB input record.
        body: `${success ? `(i32.store (i32.const 1024) (i32.const 1032))
(i32.store (i32.const 1028) (i32.const 9))
(i32.store (i32.const 1032) (i32.const 7))
` : ""}(global.set $__fungi_heap (i32.const ${signedI32}))\n(i32.const 1024)`,
      })),
    };
    let wat = L.renderWAT(module);
    const capacityOperand = "(i64.shl (i64.extend_i32_u (memory.size)) (i64.const 16))";
    assert.equal(wat.split(capacityOperand).length - 1, 1,
      "the source must still have exactly one emitted packed-return capacity guard");
    wat = wat.replace(capacityOperand, `(i64.const ${simulatedCapacity})`);
    const close = wat.lastIndexOf(")");
    assert.ok(close >= 0);
    wat = `${wat.slice(0, close)}
(global $__test_guest_calls (export "__test_guest_calls") (mut i32) (i32.const 0))
(func (export "__test_heap") (result i32) (global.get $__fungi_heap))
${wat.slice(close)}`;
    const watLines = wat.split("\n");
    const hStart = watLines.findIndex(line => /^\s*\(func \$h(?:\s|$)/.test(line));
    assert.notEqual(hStart, -1, "rendered WAT must include the named emitted h function");
    let firstInstruction = hStart + 1;
    while (firstInstruction < watLines.length) {
      const line = watLines[firstInstruction].trim();
      if (line === "" || line.startsWith("(local ") || line.startsWith(";;")) {
        firstInstruction++;
        continue;
      }
      break;
    }
    watLines.splice(firstInstruction, 0,
      "    (global.set $__test_guest_calls (i32.add (global.get $__test_guest_calls) (i32.const 1)))");
    wat = watLines.join("\n");

    const assembled = await L.assembleWAT(wat);
    assert.ok(assembled.valid, `instrumented emitted module must assemble: ${assembled.diagnostics.map(d => d.message).join("; ")}`);
    const { instance } = await WebAssembly.instantiate(assembled.wasm);
    assert.equal(instance.exports.memory.buffer.byteLength, 65_536,
      "the control remains one real page; simulated capacity must not allocate larger memory");
    const before = new Uint8Array(instance.exports.memory.buffer).slice();
    if (success) {
      assert.equal(instance.exports.h(), heapStart,
        "an in-bounds nested packed return must succeed through the same emitted adapter");
      assert.equal(instance.exports.__test_heap() >>> 0, heapStart + 8,
        "the successful control reserves exactly the packed result length");
      const memory = new DataView(instance.exports.memory.buffer);
      assert.equal(memory.getInt32(heapStart, true), 7);
      assert.equal(memory.getInt32(heapStart + 4, true), 9);
      return;
    }
    assert.throws(() => instance.exports.h(), error =>
      error instanceof WebAssembly.RuntimeError && /unreachable/.test(error.message),
    "the emitted guard, not an out-of-bounds memory access, must refuse this packed return");
    assert.equal(instance.exports.__test_guest_calls.value, 1,
      "the refusal is reached from one actual emitted guest invocation");
    if (label === "capacity") {
      assert.throws(() => instance.exports.h(), error =>
        error instanceof WebAssembly.RuntimeError && /out of bounds/.test(error.message),
        "the raw positive control re-enters and traps in the oversized wipe prologue");
      assert.equal(instance.exports.__test_guest_calls.value, 2,
        "the first-instruction counter observes raw re-entry even when the prologue traps");
    }
    assert.equal(instance.exports.__test_heap() >>> 0, heapStart,
      "failed capacity/representability admission must not advance the heap watermark");
    assert.deepEqual(new Uint8Array(instance.exports.memory.buffer), before,
      "the refusal leaves the final memory byte-identical");

    if (label === "capacity") {
      const { publicKeyPem, privateKeyPem } = generateRunnerKeypair();
      const admitted = await admitAndInstantiate({
        wasm: assembled.wasm,
        attestation: signWasm(assembled.wasm, privateKeyPem, "dev"),
        policy: { requireSigned: true, publicKeyPem },
        host: createHostRuntime(),
      });
      const trapped = invokeAdmittedExport(admitted.instance, "h", []);
      assert.equal(trapped.ok, false, "the admitted call reports the emitted guard refusal");
      assert.match(trapped.reason, /FUNGI-WASM-CLEANUP-001/,
        "the synthetic out-of-range watermark makes cleanup trap and report failure");
      assert.match(trapped.reason, /handling unreachable/,
        "the composed error retains the original emitted guard trap");
      assert.equal(admitted.instance.exports.__test_guest_calls.value, 1,
        "the first admitted invocation enters the guest exactly once");
      const reused = invokeAdmittedExport(admitted.instance, "h", []);
      assert.equal(reused.ok, false, "failed cleanup must not leave the instance reusable");
      assert.match(reused.reason, /FUNGI-WASM-QUARANTINED-001/);
      assert.equal(admitted.instance.exports.__test_guest_calls.value, 1,
        "the quarantined retry is refused before guest re-entry");
    }
  });
}

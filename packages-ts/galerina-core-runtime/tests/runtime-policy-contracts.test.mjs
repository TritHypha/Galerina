import assert from "node:assert/strict";
import { describe, it } from "node:test";

import * as R from "../dist/index.js";

const codes = (v) => v.diagnostics.map((d) => d.code).sort();

describe("stream backpressure (never drops)", () => {
  const policy = { highWaterMarkItems: 4, highWaterMarkBytes: 1024, maxItemBytes: 256, overflow: "pause-producer" };
  it("accepts under the marks and pauses or fails at them", () => {
    assert.equal(R.decideStreamBackpressure({ bufferedItems: 1, bufferedBytes: 100, incomingBytes: 100 }, policy), "accept");
    assert.equal(R.decideStreamBackpressure({ bufferedItems: 4, bufferedBytes: 100, incomingBytes: 1 }, policy), "pause-producer");
    assert.equal(R.decideStreamBackpressure({ bufferedItems: 1, bufferedBytes: 900, incomingBytes: 200 }, { ...policy, overflow: "fail-stream" }), "fail-stream");
  });
  it("fails the stream on oversized items, malformed state or an invalid (e.g. dropping) policy", () => {
    assert.equal(R.decideStreamBackpressure({ bufferedItems: 0, bufferedBytes: 0, incomingBytes: 257 }, policy), "fail-stream");
    assert.equal(R.decideStreamBackpressure({ bufferedItems: -1, bufferedBytes: 0, incomingBytes: 1 }, policy), "fail-stream");
    assert.equal(R.decideStreamBackpressure({ bufferedItems: 0, bufferedBytes: 0, incomingBytes: 1 }, { ...policy, overflow: "drop" }), "fail-stream");
    assert.deepEqual(codes(R.validateStreamBackpressurePolicy({ highWaterMarkItems: 0, highWaterMarkBytes: 1.5, maxItemBytes: 9, overflow: "drop" })),
      ["Galerina_RUNTIME_STREAM_HWM_BYTES", "Galerina_RUNTIME_STREAM_HWM_ITEMS", "Galerina_RUNTIME_STREAM_ITEM_BYTES", "Galerina_RUNTIME_STREAM_OVERFLOW_MODE"]);
  });
});

describe("runtime memory policy", () => {
  it("the default policy is valid and denies shared/executable memory", () => {
    assert.equal(R.validateRuntimeMemoryPolicy(R.DEFAULT_RUNTIME_MEMORY_POLICY).allowed, true);
    assert.ok(Object.isFrozen(R.DEFAULT_RUNTIME_MEMORY_POLICY));
  });
  it("refuses policies that skip zeroing or enable shared/executable memory", () => {
    assert.deepEqual(codes(R.validateRuntimeMemoryPolicy({ maxHeapBytes: 10, maxSingleAllocationBytes: 20, zeroOnFree: false, allowSharedMemory: true, allowExecutableMemory: true })),
      ["Galerina_RUNTIME_MEMORY_ALLOCATION", "Galerina_RUNTIME_MEMORY_EXECUTABLE", "Galerina_RUNTIME_MEMORY_SHARED", "Galerina_RUNTIME_MEMORY_ZERO_ON_FREE"]);
  });
  it("decides allocations against the single cap and the heap budget", () => {
    const p = { ...R.DEFAULT_RUNTIME_MEMORY_POLICY, maxHeapBytes: 100, maxSingleAllocationBytes: 40 };
    assert.equal(R.decideRuntimeAllocation(50, 40, p).allowed, true);
    assert.deepEqual(codes(R.decideRuntimeAllocation(90, 41, p)), ["Galerina_RUNTIME_MEMORY_ALLOCATION_TOO_LARGE", "Galerina_RUNTIME_MEMORY_HEAP_EXHAUSTED"]);
    assert.deepEqual(codes(R.decideRuntimeAllocation(0, 0, p)), ["Galerina_RUNTIME_MEMORY_REQUEST_INVALID"]);
  });
});

describe("Node-hosted runtime adapter", () => {
  const ok = { nodeMajor: 22, permissionModelEnabled: true, allowedBuiltins: ["node:crypto", "node:buffer"], allowNativeAddons: false, allowEval: false };
  it("admits a permission-model host with allowlisted builtins", () => assert.equal(R.validateNodeHostAdapter(ok).allowed, true));
  it("refuses old Node, disabled permissions, addons, eval and process/vm/worker builtins", () => {
    assert.deepEqual(codes(R.validateNodeHostAdapter({ nodeMajor: 16, permissionModelEnabled: false, allowedBuiltins: ["node:child_process", "vm", "node:crypto", "node:crypto"], allowNativeAddons: true, allowEval: true })),
      ["Galerina_RUNTIME_NODE_BUILTIN_DENIED", "Galerina_RUNTIME_NODE_BUILTIN_DENIED", "Galerina_RUNTIME_NODE_BUILTIN_DUPLICATE", "Galerina_RUNTIME_NODE_EVAL", "Galerina_RUNTIME_NODE_NATIVE_ADDONS", "Galerina_RUNTIME_NODE_PERMISSION_MODEL", "Galerina_RUNTIME_NODE_VERSION"]);
    for (const b of ["node:child_process", "node:vm", "node:worker_threads", "node:inspector", "node:module", "node:fs"]) assert.ok(!R.NODE_HOST_BUILTIN_ALLOWLIST.includes(b), b);
  });
});

describe("host-runtime overhead report (integer only)", () => {
  it("reports integer permille overhead", () => {
    const r = R.createHostOverheadReport([{ label: "a", guestNs: 1000, hostNs: 150 }, { label: "b", guestNs: 3000, hostNs: 50 }]);
    assert.deepEqual([r.status, r.guestNsTotal, r.hostNsTotal, r.overheadPermille], ["MEASURED", 4000, 200, 50]);
  });
  it("is UNMEASURED for zero guest time and REFUSED for malformed samples or overflow", () => {
    assert.equal(R.createHostOverheadReport([]).status, "UNMEASURED");
    const bad = R.createHostOverheadReport([{ label: "x", guestNs: 1.5, hostNs: 1 }, { label: "", guestNs: 1, hostNs: 1 }]);
    assert.deepEqual([bad.status, bad.refusedLabels, bad.overheadPermille], ["REFUSED", ["x", ""], 0]);
    assert.equal(R.createHostOverheadReport([{ label: "big", guestNs: 1, hostNs: Number.MAX_SAFE_INTEGER }]).status, "REFUSED");
  });
});

describe("target fallback (opt-in, exact semantics, recorded)", () => {
  const targets = [
    { target: "gpu", available: false, semantics: "exact" },
    { target: "npu", available: true, semantics: "approximate" },
    { target: "cpu", available: true, semantics: "exact" },
  ];
  it("defaults to no fallback", () => {
    assert.deepEqual(R.decideTargetFallback(targets, { ...R.DEFAULT_TARGET_FALLBACK_POLICY, preferred: "gpu" }), { status: "REFUSED", target: "", reasons: ["gpu: unavailable", "fallback disabled"] });
    assert.equal(R.decideTargetFallback(targets, R.DEFAULT_TARGET_FALLBACK_POLICY).status, "PREFERRED");
  });
  it("falls back along the declared chain, skipping approximate and undeclared targets", () => {
    const d = R.decideTargetFallback(targets, { preferred: "gpu", fallbackChain: ["tpu", "npu", "cpu"], allowFallback: true });
    assert.deepEqual(d, { status: "FALLBACK", target: "cpu", reasons: ["gpu: unavailable", "tpu: not declared", "npu: approximate semantics"] });
    assert.equal(R.decideTargetFallback(targets, { preferred: "gpu", fallbackChain: ["npu"], allowFallback: true }).status, "REFUSED");
  });
});

describe("runtime resource budget", () => {
  it("the default budget is valid and grants no network, tools or accelerator time", () => {
    const b = R.DEFAULT_RUNTIME_RESOURCE_BUDGET;
    assert.equal(R.validateRuntimeResourceBudget(b).allowed, true);
    assert.deepEqual([b.networkRequests, b.toolCalls, b.acceleratorMs], [0, 0, 0]);
  });
  it("terminates on any exceeded resource and on malformed usage", () => {
    const usage = { ...R.DEFAULT_RUNTIME_RESOURCE_BUDGET, networkRequests: 1, recursionDepth: 513 };
    const c = R.checkRuntimeResourceUsage(usage, R.DEFAULT_RUNTIME_RESOURCE_BUDGET);
    assert.deepEqual([c.verdict, c.exceeded], ["TERMINATE", ["recursionDepth", "networkRequests"]]);
    assert.equal(R.checkRuntimeResourceUsage(R.DEFAULT_RUNTIME_RESOURCE_BUDGET, R.DEFAULT_RUNTIME_RESOURCE_BUDGET).verdict, "WITHIN_BUDGET");
    assert.equal(R.checkRuntimeResourceUsage({ ...R.DEFAULT_RUNTIME_RESOURCE_BUDGET, cpuMs: -1 }, R.DEFAULT_RUNTIME_RESOURCE_BUDGET).verdict, "TERMINATE");
  });
  it("refuses zero compute bounds, fractional values and CPU above wall time", () => {
    const v = R.validateRuntimeResourceBudget({ ...R.DEFAULT_RUNTIME_RESOURCE_BUDGET, tasks: 1, cpuMs: 20_000, recursionDepth: 0, toolCalls: 0.5 });
    assert.deepEqual(codes(v), ["Galerina_RUNTIME_BUDGET_CPU_EXCEEDS_WALL", "Galerina_RUNTIME_BUDGET_INVALID", "Galerina_RUNTIME_BUDGET_INVALID"]);
  });
});

describe("malicious-data intake pipeline", () => {
  const policy = { maxBytes: 256, maxDepth: 4, maxKeys: 8, maxStringLength: 32, requiredKeys: ["id"], allowedKeys: ["id", "tags"] };
  const stage = (text, owner = "tenant-a") => R.admitUntrustedData(text, policy, owner).failedStage;
  it("admits canonical, bounded, schema-conforming data, frozen and still tainted", () => {
    const r = R.admitUntrustedData('{"id":7,"tags":["a","b"]}', policy, "tenant-a");
    assert.deepEqual([r.admitted, r.failedStage, r.taint, r.owner], [true, "none", "untrusted", "tenant-a"]);
    assert.ok(Object.isFrozen(r.value) && Object.isFrozen(r.value.tags));
  });
  it("refuses at the first failing stage, in order", () => {
    assert.equal(stage(`{"id":"${"x".repeat(300)}"}`), "size");
    assert.equal(stage('{"id":1,}'), "parse");
    assert.equal(stage("[1]"), "parse");
    assert.equal(stage('{"id":{"a":{"b":{"c":{"d":1}}}}}'), "depth");
    assert.equal(stage(`{"id":"${"y".repeat(40)}"}`), "depth");
    assert.equal(stage('{"__proto__":{"admin":true},"id":1}'), "depth");
    assert.equal(stage('{"tags":[]}'), "schema");
    assert.equal(stage('{"id":1,"role":"admin"}'), "schema");
    assert.equal(stage('{"tags":[],"id":1}'), "canonical");
    assert.equal(stage('{"id":1,"id":2}'), "canonical");
    assert.equal(stage('{ "id":1}'), "canonical");
    assert.equal(stage('{"id":1}', " "), "ownership");
  });
  it("refuses invalid intake policy bounds before processing attacker input", () => {
    for (const patch of [{ maxDepth: 0 }, { maxDepth: Number.NaN }, { maxKeys: undefined }, { maxStringLength: -1 }]) {
      const result = R.admitUntrustedData('{"id":1}', { ...policy, ...patch }, "tenant-a");
      assert.equal(result.admitted, false);
      assert.equal(result.failedStage, "policy");
      assert.ok(codes(result).includes("Galerina_RUNTIME_INTAKE_POLICY"));
    }
  });
});

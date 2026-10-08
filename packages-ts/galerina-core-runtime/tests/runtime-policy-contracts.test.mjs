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

describe("RD-0855 governed target fallback (classified skips, bounded attempts)", () => {
  const cand = (over = {}) => ({
    target: "cpu",
    available: true,
    semantics: "exact",
    skipClass: "none",
    tritWidth: 1,
    tier: "k3-trit",
    effectOccurred: false,
    provedNonExecution: false,
    admittedIdempotency: false,
    ...over,
  });
  const pol = (over = {}) => ({
    ...R.DEFAULT_GOVERNED_TARGET_FALLBACK_POLICY,
    preferred: "w32",
    fallbackChain: ["k3"],
    allowFallback: true,
    requestedTritWidth: 32,
    ...over,
  });
  const w32 = cand({ target: "w32", tritWidth: 32, tier: "requested-width" });
  const k3 = cand({ target: "k3", tritWidth: 1, tier: "k3-trit" });
  const binary = cand({ target: "bin", tritWidth: 1, tier: "binary-same-semantics" });

  it("selects the preferred admitted width without fallback", () => {
    const d = R.decideGovernedTargetFallback([w32, k3], pol());
    assert.equal(d.status, "PREFERRED");
    assert.equal(d.target, "w32");
    assert.equal(d.selectedTier, "requested-width");
    assert.equal(d.authorityReleased, false);
    assert.equal(d.slideAdmission, "not-evaluated");
    assert.equal(d.vokDecision, "not-evaluated");
    assert.equal(d.attemptsUsed, 1);
    assert.equal(d.remainingAttempts, 1);
  });

  it("proposes K3 fallback only for authenticated pre-effect unavailability", () => {
    const d = R.decideGovernedTargetFallback([
      cand({ ...w32, available: false, skipClass: "unavailable" }),
      k3,
    ], pol());
    assert.equal(d.status, "FALLBACK");
    assert.equal(d.target, "k3");
    assert.equal(d.skipClass, "unavailable");
    assert.equal(d.selectedTier, "k3-trit");
    assert.equal(d.attemptsUsed, 2);
    assert.equal(d.keptRefusal, "");
  });

  it("proposes K3 fallback for authenticated pre-effect incompatibility", () => {
    const d = R.decideGovernedTargetFallback([
      cand({ ...w32, available: false, skipClass: "incompatible" }),
      k3,
    ], pol());
    assert.equal(d.status, "FALLBACK");
    assert.equal(d.target, "k3");
    assert.equal(d.skipClass, "incompatible");
  });

  it("refuses DENY, revocation, integrity, unknown, partial and cleanup without selecting the next target", () => {
    for (const skipClass of ["deny", "revoked", "integrity_invalid", "unknown_outcome", "partial_effect", "cleanup_failure"]) {
      const d = R.decideGovernedTargetFallback([
        cand({ ...w32, available: false, skipClass }),
        k3,
      ], pol());
      assert.equal(d.status, "REFUSED", skipClass);
      assert.equal(d.target, "", skipClass);
      assert.equal(d.keptRefusal, skipClass);
      assert.equal(d.skipClass, skipClass);
      assert.ok(d.reasons.some((r) => r.includes(skipClass)), skipClass);
    }
  });

  it("refuses when available:false has no skip class (unknown is not unavailability)", () => {
    const d = R.decideGovernedTargetFallback([
      cand({ ...w32, available: false, skipClass: "none" }),
      k3,
    ], pol());
    assert.equal(d.status, "REFUSED");
    assert.equal(d.skipClass, "skip_class_required");
    assert.equal(d.target, "");
  });

  it("refuses an effect that already occurred, even if labelled unavailable", () => {
    const d = R.decideGovernedTargetFallback([
      cand({ ...w32, available: false, skipClass: "unavailable", effectOccurred: true }),
      k3,
    ], pol());
    assert.equal(d.status, "REFUSED");
    assert.equal(d.skipClass, "effect_occurred");
    assert.equal(d.keptRefusal, "effect_occurred");
  });

  it("refuses contradictory provedNonExecution with effectOccurred", () => {
    const d = R.decideGovernedTargetFallback([
      cand({ ...w32, available: false, skipClass: "unavailable", effectOccurred: true, provedNonExecution: true }),
      k3,
    ], pol());
    assert.equal(d.status, "REFUSED");
    assert.equal(d.skipClass, "replay_uncertain");
  });

  it("does not treat admittedIdempotency as a licence to replay an uncertain effect", () => {
    const d = R.decideGovernedTargetFallback([
      cand({ ...w32, available: false, skipClass: "unknown_outcome", admittedIdempotency: true }),
      k3,
    ], pol());
    assert.equal(d.status, "REFUSED");
    assert.equal(d.keptRefusal, "unknown_outcome");
  });

  it("may retry a proved non-execution of the preferred target", () => {
    const d = R.decideGovernedTargetFallback([
      cand({ ...w32, available: true, skipClass: "none", provedNonExecution: true }),
      k3,
    ], pol());
    assert.equal(d.status, "PREFERRED");
    assert.equal(d.target, "w32");
  });

  it("never selects binary step 3; K3 still remains selectable ahead of it", () => {
    const d = R.decideGovernedTargetFallback([
      cand({ ...w32, available: false, skipClass: "unavailable" }),
      binary,
      k3,
    ], pol({ fallbackChain: ["bin", "k3"] }));
    assert.equal(d.status, "FALLBACK");
    assert.equal(d.target, "k3");
    assert.ok(d.reasons.includes("bin: binary_step_unresolved"));
  });

  it("refuses when the only remaining alternative is unresolved binary step 3", () => {
    const d = R.decideGovernedTargetFallback([
      cand({ ...w32, available: false, skipClass: "unavailable" }),
      binary,
    ], pol({ fallbackChain: ["bin"] }));
    assert.equal(d.status, "REFUSED");
    assert.ok(d.reasons.includes("bin: binary_step_unresolved"));
    assert.ok(d.reasons.includes("fallback chain exhausted"));
  });

  it("refuses unregistered 8 and 16 trit-width requests and a bare 8", () => {
    for (const width of [8, 16]) {
      const d = R.decideGovernedTargetFallback([w32, k3], pol({ requestedTritWidth: width }));
      assert.equal(d.status, "REFUSED", String(width));
      assert.equal(d.skipClass, "unregistered_width", String(width));
      assert.ok(codes(d).includes("Galerina_RUNTIME_FALLBACK_WIDTH_UNREGISTERED"), String(width));
    }
    assert.deepEqual(R.ADMITTED_TRIT_WIDTHS_V1, [1, 32, 64, 256]);
  });

  it("skips an unregistered-width chain candidate and does not activate it", () => {
    const eight = cand({ target: "w8", tritWidth: 8, tier: "requested-width", available: true, skipClass: "none" });
    const d = R.decideGovernedTargetFallback([
      cand({ ...w32, available: false, skipClass: "unavailable" }),
      eight,
      k3,
    ], pol({ fallbackChain: ["w8", "k3"] }));
    assert.equal(d.status, "FALLBACK");
    assert.equal(d.target, "k3");
    assert.ok(d.reasons.includes("w8: unregistered_width"));
  });

  it("stops the chain on a terminal skip and keeps that refusal", () => {
    const denied = cand({ target: "denied", tritWidth: 1, tier: "k3-trit", available: false, skipClass: "deny" });
    const d = R.decideGovernedTargetFallback([
      cand({ ...w32, available: false, skipClass: "unavailable" }),
      denied,
      k3,
    ], pol({ fallbackChain: ["denied", "k3"] }));
    assert.equal(d.status, "REFUSED");
    assert.equal(d.keptRefusal, "deny");
    assert.equal(d.target, "");
  });

  it("bounds attempts by count: maxAttempts 1 cannot take a fallback", () => {
    const d = R.decideGovernedTargetFallback([
      cand({ ...w32, available: false, skipClass: "unavailable" }),
      k3,
    ], pol({ attemptBudget: { maxAttempts: 1, deadlineMs: 10_000 } }));
    assert.equal(d.status, "REFUSED");
    assert.equal(d.skipClass, "budget_exhausted");
    assert.equal(d.keptRefusal, "unavailable");
  });

  it("bounds attempts by deadline", () => {
    const d = R.decideGovernedTargetFallback([w32, k3], pol(), { attemptsAlready: 0, elapsedMs: 10_000 });
    assert.equal(d.status, "REFUSED");
    assert.equal(d.skipClass, "deadline_exceeded");
  });

  it("refuses a spent attempt budget before evaluating targets", () => {
    const d = R.decideGovernedTargetFallback([w32, k3], pol(), { attemptsAlready: 2, elapsedMs: 0 });
    assert.equal(d.status, "REFUSED");
    assert.equal(d.skipClass, "budget_exhausted");
  });

  it("records OWNER-REVISIT as the retry budget owner and keeps fallback off by default", () => {
    assert.equal(R.ALTERNATIVE_ATTEMPT_BUDGET_OWNER, "OWNER-REVISIT");
    assert.deepEqual(R.DEFAULT_ALTERNATIVE_ATTEMPT_BUDGET, { maxAttempts: 2, deadlineMs: 10_000 });
    assert.equal(R.DEFAULT_GOVERNED_TARGET_FALLBACK_POLICY.allowFallback, false);
    const d = R.decideGovernedTargetFallback([
      cand({ ...w32, available: false, skipClass: "unavailable" }),
      k3,
    ], pol({ allowFallback: false }));
    assert.equal(d.status, "REFUSED");
    assert.ok(d.reasons.includes("fallback disabled"));
  });

  it("never lands on approximate semantics", () => {
    const approx = cand({ target: "approx", semantics: "approximate", tritWidth: 1, tier: "k3-trit" });
    const d = R.decideGovernedTargetFallback([
      cand({ ...w32, available: false, skipClass: "unavailable" }),
      approx,
    ], pol({ fallbackChain: ["approx"] }));
    assert.equal(d.status, "REFUSED");
    assert.ok(d.reasons.includes("approx: approximate_semantics"));
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

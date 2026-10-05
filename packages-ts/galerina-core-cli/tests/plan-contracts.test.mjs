import assert from "node:assert/strict";
import { test } from "node:test";

import {
  FUNGI_PLAN_001,
  FUNGI_PLAN_002,
  FUNGI_PLAN_003,
  FUNGI_PLAN_004,
  PLAN_RUNTIME_TARGETS,
  createComputePlan,
  estimateTarget,
  isPlanRuntimeTarget,
  readComputePlan,
} from "../dist/index.js";

const codes = (xs) => xs.map((d) => d.code);

const workspace = (over = {}) => ({
  effects: ["fs.read", "net.fetch"],
  capabilities: ["cap.read"],
  estimatedMemoryMb: 256,
  parallelism: 4,
  ...over,
});

const options = (over = {}) => ({
  includeGpu: true,
  includeOptical: true,
  includeWasm: true,
  includeCompatibility: true,
  requestedTarget: null,
  ...over,
});

test("isPlanRuntimeTarget admits only the closed vocabulary", () => {
  for (const t of PLAN_RUNTIME_TARGETS) assert.equal(isPlanRuntimeTarget(t), true);
  for (const bad of ["", "cpu", "GPU", null, 1, {}, undefined, "browser"]) {
    assert.equal(isPlanRuntimeTarget(bad), false, String(bad));
  }
});

test("estimateTarget accepts a closed workspace under options", () => {
  const plan = estimateTarget(workspace(), options());
  assert.deepEqual(plan.diagnostics, []);
  assert.equal(plan.target, "node");
  assert.equal(plan.estimatedMemoryMb, 256);
  assert.equal(plan.parallelism, 4);
  assert.equal(plan.wasm, "wasm");
  assert.notEqual(plan.gpu, null);
  assert.equal(plan.gpu.schema, "galerina.plan.gpu/v1");
  assert.equal(plan.gpu.recommendedTarget, "node");
  assert.notEqual(plan.optical, null);
  assert.equal(plan.optical.recommendedMode, "none");
  assert.notEqual(plan.compatibility, null);
  assert.equal(plan.compatibility.compatible, true);
});

test("estimateTarget respects include flags", () => {
  const plan = estimateTarget(
    workspace(),
    options({
      includeGpu: true,
      includeOptical: false,
      includeWasm: false,
      includeCompatibility: false,
    }),
  );
  assert.deepEqual(plan.diagnostics, []);
  assert.notEqual(plan.gpu, null);
  assert.equal(plan.optical, null);
  assert.equal(plan.wasm, null);
  assert.equal(plan.compatibility, null);
});

test("estimateTarget refuses non-plain input, accessors, unknown keys and missing fields", () => {
  assert.deepEqual(codes(estimateTarget(null, options()).diagnostics), [FUNGI_PLAN_001]);
  assert.deepEqual(codes(estimateTarget([], options()).diagnostics), [FUNGI_PLAN_001]);
  const proto = Object.create({ x: 1 });
  Object.assign(proto, workspace());
  assert.deepEqual(codes(estimateTarget(proto, options()).diagnostics), [FUNGI_PLAN_001]);
  const accessor = {};
  Object.defineProperty(accessor, "effects", { get: () => ["fs.read"], enumerable: true });
  Object.assign(accessor, {
    capabilities: ["cap.read"],
    estimatedMemoryMb: 1,
    parallelism: 1,
  });
  assert.deepEqual(codes(estimateTarget(accessor, options()).diagnostics), [FUNGI_PLAN_001]);
  assert.deepEqual(codes(estimateTarget({ ...workspace(), extra: true }, options()).diagnostics), [
    FUNGI_PLAN_001,
  ]);
  const missing = { effects: ["fs.read"], capabilities: ["cap.read"], estimatedMemoryMb: 1 };
  assert.deepEqual(codes(estimateTarget(missing, options()).diagnostics), [FUNGI_PLAN_001]);
});

test("estimateTarget never throws on hostile proxies and never echoes keys/values", () => {
  const hostile = new Proxy(
    {},
    {
      ownKeys: () => {
        throw new Error("ownKeys");
      },
      get: () => {
        throw new Error("get");
      },
      getOwnPropertyDescriptor: () => {
        throw new Error("desc");
      },
    },
  );
  assert.doesNotThrow(() => estimateTarget(hostile, options()));
  const diags = estimateTarget(workspace({ effects: ["Net.Fetch"] }), options()).diagnostics;
  const blob = JSON.stringify(diags);
  assert.equal(blob.includes("Net.Fetch"), false);
  assert.equal(blob.includes("fs.read"), false);
  assert.deepEqual(codes(diags), [FUNGI_PLAN_002]);
});

test("estimateTarget emits 003 when no include facet is true", () => {
  assert.deepEqual(
    codes(
      estimateTarget(
        workspace(),
        options({
          includeGpu: false,
          includeOptical: false,
          includeWasm: false,
          includeCompatibility: false,
        }),
      ).diagnostics,
    ),
    [FUNGI_PLAN_003],
  );
});

test("estimateTarget refuses NaN Infinity and negative numerics", () => {
  assert.deepEqual(codes(estimateTarget(workspace({ estimatedMemoryMb: NaN }), options()).diagnostics), [
    FUNGI_PLAN_002,
  ]);
  assert.deepEqual(codes(estimateTarget(workspace({ estimatedMemoryMb: Infinity }), options()).diagnostics), [
    FUNGI_PLAN_002,
  ]);
  assert.deepEqual(codes(estimateTarget(workspace({ parallelism: -1 }), options()).diagnostics), [
    FUNGI_PLAN_002,
  ]);
  assert.deepEqual(codes(estimateTarget(workspace({ parallelism: 1.5 }), options()).diagnostics), [
    FUNGI_PLAN_002,
  ]);
});

test("estimateTarget honours requestedTarget when closed", () => {
  const plan = estimateTarget(workspace(), options({ requestedTarget: "wasm" }));
  assert.deepEqual(plan.diagnostics, []);
  assert.equal(plan.target, "wasm");
  assert.equal(plan.compatibility.targets[0], "wasm");
});

test("createComputePlan and readComputePlan round-trip closed success", () => {
  const built = estimateTarget(workspace(), options());
  const created = createComputePlan(
    built.target,
    built.gpu,
    built.optical,
    built.wasm,
    built.compatibility,
    built.estimatedMemoryMb,
    built.parallelism,
    built.diagnostics,
  );
  const read = readComputePlan(created);
  assert.equal(read.ok, true);
  if (read.ok) {
    assert.equal(read.value.target, built.target);
    assert.equal(read.value.gpu.suitability, built.gpu.suitability);
    assert.equal(read.value.wasm, "wasm");
  }
});

test("readComputePlan emits 004 when GpuPlan recommendedTarget violates v1 freeze", () => {
  const built = estimateTarget(workspace(), options());
  const bad = {
    ...built,
    gpu: {
      schema: "galerina.plan.gpu/v1",
      suitability: "high",
      recommendedTarget: "gpu",
      diagnostics: [],
    },
  };
  const read = readComputePlan(bad);
  assert.equal(read.ok, false);
  if (!read.ok) assert.deepEqual(codes(read.diagnostics), [FUNGI_PLAN_004]);
});

test("createComputePlan snapshots diagnostic entries (no getter spread)", () => {
  let reads = 0;
  const entry = {};
  Object.defineProperty(entry, "code", {
    enumerable: true,
    get: () => {
      reads += 1;
      return FUNGI_PLAN_001;
    },
  });
  Object.defineProperty(entry, "severity", { enumerable: true, value: "error" });
  Object.defineProperty(entry, "message", { enumerable: true, value: "x" });
  Object.defineProperty(entry, "field", { enumerable: true, value: "record" });
  const created = createComputePlan("node", null, null, null, null, 0, 0, [entry]);
  assert.deepEqual(codes(created.diagnostics), [FUNGI_PLAN_001]);
  assert.equal(created.diagnostics[0].message.includes("plain data object") || created.diagnostics[0].message.includes("dense array"), true);
  reads = 0;
  void created.diagnostics[0].code;
  assert.equal(reads, 0);
});

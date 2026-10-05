import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DISTRIBUTED_GRAPH_ROLES,
  OPTICAL_FALLBACK_TARGETS,
  OPTICAL_NEEDS,
  OPTICAL_RECOMMENDED_MODES,
  OPTICAL_ROUTING_MODES,
  OPTICAL_RUNTIME_ARCHITECTURE_STAGES,
  PHOTONIC_AUDIT_CATEGORIES,
  V1_OPTICAL_TRANSPORT_AVAILABILITY,
  buildOpticalPlan,
  estimateOpticalNeed,
  isDistributedGraphAdmitted,
  isOpticalRoutingModeAdmitted,
} from "../dist/index.js";

const workload = (over = {}) => ({
  id: "w1",
  kind: "scalar",
  dataShape: {
    rank: 1,
    dimensions: [8],
    elementType: "f32",
    byteSize: 32,
    sensitive: false,
    streamable: false,
  },
  deployment: { environment: "test", onDevice: true, networkAllowed: false },
  operationCount: 10,
  memoryMb: 16,
  deterministic: true,
  effects: [],
  requiredCapabilities: [],
  preferredTargets: ["cpu"],
  fallbackTargets: ["cpu"],
  ...over,
});

describe("optical/photonic planning vocabulary", () => {
  it("freezes OpticalNeed / mode / fallback / routing / graph / audit lists", () => {
    assert.deepEqual([...OPTICAL_NEEDS], [
      "none",
      "data_movement",
      "topology_aware",
      "high_bandwidth",
      "unknown",
    ]);
    assert.deepEqual([...OPTICAL_RECOMMENDED_MODES], [
      "none",
      "optical_io_awareness",
      "photonic_planning_only",
    ]);
    assert.deepEqual([...OPTICAL_FALLBACK_TARGETS], ["network_io", "cpu", "cluster_runtime"]);
    assert.deepEqual([...OPTICAL_ROUTING_MODES], [
      "direct",
      "wavelength_multiplex",
      "space_division",
      "hybrid_electrical",
      "unspecified",
    ]);
    assert.deepEqual([...DISTRIBUTED_GRAPH_ROLES], [
      "source",
      "sink",
      "relay",
      "aggregator",
      "unspecified",
    ]);
    assert.deepEqual([...OPTICAL_RUNTIME_ARCHITECTURE_STAGES], [
      "optical_planner",
      "topology_resolver",
      "wavelength_allocator",
      "transport_adapter",
      "optical_backend",
    ]);
    assert.deepEqual([...PHOTONIC_AUDIT_CATEGORIES], [
      "optical_plan",
      "optical_fallback",
      "optical_need",
      "optical_transport_refused",
    ]);
    assert.equal(V1_OPTICAL_TRANSPORT_AVAILABILITY, "planning_only");
    for (const m of OPTICAL_ROUTING_MODES) assert.equal(isOpticalRoutingModeAdmitted(m), false);
    assert.equal(isDistributedGraphAdmitted(), false);
  });
});

describe("estimateOpticalNeed", () => {
  it("returns unknown for invalid workloads and none for small cpu-only shapes", () => {
    assert.equal(estimateOpticalNeed(workload({ kind: "nope" })), "unknown");
    assert.equal(estimateOpticalNeed(workload()), "none");
  });

  it("classifies route/streamable as topology_aware and large/stream as high_bandwidth", () => {
    assert.equal(estimateOpticalNeed(workload({ kind: "route" })), "topology_aware");
    assert.equal(
      estimateOpticalNeed(workload({ dataShape: { ...workload().dataShape, streamable: true } })),
      "topology_aware",
    );
    assert.equal(estimateOpticalNeed(workload({ kind: "stream" })), "high_bandwidth");
    assert.equal(estimateOpticalNeed(workload({ memoryMb: 2048 })), "high_bandwidth");
  });

  it("classifies optical preference / network / batch as data_movement", () => {
    assert.equal(
      estimateOpticalNeed(workload({ preferredTargets: ["optical_io"], effects: ["optical_io"] })),
      "data_movement",
    );
    assert.equal(
      estimateOpticalNeed(workload({ requiredCapabilities: ["OpticalTransport"] })),
      "data_movement",
    );
    assert.equal(
      estimateOpticalNeed(workload({ deployment: { environment: "test", onDevice: false, networkAllowed: true } })),
      "data_movement",
    );
    assert.equal(estimateOpticalNeed(workload({ kind: "batch" })), "data_movement");
  });
});

describe("buildOpticalPlan", () => {
  it("always falls back to cpu and never admits optical under the v1 freeze", () => {
    const plan = buildOpticalPlan(
      workload({
        preferredTargets: ["optical_io", "photonic"],
        effects: ["optical_io"],
        requiredCapabilities: ["OpticalTransport"],
        kind: "stream",
        memoryMb: 4096,
        deployment: { environment: "production", onDevice: false, networkAllowed: true },
      }),
    );
    assert.equal(plan.schemaVersion, "galerina.compute.optical-plan.v0.2");
    assert.equal(plan.fallback.target, "cpu");
    assert.ok(["optical_io_awareness", "photonic_planning_only", "none"].includes(plan.recommendedMode));
    assert.ok(plan.diagnostics.some((d) => d.code === "Galerina_OPTICAL_NOT_ADMITTED"));
    assert.ok(plan.diagnostics.some((d) => d.code === "Galerina_OPTICAL_CPU_FALLBACK"));
    assert.ok(Object.isFrozen(plan));
    assert.ok(Object.isFrozen(plan.fallback));
    assert.ok(Object.isFrozen(plan.diagnostics));
  });

  it("marks invalid workloads unknown/none-mode with cpu fallback", () => {
    const plan = buildOpticalPlan(workload({ kind: "nope" }));
    assert.equal(plan.need, "unknown");
    assert.equal(plan.recommendedMode, "none");
    assert.equal(plan.fallback.target, "cpu");
    assert.equal(plan.fallback.reason, "workload_invalid");
    assert.ok(plan.diagnostics.some((d) => d.code === "Galerina_OPTICAL_WORKLOAD_INVALID"));
  });

  it("refuses sensitive data on the optical path without echoing secrets", () => {
    const marker = "sk_live_do_not_echo_optical";
    const plan = buildOpticalPlan(
      workload({
        dataShape: { ...workload().dataShape, sensitive: true },
        preferredTargets: ["optical_io"],
        effects: ["optical_io"],
        id: marker,
      }),
    );
    assert.equal(plan.fallback.reason, "sensitive_data");
    assert.ok(plan.diagnostics.some((d) => d.code === "Galerina_OPTICAL_SENSITIVE"));
    assert.ok(!JSON.stringify(plan.diagnostics).includes(marker));
  });

  it("uses none mode and explicit cpu fallback when there is no optical need", () => {
    const plan = buildOpticalPlan(workload());
    assert.equal(plan.need, "none");
    assert.equal(plan.recommendedMode, "none");
    assert.equal(plan.fallback.target, "cpu");
    assert.ok(["no_optical_need", "explicit_cpu_fallback", "optical_not_admitted"].includes(plan.fallback.reason));
  });

  it("maps topology_aware need to photonic_planning_only mode", () => {
    const plan = buildOpticalPlan(workload({ kind: "route" }));
    assert.equal(plan.need, "topology_aware");
    assert.equal(plan.recommendedMode, "photonic_planning_only");
    assert.equal(plan.fallback.target, "cpu");
  });
});
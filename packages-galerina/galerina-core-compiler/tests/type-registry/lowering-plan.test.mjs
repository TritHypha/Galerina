// =============================================================================
// Phase 21 — Lowering Plan Tests
//
// Tests for:
//   Phase 21A: buildTypedArrayLoweringPlan, ELEMENT_TYPE_TO_TYPED_ARRAY,
//              PRODUCTION_ERASURE, DEV_ERASURE
//   Phase 21B: buildMonomorphisationPlan
//   Phase 21C: buildKernelFusionPlan
//   Phase 21D: buildLazyIteratorChain
// =============================================================================

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildTypedArrayLoweringPlan,
  buildMonomorphisationPlan,
  buildKernelFusionPlan,
  buildLazyIteratorChain,
  ELEMENT_TYPE_TO_TYPED_ARRAY,
  PRODUCTION_ERASURE,
  DEV_ERASURE,
} from "../../dist/index.js";

// ---------------------------------------------------------------------------
// Phase 21A — TypedArray lowering plan
// ---------------------------------------------------------------------------

describe("ELEMENT_TYPE_TO_TYPED_ARRAY: mapping completeness", () => {
  it("maps Float32 → Float32Array and Float64 → Float64Array", () => {
    assert.equal(ELEMENT_TYPE_TO_TYPED_ARRAY.get("Float32"), "Float32Array");
    assert.equal(ELEMENT_TYPE_TO_TYPED_ARRAY.get("Float64"), "Float64Array");
  });

  it("maps Int8, Int16, Int32 to correct TypedArray names", () => {
    assert.equal(ELEMENT_TYPE_TO_TYPED_ARRAY.get("Int8"),  "Int8Array");
    assert.equal(ELEMENT_TYPE_TO_TYPED_ARRAY.get("Int16"), "Int16Array");
    assert.equal(ELEMENT_TYPE_TO_TYPED_ARRAY.get("Int32"), "Int32Array");
  });

  it("returns undefined for unknown types", () => {
    assert.equal(ELEMENT_TYPE_TO_TYPED_ARRAY.get("String"), undefined);
    assert.equal(ELEMENT_TYPE_TO_TYPED_ARRAY.get("Bool"), undefined);
  });
});

describe("buildTypedArrayLoweringPlan: plan construction", () => {
  it("returns a plan with schemaVersion spore.lowering.v1", () => {
    const plan = buildTypedArrayLoweringPlan({ tensors: [] });
    assert.equal(plan.schemaVersion, "spore.lowering.v1");
  });

  it("maps Float32 tensors to Float32Array entries", () => {
    const plan = buildTypedArrayLoweringPlan({
      tensors: [
        { name: "embeddings", elementType: "Float32", shape: "768" },
        { name: "output",     elementType: "Float32", shape: "Batch * 768" },
      ],
    });
    assert.equal(plan.entries.length, 2);
    assert.equal(plan.entries[0].bindingName, "embeddings");
    assert.equal(plan.entries[0].elementType, "Float32");
    assert.equal(plan.entries[0].jsTypedArray, "Float32Array");
    assert.equal(plan.entries[0].lengthExpression, "768");

    assert.equal(plan.entries[1].bindingName, "output");
    assert.equal(plan.entries[1].lengthExpression, "Batch * 768");
  });

  it("skips tensors with unknown element types", () => {
    const plan = buildTypedArrayLoweringPlan({
      tensors: [
        { name: "label",      elementType: "String",  shape: "1" },
        { name: "score",      elementType: "Float32", shape: "1" },
        { name: "unknown",    elementType: "Complex128", shape: "16" },
      ],
    });
    // Only Float32 tensor should appear
    assert.equal(plan.entries.length, 1);
    assert.equal(plan.entries[0].bindingName, "score");
  });

  it("maps Int8 and Int32 tensors correctly", () => {
    const plan = buildTypedArrayLoweringPlan({
      tensors: [
        { name: "quantized", elementType: "Int8",  shape: "256" },
        { name: "indices",   elementType: "Int32", shape: "128" },
      ],
    });
    assert.equal(plan.entries.length, 2);
    assert.equal(plan.entries[0].jsTypedArray, "Int8Array");
    assert.equal(plan.entries[1].jsTypedArray, "Int32Array");
  });
});

// ---------------------------------------------------------------------------
// Phase 21A — Metadata erasure constants
// ---------------------------------------------------------------------------

describe("PRODUCTION_ERASURE and DEV_ERASURE: metadata flags", () => {
  it("PRODUCTION_ERASURE erases all metadata", () => {
    assert.equal(PRODUCTION_ERASURE.intentStrings, true);
    assert.equal(PRODUCTION_ERASURE.suggestedFixes, true);
    assert.equal(PRODUCTION_ERASURE.whyExplanations, true);
    assert.equal(PRODUCTION_ERASURE.contractComments, true);
  });

  it("DEV_ERASURE retains all metadata", () => {
    assert.equal(DEV_ERASURE.intentStrings, false);
    assert.equal(DEV_ERASURE.suggestedFixes, false);
    assert.equal(DEV_ERASURE.whyExplanations, false);
    assert.equal(DEV_ERASURE.contractComments, false);
  });
});

// ---------------------------------------------------------------------------
// Phase 21B — Monomorphisation plan
// ---------------------------------------------------------------------------

describe("buildMonomorphisationPlan: schema and stub", () => {
  it("returns schemaVersion spore.mono.v1", () => {
    const plan = buildMonomorphisationPlan([]);
    assert.equal(plan.schemaVersion, "spore.mono.v1");
  });

  it("returns empty candidates for non-generic flows", () => {
    const plan = buildMonomorphisationPlan([
      { name: "computeScore", qualifier: "pure" },
      { name: "fetchUser",    qualifier: "guarded" },
    ]);
    assert.equal(plan.candidates.length, 0);
  });
});

// ---------------------------------------------------------------------------
// Phase 21C — Kernel fusion plan
// ---------------------------------------------------------------------------

describe("buildKernelFusionPlan: schema and fusion grouping", () => {
  it("returns schemaVersion spore.fusion.v1", () => {
    const plan = buildKernelFusionPlan([], []);
    assert.equal(plan.schemaVersion, "spore.fusion.v1");
  });

  it("groups consecutive fusable tensor ops into a single kernel", () => {
    const plan = buildKernelFusionPlan(
      [{ name: "embeddings" }],
      ["Tensor.scale", "Tensor.add", "Tensor.relu", "Http.get", "Tensor.sqrt"],
    );
    // "Tensor.scale", "Tensor.add", "Tensor.relu" should be one group
    assert.ok(plan.groups.length >= 1, "Should have at least one fusion group");
    const group = plan.groups[0];
    assert.ok(group.ops.includes("Tensor.scale"));
    assert.ok(group.ops.includes("Tensor.add"));
    assert.ok(group.ops.includes("Tensor.relu"));
    assert.ok(group.wasmSimdEligible, "Fused group must be WASM SIMD eligible");
    assert.ok(group.gpuEligible, "Fused group must be GPU eligible");
    assert.ok(group.fusedName.startsWith("fused_"), "fusedName must start with fused_");
  });

  it("does not create groups for non-fusable ops", () => {
    const plan = buildKernelFusionPlan(
      [{ name: "flow" }],
      ["Http.get", "Database.insert", "AuditLog.write"],
    );
    assert.equal(plan.groups.length, 0, "Non-tensor ops should not be fused");
  });
});

// ---------------------------------------------------------------------------
// Phase 21D — Lazy iterator chain
// ---------------------------------------------------------------------------

describe("buildLazyIteratorChain: chain properties", () => {
  it("all-pure filter+map chain is fusable with zero allocations", () => {
    const chain = buildLazyIteratorChain("users", [
      { op: "filter", lambda: "(u) => u.active", pure: true },
      { op: "map",    lambda: "(u) => u.name",   pure: true },
    ]);
    assert.equal(chain.source, "users");
    assert.equal(chain.fusable, true);
    assert.equal(chain.estimatedAllocations, 0);
  });

  it("chain with collect is not fusable (allocates output)", () => {
    const chain = buildLazyIteratorChain("items", [
      { op: "filter",  lambda: "(x) => x > 0", pure: true },
      { op: "collect", lambda: "",              pure: true },
    ]);
    // collect is not a zero-alloc op
    assert.equal(chain.fusable, false);
    assert.equal(chain.estimatedAllocations, 1);
  });

  it("impure stage makes the chain non-fusable", () => {
    const chain = buildLazyIteratorChain("orders", [
      { op: "filter", lambda: "(o) => o.paid", pure: false },
      { op: "map",    lambda: "(o) => o.id",   pure: true },
    ]);
    assert.equal(chain.fusable, false);
  });

  it("reduce is not zero-alloc — counted in estimatedAllocations", () => {
    const chain = buildLazyIteratorChain("nums", [
      { op: "map",    lambda: "(n) => n * 2", pure: true },
      { op: "reduce", lambda: "(a, b) => a + b", pure: true },
    ]);
    assert.equal(chain.estimatedAllocations, 1);
  });
});

// ---------------------------------------------------------------------------
// GIR: TypedArrayLoweringPlan wired into GIRFlow
// ---------------------------------------------------------------------------

import { emitGIR } from "../../dist/index.js";
import { parseProgram } from "../../dist/index.js";
import { checkEffects } from "../../dist/index.js";

describe("GIR: TypedArrayLoweringPlan wired into GIRFlow", () => {
  function makeGIR(source) {
    const parseResult = parseProgram(source);
    const effectResults = checkEffects(parseResult.flows, parseResult.ast);
    return emitGIR(parseResult.ast, parseResult.flows, effectResults);
  }

  it("flow with Tensor<Float32,[768]> param produces GIRFlow with typedArrayLoweringPlan", () => {
    const { gir } = makeGIR(`
      pure flow embed(v: Tensor<Float32, [768]>) -> Float32 {
        return 0.0
      }
    `);
    assert.equal(gir.flows.length, 1);
    const flow = gir.flows[0];
    assert.ok(
      flow.typedArrayLoweringPlan !== undefined,
      "typedArrayLoweringPlan should be present for a flow with tensor params",
    );
  });

  it("loweringPlan.entries[0].jsTypedArray === 'Float32Array' for Tensor<Float32,[768]>", () => {
    const { gir } = makeGIR(`
      pure flow embed(v: Tensor<Float32, [768]>) -> Float32 {
        return 0.0
      }
    `);
    const flow = gir.flows[0];
    assert.ok(flow.typedArrayLoweringPlan !== undefined);
    assert.ok(flow.typedArrayLoweringPlan.entries.length > 0);
    assert.equal(flow.typedArrayLoweringPlan.entries[0].jsTypedArray, "Float32Array");
  });

  it("pure flow with no tensors has typedArrayLoweringPlan undefined or absent", () => {
    const { gir } = makeGIR(`
      pure flow add(x: Int32, y: Int32) -> Int32 {
        return 0
      }
    `);
    assert.equal(gir.flows.length, 1);
    const flow = gir.flows[0];
    assert.equal(
      flow.typedArrayLoweringPlan,
      undefined,
      "typedArrayLoweringPlan should be absent for flows with no tensors",
    );
  });
});

// =============================================================================
// Galerina Phase 21 — Lowering Plan Types
//
// Defines the data structures and stub builders for the compiler's lowering
// pipeline: TypedArray lowering, metadata erasure, monomorphisation,
// kernel fusion, and lazy iterator chains.
//
// Phase 21A: TypedArray lowering metadata + metadata erasure
// Phase 21B: Monomorphisation plan
// Phase 21C: Kernel fusion plan
// Phase 21D: Lazy iterator chain
// =============================================================================

// ---------------------------------------------------------------------------
// Phase 21A — TypedArray lowering metadata
// ---------------------------------------------------------------------------

/** Maps a single tensor binding to its JavaScript TypedArray lowering target. */
export interface TypedArrayLoweringEntry {
  readonly bindingName: string;
  readonly elementType: "Float32" | "Float64" | "Int8" | "Int16" | "Int32";
  readonly lengthExpression: string;  // e.g. "768" or "Batch * 768"
  readonly jsTypedArray: "Float32Array" | "Float64Array" | "Int8Array" | "Int16Array" | "Int32Array";
}

/** Complete lowering plan for all tensor bindings in a GIR flow. */
export interface TypedArrayLoweringPlan {
  readonly schemaVersion: "fungi.lowering.v1";
  readonly flowName: string;
  readonly entries: readonly TypedArrayLoweringEntry[];
}

/** Maps Galerina element type names to their JavaScript TypedArray equivalents. */
export const ELEMENT_TYPE_TO_TYPED_ARRAY: ReadonlyMap<string, string> = new Map([
  ["Float32", "Float32Array"],
  ["Float64", "Float64Array"],
  ["Int8",    "Int8Array"],
  ["Int16",   "Int16Array"],
  ["Int32",   "Int32Array"],
]);

/**
 * Builds a TypedArrayLoweringPlan from GIR flow tensor metadata.
 *
 * Stub: Phase 21A — maps tensor element types to TypedArray equivalents.
 * Full implementation: Phase 21A lowering pipeline.
 */
export function buildTypedArrayLoweringPlan(
  girFlow: { tensors: readonly { name: string; elementType: string; shape: string }[] },
): TypedArrayLoweringPlan {
  const entries: TypedArrayLoweringEntry[] = [];

  for (const tensor of girFlow.tensors) {
    const jsTypedArray = ELEMENT_TYPE_TO_TYPED_ARRAY.get(tensor.elementType);
    if (jsTypedArray === undefined) {
      // Unknown element type — skip for now; Phase 21A full impl will emit a diagnostic
      continue;
    }

    const validElementTypes = ["Float32", "Float64", "Int8", "Int16", "Int32"] as const;
    const elementType = validElementTypes.find((t) => t === tensor.elementType); // perf-allow: loop-array-find — membership over a fixed 5-element literal type list (Float32/64, Int8/16/32)
    if (elementType === undefined) continue;

    const validTypedArrays = ["Float32Array", "Float64Array", "Int8Array", "Int16Array", "Int32Array"] as const;
    const typed = validTypedArrays.find((t) => t === jsTypedArray); // perf-allow: loop-array-find — membership over a fixed 5-element literal type list (Float32/64, Int8/16/32)
    if (typed === undefined) continue;

    entries.push({
      bindingName: tensor.name,
      elementType,
      lengthExpression: tensor.shape,
      jsTypedArray: typed,
    });
  }

  return {
    schemaVersion: "fungi.lowering.v1",
    flowName: "unknown", // Phase 21A: flowName not available at tensor level; caller sets
    entries,
  };
}

// ---------------------------------------------------------------------------
// Phase 21A — Metadata erasure
//
// Governs which developer-facing metadata annotations are erased from
// production builds. Metadata includes intent strings, suggested fixes,
// why explanations, and contract comments.
// ---------------------------------------------------------------------------

/** Specifies which classes of metadata annotations are erased. */
export interface EraseableMetadata {
  readonly intentStrings: boolean;
  readonly suggestedFixes: boolean;
  readonly whyExplanations: boolean;
  readonly contractComments: boolean;
}

/** Production erasure: all metadata stripped for minimal binary size. */
export const PRODUCTION_ERASURE: EraseableMetadata = {
  intentStrings:    true,
  suggestedFixes:   true,
  whyExplanations:  true,
  contractComments: true,
} as const;

/** Development erasure: all metadata retained for IDE support. */
export const DEV_ERASURE: EraseableMetadata = {
  intentStrings:    false,
  suggestedFixes:   false,
  whyExplanations:  false,
  contractComments: false,
} as const;

// ---------------------------------------------------------------------------
// Phase 21B — Monomorphisation plan
// ---------------------------------------------------------------------------

/** A specific instantiation of a generic flow with concrete type bindings. */
export interface MonomorphisationSpecialisation {
  readonly suffix: string;          // e.g. "_Int", "_Float32"
  readonly typeBindings: ReadonlyMap<string, string>;
  readonly estimatedInstructions: number;
}

/** A generic flow that is a candidate for monomorphisation. */
export interface MonomorphisationCandidate {
  readonly flowName: string;
  readonly genericParams: readonly string[];
  readonly specialisations: readonly MonomorphisationSpecialisation[];
}

/** Complete monomorphisation plan for a program. */
export interface MonomorphisationPlan {
  readonly schemaVersion: "fungi.mono.v1";
  readonly candidates: readonly MonomorphisationCandidate[];
}

/**
 * Identifies flows that could benefit from monomorphisation.
 *
 * Stub: Phase 21B — identifies flows with generic qualifier (placeholder detection).
 * Full implementation: Phase 21B — type-level generic parameter resolution.
 */
export function buildMonomorphisationPlan(
  flows: readonly { name: string; qualifier: string }[],
): MonomorphisationPlan {
  // Stub: for now, no candidates are identified. Full Phase 21B implementation
  // will inspect GIR type tables for generic type parameters.
  const candidates: MonomorphisationCandidate[] = [];

  for (const flow of flows) {
    // Placeholder: flows with qualifier "generic" are treated as candidates
    if (flow.qualifier === "generic") {
      candidates.push({
        flowName: flow.name,
        genericParams: ["T"],
        specialisations: [],
      });
    }
  }

  return {
    schemaVersion: "fungi.mono.v1",
    candidates,
  };
}

// ---------------------------------------------------------------------------
// Phase 21C — Kernel fusion plan
// ---------------------------------------------------------------------------

/**
 * A group of sequential tensor operations that can be fused into a single kernel.
 * Fusion eliminates intermediate allocations and enables SIMD/GPU acceleration.
 */
export interface KernelFusionGroup {
  readonly ops: readonly string[];   // e.g. ["Tensor.scale", "Tensor.add", "Tensor.relu"]
  readonly fusedName: string;        // e.g. "fused_scale_add_relu"
  readonly wasmSimdEligible: boolean;
  readonly gpuEligible: boolean;
}

/** Complete kernel fusion plan for a GIR flow. */
export interface KernelFusionPlan {
  readonly schemaVersion: "fungi.fusion.v1";
  readonly flowName: string;
  readonly groups: readonly KernelFusionGroup[];
}

/** Set of tensor ops that are eligible for kernel fusion. */
const FUSABLE_TENSOR_OPS = new Set([
  "Tensor.scale",
  "Tensor.add",
  "Tensor.sub",
  "Tensor.mul",
  "Tensor.relu",
  "Tensor.sigmoid",
  "Tensor.tanh",
  "Tensor.sqrt",
  "Tensor.abs",
]);

/**
 * Identifies fusable sequential tensor operations and builds a fusion plan.
 *
 * Stub: Phase 21C — groups consecutive fusable ops from the op sequence.
 * Full implementation: Phase 21C — GIR data-flow analysis for fusion safety.
 */
export function buildKernelFusionPlan(
  tensors: readonly { name: string }[],
  ops: readonly string[],
): KernelFusionPlan {
  const firstTensor = tensors[0];
  const flowName = firstTensor !== undefined ? firstTensor.name : "unknown";
  const groups: KernelFusionGroup[] = [];

  // Collect consecutive fusable ops into groups
  let currentGroup: string[] = [];

  for (const op of ops) {
    if (FUSABLE_TENSOR_OPS.has(op)) {
      currentGroup.push(op);
    } else {
      if (currentGroup.length >= 2) {
        const suffix = currentGroup
          .map((o) => o.replace("Tensor.", ""))
          .join("_");
        groups.push({
          ops: [...currentGroup],
          fusedName: `fused_${suffix}`,
          wasmSimdEligible: true,
          gpuEligible: true,
        });
      }
      currentGroup = [];
    }
  }

  // Flush remaining group
  if (currentGroup.length >= 2) {
    const suffix = currentGroup
      .map((o) => o.replace("Tensor.", ""))
      .join("_");
    groups.push({
      ops: [...currentGroup],
      fusedName: `fused_${suffix}`,
      wasmSimdEligible: true,
      gpuEligible: true,
    });
  }

  return {
    schemaVersion: "fungi.fusion.v1",
    flowName,
    groups,
  };
}

// ---------------------------------------------------------------------------
// Phase 21D — Lazy iterator chain
// ---------------------------------------------------------------------------

/** Operations that can appear in a lazy iterator chain. */
export type LazyIteratorOp = "filter" | "map" | "flatMap" | "take" | "skip" | "reduce" | "collect";

/** A single stage in a lazy iterator chain. */
export interface LazyIteratorStage {
  readonly op: LazyIteratorOp;
  readonly lambda: string;  // source representation
  readonly pure: boolean;
}

/**
 * A complete lazy iterator chain — zero-allocation transformation pipeline.
 * Maps to WASM iterator chains without intermediate heap allocations.
 */
export interface LazyIteratorChain {
  readonly source: string;
  readonly stages: readonly LazyIteratorStage[];
  readonly fusable: boolean;
  readonly estimatedAllocations: number;
}

/** Set of ops that do NOT terminate a fusable chain (no allocation needed). */
const ZERO_ALLOC_OPS: ReadonlySet<LazyIteratorOp> = new Set(["filter", "map", "take", "skip"]);

/**
 * Builds a LazyIteratorChain from a source and list of stages.
 * The chain is fusable if all stages are pure and zero-allocation.
 */
export function buildLazyIteratorChain(
  source: string,
  stages: readonly LazyIteratorStage[],
): LazyIteratorChain {
  const allPure = stages.every((s) => s.pure);
  const allZeroAlloc = stages.every((s) => ZERO_ALLOC_OPS.has(s.op));
  const fusable = allPure && allZeroAlloc;

  // Estimate allocations: each non-zero-alloc op allocates once
  const estimatedAllocations = stages.filter((s) => !ZERO_ALLOC_OPS.has(s.op)).length;

  return {
    source,
    stages,
    fusable,
    estimatedAllocations,
  };
}

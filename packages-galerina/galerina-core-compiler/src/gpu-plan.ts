// =============================================================================
// Galerina Phase 22B / 23A/B — GPU, NPU, and APU Plan Types
//
// Defines data structures and stub builders for:
//   Phase 22B: WebGPU compute plan and NPU kernel plan
//   Phase 23A/B: APU shared memory plan
//
// These are architecture/type stubs. Full implementation in Phase 22/23.
// =============================================================================

// ---------------------------------------------------------------------------
// Phase 22B — WebGPU Compute Plan
// ---------------------------------------------------------------------------

/**
 * A WebGPU compute shader plan for a single GIR flow.
 * The shaderSource is a WGSL stub in Phase 22B; full WGSL emission in Phase 23.
 */
export interface WebGPUComputePlan {
  readonly schemaVersion: "spore.gpu.v1";
  readonly flowName: string;
  readonly shaderSource: string;     // WGSL stub
  readonly bindGroups: readonly { binding: number; name: string; type: "storage" | "uniform" }[];
  readonly workgroupSize: readonly [number, number, number];
}

/** Minimal WGSL compute shader skeleton for Phase 22B stubs. */
const WGSL_SKELETON_TEMPLATE = `@group(0) @binding(0)
var<storage, read_write> output: array<f32>;

@compute @workgroup_size(64, 1, 1)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
  // Phase 23: full kernel body emitted here
  let i = id.x;
  output[i] = 0.0;
}`;

/**
 * Builds a WebGPU compute plan stub for a flow.
 *
 * Stub: Phase 22B — returns a minimal WGSL compute shader skeleton.
 * Full implementation: Phase 23 — full WGSL emission from GIR tensor ops.
 */
export function buildWebGPUPlan(
  flowName: string,
  tensors: readonly { name: string; elementType: string }[],
): WebGPUComputePlan {
  // Build bind groups from tensors (each tensor becomes a storage binding)
  const bindGroups = tensors.map((tensor, index) => ({
    binding: index,
    name: tensor.name,
    type: "storage" as const,
  }));

  return {
    schemaVersion: "spore.gpu.v1",
    flowName,
    shaderSource: WGSL_SKELETON_TEMPLATE,
    bindGroups,
    workgroupSize: [64, 1, 1],
  };
}

// ---------------------------------------------------------------------------
// Phase 22B — NPU Kernel Plan
// ---------------------------------------------------------------------------

/**
 * An NPU kernel execution plan for a single GIR flow.
 * Targets neural processing units via ONNX model export.
 */
export interface NPUKernelPlan {
  readonly schemaVersion: "spore.npu.v1";
  readonly flowName: string;
  readonly inputShapes: readonly string[];
  readonly outputShapes: readonly string[];
  readonly quantized: boolean;
  readonly onnxModelPath?: string;    // Phase 23: path to exported ONNX model
}

/**
 * Builds an NPU kernel plan for a flow.
 *
 * Stub: Phase 22B — identifies NPU-compatible tensors and builds shape lists.
 * Full implementation: Phase 23 — ONNX model export.
 */
export function buildNPUPlan(
  flowName: string,
  tensors: readonly { name: string; elementType: string; shape: string; npuCompatible: boolean }[],
): NPUKernelPlan {
  const compatible = tensors.filter((t) => t.npuCompatible);

  // Split compatible tensors into inputs (first half) and outputs (second half)
  // Phase 23: GIR data-flow analysis determines actual input/output roles
  const midpoint = Math.ceil(compatible.length / 2);
  const inputShapes  = compatible.slice(0, midpoint).map((t) => t.shape);
  const outputShapes = compatible.slice(midpoint).map((t) => t.shape);

  // Quantized if any compatible tensor uses Int8 element type
  const quantized = compatible.some((t) => t.elementType === "Int8");

  return {
    schemaVersion: "spore.npu.v1",
    flowName,
    inputShapes,
    outputShapes,
    quantized,
    // onnxModelPath: undefined in Phase 22B; set by Phase 23 ONNX exporter
  };
}

// ---------------------------------------------------------------------------
// Phase 23A/B — APU Shared Memory Plan
// ---------------------------------------------------------------------------

/**
 * A single shared buffer in APU memory.
 * APU shared memory buffers are zero-copy between CPU and NPU/GPU cores.
 */
export interface APUSharedBuffer {
  readonly name: string;
  readonly elementType: string;
  readonly shape: readonly number[];
  readonly accessPattern: "readonly" | "readwrite";
  readonly zeroOnReturn: boolean;     // for redacted outputs
}

/**
 * Complete APU shared memory plan for a flow.
 * Maps tensor bindings to APU shared memory buffers for zero-copy execution.
 */
export interface APUSharedMemoryPlan {
  readonly schemaVersion: "spore.apu.v1";
  readonly flowName: string;
  readonly sharedBuffers: readonly APUSharedBuffer[];
}

/**
 * Parses a shape string like "[768]" or "[32, 32]" into a number array.
 * Dynamic dimensions (non-numeric) are represented as 0.
 */
function parseShape(shapeStr: string): readonly number[] {
  const trimmed = shapeStr.trim();
  if (!trimmed.startsWith("[") || !trimmed.endsWith("]")) return [];
  const inner = trimmed.slice(1, -1).trim();
  if (inner === "") return [];
  return inner.split(",").map((s) => {
    const n = Number(s.trim());
    return Number.isFinite(n) ? n : 0;
  });
}

/**
 * Builds an APU shared memory plan for a flow.
 *
 * Stub: Phase 23A/B — identifies APU-eligible tensors and allocates shared buffers.
 * Full implementation: Phase 23B — zero-copy APU memory management.
 */
export function buildAPUSharedMemoryPlan(
  flowName: string,
  tensors: readonly {
    name: string;
    elementType: string;
    shape: string;
    apuSharedMemoryCandidate: boolean;
    quantized: boolean;
  }[],
): APUSharedMemoryPlan {
  const sharedBuffers: APUSharedBuffer[] = [];

  for (const tensor of tensors) {
    if (!tensor.apuSharedMemoryCandidate) continue;

    sharedBuffers.push({
      name: tensor.name,
      elementType: tensor.elementType,
      shape: parseShape(tensor.shape),
      // Quantized tensors are readonly (Int8 outputs should be redacted on return)
      accessPattern: tensor.quantized ? "readonly" : "readwrite",
      // Zero output buffers on return when quantized (prevent information leakage)
      zeroOnReturn: tensor.quantized,
    });
  }

  return {
    schemaVersion: "spore.apu.v1",
    flowName,
    sharedBuffers,
  };
}

/**
 * galerina-ext-bridge-bitnet — Governed BitNet CPU inference bridge
 *
 * Wraps the official Microsoft BitNet.cpp library (MIT License) with Galerina governance.
 * Source: C:\wwwprojects\BitNet (local clone of github.com/microsoft/BitNet)
 *
 * C API surface (from ggml-bitnet.h):
 *   ggml_bitnet_init()                    — initialize the BitNet backend
 *   ggml_bitnet_free()                    — cleanup and release all resources
 *   ggml_bitnet_can_mul_mat()             — check if ternary matrix multiply is supported for tensor types
 *   ggml_bitnet_mul_mat_get_wsize()       — get required working memory size for a matmul
 *   ggml_bitnet_mul_mat_task_init()       — initialize LUT quantization for input tensor
 *   ggml_bitnet_mul_mat_task_compute()    — execute ternary matrix multiply (core compute kernel)
 *   ggml_bitnet_transform_tensor()        — transform tensor weights to BitNet internal format
 *   ggml_bitnet_get_type_bits()           — get bit-width for a ggml quantization type
 *   ggml_bitnet_set_n_threads()           — configure CPU thread count
 *   ggml_qgemm_lut()                      — ARM TL1 / x86 TL2 low-level GEMM kernel
 *   ggml_preprocessor()                   — ARM TL1 / x86 TL2 LUT preprocessor
 *
 * Governance: every call produces an AuditEvent (CBOR Tag 410).
 * Lifecycle:  Load → Init → Compute → Free → Erase
 *
 * Kernel families (LowBitAiKernelFamily):
 *   tl1      — ARM NEON SIMD (arm64, uses GGML_BITNET_ARM_TL1)
 *   tl2      — x86 AVX2/VNNI (x86_64, uses GGML_BITNET_X86_TL2)
 *   ternary  — generic fallback (no SIMD intrinsics)
 *   auto     — detected at runtime based on process.arch
 *
 * Quantization types supported by ggml_bitnet_can_mul_mat():
 *   Q4_0, IQ2_XXS, IQ3_XXS — BitNet quantization (scales only, no zeros)
 *   Note: i-quant models produce wrong results (BitNet.cpp limitation, see ggml-bitnet.h)
 */

import { TowerRuntime, PluginMetadata } from "@galerina/tower-citizen";

// BitNet model descriptor — matches BitNet b1.58 2B4T model format
export interface BitNetModelSpec {
  readonly modelPath:    string;   // path to .gguf model file
  readonly nThreads:    number;   // CPU thread count (default: 4)
  readonly kernelFamily: "tl1" | "tl2" | "ternary" | "auto";  // LowBitAiKernelFamily
  readonly maxTokens:   number;   // max output tokens
  readonly contextSize: number;   // context window size (default: 2048)
}

// BitNet inference request
export interface BitNetRequest {
  readonly prompt:        string;
  readonly correlationId: string;  // propagates through full Tower lifecycle
  readonly maxNewTokens?: number;
  readonly temperature?:  number;  // 0 = deterministic (recommended for governance)
}

// BitNet inference response — includes full governance receipt
export interface BitNetResponse {
  readonly text:          string;
  readonly tokenCount:    number;
  readonly latencyMs:     number;
  readonly correlationId: string;
  readonly outputHash:    string;   // sha256 for audit trail
  readonly kernelUsed:    string;   // which BitNet kernel ran
  readonly trapFired:     boolean;
  readonly auditEventId?: string;   // reference to AuditEvent in the Tower log
}

// Governance metadata for the BitNet plugin
const BITNET_METADATA: PluginMetadata = {
  engineId:        "bitnet-cpu-v1.58-2b",
  artifactPath:    "C:/wwwprojects/BitNet",
  artifactHash:    "sha256:bitnet-b1.58-2b4t-local",  // computed from actual binary in production
  governanceTier:  1,          // Tier 1: CPU, air-gapped, highest governance
  license:         "MIT",
  maxMemoryMB:     450,        // BitNet 2B model: ~0.4GB vs 2-5GB for standard FP16
  capabilityMask:  0b00100000, // V_DPM bit 5 (ai.inference) only
};

export class BitNetBridge {
  private readonly tower: TowerRuntime;
  private readonly modelSpec: BitNetModelSpec;
  private initialized = false;

  constructor(modelSpec: BitNetModelSpec, tower?: TowerRuntime) {
    this.modelSpec = modelSpec;
    this.tower = tower ?? new TowerRuntime({
      assimilationMemoryBudgetMB: 512,
      auditDepth: "full",
    });
  }

  // ── LOAD + INIT ───────────────────────────────────────────────────────────
  // Maps to: ggml_bitnet_init() in ggml-bitnet.h
  // Sets thread count via: ggml_bitnet_set_n_threads(nThreads)

  async initialize(): Promise<{ correlationId: string }> {
    // Stage A: stub — real implementation calls ggml_bitnet_init() via Node.js native addon
    // Stage B: when galerina-ext-bridge-cpp is built, this dispatches to the C function
    //
    // Production path (Node.js native addon via node-gyp / cmake-js):
    //   const addon = require('./build/Release/bitnet-addon.node');
    //   addon.ggml_bitnet_init();
    //   addon.ggml_bitnet_set_n_threads(this.modelSpec.nThreads);
    //   addon.ggml_bitnet_transform_tensor(weightTensor);  // convert weights to BitNet format
    //
    // After init, ggml_bitnet_can_mul_mat() returns true for Q4_0/IQ2_XXS/IQ3_XXS tensors.

    const { correlationId } = await this.tower.load(BITNET_METADATA, `BITNET-INIT-${Date.now()}`);
    this.initialized = true;
    console.log(`  BitNet initialized [${correlationId}] tier-1 CPU engine`);
    console.log(`     kernel: ${this.modelSpec.kernelFamily} | threads: ${this.modelSpec.nThreads}`);
    console.log(`     memory: ~450MB | context: ${this.modelSpec.contextSize} tokens`);
    return { correlationId };
  }

  // ── GOVERNED INFERENCE ─────────────────────────────────────────────────────
  // Maps to: ggml_bitnet_mul_mat_task_compute() in ggml-bitnet.h
  //
  // Full compute sequence for one forward pass:
  //   1. ggml_bitnet_mul_mat_get_wsize(src0, src1, dst)    → alloc working buffer
  //   2. ggml_bitnet_mul_mat_task_init(src1, qlut,          → quantize input to LUT
  //                                    lut_scales, lut_biases,
  //                                    n, k, m, bits)
  //   3. ggml_bitnet_mul_mat_task_compute(src0, scales,     → ternary matmul
  //                                       qlut, lut_scales,
  //                                       lut_biases, dst,
  //                                       n, k, m, bits)
  //
  // On ARM (TL1):  dispatches to ggml_qgemm_lut() + ggml_preprocessor()
  // On x86 (TL2): dispatches to ggml_qgemm_lut() + ggml_preprocessor()
  //               (different signatures — bs/three_k/two_k params for AVX2/VNNI)

  async infer(request: BitNetRequest): Promise<BitNetResponse> {
    if (!this.initialized) throw new Error("BitNet not initialized. Call initialize() first.");

    const { sandbox, correlationId } = await this.tower.load(
      BITNET_METADATA,
      request.correlationId
    );

    try {
      // Governance: validate input before compute
      const result = await this.tower.execute(sandbox, request, correlationId);
      if (!result.success) {
        return {
          text: "", tokenCount: 0, latencyMs: result.latencyMs,
          correlationId, outputHash: result.outputHash,
          kernelUsed: this.modelSpec.kernelFamily,
          trapFired: true,
        };
      }

      // Stage A stub — real compute path:
      //   const wsize = addon.ggml_bitnet_mul_mat_get_wsize(src0, src1, dst);
      //   addon.ggml_bitnet_mul_mat_task_init(src1, qlut, lut_scales, lut_biases, n, k, m, bits);
      //   addon.ggml_bitnet_mul_mat_task_compute(src0, scales, qlut, lut_scales, lut_biases, dst, n, k, m, bits);
      // Returns: ternary matrix multiply result → decoded tokens → text
      const resolvedKernel = this.modelSpec.kernelFamily === "auto"
        ? (process.arch === "arm64" ? "tl1" : "tl2")
        : this.modelSpec.kernelFamily;
      const stubText = `[BitNet inference stub: "${request.prompt.slice(0, 40)}..." — wire ggml_bitnet_mul_mat_task_compute() for production]`;

      await this.tower.erase(sandbox, correlationId, result);

      return {
        text: stubText,
        tokenCount: request.maxNewTokens ?? 100,
        latencyMs: result.latencyMs,
        correlationId,
        outputHash: result.outputHash,
        kernelUsed: resolvedKernel,
        trapFired: false,
      };
    } catch (err) {
      await this.tower.erase(sandbox, correlationId);
      throw err;
    }
  }

  // ── FREE ─────────────────────────────────────────────────────────────────
  // Maps to: ggml_bitnet_free() in ggml-bitnet.h
  // Releases all BitNet backend resources (LUT buffers, weight tensors).

  async shutdown(): Promise<void> {
    // Production: addon.ggml_bitnet_free();
    this.initialized = false;
    console.log("  BitNet shutdown — memory released");
  }

  isInitialized(): boolean { return this.initialized; }
  getModelSpec(): BitNetModelSpec { return this.modelSpec; }
  getAudit() { return this.tower.getAudit(); }
}

// Convenience factory — auto-selects kernel family based on CPU
export function createBitNetBridge(modelPath: string, options: Partial<BitNetModelSpec> = {}): BitNetBridge {
  const isArm = process.arch === "arm64";
  const kernelFamily = options.kernelFamily ?? (isArm ? "tl1" : "tl2");

  return new BitNetBridge({
    modelPath,
    nThreads: options.nThreads ?? 4,
    kernelFamily,
    maxTokens: options.maxTokens ?? 256,
    contextSize: options.contextSize ?? 2048,
  });
}

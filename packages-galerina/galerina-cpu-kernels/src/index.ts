export type CpuKernelOperation =
  | "gemm"
  | "gemv"
  | "dot"
  | "matmul"
  | "ternary_matmul"
  | "embedding_lookup"
  | "low_bit_decode";

export type CpuKernelDataType =
  | "f32"
  | "f16"
  | "bf16"
  | "i8"
  | "i2_s"
  | "ternary";

export type CpuKernelFeature =
  | "threaded"
  | "tiled"
  | "cache-aware"
  | "simd"
  | "lookup-table"
  | "embedding-quantized";

export interface CpuKernelTilePlan {
  readonly rows: number;
  readonly columns: number;
  readonly depth: number;
}

export interface CpuKernelPlan {
  readonly name: string;
  readonly operation: CpuKernelOperation;
  readonly inputType: CpuKernelDataType;
  readonly outputType: CpuKernelDataType;
  readonly requiredFeatures: readonly CpuKernelFeature[];
  readonly tile?: CpuKernelTilePlan;
  readonly threads: number;
}

export interface CpuKernelBenchmark {
  readonly planName: string;
  readonly tokensPerSecond?: number;
  readonly operationsPerSecond?: number;
  readonly memoryBytesPerSecond?: number;
  readonly energyJoules?: number;
}

export interface CpuKernelReport {
  readonly plans: readonly CpuKernelPlan[];
  readonly benchmarks: readonly CpuKernelBenchmark[];
  readonly calibrationCache?: CpuKernelCalibrationCache;
  readonly diagnostics: readonly CpuKernelDiagnostic[];
  readonly warnings: readonly string[];
}

export interface CpuKernelNativeAbi {
  readonly symbolName: string;
  readonly callingConvention: "c" | "system" | "wasm";
  readonly inputs: readonly CpuKernelDataType[];
  readonly output: CpuKernelDataType;
  readonly alignmentBytes: number;
}

export interface CpuKernelCalibrationEntry {
  readonly planName: string;
  readonly architecture: string;
  readonly simd: readonly string[];
  readonly threads: number;
  readonly preferredTile?: CpuKernelTilePlan;
}

export interface CpuKernelCalibrationCache {
  readonly entries: readonly CpuKernelCalibrationEntry[];
  readonly generatedAt: string;
}

export type CpuKernelDiagnosticSeverity = "warning" | "error";

export interface CpuKernelDiagnostic {
  readonly code: string;
  readonly severity: CpuKernelDiagnosticSeverity;
  readonly message: string;
  readonly path?: string;
}

export function requiresLowBitKernel(plan: CpuKernelPlan): boolean {
  return (
    plan.inputType === "i2_s" ||
    plan.inputType === "ternary" ||
    plan.operation === "ternary_matmul" ||
    plan.operation === "low_bit_decode"
  );
}

export function validateCpuKernelPlan(
  plan: CpuKernelPlan,
): readonly CpuKernelDiagnostic[] {
  const diagnostics: CpuKernelDiagnostic[] = [];

  if (plan.name.trim().length === 0) {
    diagnostics.push({
      code: "Galerina_CPU_KERNEL_NAME_REQUIRED",
      severity: "error",
      message: "CPU kernel plan requires a name.",
      path: "name",
    });
  }

  if (plan.threads <= 0) {
    diagnostics.push({
      code: "Galerina_CPU_KERNEL_THREADS_REQUIRED",
      severity: "error",
      message: "CPU kernel plan requires a positive thread count.",
      path: "threads",
    });
  }

  if (requiresLowBitKernel(plan) && !plan.requiredFeatures.includes("simd")) {
    diagnostics.push({
      code: "Galerina_CPU_KERNEL_LOW_BIT_REQUIRES_SIMD",
      severity: "warning",
      message: "Low-bit CPU kernels should declare SIMD as a required feature.",
      path: "requiredFeatures",
    });
  }

  if (
    plan.tile !== undefined &&
    (plan.tile.rows <= 0 || plan.tile.columns <= 0 || plan.tile.depth <= 0)
  ) {
    diagnostics.push({
      code: "Galerina_CPU_KERNEL_TILE_INVALID",
      severity: "error",
      message: "CPU kernel tile dimensions must be positive.",
      path: "tile",
    });
  }

  return diagnostics;
}

export function createCpuKernelReport(
  plans: readonly CpuKernelPlan[],
  benchmarks: readonly CpuKernelBenchmark[] = [],
  calibrationCache?: CpuKernelCalibrationCache,
): CpuKernelReport {
  const diagnostics = plans.flatMap((plan) => validateCpuKernelPlan(plan));

  return {
    plans,
    benchmarks,
    ...(calibrationCache === undefined ? {} : { calibrationCache }),
    diagnostics,
    warnings: diagnostics
      .filter((diagnostic) => diagnostic.severity === "warning")
      .map((diagnostic) => diagnostic.message),
  };
}

export function validateCpuKernelNativeAbi(
  abi: CpuKernelNativeAbi,
): readonly CpuKernelDiagnostic[] {
  const diagnostics: CpuKernelDiagnostic[] = [];

  if (abi.symbolName.trim().length === 0) {
    diagnostics.push({
      code: "Galerina_CPU_KERNEL_ABI_SYMBOL_REQUIRED",
      severity: "error",
      message: "Native CPU kernel ABI requires a symbol name.",
      path: "symbolName",
    });
  }

  if (abi.alignmentBytes <= 0) {
    diagnostics.push({
      code: "Galerina_CPU_KERNEL_ABI_ALIGNMENT_INVALID",
      severity: "error",
      message: "Native CPU kernel ABI alignment must be positive.",
      path: "alignmentBytes",
    });
  }

  return diagnostics;
}

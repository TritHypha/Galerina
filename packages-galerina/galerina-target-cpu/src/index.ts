export type CpuArchitecture = "x86_64" | "arm64" | "wasm32" | "unknown";

export type CpuSimdFeature =
  | "sse4_2"
  | "avx2"
  | "avx512"
  | "neon"
  | "dotprod"
  | "sve";

export type CpuWorkloadClass =
  | "scalar"
  | "vector"
  | "matrix"
  | "low-bit-ai"
  | "io-bound";

export interface CpuThreadingPolicy {
  readonly maxThreads: number;
  readonly pinThreads: boolean;
  readonly allowBackgroundThreads: boolean;
}

export interface CpuTargetCapability {
  readonly architecture: CpuArchitecture;
  readonly logicalCores: number;
  readonly simd: readonly CpuSimdFeature[];
  readonly memoryBytes?: number;
  readonly supportsNativeBinary: boolean;
  readonly supportsLowBitKernels: boolean;
}

export interface CpuTargetPlan {
  readonly workload: CpuWorkloadClass;
  readonly requiredFeatures: readonly CpuSimdFeature[];
  readonly threading: CpuThreadingPolicy;
  readonly memoryLimitBytes?: number;
  readonly fallbackOf?: string;
}

export interface CpuTargetReport {
  readonly capability: CpuTargetCapability;
  readonly plans: readonly CpuTargetPlan[];
  readonly selectedPlan?: CpuTargetPlan;
  readonly fallbackUsed: boolean;
  readonly diagnostics: readonly CpuTargetDiagnostic[];
  readonly warnings: readonly string[];
}

export interface CpuFeatureProbe {
  readonly source: "runtime" | "config" | "report" | "manual";
  readonly capability: CpuTargetCapability;
  readonly checkedAt?: string;
}

export type CpuTargetDiagnosticSeverity = "warning" | "error";

export interface CpuTargetDiagnostic {
  readonly code: string;
  readonly severity: CpuTargetDiagnosticSeverity;
  readonly message: string;
  readonly path?: string;
}

export interface CpuCalibrationSample {
  readonly workload: CpuWorkloadClass;
  readonly threads: number;
  readonly durationMs: number;
  readonly operationsPerSecond?: number;
  readonly tokensPerSecond?: number;
}

export interface CpuCalibrationReport {
  readonly capability: CpuTargetCapability;
  readonly samples: readonly CpuCalibrationSample[];
  readonly diagnostics: readonly CpuTargetDiagnostic[];
}

export function supportsCpuFeatures(
  capability: CpuTargetCapability,
  requiredFeatures: readonly CpuSimdFeature[],
): boolean {
  return requiredFeatures.every((feature) => capability.simd.includes(feature));
}

export function canUseLowBitCpuPath(
  capability: CpuTargetCapability,
): boolean {
  if (!capability.supportsLowBitKernels) {
    return false;
  }

  if (capability.architecture === "x86_64") {
    return capability.simd.includes("avx2");
  }

  if (capability.architecture === "arm64") {
    return capability.simd.includes("neon");
  }

  return false;
}

export function validateCpuFeatureProbe(
  probe: CpuFeatureProbe,
): readonly CpuTargetDiagnostic[] {
  const diagnostics: CpuTargetDiagnostic[] = [];

  if (probe.capability.logicalCores <= 0) {
    diagnostics.push({
      code: "Galerina_CPU_LOGICAL_CORES_REQUIRED",
      severity: "error",
      message: "CPU capability requires at least one logical core.",
      path: "capability.logicalCores",
    });
  }

  if (
    probe.capability.memoryBytes !== undefined &&
    probe.capability.memoryBytes <= 0
  ) {
    diagnostics.push({
      code: "Galerina_CPU_MEMORY_BYTES_INVALID",
      severity: "error",
      message: "CPU memory bytes must be positive when declared.",
      path: "capability.memoryBytes",
    });
  }

  return diagnostics;
}

export function selectCpuTargetPlan(
  capability: CpuTargetCapability,
  plans: readonly CpuTargetPlan[],
): CpuTargetReport {
  const diagnostics: CpuTargetDiagnostic[] = [];

  for (const plan of plans) {
    const featureSupported = supportsCpuFeatures(
      capability,
      plan.requiredFeatures,
    );
    const memorySupported =
      plan.memoryLimitBytes === undefined ||
      capability.memoryBytes === undefined ||
      plan.memoryLimitBytes <= capability.memoryBytes;
    const lowBitSupported =
      plan.workload !== "low-bit-ai" || canUseLowBitCpuPath(capability);

    if (featureSupported && memorySupported && lowBitSupported) {
      return {
        capability,
        plans,
        selectedPlan: plan,
        fallbackUsed: plan.fallbackOf !== undefined,
        diagnostics,
        warnings: [],
      };
    }
  }

  diagnostics.push({
    code: "Galerina_CPU_NO_COMPATIBLE_PLAN",
    severity: "error",
    message: "No CPU target plan is compatible with the reported capability.",
    path: "plans",
  });

  return {
    capability,
    plans,
    fallbackUsed: true,
    diagnostics,
    warnings: ["CPU fallback could not be satisfied."],
  };
}

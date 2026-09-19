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
  /** Undefined means capability admission was refused. */
  readonly capability: CpuTargetCapability | undefined;
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

type CpuDecodeResult<T> =
  | { readonly value: T }
  | { readonly diagnostic: CpuTargetDiagnostic };

const CPU_ARCHITECTURES: readonly CpuArchitecture[] = ["x86_64", "arm64", "wasm32", "unknown"];
const CPU_SIMD_FEATURES: readonly CpuSimdFeature[] = ["sse4_2", "avx2", "avx512", "neon", "dotprod", "sve"];
const CPU_WORKLOADS: readonly CpuWorkloadClass[] = ["scalar", "vector", "matrix", "low-bit-ai", "io-bound"];
const CPU_PROBE_SOURCES: readonly CpuFeatureProbe["source"][] = ["runtime", "config", "report", "manual"];
const MAX_CPU_ARRAY_ITEMS = 1024;

function cpuIsStructuredCloneable(value: unknown): boolean {
  try {
    structuredClone(value);
    return true;
  } catch {
    return false;
  }
}

function cpuDecodeFailure(path: string, detail: string): CpuDecodeResult<never> {
  return {
    diagnostic: {
      code: "FUNGI-CPU-001",
      severity: "error",
      message: `CPU target input must be an exact own-data value: ${detail}.`,
      path,
    },
  };
}

function cpuDecodeString(value: unknown, path: string): CpuDecodeResult<string> {
  return typeof value === "string" ? { value } : cpuDecodeFailure(path, "expected a string");
}

function cpuDecodeBoolean(value: unknown, path: string): CpuDecodeResult<boolean> {
  return typeof value === "boolean" ? { value } : cpuDecodeFailure(path, "expected a boolean");
}

function cpuDecodeNumber(value: unknown, path: string): CpuDecodeResult<number> {
  return typeof value === "number" && Number.isFinite(value) &&
      Number.isSafeInteger(value) && !Object.is(value, -0)
    ? { value }
    : cpuDecodeFailure(path, "expected a finite safe integer");
}

function cpuDecodeRecord(
  value: unknown,
  allowedKeys: readonly string[],
  requiredKeys: readonly string[],
  path: string,
): CpuDecodeResult<Record<string, unknown>> {
  try {
    if (typeof value !== "object" || value === undefined || value === null) {
      return cpuDecodeFailure(path, "expected an object record");
    }
    if (Object.getPrototypeOf(value) !== Object.prototype) {
      return cpuDecodeFailure(path, "inherited or non-plain records are refused");
    }
    const keys = Reflect.ownKeys(value);
    const stringKeys = keys.filter((key): key is string => typeof key === "string");
    if (stringKeys.length !== keys.length ||
        stringKeys.some((key) => !allowedKeys.includes(key)) ||
        requiredKeys.some((key) => !stringKeys.includes(key))) {
      return cpuDecodeFailure(path, "surplus, symbol, or missing fields are refused");
    }
    const copy: Record<string, unknown> = {};
    for (const key of stringKeys) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (descriptor === undefined || !("value" in descriptor)) {
        return cpuDecodeFailure(`${path}.${key}`, "accessor properties are refused");
      }
      copy[key] = descriptor.value;
    }
    return { value: copy };
  } catch {
    return cpuDecodeFailure(path, "exceptional or proxy-like records are refused");
  }
}

function cpuDecodeArray(value: unknown, path: string): CpuDecodeResult<readonly unknown[]> {
  try {
    if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) {
      return cpuDecodeFailure(path, "expected a plain array");
    }
    const lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
    if (lengthDescriptor === undefined || !("value" in lengthDescriptor) ||
        typeof lengthDescriptor.value !== "number" ||
        !Number.isSafeInteger(lengthDescriptor.value) ||
        lengthDescriptor.value < 0 || lengthDescriptor.value > MAX_CPU_ARRAY_ITEMS) {
      return cpuDecodeFailure(path, "array length is invalid or unbounded");
    }
    const length = lengthDescriptor.value;
    const keys = Reflect.ownKeys(value);
    if (keys.length !== length + 1 || !keys.includes("length")) {
      return cpuDecodeFailure(path, "sparse or surplus array fields are refused");
    }
    for (const key of keys) {
      if (key === "length") continue;
      if (typeof key !== "string" || !/^\d+$/.test(key) ||
          String(Number(key)) !== key || Number(key) >= length) {
        return cpuDecodeFailure(path, "sparse or surplus array fields are refused");
      }
    }
    const copy: unknown[] = [];
    for (let index = 0; index < length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (descriptor === undefined || !("value" in descriptor)) {
        return cpuDecodeFailure(`${path}.${index}`, "array elements must be own data");
      }
      copy.push(descriptor.value);
    }
    return { value: Object.freeze(copy) };
  } catch {
    return cpuDecodeFailure(path, "exceptional or proxy-like arrays are refused");
  }
}

function cpuDecodeStringArray(value: unknown, path: string): CpuDecodeResult<readonly string[]> {
  const decoded = cpuDecodeArray(value, path);
  if ("diagnostic" in decoded) return decoded;
  const copy: string[] = [];
  for (const [index, item] of decoded.value.entries()) {
    const stringValue = cpuDecodeString(item, `${path}.${index}`);
    if ("diagnostic" in stringValue) return stringValue;
    copy.push(stringValue.value);
  }
  if (!cpuIsStructuredCloneable(value)) {
    return cpuDecodeFailure(path, "proxy-backed arrays are refused");
  }
  return { value: Object.freeze(copy) };
}

function cpuDecodeFeatures(value: unknown, path: string): CpuDecodeResult<readonly CpuSimdFeature[]> {
  const decoded = cpuDecodeStringArray(value, path);
  if ("diagnostic" in decoded) return decoded;
  if (decoded.value.some((feature) => !CPU_SIMD_FEATURES.includes(feature as CpuSimdFeature))) {
    return cpuDecodeFailure(path, "unknown SIMD vocabulary");
  }
  return { value: decoded.value as readonly CpuSimdFeature[] };
}

function cpuDecodeCapability(value: unknown, path: string): CpuDecodeResult<CpuTargetCapability> {
  const record = cpuDecodeRecord(
    value,
    ["architecture", "logicalCores", "simd", "memoryBytes", "supportsNativeBinary", "supportsLowBitKernels"],
    ["architecture", "logicalCores", "simd", "supportsNativeBinary", "supportsLowBitKernels"],
    path,
  );
  if ("diagnostic" in record) return record;
  const architecture = cpuDecodeString(record.value.architecture, `${path}.architecture`);
  if ("diagnostic" in architecture) return architecture;
  const logicalCores = cpuDecodeNumber(record.value.logicalCores, `${path}.logicalCores`);
  if ("diagnostic" in logicalCores) return logicalCores;
  const simd = cpuDecodeFeatures(record.value.simd, `${path}.simd`);
  if ("diagnostic" in simd) return simd;
  const supportsNativeBinary = cpuDecodeBoolean(record.value.supportsNativeBinary, `${path}.supportsNativeBinary`);
  if ("diagnostic" in supportsNativeBinary) return supportsNativeBinary;
  const supportsLowBitKernels = cpuDecodeBoolean(record.value.supportsLowBitKernels, `${path}.supportsLowBitKernels`);
  if ("diagnostic" in supportsLowBitKernels) return supportsLowBitKernels;
  const memoryBytes = record.value.memoryBytes === undefined
    ? { value: undefined }
    : cpuDecodeNumber(record.value.memoryBytes, `${path}.memoryBytes`);
  if ("diagnostic" in memoryBytes) return memoryBytes;
  if (!cpuIsStructuredCloneable(value)) {
    return cpuDecodeFailure(path, "proxy-backed records are refused");
  }
  return {
    value: Object.freeze({
      architecture: architecture.value as CpuArchitecture,
      logicalCores: logicalCores.value,
      simd: simd.value,
      ...(memoryBytes.value === undefined ? {} : { memoryBytes: memoryBytes.value }),
      supportsNativeBinary: supportsNativeBinary.value,
      supportsLowBitKernels: supportsLowBitKernels.value,
    }),
  };
}

function cpuDecodeThreading(value: unknown, path: string): CpuDecodeResult<CpuThreadingPolicy> {
  const record = cpuDecodeRecord(
    value,
    ["maxThreads", "pinThreads", "allowBackgroundThreads"],
    ["maxThreads", "pinThreads", "allowBackgroundThreads"],
    path,
  );
  if ("diagnostic" in record) return record;
  const maxThreads = cpuDecodeNumber(record.value.maxThreads, `${path}.maxThreads`);
  if ("diagnostic" in maxThreads) return maxThreads;
  const pinThreads = cpuDecodeBoolean(record.value.pinThreads, `${path}.pinThreads`);
  if ("diagnostic" in pinThreads) return pinThreads;
  const allowBackgroundThreads = cpuDecodeBoolean(
    record.value.allowBackgroundThreads,
    `${path}.allowBackgroundThreads`,
  );
  if ("diagnostic" in allowBackgroundThreads) return allowBackgroundThreads;
  if (!cpuIsStructuredCloneable(value)) {
    return cpuDecodeFailure(path, "proxy-backed records are refused");
  }
  return {
    value: Object.freeze({
      maxThreads: maxThreads.value,
      pinThreads: pinThreads.value,
      allowBackgroundThreads: allowBackgroundThreads.value,
    }),
  };
}

function cpuDecodePlan(value: unknown, path: string): CpuDecodeResult<CpuTargetPlan> {
  const record = cpuDecodeRecord(
    value,
    ["workload", "requiredFeatures", "threading", "memoryLimitBytes", "fallbackOf"],
    ["workload", "requiredFeatures", "threading"],
    path,
  );
  if ("diagnostic" in record) return record;
  const workload = cpuDecodeString(record.value.workload, `${path}.workload`);
  if ("diagnostic" in workload) return workload;
  const requiredFeatures = cpuDecodeFeatures(record.value.requiredFeatures, `${path}.requiredFeatures`);
  if ("diagnostic" in requiredFeatures) return requiredFeatures;
  const threading = cpuDecodeThreading(record.value.threading, `${path}.threading`);
  if ("diagnostic" in threading) return threading;
  const memoryLimitBytes = record.value.memoryLimitBytes === undefined
    ? { value: undefined }
    : cpuDecodeNumber(record.value.memoryLimitBytes, `${path}.memoryLimitBytes`);
  if ("diagnostic" in memoryLimitBytes) return memoryLimitBytes;
  const fallbackOf = record.value.fallbackOf === undefined
    ? { value: undefined }
    : cpuDecodeString(record.value.fallbackOf, `${path}.fallbackOf`);
  if ("diagnostic" in fallbackOf) return fallbackOf;
  if (!cpuIsStructuredCloneable(value)) {
    return cpuDecodeFailure(path, "proxy-backed records are refused");
  }
  return {
    value: Object.freeze({
      workload: workload.value as CpuWorkloadClass,
      requiredFeatures: requiredFeatures.value,
      threading: threading.value,
      ...(memoryLimitBytes.value === undefined ? {} : { memoryLimitBytes: memoryLimitBytes.value }),
      ...(fallbackOf.value === undefined ? {} : { fallbackOf: fallbackOf.value }),
    }),
  };
}

function validateCpuCapability(capability: CpuTargetCapability): readonly CpuTargetDiagnostic[] {
  const diagnostics: CpuTargetDiagnostic[] = [];
  if (!CPU_ARCHITECTURES.includes(capability.architecture)) {
    diagnostics.push({
      code: "FUNGI-CPU-001",
      severity: "error",
      message: "CPU capability architecture is outside the closed vocabulary.",
      path: "capability.architecture",
    });
  }
  if (capability.logicalCores <= 0) {
    diagnostics.push({
      code: "FUNGI-CPU-002",
      severity: "error",
      message: "CPU capability requires at least one logical core.",
      path: "capability.logicalCores",
    });
  }
  if (capability.memoryBytes !== undefined && capability.memoryBytes <= 0) {
    diagnostics.push({
      code: "FUNGI-CPU-003",
      severity: "error",
      message: "CPU memory bytes must be positive when declared.",
      path: "capability.memoryBytes",
    });
  }
  return diagnostics;
}

function validateCpuPlan(plan: CpuTargetPlan, path: string): readonly CpuTargetDiagnostic[] {
  const diagnostics: CpuTargetDiagnostic[] = [];
  if (!CPU_WORKLOADS.includes(plan.workload)) {
    diagnostics.push({
      code: "FUNGI-CPU-001",
      severity: "error",
      message: "CPU plan workload is outside the closed vocabulary.",
      path: `${path}.workload`,
    });
  }
  if (plan.threading.maxThreads <= 0) {
    diagnostics.push({
      code: "FUNGI-CPU-001",
      severity: "error",
      message: "CPU threading maxThreads must be positive.",
      path: `${path}.threading.maxThreads`,
    });
  }
  if (plan.memoryLimitBytes !== undefined && plan.memoryLimitBytes <= 0) {
    diagnostics.push({
      code: "FUNGI-CPU-001",
      severity: "error",
      message: "CPU memory limits must be positive when declared.",
      path: `${path}.memoryLimitBytes`,
    });
  }
  return diagnostics;
}

function freezeCpuDiagnostics(diagnostics: readonly CpuTargetDiagnostic[]): readonly CpuTargetDiagnostic[] {
  return Object.freeze(diagnostics.map((diagnostic) => Object.freeze({ ...diagnostic })));
}

export function supportsCpuFeatures(
  capability: CpuTargetCapability,
  requiredFeatures: readonly CpuSimdFeature[],
): boolean {
  const decodedCapability = cpuDecodeCapability(capability, "capability");
  if ("diagnostic" in decodedCapability || validateCpuCapability(decodedCapability.value).length > 0) {
    return false;
  }
  const available = cpuDecodeFeatures(decodedCapability.value.simd, "capability.simd");
  const required = cpuDecodeFeatures(requiredFeatures, "requiredFeatures");
  if ("diagnostic" in available || "diagnostic" in required) return false;
  return required.value.every((feature) => available.value.includes(feature));
}

export function canUseLowBitCpuPath(
  capability: CpuTargetCapability,
): boolean {
  const decodedCapability = cpuDecodeCapability(capability, "capability");
  if ("diagnostic" in decodedCapability || validateCpuCapability(decodedCapability.value).length > 0) {
    return false;
  }
  const admittedCapability = decodedCapability.value;
  if (!admittedCapability.supportsLowBitKernels) {
    return false;
  }

  if (admittedCapability.architecture === "x86_64") {
    return admittedCapability.simd.includes("avx2");
  }

  if (admittedCapability.architecture === "arm64") {
    return admittedCapability.simd.includes("neon");
  }

  return false;
}

export function validateCpuFeatureProbe(
  probe: CpuFeatureProbe,
): readonly CpuTargetDiagnostic[] {
  const record = cpuDecodeRecord(probe, ["source", "capability", "checkedAt"], ["source", "capability"], "probe");
  if ("diagnostic" in record) return [record.diagnostic];
  const source = cpuDecodeString(record.value.source, "probe.source");
  if ("diagnostic" in source || !CPU_PROBE_SOURCES.includes(source.value as CpuFeatureProbe["source"])) {
    return ["diagnostic" in source ? source.diagnostic : {
      code: "FUNGI-CPU-001",
      severity: "error",
      message: "CPU probe source is outside the closed vocabulary.",
      path: "probe.source",
    }];
  }
  const capability = cpuDecodeCapability(record.value.capability, "probe.capability");
  if ("diagnostic" in capability) return [capability.diagnostic];
  if (Object.hasOwn(record.value, "checkedAt") && record.value.checkedAt !== undefined) {
    const checkedAt = cpuDecodeString(record.value.checkedAt, "probe.checkedAt");
    if ("diagnostic" in checkedAt) return [checkedAt.diagnostic];
  }
  if (!cpuIsStructuredCloneable(probe)) {
    const probeFailure = cpuDecodeFailure("probe", "proxy-backed records are refused");
    if ("diagnostic" in probeFailure) return [probeFailure.diagnostic];
  }
  return freezeCpuDiagnostics(validateCpuCapability(capability.value));
}

export function selectCpuTargetPlan(
  capability: CpuTargetCapability,
  plans: readonly CpuTargetPlan[],
): CpuTargetReport {
  const diagnostics: CpuTargetDiagnostic[] = [];
  const decodedCapability = cpuDecodeCapability(capability, "capability");
  const decodedPlans = cpuDecodeArray(plans, "plans");
  let admittedCapability: CpuTargetCapability | undefined;
  const admittedPlans: CpuTargetPlan[] = [];

  if ("diagnostic" in decodedCapability) {
    diagnostics.push(decodedCapability.diagnostic);
  } else {
    const capabilityDiagnostics = validateCpuCapability(decodedCapability.value);
    diagnostics.push(...capabilityDiagnostics);
    if (capabilityDiagnostics.every((diagnostic) => diagnostic.severity !== "error")) {
      admittedCapability = decodedCapability.value;
    }
  }

  if ("diagnostic" in decodedPlans) {
    diagnostics.push(decodedPlans.diagnostic);
  } else {
    for (const [index, value] of decodedPlans.value.entries()) {
      const decodedPlan = cpuDecodePlan(value, `plans.${index}`);
      if ("diagnostic" in decodedPlan) {
        diagnostics.push(decodedPlan.diagnostic);
        continue;
      }
      const planDiagnostics = validateCpuPlan(decodedPlan.value, `plans.${index}`);
      diagnostics.push(...planDiagnostics);
      if (planDiagnostics.every((diagnostic) => diagnostic.severity !== "error")) {
        admittedPlans.push(decodedPlan.value);
      }
    }
    if (!cpuIsStructuredCloneable(plans)) {
      admittedPlans.length = 0;
      const plansFailure = cpuDecodeFailure("plans", "proxy-backed arrays are refused");
      if ("diagnostic" in plansFailure) diagnostics.push(plansFailure.diagnostic);
    }
  }

  if (admittedCapability !== undefined &&
      diagnostics.every((diagnostic) => diagnostic.severity !== "error")) {
    for (const plan of admittedPlans) {
    const featureSupported = supportsCpuFeatures(
      admittedCapability,
      plan.requiredFeatures,
    );
    const memorySupported =
      plan.memoryLimitBytes === undefined ||
      (admittedCapability.memoryBytes !== undefined &&
        plan.memoryLimitBytes <= admittedCapability.memoryBytes);
    const lowBitSupported =
      plan.workload !== "low-bit-ai" || canUseLowBitCpuPath(admittedCapability);

    if (featureSupported && memorySupported && lowBitSupported) {
      return Object.freeze({
        capability: admittedCapability,
        plans: Object.freeze(admittedPlans),
        selectedPlan: plan,
        fallbackUsed: plan.fallbackOf !== undefined,
        diagnostics: freezeCpuDiagnostics(diagnostics),
        warnings: Object.freeze([]),
      });
    }
    }
  }

  if (diagnostics.every((diagnostic) => diagnostic.code !== "FUNGI-CPU-004")) {
    diagnostics.push({
    code: "FUNGI-CPU-004",
    severity: "error",
    message: "No CPU target plan is compatible with the reported capability.",
    path: "plans",
    });
  }

  return Object.freeze({
    capability: admittedCapability,
    plans: Object.freeze(admittedPlans),
    fallbackUsed: true,
    diagnostics: freezeCpuDiagnostics(diagnostics),
    warnings: Object.freeze(["CPU fallback could not be satisfied."]),
  });
}

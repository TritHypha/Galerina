export type BenchmarkMode = "light" | "full" | "stress";

export type BenchmarkTrigger = "manual" | "major_version_update" | "ci";

export type BenchmarkTarget =
  | "logic"
  | "cpu"
  | "json"
  | "vector"
  | "gpu"
  | "ai_accelerator"
  | "low_bit_ai"
  | "optical_io"
  | "recovery"
  | "compare";

export type BenchmarkStatus =
  | "passed"
  | "failed"
  | "skipped"
  | "skipped_timeout"
  | "fallback"
  | "partial";

export interface BenchmarkPrivacyPolicy {
  readonly includeHostname: false;
  readonly includeUsername: false;
  readonly includeProjectPath: false;
  readonly anonymiseCpuModel: boolean;
  readonly allowSubmit: boolean;
}

export interface BenchmarkConfig {
  readonly defaultMode: BenchmarkMode;
  readonly maxDurationSeconds: number;
  readonly maxSingleTestSeconds: number;
  readonly runOnMajorUpdate: boolean;
  readonly targets: Readonly<Record<BenchmarkTarget, boolean | "optional">>;
  readonly privacy: BenchmarkPrivacyPolicy;
}

const BENCHMARK_MODES = ["light", "full", "stress"] as const;
const BENCHMARK_TARGETS = [
  "logic",
  "cpu",
  "json",
  "vector",
  "gpu",
  "ai_accelerator",
  "low_bit_ai",
  "optical_io",
  "recovery",
  "compare",
] as const satisfies readonly BenchmarkTarget[];
const BENCHMARK_CONFIG_KEYS = [
  "defaultMode",
  "maxDurationSeconds",
  "maxSingleTestSeconds",
  "runOnMajorUpdate",
  "targets",
  "privacy",
] as const;
const BENCHMARK_PRIVACY_KEYS = [
  "includeHostname",
  "includeUsername",
  "includeProjectPath",
  "anonymiseCpuModel",
  "allowSubmit",
] as const;

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOwn(record: UnknownRecord, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function readOwnData(
  record: UnknownRecord,
  key: string,
  path: string,
  diagnostics: BenchmarkDiagnostic[],
): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(record, key);
  if (descriptor === undefined || "value" in descriptor) return descriptor?.value;
  diagnostics.push(createBenchmarkDiagnostic(
    "Galerina_BENCHMARK_FIELD_HOSTILE",
    "error",
    "Benchmark records must contain inert data properties, not accessors.",
    `${path}.${key}`,
  ));
  return undefined;
}

function validateExactKeys(
  record: UnknownRecord,
  expectedKeys: readonly string[],
  path: string,
  diagnostics: BenchmarkDiagnostic[],
): void {
  const expected = new Set(expectedKeys);
  for (const key of expectedKeys) {
    if (!hasOwn(record, key)) {
      diagnostics.push(createBenchmarkDiagnostic(
        "Galerina_BENCHMARK_FIELD_REQUIRED",
        "error",
        `Benchmark record is missing required field '${key}'.`,
        `${path}.${key}`,
      ));
    }
  }
  for (const key of Reflect.ownKeys(record)) {
    if (typeof key !== "string" || !expected.has(key)) {
      diagnostics.push(createBenchmarkDiagnostic(
        "Galerina_BENCHMARK_FIELD_UNKNOWN",
        "error",
        "Benchmark record contains an unknown or symbolic field.",
        `${path}.${String(key)}`,
      ));
    }
  }
}

export interface BenchmarkSystemInfo {
  readonly osFamily: string;
  readonly architecture: string;
  readonly cpuCoresBucket: string;
  readonly memoryBucket: string;
  readonly gpuBackend: string | "none";
  readonly aiAcceleratorBackend?: string | "none";
  readonly lowBitBackend: string | "none";
  readonly opticalIoBackend?: string | "none";
}

export interface BenchmarkTestResult {
  readonly id: string;
  readonly target: BenchmarkTarget;
  readonly status: BenchmarkStatus;
  readonly durationMs?: number;
  readonly operations?: number;
  readonly score?: number;
  readonly backend?: string;
  readonly fallback?: boolean;
  readonly reason?: string;
}

export interface BenchmarkScores {
  readonly logic?: number;
  readonly cpu?: number;
  readonly json?: number;
  readonly vector?: number;
  readonly gpu?: number;
  readonly aiAccelerator?: number;
  readonly lowBitAi?: number;
  readonly opticalIo?: number;
  readonly fallbackReliability?: number;
  readonly memoryBehaviour?: number;
  readonly overall: number;
}

export interface BenchmarkReport {
  readonly schema: "Galerina.benchmark.report.v1";
  readonly benchmarkId: string;
  readonly mode: BenchmarkMode;
  readonly trigger: BenchmarkTrigger;
  readonly loVersion: string;
  readonly system: BenchmarkSystemInfo;
  readonly durationMs: number;
  readonly summary: Readonly<Record<BenchmarkTarget, BenchmarkStatus>>;
  readonly scores: BenchmarkScores;
  readonly tests: readonly BenchmarkTestResult[];
  readonly privacy: {
    readonly shareable: boolean;
    readonly containsPersonalData: false;
    readonly machineId: "not_included";
    readonly hostname: "not_included";
    readonly username: "not_included";
    readonly projectPath: "not_included";
  };
}

export interface BenchmarkSubmitPayload {
  readonly schema: "Galerina.benchmark.submit.v1";
  readonly anonymous: boolean;
  readonly loVersion: string;
  readonly mode: BenchmarkMode;
  readonly system: BenchmarkSystemInfo;
  readonly scores: BenchmarkScores;
  readonly fallbacks: readonly {
    readonly target: BenchmarkTarget;
    readonly reason: string;
  }[];
}

function deepFreeze<T extends object>(value: T): Readonly<T> {
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !("value" in descriptor)) continue;
    const child = descriptor.value;
    if (child !== null && typeof child === "object" && !Object.isFrozen(child)) {
      deepFreeze(child);
    }
  }
  return Object.freeze(value);
}

/** Immutable process-wide defaults; clone before applying caller-specific changes. */
export const DEFAULT_BENCHMARK_CONFIG: BenchmarkConfig = deepFreeze({
  defaultMode: "light",
  maxDurationSeconds: 180,
  maxSingleTestSeconds: 20,
  runOnMajorUpdate: true,
  targets: {
    logic: true,
    cpu: true,
    json: true,
    vector: true,
    gpu: "optional",
    ai_accelerator: "optional",
    low_bit_ai: "optional",
    optical_io: "optional",
    recovery: true,
    compare: false,
  },
  privacy: {
    includeHostname: false,
    includeUsername: false,
    includeProjectPath: false,
    anonymiseCpuModel: true,
    allowSubmit: false,
  },
});

// ── runtime contract helpers ──────────────────────────────────────────────────
// The interfaces above are the type contract; the helpers below enforce it at
// runtime for configs and reports that arrive as untrusted parsed JSON (a cast
// can carry values the compile-time types forbid). Fail-closed throughout:
// benchmark telemetry must never carry PII, and a report is shareable only on an
// explicit opt-in over a provably PII-free payload.

export type BenchmarkDiagnosticSeverity = "warning" | "error";

export interface BenchmarkDiagnostic {
  readonly code: string;
  readonly severity: BenchmarkDiagnosticSeverity;
  readonly message: string;
  readonly path?: string;
}

function createBenchmarkDiagnostic(
  code: string,
  severity: BenchmarkDiagnosticSeverity,
  message: string,
  path?: string,
): BenchmarkDiagnostic {
  return {
    code,
    severity,
    message,
    ...(path === undefined ? {} : { path }),
  };
}

// A benchmark budget must be positive and internally consistent (a single test
// cannot be allowed to outlast the whole run), telemetry must be PII-free, and at
// least one target must be enabled or the run does nothing.
export function validateBenchmarkConfig(
  config: unknown,
  path = "config",
): readonly BenchmarkDiagnostic[] {
  const diagnostics: BenchmarkDiagnostic[] = [];

  if (!isRecord(config)) {
    return [createBenchmarkDiagnostic(
      "Galerina_BENCHMARK_CONFIG_RECORD_REQUIRED",
      "error",
      "Benchmark config must be a non-null record.",
      path,
    )];
  }
  validateExactKeys(config, BENCHMARK_CONFIG_KEYS, path, diagnostics);

  const defaultMode = hasOwn(config, "defaultMode")
    ? readOwnData(config, "defaultMode", path, diagnostics)
    : undefined;
  if (hasOwn(config, "defaultMode") &&
      !BENCHMARK_MODES.includes(defaultMode as BenchmarkMode)) {
    diagnostics.push(createBenchmarkDiagnostic(
      "Galerina_BENCHMARK_MODE_INVALID",
      "error",
      "Benchmark config defaultMode must be light, full or stress.",
      `${path}.defaultMode`,
    ));
  }

  const maxDurationSeconds = hasOwn(config, "maxDurationSeconds")
    ? readOwnData(config, "maxDurationSeconds", path, diagnostics)
    : undefined;
  if (hasOwn(config, "maxDurationSeconds") &&
      !(typeof maxDurationSeconds === "number" && Number.isFinite(maxDurationSeconds) && maxDurationSeconds > 0)) {
    diagnostics.push(createBenchmarkDiagnostic(
      "Galerina_BENCHMARK_MAX_DURATION_REQUIRED",
      "error",
      "Benchmark config requires a positive finite maximum duration.",
      `${path}.maxDurationSeconds`,
    ));
  }

  const maxSingleTestSeconds = hasOwn(config, "maxSingleTestSeconds")
    ? readOwnData(config, "maxSingleTestSeconds", path, diagnostics)
    : undefined;
  if (hasOwn(config, "maxSingleTestSeconds") &&
      !(typeof maxSingleTestSeconds === "number" && Number.isFinite(maxSingleTestSeconds) && maxSingleTestSeconds > 0)) {
    diagnostics.push(createBenchmarkDiagnostic(
      "Galerina_BENCHMARK_MAX_SINGLE_TEST_REQUIRED",
      "error",
      "Benchmark config requires a positive finite maximum single-test duration.",
      `${path}.maxSingleTestSeconds`,
    ));
  }

  if (typeof maxSingleTestSeconds === "number" && Number.isFinite(maxSingleTestSeconds) && maxSingleTestSeconds > 0 &&
      typeof maxDurationSeconds === "number" && Number.isFinite(maxDurationSeconds) && maxDurationSeconds > 0 &&
      maxSingleTestSeconds > maxDurationSeconds) {
    diagnostics.push(createBenchmarkDiagnostic(
      "Galerina_BENCHMARK_SINGLE_TEST_EXCEEDS_TOTAL",
      "error",
      "A single test may not be allowed to outlast the whole benchmark budget.",
      `${path}.maxSingleTestSeconds`,
    ));
  }

  const runOnMajorUpdate = hasOwn(config, "runOnMajorUpdate")
    ? readOwnData(config, "runOnMajorUpdate", path, diagnostics)
    : undefined;
  if (hasOwn(config, "runOnMajorUpdate") && typeof runOnMajorUpdate !== "boolean") {
    diagnostics.push(createBenchmarkDiagnostic(
      "Galerina_BENCHMARK_RUN_ON_MAJOR_UPDATE_INVALID",
      "error",
      "Benchmark config runOnMajorUpdate must be Boolean.",
      `${path}.runOnMajorUpdate`,
    ));
  }

  const targets = hasOwn(config, "targets")
    ? readOwnData(config, "targets", path, diagnostics)
    : undefined;
  let anyTargetEnabled = false;
  if (hasOwn(config, "targets") && !isRecord(targets)) {
    diagnostics.push(createBenchmarkDiagnostic(
      "Galerina_BENCHMARK_TARGETS_RECORD_REQUIRED",
      "error",
      "Benchmark config targets must be a non-null record.",
      `${path}.targets`,
    ));
  } else if (isRecord(targets)) {
    validateExactKeys(targets, BENCHMARK_TARGETS, `${path}.targets`, diagnostics);
    for (const target of BENCHMARK_TARGETS) {
      if (!hasOwn(targets, target)) continue;
      const value = readOwnData(targets, target, `${path}.targets`, diagnostics);
      if (value !== true && value !== false && value !== "optional") {
        diagnostics.push(createBenchmarkDiagnostic(
          "Galerina_BENCHMARK_TARGET_VALUE_INVALID",
          "error",
          "Benchmark target values must be Boolean or 'optional'.",
          `${path}.targets.${target}`,
        ));
      }
      if (value === true || value === "optional") anyTargetEnabled = true;
    }
  }
  if (isRecord(targets) && !anyTargetEnabled) {
    diagnostics.push(createBenchmarkDiagnostic(
      "Galerina_BENCHMARK_NO_TARGETS",
      "error",
      "Benchmark config enables no targets; the run would do nothing.",
      `${path}.targets`,
    ));
  }

  const privacy = hasOwn(config, "privacy")
    ? readOwnData(config, "privacy", path, diagnostics)
    : undefined;
  if (hasOwn(config, "privacy") && !isRecord(privacy)) {
    diagnostics.push(createBenchmarkDiagnostic(
      "Galerina_BENCHMARK_PRIVACY_RECORD_REQUIRED",
      "error",
      "Benchmark config privacy must be a non-null record.",
      `${path}.privacy`,
    ));
  } else if (isRecord(privacy)) {
    validateExactKeys(privacy, BENCHMARK_PRIVACY_KEYS, `${path}.privacy`, diagnostics);
    for (const flag of ["includeHostname", "includeUsername", "includeProjectPath"] as const) {
      if (!hasOwn(privacy, flag)) continue;
      const value = readOwnData(privacy, flag, `${path}.privacy`, diagnostics);
      if (value !== false) {
        diagnostics.push(createBenchmarkDiagnostic(
          "Galerina_BENCHMARK_PRIVACY_PII_FORBIDDEN",
          "error",
          `Benchmark telemetry must not include PII (${flag} must be false).`,
          `${path}.privacy.${flag}`,
        ));
      }
    }
    for (const flag of ["anonymiseCpuModel", "allowSubmit"] as const) {
      if (!hasOwn(privacy, flag)) continue;
      const value = readOwnData(privacy, flag, `${path}.privacy`, diagnostics);
      if (typeof value !== "boolean") {
        diagnostics.push(createBenchmarkDiagnostic(
          "Galerina_BENCHMARK_PRIVACY_BOOLEAN_INVALID",
          "error",
          `Benchmark privacy field ${flag} must be Boolean.`,
          `${path}.privacy.${flag}`,
        ));
      }
    }
  }

  return diagnostics;
}

// Default-deny: a report may leave the machine only when the operator has opted in
// (allowSubmit) AND the report's own privacy block proves it carries no personal
// data. Any doubt resolves to "not shareable".
export function isBenchmarkReportShareable(
  report: BenchmarkReport,
  config: BenchmarkConfig,
): boolean {
  if (!isRecord(config) || !isRecord(config.privacy) || config.privacy.allowSubmit !== true) return false;
  if (!isRecord(report) || !isRecord(report.privacy)) return false;
  const p = report.privacy;
  return (
    p.shareable === true &&
    p.containsPersonalData === false &&
    p.machineId === "not_included" &&
    p.hostname === "not_included" &&
    p.username === "not_included" &&
    p.projectPath === "not_included"
  );
}

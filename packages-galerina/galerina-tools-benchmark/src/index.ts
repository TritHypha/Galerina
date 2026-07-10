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

export const DEFAULT_BENCHMARK_CONFIG: BenchmarkConfig = {
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
};

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
  config: BenchmarkConfig,
  path = "config",
): readonly BenchmarkDiagnostic[] {
  const diagnostics: BenchmarkDiagnostic[] = [];

  if (!(config.maxDurationSeconds > 0)) {
    diagnostics.push(createBenchmarkDiagnostic(
      "Galerina_BENCHMARK_MAX_DURATION_REQUIRED",
      "error",
      "Benchmark config requires a positive maximum duration.",
      `${path}.maxDurationSeconds`,
    ));
  }

  if (!(config.maxSingleTestSeconds > 0)) {
    diagnostics.push(createBenchmarkDiagnostic(
      "Galerina_BENCHMARK_MAX_SINGLE_TEST_REQUIRED",
      "error",
      "Benchmark config requires a positive maximum single-test duration.",
      `${path}.maxSingleTestSeconds`,
    ));
  }

  if (config.maxSingleTestSeconds > 0 && config.maxDurationSeconds > 0 &&
      config.maxSingleTestSeconds > config.maxDurationSeconds) {
    diagnostics.push(createBenchmarkDiagnostic(
      "Galerina_BENCHMARK_SINGLE_TEST_EXCEEDS_TOTAL",
      "error",
      "A single test may not be allowed to outlast the whole benchmark budget.",
      `${path}.maxSingleTestSeconds`,
    ));
  }

  for (const flag of ["includeHostname", "includeUsername", "includeProjectPath"] as const) {
    if (config.privacy[flag] !== false) {
      diagnostics.push(createBenchmarkDiagnostic(
        "Galerina_BENCHMARK_PRIVACY_PII_FORBIDDEN",
        "error",
        `Benchmark telemetry must not include PII (${flag} must be false).`,
        `${path}.privacy.${flag}`,
      ));
    }
  }

  const anyTargetEnabled = Object.values(config.targets).some((v) => v === true || v === "optional");
  if (!anyTargetEnabled) {
    diagnostics.push(createBenchmarkDiagnostic(
      "Galerina_BENCHMARK_NO_TARGETS",
      "error",
      "Benchmark config enables no targets; the run would do nothing.",
      `${path}.targets`,
    ));
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
  if (config.privacy.allowSubmit !== true) return false;
  const p = report.privacy;
  return (
    p.containsPersonalData === false &&
    p.machineId === "not_included" &&
    p.hostname === "not_included" &&
    p.username === "not_included" &&
    p.projectPath === "not_included"
  );
}

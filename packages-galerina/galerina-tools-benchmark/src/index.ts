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

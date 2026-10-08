import { isProxy as isNodeProxy } from "node:util/types";

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
const BENCHMARK_REPORT_KEYS = [
  "schema", "benchmarkId", "mode", "trigger", "loVersion", "system", "durationMs", "summary", "scores", "tests", "privacy",
] as const;
const BENCHMARK_SYSTEM_KEYS = [
  "osFamily", "architecture", "cpuCoresBucket", "memoryBucket", "gpuBackend", "aiAcceleratorBackend", "lowBitBackend", "opticalIoBackend",
] as const;
const BENCHMARK_SYSTEM_REQUIRED_KEYS = ["osFamily", "architecture", "cpuCoresBucket", "memoryBucket", "gpuBackend", "lowBitBackend"] as const;
const BENCHMARK_SUMMARY_KEYS = BENCHMARK_TARGETS;
const BENCHMARK_SCORE_KEYS = [
  "logic", "cpu", "json", "vector", "gpu", "aiAccelerator", "lowBitAi", "opticalIo", "fallbackReliability", "memoryBehaviour", "overall",
] as const;
const BENCHMARK_TEST_KEYS = ["id", "target", "status", "durationMs", "operations", "score", "backend", "fallback", "reason"] as const;
const BENCHMARK_TEST_REQUIRED_KEYS = ["id", "target", "status"] as const;
const BENCHMARK_PRIVACY_REPORT_KEYS = ["shareable", "containsPersonalData", "machineId", "hostname", "username", "projectPath"] as const;

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  try {
    return typeof value === "object"
      && value !== null
      && !Array.isArray(value)
      && !isNodeProxy(value)
      && Object.getPrototypeOf(value) === Object.prototype;
  } catch {
    return false;
  }
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
        // Never echo an unknown/symbolic key (zero-trust no-echo; C40 follow-up).
        `${path}.<unknown>`,
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
  return Object.freeze({
    code,
    severity,
    message,
    ...(path === undefined ? {} : { path }),
  });
}

function validateReportKeys(
  record: UnknownRecord,
  allowedKeys: readonly string[],
  requiredKeys: readonly string[],
  path: string,
  diagnostics: BenchmarkDiagnostic[],
): void {
  const allowed = new Set(allowedKeys);
  for (const key of requiredKeys) {
    if (!hasOwn(record, key)) {
      diagnostics.push(createBenchmarkDiagnostic(
        "Galerina_BENCHMARK_REPORT_FIELD_REQUIRED",
        "error",
        "Benchmark report record is missing a required field.",
        `${path}.${key}`,
      ));
    }
  }
  for (const key of Reflect.ownKeys(record)) {
    if (typeof key !== "string" || !allowed.has(key)) {
      diagnostics.push(createBenchmarkDiagnostic(
        "Galerina_BENCHMARK_REPORT_FIELD_UNKNOWN",
        "error",
        "Benchmark report record contains an unknown or symbolic field.",
        // Never echo an unknown/symbolic key (zero-trust no-echo; C40 follow-up).
        `${path}.<unknown>`,
      ));
    }
  }
}

function reportRead(record: UnknownRecord, key: string): unknown {
  return Object.getOwnPropertyDescriptor(record, key)?.value;
}

function validateReportString(value: unknown, path: string, diagnostics: BenchmarkDiagnostic[], allowEmpty = false): void {
  if (typeof value !== "string" || value.length > 1024 || (!allowEmpty && value.length === 0) || [...(typeof value === "string" ? value : "")].some((character) => character.charCodeAt(0) < 0x20 || character === "\u007f")) {
    diagnostics.push(createBenchmarkDiagnostic("Galerina_BENCHMARK_REPORT_STRING_INVALID", "error", "Benchmark report text must be bounded and free of controls.", path));
  }
}

function validateReportNumber(value: unknown, path: string, diagnostics: BenchmarkDiagnostic[], safeInteger = false): void {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || (safeInteger && !Number.isSafeInteger(value))) {
    diagnostics.push(createBenchmarkDiagnostic("Galerina_BENCHMARK_REPORT_NUMBER_INVALID", "error", "Benchmark report numbers must be finite and non-negative.", path));
  }
}

function validateReportEnum(value: unknown, vocabulary: readonly string[], path: string, diagnostics: BenchmarkDiagnostic[]): void {
  if (typeof value !== "string" || !vocabulary.includes(value)) {
    diagnostics.push(createBenchmarkDiagnostic("Galerina_BENCHMARK_REPORT_ENUM_INVALID", "error", "Benchmark report contains an unknown vocabulary value.", path));
  }
}

/** Validate the complete report wire shape before any shareability decision. */
export function validateBenchmarkReport(
  report: unknown,
  path = "report",
): readonly BenchmarkDiagnostic[] {
  const diagnostics: BenchmarkDiagnostic[] = [];
  if (!isRecord(report)) {
    return [createBenchmarkDiagnostic("Galerina_BENCHMARK_REPORT_RECORD_REQUIRED", "error", "Benchmark report must be a plain data record.", path)];
  }
  validateExactKeys(report, BENCHMARK_REPORT_KEYS, path, diagnostics);
  if (reportRead(report, "schema") !== "Galerina.benchmark.report.v1") {
    diagnostics.push(createBenchmarkDiagnostic("Galerina_BENCHMARK_REPORT_SCHEMA_INVALID", "error", "Benchmark report schema is invalid.", `${path}.schema`));
  }
  validateReportString(reportRead(report, "benchmarkId"), `${path}.benchmarkId`, diagnostics);
  validateReportEnum(reportRead(report, "mode"), BENCHMARK_MODES, `${path}.mode`, diagnostics);
  validateReportEnum(reportRead(report, "trigger"), ["manual", "major_version_update", "ci"], `${path}.trigger`, diagnostics);
  validateReportString(reportRead(report, "loVersion"), `${path}.loVersion`, diagnostics);
  validateReportNumber(reportRead(report, "durationMs"), `${path}.durationMs`, diagnostics);

  const system = reportRead(report, "system");
  if (!isRecord(system)) {
    diagnostics.push(createBenchmarkDiagnostic("Galerina_BENCHMARK_REPORT_SYSTEM_REQUIRED", "error", "Benchmark report system must be a plain record.", `${path}.system`));
  } else {
    validateReportKeys(system, BENCHMARK_SYSTEM_KEYS, BENCHMARK_SYSTEM_REQUIRED_KEYS, `${path}.system`, diagnostics);
    for (const key of BENCHMARK_SYSTEM_KEYS) {
      if (hasOwn(system, key)) validateReportString(reportRead(system, key), `${path}.system.${key}`, diagnostics);
    }
  }

  const summary = reportRead(report, "summary");
  if (!isRecord(summary)) {
    diagnostics.push(createBenchmarkDiagnostic("Galerina_BENCHMARK_REPORT_SUMMARY_REQUIRED", "error", "Benchmark report summary must be a plain record.", `${path}.summary`));
  } else {
    validateReportKeys(summary, BENCHMARK_SUMMARY_KEYS, BENCHMARK_SUMMARY_KEYS, `${path}.summary`, diagnostics);
    for (const key of BENCHMARK_SUMMARY_KEYS) {
      if (hasOwn(summary, key)) validateReportEnum(reportRead(summary, key), ["passed", "failed", "skipped", "skipped_timeout", "fallback", "partial"], `${path}.summary.${key}`, diagnostics);
    }
  }

  const scores = reportRead(report, "scores");
  if (!isRecord(scores)) {
    diagnostics.push(createBenchmarkDiagnostic("Galerina_BENCHMARK_REPORT_SCORES_REQUIRED", "error", "Benchmark report scores must be a plain record.", `${path}.scores`));
  } else {
    validateReportKeys(scores, BENCHMARK_SCORE_KEYS, ["overall"], `${path}.scores`, diagnostics);
    for (const key of BENCHMARK_SCORE_KEYS) {
      if (hasOwn(scores, key)) validateReportNumber(reportRead(scores, key), `${path}.scores.${key}`, diagnostics);
    }
  }

  const tests = reportRead(report, "tests");
  if (!Array.isArray(tests) || isNodeProxy(tests) || tests.length > 4096) {
    diagnostics.push(createBenchmarkDiagnostic("Galerina_BENCHMARK_REPORT_TESTS_INVALID", "error", "Benchmark report tests must be a bounded dense array.", `${path}.tests`));
  } else {
    const testKeys = Reflect.ownKeys(tests);
    if (testKeys.length !== tests.length + 1 || !testKeys.includes("length")) {
      diagnostics.push(createBenchmarkDiagnostic("Galerina_BENCHMARK_REPORT_TESTS_INVALID", "error", "Benchmark report tests must be a dense array.", `${path}.tests`));
    }
    for (let index = 0; index < tests.length; index += 1) {
      const test = tests[index];
      const testPath = `${path}.tests.${index}`;
      if (!isRecord(test)) {
        diagnostics.push(createBenchmarkDiagnostic("Galerina_BENCHMARK_REPORT_TEST_REQUIRED", "error", "Benchmark test rows must be plain records.", testPath));
        continue;
      }
      validateReportKeys(test, BENCHMARK_TEST_KEYS, BENCHMARK_TEST_REQUIRED_KEYS, testPath, diagnostics);
      validateReportString(reportRead(test, "id"), `${testPath}.id`, diagnostics);
      validateReportEnum(reportRead(test, "target"), BENCHMARK_TARGETS, `${testPath}.target`, diagnostics);
      validateReportEnum(reportRead(test, "status"), ["passed", "failed", "skipped", "skipped_timeout", "fallback", "partial"], `${testPath}.status`, diagnostics);
      for (const key of ["durationMs", "score"] as const) if (hasOwn(test, key)) validateReportNumber(reportRead(test, key), `${testPath}.${key}`, diagnostics);
      if (hasOwn(test, "operations")) validateReportNumber(reportRead(test, "operations"), `${testPath}.operations`, diagnostics, true);
      if (hasOwn(test, "backend")) validateReportString(reportRead(test, "backend"), `${testPath}.backend`, diagnostics);
      if (hasOwn(test, "reason")) validateReportString(reportRead(test, "reason"), `${testPath}.reason`, diagnostics);
      if (hasOwn(test, "fallback") && typeof reportRead(test, "fallback") !== "boolean") diagnostics.push(createBenchmarkDiagnostic("Galerina_BENCHMARK_REPORT_BOOLEAN_INVALID", "error", "Benchmark test fallback must be Boolean.", `${testPath}.fallback`));
    }
  }

  const privacy = reportRead(report, "privacy");
  if (!isRecord(privacy)) {
    diagnostics.push(createBenchmarkDiagnostic("Galerina_BENCHMARK_REPORT_PRIVACY_REQUIRED", "error", "Benchmark report privacy must be a plain record.", `${path}.privacy`));
  } else {
    validateReportKeys(privacy, BENCHMARK_PRIVACY_REPORT_KEYS, BENCHMARK_PRIVACY_REPORT_KEYS, `${path}.privacy`, diagnostics);
    if (reportRead(privacy, "shareable") !== true && reportRead(privacy, "shareable") !== false) diagnostics.push(createBenchmarkDiagnostic("Galerina_BENCHMARK_REPORT_BOOLEAN_INVALID", "error", "Benchmark report privacy flags must be Boolean.", `${path}.privacy.shareable`));
    if (reportRead(privacy, "containsPersonalData") !== false) diagnostics.push(createBenchmarkDiagnostic("Galerina_BENCHMARK_REPORT_PII_FORBIDDEN", "error", "Benchmark report must explicitly contain no personal data.", `${path}.privacy.containsPersonalData`));
    for (const key of ["machineId", "hostname", "username", "projectPath"] as const) if (reportRead(privacy, key) !== "not_included") diagnostics.push(createBenchmarkDiagnostic("Galerina_BENCHMARK_REPORT_PII_FORBIDDEN", "error", "Benchmark report privacy identifiers must be not_included.", `${path}.privacy.${key}`));
  }
  return diagnostics;
}

export interface BenchmarkReportCapture {
  readonly report?: BenchmarkReport;
  readonly diagnostics: readonly BenchmarkDiagnostic[];
}

/** Validate once, then return a detached immutable report for downstream decisions/receipts. */
export function captureBenchmarkReport(report: unknown, path = "report"): BenchmarkReportCapture {
  const diagnostics = validateBenchmarkReport(report, path);
  if (diagnostics.some((diagnostic) => diagnostic.severity === "error") || !isRecord(report)) {
    return { diagnostics: Object.freeze([...diagnostics]) };
  }

  const systemSource = reportRead(report, "system") as UnknownRecord;
  const system: Record<string, string> = {};
  for (const key of BENCHMARK_SYSTEM_KEYS) {
    if (hasOwn(systemSource, key)) system[key] = reportRead(systemSource, key) as string;
  }

  const summarySource = reportRead(report, "summary") as UnknownRecord;
  const summary: Record<string, BenchmarkStatus> = {};
  for (const key of BENCHMARK_SUMMARY_KEYS) summary[key] = reportRead(summarySource, key) as BenchmarkStatus;

  const scoresSource = reportRead(report, "scores") as UnknownRecord;
  const scores: Record<string, number> = {};
  for (const key of BENCHMARK_SCORE_KEYS) {
    if (hasOwn(scoresSource, key)) scores[key] = reportRead(scoresSource, key) as number;
  }

  const testsSource = reportRead(report, "tests") as readonly UnknownRecord[];
  const tests = testsSource.map((test) => {
    const copy: Record<string, unknown> = {};
    for (const key of BENCHMARK_TEST_KEYS) {
      if (hasOwn(test, key)) copy[key] = reportRead(test, key);
    }
    return Object.freeze(copy) as unknown as BenchmarkTestResult;
  });

  const privacySource = reportRead(report, "privacy") as UnknownRecord;
  const privacy = Object.freeze({
    shareable: reportRead(privacySource, "shareable") as boolean,
    containsPersonalData: reportRead(privacySource, "containsPersonalData") as false,
    machineId: reportRead(privacySource, "machineId") as "not_included",
    hostname: reportRead(privacySource, "hostname") as "not_included",
    username: reportRead(privacySource, "username") as "not_included",
    projectPath: reportRead(privacySource, "projectPath") as "not_included",
  });

  const snapshot: BenchmarkReport = Object.freeze({
    schema: reportRead(report, "schema") as "Galerina.benchmark.report.v1",
    benchmarkId: reportRead(report, "benchmarkId") as string,
    mode: reportRead(report, "mode") as BenchmarkMode,
    trigger: reportRead(report, "trigger") as BenchmarkTrigger,
    loVersion: reportRead(report, "loVersion") as string,
    system: Object.freeze(system) as unknown as BenchmarkSystemInfo,
    durationMs: reportRead(report, "durationMs") as number,
    summary: Object.freeze(summary) as Readonly<Record<BenchmarkTarget, BenchmarkStatus>>,
    scores: Object.freeze(scores) as unknown as BenchmarkScores,
    tests: Object.freeze(tests),
    privacy,
  });
  return { report: snapshot, diagnostics: Object.freeze([]) };
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
  const captured = captureBenchmarkReport(report);
  if (captured.report === undefined) return false;
  const p = captured.report.privacy;
  return (
    p.shareable === true &&
    p.containsPersonalData === false &&
    p.machineId === "not_included" &&
    p.hostname === "not_included" &&
    p.username === "not_included" &&
    p.projectPath === "not_included"
  );
}

// ── target detection (Phase 4, first slice) ──────────────────────────────────
// Pure and injectable: the caller supplies raw OS facts (for example
// `process.platform`, `process.arch`, `os.availableParallelism()`), so this
// package keeps its node-core border unchanged. Output is a closed vocabulary
// or a coarse bucket, never a raw probe string: no hostname, username, CPU
// model, serial or path can pass through. RAM bucket and vector
// features live in src/target-detection.ts (separate probes; this probe stays closed).

export type BenchmarkOsFamily = "linux" | "macos" | "windows" | "android" | "bsd" | "other" | "unknown";

export type BenchmarkArchitecture =
  | "x64" | "arm64" | "arm" | "ia32" | "riscv64" | "ppc64" | "s390x" | "loong64" | "other" | "unknown";

export type BenchmarkCpuCoresBucket = "1" | "2" | "4" | "8" | "16" | "32" | "64" | "128+" | "unknown";

export interface BenchmarkSystemProbe {
  /** A Node.js `process.platform` value. */
  readonly platform?: unknown;
  /** A Node.js `process.arch` value. */
  readonly arch?: unknown;
  /** Logical core count, e.g. `os.availableParallelism()`. */
  readonly logicalCores?: unknown;
}

export interface BenchmarkSystemDetection {
  readonly osFamily: BenchmarkOsFamily;
  readonly architecture: BenchmarkArchitecture;
  readonly cpuCoresBucket: BenchmarkCpuCoresBucket;
  readonly diagnostics: readonly BenchmarkDiagnostic[];
}

const BENCHMARK_PROBE_KEYS = ["platform", "arch", "logicalCores"] as const;

const OS_FAMILY_BY_PLATFORM: ReadonlyMap<string, BenchmarkOsFamily> = new Map([
  ["linux", "linux"],
  ["darwin", "macos"],
  ["win32", "windows"],
  ["cygwin", "windows"],
  ["android", "android"],
  ["freebsd", "bsd"],
  ["openbsd", "bsd"],
  ["netbsd", "bsd"],
  ["aix", "other"],
  ["sunos", "other"],
  ["haiku", "other"],
]);

const ARCHITECTURE_BY_ARCH: ReadonlyMap<string, BenchmarkArchitecture> = new Map([
  ["x64", "x64"],
  ["arm64", "arm64"],
  ["arm", "arm"],
  ["ia32", "ia32"],
  ["riscv64", "riscv64"],
  ["ppc64", "ppc64"],
  ["s390x", "s390x"],
  ["loong64", "loong64"],
  ["mips", "other"],
  ["mipsel", "other"],
  ["ppc", "other"],
  ["s390", "other"],
]);

/** Largest power of two not above `count`, capped at "128+". Exposes only a coarse bucket. */
export function bucketLogicalCores(count: unknown): BenchmarkCpuCoresBucket {
  if (typeof count !== "number" || !Number.isSafeInteger(count) || count < 1) return "unknown";
  if (count >= 128) return "128+";
  let bucket = 1;
  while (bucket * 2 <= count) bucket *= 2;
  return String(bucket) as BenchmarkCpuCoresBucket;
}

/**
 * Map injected OS facts to report-safe system fields (osFamily, architecture,
 * cpuCoresBucket). Fail-closed: a non-record probe, accessor, unknown key or
 * unrecognised value yields "unknown" plus a warning, never the raw input.
 * Unknown probe keys (e.g. a hostname or CPU model) are refused unread.
 */
export function detectBenchmarkSystem(probe: unknown): BenchmarkSystemDetection {
  const diagnostics: BenchmarkDiagnostic[] = [];
  let platform: unknown;
  let arch: unknown;
  let logicalCores: unknown;

  if (!isRecord(probe)) {
    diagnostics.push(createBenchmarkDiagnostic(
      "Galerina_BENCHMARK_PROBE_RECORD_REQUIRED",
      "warning",
      "Benchmark system probe must be a plain data record; system fields reported as unknown.",
      "probe",
    ));
  } else {
    const allowed = new Set<string>(BENCHMARK_PROBE_KEYS);
    for (const key of Reflect.ownKeys(probe)) {
      if (typeof key !== "string" || !allowed.has(key)) {
        diagnostics.push(createBenchmarkDiagnostic(
          "Galerina_BENCHMARK_PROBE_FIELD_UNKNOWN",
          "warning",
          "Benchmark system probe contains an unknown or symbolic field; it was ignored unread.",
          "probe.<unknown>",
        ));
      }
    }
    platform = readOwnData(probe, "platform", "probe", diagnostics);
    arch = readOwnData(probe, "arch", "probe", diagnostics);
    logicalCores = readOwnData(probe, "logicalCores", "probe", diagnostics);
  }

  const osFamily = typeof platform === "string" ? OS_FAMILY_BY_PLATFORM.get(platform) ?? "unknown" : "unknown";
  const architecture = typeof arch === "string" ? ARCHITECTURE_BY_ARCH.get(arch) ?? "unknown" : "unknown";
  const cpuCoresBucket = bucketLogicalCores(logicalCores);

  if (osFamily === "unknown") {
    diagnostics.push(createBenchmarkDiagnostic("Galerina_BENCHMARK_PROBE_OS_UNKNOWN", "warning", "Operating system family could not be determined.", "probe.platform"));
  }
  if (architecture === "unknown") {
    diagnostics.push(createBenchmarkDiagnostic("Galerina_BENCHMARK_PROBE_ARCH_UNKNOWN", "warning", "CPU architecture could not be determined.", "probe.arch"));
  }
  if (cpuCoresBucket === "unknown") {
    diagnostics.push(createBenchmarkDiagnostic("Galerina_BENCHMARK_PROBE_CORES_UNKNOWN", "warning", "Logical core count must be a positive safe integer.", "probe.logicalCores"));
  }

  return Object.freeze({
    osFamily,
    architecture,
    cpuCoresBucket,
    diagnostics: Object.freeze(diagnostics),
  });
}

// Target detection, second slice (Phase 4): RAM bucket and vector features.
export {
  BENCHMARK_MEMORY_BUCKETS,
  BENCHMARK_MEMORY_PROBE_FIELDS,
  MIN_BENCHMARK_TOTAL_MEMORY_BYTES,
  BENCHMARK_VECTOR_FEATURES,
  BENCHMARK_VECTOR_PROBE_FIELDS,
  MAX_BENCHMARK_CPU_FLAGS,
  bucketTotalMemory,
  detectBenchmarkMemory,
  detectBenchmarkVectorFeatures,
  wasmSimd128ProbeBytes,
  type BenchmarkMemoryBucket,
  type BenchmarkMemoryProbe,
  type BenchmarkMemoryDetection,
  type BenchmarkVectorFeature,
  type BenchmarkVectorBackend,
  type BenchmarkVectorProbe,
  type BenchmarkVectorDetection,
  type TargetDetectionDiagnostic,
  type TargetDetectionSeverity,
} from "./target-detection.js";

// ── shareable reports, version-trigger state and submit placeholder (TODO pass, Grok 2026-10-05) ──
// Pure and fail-closed. The shareable generator REBUILDS a report from the closed
// allowlists above instead of deleting known-bad fields, so any field it does not know
// (hostname, username, cwd, projectPath, env, machine ids, ...) is dropped by
// construction. Nothing here reads the filesystem, the environment or the network.

export interface ShareableBenchmarkReportResult {
  readonly status: "SHAREABLE" | "REFUSED";
  readonly report: BenchmarkReport | Readonly<Record<string, never>>;
  readonly removedFields: readonly string[];
  readonly redactedReasons: number;
  readonly diagnostics: readonly BenchmarkDiagnostic[];
}

// Free text that looks like a path, a user directory, an env assignment or an e-mail is
// replaced: reasons are operator hints, never a channel for machine identity.
// Also caught: any `name=` assignment (any case), a drive letter (`C:`), IPv4 and IPv6-looking text.
// Over-redaction (e.g. a `12:30:` time) is the accepted cost of the fail-closed default.
const IDENTIFYING_TEXT = /[\\/]|~|\$|%[A-Za-z_]+%|\b[A-Za-z_][A-Za-z0-9_]*=|@|\b[A-Za-z]:|\b\d{1,3}(?:\.\d{1,3}){3}\b|[0-9A-Fa-f]{0,4}:[0-9A-Fa-f]{0,4}:/;
const IDENTITY_KEYS = ["hostname", "host", "username", "user", "cwd", "projectPath", "machineName"];

// Identity values the input itself carried (dropped by the allowlist rebuild) must not survive inside free text either.
function collectIdentityTerms(input: UnknownRecord): readonly string[] {
  const terms = new Set<string>();
  const visit = (record: unknown): void => {
    if (!isRecord(record)) return;
    for (const key of IDENTITY_KEYS) {
      const descriptor = Object.getOwnPropertyDescriptor(record, key);
      if (descriptor !== undefined && "value" in descriptor && typeof descriptor.value === "string" && descriptor.value.trim().length >= 3) terms.add(descriptor.value.trim().toLowerCase());
    }
  };
  visit(input);
  visit(input.system);
  visit(input.privacy);
  if (Array.isArray(input.tests)) for (const test of input.tests) visit(test);
  return [...terms];
}

const isIdentifyingText = (text: string, terms: readonly string[]): boolean => IDENTIFYING_TEXT.test(text) || terms.some((term) => text.toLowerCase().includes(term));

function pickAllowed(record: UnknownRecord, keys: readonly string[], path: string, removed: string[]): UnknownRecord {
  const out: UnknownRecord = {};
  for (const key of Reflect.ownKeys(record)) {
    const name = typeof key === "string" ? key : String(key);
    if (typeof key !== "string" || !keys.includes(key)) { removed.push(`${path}.${name}`); continue; }
    const descriptor = Object.getOwnPropertyDescriptor(record, key);
    if (descriptor === undefined || !("value" in descriptor)) { removed.push(`${path}.${name}`); continue; }
    out[key] = descriptor.value;
  }
  return out;
}

export function createShareableBenchmarkReport(input: unknown, config: BenchmarkConfig): ShareableBenchmarkReportResult {
  const removed: string[] = [];
  let redactedReasons = 0;
  const refused = (diagnostics: readonly BenchmarkDiagnostic[]): ShareableBenchmarkReportResult =>
    Object.freeze({ status: "REFUSED", report: Object.freeze({}), removedFields: Object.freeze([...removed]), redactedReasons, diagnostics: Object.freeze([...diagnostics]) });
  const optedIn = isRecord(config) && isRecord(config.privacy) && config.privacy.allowSubmit === true;
  if (!isRecord(input)) return refused([createBenchmarkDiagnostic("Galerina_BENCHMARK_REPORT_RECORD_REQUIRED", "error", "Benchmark report must be a plain data record.", "report")]);
  const identityTerms = collectIdentityTerms(input);
  const top = pickAllowed(input, BENCHMARK_REPORT_KEYS, "report", removed);
  if (isRecord(top.system)) top.system = pickAllowed(top.system, BENCHMARK_SYSTEM_KEYS, "report.system", removed);
  if (Array.isArray(top.tests)) {
    top.tests = top.tests.map((test, index) => {
      if (!isRecord(test)) return test;
      const kept = pickAllowed(test, BENCHMARK_TEST_KEYS, `report.tests.${index}`, removed);
      if (typeof kept.reason === "string" && isIdentifyingText(kept.reason, identityTerms)) { kept.reason = "redacted"; redactedReasons += 1; }
      if (typeof kept.backend === "string" && isIdentifyingText(kept.backend, identityTerms)) { kept.backend = "redacted"; redactedReasons += 1; }
      return kept;
    });
  }
  top.privacy = {
    shareable: optedIn,
    containsPersonalData: false,
    machineId: "not_included",
    hostname: "not_included",
    username: "not_included",
    projectPath: "not_included",
  };
  const captured = captureBenchmarkReport(top);
  if (captured.report === undefined) return refused(captured.diagnostics);
  return Object.freeze({ status: "SHAREABLE", report: captured.report, removedFields: Object.freeze([...removed]), redactedReasons, diagnostics: Object.freeze([]) });
}

export const BENCHMARK_STATE_PATH = ".fungi/benchmark-state.json";

export interface BenchmarkState {
  readonly schema: "Galerina.benchmark.state.v1";
  readonly lastGalerinaVersion: string;
}

const SEMVER = /^(0|[1-9][0-9]{0,8})\.(0|[1-9][0-9]{0,8})\.(0|[1-9][0-9]{0,8})(?:-[0-9A-Za-z.-]{1,64})?$/;

export function serializeBenchmarkState(version: string): string {
  if (!SEMVER.test(version)) throw new Error("Galerina_BENCHMARK_STATE_VERSION_INVALID: version must be semver.");
  return `${JSON.stringify({ schema: "Galerina.benchmark.state.v1", lastGalerinaVersion: version })}\n`;
}

export interface BenchmarkStateParse {
  readonly ok: boolean;
  readonly state: BenchmarkState | Readonly<Record<string, never>>;
  readonly diagnostics: readonly BenchmarkDiagnostic[];
}

export function parseBenchmarkState(text: string): BenchmarkStateParse {
  const bad = (message: string): BenchmarkStateParse =>
    Object.freeze({ ok: false, state: Object.freeze({}), diagnostics: Object.freeze([createBenchmarkDiagnostic("Galerina_BENCHMARK_STATE_INVALID", "error", message, BENCHMARK_STATE_PATH)]) });
  if (typeof text !== "string" || text.length > 4096) return bad("State file must be a small text document.");
  let value: unknown;
  try { value = JSON.parse(text); } catch { return bad("State file is not valid JSON."); }
  if (!isRecord(value)) return bad("State file must be a JSON object.");
  const keys = Object.keys(value);
  if (keys.length !== 2 || value.schema !== "Galerina.benchmark.state.v1" || typeof value.lastGalerinaVersion !== "string" || !SEMVER.test(value.lastGalerinaVersion)) {
    return bad("State file must be exactly {schema, lastGalerinaVersion} with a semver version.");
  }
  return Object.freeze({ ok: true, state: Object.freeze({ schema: "Galerina.benchmark.state.v1" as const, lastGalerinaVersion: value.lastGalerinaVersion }), diagnostics: Object.freeze([]) });
}

export type BenchmarkAutoRunReason =
  | "MAJOR_VERSION_CHANGED"
  | "NEVER_IN_PRODUCTION"
  | "NOT_DEVELOPMENT"
  | "DISABLED_BY_CONFIG"
  | "FIRST_RUN_RECORDED"
  | "NO_MAJOR_CHANGE"
  | "STATE_INVALID"
  | "VERSION_INVALID";

export interface BenchmarkAutoRunDecision {
  readonly run: boolean;
  readonly reason: BenchmarkAutoRunReason;
  readonly nextStateText: string;
}

/**
 * Decide whether a light benchmark should auto-run after an upgrade. It runs only in
 * development, only when enabled, only when a valid recorded version exists and the
 * major version increased. Production never auto-runs, whatever else is true. An
 * unreadable state file never triggers a run. `stateText` is "" when no state exists.
 */
export function decideBenchmarkAutoRun(input: {
  readonly stateText: string;
  readonly currentVersion: string;
  readonly environment: "development" | "test" | "staging" | "production";
  readonly config: BenchmarkConfig;
}): BenchmarkAutoRunDecision {
  const decide = (run: boolean, reason: BenchmarkAutoRunReason, nextStateText: string): BenchmarkAutoRunDecision => Object.freeze({ run, reason, nextStateText });
  if (input.environment === "production") return decide(false, "NEVER_IN_PRODUCTION", input.stateText);
  if (input.environment !== "development") return decide(false, "NOT_DEVELOPMENT", input.stateText);
  if (!isRecord(input.config) || input.config.runOnMajorUpdate !== true) return decide(false, "DISABLED_BY_CONFIG", input.stateText);
  const current = SEMVER.exec(input.currentVersion);
  if (current === null) return decide(false, "VERSION_INVALID", input.stateText);
  const next = serializeBenchmarkState(input.currentVersion);
  if (input.stateText.length === 0) return decide(false, "FIRST_RUN_RECORDED", next);
  const parsed = parseBenchmarkState(input.stateText);
  if (!parsed.ok) return decide(false, "STATE_INVALID", input.stateText);
  const last = SEMVER.exec((parsed.state as BenchmarkState).lastGalerinaVersion) as RegExpExecArray;
  return Number(current[1]) > Number(last[1]) ? decide(true, "MAJOR_VERSION_CHANGED", next) : decide(false, "NO_MAJOR_CHANGE", Number(current[1]) === Number(last[1]) ? next : input.stateText);
}

export const BENCHMARK_SUBMIT_CONFIRMATION = "submit-anonymous-benchmark";

export interface BenchmarkSubmitPreparation {
  readonly status: "NOT_SUBMITTED_PLACEHOLDER" | "REFUSED";
  readonly networkUsed: false;
  readonly payload: BenchmarkSubmitPayload | Readonly<Record<string, never>>;
  readonly diagnostics: readonly BenchmarkDiagnostic[];
}

/**
 * `Galerina benchmark submit` placeholder. Builds the anonymous submit payload only after
 * an explicit typed confirmation over a shareable report, and never sends anything:
 * there is no submission endpoint yet.
 */
export function prepareBenchmarkSubmission(report: unknown, config: BenchmarkConfig, confirmation: string): BenchmarkSubmitPreparation {
  const refuse = (code: string, message: string): BenchmarkSubmitPreparation =>
    Object.freeze({ status: "REFUSED", networkUsed: false, payload: Object.freeze({}), diagnostics: Object.freeze([createBenchmarkDiagnostic(code, "error", message, "submit")]) });
  if (confirmation !== BENCHMARK_SUBMIT_CONFIRMATION) return refuse("Galerina_BENCHMARK_SUBMIT_NOT_CONFIRMED", `Submission needs the exact confirmation "${BENCHMARK_SUBMIT_CONFIRMATION}".`);
  const shareable = createShareableBenchmarkReport(report, config);
  if (shareable.status !== "SHAREABLE") return Object.freeze({ status: "REFUSED", networkUsed: false, payload: Object.freeze({}), diagnostics: shareable.diagnostics });
  if ((shareable.report as BenchmarkReport).privacy.shareable !== true) return refuse("Galerina_BENCHMARK_SUBMIT_NOT_OPTED_IN", "Submission needs privacy.allowSubmit === true (opt-in).");
  const r = shareable.report as BenchmarkReport;
  const payload: BenchmarkSubmitPayload = deepFreeze({
    schema: "Galerina.benchmark.submit.v1",
    anonymous: true,
    loVersion: r.loVersion,
    mode: r.mode,
    system: r.system,
    scores: r.scores,
    fallbacks: r.tests.filter((t) => t.fallback === true || t.status === "fallback").map((t) => ({ target: t.target, reason: typeof t.reason === "string" ? t.reason : "fallback" })),
  });
  return Object.freeze({ status: "NOT_SUBMITTED_PLACEHOLDER", networkUsed: false, payload, diagnostics: Object.freeze([]) });
}

// ---------------------------------------------------------------------------
// Write benchmark-report.json + closed-shape CLI flag parse + summary
// (TODO pass, Grok 2026-10-05; zero-trust defaults, owner may revisit).
//
// writeBenchmarkReport: validates via captureBenchmarkReport, then exclusive-creates
// benchmark-report.json through a host-supplied BenchmarkReportFileWriter capability
// (this package imports no filesystem module); never overwrites, never echoes
// paths / errno / writer errors / report body on failure, never throws.
//
// parseBenchmarkCliArgs: admits --light|--full|--json|--save|--out <dir> only.
// formatBenchmarkSummary: privacy-safe summary lines (no paths / host / user).
// Does not run benchmarks, probe hardware, or implement the live runner.
// ---------------------------------------------------------------------------

export const BENCHMARK_REPORT_FILE = "benchmark-report.json";

export const BENCHMARK_REPORT_WRITE_LIMITATIONS: readonly string[] = Object.freeze([
  "writes a previously validated BenchmarkReport only",
  "does not run benchmarks or probe hardware",
  "exclusive create; never overwrites an existing file",
  "performs no filesystem IO itself; the host supplies a BenchmarkReportFileWriter capability",
]);

export type BenchmarkReportWriteStatus = "WRITTEN" | "REFUSED" | "IO_FAILED";

export interface BenchmarkReportWriteResult {
  readonly status: BenchmarkReportWriteStatus;
  readonly diagnostics: readonly BenchmarkDiagnostic[];
  readonly report: BenchmarkReport | Readonly<Record<string, never>>;
}

/** Closed outcome vocabulary a host report writer must answer with. */
export type BenchmarkReportFileWriteOutcome = "CREATED" | "EXISTS" | "DIR_INVALID" | "IO_FAILED";

export const BENCHMARK_REPORT_FILE_WRITE_OUTCOMES: readonly BenchmarkReportFileWriteOutcome[] = Object.freeze([
  "CREATED",
  "EXISTS",
  "DIR_INVALID",
  "IO_FAILED",
] as const);

/** Frozen request handed to the host writer. `fileName` is always BENCHMARK_REPORT_FILE. */
export interface BenchmarkReportFileWriteRequest {
  readonly outDir: string;
  readonly fileName: typeof BENCHMARK_REPORT_FILE;
  readonly contents: string;
}

/** Closed result: a plain object with exactly one own data property, `outcome`. */
export interface BenchmarkReportFileWriteResult {
  readonly outcome: BenchmarkReportFileWriteOutcome;
}

/**
 * Host-supplied exclusive-create capability (zero-trust default, owner may revisit).
 * This package imports no filesystem or path module, so its hardened border stays
 * `node:util/types` only; the caller injects IO, as core-runtime injects `spawn` /
 * `sequenceStore` and core-reports declares `ReportWriter`.
 *
 * Contract: `createExclusive` creates `fileName` inside the existing directory `outDir`
 * with exclusive-create, no-follow semantics (O_CREAT | O_EXCL, plus O_NOFOLLOW where
 * the platform has it), writes `contents` as UTF-8, and never overwrites or truncates an
 * existing file. It resolves with `{ outcome }` and never rejects: `CREATED` (file
 * written), `EXISTS` (target already present; nothing written), `DIR_INVALID` (`outDir`
 * is missing or not a directory), `IO_FAILED` (anything else).
 *
 * The writer must be a plain object with exactly one own data property, `createExclusive`
 * (a function). Anything else is refused before the report is captured. A writer that
 * throws, rejects, or answers outside the closed result is treated as IO_FAILED: no write
 * is claimed, and nothing it returned or threw is echoed.
 */
export interface BenchmarkReportFileWriter {
  createExclusive(request: BenchmarkReportFileWriteRequest): Promise<BenchmarkReportFileWriteResult>;
}

type BenchmarkReportCreateExclusive = (request: BenchmarkReportFileWriteRequest) => unknown;

function readBenchmarkReportWriter(writer: unknown): BenchmarkReportCreateExclusive | undefined {
  try {
    if (!isRecord(writer)) return undefined;
    const keys = Reflect.ownKeys(writer);
    if (keys.length !== 1 || keys[0] !== "createExclusive") return undefined;
    const descriptor = Object.getOwnPropertyDescriptor(writer, "createExclusive");
    if (descriptor === undefined || !("value" in descriptor)) return undefined;
    const fn: unknown = descriptor.value;
    if (typeof fn !== "function" || isNodeProxy(fn)) return undefined;
    return fn as BenchmarkReportCreateExclusive;
  } catch {
    return undefined;
  }
}

function readBenchmarkReportWriteOutcome(result: unknown): BenchmarkReportFileWriteOutcome | undefined {
  try {
    if (!isRecord(result)) return undefined;
    const keys = Reflect.ownKeys(result);
    if (keys.length !== 1 || keys[0] !== "outcome") return undefined;
    const descriptor = Object.getOwnPropertyDescriptor(result, "outcome");
    if (descriptor === undefined || !("value" in descriptor)) return undefined;
    const outcome: unknown = descriptor.value;
    return typeof outcome === "string" && (BENCHMARK_REPORT_FILE_WRITE_OUTCOMES as readonly string[]).includes(outcome)
      ? outcome as BenchmarkReportFileWriteOutcome
      : undefined;
  } catch {
    return undefined;
  }
}

/** JSON render of a captured report (trailing newline). */
export function renderBenchmarkReport(report: BenchmarkReport): string {
  return JSON.stringify(report, null, 2) + "\n";
}

/**
 * Exclusively create `benchmark-report.json` in an existing directory through the
 * host-supplied `writer` capability (see BenchmarkReportFileWriter).
 * Never throws. Never echoes paths, errno codes, writer errors, or refused report contents.
 */
export async function writeBenchmarkReport(
  report: unknown,
  outDir: unknown,
  writer: BenchmarkReportFileWriter,
): Promise<BenchmarkReportWriteResult> {
  const empty = Object.freeze({}) as Readonly<Record<string, never>>;
  const refuse = (code: string, message: string, path = "write"): BenchmarkReportWriteResult =>
    Object.freeze({
      status: "REFUSED" as const,
      diagnostics: Object.freeze([createBenchmarkDiagnostic(code, "error", message, path)]),
      report: empty,
    });
  const failIo = (code: string, message: string): BenchmarkReportWriteResult =>
    Object.freeze({
      status: "IO_FAILED" as const,
      diagnostics: Object.freeze([createBenchmarkDiagnostic(code, "error", message, "write")]),
      report: empty,
    });

  if (typeof outDir !== "string" || outDir.length === 0 || outDir.length > 4096) {
    return refuse(
      "Galerina_BENCHMARK_REPORT_WRITE_DIR_INVALID",
      "Output directory must be a non-empty bounded string.",
      "outDir",
    );
  }

  const createExclusive = readBenchmarkReportWriter(writer);
  if (createExclusive === undefined) {
    return refuse(
      "Galerina_BENCHMARK_REPORT_WRITE_WRITER_INVALID",
      "A report writer capability (a plain object with one createExclusive function) is required.",
      "writer",
    );
  }

  const captured = captureBenchmarkReport(report);
  if (captured.report === undefined) {
    return Object.freeze({
      status: "REFUSED" as const,
      diagnostics: captured.diagnostics,
      report: empty,
    });
  }

  const request: BenchmarkReportFileWriteRequest = Object.freeze({
    outDir,
    fileName: BENCHMARK_REPORT_FILE,
    contents: renderBenchmarkReport(captured.report),
  });
  let outcome: BenchmarkReportFileWriteOutcome | undefined;
  try {
    outcome = readBenchmarkReportWriteOutcome(await Reflect.apply(createExclusive, writer, [request]));
  } catch {
    outcome = undefined;
  }

  switch (outcome) {
    case "CREATED":
      return Object.freeze({
        status: "WRITTEN" as const,
        diagnostics: Object.freeze([] as BenchmarkDiagnostic[]),
        report: captured.report,
      });
    case "DIR_INVALID":
      return failIo(
        "Galerina_BENCHMARK_REPORT_WRITE_DIR_INVALID",
        "Output path must resolve to an existing directory.",
      );
    case "EXISTS":
    case "IO_FAILED":
      return failIo(
        "Galerina_BENCHMARK_REPORT_WRITE_IO",
        "Could not exclusively create benchmark-report.json in the output directory.",
      );
    default:
      return failIo(
        "Galerina_BENCHMARK_REPORT_WRITE_WRITER_RESULT_INVALID",
        "The report writer failed or answered outside its closed result; no write is claimed.",
      );
  }
}
/** Unknown / duplicate / equals-form / positional / missing --out value. */
export const Galerina_BENCHMARK_CLI_001 = "Galerina_BENCHMARK_CLI_001";
/** --light and --full conflict. */
export const Galerina_BENCHMARK_CLI_002 = "Galerina_BENCHMARK_CLI_002";
/** --save requires --out; --out dir token refuse. */
export const Galerina_BENCHMARK_CLI_003 = "Galerina_BENCHMARK_CLI_003";
/** Not-admitted flag (e.g. live / apply / network runner hooks). */
export const Galerina_BENCHMARK_CLI_004 = "Galerina_BENCHMARK_CLI_004";

const BENCHMARK_CLI_REFUSED_FLAGS = Object.freeze([
  "--live",
  "--apply",
  "--network",
  "--stress",
  "--submit",
  "--probe",
] as const);

const OUT_DIR_TOKEN = /^(?!.*(?:^|[\/])\.{1,2}(?:[\/]|$))[A-Za-z0-9._~/=+-][A-Za-z0-9._~/=+-]{0,255}$/;

export type BenchmarkCliModeFlag = "light" | "full";

export interface BenchmarkCliArgs {
  readonly mode: BenchmarkCliModeFlag;
  readonly json: boolean;
  readonly save: boolean;
  readonly outDir: string | undefined;
}

export interface BenchmarkCliParseResult {
  readonly ok: boolean;
  readonly args: BenchmarkCliArgs | Readonly<Record<string, never>>;
  readonly diagnostics: readonly BenchmarkDiagnostic[];
}

/**
 * Closed-shape parse for `galerina benchmark` flags (library-side).
 * Admits --light, --full, --json, --save, --out <rel-dir>. Default mode is light.
 * Does not run benchmarks. Never echoes refused tokens.
 */
export function parseBenchmarkCliArgs(argv: unknown): BenchmarkCliParseResult {
  const empty = Object.freeze({}) as Readonly<Record<string, never>>;
  const refuse = (code: string, message: string, path = "argv"): BenchmarkCliParseResult =>
    Object.freeze({
      ok: false,
      args: empty,
      diagnostics: Object.freeze([createBenchmarkDiagnostic(code, "error", message, path)]),
    });

  if (!Array.isArray(argv)) {
    return refuse(Galerina_BENCHMARK_CLI_001, "Benchmark CLI argv must be a dense string array.");
  }
  const args: string[] = [];
  for (let i = 0; i < argv.length; i += 1) {
    if (!Object.prototype.hasOwnProperty.call(argv, i)) {
      return refuse(Galerina_BENCHMARK_CLI_001, "Benchmark CLI argv must be a dense string array.");
    }
    const v = (argv as readonly unknown[])[i];
    if (typeof v !== "string" || v.length === 0 || v.length > 512) {
      return refuse(Galerina_BENCHMARK_CLI_001, "Benchmark CLI argv entries must be non-empty bounded strings.");
    }
    args.push(v);
  }

  let mode: BenchmarkCliModeFlag | undefined;
  let json = false;
  let save = false;
  let outDir: string | undefined;
  let seenLight = false;
  let seenFull = false;
  let seenJson = false;
  let seenSave = false;
  let seenOut = false;

  for (let i = 0; i < args.length; i += 1) {
    const tok = args[i] as string;
    if (tok.includes("=")) {
      return refuse(Galerina_BENCHMARK_CLI_001, "Benchmark CLI flags do not admit equals-form values.");
    }
    if ((BENCHMARK_CLI_REFUSED_FLAGS as readonly string[]).includes(tok)) {
      return refuse(Galerina_BENCHMARK_CLI_004, "Benchmark CLI flag is not admitted in this slice.", "flag");
    }
    if (tok === "--light") {
      if (seenLight) return refuse(Galerina_BENCHMARK_CLI_001, "Duplicate --light flag.", "flag");
      seenLight = true;
      mode = "light";
      continue;
    }
    if (tok === "--full") {
      if (seenFull) return refuse(Galerina_BENCHMARK_CLI_001, "Duplicate --full flag.", "flag");
      seenFull = true;
      mode = "full";
      continue;
    }
    if (tok === "--json") {
      if (seenJson) return refuse(Galerina_BENCHMARK_CLI_001, "Duplicate --json flag.", "flag");
      seenJson = true;
      json = true;
      continue;
    }
    if (tok === "--save") {
      if (seenSave) return refuse(Galerina_BENCHMARK_CLI_001, "Duplicate --save flag.", "flag");
      seenSave = true;
      save = true;
      continue;
    }
    if (tok === "--out") {
      if (seenOut) return refuse(Galerina_BENCHMARK_CLI_001, "Duplicate --out flag.", "flag");
      seenOut = true;
      const next = args[i + 1];
      if (typeof next !== "string") {
        return refuse(Galerina_BENCHMARK_CLI_003, "Benchmark CLI --out requires a directory token.", "out");
      }
      i += 1;
      if (next.includes("\0") || !OUT_DIR_TOKEN.test(next)) {
        return refuse(Galerina_BENCHMARK_CLI_003, "Benchmark CLI --out directory token refused.", "out");
      }
      outDir = next;
      continue;
    }
    if (tok.startsWith("-")) {
      return refuse(Galerina_BENCHMARK_CLI_001, "Unknown Benchmark CLI flag.", "flag");
    }
    return refuse(Galerina_BENCHMARK_CLI_001, "Benchmark CLI does not admit positional arguments.", "argv");
  }

  if (seenLight && seenFull) {
    return refuse(Galerina_BENCHMARK_CLI_002, "Benchmark CLI admits only one of --light or --full.", "mode");
  }
  if (save && outDir === undefined) {
    return refuse(Galerina_BENCHMARK_CLI_003, "Benchmark CLI --save requires --out directory.", "out");
  }
  if (!save && outDir !== undefined) {
    return refuse(Galerina_BENCHMARK_CLI_003, "Benchmark CLI --out requires --save.", "out");
  }

  return Object.freeze({
    ok: true,
    args: Object.freeze({
      mode: mode === undefined ? ("light" as const) : mode,
      json,
      save,
      outDir,
    }),
    diagnostics: Object.freeze([] as BenchmarkDiagnostic[]),
  });
}

const SUMMARY_ID = /^[A-Za-z0-9._-]{1,64}$/;
const SUMMARY_VERSION = /^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/;

/**
 * Privacy-safe CLI summary lines from a captured report. Never includes paths,
 * hostnames, usernames, or raw refusal reasons.
 */
export function formatBenchmarkSummary(report: unknown): readonly string[] {
  const captured = captureBenchmarkReport(report);
  if (captured.report === undefined) {
    return Object.freeze(["benchmark summary unavailable"]);
  }
  const r = captured.report;
  const id = typeof r.benchmarkId === "string" && SUMMARY_ID.test(r.benchmarkId) ? r.benchmarkId : "id-withheld";
  const ver = typeof r.loVersion === "string" && SUMMARY_VERSION.test(r.loVersion) ? r.loVersion : "version-withheld";
  const overall =
    typeof r.scores.overall === "number" && Number.isFinite(r.scores.overall) ? String(r.scores.overall) : "n/a";
  const passed = r.tests.filter((t) => t.status === "passed").length;
  const failed = r.tests.filter((t) => t.status === "failed").length;
  const skipped = r.tests.filter((t) => t.status === "skipped" || t.status === "skipped_timeout").length;
  const fallback = r.tests.filter((t) => t.status === "fallback" || t.fallback === true).length;
  return Object.freeze([
    `galerina benchmark summary`,
    `id=${id} mode=${r.mode} trigger=${r.trigger} version=${ver}`,
    `overall=${overall} durationMs=${Number.isFinite(r.durationMs) ? String(r.durationMs) : "n/a"}`,
    `tests passed=${passed} failed=${failed} skipped=${skipped} fallback=${fallback} total=${r.tests.length}`,
  ]);
}

// Phase 9 comparison report contract (runtime|compiled; report side only, no runner).
export {
  BENCHMARK_COMPARISON_SCHEMA,
  BENCHMARK_COMPARE_SIDES,
  BENCHMARK_COMPARISON_STATUSES,
  BENCHMARK_COMPARISON_LIMITS,
  FUNGI_BENCH_CMP_SHAPE,
  FUNGI_BENCH_CMP_INPUT_MISMATCH,
  FUNGI_BENCH_CMP_VERSION_RECORD,
  FUNGI_BENCH_CMP_SIDES,
  FUNGI_BENCH_CMP_RESULT,
  createBenchmarkComparisonReport,
  type BenchmarkCompareSide,
  type BenchmarkComparisonStatus,
  type BenchmarkComparisonDiagnostic,
  type BenchmarkToolIdentity,
  type BenchmarkCompilerIdentity,
  type BenchmarkComparisonSideResult,
  type BenchmarkComparisonInput,
  type BenchmarkComparisonReport,
  type BenchmarkComparisonResult,
} from "./comparison-report.js";

export {
  FUNGI_BENCH_BOOL_001,
  FUNGI_BENCH_BOOL_002,
  FUNGI_BENCH_BOOL_003,
  FUNGI_BENCH_BOOL_004,
  FUNGI_BENCH_BOOL_005,
  BOOL_LOGIC_BENCHMARK_ID,
  BOOL_LOGIC_BENCHMARK_TARGET,
  BOOL_LOGIC_BENCHMARK_OPTIONS_FIELDS,
  DEFAULT_BOOL_LOGIC_OPERATIONS,
  MAX_BOOL_LOGIC_OPERATIONS,
  DEFAULT_BOOL_LOGIC_MAX_DURATION_MS,
  MAX_BOOL_LOGIC_MAX_DURATION_MS,
  runBoolLogicBenchmark,
  scoreBoolLogicBenchmark,
  type BoolLogicBenchmarkDiagnosticField,
  type BoolLogicBenchmarkDiagnostic,
  type BoolLogicBenchmarkOptions,
  type BoolLogicBenchmarkResult,
  type RunBoolLogicBenchmarkResult,
} from "./bool-logic-benchmark.js";


export {
  FUNGI_BENCH_TRI_001,
  FUNGI_BENCH_TRI_002,
  FUNGI_BENCH_TRI_003,
  FUNGI_BENCH_TRI_004,
  FUNGI_BENCH_TRI_005,
  TRI_LOGIC_BENCHMARK_ID,
  TRI_LOGIC_BENCHMARK_TARGET,
  TRI_FALSE,
  TRI_UNKNOWN,
  TRI_TRUE,
  TRI_VALUES,
  TRI_LOGIC_BENCHMARK_OPTIONS_FIELDS,
  DEFAULT_TRI_LOGIC_OPERATIONS,
  MAX_TRI_LOGIC_OPERATIONS,
  DEFAULT_TRI_LOGIC_MAX_DURATION_MS,
  MAX_TRI_LOGIC_MAX_DURATION_MS,
  isBenchTri,
  benchTriAnd,
  benchTriOr,
  benchTriNot,
  runTriLogicBenchmark,
  scoreTriLogicBenchmark,
  type BenchTri,
  type TriLogicBenchmarkDiagnosticField,
  type TriLogicBenchmarkDiagnostic,
  type TriLogicBenchmarkOptions,
  type TriLogicBenchmarkResult,
  type RunTriLogicBenchmarkResult,
} from "./tri-logic-benchmark.js";


export {
  FUNGI_BENCH_RO_001,
  FUNGI_BENCH_RO_002,
  FUNGI_BENCH_RO_003,
  FUNGI_BENCH_RO_004,
  FUNGI_BENCH_RO_005,
  RESULT_OPTION_BENCHMARK_ID,
  RESULT_OPTION_BENCHMARK_TARGET,
  RESULT_OPTION_BENCHMARK_OPTIONS_FIELDS,
  DEFAULT_RESULT_OPTION_OPERATIONS,
  MAX_RESULT_OPTION_OPERATIONS,
  DEFAULT_RESULT_OPTION_MAX_DURATION_MS,
  MAX_RESULT_OPTION_MAX_DURATION_MS,
  benchOptionSome,
  benchOptionNone,
  benchResultOk,
  benchResultErr,
  benchUnwrapOr,
  benchMatchResultOption,
  runResultOptionBenchmark,
  scoreResultOptionBenchmark,
  type BenchOption,
  type BenchResult,
  type ResultOptionBenchmarkDiagnosticField,
  type ResultOptionBenchmarkDiagnostic,
  type ResultOptionBenchmarkOptions,
  type ResultOptionBenchmarkResult,
  type RunResultOptionBenchmarkResult,
} from "./result-option-benchmark.js";


export {
  FUNGI_BENCH_CPU_ARITH_001,
  FUNGI_BENCH_CPU_ARITH_002,
  FUNGI_BENCH_CPU_ARITH_003,
  FUNGI_BENCH_CPU_ARITH_004,
  FUNGI_BENCH_CPU_ARITH_005,
  CPU_INTEGER_LOOP_BENCHMARK_ID,
  CPU_FLOAT_LOOP_BENCHMARK_ID,
  CPU_ARITHMETIC_BENCHMARK_TARGET,
  CPU_ARITHMETIC_BENCHMARK_OPTIONS_FIELDS,
  DEFAULT_CPU_ARITHMETIC_OPERATIONS,
  MAX_CPU_ARITHMETIC_OPERATIONS,
  DEFAULT_CPU_ARITHMETIC_MAX_DURATION_MS,
  MAX_CPU_ARITHMETIC_MAX_DURATION_MS,
  benchIntegerStep,
  benchFloatStep,
  runCpuArithmeticBenchmark,
  scoreCpuArithmeticBenchmark,
  type CpuArithmeticBenchmarkDiagnosticField,
  type CpuArithmeticBenchmarkDiagnostic,
  type CpuArithmeticBenchmarkOptions,
  type CpuArithmeticBenchmarkResult,
  type RunCpuArithmeticBenchmarkResult,
} from "./cpu-arithmetic-benchmark.js";


export {
  FUNGI_BENCH_JSON_001,
  FUNGI_BENCH_JSON_002,
  FUNGI_BENCH_JSON_003,
  FUNGI_BENCH_JSON_004,
  FUNGI_BENCH_JSON_005,
  JSON_DECODE_VALIDATE_1MB_BENCHMARK_ID,
  JSON_DECODE_VALIDATE_1MB_BENCHMARK_TARGET,
  JSON_1MB_BYTES,
  JSON_DECODE_VALIDATE_1MB_OPTIONS_FIELDS,
  DEFAULT_JSON_1MB_OPERATIONS,
  MAX_JSON_1MB_OPERATIONS,
  DEFAULT_JSON_1MB_MAX_DURATION_MS,
  MAX_JSON_1MB_MAX_DURATION_MS,
  JSON_1MB_ITEM_FIELDS,
  JSON_1MB_META_FIELDS,
  JSON_1MB_ROOT_FIELDS,
  buildJson1mbPayload,
  validateJson1mbDocument,
  decodeAndValidateJson1mb,
  runJsonDecodeValidate1mbBenchmark,
  scoreJson1mbBenchmark,
  type Json1mbBenchmarkDiagnosticField,
  type Json1mbBenchmarkDiagnostic,
  type Json1mbBenchmarkOptions,
  type Json1mbBenchmarkResult,
  type RunJson1mbBenchmarkResult,
} from "./json-1mb-benchmark.js";

export {
  FUNGI_BENCH_SHA_001,
  FUNGI_BENCH_SHA_002,
  FUNGI_BENCH_SHA_003,
  FUNGI_BENCH_SHA_004,
  FUNGI_BENCH_SHA_005,
  SHA256_32MB_BENCHMARK_ID,
  SHA256_32MB_BENCHMARK_TARGET,
  SHA256_32MB_BYTES,
  SHA256_32MB_OPTIONS_FIELDS,
  DEFAULT_SHA256_32MB_OPERATIONS,
  MAX_SHA256_32MB_OPERATIONS,
  DEFAULT_SHA256_32MB_MAX_DURATION_MS,
  MAX_SHA256_32MB_MAX_DURATION_MS,
  benchSha256Hex,
  buildSha256BenchmarkBuffer,
  runSha256Benchmark,
  scoreSha256Benchmark,
  type Sha256BenchmarkDiagnosticField,
  type Sha256BenchmarkDiagnostic,
  type Sha256BenchmarkOptions,
  type Sha256BenchmarkResult,
  type RunSha256BenchmarkResult,
} from "./sha256-benchmark.js";

export {
  FUNGI_BENCH_VEC_001,
  FUNGI_BENCH_VEC_002,
  FUNGI_BENCH_VEC_003,
  FUNGI_BENCH_VEC_004,
  FUNGI_BENCH_VEC_005,
  VECTOR_DOT_PRODUCT_SMALL_BENCHMARK_ID,
  VECTOR_COSINE_BATCH_SMALL_BENCHMARK_ID,
  SMALL_VECTOR_BENCHMARK_TARGET,
  SMALL_VECTOR_DIMENSION,
  SMALL_VECTOR_COSINE_BATCH,
  SMALL_VECTOR_OPTIONS_FIELDS,
  DEFAULT_SMALL_VECTOR_OPERATIONS,
  MAX_SMALL_VECTOR_OPERATIONS,
  DEFAULT_SMALL_VECTOR_MAX_DURATION_MS,
  MAX_SMALL_VECTOR_MAX_DURATION_MS,
  benchDotFloat32,
  benchCosineFloat32,
  buildSmallVectorFixtures,
  runSmallVectorBenchmark,
  scoreSmallVectorBenchmark,
  type SmallVectorBenchmarkDiagnosticField,
  type SmallVectorBenchmarkDiagnostic,
  type SmallVectorBenchmarkOptions,
  type SmallVectorBenchmarkResult,
  type RunSmallVectorBenchmarkResult,
} from "./small-vector-benchmark.js";

export {
  FUNGI_BENCH_JSONS_001,
  FUNGI_BENCH_JSONS_002,
  FUNGI_BENCH_JSONS_003,
  FUNGI_BENCH_JSONS_004,
  FUNGI_BENCH_JSONS_005,
  JSON_STREAM_VALIDATE_10MB_BENCHMARK_ID,
  JSON_STREAM_VALIDATE_10MB_BENCHMARK_TARGET,
  JSON_STREAM_10MB_BYTES,
  JSON_STREAM_CHUNK_BYTES,
  JSON_STREAM_MAX_LINE_BYTES,
  JSON_STREAM_10MB_OPTIONS_FIELDS,
  DEFAULT_JSON_STREAM_10MB_OPERATIONS,
  MAX_JSON_STREAM_10MB_OPERATIONS,
  DEFAULT_JSON_STREAM_10MB_MAX_DURATION_MS,
  MAX_JSON_STREAM_10MB_MAX_DURATION_MS,
  validateJsonStreamRecord,
  createJsonLinesStreamValidator,
  buildJsonStream10mbPayload,
  streamValidateJsonLines,
  runJsonStreamValidate10mbBenchmark,
  scoreJsonStreamBenchmark,
  type JsonStreamBenchmarkDiagnosticField,
  type JsonStreamBenchmarkDiagnostic,
  type JsonStreamBenchmarkOptions,
  type JsonStreamBenchmarkResult,
  type RunJsonStreamBenchmarkResult,
  type JsonLinesStreamSummary,
  type JsonLinesStreamValidator,
} from "./json-stream-10mb-benchmark.js";

export {
  FUNGI_BENCH_MAT_001,
  FUNGI_BENCH_MAT_002,
  FUNGI_BENCH_MAT_003,
  FUNGI_BENCH_MAT_004,
  FUNGI_BENCH_MAT_005,
  MATRIX_MULTIPLY_MEDIUM_BENCHMARK_ID,
  MATRIX_MULTIPLY_MEDIUM_BENCHMARK_TARGET,
  MATRIX_MULTIPLY_MEDIUM_N,
  MATRIX_MULTIPLY_MEDIUM_MUL_ADDS,
  MATRIX_MULTIPLY_MEDIUM_TOLERANCE,
  MATRIX_MULTIPLY_MEDIUM_OPTIONS_FIELDS,
  DEFAULT_MATRIX_MULTIPLY_MEDIUM_OPERATIONS,
  MAX_MATRIX_MULTIPLY_MEDIUM_OPERATIONS,
  DEFAULT_MATRIX_MULTIPLY_MEDIUM_MAX_DURATION_MS,
  MAX_MATRIX_MULTIPLY_MEDIUM_MAX_DURATION_MS,
  benchMatMulFloat32,
  buildMatrixMediumFixtures,
  verifyMatMulSpotEntries,
  runMatrixMultiplyMediumBenchmark,
  scoreMatrixBenchmark,
  type MatrixBenchmarkDiagnosticField,
  type MatrixBenchmarkDiagnostic,
  type MatrixBenchmarkOptions,
  type MatrixBenchmarkResult,
  type RunMatrixBenchmarkResult,
} from "./matrix-medium-benchmark.js";

export {
  FUNGI_BENCH_JSONG_001,
  FUNGI_BENCH_JSONG_002,
  FUNGI_BENCH_JSONG_003,
  FUNGI_BENCH_JSONG_004,
  FUNGI_BENCH_JSONG_005,
  JSON_STREAM_VALIDATE_100MB_BENCHMARK_ID,
  JSON_STREAM_VALIDATE_1GB_OPTIONAL_BENCHMARK_ID,
  JSON_STREAM_GENERATED_BENCHMARK_TARGET,
  JSON_STREAM_100MB_BYTES,
  JSON_STREAM_1GB_BYTES,
  MIN_JSON_STREAM_GENERATED_BYTES,
  JSON_STREAM_GENERATED_OPTIONS_FIELDS,
  DEFAULT_JSON_STREAM_100MB_MAX_DURATION_MS,
  MAX_JSON_STREAM_100MB_MAX_DURATION_MS,
  DEFAULT_JSON_STREAM_1GB_MAX_DURATION_MS,
  MAX_JSON_STREAM_1GB_MAX_DURATION_MS,
  generateJsonLinesChunks,
  streamValidateGeneratedJsonLines,
  scoreJsonStreamGeneratedBenchmark,
  runJsonStreamValidate100mbBenchmark,
  runJsonStreamValidate1gbOptionalBenchmark,
  type JsonStreamGeneratedBenchmarkId,
  type JsonStreamGeneratedDiagnosticField,
  type JsonStreamGeneratedDiagnostic,
  type JsonStreamGeneratedResult,
  type RunJsonStreamGeneratedResult,
  type GeneratedJsonLinesSummary,
} from "./json-stream-generated-benchmark.js";

// Light benchmark command runner (in-process; host-injected facts; light mode only).
export {
  FUNGI_BENCH_RUN_001,
  FUNGI_BENCH_RUN_002,
  FUNGI_BENCH_RUN_003,
  FUNGI_BENCH_RUN_004,
  FUNGI_BENCH_RUN_005,
  FUNGI_BENCH_RUN_006,
  BENCHMARK_RUNNER_INPUT_FIELDS,
  BENCHMARK_RUNNER_REASONS,
  LIGHT_BENCHMARK_CASE_IDS,
  LIGHT_BENCHMARK_RUN_GROUPS,
  createLightBenchmarkRunner,
  runLightBenchmark,
  type BenchmarkRunnerDiagnostic,
  type BenchmarkRunnerInput,
  type BenchmarkRunnerResult,
} from "./benchmark-runner.js";

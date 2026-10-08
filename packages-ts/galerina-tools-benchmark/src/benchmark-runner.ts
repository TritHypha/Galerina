/**
 * Light benchmark command runner (in-process; no hardware probes, no I/O).
 *
 * Runs the README "Light Benchmark Task List" in order through the case
 * modules that already exist, and assembles one `Galerina.benchmark.report.v1`
 * report. The finished report must pass `validateBenchmarkReport`, or the run
 * is refused.
 *
 * Zero-trust defaults (owner may revisit):
 * - Only `light` mode is admitted. `full` and `stress` are refused until their
 *   runner rows land.
 * - The host injects every environmental fact: benchmarkId, loVersion, the
 *   system record and a clock. The runner reads no OS, file, network or
 *   environment state.
 * - Cases with no closed implementation are reported `skipped` with a fixed
 *   reason, and are never run or estimated:
 *   - `logic.logic5_match` is parked (no Logic5 vocabulary);
 *   - `cpu.record_validate` is not implemented;
 *   - the four `*_if_available` hardware cases wait on detection (TODO Phase 4).
 *   `compute.cpu_fallback_check` has no `BenchmarkTarget` and is left out of
 *   `tests`.
 * - A case refusal or throw is recorded as `failed` with a fixed reason. A case
 *   timeout keeps the case's own `skipped_timeout`.
 * - A target set to `false` in config is `skipped` (disabled). `true` and
 *   `"optional"` both run the target's runnable cases. They differ on an
 *   availability-gated case (the four `*_if_available` cases, whose backend
 *   detection is not implemented): `"optional"` reports it `skipped` with the
 *   detection-pending reason, while `true` means the caller requires that
 *   target, so the case is `failed` with a fixed required-unavailable reason
 *   instead of being silently skipped. Parked and not-implemented cases stay
 *   `skipped` either way.
 * - When the total budget (`config.maxDurationSeconds`) is spent, every
 *   remaining case is `skipped_timeout` and is not run.
 * - Target summary:
 *   - any `failed` gives `failed`;
 *   - all `passed` gives `passed`;
 *   - nothing passed gives `skipped`;
 *   - otherwise `partial`.
 *   `recovery` and `compare` have no light cases, so they are `skipped`.
 * - Scores: a target score is the floor of the mean of its `passed` case
 *   scores, omitted when none passed. `overall` is the floor of the mean of the
 *   present target scores, or 0. The score formula is an owner-revisit pick.
 * - `privacy.shareable` is always false here. Sharing goes through
 *   `createShareableBenchmarkReport`.
 * - Diagnostics never echo input values.
 * - `createLightBenchmarkRunner(cases)` lets a host (in practice, tests) replace
 *   the case function of a run group with its own function, for example a
 *   throwing case or one driven by a fake clock. The runner itself still does no
 *   I/O; the override set must be a closed plain record of known group ids to
 *   functions, or every call is refused (FUNGI-BENCH-RUN-006).
 */
import {
  DEFAULT_BENCHMARK_CONFIG,
  validateBenchmarkConfig,
  validateBenchmarkReport,
} from "./index.js";
import type {
  BenchmarkConfig,
  BenchmarkReport,
  BenchmarkScores,
  BenchmarkStatus,
  BenchmarkSystemInfo,
  BenchmarkTarget,
  BenchmarkTestResult,
  BenchmarkTrigger,
} from "./index.js";
import { runBoolLogicBenchmark } from "./bool-logic-benchmark.js";
import { runTriLogicBenchmark } from "./tri-logic-benchmark.js";
import { runResultOptionBenchmark } from "./result-option-benchmark.js";
import { runCpuArithmeticBenchmark } from "./cpu-arithmetic-benchmark.js";
import { runSha256Benchmark } from "./sha256-benchmark.js";
import { runJsonDecodeValidate1mbBenchmark } from "./json-1mb-benchmark.js";
import { runJsonStreamValidate10mbBenchmark } from "./json-stream-10mb-benchmark.js";
import { runSmallVectorBenchmark } from "./small-vector-benchmark.js";

/** Runner input is not a closed plain record, or a field is outside its domain. */
export const FUNGI_BENCH_RUN_001 = "FUNGI-BENCH-RUN-001";
/** Mode is not admitted (only `light`). */
export const FUNGI_BENCH_RUN_002 = "FUNGI-BENCH-RUN-002";
/** The supplied benchmark config is invalid. */
export const FUNGI_BENCH_RUN_003 = "FUNGI-BENCH-RUN-003";
/** The clock returned a non-finite or backwards value. */
export const FUNGI_BENCH_RUN_004 = "FUNGI-BENCH-RUN-004";
/** The assembled report failed `validateBenchmarkReport` (for example a bad system record). */
export const FUNGI_BENCH_RUN_005 = "FUNGI-BENCH-RUN-005";
/** The case override set given to `createLightBenchmarkRunner` is not a closed record of known run groups to functions. */
export const FUNGI_BENCH_RUN_006 = "FUNGI-BENCH-RUN-006";

export const BENCHMARK_RUNNER_INPUT_FIELDS = Object.freeze([
  "mode", "benchmarkId", "loVersion", "trigger", "system", "config", "now",
] as const);

/** README light task list, in order. `compute.cpu_fallback_check` is omitted (no BenchmarkTarget). */
export const LIGHT_BENCHMARK_CASE_IDS = Object.freeze([
  "logic.bool_branch",
  "logic.tri_match",
  "logic.logic5_match",
  "logic.result_option",
  "cpu.integer_loop",
  "cpu.float_loop",
  "cpu.record_validate",
  "cpu.hash_sha256_32mb",
  "json.decode_validate_1mb",
  "json.stream_validate_10mb",
  "vector.dot_product_small",
  "vector.cosine_batch_small",
  "gpu.vector_small_if_available",
  "ai_accelerator.llm_batch_if_available",
  "low_bit_ai.reference_small_if_available",
  "optical_io.latency_small_if_available",
] as const);

export const BENCHMARK_RUNNER_REASONS = Object.freeze({
  parked: "Case parked: no closed vocabulary exists for it.",
  notImplemented: "Case not implemented.",
  detectionPending: "Backend detection is not implemented.",
  requiredUnavailable: "Required target unavailable: backend detection is not implemented.",
  disabled: "Target disabled by configuration.",
  budget: "Total benchmark budget spent before this case.",
  refused: "Benchmark case refused.",
} as const);

const SUMMARY_TARGETS: readonly BenchmarkTarget[] = [
  "logic", "cpu", "json", "vector", "gpu", "ai_accelerator", "low_bit_ai", "optical_io", "recovery", "compare",
];
const SCORE_KEY: Partial<Record<BenchmarkTarget, keyof BenchmarkScores>> = {
  logic: "logic", cpu: "cpu", json: "json", vector: "vector",
};
const SAFE_TEXT_RE = /^[A-Za-z0-9._:+-]{1,128}$/;

export interface BenchmarkRunnerDiagnostic {
  readonly code: string;
  readonly message: string;
  readonly field?: string;
}

export interface BenchmarkRunnerInput {
  readonly mode?: "light";
  readonly benchmarkId: string;
  readonly loVersion: string;
  readonly trigger?: BenchmarkTrigger;
  readonly system: BenchmarkSystemInfo;
  readonly config?: BenchmarkConfig;
  /** Host clock in milliseconds; must be finite and non-decreasing. */
  readonly now: () => number;
}

export type BenchmarkRunnerResult =
  | { readonly ok: true; readonly report: BenchmarkReport }
  | { readonly ok: false; readonly diagnostics: readonly BenchmarkRunnerDiagnostic[] };

interface CaseOutcome {
  readonly id: string;
  readonly target: BenchmarkTarget;
  readonly status: "passed" | "failed" | "skipped_timeout";
  readonly durationMs: number;
  readonly operations: number;
  readonly score: number;
}

type CaseRun = (options: { readonly maxDurationMs: number }) =>
  | { readonly ok: true; readonly value: CaseOutcome | readonly CaseOutcome[] }
  | { readonly ok: false };

type CasePlan =
  | { readonly kind: "run"; readonly ids: readonly string[]; readonly target: BenchmarkTarget; readonly run: CaseRun }
  | { readonly kind: "skip"; readonly id: string; readonly target: BenchmarkTarget; readonly reason: string; readonly availabilityGated?: true };

const PLAN: readonly CasePlan[] = [
  { kind: "run", ids: ["logic.bool_branch"], target: "logic", run: runBoolLogicBenchmark as unknown as CaseRun },
  { kind: "run", ids: ["logic.tri_match"], target: "logic", run: runTriLogicBenchmark as unknown as CaseRun },
  { kind: "skip", id: "logic.logic5_match", target: "logic", reason: BENCHMARK_RUNNER_REASONS.parked },
  { kind: "run", ids: ["logic.result_option"], target: "logic", run: runResultOptionBenchmark as unknown as CaseRun },
  { kind: "run", ids: ["cpu.integer_loop", "cpu.float_loop"], target: "cpu", run: runCpuArithmeticBenchmark as unknown as CaseRun },
  { kind: "skip", id: "cpu.record_validate", target: "cpu", reason: BENCHMARK_RUNNER_REASONS.notImplemented },
  { kind: "run", ids: ["cpu.hash_sha256_32mb"], target: "cpu", run: runSha256Benchmark as unknown as CaseRun },
  { kind: "run", ids: ["json.decode_validate_1mb"], target: "json", run: runJsonDecodeValidate1mbBenchmark as unknown as CaseRun },
  { kind: "run", ids: ["json.stream_validate_10mb"], target: "json", run: runJsonStreamValidate10mbBenchmark as unknown as CaseRun },
  { kind: "run", ids: ["vector.dot_product_small", "vector.cosine_batch_small"], target: "vector", run: runSmallVectorBenchmark as unknown as CaseRun },
  { kind: "skip", id: "gpu.vector_small_if_available", target: "gpu", reason: BENCHMARK_RUNNER_REASONS.detectionPending, availabilityGated: true },
  { kind: "skip", id: "ai_accelerator.llm_batch_if_available", target: "ai_accelerator", reason: BENCHMARK_RUNNER_REASONS.detectionPending, availabilityGated: true },
  { kind: "skip", id: "low_bit_ai.reference_small_if_available", target: "low_bit_ai", reason: BENCHMARK_RUNNER_REASONS.detectionPending, availabilityGated: true },
  { kind: "skip", id: "optical_io.latency_small_if_available", target: "optical_io", reason: BENCHMARK_RUNNER_REASONS.detectionPending, availabilityGated: true },
];

const MODULE_MAX_DURATION_MS = 60_000;

/** First case id of each run group: the keys `createLightBenchmarkRunner` accepts. */
export const LIGHT_BENCHMARK_RUN_GROUPS = Object.freeze(
  PLAN.flatMap((p) => (p.kind === "run" && p.ids[0] !== undefined ? [p.ids[0]] : [])),
);

function refuse(code: string, message: string, field?: string): BenchmarkRunnerResult {
  const d = field === undefined ? { code, message } : { code, message, field };
  return Object.freeze({ ok: false as const, diagnostics: Object.freeze([Object.freeze(d)]) });
}

function snapshot(input: unknown): Map<string, unknown> | undefined {
  try {
    if (input === null || typeof input !== "object" || Array.isArray(input)) return undefined;
    const proto: unknown = Object.getPrototypeOf(input);
    if (proto !== Object.prototype && proto !== null) return undefined;
    const keys = Reflect.ownKeys(input);
    if (keys.length > BENCHMARK_RUNNER_INPUT_FIELDS.length) return undefined;
    const out = new Map<string, unknown>();
    for (const key of keys) {
      if (typeof key !== "string" || !(BENCHMARK_RUNNER_INPUT_FIELDS as readonly string[]).includes(key)) return undefined;
      const d = Object.getOwnPropertyDescriptor(input, key);
      if (d === undefined || !("value" in d)) return undefined;
      out.set(key, d.value);
    }
    return out;
  } catch {
    return undefined;
  }
}

function readClock(now: () => number, previous: number | undefined): number | undefined {
  let t: unknown;
  try {
    t = now();
  } catch {
    return undefined;
  }
  if (typeof t !== "number" || !Number.isFinite(t) || t < 0) return undefined;
  if (previous !== undefined && t < previous) return undefined;
  return t;
}

function summarise(statuses: readonly BenchmarkStatus[]): BenchmarkStatus {
  if (statuses.includes("failed")) return "failed";
  if (statuses.length > 0 && statuses.every((s) => s === "passed")) return "passed";
  if (!statuses.includes("passed")) return "skipped";
  return "partial";
}

/** Snapshot a case override set: closed plain record, known group ids, function values. */
function snapshotOverrides(cases: unknown): ReadonlyMap<string, CaseRun> | undefined {
  try {
    if (cases === undefined) return new Map();
    if (cases === null || typeof cases !== "object" || Array.isArray(cases)) return undefined;
    const proto: unknown = Object.getPrototypeOf(cases);
    if (proto !== Object.prototype && proto !== null) return undefined;
    const out = new Map<string, CaseRun>();
    for (const key of Reflect.ownKeys(cases)) {
      if (typeof key !== "string" || !(LIGHT_BENCHMARK_RUN_GROUPS as readonly string[]).includes(key)) return undefined;
      const d = Object.getOwnPropertyDescriptor(cases, key);
      if (d === undefined || !("value" in d) || typeof d.value !== "function") return undefined;
      out.set(key, d.value as CaseRun);
    }
    return out;
  } catch {
    return undefined;
  }
}

/**
 * Build a light runner whose run groups may be replaced by host functions
 * (keyed by `LIGHT_BENCHMARK_RUN_GROUPS`). An invalid override set yields a
 * runner that refuses every call with FUNGI-BENCH-RUN-006.
 */
export function createLightBenchmarkRunner(cases?: unknown): (input: unknown) => BenchmarkRunnerResult {
  const overrides = snapshotOverrides(cases);
  if (overrides === undefined) {
    return () => refuse(FUNGI_BENCH_RUN_006, "Case override set must map known run groups to functions.", "cases");
  }
  return (input: unknown) => runWith(input, overrides);
}

/** Run the light benchmark set and return a validated report, or refuse. */
export function runLightBenchmark(input: unknown): BenchmarkRunnerResult {
  return runWith(input, new Map());
}

function runWith(input: unknown, overrides: ReadonlyMap<string, CaseRun>): BenchmarkRunnerResult {
  const snap = snapshot(input);
  if (snap === undefined) return refuse(FUNGI_BENCH_RUN_001, "Runner input must be a closed plain data record.", "record");
  const mode = snap.has("mode") ? snap.get("mode") : "light";
  if (mode !== "light") return refuse(FUNGI_BENCH_RUN_002, "Only light mode is admitted by this runner.", "mode");
  const benchmarkId = snap.get("benchmarkId");
  const loVersion = snap.get("loVersion");
  if (typeof benchmarkId !== "string" || !SAFE_TEXT_RE.test(benchmarkId)) {
    return refuse(FUNGI_BENCH_RUN_001, "benchmarkId must be 1-128 safe characters.", "benchmarkId");
  }
  if (typeof loVersion !== "string" || !SAFE_TEXT_RE.test(loVersion)) {
    return refuse(FUNGI_BENCH_RUN_001, "loVersion must be 1-128 safe characters.", "loVersion");
  }
  const trigger = snap.has("trigger") ? snap.get("trigger") : "manual";
  if (trigger !== "manual" && trigger !== "major_version_update" && trigger !== "ci") {
    return refuse(FUNGI_BENCH_RUN_001, "trigger is outside the closed vocabulary.", "trigger");
  }
  const now = snap.get("now");
  if (typeof now !== "function") return refuse(FUNGI_BENCH_RUN_001, "now must be a clock function.", "now");
  const config = (snap.has("config") ? snap.get("config") : DEFAULT_BENCHMARK_CONFIG) as BenchmarkConfig;
  if (validateBenchmarkConfig(config).some((d) => d.severity === "error")) {
    return refuse(FUNGI_BENCH_RUN_003, "Benchmark config is invalid.", "config");
  }
  const system = snap.get("system");

  const budgetMs = config.maxDurationSeconds * 1000;
  const caseMaxMs = Math.max(1, Math.min(MODULE_MAX_DURATION_MS, Math.floor(config.maxSingleTestSeconds * 1000)));
  const clock = now as () => number;
  const started = readClock(clock, undefined);
  if (started === undefined) return refuse(FUNGI_BENCH_RUN_004, "Clock returned an invalid value.", "now");
  let last = started;

  const tests: BenchmarkTestResult[] = [];
  for (const plan of PLAN) {
    const ids = plan.kind === "run" ? plan.ids : [plan.id];
    // `false` disables a target; `true` and `"optional"` both leave it enabled.
    const setting = config.targets[plan.target];
    const enabled = setting !== false;
    if (plan.kind === "skip") {
      if (!enabled) {
        tests.push({ id: plan.id, target: plan.target, status: "skipped", reason: BENCHMARK_RUNNER_REASONS.disabled });
      } else if (plan.availabilityGated === true && setting === true) {
        // Required (`true`) but unavailable: fail closed instead of a silent skip.
        tests.push({ id: plan.id, target: plan.target, status: "failed", reason: BENCHMARK_RUNNER_REASONS.requiredUnavailable });
      } else {
        tests.push({ id: plan.id, target: plan.target, status: "skipped", reason: plan.reason });
      }
      continue;
    }
    if (!enabled) {
      for (const id of ids) tests.push({ id, target: plan.target, status: "skipped", reason: BENCHMARK_RUNNER_REASONS.disabled });
      continue;
    }
    if (last - started >= budgetMs) {
      for (const id of ids) tests.push({ id, target: plan.target, status: "skipped_timeout", reason: BENCHMARK_RUNNER_REASONS.budget });
      continue;
    }
    let outcome: ReturnType<CaseRun> | undefined;
    try {
      const run = overrides.get(plan.ids[0] ?? "") ?? plan.run;
      outcome = run({ maxDurationMs: caseMaxMs });
    } catch {
      outcome = undefined;
    }
    const values = outcome !== undefined && outcome.ok
      ? (Array.isArray(outcome.value) ? outcome.value : [outcome.value]) as readonly CaseOutcome[]
      : undefined;
    for (const id of ids) {
      const v = values?.find((x) => x !== null && typeof x === "object" && x.id === id && x.target === plan.target);
      if (v === undefined || (v.status !== "passed" && v.status !== "failed" && v.status !== "skipped_timeout")) {
        tests.push({ id, target: plan.target, status: "failed", reason: BENCHMARK_RUNNER_REASONS.refused });
        continue;
      }
      tests.push({
        id,
        target: plan.target,
        status: v.status,
        durationMs: v.durationMs,
        operations: v.operations,
        score: v.status === "failed" ? 0 : v.score,
      });
    }
    const t = readClock(clock, last);
    if (t === undefined) return refuse(FUNGI_BENCH_RUN_004, "Clock returned an invalid value.", "now");
    last = t;
  }

  const summary = {} as Record<BenchmarkTarget, BenchmarkStatus>;
  const scores: Record<string, number> = {};
  const targetScores: number[] = [];
  for (const target of SUMMARY_TARGETS) {
    const rows = tests.filter((r) => r.target === target);
    summary[target] = summarise(rows.map((r) => r.status));
    const passed = rows.filter((r) => r.status === "passed" && typeof r.score === "number");
    const key = SCORE_KEY[target];
    if (key !== undefined && passed.length > 0) {
      const mean = Math.floor(passed.reduce((sum, r) => sum + (r.score as number), 0) / passed.length);
      scores[key] = mean;
      targetScores.push(mean);
    }
  }
  scores.overall = targetScores.length === 0 ? 0 : Math.floor(targetScores.reduce((a, b) => a + b, 0) / targetScores.length);

  const report = {
    schema: "Galerina.benchmark.report.v1" as const,
    benchmarkId,
    mode: "light" as const,
    trigger,
    loVersion,
    system,
    durationMs: Math.floor(last - started),
    summary,
    scores,
    tests,
    privacy: {
      shareable: false,
      containsPersonalData: false as const,
      machineId: "not_included" as const,
      hostname: "not_included" as const,
      username: "not_included" as const,
      projectPath: "not_included" as const,
    },
  };
  if (validateBenchmarkReport(report).some((d) => d.severity === "error")) {
    return refuse(FUNGI_BENCH_RUN_005, "Assembled report failed report validation.", "report");
  }
  return Object.freeze({ ok: true as const, report: report as unknown as BenchmarkReport });
}
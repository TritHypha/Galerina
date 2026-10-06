// CPU arithmetic benchmark case (TODO pass, Grok 2026-10-05; zero-trust
// defaults, owner may revisit).
//
// Closes the tools-benchmark TODO row "Add CPU arithmetic benchmark". Grounded
// in README CPU Benchmarks (integer arithmetic / floating-point arithmetic)
// and light ids `cpu.integer_loop` / `cpu.float_loop`. CASE ONLY relative to
// the command runner: in-process integer + float loop microbench returning a
// closed BenchmarkTestResult shape. No command runner, hardware probes,
// vector/SIMD detection, network submit, or Phase 8-9 workloads.
//
// Zero-trust rules:
//  - Options closed via property descriptors (no getters; symbols / accessors /
//    custom prototypes refuse). Unknown keys refuse without echo.
//  - operations / maxDurationMs are finite safe positive ints within bounds.
//  - Integer path uses only safe integers; float path refuses NaN/Infinity as
//    success (never collapses non-finite to allow).
//  - Never throws; never echoes options / tokens.

/** Options record is not a closed data object. */
export const FUNGI_BENCH_CPU_ARITH_001 = "FUNGI-BENCH-CPU-ARITH-001";
/** A field value is outside its closed domain. */
export const FUNGI_BENCH_CPU_ARITH_002 = "FUNGI-BENCH-CPU-ARITH-002";
/** Consistency refuse (integer/float mismatch). */
export const FUNGI_BENCH_CPU_ARITH_003 = "FUNGI-BENCH-CPU-ARITH-003";
/** Reserved nested refuse. */
export const FUNGI_BENCH_CPU_ARITH_004 = "FUNGI-BENCH-CPU-ARITH-004";
/** Lookup / result consistency refuse. */
export const FUNGI_BENCH_CPU_ARITH_005 = "FUNGI-BENCH-CPU-ARITH-005";

export const CPU_INTEGER_LOOP_BENCHMARK_ID = "cpu.integer_loop";
export const CPU_FLOAT_LOOP_BENCHMARK_ID = "cpu.float_loop";
export const CPU_ARITHMETIC_BENCHMARK_TARGET = "cpu" as const;

export const CPU_ARITHMETIC_BENCHMARK_OPTIONS_FIELDS = Object.freeze(["operations", "maxDurationMs"] as const);

export const DEFAULT_CPU_ARITHMETIC_OPERATIONS = 100_000;
export const MAX_CPU_ARITHMETIC_OPERATIONS = 1_000_000;
export const DEFAULT_CPU_ARITHMETIC_MAX_DURATION_MS = 5_000;
export const MAX_CPU_ARITHMETIC_MAX_DURATION_MS = 60_000;

export type CpuArithmeticBenchmarkDiagnosticField =
  | "record" | "operations" | "maxDurationMs" | "result" | "id" | "target";

export interface CpuArithmeticBenchmarkDiagnostic {
  readonly code: string;
  readonly severity: "error";
  readonly message: string;
  readonly field: CpuArithmeticBenchmarkDiagnosticField;
}

export interface CpuArithmeticBenchmarkOptions {
  readonly operations: number;
  readonly maxDurationMs: number;
}

export interface CpuArithmeticBenchmarkResult {
  readonly id: typeof CPU_INTEGER_LOOP_BENCHMARK_ID | typeof CPU_FLOAT_LOOP_BENCHMARK_ID;
  readonly target: typeof CPU_ARITHMETIC_BENCHMARK_TARGET;
  readonly status: "passed" | "failed" | "skipped_timeout";
  readonly durationMs: number;
  readonly operations: number;
  readonly score: number;
}

export type RunCpuArithmeticBenchmarkResult =
  | { readonly ok: true; readonly value: readonly CpuArithmeticBenchmarkResult[] }
  | { readonly ok: false; readonly diagnostics: readonly CpuArithmeticBenchmarkDiagnostic[] };

const diag = (
  code: string,
  message: string,
  field: CpuArithmeticBenchmarkDiagnosticField,
): CpuArithmeticBenchmarkDiagnostic => Object.freeze({ code, severity: "error" as const, message, field });

type Snapshot = { readonly ok: true; readonly values: ReadonlyMap<string, unknown> } | { readonly ok: false };

function snapshotRecord(value: unknown, maxKeys: number): Snapshot {
  try {
    if (value === null || typeof value !== "object" || Array.isArray(value)) return { ok: false };
    const proto: unknown = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) return { ok: false };
    const values = new Map<string, unknown>();
    const keys = Reflect.ownKeys(value);
    if (keys.length > maxKeys) return { ok: false };
    for (const key of keys) {
      if (typeof key !== "string") return { ok: false };
      const d = Object.getOwnPropertyDescriptor(value, key);
      if (d === undefined || !("value" in d) || d.get !== undefined || d.set !== undefined) return { ok: false };
      values.set(key, d.value);
    }
    return { ok: true, values };
  } catch {
    return { ok: false };
  }
}

function readPositiveSafeInt(
  value: unknown,
  min: number,
  max: number,
  field: CpuArithmeticBenchmarkDiagnosticField,
  out: CpuArithmeticBenchmarkDiagnostic[],
): number | undefined {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min || value > max) {
    out.push(diag(FUNGI_BENCH_CPU_ARITH_002, "Numeric option is outside the closed domain.", field));
    return undefined;
  }
  return value;
}

function readOptions(input: unknown): { readonly ok: true; readonly value: CpuArithmeticBenchmarkOptions } | { readonly ok: false; readonly diagnostics: readonly CpuArithmeticBenchmarkDiagnostic[] } {
  const out: CpuArithmeticBenchmarkDiagnostic[] = [];
  if (input === undefined) {
    return Object.freeze({
      ok: true as const,
      value: Object.freeze({
        operations: DEFAULT_CPU_ARITHMETIC_OPERATIONS,
        maxDurationMs: DEFAULT_CPU_ARITHMETIC_MAX_DURATION_MS,
      }),
    });
  }
  const snap = snapshotRecord(input, 8);
  if (!snap.ok) {
    out.push(diag(FUNGI_BENCH_CPU_ARITH_001, "CPU arithmetic benchmark options must be a plain data object.", "record"));
    return Object.freeze({ ok: false as const, diagnostics: Object.freeze(out) });
  }
  for (const key of snap.values.keys()) {
    if (key !== "operations" && key !== "maxDurationMs") {
      out.push(diag(FUNGI_BENCH_CPU_ARITH_001, "Record has a key outside the closed shape.", "record"));
      return Object.freeze({ ok: false as const, diagnostics: Object.freeze(out) });
    }
  }
  const operations = snap.values.has("operations")
    ? readPositiveSafeInt(snap.values.get("operations"), 1, MAX_CPU_ARITHMETIC_OPERATIONS, "operations", out)
    : DEFAULT_CPU_ARITHMETIC_OPERATIONS;
  if (operations === undefined) return Object.freeze({ ok: false as const, diagnostics: Object.freeze(out) });
  const maxDurationMs = snap.values.has("maxDurationMs")
    ? readPositiveSafeInt(snap.values.get("maxDurationMs"), 1, MAX_CPU_ARITHMETIC_MAX_DURATION_MS, "maxDurationMs", out)
    : DEFAULT_CPU_ARITHMETIC_MAX_DURATION_MS;
  if (maxDurationMs === undefined) return Object.freeze({ ok: false as const, diagnostics: Object.freeze(out) });
  return Object.freeze({
    ok: true as const,
    value: Object.freeze({ operations, maxDurationMs }),
  });
}

function nowMs(): number {
  try {
    if (typeof performance !== "undefined" && typeof performance.now === "function") {
      const t = performance.now();
      if (typeof t === "number" && Number.isFinite(t)) return t;
    }
  } catch {
    // fall through
  }
  return Date.now();
}

/** Closed integer mix: add / xor / mul-mod; always returns a safe int or undefined. */
export function benchIntegerStep(seed: number, i: number): number | undefined {
  if (!Number.isSafeInteger(seed) || !Number.isSafeInteger(i)) return undefined;
  const a = (seed + i) | 0;
  const b = (a ^ (i * 17)) | 0;
  const c = Math.imul(b, 31);
  if (!Number.isSafeInteger(c)) return undefined;
  return c;
}

/**
 * Closed float mix: multiply-add with a fixed coefficient.
 * Returns undefined on non-finite (never collapses NaN/Infinity to allow).
 */
export function benchFloatStep(seed: number, i: number): number | undefined {
  if (typeof seed !== "number" || !Number.isFinite(seed)) return undefined;
  if (!Number.isSafeInteger(i)) return undefined;
  const x = seed * 1.0000001 + i * 0.000001;
  if (!Number.isFinite(x)) return undefined;
  return x;
}

export function scoreCpuArithmeticBenchmark(operations: number, durationMs: number): number {
  if (!Number.isSafeInteger(operations) || operations < 0) return 0;
  if (typeof durationMs !== "number" || !Number.isFinite(durationMs) || durationMs < 0) return 0;
  if (operations === 0) return 0;
  if (durationMs === 0) return 10_000;
  const raw = Math.floor((operations / durationMs) * 10);
  if (!Number.isSafeInteger(raw) || raw < 0) return 0;
  return raw > 10_000 ? 10_000 : raw;
}

function runOneLoop(
  id: typeof CPU_INTEGER_LOOP_BENCHMARK_ID | typeof CPU_FLOAT_LOOP_BENCHMARK_ID,
  operations: number,
  maxDurationMs: number,
  step: (seed: number, i: number) => number | undefined,
  initialSeed: number,
): CpuArithmeticBenchmarkResult {
  const started = nowMs();
  let seed = initialSeed;
  let completed = 0;
  for (let i = 0; i < operations; i += 1) {
    const next = step(seed, i);
    if (next === undefined) {
      const durationMs = Math.max(0, Math.floor(nowMs() - started));
      return Object.freeze({
        id,
        target: CPU_ARITHMETIC_BENCHMARK_TARGET,
        status: "failed" as const,
        durationMs: Number.isSafeInteger(durationMs) ? durationMs : 0,
        operations: completed,
        score: 0,
      });
    }
    seed = next;
    completed += 1;
    if ((i & 1023) === 1023) {
      const elapsed = nowMs() - started;
      if (elapsed > maxDurationMs) {
        const durationMs = Math.max(0, Math.floor(elapsed));
        const safeDuration = Number.isSafeInteger(durationMs) ? durationMs : 0;
        return Object.freeze({
          id,
          target: CPU_ARITHMETIC_BENCHMARK_TARGET,
          status: "skipped_timeout" as const,
          durationMs: safeDuration,
          operations: completed,
          score: scoreCpuArithmeticBenchmark(completed, safeDuration),
        });
      }
    }
  }
  const durationMs = Math.max(0, Math.floor(nowMs() - started));
  const safeDuration = Number.isSafeInteger(durationMs) ? durationMs : 0;
  return Object.freeze({
    id,
    target: CPU_ARITHMETIC_BENCHMARK_TARGET,
    status: "passed" as const,
    durationMs: safeDuration,
    operations: completed,
    score: scoreCpuArithmeticBenchmark(completed, safeDuration),
  });
}

/**
 * Run closed CPU integer + float loop microbenches. Never throws.
 * Returns both light ids `cpu.integer_loop` and `cpu.float_loop` as a frozen array.
 */
export function runCpuArithmeticBenchmark(input?: unknown): RunCpuArithmeticBenchmarkResult {
  try {
    const opts = readOptions(input);
    if (!opts.ok) return opts;
    const { operations, maxDurationMs } = opts.value;
    const integerResult = runOneLoop(CPU_INTEGER_LOOP_BENCHMARK_ID, operations, maxDurationMs, benchIntegerStep, 1);
    const floatResult = runOneLoop(CPU_FLOAT_LOOP_BENCHMARK_ID, operations, maxDurationMs, benchFloatStep, 1);
    return Object.freeze({
      ok: true as const,
      value: Object.freeze([integerResult, floatResult]),
    });
  } catch {
    return Object.freeze({
      ok: false as const,
      diagnostics: Object.freeze([diag(FUNGI_BENCH_CPU_ARITH_005, "CPU arithmetic benchmark refused after an unexpected failure.", "result")]),
    });
  }
}

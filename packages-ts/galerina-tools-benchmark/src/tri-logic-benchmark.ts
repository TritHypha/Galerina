// Tri logic benchmark case (TODO pass, Grok 2026-10-05; zero-trust defaults,
// owner may revisit).
//
// Closes the tools-benchmark TODO row "Add Tri logic benchmark". Grounded in
// README Logic Benchmarks (Tri), recommended light test id `logic.tri_match`,
// and the closed Galerina Tri vocabulary `-1|0|1` (false|unknown|true) as in
// galerina-core-logic (Kleene and=min, or=max, not=unknown-preserving invert).
// This package does not import core-logic; the table below is the closed copy.
//
// CASE ONLY relative to the command runner: in-process closed Tri truth-table
// microbench returning a closed BenchmarkTestResult shape. No command runner,
// hardware probes, network submit, or Phase 8-9 workloads.
//
// Zero-trust rules:
//  - Options closed via property descriptors (no getters; symbols / accessors /
//    custom prototypes refuse). Unknown keys refuse without echo.
//  - operations / maxDurationMs are finite safe positive ints within bounds.
//  - Only closed Tri values (-1|0|1) participate — no Bool coercion, no NaN.
//  - Never throws; never echoes options / tokens / raw timings beyond closed
//    numeric fields.

/** Options record is not a closed data object. */
export const FUNGI_BENCH_TRI_001 = "FUNGI-BENCH-TRI-001";
/** A field value is outside its closed domain. */
export const FUNGI_BENCH_TRI_002 = "FUNGI-BENCH-TRI-002";
/** Consistency refuse (truth-table mismatch / non-Tri operand). */
export const FUNGI_BENCH_TRI_003 = "FUNGI-BENCH-TRI-003";
/** Reserved nested refuse. */
export const FUNGI_BENCH_TRI_004 = "FUNGI-BENCH-TRI-004";
/** Lookup / result consistency refuse. */
export const FUNGI_BENCH_TRI_005 = "FUNGI-BENCH-TRI-005";

export const TRI_LOGIC_BENCHMARK_ID = "logic.tri_match";
export const TRI_LOGIC_BENCHMARK_TARGET = "logic" as const;

/** Closed Galerina Tri vocabulary (matches galerina-core-logic; local copy). */
export const TRI_FALSE = -1 as const;
export const TRI_UNKNOWN = 0 as const;
export const TRI_TRUE = 1 as const;
export const TRI_VALUES = Object.freeze([TRI_FALSE, TRI_UNKNOWN, TRI_TRUE] as const);
export type BenchTri = (typeof TRI_VALUES)[number];

export const TRI_LOGIC_BENCHMARK_OPTIONS_FIELDS = Object.freeze(["operations", "maxDurationMs"] as const);

export const DEFAULT_TRI_LOGIC_OPERATIONS = 100_000;
export const MAX_TRI_LOGIC_OPERATIONS = 1_000_000;
export const DEFAULT_TRI_LOGIC_MAX_DURATION_MS = 5_000;
export const MAX_TRI_LOGIC_MAX_DURATION_MS = 60_000;

export type TriLogicBenchmarkDiagnosticField =
  | "record" | "operations" | "maxDurationMs" | "result" | "id" | "target";

export interface TriLogicBenchmarkDiagnostic {
  readonly code: string;
  readonly severity: "error";
  readonly message: string;
  readonly field: TriLogicBenchmarkDiagnosticField;
}

export interface TriLogicBenchmarkOptions {
  readonly operations: number;
  readonly maxDurationMs: number;
}

export interface TriLogicBenchmarkResult {
  readonly id: typeof TRI_LOGIC_BENCHMARK_ID;
  readonly target: typeof TRI_LOGIC_BENCHMARK_TARGET;
  readonly status: "passed" | "failed" | "skipped_timeout";
  readonly durationMs: number;
  readonly operations: number;
  readonly score: number;
}

export type RunTriLogicBenchmarkResult =
  | { readonly ok: true; readonly value: TriLogicBenchmarkResult }
  | { readonly ok: false; readonly diagnostics: readonly TriLogicBenchmarkDiagnostic[] };

const diag = (
  code: string,
  message: string,
  field: TriLogicBenchmarkDiagnosticField,
): TriLogicBenchmarkDiagnostic => Object.freeze({ code, severity: "error" as const, message, field });

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
  field: TriLogicBenchmarkDiagnosticField,
  out: TriLogicBenchmarkDiagnostic[],
): number | undefined {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min || value > max) {
    out.push(diag(FUNGI_BENCH_TRI_002, "Numeric option is outside the closed domain.", field));
    return undefined;
  }
  return value;
}

function readOptions(input: unknown): { readonly ok: true; readonly value: TriLogicBenchmarkOptions } | { readonly ok: false; readonly diagnostics: readonly TriLogicBenchmarkDiagnostic[] } {
  const out: TriLogicBenchmarkDiagnostic[] = [];
  if (input === undefined) {
    return Object.freeze({
      ok: true as const,
      value: Object.freeze({
        operations: DEFAULT_TRI_LOGIC_OPERATIONS,
        maxDurationMs: DEFAULT_TRI_LOGIC_MAX_DURATION_MS,
      }),
    });
  }
  const snap = snapshotRecord(input, 8);
  if (!snap.ok) {
    out.push(diag(FUNGI_BENCH_TRI_001, "Tri logic benchmark options must be a plain data object.", "record"));
    return Object.freeze({ ok: false as const, diagnostics: Object.freeze(out) });
  }
  for (const key of snap.values.keys()) {
    if (key !== "operations" && key !== "maxDurationMs") {
      out.push(diag(FUNGI_BENCH_TRI_001, "Record has a key outside the closed shape.", "record"));
      return Object.freeze({ ok: false as const, diagnostics: Object.freeze(out) });
    }
  }
  const operations = snap.values.has("operations")
    ? readPositiveSafeInt(snap.values.get("operations"), 1, MAX_TRI_LOGIC_OPERATIONS, "operations", out)
    : DEFAULT_TRI_LOGIC_OPERATIONS;
  if (operations === undefined) return Object.freeze({ ok: false as const, diagnostics: Object.freeze(out) });
  const maxDurationMs = snap.values.has("maxDurationMs")
    ? readPositiveSafeInt(snap.values.get("maxDurationMs"), 1, MAX_TRI_LOGIC_MAX_DURATION_MS, "maxDurationMs", out)
    : DEFAULT_TRI_LOGIC_MAX_DURATION_MS;
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

export function isBenchTri(value: unknown): value is BenchTri {
  return value === TRI_FALSE || value === TRI_UNKNOWN || value === TRI_TRUE;
}

/** Kleene Tri AND = min (matches galerina-core-logic triAnd). */
export function benchTriAnd(left: BenchTri, right: BenchTri): BenchTri {
  return (left < right ? left : right) as BenchTri;
}

/** Kleene Tri OR = max (matches galerina-core-logic triOr). */
export function benchTriOr(left: BenchTri, right: BenchTri): BenchTri {
  return (left > right ? left : right) as BenchTri;
}

/** Kleene Tri NOT — unknown stays unknown (matches galerina-core-logic triNot). */
export function benchTriNot(value: BenchTri): BenchTri {
  return value === TRI_UNKNOWN ? TRI_UNKNOWN : ((-value) as BenchTri);
}

/**
 * Closed score: operations per millisecond, scaled by 10, capped at 10000.
 */
export function scoreTriLogicBenchmark(operations: number, durationMs: number): number {
  if (!Number.isSafeInteger(operations) || operations < 0) return 0;
  if (typeof durationMs !== "number" || !Number.isFinite(durationMs) || durationMs < 0) return 0;
  if (operations === 0) return 0;
  if (durationMs === 0) return 10_000;
  const raw = Math.floor((operations / durationMs) * 10);
  if (!Number.isSafeInteger(raw) || raw < 0) return 0;
  return raw > 10_000 ? 10_000 : raw;
}

const TRI_PAIRS: readonly (readonly [BenchTri, BenchTri])[] = Object.freeze(
  TRI_VALUES.flatMap((a) => TRI_VALUES.map((b) => Object.freeze([a, b] as const))),
);

/**
 * Run the closed Tri logic microbench. Never throws. Does not coerce to Bool.
 */
export function runTriLogicBenchmark(input?: unknown): RunTriLogicBenchmarkResult {
  try {
    const opts = readOptions(input);
    if (!opts.ok) return opts;
    const { operations, maxDurationMs } = opts.value;
    const started = nowMs();
    let completed = 0;
    for (let i = 0; i < operations; i += 1) {
      const pair = TRI_PAIRS[i % TRI_PAIRS.length]!;
      const a = pair[0];
      const b = pair[1];
      if (!isBenchTri(a) || !isBenchTri(b)) {
        return Object.freeze({
          ok: false as const,
          diagnostics: Object.freeze([diag(FUNGI_BENCH_TRI_003, "Tri logic bench refused a non-Tri operand.", "result")]),
        });
      }
      const andGot = benchTriAnd(a, b);
      const orGot = benchTriOr(a, b);
      const notGot = benchTriNot(a);
      const andExpected = (a < b ? a : b) as BenchTri;
      const orExpected = (a > b ? a : b) as BenchTri;
      const notExpected = (a === TRI_UNKNOWN ? TRI_UNKNOWN : ((-a) as BenchTri));
      if (andGot !== andExpected || orGot !== orExpected || notGot !== notExpected) {
        const durationMs = Math.max(0, Math.floor(nowMs() - started));
        return Object.freeze({
          ok: true as const,
          value: Object.freeze({
            id: TRI_LOGIC_BENCHMARK_ID,
            target: TRI_LOGIC_BENCHMARK_TARGET,
            status: "failed" as const,
            durationMs: Number.isSafeInteger(durationMs) ? durationMs : 0,
            operations: completed,
            score: 0,
          }),
        });
      }
      completed += 1;
      if ((i & 1023) === 1023) {
        const elapsed = nowMs() - started;
        if (elapsed > maxDurationMs) {
          const durationMs = Math.max(0, Math.floor(elapsed));
          return Object.freeze({
            ok: true as const,
            value: Object.freeze({
              id: TRI_LOGIC_BENCHMARK_ID,
              target: TRI_LOGIC_BENCHMARK_TARGET,
              status: "skipped_timeout" as const,
              durationMs: Number.isSafeInteger(durationMs) ? durationMs : 0,
              operations: completed,
              score: scoreTriLogicBenchmark(completed, Number.isSafeInteger(durationMs) ? durationMs : 0),
            }),
          });
        }
      }
    }
    const durationMs = Math.max(0, Math.floor(nowMs() - started));
    const safeDuration = Number.isSafeInteger(durationMs) ? durationMs : 0;
    return Object.freeze({
      ok: true as const,
      value: Object.freeze({
        id: TRI_LOGIC_BENCHMARK_ID,
        target: TRI_LOGIC_BENCHMARK_TARGET,
        status: "passed" as const,
        durationMs: safeDuration,
        operations: completed,
        score: scoreTriLogicBenchmark(completed, safeDuration),
      }),
    });
  } catch {
    return Object.freeze({
      ok: false as const,
      diagnostics: Object.freeze([diag(FUNGI_BENCH_TRI_005, "Tri logic benchmark refused after an unexpected failure.", "result")]),
    });
  }
}

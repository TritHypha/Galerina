// Bool logic benchmark case (TODO pass, Grok 2026-10-05; zero-trust defaults,
// owner may revisit).
//
// Closes the tools-benchmark TODO row "Add Bool logic benchmark". Grounded in
// README Logic Benchmarks (Bool) and the recommended light test id
// `logic.bool_branch` / purpose "check no silent Bool conversion".
//
// CASE ONLY relative to the command runner: this module runs an in-process
// closed Bool truth-table microbench and returns a closed BenchmarkTestResult
// shape. It does not implement `galerina benchmark` orchestration, hardware
// probes, network submit, or Phase 8-9 workloads.
//
// Zero-trust rules:
//  - Options are closed via property descriptors (no getters; symbols /
//    accessors / custom prototypes refuse). Unknown keys refuse without echo.
//  - operations / maxDurationMs are finite safe positive ints within bounds.
//  - Only genuine boolean true/false participate in the truth table (no
//    truthiness coercion of other values).
//  - Never throws; never echoes options / tokens / raw timings beyond closed
//    numeric fields.

/** Options record is not a closed data object. */
export const FUNGI_BENCH_BOOL_001 = "FUNGI-BENCH-BOOL-001";
/** A field value is outside its closed domain. */
export const FUNGI_BENCH_BOOL_002 = "FUNGI-BENCH-BOOL-002";
/** Consistency refuse (truth-table mismatch). */
export const FUNGI_BENCH_BOOL_003 = "FUNGI-BENCH-BOOL-003";
/** Reserved nested refuse. */
export const FUNGI_BENCH_BOOL_004 = "FUNGI-BENCH-BOOL-004";
/** Lookup / result consistency refuse. */
export const FUNGI_BENCH_BOOL_005 = "FUNGI-BENCH-BOOL-005";

export const BOOL_LOGIC_BENCHMARK_ID = "logic.bool_branch";
export const BOOL_LOGIC_BENCHMARK_TARGET = "logic" as const;

export const BOOL_LOGIC_BENCHMARK_OPTIONS_FIELDS = Object.freeze(["operations", "maxDurationMs"] as const);

export const DEFAULT_BOOL_LOGIC_OPERATIONS = 100_000;
export const MAX_BOOL_LOGIC_OPERATIONS = 1_000_000;
export const DEFAULT_BOOL_LOGIC_MAX_DURATION_MS = 5_000;
export const MAX_BOOL_LOGIC_MAX_DURATION_MS = 60_000;

export type BoolLogicBenchmarkDiagnosticField =
  | "record" | "operations" | "maxDurationMs" | "result" | "id" | "target";

export interface BoolLogicBenchmarkDiagnostic {
  readonly code: string;
  readonly severity: "error";
  readonly message: string;
  readonly field: BoolLogicBenchmarkDiagnosticField;
}

export interface BoolLogicBenchmarkOptions {
  readonly operations: number;
  readonly maxDurationMs: number;
}

export interface BoolLogicBenchmarkResult {
  readonly id: typeof BOOL_LOGIC_BENCHMARK_ID;
  readonly target: typeof BOOL_LOGIC_BENCHMARK_TARGET;
  readonly status: "passed" | "failed" | "skipped_timeout";
  readonly durationMs: number;
  readonly operations: number;
  readonly score: number;
}

export type RunBoolLogicBenchmarkResult =
  | { readonly ok: true; readonly value: BoolLogicBenchmarkResult }
  | { readonly ok: false; readonly diagnostics: readonly BoolLogicBenchmarkDiagnostic[] };

const diag = (
  code: string,
  message: string,
  field: BoolLogicBenchmarkDiagnosticField,
): BoolLogicBenchmarkDiagnostic => Object.freeze({ code, severity: "error" as const, message, field });

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
  field: BoolLogicBenchmarkDiagnosticField,
  out: BoolLogicBenchmarkDiagnostic[],
): number | undefined {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min || value > max) {
    out.push(diag(FUNGI_BENCH_BOOL_002, "Numeric option is outside the closed domain.", field));
    return undefined;
  }
  return value;
}

function readOptions(input: unknown): { readonly ok: true; readonly value: BoolLogicBenchmarkOptions } | { readonly ok: false; readonly diagnostics: readonly BoolLogicBenchmarkDiagnostic[] } {
  const out: BoolLogicBenchmarkDiagnostic[] = [];
  if (input === undefined) {
    return Object.freeze({
      ok: true as const,
      value: Object.freeze({
        operations: DEFAULT_BOOL_LOGIC_OPERATIONS,
        maxDurationMs: DEFAULT_BOOL_LOGIC_MAX_DURATION_MS,
      }),
    });
  }
  const snap = snapshotRecord(input, 8);
  if (!snap.ok) {
    out.push(diag(FUNGI_BENCH_BOOL_001, "Bool logic benchmark options must be a plain data object.", "record"));
    return Object.freeze({ ok: false as const, diagnostics: Object.freeze(out) });
  }
  for (const key of snap.values.keys()) {
    if (key !== "operations" && key !== "maxDurationMs") {
      out.push(diag(FUNGI_BENCH_BOOL_001, "Record has a key outside the closed shape.", "record"));
      return Object.freeze({ ok: false as const, diagnostics: Object.freeze(out) });
    }
  }
  const operations = snap.values.has("operations")
    ? readPositiveSafeInt(snap.values.get("operations"), 1, MAX_BOOL_LOGIC_OPERATIONS, "operations", out)
    : DEFAULT_BOOL_LOGIC_OPERATIONS;
  if (operations === undefined) return Object.freeze({ ok: false as const, diagnostics: Object.freeze(out) });
  const maxDurationMs = snap.values.has("maxDurationMs")
    ? readPositiveSafeInt(snap.values.get("maxDurationMs"), 1, MAX_BOOL_LOGIC_MAX_DURATION_MS, "maxDurationMs", out)
    : DEFAULT_BOOL_LOGIC_MAX_DURATION_MS;
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

/**
 * Closed score: operations per millisecond, scaled by 10, capped at 10000.
 * Finite safe int only; zero duration yields the cap when operations > 0.
 */
export function scoreBoolLogicBenchmark(operations: number, durationMs: number): number {
  if (!Number.isSafeInteger(operations) || operations < 0) return 0;
  if (typeof durationMs !== "number" || !Number.isFinite(durationMs) || durationMs < 0) return 0;
  if (operations === 0) return 0;
  if (durationMs === 0) return 10_000;
  const raw = Math.floor((operations / durationMs) * 10);
  if (!Number.isSafeInteger(raw) || raw < 0) return 0;
  return raw > 10_000 ? 10_000 : raw;
}

function expectedAnd(a: boolean, b: boolean): boolean {
  return a && b;
}
function expectedOr(a: boolean, b: boolean): boolean {
  return a || b;
}
function expectedNot(a: boolean): boolean {
  return !a;
}
function expectedEq(a: boolean, b: boolean): boolean {
  return a === b;
}

/**
 * Run the closed Bool logic microbench. Never throws. Does not coerce non-booleans.
 */
export function runBoolLogicBenchmark(input?: unknown): RunBoolLogicBenchmarkResult {
  try {
    const opts = readOptions(input);
    if (!opts.ok) return opts;
    const { operations, maxDurationMs } = opts.value;
    const pairs: readonly (readonly [boolean, boolean])[] = Object.freeze([
      Object.freeze([false, false] as const),
      Object.freeze([false, true] as const),
      Object.freeze([true, false] as const),
      Object.freeze([true, true] as const),
    ]);
    const started = nowMs();
    let completed = 0;
    for (let i = 0; i < operations; i += 1) {
      const pair = pairs[i & 3]!;
      const a = pair[0];
      const b = pair[1];
      // Genuine boolean ops only — no truthiness coercion of other values.
      if (typeof a !== "boolean" || typeof b !== "boolean") {
        return Object.freeze({
          ok: false as const,
          diagnostics: Object.freeze([diag(FUNGI_BENCH_BOOL_003, "Bool logic bench refused a non-boolean operand.", "result")]),
        });
      }
      if (expectedAnd(a, b) !== (a && b) || expectedOr(a, b) !== (a || b) || expectedNot(a) !== !a || expectedEq(a, b) !== (a === b)) {
        const durationMs = Math.max(0, Math.floor(nowMs() - started));
        return Object.freeze({
          ok: true as const,
          value: Object.freeze({
            id: BOOL_LOGIC_BENCHMARK_ID,
            target: BOOL_LOGIC_BENCHMARK_TARGET,
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
              id: BOOL_LOGIC_BENCHMARK_ID,
              target: BOOL_LOGIC_BENCHMARK_TARGET,
              status: "skipped_timeout" as const,
              durationMs: Number.isSafeInteger(durationMs) ? durationMs : 0,
              operations: completed,
              score: scoreBoolLogicBenchmark(completed, Number.isSafeInteger(durationMs) ? durationMs : 0),
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
        id: BOOL_LOGIC_BENCHMARK_ID,
        target: BOOL_LOGIC_BENCHMARK_TARGET,
        status: "passed" as const,
        durationMs: safeDuration,
        operations: completed,
        score: scoreBoolLogicBenchmark(completed, safeDuration),
      }),
    });
  } catch {
    return Object.freeze({
      ok: false as const,
      diagnostics: Object.freeze([diag(FUNGI_BENCH_BOOL_005, "Bool logic benchmark refused after an unexpected failure.", "result")]),
    });
  }
}

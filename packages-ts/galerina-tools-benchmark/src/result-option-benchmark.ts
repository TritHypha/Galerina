// Result / Option benchmark case (TODO pass, Grok 2026-10-05; zero-trust
// defaults, owner may revisit).
//
// Closes the tools-benchmark TODO row "Add Result / Option benchmark". Grounded
// in README Logic Benchmarks (Result<T,E> / Option<T> / match exhaustiveness)
// and light id `logic.result_option`. Closed Option shape matches
// galerina-data-query QueryOption (`some`|`none`); closed Result shape is the
// Galerina Ok/Err discriminated union (`ok`|`err`). Local copies only — this
// package does not import data-query or invent new Result APIs.
//
// CASE ONLY relative to the command runner: in-process match / unwrapOr /
// Result branch microbench returning a closed BenchmarkTestResult shape. No
// command runner, hardware probes, network submit, or Phase 8-9 workloads.
//
// Zero-trust rules:
//  - Options closed via property descriptors (no getters; symbols / accessors /
//    custom prototypes refuse). Unknown keys refuse without echo.
//  - operations / maxDurationMs are finite safe positive ints within bounds.
//  - Discriminators are closed string tokens only; payloads are finite safe ints.
//  - Never throws (including on err/none paths); never echoes options / tokens.

/** Options record is not a closed data object. */
export const FUNGI_BENCH_RO_001 = "FUNGI-BENCH-RO-001";
/** A field value is outside its closed domain. */
export const FUNGI_BENCH_RO_002 = "FUNGI-BENCH-RO-002";
/** Consistency refuse (match / unwrap mismatch). */
export const FUNGI_BENCH_RO_003 = "FUNGI-BENCH-RO-003";
/** Reserved nested refuse. */
export const FUNGI_BENCH_RO_004 = "FUNGI-BENCH-RO-004";
/** Lookup / result consistency refuse. */
export const FUNGI_BENCH_RO_005 = "FUNGI-BENCH-RO-005";

export const RESULT_OPTION_BENCHMARK_ID = "logic.result_option";
export const RESULT_OPTION_BENCHMARK_TARGET = "logic" as const;

export const RESULT_OPTION_BENCHMARK_OPTIONS_FIELDS = Object.freeze(["operations", "maxDurationMs"] as const);

export const DEFAULT_RESULT_OPTION_OPERATIONS = 100_000;
export const MAX_RESULT_OPTION_OPERATIONS = 1_000_000;
export const DEFAULT_RESULT_OPTION_MAX_DURATION_MS = 5_000;
export const MAX_RESULT_OPTION_MAX_DURATION_MS = 60_000;

/** Closed Option shape (matches galerina-data-query QueryOption; local copy). */
export type BenchOption =
  | { readonly kind: "some"; readonly value: number }
  | { readonly kind: "none" };

/** Closed Result shape (Galerina Ok/Err discriminated union; local copy). */
export type BenchResult =
  | { readonly kind: "ok"; readonly value: number }
  | { readonly kind: "err"; readonly error: number };

export type ResultOptionBenchmarkDiagnosticField =
  | "record" | "operations" | "maxDurationMs" | "result" | "id" | "target";

export interface ResultOptionBenchmarkDiagnostic {
  readonly code: string;
  readonly severity: "error";
  readonly message: string;
  readonly field: ResultOptionBenchmarkDiagnosticField;
}

export interface ResultOptionBenchmarkOptions {
  readonly operations: number;
  readonly maxDurationMs: number;
}

export interface ResultOptionBenchmarkResult {
  readonly id: typeof RESULT_OPTION_BENCHMARK_ID;
  readonly target: typeof RESULT_OPTION_BENCHMARK_TARGET;
  readonly status: "passed" | "failed" | "skipped_timeout";
  readonly durationMs: number;
  readonly operations: number;
  readonly score: number;
}

export type RunResultOptionBenchmarkResult =
  | { readonly ok: true; readonly value: ResultOptionBenchmarkResult }
  | { readonly ok: false; readonly diagnostics: readonly ResultOptionBenchmarkDiagnostic[] };

const diag = (
  code: string,
  message: string,
  field: ResultOptionBenchmarkDiagnosticField,
): ResultOptionBenchmarkDiagnostic => Object.freeze({ code, severity: "error" as const, message, field });

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
  field: ResultOptionBenchmarkDiagnosticField,
  out: ResultOptionBenchmarkDiagnostic[],
): number | undefined {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min || value > max) {
    out.push(diag(FUNGI_BENCH_RO_002, "Numeric option is outside the closed domain.", field));
    return undefined;
  }
  return value;
}

function readOptions(input: unknown): { readonly ok: true; readonly value: ResultOptionBenchmarkOptions } | { readonly ok: false; readonly diagnostics: readonly ResultOptionBenchmarkDiagnostic[] } {
  const out: ResultOptionBenchmarkDiagnostic[] = [];
  if (input === undefined) {
    return Object.freeze({
      ok: true as const,
      value: Object.freeze({
        operations: DEFAULT_RESULT_OPTION_OPERATIONS,
        maxDurationMs: DEFAULT_RESULT_OPTION_MAX_DURATION_MS,
      }),
    });
  }
  const snap = snapshotRecord(input, 8);
  if (!snap.ok) {
    out.push(diag(FUNGI_BENCH_RO_001, "Result/Option benchmark options must be a plain data object.", "record"));
    return Object.freeze({ ok: false as const, diagnostics: Object.freeze(out) });
  }
  for (const key of snap.values.keys()) {
    if (key !== "operations" && key !== "maxDurationMs") {
      out.push(diag(FUNGI_BENCH_RO_001, "Record has a key outside the closed shape.", "record"));
      return Object.freeze({ ok: false as const, diagnostics: Object.freeze(out) });
    }
  }
  const operations = snap.values.has("operations")
    ? readPositiveSafeInt(snap.values.get("operations"), 1, MAX_RESULT_OPTION_OPERATIONS, "operations", out)
    : DEFAULT_RESULT_OPTION_OPERATIONS;
  if (operations === undefined) return Object.freeze({ ok: false as const, diagnostics: Object.freeze(out) });
  const maxDurationMs = snap.values.has("maxDurationMs")
    ? readPositiveSafeInt(snap.values.get("maxDurationMs"), 1, MAX_RESULT_OPTION_MAX_DURATION_MS, "maxDurationMs", out)
    : DEFAULT_RESULT_OPTION_MAX_DURATION_MS;
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

export function benchOptionSome(value: number): BenchOption {
  return Object.freeze({ kind: "some" as const, value });
}

export function benchOptionNone(): BenchOption {
  return Object.freeze({ kind: "none" as const });
}

export function benchResultOk(value: number): BenchResult {
  return Object.freeze({ kind: "ok" as const, value });
}

export function benchResultErr(error: number): BenchResult {
  return Object.freeze({ kind: "err" as const, error });
}

/** Never throws; none yields fallback. */
export function benchUnwrapOr(option: BenchOption, fallback: number): number {
  return option.kind === "some" ? option.value : fallback;
}

/**
 * Exhaustive match on Option / Result into a closed safe-int score contribution.
 * Unknown discriminators refuse as undefined (caller treats as failure).
 */
export function benchMatchResultOption(option: BenchOption, result: BenchResult): number | undefined {
  let optionPart: number;
  switch (option.kind) {
    case "some":
      optionPart = option.value;
      break;
    case "none":
      optionPart = 0;
      break;
    default:
      return undefined;
  }
  let resultPart: number;
  switch (result.kind) {
    case "ok":
      resultPart = result.value;
      break;
    case "err":
      resultPart = -result.error;
      break;
    default:
      return undefined;
  }
  const sum = optionPart + resultPart;
  return Number.isSafeInteger(sum) ? sum : undefined;
}

export function scoreResultOptionBenchmark(operations: number, durationMs: number): number {
  if (!Number.isSafeInteger(operations) || operations < 0) return 0;
  if (typeof durationMs !== "number" || !Number.isFinite(durationMs) || durationMs < 0) return 0;
  if (operations === 0) return 0;
  if (durationMs === 0) return 10_000;
  const raw = Math.floor((operations / durationMs) * 10);
  if (!Number.isSafeInteger(raw) || raw < 0) return 0;
  return raw > 10_000 ? 10_000 : raw;
}

const CASES: readonly { readonly option: BenchOption; readonly result: BenchResult; readonly expected: number }[] =
  Object.freeze([
    Object.freeze({ option: benchOptionSome(3), result: benchResultOk(4), expected: 7 }),
    Object.freeze({ option: benchOptionNone(), result: benchResultOk(5), expected: 5 }),
    Object.freeze({ option: benchOptionSome(2), result: benchResultErr(1), expected: 1 }),
    Object.freeze({ option: benchOptionNone(), result: benchResultErr(2), expected: -2 }),
  ]);

/**
 * Run the closed Result/Option microbench. Never throws.
 */
export function runResultOptionBenchmark(input?: unknown): RunResultOptionBenchmarkResult {
  try {
    const opts = readOptions(input);
    if (!opts.ok) return opts;
    const { operations, maxDurationMs } = opts.value;
    const started = nowMs();
    let completed = 0;
    for (let i = 0; i < operations; i += 1) {
      const c = CASES[i & 3]!;
      const matched = benchMatchResultOption(c.option, c.result);
      const unwrapped = benchUnwrapOr(c.option, 0);
      const unwrapExpected = c.option.kind === "some" ? c.option.value : 0;
      if (matched !== c.expected || unwrapped !== unwrapExpected) {
        const durationMs = Math.max(0, Math.floor(nowMs() - started));
        return Object.freeze({
          ok: true as const,
          value: Object.freeze({
            id: RESULT_OPTION_BENCHMARK_ID,
            target: RESULT_OPTION_BENCHMARK_TARGET,
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
              id: RESULT_OPTION_BENCHMARK_ID,
              target: RESULT_OPTION_BENCHMARK_TARGET,
              status: "skipped_timeout" as const,
              durationMs: Number.isSafeInteger(durationMs) ? durationMs : 0,
              operations: completed,
              score: scoreResultOptionBenchmark(completed, Number.isSafeInteger(durationMs) ? durationMs : 0),
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
        id: RESULT_OPTION_BENCHMARK_ID,
        target: RESULT_OPTION_BENCHMARK_TARGET,
        status: "passed" as const,
        durationMs: safeDuration,
        operations: completed,
        score: scoreResultOptionBenchmark(completed, safeDuration),
      }),
    });
  } catch {
    return Object.freeze({
      ok: false as const,
      diagnostics: Object.freeze([diag(FUNGI_BENCH_RO_005, "Result/Option benchmark refused after an unexpected failure.", "result")]),
    });
  }
}

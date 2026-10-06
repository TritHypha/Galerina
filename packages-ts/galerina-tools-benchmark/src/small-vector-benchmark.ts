// Small vector benchmark cases (TODO pass, Grok 2026-10-05; zero-trust
// defaults, owner may revisit).
//
// Closes the tools-benchmark TODO row "Add small vector benchmark". Grounded in
// README CPU Vector Benchmarks (Vector<Float32> dot product / cosine
// similarity, "generic scalar fallback") and light ids
// `vector.dot_product_small` / `vector.cosine_batch_small`.
//
// CASE ONLY relative to the command runner: in-process scalar Float32Array
// dot product + cosine batch over deterministic generated vectors. Does NOT
// detect or claim SIMD (SSE/AVX/NEON/SVE) — that is the separate open TODO
// "Detect vector features where possible". No large/medium matrix cases, GPU,
// command runner, or Phase 8-9.
//
// Sizes are closed constants (owner may revisit): dimension 256, cosine batch 64.
//
// Zero-trust rules:
//  - Options closed via property descriptors (no getters; symbols / accessors /
//    custom prototypes refuse). Unknown keys refuse without echo.
//  - operations / maxDurationMs are finite safe positive ints within bounds.
//  - Non-finite results (NaN/Infinity) and zero-norm cosine refuse as
//    undefined — never collapse to a passing value.
//  - Result drift across operations fails closed. Never throws; never echoes.

/** Options record is not a closed data object. */
export const FUNGI_BENCH_VEC_001 = "FUNGI-BENCH-VEC-001";
/** A field value is outside its closed domain. */
export const FUNGI_BENCH_VEC_002 = "FUNGI-BENCH-VEC-002";
/** Consistency refuse (non-finite / drift / zero norm). */
export const FUNGI_BENCH_VEC_003 = "FUNGI-BENCH-VEC-003";
/** Reserved nested refuse. */
export const FUNGI_BENCH_VEC_004 = "FUNGI-BENCH-VEC-004";
/** Lookup / result consistency refuse. */
export const FUNGI_BENCH_VEC_005 = "FUNGI-BENCH-VEC-005";

export const VECTOR_DOT_PRODUCT_SMALL_BENCHMARK_ID = "vector.dot_product_small";
export const VECTOR_COSINE_BATCH_SMALL_BENCHMARK_ID = "vector.cosine_batch_small";
export const SMALL_VECTOR_BENCHMARK_TARGET = "vector" as const;

export const SMALL_VECTOR_DIMENSION = 256;
export const SMALL_VECTOR_COSINE_BATCH = 64;

export const SMALL_VECTOR_OPTIONS_FIELDS = Object.freeze(["operations", "maxDurationMs"] as const);

export const DEFAULT_SMALL_VECTOR_OPERATIONS = 2_000;
export const MAX_SMALL_VECTOR_OPERATIONS = 100_000;
export const DEFAULT_SMALL_VECTOR_MAX_DURATION_MS = 5_000;
export const MAX_SMALL_VECTOR_MAX_DURATION_MS = 60_000;

export type SmallVectorBenchmarkDiagnosticField =
  | "record" | "operations" | "maxDurationMs" | "result" | "id" | "target";

export interface SmallVectorBenchmarkDiagnostic {
  readonly code: string;
  readonly severity: "error";
  readonly message: string;
  readonly field: SmallVectorBenchmarkDiagnosticField;
}

export interface SmallVectorBenchmarkOptions {
  readonly operations: number;
  readonly maxDurationMs: number;
}

export interface SmallVectorBenchmarkResult {
  readonly id: typeof VECTOR_DOT_PRODUCT_SMALL_BENCHMARK_ID | typeof VECTOR_COSINE_BATCH_SMALL_BENCHMARK_ID;
  readonly target: typeof SMALL_VECTOR_BENCHMARK_TARGET;
  readonly status: "passed" | "failed" | "skipped_timeout";
  readonly durationMs: number;
  readonly operations: number;
  readonly score: number;
}

export type RunSmallVectorBenchmarkResult =
  | { readonly ok: true; readonly value: readonly SmallVectorBenchmarkResult[] }
  | { readonly ok: false; readonly diagnostics: readonly SmallVectorBenchmarkDiagnostic[] };

const diag = (
  code: string,
  message: string,
  field: SmallVectorBenchmarkDiagnosticField,
): SmallVectorBenchmarkDiagnostic => Object.freeze({ code, severity: "error" as const, message, field });

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
  field: SmallVectorBenchmarkDiagnosticField,
  out: SmallVectorBenchmarkDiagnostic[],
): number | undefined {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min || value > max) {
    out.push(diag(FUNGI_BENCH_VEC_002, "Numeric option is outside the closed domain.", field));
    return undefined;
  }
  return value;
}

function readOptions(input: unknown): { readonly ok: true; readonly value: SmallVectorBenchmarkOptions } | { readonly ok: false; readonly diagnostics: readonly SmallVectorBenchmarkDiagnostic[] } {
  const out: SmallVectorBenchmarkDiagnostic[] = [];
  if (input === undefined) {
    return Object.freeze({
      ok: true as const,
      value: Object.freeze({ operations: DEFAULT_SMALL_VECTOR_OPERATIONS, maxDurationMs: DEFAULT_SMALL_VECTOR_MAX_DURATION_MS }),
    });
  }
  const snap = snapshotRecord(input, 8);
  if (!snap.ok) {
    out.push(diag(FUNGI_BENCH_VEC_001, "Small vector benchmark options must be a plain data object.", "record"));
    return Object.freeze({ ok: false as const, diagnostics: Object.freeze(out) });
  }
  for (const key of snap.values.keys()) {
    if (key !== "operations" && key !== "maxDurationMs") {
      out.push(diag(FUNGI_BENCH_VEC_001, "Record has a key outside the closed shape.", "record"));
      return Object.freeze({ ok: false as const, diagnostics: Object.freeze(out) });
    }
  }
  const operations = snap.values.has("operations")
    ? readPositiveSafeInt(snap.values.get("operations"), 1, MAX_SMALL_VECTOR_OPERATIONS, "operations", out)
    : DEFAULT_SMALL_VECTOR_OPERATIONS;
  if (operations === undefined) return Object.freeze({ ok: false as const, diagnostics: Object.freeze(out) });
  const maxDurationMs = snap.values.has("maxDurationMs")
    ? readPositiveSafeInt(snap.values.get("maxDurationMs"), 1, MAX_SMALL_VECTOR_MAX_DURATION_MS, "maxDurationMs", out)
    : DEFAULT_SMALL_VECTOR_MAX_DURATION_MS;
  if (maxDurationMs === undefined) return Object.freeze({ ok: false as const, diagnostics: Object.freeze(out) });
  return Object.freeze({ ok: true as const, value: Object.freeze({ operations, maxDurationMs }) });
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

/** Scalar Float32 dot product. Undefined on bad input, length mismatch, or non-finite. Never throws. */
export function benchDotFloat32(a: unknown, b: unknown): number | undefined {
  try {
    if (!(a instanceof Float32Array) || !(b instanceof Float32Array)) return undefined;
    if (a.length !== b.length || a.length === 0) return undefined;
    let sum = 0;
    for (let i = 0; i < a.length; i += 1) sum += a[i]! * b[i]!;
    return Number.isFinite(sum) ? sum : undefined;
  } catch {
    return undefined;
  }
}

/** Scalar cosine similarity. Zero-norm or non-finite refuses as undefined (never NaN). Never throws. */
export function benchCosineFloat32(a: unknown, b: unknown): number | undefined {
  const dot = benchDotFloat32(a, b);
  if (dot === undefined) return undefined;
  const na = benchDotFloat32(a, a);
  const nb = benchDotFloat32(b, b);
  if (na === undefined || nb === undefined || na <= 0 || nb <= 0) return undefined;
  const c = dot / Math.sqrt(na * nb);
  if (!Number.isFinite(c)) return undefined;
  return c;
}

function generateVector(seed: number, dimension: number): Float32Array {
  const v = new Float32Array(dimension);
  let x = (seed * 2654435761) >>> 0 || 1;
  for (let i = 0; i < dimension; i += 1) {
    x ^= x << 13; x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5; x >>>= 0;
    // Map to [-1, 1) deterministically.
    v[i] = (x / 0x100000000) * 2 - 1;
  }
  return v;
}

let cached: { readonly a: Float32Array; readonly b: Float32Array; readonly batch: readonly Float32Array[] } | undefined;

/** Deterministic generated small-vector fixtures. Cached. */
export function buildSmallVectorFixtures(): { readonly a: Float32Array; readonly b: Float32Array; readonly batch: readonly Float32Array[] } {
  if (cached !== undefined) return cached;
  const a = generateVector(1, SMALL_VECTOR_DIMENSION);
  const b = generateVector(2, SMALL_VECTOR_DIMENSION);
  const batch: Float32Array[] = [];
  for (let i = 0; i < SMALL_VECTOR_COSINE_BATCH; i += 1) batch.push(generateVector(100 + i, SMALL_VECTOR_DIMENSION));
  cached = Object.freeze({ a, b, batch: Object.freeze(batch) });
  return cached;
}

export function scoreSmallVectorBenchmark(operations: number, durationMs: number): number {
  if (!Number.isSafeInteger(operations) || operations < 0) return 0;
  if (typeof durationMs !== "number" || !Number.isFinite(durationMs) || durationMs < 0) return 0;
  if (operations === 0) return 0;
  if (durationMs === 0) return 10_000;
  const raw = Math.floor((operations / durationMs) * 10);
  if (!Number.isSafeInteger(raw) || raw < 0) return 0;
  return raw > 10_000 ? 10_000 : raw;
}

function runLoop(
  id: SmallVectorBenchmarkResult["id"],
  operations: number,
  maxDurationMs: number,
  step: () => number | undefined,
): SmallVectorBenchmarkResult {
  const started = nowMs();
  let completed = 0;
  let first: number | undefined;
  const finish = (status: SmallVectorBenchmarkResult["status"]): SmallVectorBenchmarkResult => {
    const d = Math.max(0, Math.floor(nowMs() - started));
    const durationMs = Number.isSafeInteger(d) ? d : 0;
    return Object.freeze({
      id,
      target: SMALL_VECTOR_BENCHMARK_TARGET,
      status,
      durationMs,
      operations: completed,
      score: status === "failed" ? 0 : scoreSmallVectorBenchmark(completed, durationMs),
    });
  };
  for (let i = 0; i < operations; i += 1) {
    const r = step();
    if (r === undefined) return finish("failed");
    if (first === undefined) first = r;
    else if (r !== first) return finish("failed");
    completed += 1;
    if ((i & 63) === 63 && nowMs() - started > maxDurationMs) return finish("skipped_timeout");
  }
  return finish("passed");
}

/**
 * Run closed scalar small-vector microbenches. Never throws.
 * Returns `vector.dot_product_small` and `vector.cosine_batch_small` as a frozen array.
 */
export function runSmallVectorBenchmark(input?: unknown): RunSmallVectorBenchmarkResult {
  try {
    const opts = readOptions(input);
    if (!opts.ok) return opts;
    const { operations, maxDurationMs } = opts.value;
    const fx = buildSmallVectorFixtures();
    const dot = runLoop(VECTOR_DOT_PRODUCT_SMALL_BENCHMARK_ID, operations, maxDurationMs, () => benchDotFloat32(fx.a, fx.b));
    const cosine = runLoop(VECTOR_COSINE_BATCH_SMALL_BENCHMARK_ID, operations, maxDurationMs, () => {
      let acc = 0;
      for (const v of fx.batch) {
        const c = benchCosineFloat32(fx.a, v);
        if (c === undefined || c < -1.000001 || c > 1.000001) return undefined;
        acc += c;
      }
      return Number.isFinite(acc) ? acc : undefined;
    });
    return Object.freeze({ ok: true as const, value: Object.freeze([dot, cosine]) });
  } catch {
    return Object.freeze({
      ok: false as const,
      diagnostics: Object.freeze([diag(FUNGI_BENCH_VEC_005, "Small vector benchmark refused after an unexpected failure.", "result")]),
    });
  }
}

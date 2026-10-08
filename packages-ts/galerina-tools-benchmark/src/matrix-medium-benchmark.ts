// Medium matrix multiply benchmark case (TODO pass, Grok 2026-10-05;
// zero-trust defaults, owner may revisit).
//
// Closes the tools-benchmark TODO row "Add medium matrix multiply" (Phase 8
// Full Benchmarks). Grounded in README full-mode id
// `vector.matrix_multiply_medium` (also the README light-mode timeout example),
// README CPU Vector Benchmarks ("Matrix<Float32> ... multiply", "generic scalar
// fallback"), and the ZTF benchmark scoreboard standard's size-invariant unit
// for matrix multiply: mul-adds/s.
//
// OWNER-REVISIT PICKS (not specified in-repo; NOT spec):
//  - size: square N = 128 (README says only "medium").
//  - element type Float32Array, row-major, i-k-j scalar loop.
//  - verification tolerance 1e-3 against a Float64 reference on spot entries.
//
// CASE ONLY relative to the command runner: in-process scalar CPU matmul over
// deterministic generated matrices. Light/full mode gating belongs to the
// (still open) command runner, not this case. No SIMD detection claim, GPU
// (`gpu.matrix_multiply_if_available` is HOLD), or other Phase 8 rows.
//
// Zero-trust rules:
//  - Options closed via property descriptors. Unknown keys refuse without echo.
//  - Non-finite output, reference mismatch, or checksum drift fail closed.
//  - Never throws; never echoes options.

/** Options record is not a closed data object. */
export const FUNGI_BENCH_MAT_001 = "FUNGI-BENCH-MAT-001";
/** A field value is outside its closed domain. */
export const FUNGI_BENCH_MAT_002 = "FUNGI-BENCH-MAT-002";
/** Consistency refuse (non-finite / reference mismatch / drift). */
export const FUNGI_BENCH_MAT_003 = "FUNGI-BENCH-MAT-003";
/** Reserved nested refuse. */
export const FUNGI_BENCH_MAT_004 = "FUNGI-BENCH-MAT-004";
/** Lookup / result consistency refuse. */
export const FUNGI_BENCH_MAT_005 = "FUNGI-BENCH-MAT-005";

export const MATRIX_MULTIPLY_MEDIUM_BENCHMARK_ID = "vector.matrix_multiply_medium";
export const MATRIX_MULTIPLY_MEDIUM_BENCHMARK_TARGET = "vector" as const;

/** Owner-revisit pick: N = 128 (README says only "medium"). */
export const MATRIX_MULTIPLY_MEDIUM_N = 128;
/** mul-adds per operation (N^3). */
export const MATRIX_MULTIPLY_MEDIUM_MUL_ADDS = MATRIX_MULTIPLY_MEDIUM_N ** 3;
/** Owner-revisit pick: verification tolerance vs Float64 reference. */
export const MATRIX_MULTIPLY_MEDIUM_TOLERANCE = 1e-3;

export const MATRIX_MULTIPLY_MEDIUM_OPTIONS_FIELDS = Object.freeze(["operations", "maxDurationMs"] as const);

export const DEFAULT_MATRIX_MULTIPLY_MEDIUM_OPERATIONS = 10;
export const MAX_MATRIX_MULTIPLY_MEDIUM_OPERATIONS = 200;
/** README light-mode "maximum single test time: 20 seconds". */
export const DEFAULT_MATRIX_MULTIPLY_MEDIUM_MAX_DURATION_MS = 20_000;
export const MAX_MATRIX_MULTIPLY_MEDIUM_MAX_DURATION_MS = 60_000;

export type MatrixBenchmarkDiagnosticField =
  | "record" | "operations" | "maxDurationMs" | "result" | "id" | "target";

export interface MatrixBenchmarkDiagnostic {
  readonly code: string;
  readonly severity: "error";
  readonly message: string;
  readonly field: MatrixBenchmarkDiagnosticField;
}

export interface MatrixBenchmarkOptions {
  readonly operations: number;
  readonly maxDurationMs: number;
}

export interface MatrixBenchmarkResult {
  readonly id: typeof MATRIX_MULTIPLY_MEDIUM_BENCHMARK_ID;
  readonly target: typeof MATRIX_MULTIPLY_MEDIUM_BENCHMARK_TARGET;
  readonly status: "passed" | "failed" | "skipped_timeout";
  readonly durationMs: number;
  readonly operations: number;
  readonly score: number;
}

export type RunMatrixBenchmarkResult =
  | { readonly ok: true; readonly value: MatrixBenchmarkResult }
  | { readonly ok: false; readonly diagnostics: readonly MatrixBenchmarkDiagnostic[] };

const diag = (
  code: string,
  message: string,
  field: MatrixBenchmarkDiagnosticField,
): MatrixBenchmarkDiagnostic => Object.freeze({ code, severity: "error" as const, message, field });

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
  field: MatrixBenchmarkDiagnosticField,
  out: MatrixBenchmarkDiagnostic[],
): number | undefined {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min || value > max) {
    out.push(diag(FUNGI_BENCH_MAT_002, "Numeric option is outside the closed domain.", field));
    return undefined;
  }
  return value;
}

function readOptions(input: unknown): { readonly ok: true; readonly value: MatrixBenchmarkOptions } | { readonly ok: false; readonly diagnostics: readonly MatrixBenchmarkDiagnostic[] } {
  const out: MatrixBenchmarkDiagnostic[] = [];
  if (input === undefined) {
    return Object.freeze({
      ok: true as const,
      value: Object.freeze({ operations: DEFAULT_MATRIX_MULTIPLY_MEDIUM_OPERATIONS, maxDurationMs: DEFAULT_MATRIX_MULTIPLY_MEDIUM_MAX_DURATION_MS }),
    });
  }
  const snap = snapshotRecord(input, 8);
  if (!snap.ok) {
    out.push(diag(FUNGI_BENCH_MAT_001, "Matrix benchmark options must be a plain data object.", "record"));
    return Object.freeze({ ok: false as const, diagnostics: Object.freeze(out) });
  }
  for (const key of snap.values.keys()) {
    if (key !== "operations" && key !== "maxDurationMs") {
      out.push(diag(FUNGI_BENCH_MAT_001, "Record has a key outside the closed shape.", "record"));
      return Object.freeze({ ok: false as const, diagnostics: Object.freeze(out) });
    }
  }
  const operations = snap.values.has("operations")
    ? readPositiveSafeInt(snap.values.get("operations"), 1, MAX_MATRIX_MULTIPLY_MEDIUM_OPERATIONS, "operations", out)
    : DEFAULT_MATRIX_MULTIPLY_MEDIUM_OPERATIONS;
  if (operations === undefined) return Object.freeze({ ok: false as const, diagnostics: Object.freeze(out) });
  const maxDurationMs = snap.values.has("maxDurationMs")
    ? readPositiveSafeInt(snap.values.get("maxDurationMs"), 1, MAX_MATRIX_MULTIPLY_MEDIUM_MAX_DURATION_MS, "maxDurationMs", out)
    : DEFAULT_MATRIX_MULTIPLY_MEDIUM_MAX_DURATION_MS;
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

/**
 * Scalar row-major square matmul C = A·B (i-k-j). Returns a new Float32Array,
 * or undefined on bad input / size mismatch / non-finite output. Never throws.
 */
export function benchMatMulFloat32(a: unknown, b: unknown, n: unknown): Float32Array | undefined {
  try {
    if (!(a instanceof Float32Array) || !(b instanceof Float32Array)) return undefined;
    if (typeof n !== "number" || !Number.isSafeInteger(n) || n < 1 || n > 1024) return undefined;
    const size = n * n;
    if (a.length !== size || b.length !== size) return undefined;
    const c = new Float32Array(size);
    for (let i = 0; i < n; i += 1) {
      const row = i * n;
      for (let k = 0; k < n; k += 1) {
        const aik = a[row + k]!;
        const bk = k * n;
        for (let j = 0; j < n; j += 1) c[row + j] = c[row + j]! + aik * b[bk + j]!;
      }
    }
    for (let i = 0; i < size; i += 1) if (!Number.isFinite(c[i]!)) return undefined;
    return c;
  } catch {
    return undefined;
  }
}

function generateMatrix(seed: number, n: number): Float32Array {
  const m = new Float32Array(n * n);
  let x = (seed * 2654435761) >>> 0 || 1;
  for (let i = 0; i < m.length; i += 1) {
    x ^= x << 13; x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5; x >>>= 0;
    m[i] = (x / 0x100000000) * 2 - 1;
  }
  return m;
}

let cached: { readonly a: Float32Array; readonly b: Float32Array } | undefined;

/** Deterministic generated N x N fixtures. Cached. */
export function buildMatrixMediumFixtures(): { readonly a: Float32Array; readonly b: Float32Array } {
  if (cached === undefined) {
    cached = Object.freeze({
      a: generateMatrix(11, MATRIX_MULTIPLY_MEDIUM_N),
      b: generateMatrix(22, MATRIX_MULTIPLY_MEDIUM_N),
    });
  }
  return cached;
}

/** Spot-check C against a Float64 reference on a closed set of entries. Never throws. */
export function verifyMatMulSpotEntries(a: Float32Array, b: Float32Array, c: Float32Array, n: number): boolean {
  try {
    const picks = [0, n - 1, Math.floor(n / 2), Math.floor(n / 3), Math.floor((2 * n) / 3)];
    for (const i of picks) {
      for (const j of picks) {
        let ref = 0;
        for (let k = 0; k < n; k += 1) ref += a[i * n + k]! * b[k * n + j]!;
        const got = c[i * n + j]!;
        if (!Number.isFinite(got) || Math.abs(got - ref) > MATRIX_MULTIPLY_MEDIUM_TOLERANCE) return false;
      }
    }
    return true;
  } catch {
    return false;
  }
}

/** Score = millions of mul-adds per second (size-invariant unit), capped at 10000. */
export function scoreMatrixBenchmark(operations: number, durationMs: number): number {
  if (!Number.isSafeInteger(operations) || operations < 0) return 0;
  if (typeof durationMs !== "number" || !Number.isFinite(durationMs) || durationMs < 0) return 0;
  if (operations === 0) return 0;
  if (durationMs === 0) return 10_000;
  const raw = Math.floor((operations * MATRIX_MULTIPLY_MEDIUM_MUL_ADDS) / 1_000_000 / (durationMs / 1000));
  if (!Number.isSafeInteger(raw) || raw < 0) return 0;
  return raw > 10_000 ? 10_000 : raw;
}

function checksum(c: Float32Array): number {
  let s = 0;
  for (let i = 0; i < c.length; i += 1) s += c[i]!;
  return s;
}

/** Run the closed medium matrix multiply microbench. Never throws. */
export function runMatrixMultiplyMediumBenchmark(input?: unknown): RunMatrixBenchmarkResult {
  try {
    const opts = readOptions(input);
    if (!opts.ok) return opts;
    const { operations, maxDurationMs } = opts.value;
    const { a, b } = buildMatrixMediumFixtures();
    const n = MATRIX_MULTIPLY_MEDIUM_N;
    const started = nowMs();
    let completed = 0;
    let first: number | undefined;
    const finish = (status: MatrixBenchmarkResult["status"]): RunMatrixBenchmarkResult => {
      const d = Math.max(0, Math.floor(nowMs() - started));
      const durationMs = Number.isSafeInteger(d) ? d : 0;
      return Object.freeze({
        ok: true as const,
        value: Object.freeze({
          id: MATRIX_MULTIPLY_MEDIUM_BENCHMARK_ID,
          target: MATRIX_MULTIPLY_MEDIUM_BENCHMARK_TARGET,
          status,
          durationMs,
          operations: completed,
          score: status === "failed" ? 0 : scoreMatrixBenchmark(completed, durationMs),
        }),
      });
    };
    for (let i = 0; i < operations; i += 1) {
      const c = benchMatMulFloat32(a, b, n);
      if (c === undefined) return finish("failed");
      const sum = checksum(c);
      if (!Number.isFinite(sum)) return finish("failed");
      if (first === undefined) {
        if (!verifyMatMulSpotEntries(a, b, c, n)) return finish("failed");
        first = sum;
      } else if (sum !== first) {
        return finish("failed");
      }
      completed += 1;
      if (i + 1 < operations && nowMs() - started > maxDurationMs) return finish("skipped_timeout");
    }
    return finish("passed");
  } catch {
    return Object.freeze({
      ok: false as const,
      diagnostics: Object.freeze([diag(FUNGI_BENCH_MAT_005, "Matrix benchmark refused after an unexpected failure.", "result")]),
    });
  }
}

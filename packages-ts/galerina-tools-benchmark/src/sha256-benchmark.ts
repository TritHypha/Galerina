// SHA-256 byte benchmark case (TODO pass, Grok 2026-10-05; zero-trust
// defaults, owner may revisit).
//
// Closes the tools-benchmark TODO row "Add SHA-256 byte benchmark". Grounded in
// README Hash / Byte Processing Benchmarks ("Use generated deterministic data";
// "SHA-256 throughput") and light id `cpu.hash_sha256_32mb`.
//
// CASE ONLY relative to the command runner: in-process SHA-256 over a
// deterministic 32 MiB generated buffer. No command runner, hardware probes,
// file/network input, 256MB full-mode case, or Phase 8-9 workloads.
//
// The digest is a local pure-TypeScript FIPS 180-4 SHA-256: the package
// boundary (.graph/boundary-policy.json) admits only `node:util/types`, so
// `node:crypto` is NOT imported here. Tests cross-check against node:crypto.
// This is a throughput benchmark, not a security primitive — do not reuse it
// for integrity or authentication.
//
// Zero-trust rules:
//  - Options closed via property descriptors (no getters; symbols / accessors /
//    custom prototypes refuse). Unknown keys refuse without echo.
//  - operations / maxDurationMs are finite safe positive ints within bounds.
//  - Digest mismatch across passes fails closed (status failed, score 0).
//  - Never throws; never echoes options / tokens.

/** Options record is not a closed data object. */
export const FUNGI_BENCH_SHA_001 = "FUNGI-BENCH-SHA-001";
/** A field value is outside its closed domain. */
export const FUNGI_BENCH_SHA_002 = "FUNGI-BENCH-SHA-002";
/** Consistency refuse (digest mismatch across passes). */
export const FUNGI_BENCH_SHA_003 = "FUNGI-BENCH-SHA-003";
/** Reserved nested refuse. */
export const FUNGI_BENCH_SHA_004 = "FUNGI-BENCH-SHA-004";
/** Lookup / result consistency refuse. */
export const FUNGI_BENCH_SHA_005 = "FUNGI-BENCH-SHA-005";

export const SHA256_32MB_BENCHMARK_ID = "cpu.hash_sha256_32mb";
export const SHA256_32MB_BENCHMARK_TARGET = "cpu" as const;

/** Closed light payload size: 32 MiB (33554432 bytes). */
export const SHA256_32MB_BYTES = 33_554_432;

export const SHA256_32MB_OPTIONS_FIELDS = Object.freeze(["operations", "maxDurationMs"] as const);

/** operations = full passes over the 32 MiB buffer. */
export const DEFAULT_SHA256_32MB_OPERATIONS = 1;
export const MAX_SHA256_32MB_OPERATIONS = 8;
export const DEFAULT_SHA256_32MB_MAX_DURATION_MS = 20_000;
export const MAX_SHA256_32MB_MAX_DURATION_MS = 60_000;

export type Sha256BenchmarkDiagnosticField =
  | "record" | "operations" | "maxDurationMs" | "result" | "id" | "target";

export interface Sha256BenchmarkDiagnostic {
  readonly code: string;
  readonly severity: "error";
  readonly message: string;
  readonly field: Sha256BenchmarkDiagnosticField;
}

export interface Sha256BenchmarkOptions {
  readonly operations: number;
  readonly maxDurationMs: number;
}

export interface Sha256BenchmarkResult {
  readonly id: typeof SHA256_32MB_BENCHMARK_ID;
  readonly target: typeof SHA256_32MB_BENCHMARK_TARGET;
  readonly status: "passed" | "failed" | "skipped_timeout";
  readonly durationMs: number;
  readonly operations: number;
  readonly score: number;
  readonly bytes: typeof SHA256_32MB_BYTES;
}

export type RunSha256BenchmarkResult =
  | { readonly ok: true; readonly value: Sha256BenchmarkResult }
  | { readonly ok: false; readonly diagnostics: readonly Sha256BenchmarkDiagnostic[] };

const diag = (
  code: string,
  message: string,
  field: Sha256BenchmarkDiagnosticField,
): Sha256BenchmarkDiagnostic => Object.freeze({ code, severity: "error" as const, message, field });

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
  field: Sha256BenchmarkDiagnosticField,
  out: Sha256BenchmarkDiagnostic[],
): number | undefined {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min || value > max) {
    out.push(diag(FUNGI_BENCH_SHA_002, "Numeric option is outside the closed domain.", field));
    return undefined;
  }
  return value;
}

function readOptions(input: unknown): { readonly ok: true; readonly value: Sha256BenchmarkOptions } | { readonly ok: false; readonly diagnostics: readonly Sha256BenchmarkDiagnostic[] } {
  const out: Sha256BenchmarkDiagnostic[] = [];
  if (input === undefined) {
    return Object.freeze({
      ok: true as const,
      value: Object.freeze({
        operations: DEFAULT_SHA256_32MB_OPERATIONS,
        maxDurationMs: DEFAULT_SHA256_32MB_MAX_DURATION_MS,
      }),
    });
  }
  const snap = snapshotRecord(input, 8);
  if (!snap.ok) {
    out.push(diag(FUNGI_BENCH_SHA_001, "SHA-256 benchmark options must be a plain data object.", "record"));
    return Object.freeze({ ok: false as const, diagnostics: Object.freeze(out) });
  }
  for (const key of snap.values.keys()) {
    if (key !== "operations" && key !== "maxDurationMs") {
      out.push(diag(FUNGI_BENCH_SHA_001, "Record has a key outside the closed shape.", "record"));
      return Object.freeze({ ok: false as const, diagnostics: Object.freeze(out) });
    }
  }
  const operations = snap.values.has("operations")
    ? readPositiveSafeInt(snap.values.get("operations"), 1, MAX_SHA256_32MB_OPERATIONS, "operations", out)
    : DEFAULT_SHA256_32MB_OPERATIONS;
  if (operations === undefined) return Object.freeze({ ok: false as const, diagnostics: Object.freeze(out) });
  const maxDurationMs = snap.values.has("maxDurationMs")
    ? readPositiveSafeInt(snap.values.get("maxDurationMs"), 1, MAX_SHA256_32MB_MAX_DURATION_MS, "maxDurationMs", out)
    : DEFAULT_SHA256_32MB_MAX_DURATION_MS;
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

// FIPS 180-4 round constants.
const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

function compress(state: Uint32Array, w: Uint32Array, block: Uint8Array, off: number): void {
  for (let t = 0; t < 16; t += 1) {
    const j = off + t * 4;
    w[t] = ((block[j]! << 24) | (block[j + 1]! << 16) | (block[j + 2]! << 8) | block[j + 3]!) >>> 0;
  }
  for (let t = 16; t < 64; t += 1) {
    const x = w[t - 15]!;
    const y = w[t - 2]!;
    const s0 = ((x >>> 7) | (x << 25)) ^ ((x >>> 18) | (x << 14)) ^ (x >>> 3);
    const s1 = ((y >>> 17) | (y << 15)) ^ ((y >>> 19) | (y << 13)) ^ (y >>> 10);
    w[t] = (w[t - 16]! + s0 + w[t - 7]! + s1) >>> 0;
  }
  let a = state[0]!, b = state[1]!, c = state[2]!, d = state[3]!;
  let e = state[4]!, f = state[5]!, g = state[6]!, h = state[7]!;
  for (let t = 0; t < 64; t += 1) {
    const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
    const ch = (e & f) ^ (~e & g);
    const t1 = (h + S1 + ch + K[t]! + w[t]!) >>> 0;
    const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
    const maj = (a & b) ^ (a & c) ^ (b & c);
    const t2 = (S0 + maj) >>> 0;
    h = g; g = f; f = e; e = (d + t1) >>> 0;
    d = c; c = b; b = a; a = (t1 + t2) >>> 0;
  }
  state[0] = (state[0]! + a) >>> 0; state[1] = (state[1]! + b) >>> 0;
  state[2] = (state[2]! + c) >>> 0; state[3] = (state[3]! + d) >>> 0;
  state[4] = (state[4]! + e) >>> 0; state[5] = (state[5]! + f) >>> 0;
  state[6] = (state[6]! + g) >>> 0; state[7] = (state[7]! + h) >>> 0;
}

/**
 * Pure FIPS 180-4 SHA-256 → lowercase hex. Returns undefined for non-Uint8Array
 * input. Never throws. Benchmark use only (not a security primitive).
 */
export function benchSha256Hex(data: unknown): string | undefined {
  try {
    if (!(data instanceof Uint8Array)) return undefined;
    const len = data.length;
    if (!Number.isSafeInteger(len) || len < 0) return undefined;
    const state = new Uint32Array([
      0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
    ]);
    const w = new Uint32Array(64);
    const fullBlocks = Math.floor(len / 64);
    for (let i = 0; i < fullBlocks; i += 1) compress(state, w, data, i * 64);
    const rem = len - fullBlocks * 64;
    const tailLen = rem + 9 <= 64 ? 64 : 128;
    const tail = new Uint8Array(tailLen);
    tail.set(data.subarray(fullBlocks * 64));
    tail[rem] = 0x80;
    const bitLen = len * 8;
    const hi = Math.floor(bitLen / 0x100000000);
    const lo = bitLen >>> 0;
    tail[tailLen - 8] = (hi >>> 24) & 0xff; tail[tailLen - 7] = (hi >>> 16) & 0xff;
    tail[tailLen - 6] = (hi >>> 8) & 0xff; tail[tailLen - 5] = hi & 0xff;
    tail[tailLen - 4] = (lo >>> 24) & 0xff; tail[tailLen - 3] = (lo >>> 16) & 0xff;
    tail[tailLen - 2] = (lo >>> 8) & 0xff; tail[tailLen - 1] = lo & 0xff;
    for (let off = 0; off < tailLen; off += 64) compress(state, w, tail, off);
    let hex = "";
    for (let i = 0; i < 8; i += 1) hex += state[i]!.toString(16).padStart(8, "0");
    return hex;
  } catch {
    return undefined;
  }
}

let cachedBuffer: Uint8Array | undefined;

/** Deterministic generated 32 MiB buffer (never read from disk/network). Cached. */
export function buildSha256BenchmarkBuffer(): Uint8Array | undefined {
  try {
    if (cachedBuffer !== undefined && cachedBuffer.length === SHA256_32MB_BYTES) return cachedBuffer;
    const buf = new Uint8Array(SHA256_32MB_BYTES);
    let x = 0x9e3779b9 >>> 0;
    for (let i = 0; i < buf.length; i += 1) {
      // xorshift32 — deterministic, closed.
      x ^= x << 13; x >>>= 0;
      x ^= x >>> 17;
      x ^= x << 5; x >>>= 0;
      buf[i] = x & 0xff;
    }
    cachedBuffer = buf;
    return buf;
  } catch {
    return undefined;
  }
}

export function scoreSha256Benchmark(bytesHashed: number, durationMs: number): number {
  if (!Number.isSafeInteger(bytesHashed) || bytesHashed < 0) return 0;
  if (typeof durationMs !== "number" || !Number.isFinite(durationMs) || durationMs < 0) return 0;
  if (bytesHashed === 0) return 0;
  if (durationMs === 0) return 10_000;
  // MiB per second, capped at 10000.
  const raw = Math.floor((bytesHashed / 1_048_576) / (durationMs / 1000));
  if (!Number.isSafeInteger(raw) || raw < 0) return 0;
  return raw > 10_000 ? 10_000 : raw;
}

/** Run closed SHA-256 32 MiB throughput microbench. Never throws. */
export function runSha256Benchmark(input?: unknown): RunSha256BenchmarkResult {
  try {
    const opts = readOptions(input);
    if (!opts.ok) return opts;
    const buf = buildSha256BenchmarkBuffer();
    if (buf === undefined) {
      return Object.freeze({
        ok: false as const,
        diagnostics: Object.freeze([diag(FUNGI_BENCH_SHA_005, "SHA-256 benchmark buffer build refused.", "result")]),
      });
    }
    const { operations, maxDurationMs } = opts.value;
    const started = nowMs();
    let completed = 0;
    let first: string | undefined;
    const finish = (status: "passed" | "failed" | "skipped_timeout"): RunSha256BenchmarkResult => {
      const d = Math.max(0, Math.floor(nowMs() - started));
      const durationMs = Number.isSafeInteger(d) ? d : 0;
      return Object.freeze({
        ok: true as const,
        value: Object.freeze({
          id: SHA256_32MB_BENCHMARK_ID,
          target: SHA256_32MB_BENCHMARK_TARGET,
          status,
          durationMs,
          operations: completed,
          score: status === "failed" ? 0 : scoreSha256Benchmark(completed * SHA256_32MB_BYTES, durationMs),
          bytes: SHA256_32MB_BYTES,
        }),
      });
    };
    for (let i = 0; i < operations; i += 1) {
      const hex = benchSha256Hex(buf);
      if (hex === undefined || hex.length !== 64) return finish("failed");
      if (first === undefined) first = hex;
      else if (hex !== first) return finish("failed");
      completed += 1;
      if (i + 1 < operations && nowMs() - started > maxDurationMs) return finish("skipped_timeout");
    }
    return finish("passed");
  } catch {
    return Object.freeze({
      ok: false as const,
      diagnostics: Object.freeze([diag(FUNGI_BENCH_SHA_005, "SHA-256 benchmark refused after an unexpected failure.", "result")]),
    });
  }
}

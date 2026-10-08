// JSON 100MB / optional 1GB generated streaming validate cases (TODO pass,
// Grok 2026-10-06; zero-trust defaults, owner may revisit).
//
// Closes the tools-benchmark Phase 8 rows "Add 100MB JSON streaming test" and
// "Add optional 1GB generated JSON streaming test". Grounded in README JSON
// Benchmarks full mode ("100MB generated JSON stream", "1GB generated JSON
// stream optional") and Important ("1GB JSON should not be in light mode",
// "should be generated locally or streamed", "Do not require downloading"),
// plus full-mode ids `json.stream_validate_100mb` / `json.stream_validate_1gb_optional`.
//
// Data is GENERATED AS IT IS FED: a deterministic line generator emits fixed
// chunks straight into the incremental JSON Lines validator from
// json-stream-10mb-benchmark (#127). Neither the payload nor the line list is
// held in memory; peak memory is ~one chunk plus one partial line.
//
// OWNER-REVISIT PICKS (not specified in-repo; NOT spec):
//  - sizes: 100 MiB = 104857600 and 1 GiB = 1073741824 bytes (README "100MB" /
//    "1GB" carry no unit base; matches the MiB picks in #124/#127).
//  - framing / chunk / max line / record shape: same as #127.
//  - `bytes` option: a closed override in [64 KiB, case size] so tests can run
//    small; the result carries the actual `bytes` validated. Default = case size.
//  - maxDurationMs: 100MB default 60 s (max 300 s); 1GB default 300 s (max 1800 s).
//  - The 1GB case is optional per README; excluding it from light mode is the
//    (still open) command runner's job. This module never runs it implicitly.
//
// CASE ONLY. Zero-trust rules: closed options via descriptors; unknown keys
// refuse without echo; any invalid/oversize line or count mismatch fails the
// run; timeout stops mid-stream as skipped_timeout; never throws.

import {
  JSON_STREAM_CHUNK_BYTES,
  JSON_STREAM_MAX_LINE_BYTES,
  createJsonLinesStreamValidator,
  type JsonLinesStreamSummary,
} from "./json-stream-10mb-benchmark.js";

/** Options record is not a closed data object. */
export const FUNGI_BENCH_JSONG_001 = "FUNGI-BENCH-JSONG-001";
/** A field value is outside its closed domain. */
export const FUNGI_BENCH_JSONG_002 = "FUNGI-BENCH-JSONG-002";
/** Consistency refuse (record count / invalid line). */
export const FUNGI_BENCH_JSONG_003 = "FUNGI-BENCH-JSONG-003";
/** Reserved nested refuse. */
export const FUNGI_BENCH_JSONG_004 = "FUNGI-BENCH-JSONG-004";
/** Lookup / result consistency refuse. */
export const FUNGI_BENCH_JSONG_005 = "FUNGI-BENCH-JSONG-005";

export const JSON_STREAM_VALIDATE_100MB_BENCHMARK_ID = "json.stream_validate_100mb";
export const JSON_STREAM_VALIDATE_1GB_OPTIONAL_BENCHMARK_ID = "json.stream_validate_1gb_optional";
export const JSON_STREAM_GENERATED_BENCHMARK_TARGET = "json" as const;

/** Owner-revisit pick: 100 MiB. */
export const JSON_STREAM_100MB_BYTES = 104_857_600;
/** Owner-revisit pick: 1 GiB. */
export const JSON_STREAM_1GB_BYTES = 1_073_741_824;
/** Smallest admitted `bytes` override (keeps the final padded line in range). */
export const MIN_JSON_STREAM_GENERATED_BYTES = 65_536;

export const JSON_STREAM_GENERATED_OPTIONS_FIELDS = Object.freeze(["bytes", "maxDurationMs"] as const);

export const DEFAULT_JSON_STREAM_100MB_MAX_DURATION_MS = 60_000;
export const MAX_JSON_STREAM_100MB_MAX_DURATION_MS = 300_000;
export const DEFAULT_JSON_STREAM_1GB_MAX_DURATION_MS = 300_000;
export const MAX_JSON_STREAM_1GB_MAX_DURATION_MS = 1_800_000;

export type JsonStreamGeneratedBenchmarkId =
  | typeof JSON_STREAM_VALIDATE_100MB_BENCHMARK_ID
  | typeof JSON_STREAM_VALIDATE_1GB_OPTIONAL_BENCHMARK_ID;

export type JsonStreamGeneratedDiagnosticField = "record" | "bytes" | "maxDurationMs" | "result";

export interface JsonStreamGeneratedDiagnostic {
  readonly code: string;
  readonly severity: "error";
  readonly message: string;
  readonly field: JsonStreamGeneratedDiagnosticField;
}

export interface JsonStreamGeneratedResult {
  readonly id: JsonStreamGeneratedBenchmarkId;
  readonly target: typeof JSON_STREAM_GENERATED_BENCHMARK_TARGET;
  readonly status: "passed" | "failed" | "skipped_timeout";
  readonly durationMs: number;
  /** Records validated. */
  readonly operations: number;
  readonly score: number;
  /** Bytes requested for this run (case size unless overridden). */
  readonly bytes: number;
  /** Bytes actually fed before the run stopped. */
  readonly bytesValidated: number;
}

export type RunJsonStreamGeneratedResult =
  | { readonly ok: true; readonly value: JsonStreamGeneratedResult }
  | { readonly ok: false; readonly diagnostics: readonly JsonStreamGeneratedDiagnostic[] };

export interface GeneratedJsonLinesSummary extends JsonLinesStreamSummary {
  /** Lines the generator emitted. */
  readonly generatedLines: number;
  /** True when the sink asked to stop before the end. */
  readonly stopped: boolean;
}

const diag = (
  code: string,
  message: string,
  field: JsonStreamGeneratedDiagnosticField,
): JsonStreamGeneratedDiagnostic => Object.freeze({ code, severity: "error" as const, message, field });

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

function line(i: number, nameSuffix: string): string {
  return `{"id":${i},"name":"row_${i.toString(16).padStart(6, "0")}${nameSuffix}","score":${(i % 997) + 1},"active":${i % 2 === 0 ? "true" : "false"},"meta":{"tag":"t${i % 16}","n":${i % 64}}}\n`;
}

/**
 * Generate exactly `totalBytes` of deterministic JSON Lines and hand them to
 * `sink` in chunks of `chunkBytes`, without holding the payload. `sink`
 * returns false to stop early. Returns emitted line/byte counts, or undefined
 * on a refused size. Never throws.
 */
export function generateJsonLinesChunks(
  totalBytes: number,
  chunkBytes: number,
  sink: (chunk: string) => boolean,
): { readonly lines: number; readonly bytes: number; readonly stopped: boolean } | undefined {
  try {
    if (!Number.isSafeInteger(totalBytes) || totalBytes < MIN_JSON_STREAM_GENERATED_BYTES || totalBytes > JSON_STREAM_1GB_BYTES) return undefined;
    if (!Number.isSafeInteger(chunkBytes) || chunkBytes < 1 || chunkBytes > 16 * JSON_STREAM_CHUNK_BYTES) return undefined;
    let buf = "";
    let emitted = 0;
    let produced = 0;
    let lines = 0;
    let i = 0;
    const flush = (all: boolean): boolean => {
      while (buf.length >= chunkBytes || (all && buf.length > 0)) {
        const take = Math.min(chunkBytes, buf.length);
        const chunk = buf.slice(0, take);
        buf = buf.slice(take);
        emitted += chunk.length;
        if (!sink(chunk)) return false;
      }
      return true;
    };
    while (totalBytes - produced > 1024) {
      const l = line(i, "");
      buf += l;
      produced += l.length;
      lines += 1;
      i += 1;
      if (buf.length >= chunkBytes && !flush(false)) return Object.freeze({ lines, bytes: emitted, stopped: true });
    }
    const remaining = totalBytes - produced;
    const base = line(i, "");
    const pad = remaining - base.length;
    if (pad < 0 || remaining > JSON_STREAM_MAX_LINE_BYTES) return undefined;
    buf += line(i, "x".repeat(pad));
    produced += remaining;
    lines += 1;
    if (!flush(true)) return Object.freeze({ lines, bytes: emitted, stopped: true });
    if (produced !== totalBytes || emitted !== totalBytes) return undefined;
    return Object.freeze({ lines, bytes: emitted, stopped: false });
  } catch {
    return undefined;
  }
}

/**
 * Validate a generated stream of `totalBytes` through the #127 validator.
 * `shouldStop` is polled per chunk. Never throws; undefined on refused size.
 */
export function streamValidateGeneratedJsonLines(
  totalBytes: number,
  chunkBytes: number = JSON_STREAM_CHUNK_BYTES,
  shouldStop: () => boolean = () => false,
): GeneratedJsonLinesSummary | undefined {
  try {
    const v = createJsonLinesStreamValidator();
    const gen = generateJsonLinesChunks(totalBytes, chunkBytes, (chunk) => {
      v.push(chunk);
      return !shouldStop();
    });
    if (gen === undefined) return undefined;
    const s = v.end();
    return Object.freeze({ ...s, generatedLines: gen.lines, stopped: gen.stopped });
  } catch {
    return undefined;
  }
}

export function scoreJsonStreamGeneratedBenchmark(bytesValidated: number, durationMs: number): number {
  if (!Number.isSafeInteger(bytesValidated) || bytesValidated < 0) return 0;
  if (typeof durationMs !== "number" || !Number.isFinite(durationMs) || durationMs < 0) return 0;
  if (bytesValidated === 0) return 0;
  if (durationMs === 0) return 10_000;
  const raw = Math.floor((bytesValidated / 1_048_576) / (durationMs / 1000));
  if (!Number.isSafeInteger(raw) || raw < 0) return 0;
  return raw > 10_000 ? 10_000 : raw;
}

function runGenerated(
  id: JsonStreamGeneratedBenchmarkId,
  caseBytes: number,
  defaultMaxMs: number,
  maxMaxMs: number,
  input: unknown,
): RunJsonStreamGeneratedResult {
  try {
    let bytes = caseBytes;
    let maxDurationMs = defaultMaxMs;
    if (input !== undefined) {
      const snap = snapshotRecord(input, 4);
      if (!snap.ok) return Object.freeze({ ok: false as const, diagnostics: Object.freeze([diag(FUNGI_BENCH_JSONG_001, "Generated JSON stream options must be a plain data object.", "record")]) });
      for (const key of snap.values.keys()) {
        if (key !== "bytes" && key !== "maxDurationMs") {
          return Object.freeze({ ok: false as const, diagnostics: Object.freeze([diag(FUNGI_BENCH_JSONG_001, "Record has a key outside the closed shape.", "record")]) });
        }
      }
      if (snap.values.has("bytes")) {
        const b = snap.values.get("bytes");
        if (typeof b !== "number" || !Number.isSafeInteger(b) || b < MIN_JSON_STREAM_GENERATED_BYTES || b > caseBytes) {
          return Object.freeze({ ok: false as const, diagnostics: Object.freeze([diag(FUNGI_BENCH_JSONG_002, "Numeric option is outside the closed domain.", "bytes")]) });
        }
        bytes = b;
      }
      if (snap.values.has("maxDurationMs")) {
        const m = snap.values.get("maxDurationMs");
        if (typeof m !== "number" || !Number.isSafeInteger(m) || m < 1 || m > maxMaxMs) {
          return Object.freeze({ ok: false as const, diagnostics: Object.freeze([diag(FUNGI_BENCH_JSONG_002, "Numeric option is outside the closed domain.", "maxDurationMs")]) });
        }
        maxDurationMs = m;
      }
    }
    const started = nowMs();
    let timedOut = false;
    const s = streamValidateGeneratedJsonLines(bytes, JSON_STREAM_CHUNK_BYTES, () => {
      if (nowMs() - started > maxDurationMs) { timedOut = true; return true; }
      return false;
    });
    const d = Math.max(0, Math.floor(nowMs() - started));
    const durationMs = Number.isSafeInteger(d) ? d : 0;
    const result = (status: JsonStreamGeneratedResult["status"], records: number, fed: number): RunJsonStreamGeneratedResult =>
      Object.freeze({
        ok: true as const,
        value: Object.freeze({
          id,
          target: JSON_STREAM_GENERATED_BENCHMARK_TARGET,
          status,
          durationMs,
          operations: records,
          score: status === "failed" ? 0 : scoreJsonStreamGeneratedBenchmark(fed, durationMs),
          bytes,
          bytesValidated: fed,
        }),
      });
    if (s === undefined) return result("failed", 0, 0);
    // A stop cuts the last line mid-way; end() then counts that partial line,
    // so classify the stop first. Only a timeout stop is skipped_timeout.
    if (s.stopped) return result(timedOut ? "skipped_timeout" : "failed", s.records, s.bytes);
    if (s.invalid !== 0 || s.oversize !== 0) return result("failed", s.records, s.bytes);
    if (s.records !== s.generatedLines || s.bytes !== bytes) return result("failed", s.records, s.bytes);
    return result("passed", s.records, s.bytes);
  } catch {
    return Object.freeze({ ok: false as const, diagnostics: Object.freeze([diag(FUNGI_BENCH_JSONG_005, "Generated JSON stream benchmark refused after an unexpected failure.", "result")]) });
  }
}

/** Run json.stream_validate_100mb (generated as fed). Never throws. */
export function runJsonStreamValidate100mbBenchmark(input?: unknown): RunJsonStreamGeneratedResult {
  return runGenerated(JSON_STREAM_VALIDATE_100MB_BENCHMARK_ID, JSON_STREAM_100MB_BYTES, DEFAULT_JSON_STREAM_100MB_MAX_DURATION_MS, MAX_JSON_STREAM_100MB_MAX_DURATION_MS, input);
}

/**
 * Run json.stream_validate_1gb_optional (generated as fed). Optional per
 * README and never part of light mode; callers must invoke it explicitly.
 * Never throws.
 */
export function runJsonStreamValidate1gbOptionalBenchmark(input?: unknown): RunJsonStreamGeneratedResult {
  return runGenerated(JSON_STREAM_VALIDATE_1GB_OPTIONAL_BENCHMARK_ID, JSON_STREAM_1GB_BYTES, DEFAULT_JSON_STREAM_1GB_MAX_DURATION_MS, MAX_JSON_STREAM_1GB_MAX_DURATION_MS, input);
}

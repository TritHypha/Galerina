// JSON 10MB streaming validate benchmark case (TODO pass, Grok 2026-10-05;
// zero-trust defaults, owner may revisit).
//
// Closes the tools-benchmark TODO row "Add JSON 10MB streaming benchmark".
// Grounded in README JSON Benchmarks (light: "10MB JSON stream validate",
// "unknown field rejection"; "generated locally or streamed", "Do not require
// downloading") and light id `json.stream_validate_10mb`.
//
// OWNER-REVISIT PICKS (not specified in-repo; NOT spec):
//  - size: 10 MiB = 10485760 bytes (README says "10MB" without a unit base;
//    chosen to match the 1 MiB pick in json-1mb-benchmark).
//  - framing: JSON Lines (one record per "\n"-terminated line), mirroring the
//    `json_lines` JsonDecodeMode in galerina-data-json (no import).
//  - chunk size 64 KiB; max line 4 KiB (oversize lines fail closed).
//  - record shape: the same closed item shape as json.decode_validate_1mb.
//
// CASE ONLY relative to the command runner: payload generated in-process
// (cached), then fed through an incremental line validator chunk by chunk.
// The validator holds at most one partial line. No 100MB/1GB full-mode
// streams, no file/network input, no quarantine/continue resilience mode
// (that is the separate README resilient.* family), no command runner.
//
// Zero-trust rules:
//  - Options closed via property descriptors. Unknown keys refuse without echo.
//  - Any invalid / oversize / empty line makes the run `failed` (never
//    silently skipped into a pass). Validator never throws; never echoes data.

import { JSON_1MB_ITEM_FIELDS, JSON_1MB_META_FIELDS } from "./json-1mb-benchmark.js";

/** Options record is not a closed data object. */
export const FUNGI_BENCH_JSONS_001 = "FUNGI-BENCH-JSONS-001";
/** A field value is outside its closed domain. */
export const FUNGI_BENCH_JSONS_002 = "FUNGI-BENCH-JSONS-002";
/** Consistency refuse (record count / invalid line). */
export const FUNGI_BENCH_JSONS_003 = "FUNGI-BENCH-JSONS-003";
/** Reserved nested refuse. */
export const FUNGI_BENCH_JSONS_004 = "FUNGI-BENCH-JSONS-004";
/** Lookup / result consistency refuse. */
export const FUNGI_BENCH_JSONS_005 = "FUNGI-BENCH-JSONS-005";

export const JSON_STREAM_VALIDATE_10MB_BENCHMARK_ID = "json.stream_validate_10mb";
export const JSON_STREAM_VALIDATE_10MB_BENCHMARK_TARGET = "json" as const;

/** Owner-revisit pick: 10 MiB. */
export const JSON_STREAM_10MB_BYTES = 10_485_760;
/** Owner-revisit pick: 64 KiB chunks. */
export const JSON_STREAM_CHUNK_BYTES = 65_536;
/** Owner-revisit pick: 4 KiB max line (bounded memory per line). */
export const JSON_STREAM_MAX_LINE_BYTES = 4_096;

export const JSON_STREAM_10MB_OPTIONS_FIELDS = Object.freeze(["operations", "maxDurationMs"] as const);

/** operations = full passes over the stream. */
export const DEFAULT_JSON_STREAM_10MB_OPERATIONS = 1;
export const MAX_JSON_STREAM_10MB_OPERATIONS = 8;
/** README light-mode "maximum single test time: 20 seconds". */
export const DEFAULT_JSON_STREAM_10MB_MAX_DURATION_MS = 20_000;
export const MAX_JSON_STREAM_10MB_MAX_DURATION_MS = 60_000;

export type JsonStreamBenchmarkDiagnosticField =
  | "record" | "operations" | "maxDurationMs" | "result" | "id" | "target";

export interface JsonStreamBenchmarkDiagnostic {
  readonly code: string;
  readonly severity: "error";
  readonly message: string;
  readonly field: JsonStreamBenchmarkDiagnosticField;
}

export interface JsonStreamBenchmarkOptions {
  readonly operations: number;
  readonly maxDurationMs: number;
}

export interface JsonStreamBenchmarkResult {
  readonly id: typeof JSON_STREAM_VALIDATE_10MB_BENCHMARK_ID;
  readonly target: typeof JSON_STREAM_VALIDATE_10MB_BENCHMARK_TARGET;
  readonly status: "passed" | "failed" | "skipped_timeout";
  readonly durationMs: number;
  readonly operations: number;
  readonly score: number;
  readonly bytes: typeof JSON_STREAM_10MB_BYTES;
}

export type RunJsonStreamBenchmarkResult =
  | { readonly ok: true; readonly value: JsonStreamBenchmarkResult }
  | { readonly ok: false; readonly diagnostics: readonly JsonStreamBenchmarkDiagnostic[] };

/** Closed counters from one stream pass. */
export interface JsonLinesStreamSummary {
  readonly records: number;
  readonly invalid: number;
  readonly oversize: number;
  readonly bytes: number;
}

export interface JsonLinesStreamValidator {
  /** Feed one chunk. Returns false if the chunk itself was refused (non-string). Never throws. */
  push(chunk: unknown): boolean;
  /** Flush any trailing partial line and return frozen counters. Never throws. */
  end(): JsonLinesStreamSummary;
}

const diag = (
  code: string,
  message: string,
  field: JsonStreamBenchmarkDiagnosticField,
): JsonStreamBenchmarkDiagnostic => Object.freeze({ code, severity: "error" as const, message, field });

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
  field: JsonStreamBenchmarkDiagnosticField,
  out: JsonStreamBenchmarkDiagnostic[],
): number | undefined {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min || value > max) {
    out.push(diag(FUNGI_BENCH_JSONS_002, "Numeric option is outside the closed domain.", field));
    return undefined;
  }
  return value;
}

function readOptions(input: unknown): { readonly ok: true; readonly value: JsonStreamBenchmarkOptions } | { readonly ok: false; readonly diagnostics: readonly JsonStreamBenchmarkDiagnostic[] } {
  const out: JsonStreamBenchmarkDiagnostic[] = [];
  if (input === undefined) {
    return Object.freeze({
      ok: true as const,
      value: Object.freeze({ operations: DEFAULT_JSON_STREAM_10MB_OPERATIONS, maxDurationMs: DEFAULT_JSON_STREAM_10MB_MAX_DURATION_MS }),
    });
  }
  const snap = snapshotRecord(input, 8);
  if (!snap.ok) {
    out.push(diag(FUNGI_BENCH_JSONS_001, "JSON stream benchmark options must be a plain data object.", "record"));
    return Object.freeze({ ok: false as const, diagnostics: Object.freeze(out) });
  }
  for (const key of snap.values.keys()) {
    if (key !== "operations" && key !== "maxDurationMs") {
      out.push(diag(FUNGI_BENCH_JSONS_001, "Record has a key outside the closed shape.", "record"));
      return Object.freeze({ ok: false as const, diagnostics: Object.freeze(out) });
    }
  }
  const operations = snap.values.has("operations")
    ? readPositiveSafeInt(snap.values.get("operations"), 1, MAX_JSON_STREAM_10MB_OPERATIONS, "operations", out)
    : DEFAULT_JSON_STREAM_10MB_OPERATIONS;
  if (operations === undefined) return Object.freeze({ ok: false as const, diagnostics: Object.freeze(out) });
  const maxDurationMs = snap.values.has("maxDurationMs")
    ? readPositiveSafeInt(snap.values.get("maxDurationMs"), 1, MAX_JSON_STREAM_10MB_MAX_DURATION_MS, "maxDurationMs", out)
    : DEFAULT_JSON_STREAM_10MB_MAX_DURATION_MS;
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

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function hasExactKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  const keys = Reflect.ownKeys(value);
  if (keys.length !== allowed.length) return false;
  for (const k of keys) if (typeof k !== "string" || !allowed.includes(k)) return false;
  return true;
}

/** Closed record validate (same item shape as json.decode_validate_1mb). Never throws. */
export function validateJsonStreamRecord(value: unknown): boolean {
  try {
    if (!isPlainObject(value) || !hasExactKeys(value, JSON_1MB_ITEM_FIELDS)) return false;
    if (typeof value.id !== "number" || !Number.isSafeInteger(value.id)) return false;
    if (typeof value.name !== "string") return false;
    if (typeof value.score !== "number" || !Number.isSafeInteger(value.score)) return false;
    if (typeof value.active !== "boolean") return false;
    const meta = value.meta;
    if (!isPlainObject(meta) || !hasExactKeys(meta, JSON_1MB_META_FIELDS)) return false;
    if (typeof meta.tag !== "string") return false;
    if (typeof meta.n !== "number" || !Number.isSafeInteger(meta.n)) return false;
    return true;
  } catch {
    return false;
  }
}

/** Incremental JSON Lines validator; holds at most one partial line. Never throws. */
export function createJsonLinesStreamValidator(): JsonLinesStreamValidator {
  let partial = "";
  let skipping = false;
  let records = 0;
  let invalid = 0;
  let oversize = 0;
  let bytes = 0;
  let ended = false;
  const handleLine = (line: string): void => {
    if (line.length === 0) { invalid += 1; return; }
    try {
      if (validateJsonStreamRecord(JSON.parse(line))) records += 1;
      else invalid += 1;
    } catch {
      invalid += 1;
    }
  };
  return Object.freeze({
    push(chunk: unknown): boolean {
      try {
        if (ended || typeof chunk !== "string") { invalid += 1; return false; }
        bytes += chunk.length;
        let start = 0;
        while (start <= chunk.length) {
          const nl = chunk.indexOf("\n", start);
          if (nl === -1) {
            const rest = chunk.slice(start);
            if (skipping) return true;
            if (partial.length + rest.length > JSON_STREAM_MAX_LINE_BYTES) {
              oversize += 1; partial = ""; skipping = true;
            } else {
              partial += rest;
            }
            return true;
          }
          const piece = chunk.slice(start, nl);
          if (skipping) {
            skipping = false;
          } else if (partial.length + piece.length > JSON_STREAM_MAX_LINE_BYTES) {
            oversize += 1;
          } else {
            handleLine(partial + piece);
          }
          partial = "";
          start = nl + 1;
        }
        return true;
      } catch {
        invalid += 1;
        return false;
      }
    },
    end(): JsonLinesStreamSummary {
      try {
        if (!ended) {
          ended = true;
          if (!skipping && partial.length > 0) handleLine(partial);
          partial = "";
        }
      } catch {
        invalid += 1;
      }
      return Object.freeze({ records, invalid, oversize, bytes });
    },
  });
}

let cached: { readonly payload: string; readonly lines: number } | undefined;

function line(i: number, nameSuffix: string): string {
  return `{"id":${i},"name":"row_${i.toString(16).padStart(6, "0")}${nameSuffix}","score":${(i % 997) + 1},"active":${i % 2 === 0 ? "true" : "false"},"meta":{"tag":"t${i % 16}","n":${i % 64}}}\n`;
}

/**
 * Deterministic JSON Lines payload of exactly JSON_STREAM_10MB_BYTES (ASCII,
 * so UTF-16 length == UTF-8 bytes). Cached. Never throws.
 */
export function buildJsonStream10mbPayload(): { readonly ok: true; readonly payload: string; readonly lines: number; readonly bytes: number } | { readonly ok: false } {
  try {
    if (cached === undefined) {
      const parts: string[] = [];
      let total = 0;
      let i = 0;
      // Stop with a final-line budget in (base, MAX_LINE].
      while (JSON_STREAM_10MB_BYTES - total > 1024) {
        const l = line(i, "");
        parts.push(l);
        total += l.length;
        i += 1;
        if (i > 1_000_000) return { ok: false };
      }
      const remaining = JSON_STREAM_10MB_BYTES - total;
      const base = line(i, "");
      const padLen = remaining - base.length;
      if (padLen < 0 || remaining > JSON_STREAM_MAX_LINE_BYTES) return { ok: false };
      const last = line(i, "x".repeat(padLen));
      parts.push(last);
      total += last.length;
      if (total !== JSON_STREAM_10MB_BYTES) return { ok: false };
      cached = Object.freeze({ payload: parts.join(""), lines: parts.length });
    }
    if (cached.payload.length !== JSON_STREAM_10MB_BYTES) return { ok: false };
    return Object.freeze({ ok: true as const, payload: cached.payload, lines: cached.lines, bytes: cached.payload.length });
  } catch {
    return { ok: false };
  }
}

/** Stream one pass of `payload` through a fresh validator in fixed chunks. Never throws. */
export function streamValidateJsonLines(payload: unknown, chunkBytes: number = JSON_STREAM_CHUNK_BYTES): JsonLinesStreamSummary {
  const v = createJsonLinesStreamValidator();
  try {
    if (typeof payload !== "string" || !Number.isSafeInteger(chunkBytes) || chunkBytes < 1) {
      v.push(undefined);
      return v.end();
    }
    for (let off = 0; off < payload.length; off += chunkBytes) v.push(payload.slice(off, off + chunkBytes));
  } catch {
    v.push(undefined);
  }
  return v.end();
}

export function scoreJsonStreamBenchmark(bytesValidated: number, durationMs: number): number {
  if (!Number.isSafeInteger(bytesValidated) || bytesValidated < 0) return 0;
  if (typeof durationMs !== "number" || !Number.isFinite(durationMs) || durationMs < 0) return 0;
  if (bytesValidated === 0) return 0;
  if (durationMs === 0) return 10_000;
  // MiB per second, capped at 10000.
  const raw = Math.floor((bytesValidated / 1_048_576) / (durationMs / 1000));
  if (!Number.isSafeInteger(raw) || raw < 0) return 0;
  return raw > 10_000 ? 10_000 : raw;
}

/** Run the closed JSON 10 MiB streaming validate microbench. Never throws. */
export function runJsonStreamValidate10mbBenchmark(input?: unknown): RunJsonStreamBenchmarkResult {
  try {
    const opts = readOptions(input);
    if (!opts.ok) return opts;
    const built = buildJsonStream10mbPayload();
    if (!built.ok) {
      return Object.freeze({
        ok: false as const,
        diagnostics: Object.freeze([diag(FUNGI_BENCH_JSONS_005, "JSON stream payload build refused.", "result")]),
      });
    }
    const { operations, maxDurationMs } = opts.value;
    const started = nowMs();
    let completed = 0;
    const finish = (status: JsonStreamBenchmarkResult["status"]): RunJsonStreamBenchmarkResult => {
      const d = Math.max(0, Math.floor(nowMs() - started));
      const durationMs = Number.isSafeInteger(d) ? d : 0;
      return Object.freeze({
        ok: true as const,
        value: Object.freeze({
          id: JSON_STREAM_VALIDATE_10MB_BENCHMARK_ID,
          target: JSON_STREAM_VALIDATE_10MB_BENCHMARK_TARGET,
          status,
          durationMs,
          operations: completed,
          score: status === "failed" ? 0 : scoreJsonStreamBenchmark(completed * JSON_STREAM_10MB_BYTES, durationMs),
          bytes: JSON_STREAM_10MB_BYTES,
        }),
      });
    };
    for (let i = 0; i < operations; i += 1) {
      const s = streamValidateJsonLines(built.payload);
      if (s.invalid !== 0 || s.oversize !== 0 || s.records !== built.lines || s.bytes !== JSON_STREAM_10MB_BYTES) return finish("failed");
      completed += 1;
      if (i + 1 < operations && nowMs() - started > maxDurationMs) return finish("skipped_timeout");
    }
    return finish("passed");
  } catch {
    return Object.freeze({
      ok: false as const,
      diagnostics: Object.freeze([diag(FUNGI_BENCH_JSONS_005, "JSON stream benchmark refused after an unexpected failure.", "result")]),
    });
  }
}

// JSON 1MB decode/validate benchmark case (TODO pass, Grok 2026-10-05;
// zero-trust defaults, owner may revisit).
//
// Closes the tools-benchmark TODO row "Add JSON 1MB decode/validate benchmark".
// Grounded in README JSON Benchmarks (light: 1MB JSON decode, nested object
// validation, unknown field rejection) and light id `json.decode_validate_1mb`.
// CASE ONLY relative to the command runner: in-process deterministic ~1 MiB
// document decode + closed-shape field validation. No streaming 10MB/100MB/1GB,
// no network download, no command runner, no hardware probes, no Phase 8-9.
//
// Closed schema shape is a local allowlist inspired by galerina-data-json
// JsonSchemaContract field kinds — this package does not import data-json.
// Payload is generated deterministically in-process (never fetched).
//
// Zero-trust rules:
//  - Options closed via property descriptors (no getters; symbols / accessors /
//    custom prototypes refuse). Unknown keys refuse without echo.
//  - operations / maxDurationMs are finite safe positive ints within bounds.
//  - JSON.parse failures become failed status (never thrown to caller).
//  - Unknown fields / wrong kinds fail closed. Never echoes payload / tokens.

/** Options record is not a closed data object. */
export const FUNGI_BENCH_JSON_001 = "FUNGI-BENCH-JSON-001";
/** A field value is outside its closed domain. */
export const FUNGI_BENCH_JSON_002 = "FUNGI-BENCH-JSON-002";
/** Consistency refuse (decode / validate mismatch). */
export const FUNGI_BENCH_JSON_003 = "FUNGI-BENCH-JSON-003";
/** Reserved nested refuse. */
export const FUNGI_BENCH_JSON_004 = "FUNGI-BENCH-JSON-004";
/** Lookup / result consistency refuse. */
export const FUNGI_BENCH_JSON_005 = "FUNGI-BENCH-JSON-005";

export const JSON_DECODE_VALIDATE_1MB_BENCHMARK_ID = "json.decode_validate_1mb";
export const JSON_DECODE_VALIDATE_1MB_BENCHMARK_TARGET = "json" as const;

/** Closed light payload size: 1 MiB (1048576 bytes), README "1MB JSON decode". */
export const JSON_1MB_BYTES = 1_048_576;

export const JSON_DECODE_VALIDATE_1MB_OPTIONS_FIELDS = Object.freeze(["operations", "maxDurationMs"] as const);

export const DEFAULT_JSON_1MB_OPERATIONS = 4;
export const MAX_JSON_1MB_OPERATIONS = 64;
export const DEFAULT_JSON_1MB_MAX_DURATION_MS = 5_000;
export const MAX_JSON_1MB_MAX_DURATION_MS = 60_000;

export type Json1mbBenchmarkDiagnosticField =
  | "record" | "operations" | "maxDurationMs" | "result" | "id" | "target";

export interface Json1mbBenchmarkDiagnostic {
  readonly code: string;
  readonly severity: "error";
  readonly message: string;
  readonly field: Json1mbBenchmarkDiagnosticField;
}

export interface Json1mbBenchmarkOptions {
  readonly operations: number;
  readonly maxDurationMs: number;
}

export interface Json1mbBenchmarkResult {
  readonly id: typeof JSON_DECODE_VALIDATE_1MB_BENCHMARK_ID;
  readonly target: typeof JSON_DECODE_VALIDATE_1MB_BENCHMARK_TARGET;
  readonly status: "passed" | "failed" | "skipped_timeout";
  readonly durationMs: number;
  readonly operations: number;
  readonly score: number;
  readonly bytes: typeof JSON_1MB_BYTES;
}

export type RunJson1mbBenchmarkResult =
  | { readonly ok: true; readonly value: Json1mbBenchmarkResult }
  | { readonly ok: false; readonly diagnostics: readonly Json1mbBenchmarkDiagnostic[] };

const diag = (
  code: string,
  message: string,
  field: Json1mbBenchmarkDiagnosticField,
): Json1mbBenchmarkDiagnostic => Object.freeze({ code, severity: "error" as const, message, field });

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
  field: Json1mbBenchmarkDiagnosticField,
  out: Json1mbBenchmarkDiagnostic[],
): number | undefined {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min || value > max) {
    out.push(diag(FUNGI_BENCH_JSON_002, "Numeric option is outside the closed domain.", field));
    return undefined;
  }
  return value;
}

function readOptions(input: unknown): { readonly ok: true; readonly value: Json1mbBenchmarkOptions } | { readonly ok: false; readonly diagnostics: readonly Json1mbBenchmarkDiagnostic[] } {
  const out: Json1mbBenchmarkDiagnostic[] = [];
  if (input === undefined) {
    return Object.freeze({
      ok: true as const,
      value: Object.freeze({
        operations: DEFAULT_JSON_1MB_OPERATIONS,
        maxDurationMs: DEFAULT_JSON_1MB_MAX_DURATION_MS,
      }),
    });
  }
  const snap = snapshotRecord(input, 8);
  if (!snap.ok) {
    out.push(diag(FUNGI_BENCH_JSON_001, "JSON 1MB benchmark options must be a plain data object.", "record"));
    return Object.freeze({ ok: false as const, diagnostics: Object.freeze(out) });
  }
  for (const key of snap.values.keys()) {
    if (key !== "operations" && key !== "maxDurationMs") {
      out.push(diag(FUNGI_BENCH_JSON_001, "Record has a key outside the closed shape.", "record"));
      return Object.freeze({ ok: false as const, diagnostics: Object.freeze(out) });
    }
  }
  const operations = snap.values.has("operations")
    ? readPositiveSafeInt(snap.values.get("operations"), 1, MAX_JSON_1MB_OPERATIONS, "operations", out)
    : DEFAULT_JSON_1MB_OPERATIONS;
  if (operations === undefined) return Object.freeze({ ok: false as const, diagnostics: Object.freeze(out) });
  const maxDurationMs = snap.values.has("maxDurationMs")
    ? readPositiveSafeInt(snap.values.get("maxDurationMs"), 1, MAX_JSON_1MB_MAX_DURATION_MS, "maxDurationMs", out)
    : DEFAULT_JSON_1MB_MAX_DURATION_MS;
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

/** Closed item field allowlist (unknown keys refuse). */
export const JSON_1MB_ITEM_FIELDS = Object.freeze(["id", "name", "score", "active", "meta"] as const);
export const JSON_1MB_META_FIELDS = Object.freeze(["tag", "n"] as const);
export const JSON_1MB_ROOT_FIELDS = Object.freeze(["schema", "count", "items"] as const);

let cachedPayload: string | undefined;
let cachedBytes: number | undefined;

/**
 * Build a deterministic JSON document whose UTF-8 byte length is exactly
 * JSON_1MB_BYTES. Cached after first successful build. Never throws.
 */
export function buildJson1mbPayload(): { readonly ok: true; readonly payload: string; readonly bytes: number } | { readonly ok: false } {
  try {
    if (cachedPayload !== undefined && cachedBytes === JSON_1MB_BYTES) {
      return Object.freeze({ ok: true as const, payload: cachedPayload, bytes: cachedBytes });
    }
    const items: string[] = [];
    let i = 0;
    // Seed with header; grow items until byte length reaches target.
    const header = '{"schema":"galerina.bench.json1mb/v1","count":';
    // We finalize count after sizing; use a two-pass approach: grow body then wrap.
    while (true) {
      const item = `{"id":${i},"name":"row_${i.toString(16).padStart(6, "0")}","score":${(i % 997) + 1},"active":${i % 2 === 0 ? "true" : "false"},"meta":{"tag":"t${i % 16}","n":${i % 64}}}`;
      items.push(item);
      // Approximate: header + count digits + items join + braces
      const approx = 80 + items.reduce((a, s) => a + s.length + 1, 0);
      if (approx >= JSON_1MB_BYTES) break;
      i += 1;
      if (i > 200_000) return { ok: false };
    }
    // Trim or pad to exact byte length.
    let body = `{"schema":"galerina.bench.json1mb/v1","count":${items.length},"items":[${items.join(",")}]}`;
    // Prefer TextEncoder for UTF-8 byte length when available.
    const byteLen = (s: string): number => {
      try {
        if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(s).length;
      } catch {
        // fall through
      }
      return s.length; // ASCII-only payload
    };
    let bytes = byteLen(body);
    if (bytes > JSON_1MB_BYTES) {
      // Remove items from the end until under, then pad.
      while (items.length > 1 && bytes > JSON_1MB_BYTES) {
        items.pop();
        body = `{"schema":"galerina.bench.json1mb/v1","count":${items.length},"items":[${items.join(",")}]}`;
        bytes = byteLen(body);
      }
    }
    if (bytes < JSON_1MB_BYTES) {
      // Pad with a trailing whitespace-free string field is shape-breaking; pad via
      // lengthening the last item name is also shape-breaking. Instead append spaces
      // is invalid inside JSON. Use a closed pad field only if we keep allowlist —
      // so pad by extending items with longer deterministic names before close.
      // Simpler: append ASCII spaces is NOT valid. Rebuild last item with longer name.
      const need = JSON_1MB_BYTES - bytes;
      if (need > 0 && items.length > 0) {
        const pad = "x".repeat(need);
        const lastIdx = items.length - 1;
        const last = items[lastIdx]!;
        // Inject pad into name value: "name":"row_......" -> extend
        const injected = last.replace(/"name":"([^"]*)"/, `"name":"$1${pad}"`);
        items[lastIdx] = injected;
        body = `{"schema":"galerina.bench.json1mb/v1","count":${items.length},"items":[${items.join(",")}]}`;
        bytes = byteLen(body);
      }
    }
    // Final exact adjust: if still short/long by a few bytes, tweak pad.
    if (bytes !== JSON_1MB_BYTES) {
      const delta = JSON_1MB_BYTES - bytes;
      if (delta > 0) {
        body = body.slice(0, -2) + "x".repeat(delta) + body.slice(-2);
        // That breaks JSON. Rebuild properly:
        const lastIdx = items.length - 1;
        const last = items[lastIdx]!;
        const injected = last.replace(/"name":"([^"]*)"/, (_m, name: string) => `"name":"${name}${"y".repeat(delta)}"`);
        items[lastIdx] = injected;
        body = `{"schema":"galerina.bench.json1mb/v1","count":${items.length},"items":[${items.join(",")}]}`;
        bytes = byteLen(body);
      } else if (delta < 0) {
        const lastIdx = items.length - 1;
        const last = items[lastIdx]!;
        const m = /"name":"([^"]*)"/.exec(last);
        if (m && m[1] !== undefined && m[1].length > -delta) {
          const shortened = m[1].slice(0, m[1].length + delta);
          items[lastIdx] = last.replace(/"name":"[^"]*"/, `"name":"${shortened}"`);
          body = `{"schema":"galerina.bench.json1mb/v1","count":${items.length},"items":[${items.join(",")}]}`;
          bytes = byteLen(body);
        }
      }
    }
    if (bytes !== JSON_1MB_BYTES) return { ok: false };
    // Sanity: must parse.
    JSON.parse(body);
    cachedPayload = body;
    cachedBytes = bytes;
    return Object.freeze({ ok: true as const, payload: body, bytes });
  } catch {
    return { ok: false };
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * Closed-shape validate after decode. Unknown fields / wrong kinds refuse.
 * Never throws.
 */
export function validateJson1mbDocument(value: unknown): boolean {
  try {
    if (!isPlainObject(value)) return false;
    const rootKeys = Reflect.ownKeys(value);
    if (rootKeys.length !== JSON_1MB_ROOT_FIELDS.length) return false;
    for (const k of rootKeys) {
      if (typeof k !== "string") return false;
      if (!(JSON_1MB_ROOT_FIELDS as readonly string[]).includes(k)) return false;
    }
    if (value.schema !== "galerina.bench.json1mb/v1") return false;
    if (typeof value.count !== "number" || !Number.isSafeInteger(value.count) || value.count < 0) return false;
    if (!Array.isArray(value.items)) return false;
    if (value.items.length !== value.count) return false;
    for (const item of value.items) {
      if (!isPlainObject(item)) return false;
      const keys = Reflect.ownKeys(item);
      if (keys.length !== JSON_1MB_ITEM_FIELDS.length) return false;
      for (const k of keys) {
        if (typeof k !== "string") return false;
        if (!(JSON_1MB_ITEM_FIELDS as readonly string[]).includes(k)) return false;
      }
      if (typeof item.id !== "number" || !Number.isSafeInteger(item.id)) return false;
      if (typeof item.name !== "string") return false;
      if (typeof item.score !== "number" || !Number.isSafeInteger(item.score)) return false;
      if (typeof item.active !== "boolean") return false;
      if (!isPlainObject(item.meta)) return false;
      const mk = Reflect.ownKeys(item.meta);
      if (mk.length !== JSON_1MB_META_FIELDS.length) return false;
      for (const k of mk) {
        if (typeof k !== "string") return false;
        if (!(JSON_1MB_META_FIELDS as readonly string[]).includes(k)) return false;
      }
      if (typeof item.meta.tag !== "string") return false;
      if (typeof item.meta.n !== "number" || !Number.isSafeInteger(item.meta.n)) return false;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Decode + validate one document. Returns false on parse/validate failure; never throws.
 */
export function decodeAndValidateJson1mb(payload: string): boolean {
  try {
    const parsed: unknown = JSON.parse(payload);
    return validateJson1mbDocument(parsed);
  } catch {
    return false;
  }
}

export function scoreJson1mbBenchmark(operations: number, durationMs: number): number {
  if (!Number.isSafeInteger(operations) || operations < 0) return 0;
  if (typeof durationMs !== "number" || !Number.isFinite(durationMs) || durationMs < 0) return 0;
  if (operations === 0) return 0;
  if (durationMs === 0) return 10_000;
  const raw = Math.floor((operations / durationMs) * 10);
  if (!Number.isSafeInteger(raw) || raw < 0) return 0;
  return raw > 10_000 ? 10_000 : raw;
}

/**
 * Run the closed JSON 1MB decode/validate microbench. Never throws.
 */
export function runJsonDecodeValidate1mbBenchmark(input?: unknown): RunJson1mbBenchmarkResult {
  try {
    const opts = readOptions(input);
    if (!opts.ok) return opts;
    const built = buildJson1mbPayload();
    if (!built.ok) {
      return Object.freeze({
        ok: false as const,
        diagnostics: Object.freeze([diag(FUNGI_BENCH_JSON_005, "JSON 1MB payload build refused.", "result")]),
      });
    }
    const { operations, maxDurationMs } = opts.value;
    const started = nowMs();
    let completed = 0;
    for (let i = 0; i < operations; i += 1) {
      if (!decodeAndValidateJson1mb(built.payload)) {
        const durationMs = Math.max(0, Math.floor(nowMs() - started));
        return Object.freeze({
          ok: true as const,
          value: Object.freeze({
            id: JSON_DECODE_VALIDATE_1MB_BENCHMARK_ID,
            target: JSON_DECODE_VALIDATE_1MB_BENCHMARK_TARGET,
            status: "failed" as const,
            durationMs: Number.isSafeInteger(durationMs) ? durationMs : 0,
            operations: completed,
            score: 0,
            bytes: JSON_1MB_BYTES,
          }),
        });
      }
      completed += 1;
      const elapsed = nowMs() - started;
      if (elapsed > maxDurationMs) {
        const durationMs = Math.max(0, Math.floor(elapsed));
        const safeDuration = Number.isSafeInteger(durationMs) ? durationMs : 0;
        return Object.freeze({
          ok: true as const,
          value: Object.freeze({
            id: JSON_DECODE_VALIDATE_1MB_BENCHMARK_ID,
            target: JSON_DECODE_VALIDATE_1MB_BENCHMARK_TARGET,
            status: "skipped_timeout" as const,
            durationMs: safeDuration,
            operations: completed,
            score: scoreJson1mbBenchmark(completed, safeDuration),
            bytes: JSON_1MB_BYTES,
          }),
        });
      }
    }
    const durationMs = Math.max(0, Math.floor(nowMs() - started));
    const safeDuration = Number.isSafeInteger(durationMs) ? durationMs : 0;
    return Object.freeze({
      ok: true as const,
      value: Object.freeze({
        id: JSON_DECODE_VALIDATE_1MB_BENCHMARK_ID,
        target: JSON_DECODE_VALIDATE_1MB_BENCHMARK_TARGET,
        status: "passed" as const,
        durationMs: safeDuration,
        operations: completed,
        score: scoreJson1mbBenchmark(completed, safeDuration),
        bytes: JSON_1MB_BYTES,
      }),
    });
  } catch {
    return Object.freeze({
      ok: false as const,
      diagnostics: Object.freeze([diag(FUNGI_BENCH_JSON_005, "JSON 1MB benchmark refused after an unexpected failure.", "result")]),
    });
  }
}

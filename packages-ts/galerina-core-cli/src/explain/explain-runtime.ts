// Closed-shape runtime-profile explain (TODO pass, Grok 2026-10-05; zero-trust defaults, owner may revisit).
//
// Reads a declared ExplainRuntimeProfile JSON object and emits boundary /
// effect / capability traces. Does NOT probe a live runtime, host, or process.
// Never throws. Never echoes refused values / paths / keys.
//
// Codes: FUNGI-EXPLAIN-009 shape/schema, FUNGI-EXPLAIN-010 domain (token /
// target / memory).

import {
  FUNGI_EXPLAIN_004,
  createExplainResult,
  type ExplainDiagnostic,
  type ExplainDiagnosticField,
  type ExplainResult,
  type ExplainTrace,
} from "./explain-trace.js";

/** Runtime-profile record is not a closed data object / wrong schema / missing fields. */
export const FUNGI_EXPLAIN_009 = "FUNGI-EXPLAIN-009";
/** Runtime-profile domain refuse (token / target / memoryMb). */
export const FUNGI_EXPLAIN_010 = "FUNGI-EXPLAIN-010";

export const EXPLAIN_RUNTIME_PROFILE_SCHEMA = "galerina.explain-runtime/v1";

export const EXPLAIN_RUNTIME_TARGETS = Object.freeze([
  "node",
  "browser",
  "edge",
  "wasm",
  "worker",
] as const);

export type ExplainRuntimeTarget = (typeof EXPLAIN_RUNTIME_TARGETS)[number];

export const EXPLAIN_RUNTIME_PROFILE_FIELDS = Object.freeze([
  "schema",
  "profile",
  "target",
  "effects",
  "capabilities",
  "memoryMb",
] as const);

export interface ExplainRuntimeProfile {
  readonly schema: typeof EXPLAIN_RUNTIME_PROFILE_SCHEMA;
  readonly profile: string;
  readonly target: ExplainRuntimeTarget;
  readonly effects: readonly string[];
  readonly capabilities: readonly string[];
  readonly memoryMb?: number;
}

const TOKEN = /^[a-z][A-Za-z0-9_]*(?:\.[a-z][A-Za-z0-9_]*)*$/;
const MAX_TOKEN = 128;
const MAX_LIST = 4096;
const MAX_TRACES = 8192;
const MAX_MEMORY_MB = 1_048_576;
const TARGET_SET = new Set<string>(EXPLAIN_RUNTIME_TARGETS);
const REQUIRED = Object.freeze(["schema", "profile", "target", "effects", "capabilities"] as const);
const OPTIONAL = Object.freeze(["memoryMb"] as const);
const KNOWN = new Set<string>([...REQUIRED, ...OPTIONAL]);

const diag = (code: string, message: string, field: ExplainDiagnosticField): ExplainDiagnostic =>
  Object.freeze({ code, severity: "error" as const, message, field });

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

function snapshotArray(value: unknown, max: number): readonly unknown[] | undefined {
  try {
    if (!Array.isArray(value)) return undefined;
    if (value.length > max) return undefined;
    for (let i = 0; i < value.length; i += 1) {
      const d = Object.getOwnPropertyDescriptor(value, String(i));
      if (d === undefined || !("value" in d) || d.get !== undefined || d.set !== undefined) return undefined;
    }
    return value as readonly unknown[];
  } catch {
    return undefined;
  }
}

function strictlyAscending(items: readonly string[]): boolean {
  for (let i = 1; i < items.length; i += 1) {
    if (items[i]! <= items[i - 1]!) return false;
  }
  return true;
}

function readToken(
  value: unknown,
  field: ExplainDiagnosticField,
  out: ExplainDiagnostic[],
): string | undefined {
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_TOKEN || !TOKEN.test(value)) {
    out.push(diag(FUNGI_EXPLAIN_010, "Runtime token is outside the closed domain.", field));
    return undefined;
  }
  return value;
}

function readTokenList(
  value: unknown,
  field: ExplainDiagnosticField,
  out: ExplainDiagnostic[],
): readonly string[] | undefined {
  const items = snapshotArray(value, MAX_LIST);
  if (items === undefined) {
    out.push(diag(FUNGI_EXPLAIN_009, "Token list must be a dense array within bounds.", field));
    return undefined;
  }
  const strings: string[] = [];
  for (const item of items) {
    if (typeof item !== "string" || item.length === 0 || item.length > MAX_TOKEN || !TOKEN.test(item)) {
      out.push(diag(FUNGI_EXPLAIN_010, "Runtime token is outside the closed domain.", field));
      return undefined;
    }
    strings.push(item);
  }
  if (!strictlyAscending(strings)) {
    out.push(diag(FUNGI_EXPLAIN_010, "Token list must be strictly ascending with no duplicates.", field));
    return undefined;
  }
  return Object.freeze(strings);
}

/** True when value is one of the closed ExplainRuntimeTarget tokens. */
export function isExplainRuntimeTarget(value: unknown): value is ExplainRuntimeTarget {
  return typeof value === "string" && TARGET_SET.has(value);
}

/**
 * Read a closed-shape ExplainRuntimeProfile. Never throws; never echoes values.
 */
export function readExplainRuntimeProfile(
  value: unknown,
):
  | { readonly ok: true; readonly value: ExplainRuntimeProfile }
  | { readonly ok: false; readonly diagnostics: readonly ExplainDiagnostic[] } {
  const out: ExplainDiagnostic[] = [];
  const snap = snapshotRecord(value, EXPLAIN_RUNTIME_PROFILE_FIELDS.length + 8);
  if (!snap.ok) {
    out.push(diag(FUNGI_EXPLAIN_009, "ExplainRuntimeProfile must be a plain data object.", "record"));
    return { ok: false, diagnostics: Object.freeze(out) };
  }
  for (const key of snap.values.keys()) {
    if (!KNOWN.has(key)) {
      out.push(diag(FUNGI_EXPLAIN_009, "ExplainRuntimeProfile has an unknown key.", "record"));
      return { ok: false, diagnostics: Object.freeze(out) };
    }
  }
  for (const req of REQUIRED) {
    if (!snap.values.has(req)) {
      out.push(diag(FUNGI_EXPLAIN_009, "ExplainRuntimeProfile is missing a required field.", "record"));
      return { ok: false, diagnostics: Object.freeze(out) };
    }
  }
  if (snap.values.get("schema") !== EXPLAIN_RUNTIME_PROFILE_SCHEMA) {
    out.push(diag(FUNGI_EXPLAIN_009, "ExplainRuntimeProfile schema is not admitted.", "record"));
    return { ok: false, diagnostics: Object.freeze(out) };
  }
  const profile = readToken(snap.values.get("profile"), "input", out);
  if (profile === undefined) return { ok: false, diagnostics: Object.freeze(out) };
  const targetRaw = snap.values.get("target");
  if (!isExplainRuntimeTarget(targetRaw)) {
    out.push(diag(FUNGI_EXPLAIN_010, "Runtime target is outside the closed domain.", "output"));
    return { ok: false, diagnostics: Object.freeze(out) };
  }
  const effects = readTokenList(snap.values.get("effects"), "effects", out);
  if (effects === undefined) return { ok: false, diagnostics: Object.freeze(out) };
  const capabilities = readTokenList(snap.values.get("capabilities"), "capabilities", out);
  if (capabilities === undefined) return { ok: false, diagnostics: Object.freeze(out) };

  let memoryMb: number | undefined;
  if (snap.values.has("memoryMb")) {
    const m = snap.values.get("memoryMb");
    if (
      typeof m !== "number" ||
      !Number.isInteger(m) ||
      m <= 0 ||
      m > MAX_MEMORY_MB ||
      Object.is(m, -0)
    ) {
      out.push(diag(FUNGI_EXPLAIN_010, "memoryMb is outside the closed domain.", "record"));
      return { ok: false, diagnostics: Object.freeze(out) };
    }
    memoryMb = m;
  }

  return {
    ok: true,
    value: Object.freeze({
      schema: EXPLAIN_RUNTIME_PROFILE_SCHEMA,
      profile,
      target: targetRaw,
      effects,
      capabilities,
      ...(memoryMb !== undefined ? { memoryMb } : {}),
    }),
  };
}

/**
 * Explain a closed runtime profile as boundary/effect/capability traces.
 * Never throws. Does not probe a live runtime. On refuse returns empty traces.
 */
export function explainRuntimeProfile(value: unknown): ExplainResult {
  const read = readExplainRuntimeProfile(value);
  if (!read.ok) {
    return createExplainResult([], [], [], [], read.diagnostics);
  }
  const p = read.value;
  const traces: ExplainTrace[] = [];
  let step = 0;
  traces.push(
    Object.freeze({
      step: step++,
      label: "boundary" as const,
      input: "runtime.profile",
      output: p.profile,
      diagnostics: Object.freeze([]),
    }),
  );
  traces.push(
    Object.freeze({
      step: step++,
      label: "boundary" as const,
      input: "runtime.target",
      output: p.target,
      diagnostics: Object.freeze([]),
    }),
  );
  for (const token of p.effects) {
    traces.push(
      Object.freeze({
        step: step++,
        label: "effect" as const,
        input: "runtime.effects",
        output: token,
        diagnostics: Object.freeze([]),
      }),
    );
  }
  for (const token of p.capabilities) {
    traces.push(
      Object.freeze({
        step: step++,
        label: "capability" as const,
        input: "runtime.capabilities",
        output: token,
        diagnostics: Object.freeze([]),
      }),
    );
  }
  if (p.memoryMb !== undefined) {
    // Represent memory as a boundary facet with a closed synthetic token.
    // Numeric value is never echoed into output; only the presence of the bound.
    traces.push(
      Object.freeze({
        step: step++,
        label: "boundary" as const,
        input: "runtime.memoryMb",
        output: "memory.bound",
        diagnostics: Object.freeze([]),
      }),
    );
  }
  if (traces.length > MAX_TRACES) {
    return createExplainResult(
      [],
      [],
      [],
      [],
      [diag(FUNGI_EXPLAIN_004, "Trace count exceeds the closed upper bound.", "traces")],
    );
  }
  const bounds =
    p.profile === p.target
      ? Object.freeze([p.profile])
      : Object.freeze([p.profile, p.target].sort());
  return createExplainResult(traces, p.effects, p.capabilities, bounds, []);
}


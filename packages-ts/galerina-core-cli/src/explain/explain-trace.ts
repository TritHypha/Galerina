// Explain contracts (TODO pass, Grok 2026-10-05; zero-trust defaults, owner may revisit).
//
// Closed-shape ExplainTrace / ExplainResult / ExplainManifestSlice / ExplainOptions
// and buildTrace(). No CLI wiring, no filesystem denial-report reader, no package
// dependency on galerina-core-reports / compiler.
//
// Zero-trust rules:
//  - Closed shapes via property descriptors (no getters run; symbols / accessors /
//    custom prototypes refuse). Unknown keys refuse without echoing the key.
//  - Trace label is an exact closed vocabulary (package TODO facets).
//  - input/output tokens are dotted lower-camel identifiers, strictly bounded.
//  - Diagnostic messages never echo tokens, labels, keys, paths or unknown values.
//
// Not covered: explain-command wiring, explain-report.json writer, denial reasoning
// from deployment-denial.json, dependency-tree walk, or live runtime probes.

/** Record / input is not a closed data object. */
export const FUNGI_EXPLAIN_001 = "FUNGI-EXPLAIN-001";
/** A field value is outside its closed domain. */
export const FUNGI_EXPLAIN_002 = "FUNGI-EXPLAIN-002";
/** Options refuse (unknown facet / inconsistent include flags). */
export const FUNGI_EXPLAIN_003 = "FUNGI-EXPLAIN-003";
/** Result consistency refuse (step order / list alignment / success mismatch). */
export const FUNGI_EXPLAIN_004 = "FUNGI-EXPLAIN-004";

export const EXPLAIN_TRACE_LABELS = Object.freeze([
  "import",
  "effect",
  "capability",
  "boundary",
  "dependency",
  "denial",
] as const);

export type ExplainTraceLabel = (typeof EXPLAIN_TRACE_LABELS)[number];

export const EXPLAIN_TRACE_FIELDS = Object.freeze([
  "step",
  "label",
  "input",
  "output",
  "diagnostics",
] as const);

export const EXPLAIN_RESULT_FIELDS = Object.freeze([
  "traces",
  "effects",
  "capabilities",
  "boundaries",
  "diagnostics",
] as const);

export const EXPLAIN_MANIFEST_SLICE_FIELDS = Object.freeze([
  "effects",
  "capabilities",
  "boundaries",
  "imports",
] as const);

export const EXPLAIN_OPTIONS_FIELDS = Object.freeze([
  "includeEffects",
  "includeCapabilities",
  "includeBoundaries",
  "includeImports",
] as const);

export type ExplainDiagnosticField =
  | "record"
  | "input"
  | "manifest"
  | "options"
  | "step"
  | "label"
  | "output"
  | "diagnostics"
  | "traces"
  | "effects"
  | "capabilities"
  | "boundaries"
  | "imports"
  | "includeEffects"
  | "includeCapabilities"
  | "includeBoundaries"
  | "includeImports";

export interface ExplainDiagnostic {
  readonly code: string;
  readonly severity: "error";
  readonly message: string;
  readonly field: ExplainDiagnosticField;
}

export interface ExplainTrace {
  readonly step: number;
  readonly label: ExplainTraceLabel;
  readonly input: string;
  readonly output: string;
  readonly diagnostics: readonly ExplainDiagnostic[];
}

export interface ExplainManifestSlice {
  readonly effects: readonly string[];
  readonly capabilities: readonly string[];
  readonly boundaries: readonly string[];
  readonly imports: readonly string[];
}

export interface ExplainOptions {
  readonly includeEffects: boolean;
  readonly includeCapabilities: boolean;
  readonly includeBoundaries: boolean;
  readonly includeImports: boolean;
}

export interface ExplainResult {
  readonly traces: readonly ExplainTrace[];
  readonly effects: readonly string[];
  readonly capabilities: readonly string[];
  readonly boundaries: readonly string[];
  readonly diagnostics: readonly ExplainDiagnostic[];
}

const TOKEN = /^[a-z][A-Za-z0-9_]*(?:\.[a-z][A-Za-z0-9_]*)*$/;
const MAX_TOKEN = 128;
const MAX_LIST = 4096;
const MAX_TRACES = 8192;
const LABEL_SET = new Set<string>(EXPLAIN_TRACE_LABELS);

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
    const length: unknown = Object.getOwnPropertyDescriptor(value, "length")?.value;
    if (typeof length !== "number" || !Number.isSafeInteger(length) || length < 0 || length > max) return undefined;
    const keys = Reflect.ownKeys(value);
    if (keys.length !== length + 1) return undefined;
    const out: unknown[] = [];
    for (let i = 0; i < length; i += 1) {
      const d = Object.getOwnPropertyDescriptor(value, String(i));
      if (d === undefined || !("value" in d) || d.get !== undefined || d.set !== undefined) return undefined;
      out.push(d.value);
    }
    return out;
  } catch {
    return undefined;
  }
}

function strictlyAscending(xs: readonly string[]): boolean {
  return xs.every((x, i) => i === 0 || (xs[i - 1] as string) < x);
}

/** True when value is one of the closed ExplainTraceLabel tokens (exact string match). */
export function isExplainTraceLabel(value: unknown): value is ExplainTraceLabel {
  return typeof value === "string" && LABEL_SET.has(value);
}

function readTokenList(
  value: unknown,
  field: ExplainDiagnosticField,
  out: ExplainDiagnostic[],
): readonly string[] | undefined {
  const items = snapshotArray(value, MAX_LIST);
  if (items === undefined) {
    out.push(diag(FUNGI_EXPLAIN_001, "Token list must be a dense array within bounds.", field));
    return undefined;
  }
  const strings: string[] = [];
  for (const item of items) {
    if (typeof item !== "string" || item.length === 0 || item.length > MAX_TOKEN || !TOKEN.test(item)) {
      out.push(diag(FUNGI_EXPLAIN_002, "Token is outside the closed domain.", field));
      return undefined;
    }
    strings.push(item);
  }
  if (!strictlyAscending(strings)) {
    out.push(diag(FUNGI_EXPLAIN_002, "Token list must be strictly ascending with no duplicates.", field));
    return undefined;
  }
  return Object.freeze(strings);
}

function readBoolean(
  value: unknown,
  field: ExplainDiagnosticField,
  out: ExplainDiagnostic[],
): boolean | undefined {
  if (value !== true && value !== false) {
    out.push(diag(FUNGI_EXPLAIN_002, "Flag must be a boolean.", field));
    return undefined;
  }
  return value;
}

function readManifestSlice(value: unknown, out: ExplainDiagnostic[]): ExplainManifestSlice | undefined {
  const snap = snapshotRecord(value, EXPLAIN_MANIFEST_SLICE_FIELDS.length + 8);
  if (!snap.ok) {
    out.push(diag(FUNGI_EXPLAIN_001, "Explain manifest slice must be a plain data object.", "manifest"));
    return undefined;
  }
  const known = new Set<string>(EXPLAIN_MANIFEST_SLICE_FIELDS);
  if ([...snap.values.keys()].some((k) => !known.has(k))) {
    out.push(diag(FUNGI_EXPLAIN_001, "Explain manifest slice has a key outside the closed shape.", "manifest"));
    return undefined;
  }
  for (const field of EXPLAIN_MANIFEST_SLICE_FIELDS) {
    if (!snap.values.has(field)) {
      out.push(diag(FUNGI_EXPLAIN_001, "Explain manifest slice is missing a required field.", field as ExplainDiagnosticField));
      return undefined;
    }
  }
  const effects = readTokenList(snap.values.get("effects"), "effects", out);
  if (effects === undefined) return undefined;
  const capabilities = readTokenList(snap.values.get("capabilities"), "capabilities", out);
  if (capabilities === undefined) return undefined;
  const boundaries = readTokenList(snap.values.get("boundaries"), "boundaries", out);
  if (boundaries === undefined) return undefined;
  const imports = readTokenList(snap.values.get("imports"), "imports", out);
  if (imports === undefined) return undefined;
  return Object.freeze({ effects, capabilities, boundaries, imports });
}

function readOptions(value: unknown, out: ExplainDiagnostic[]): ExplainOptions | undefined {
  const snap = snapshotRecord(value, EXPLAIN_OPTIONS_FIELDS.length + 8);
  if (!snap.ok) {
    out.push(diag(FUNGI_EXPLAIN_001, "Explain options must be a plain data object.", "options"));
    return undefined;
  }
  const known = new Set<string>(EXPLAIN_OPTIONS_FIELDS);
  if ([...snap.values.keys()].some((k) => !known.has(k))) {
    out.push(diag(FUNGI_EXPLAIN_001, "Explain options has a key outside the closed shape.", "options"));
    return undefined;
  }
  for (const field of EXPLAIN_OPTIONS_FIELDS) {
    if (!snap.values.has(field)) {
      out.push(diag(FUNGI_EXPLAIN_001, "Explain options is missing a required field.", field as ExplainDiagnosticField));
      return undefined;
    }
  }
  const includeEffects = readBoolean(snap.values.get("includeEffects"), "includeEffects", out);
  if (includeEffects === undefined) return undefined;
  const includeCapabilities = readBoolean(snap.values.get("includeCapabilities"), "includeCapabilities", out);
  if (includeCapabilities === undefined) return undefined;
  const includeBoundaries = readBoolean(snap.values.get("includeBoundaries"), "includeBoundaries", out);
  if (includeBoundaries === undefined) return undefined;
  const includeImports = readBoolean(snap.values.get("includeImports"), "includeImports", out);
  if (includeImports === undefined) return undefined;
  if (
    includeEffects !== true &&
    includeCapabilities !== true &&
    includeBoundaries !== true &&
    includeImports !== true
  ) {
    out.push(diag(FUNGI_EXPLAIN_003, "At least one include facet must be true.", "options"));
    return undefined;
  }
  return Object.freeze({ includeEffects, includeCapabilities, includeBoundaries, includeImports });
}

function snapshotDiagnosticEntries(
  value: unknown,
): readonly ExplainDiagnostic[] | undefined {
  const items = snapshotArray(value, MAX_LIST);
  if (items === undefined) return undefined;
  const list: ExplainDiagnostic[] = [];
  for (const item of items) {
    const snap = snapshotRecord(item, 8);
    if (!snap.ok) return undefined;
    if (
      snap.values.size !== 4 ||
      !snap.values.has("code") ||
      !snap.values.has("severity") ||
      !snap.values.has("message") ||
      !snap.values.has("field")
    ) {
      return undefined;
    }
    const code = snap.values.get("code");
    const severity = snap.values.get("severity");
    const message = snap.values.get("message");
    const field = snap.values.get("field");
    if (typeof code !== "string" || code.length === 0 || code.length > MAX_TOKEN) return undefined;
    if (severity !== "error") return undefined;
    if (typeof message !== "string" || message.length === 0 || message.length > 512) return undefined;
    if (typeof field !== "string" || field.length === 0 || field.length > MAX_TOKEN) return undefined;
    list.push(Object.freeze({ code, severity: "error" as const, message, field: field as ExplainDiagnosticField }));
  }
  return Object.freeze(list);
}

function readDiagnosticsList(value: unknown, out: ExplainDiagnostic[]): readonly ExplainDiagnostic[] | undefined {
  const snapped = snapshotDiagnosticEntries(value);
  if (snapped === undefined) {
    out.push(diag(FUNGI_EXPLAIN_001, "Diagnostics must be a dense array of closed entries.", "diagnostics"));
    return undefined;
  }
  return snapped;
}

function readTrace(value: unknown, out: ExplainDiagnostic[]): ExplainTrace | undefined {
  const snap = snapshotRecord(value, EXPLAIN_TRACE_FIELDS.length + 8);
  if (!snap.ok) {
    out.push(diag(FUNGI_EXPLAIN_001, "ExplainTrace must be a plain data object.", "traces"));
    return undefined;
  }
  const known = new Set<string>(EXPLAIN_TRACE_FIELDS);
  if ([...snap.values.keys()].some((k) => !known.has(k))) {
    out.push(diag(FUNGI_EXPLAIN_001, "ExplainTrace has a key outside the closed shape.", "traces"));
    return undefined;
  }
  for (const field of EXPLAIN_TRACE_FIELDS) {
    if (!snap.values.has(field)) {
      out.push(diag(FUNGI_EXPLAIN_001, "ExplainTrace is missing a required field.", field as ExplainDiagnosticField));
      return undefined;
    }
  }
  const step = snap.values.get("step");
  if (typeof step !== "number" || !Number.isSafeInteger(step) || step < 0 || step > MAX_TRACES) {
    out.push(diag(FUNGI_EXPLAIN_002, "step must be a non-negative safe integer within bounds.", "step"));
    return undefined;
  }
  const label = snap.values.get("label");
  if (!isExplainTraceLabel(label)) {
    out.push(diag(FUNGI_EXPLAIN_002, "label is outside the closed vocabulary.", "label"));
    return undefined;
  }
  const input = snap.values.get("input");
  if (typeof input !== "string" || input.length === 0 || input.length > MAX_TOKEN || !TOKEN.test(input)) {
    out.push(diag(FUNGI_EXPLAIN_002, "input token is outside the closed domain.", "input"));
    return undefined;
  }
  const output = snap.values.get("output");
  if (typeof output !== "string" || output.length === 0 || output.length > MAX_TOKEN || !TOKEN.test(output)) {
    out.push(diag(FUNGI_EXPLAIN_002, "output token is outside the closed domain.", "output"));
    return undefined;
  }
  const diagnostics = readDiagnosticsList(snap.values.get("diagnostics"), out);
  if (diagnostics === undefined) return undefined;
  return Object.freeze({ step, label, input, output, diagnostics });
}

/**
 * Read a closed-shape ExplainResult. Never throws; never echoes values.
 * FUNGI-EXPLAIN-004 when steps are not strictly ascending from 0 contiguous,
 * or when effects/capabilities/boundaries lists are not strictly ascending.
 */
export function readExplainResult(
  value: unknown,
): { readonly ok: true; readonly value: ExplainResult } | { readonly ok: false; readonly diagnostics: readonly ExplainDiagnostic[] } {
  const out: ExplainDiagnostic[] = [];
  const snap = snapshotRecord(value, EXPLAIN_RESULT_FIELDS.length + 8);
  if (!snap.ok) {
    out.push(diag(FUNGI_EXPLAIN_001, "ExplainResult must be a plain data object.", "record"));
    return { ok: false, diagnostics: Object.freeze(out) };
  }
  const known = new Set<string>(EXPLAIN_RESULT_FIELDS);
  if ([...snap.values.keys()].some((k) => !known.has(k))) {
    out.push(diag(FUNGI_EXPLAIN_001, "ExplainResult has a key outside the closed shape.", "record"));
    return { ok: false, diagnostics: Object.freeze(out) };
  }
  for (const field of EXPLAIN_RESULT_FIELDS) {
    if (!snap.values.has(field)) {
      out.push(diag(FUNGI_EXPLAIN_001, "ExplainResult is missing a required field.", field as ExplainDiagnosticField));
      return { ok: false, diagnostics: Object.freeze(out) };
    }
  }

  const traceItems = snapshotArray(snap.values.get("traces"), MAX_TRACES);
  if (traceItems === undefined) {
    out.push(diag(FUNGI_EXPLAIN_001, "traces must be a dense array within bounds.", "traces"));
    return { ok: false, diagnostics: Object.freeze(out) };
  }
  const traces: ExplainTrace[] = [];
  for (const item of traceItems) {
    const t = readTrace(item, out);
    if (t === undefined) return { ok: false, diagnostics: Object.freeze(out) };
    traces.push(t);
  }
  for (let i = 0; i < traces.length; i += 1) {
    if ((traces[i] as ExplainTrace).step !== i) {
      out.push(diag(FUNGI_EXPLAIN_004, "Trace steps must be contiguous ascending integers from zero.", "step"));
      return { ok: false, diagnostics: Object.freeze(out) };
    }
  }

  const effects = readTokenList(snap.values.get("effects"), "effects", out);
  if (effects === undefined) return { ok: false, diagnostics: Object.freeze(out) };
  const capabilities = readTokenList(snap.values.get("capabilities"), "capabilities", out);
  if (capabilities === undefined) return { ok: false, diagnostics: Object.freeze(out) };
  const boundaries = readTokenList(snap.values.get("boundaries"), "boundaries", out);
  if (boundaries === undefined) return { ok: false, diagnostics: Object.freeze(out) };
  const diagnostics = readDiagnosticsList(snap.values.get("diagnostics"), out);
  if (diagnostics === undefined) return { ok: false, diagnostics: Object.freeze(out) };

  return {
    ok: true,
    value: Object.freeze({
      traces: Object.freeze(traces),
      effects,
      capabilities,
      boundaries,
      diagnostics,
    }),
  };
}

/** Build a frozen ExplainResult from parts. Diagnostics entries are snapshotted. */
export function createExplainResult(
  traces: readonly ExplainTrace[],
  effects: readonly string[],
  capabilities: readonly string[],
  boundaries: readonly string[],
  diagnostics: readonly ExplainDiagnostic[],
): ExplainResult {
  const out: ExplainDiagnostic[] = [];
  const traceItems = snapshotArray(traces as unknown as unknown[], MAX_TRACES);
  if (traceItems === undefined) {
    return Object.freeze({
      traces: Object.freeze([]),
      effects: Object.freeze([]),
      capabilities: Object.freeze([]),
      boundaries: Object.freeze([]),
      diagnostics: Object.freeze([diag(FUNGI_EXPLAIN_001, "traces must be a dense array within bounds.", "traces")]),
    });
  }
  const frozenTraces: ExplainTrace[] = [];
  for (let i = 0; i < traceItems.length; i += 1) {
    const t = readTrace(traceItems[i], out);
    if (t === undefined) {
      return Object.freeze({
        traces: Object.freeze([]),
        effects: Object.freeze([]),
        capabilities: Object.freeze([]),
        boundaries: Object.freeze([]),
        diagnostics: Object.freeze(out.length > 0 ? out : [diag(FUNGI_EXPLAIN_001, "ExplainTrace refused.", "traces")]),
      });
    }
    if (t.step !== i) {
      return Object.freeze({
        traces: Object.freeze([]),
        effects: Object.freeze([]),
        capabilities: Object.freeze([]),
        boundaries: Object.freeze([]),
        diagnostics: Object.freeze([
          diag(FUNGI_EXPLAIN_004, "Trace steps must be contiguous ascending integers from zero.", "step"),
        ]),
      });
    }
    frozenTraces.push(t);
  }
  const eff = readTokenList(effects as unknown as unknown[], "effects", out);
  if (eff === undefined) {
    return Object.freeze({
      traces: Object.freeze([]),
      effects: Object.freeze([]),
      capabilities: Object.freeze([]),
      boundaries: Object.freeze([]),
      diagnostics: Object.freeze(out),
    });
  }
  const caps = readTokenList(capabilities as unknown as unknown[], "capabilities", out);
  if (caps === undefined) {
    return Object.freeze({
      traces: Object.freeze([]),
      effects: Object.freeze([]),
      capabilities: Object.freeze([]),
      boundaries: Object.freeze([]),
      diagnostics: Object.freeze(out),
    });
  }
  const bounds = readTokenList(boundaries as unknown as unknown[], "boundaries", out);
  if (bounds === undefined) {
    return Object.freeze({
      traces: Object.freeze([]),
      effects: Object.freeze([]),
      capabilities: Object.freeze([]),
      boundaries: Object.freeze([]),
      diagnostics: Object.freeze(out),
    });
  }
  const snapped = snapshotDiagnosticEntries(diagnostics);
  const list =
    snapped !== undefined
      ? snapped
      : Object.freeze([diag(FUNGI_EXPLAIN_001, "Diagnostics must be a dense array of closed entries.", "diagnostics")]);
  return Object.freeze({
    traces: Object.freeze(frozenTraces),
    effects: eff,
    capabilities: caps,
    boundaries: bounds,
    diagnostics: list,
  });
}

function pushTrace(
  traces: ExplainTrace[],
  label: ExplainTraceLabel,
  input: string,
  output: string,
): void {
  traces.push(
    Object.freeze({
      step: traces.length,
      label,
      input,
      output,
      diagnostics: Object.freeze([]),
    }),
  );
}

/**
 * Build explain traces from a closed manifest slice + options.
 * Never throws. Never echoes refused values in diagnostics.
 * On shape/domain/options refuse returns []. Callers that need diagnostics
 * should use explainManifest (returns ExplainResult).
 */
export function buildTrace(manifest: unknown, options: unknown): readonly ExplainTrace[] {
  const result = explainManifest(manifest, options);
  if (result.diagnostics.length > 0) return Object.freeze([]);
  return result.traces;
}

/**
 * Closed-shape explain of a manifest slice under options.
 * Never throws. Never echoes tokens/keys in diagnostic messages.
 */
export function explainManifest(manifest: unknown, options: unknown): ExplainResult {
  const out: ExplainDiagnostic[] = [];
  const slice = readManifestSlice(manifest, out);
  if (slice === undefined) {
    return Object.freeze({
      traces: Object.freeze([]),
      effects: Object.freeze([]),
      capabilities: Object.freeze([]),
      boundaries: Object.freeze([]),
      diagnostics: Object.freeze(out),
    });
  }
  const opts = readOptions(options, out);
  if (opts === undefined) {
    return Object.freeze({
      traces: Object.freeze([]),
      effects: Object.freeze([]),
      capabilities: Object.freeze([]),
      boundaries: Object.freeze([]),
      diagnostics: Object.freeze(out),
    });
  }

  const traces: ExplainTrace[] = [];
  if (opts.includeImports === true) {
    for (const token of slice.imports) {
      pushTrace(traces, "import", "manifest.imports", token);
    }
  }
  if (opts.includeEffects === true) {
    for (const token of slice.effects) {
      pushTrace(traces, "effect", "manifest.effects", token);
    }
  }
  if (opts.includeCapabilities === true) {
    for (const token of slice.capabilities) {
      pushTrace(traces, "capability", "manifest.capabilities", token);
    }
  }
  if (opts.includeBoundaries === true) {
    for (const token of slice.boundaries) {
      pushTrace(traces, "boundary", "manifest.boundaries", token);
    }
  }
  if (traces.length > MAX_TRACES) {
    return Object.freeze({
      traces: Object.freeze([]),
      effects: Object.freeze([]),
      capabilities: Object.freeze([]),
      boundaries: Object.freeze([]),
      diagnostics: Object.freeze([
        diag(FUNGI_EXPLAIN_004, "Trace count exceeds the closed upper bound.", "traces"),
      ]),
    });
  }

  const effects = opts.includeEffects === true ? slice.effects : Object.freeze([]);
  const capabilities = opts.includeCapabilities === true ? slice.capabilities : Object.freeze([]);
  const boundaries = opts.includeBoundaries === true ? slice.boundaries : Object.freeze([]);

  return Object.freeze({
    traces: Object.freeze(traces),
    effects,
    capabilities,
    boundaries,
    diagnostics: Object.freeze([]),
  });
}

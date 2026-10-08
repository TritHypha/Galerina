// Plan contracts (TODO pass, Grok 2026-10-05; zero-trust defaults, owner may revisit).
//
// Closed-shape ComputePlan / PlanGpuPlan / PlanOpticalPlan / PlanCompatibility /
// PlanWorkspaceInput / PlanOptions and estimateTarget(). No CLI wiring, no
// compute-plan.json writer, no package dependency on galerina-core-compute.
//
// Zero-trust rules:
//  - Closed shapes via property descriptors (no getters run; symbols / accessors /
//    custom prototypes refuse). Unknown keys refuse without echoing the key.
//  - Target / suitability / optical tokens are exact closed vocabularies.
//  - Diagnostic messages never echo tokens, labels, keys, paths or unknown values.
//  - Numbers are finite, non-negative, safe integers within bounds (no NaN/Infinity).
//
// Not covered: plan-command wiring, plan-reporter / compute-plan.json, plan-graph,
// plan-runtime / plan-memory live probes, or --energy/--graph CLI flags.

/** Record / input is not a closed data object. */
export const FUNGI_PLAN_001 = "FUNGI-PLAN-001";
/** A field value is outside its closed domain. */
export const FUNGI_PLAN_002 = "FUNGI-PLAN-002";
/** Options refuse (no include facet / inconsistent target request). */
export const FUNGI_PLAN_003 = "FUNGI-PLAN-003";
/** Result consistency refuse (nested diagnostics / numeric bounds / v1 freeze). */
export const FUNGI_PLAN_004 = "FUNGI-PLAN-004";

export const PLAN_RUNTIME_TARGETS = Object.freeze([
  "node",
  "wasm",
  "native",
  "serverless",
  "edge",
  "gpu",
  "photonic",
] as const);

export type PlanRuntimeTarget = (typeof PLAN_RUNTIME_TARGETS)[number];

export const PLAN_GPU_SUITABILITIES = Object.freeze([
  "high",
  "medium",
  "low",
  "unsuitable",
  "unknown",
] as const);

export type PlanGpuSuitability = (typeof PLAN_GPU_SUITABILITIES)[number];

export const PLAN_OPTICAL_NEEDS = Object.freeze([
  "none",
  "data_movement",
  "topology_aware",
  "high_bandwidth",
  "unknown",
] as const);

export type PlanOpticalNeed = (typeof PLAN_OPTICAL_NEEDS)[number];

export const PLAN_OPTICAL_MODES = Object.freeze([
  "none",
  "optical_io_awareness",
  "photonic_planning_only",
] as const);

export type PlanOpticalMode = (typeof PLAN_OPTICAL_MODES)[number];

export const PLAN_OPTICAL_FALLBACK_TARGETS = Object.freeze([
  "network_io",
  "cpu",
  "cluster_runtime",
] as const);

export type PlanOpticalFallbackTarget = (typeof PLAN_OPTICAL_FALLBACK_TARGETS)[number];

/** Only admitted non-null wasm token under v0 contracts. */
export const PLAN_WASM_TARGETS = Object.freeze(["wasm"] as const);
export type PlanWasmTarget = (typeof PLAN_WASM_TARGETS)[number];

export const PLAN_GPU_SCHEMA = "galerina.plan.gpu/v1";
export const PLAN_OPTICAL_SCHEMA = "galerina.plan.optical/v1";
export const PLAN_COMPAT_SCHEMA = "galerina.plan.compatibility/v1";

export const COMPUTE_PLAN_FIELDS = Object.freeze([
  "target",
  "gpu",
  "optical",
  "wasm",
  "compatibility",
  "estimatedMemoryMb",
  "parallelism",
  "diagnostics",
] as const);

export const PLAN_GPU_FIELDS = Object.freeze([
  "schema",
  "suitability",
  "recommendedTarget",
  "diagnostics",
] as const);

export const PLAN_OPTICAL_FIELDS = Object.freeze([
  "schema",
  "need",
  "recommendedMode",
  "fallbackTarget",
  "diagnostics",
] as const);

export const PLAN_COMPAT_FIELDS = Object.freeze([
  "schema",
  "compatible",
  "targets",
  "diagnostics",
] as const);

export const PLAN_WORKSPACE_FIELDS = Object.freeze([
  "effects",
  "capabilities",
  "estimatedMemoryMb",
  "parallelism",
] as const);

export const PLAN_OPTIONS_FIELDS = Object.freeze([
  "includeGpu",
  "includeOptical",
  "includeWasm",
  "includeCompatibility",
  "requestedTarget",
] as const);

export type PlanDiagnosticField =
  | "record"
  | "workspace"
  | "options"
  | "target"
  | "gpu"
  | "optical"
  | "wasm"
  | "compatibility"
  | "estimatedMemoryMb"
  | "parallelism"
  | "diagnostics"
  | "schema"
  | "suitability"
  | "recommendedTarget"
  | "need"
  | "recommendedMode"
  | "fallbackTarget"
  | "compatible"
  | "targets"
  | "effects"
  | "capabilities"
  | "includeGpu"
  | "includeOptical"
  | "includeWasm"
  | "includeCompatibility"
  | "requestedTarget";

export interface PlanDiagnostic {
  readonly code: string;
  readonly severity: "error";
  readonly message: string;
  readonly field: PlanDiagnosticField;
}

export interface PlanGpuPlan {
  readonly schema: typeof PLAN_GPU_SCHEMA;
  readonly suitability: PlanGpuSuitability;
  /** Under v1 freeze the executable recommendation is always the host CPU path ("node"). */
  readonly recommendedTarget: "node";
  readonly diagnostics: readonly PlanDiagnostic[];
}

export interface PlanOpticalPlan {
  readonly schema: typeof PLAN_OPTICAL_SCHEMA;
  readonly need: PlanOpticalNeed;
  /** Planning awareness only — never an execution admission. */
  readonly recommendedMode: PlanOpticalMode;
  readonly fallbackTarget: PlanOpticalFallbackTarget;
  readonly diagnostics: readonly PlanDiagnostic[];
}

export interface PlanCompatibility {
  readonly schema: typeof PLAN_COMPAT_SCHEMA;
  readonly compatible: boolean;
  readonly targets: readonly PlanRuntimeTarget[];
  readonly diagnostics: readonly PlanDiagnostic[];
}

export interface PlanWorkspaceInput {
  readonly effects: readonly string[];
  readonly capabilities: readonly string[];
  readonly estimatedMemoryMb: number;
  readonly parallelism: number;
}

export interface PlanOptions {
  readonly includeGpu: boolean;
  readonly includeOptical: boolean;
  readonly includeWasm: boolean;
  readonly includeCompatibility: boolean;
  /** When set, must be a closed PlanRuntimeTarget. */
  readonly requestedTarget: PlanRuntimeTarget | null;
}

export interface ComputePlan {
  readonly target: PlanRuntimeTarget;
  readonly gpu: PlanGpuPlan | null;
  readonly optical: PlanOpticalPlan | null;
  readonly wasm: PlanWasmTarget | null;
  readonly compatibility: PlanCompatibility | null;
  readonly estimatedMemoryMb: number;
  readonly parallelism: number;
  readonly diagnostics: readonly PlanDiagnostic[];
}

export type ReadComputePlanResult =
  | { readonly ok: true; readonly value: ComputePlan }
  | { readonly ok: false; readonly diagnostics: readonly PlanDiagnostic[] };

const TOKEN = /^[a-z][A-Za-z0-9_]*(?:\.[a-z][A-Za-z0-9_]*)*$/;
const MAX_TOKEN = 128;
const MAX_LIST = 4096;
const MAX_MEMORY_MB = 1_048_576;
const MAX_PARALLELISM = 65_536;
const TARGET_SET = new Set<string>(PLAN_RUNTIME_TARGETS);
const SUIT_SET = new Set<string>(PLAN_GPU_SUITABILITIES);
const NEED_SET = new Set<string>(PLAN_OPTICAL_NEEDS);
const MODE_SET = new Set<string>(PLAN_OPTICAL_MODES);
const FALLBACK_SET = new Set<string>(PLAN_OPTICAL_FALLBACK_TARGETS);
const WASM_SET = new Set<string>(PLAN_WASM_TARGETS);

const diag = (code: string, message: string, field: PlanDiagnosticField): PlanDiagnostic =>
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

/** True when value is one of the closed PlanRuntimeTarget tokens. */
export function isPlanRuntimeTarget(value: unknown): value is PlanRuntimeTarget {
  return typeof value === "string" && TARGET_SET.has(value);
}

export function isPlanGpuSuitability(value: unknown): value is PlanGpuSuitability {
  return typeof value === "string" && SUIT_SET.has(value);
}

export function isPlanOpticalNeed(value: unknown): value is PlanOpticalNeed {
  return typeof value === "string" && NEED_SET.has(value);
}

export function isPlanOpticalMode(value: unknown): value is PlanOpticalMode {
  return typeof value === "string" && MODE_SET.has(value);
}

export function isPlanOpticalFallbackTarget(value: unknown): value is PlanOpticalFallbackTarget {
  return typeof value === "string" && FALLBACK_SET.has(value);
}

export function isPlanWasmTarget(value: unknown): value is PlanWasmTarget {
  return typeof value === "string" && WASM_SET.has(value);
}

function readTokenList(
  value: unknown,
  field: PlanDiagnosticField,
  out: PlanDiagnostic[],
): readonly string[] | undefined {
  const items = snapshotArray(value, MAX_LIST);
  if (items === undefined) {
    out.push(diag(FUNGI_PLAN_001, "Token list must be a dense array within bounds.", field));
    return undefined;
  }
  const strings: string[] = [];
  for (const item of items) {
    if (typeof item !== "string" || item.length === 0 || item.length > MAX_TOKEN || !TOKEN.test(item)) {
      out.push(diag(FUNGI_PLAN_002, "Token is outside the closed domain.", field));
      return undefined;
    }
    strings.push(item);
  }
  if (!strictlyAscending(strings)) {
    out.push(diag(FUNGI_PLAN_002, "Token list must be strictly ascending with no duplicates.", field));
    return undefined;
  }
  return Object.freeze(strings);
}

function readBoolean(
  value: unknown,
  field: PlanDiagnosticField,
  out: PlanDiagnostic[],
): boolean | undefined {
  if (value !== true && value !== false) {
    out.push(diag(FUNGI_PLAN_002, "Flag must be a boolean.", field));
    return undefined;
  }
  return value;
}

function readBoundedInt(
  value: unknown,
  field: PlanDiagnosticField,
  max: number,
  out: PlanDiagnostic[],
): number | undefined {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value > max
  ) {
    out.push(diag(FUNGI_PLAN_002, "Numeric field is outside the closed domain.", field));
    return undefined;
  }
  return value;
}

function snapshotDiagnostics(
  value: unknown,
  field: PlanDiagnosticField,
  out: PlanDiagnostic[],
): readonly PlanDiagnostic[] | undefined {
  const items = snapshotArray(value, MAX_LIST);
  if (items === undefined) {
    out.push(diag(FUNGI_PLAN_001, "Diagnostics must be a dense array within bounds.", field));
    return undefined;
  }
  const result: PlanDiagnostic[] = [];
  for (const item of items) {
    const snap = snapshotRecord(item, 8);
    if (!snap.ok) {
      out.push(diag(FUNGI_PLAN_001, "Diagnostic entry must be a plain data object.", field));
      return undefined;
    }
    const known = new Set(["code", "severity", "message", "field"]);
    if ([...snap.values.keys()].some((k) => !known.has(k))) {
      out.push(diag(FUNGI_PLAN_001, "Diagnostic entry has a key outside the closed shape.", field));
      return undefined;
    }
    for (const req of known) {
      if (!snap.values.has(req)) {
        out.push(diag(FUNGI_PLAN_001, "Diagnostic entry is missing a required field.", field));
        return undefined;
      }
    }
    const code = snap.values.get("code");
    const severity = snap.values.get("severity");
    const message = snap.values.get("message");
    const f = snap.values.get("field");
    if (typeof code !== "string" || code.length === 0 || code.length > MAX_TOKEN) {
      out.push(diag(FUNGI_PLAN_002, "Diagnostic code is outside the closed domain.", field));
      return undefined;
    }
    if (severity !== "error") {
      out.push(diag(FUNGI_PLAN_002, "Diagnostic severity is outside the closed domain.", field));
      return undefined;
    }
    if (typeof message !== "string" || message.length === 0 || message.length > 512) {
      out.push(diag(FUNGI_PLAN_002, "Diagnostic message is outside the closed domain.", field));
      return undefined;
    }
    if (typeof f !== "string" || f.length === 0 || f.length > MAX_TOKEN) {
      out.push(diag(FUNGI_PLAN_002, "Diagnostic field is outside the closed domain.", field));
      return undefined;
    }
    result.push(Object.freeze({ code, severity: "error" as const, message, field: f as PlanDiagnosticField }));
  }
  return Object.freeze(result);
}

function readTargetList(
  value: unknown,
  field: PlanDiagnosticField,
  out: PlanDiagnostic[],
): readonly PlanRuntimeTarget[] | undefined {
  const items = snapshotArray(value, PLAN_RUNTIME_TARGETS.length);
  if (items === undefined) {
    out.push(diag(FUNGI_PLAN_001, "Target list must be a dense array within bounds.", field));
    return undefined;
  }
  const targets: PlanRuntimeTarget[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    if (!isPlanRuntimeTarget(item)) {
      out.push(diag(FUNGI_PLAN_002, "Target token is outside the closed vocabulary.", field));
      return undefined;
    }
    if (seen.has(item)) {
      out.push(diag(FUNGI_PLAN_002, "Target list must not contain duplicates.", field));
      return undefined;
    }
    seen.add(item);
    targets.push(item);
  }
  return Object.freeze(targets);
}

function refusedPlan(diagnostics: readonly PlanDiagnostic[]): ComputePlan {
  return Object.freeze({
    target: "node" as const,
    gpu: null,
    optical: null,
    wasm: null,
    compatibility: null,
    estimatedMemoryMb: 0,
    parallelism: 0,
    diagnostics: Object.freeze([...diagnostics]),
  });
}

function readWorkspace(value: unknown, out: PlanDiagnostic[]): PlanWorkspaceInput | undefined {
  const snap = snapshotRecord(value, PLAN_WORKSPACE_FIELDS.length + 8);
  if (!snap.ok) {
    out.push(diag(FUNGI_PLAN_001, "Plan workspace must be a plain data object.", "workspace"));
    return undefined;
  }
  const known = new Set<string>(PLAN_WORKSPACE_FIELDS);
  if ([...snap.values.keys()].some((k) => !known.has(k))) {
    out.push(diag(FUNGI_PLAN_001, "Plan workspace has a key outside the closed shape.", "workspace"));
    return undefined;
  }
  for (const field of PLAN_WORKSPACE_FIELDS) {
    if (!snap.values.has(field)) {
      out.push(diag(FUNGI_PLAN_001, "Plan workspace is missing a required field.", field as PlanDiagnosticField));
      return undefined;
    }
  }
  const effects = readTokenList(snap.values.get("effects"), "effects", out);
  if (effects === undefined) return undefined;
  const capabilities = readTokenList(snap.values.get("capabilities"), "capabilities", out);
  if (capabilities === undefined) return undefined;
  const estimatedMemoryMb = readBoundedInt(
    snap.values.get("estimatedMemoryMb"),
    "estimatedMemoryMb",
    MAX_MEMORY_MB,
    out,
  );
  if (estimatedMemoryMb === undefined) return undefined;
  const parallelism = readBoundedInt(snap.values.get("parallelism"), "parallelism", MAX_PARALLELISM, out);
  if (parallelism === undefined) return undefined;
  return Object.freeze({ effects, capabilities, estimatedMemoryMb, parallelism });
}

function readOptions(value: unknown, out: PlanDiagnostic[]): PlanOptions | undefined {
  const snap = snapshotRecord(value, PLAN_OPTIONS_FIELDS.length + 8);
  if (!snap.ok) {
    out.push(diag(FUNGI_PLAN_001, "Plan options must be a plain data object.", "options"));
    return undefined;
  }
  const known = new Set<string>(PLAN_OPTIONS_FIELDS);
  if ([...snap.values.keys()].some((k) => !known.has(k))) {
    out.push(diag(FUNGI_PLAN_001, "Plan options has a key outside the closed shape.", "options"));
    return undefined;
  }
  for (const field of PLAN_OPTIONS_FIELDS) {
    if (!snap.values.has(field)) {
      out.push(diag(FUNGI_PLAN_001, "Plan options is missing a required field.", field as PlanDiagnosticField));
      return undefined;
    }
  }
  const includeGpu = readBoolean(snap.values.get("includeGpu"), "includeGpu", out);
  if (includeGpu === undefined) return undefined;
  const includeOptical = readBoolean(snap.values.get("includeOptical"), "includeOptical", out);
  if (includeOptical === undefined) return undefined;
  const includeWasm = readBoolean(snap.values.get("includeWasm"), "includeWasm", out);
  if (includeWasm === undefined) return undefined;
  const includeCompatibility = readBoolean(
    snap.values.get("includeCompatibility"),
    "includeCompatibility",
    out,
  );
  if (includeCompatibility === undefined) return undefined;
  const requestedRaw = snap.values.get("requestedTarget");
  let requestedTarget: PlanRuntimeTarget | null;
  if (requestedRaw === null) {
    requestedTarget = null;
  } else if (isPlanRuntimeTarget(requestedRaw)) {
    requestedTarget = requestedRaw;
  } else {
    out.push(diag(FUNGI_PLAN_002, "Requested target is outside the closed vocabulary.", "requestedTarget"));
    return undefined;
  }
  if (!includeGpu && !includeOptical && !includeWasm && !includeCompatibility) {
    out.push(diag(FUNGI_PLAN_003, "At least one plan include facet must be true.", "options"));
    return undefined;
  }
  return Object.freeze({
    includeGpu,
    includeOptical,
    includeWasm,
    includeCompatibility,
    requestedTarget,
  });
}

function deriveGpu(workspace: PlanWorkspaceInput): PlanGpuPlan {
  // Advisory only. v1 freeze: never recommend gpu as executable path.
  let suitability: PlanGpuSuitability = "low";
  if (workspace.effects.some((e) => e.startsWith("gpu.") || e === "accelerator.run")) {
    suitability = "medium";
  }
  if (workspace.estimatedMemoryMb === 0 && workspace.parallelism === 0) {
    suitability = "unknown";
  }
  return Object.freeze({
    schema: PLAN_GPU_SCHEMA,
    suitability,
    recommendedTarget: "node" as const,
    diagnostics: Object.freeze([] as const),
  });
}

function deriveOptical(workspace: PlanWorkspaceInput): PlanOpticalPlan {
  let need: PlanOpticalNeed = "none";
  if (workspace.effects.some((e) => e.startsWith("optical.") || e === "photonic.io")) {
    need = "data_movement";
  }
  if (
    workspace.estimatedMemoryMb === 0 &&
    workspace.parallelism === 0 &&
    workspace.effects.length === 0
  ) {
    need = "unknown";
  }
  return Object.freeze({
    schema: PLAN_OPTICAL_SCHEMA,
    need,
    recommendedMode: "none" as const,
    fallbackTarget: "cpu" as const,
    diagnostics: Object.freeze([] as const),
  });
}

function deriveCompat(workspace: PlanWorkspaceInput, target: PlanRuntimeTarget): PlanCompatibility {
  void workspace;
  const targets = Object.freeze([target] as PlanRuntimeTarget[]);
  const compatible = target !== "photonic" && target !== "gpu";
  return Object.freeze({
    schema: PLAN_COMPAT_SCHEMA,
    compatible,
    targets,
    diagnostics: Object.freeze([] as const),
  });
}

/**
 * estimateTarget — closed-shape planner. Never throws. Never echoes refused values.
 * Live GPU/optical/memory probes and compute-plan.json emission remain open.
 */
export function estimateTarget(workspace: unknown, options: unknown): ComputePlan {
  const out: PlanDiagnostic[] = [];
  const ws = readWorkspace(workspace, out);
  if (ws === undefined) return refusedPlan(out);
  const opts = readOptions(options, out);
  if (opts === undefined) return refusedPlan(out);

  const target: PlanRuntimeTarget = opts.requestedTarget ?? "node";
  const gpu = opts.includeGpu ? deriveGpu(ws) : null;
  const optical = opts.includeOptical ? deriveOptical(ws) : null;
  const wasm: PlanWasmTarget | null = opts.includeWasm ? "wasm" : null;
  const compatibility = opts.includeCompatibility ? deriveCompat(ws, target) : null;

  return Object.freeze({
    target,
    gpu,
    optical,
    wasm,
    compatibility,
    estimatedMemoryMb: ws.estimatedMemoryMb,
    parallelism: ws.parallelism,
    diagnostics: Object.freeze([] as PlanDiagnostic[]),
  });
}

export function createComputePlan(
  target: PlanRuntimeTarget,
  gpu: PlanGpuPlan | null,
  optical: PlanOpticalPlan | null,
  wasm: PlanWasmTarget | null,
  compatibility: PlanCompatibility | null,
  estimatedMemoryMb: number,
  parallelism: number,
  diagnostics: readonly PlanDiagnostic[],
): ComputePlan {
  const out: PlanDiagnostic[] = [];
  if (!isPlanRuntimeTarget(target)) {
    out.push(diag(FUNGI_PLAN_002, "Target token is outside the closed vocabulary.", "target"));
  }
  if (
    typeof estimatedMemoryMb !== "number" ||
    !Number.isFinite(estimatedMemoryMb) ||
    !Number.isSafeInteger(estimatedMemoryMb) ||
    estimatedMemoryMb < 0 ||
    estimatedMemoryMb > MAX_MEMORY_MB
  ) {
    out.push(diag(FUNGI_PLAN_002, "Numeric field is outside the closed domain.", "estimatedMemoryMb"));
  }
  if (
    typeof parallelism !== "number" ||
    !Number.isFinite(parallelism) ||
    !Number.isSafeInteger(parallelism) ||
    parallelism < 0 ||
    parallelism > MAX_PARALLELISM
  ) {
    out.push(diag(FUNGI_PLAN_002, "Numeric field is outside the closed domain.", "parallelism"));
  }
  const diags = snapshotDiagnostics(diagnostics, "diagnostics", out);
  if (out.length > 0 || diags === undefined) {
    return refusedPlan(
      out.length > 0
        ? out
        : [diag(FUNGI_PLAN_001, "Diagnostics must be a dense array within bounds.", "diagnostics")],
    );
  }
  return Object.freeze({
    target,
    gpu,
    optical,
    wasm,
    compatibility,
    estimatedMemoryMb,
    parallelism,
    diagnostics: diags,
  });
}

export function readComputePlan(value: unknown): ReadComputePlanResult {
  const out: PlanDiagnostic[] = [];
  const snap = snapshotRecord(value, COMPUTE_PLAN_FIELDS.length + 8);
  if (!snap.ok) {
    out.push(diag(FUNGI_PLAN_001, "ComputePlan must be a plain data object.", "record"));
    return { ok: false, diagnostics: Object.freeze(out) };
  }
  const known = new Set<string>(COMPUTE_PLAN_FIELDS);
  if ([...snap.values.keys()].some((k) => !known.has(k))) {
    out.push(diag(FUNGI_PLAN_001, "ComputePlan has a key outside the closed shape.", "record"));
    return { ok: false, diagnostics: Object.freeze(out) };
  }
  for (const field of COMPUTE_PLAN_FIELDS) {
    if (!snap.values.has(field)) {
      out.push(diag(FUNGI_PLAN_001, "ComputePlan is missing a required field.", field as PlanDiagnosticField));
      return { ok: false, diagnostics: Object.freeze(out) };
    }
  }
  const targetRaw = snap.values.get("target");
  if (!isPlanRuntimeTarget(targetRaw)) {
    out.push(diag(FUNGI_PLAN_002, "Target token is outside the closed vocabulary.", "target"));
    return { ok: false, diagnostics: Object.freeze(out) };
  }
  const estimatedMemoryMb = readBoundedInt(
    snap.values.get("estimatedMemoryMb"),
    "estimatedMemoryMb",
    MAX_MEMORY_MB,
    out,
  );
  if (estimatedMemoryMb === undefined) return { ok: false, diagnostics: Object.freeze(out) };
  const parallelism = readBoundedInt(snap.values.get("parallelism"), "parallelism", MAX_PARALLELISM, out);
  if (parallelism === undefined) return { ok: false, diagnostics: Object.freeze(out) };
  const diagnostics = snapshotDiagnostics(snap.values.get("diagnostics"), "diagnostics", out);
  if (diagnostics === undefined) return { ok: false, diagnostics: Object.freeze(out) };

  let gpu: PlanGpuPlan | null = null;
  const gpuRaw = snap.values.get("gpu");
  if (gpuRaw !== null) {
    const g = snapshotRecord(gpuRaw, PLAN_GPU_FIELDS.length + 8);
    if (!g.ok) {
      out.push(diag(FUNGI_PLAN_001, "GpuPlan must be a plain data object.", "gpu"));
      return { ok: false, diagnostics: Object.freeze(out) };
    }
    const gKnown = new Set<string>(PLAN_GPU_FIELDS);
    if ([...g.values.keys()].some((k) => !gKnown.has(k))) {
      out.push(diag(FUNGI_PLAN_001, "GpuPlan has a key outside the closed shape.", "gpu"));
      return { ok: false, diagnostics: Object.freeze(out) };
    }
    for (const field of PLAN_GPU_FIELDS) {
      if (!g.values.has(field)) {
        out.push(diag(FUNGI_PLAN_001, "GpuPlan is missing a required field.", field as PlanDiagnosticField));
        return { ok: false, diagnostics: Object.freeze(out) };
      }
    }
    if (g.values.get("schema") !== PLAN_GPU_SCHEMA) {
      out.push(diag(FUNGI_PLAN_002, "GpuPlan schema is not admitted.", "schema"));
      return { ok: false, diagnostics: Object.freeze(out) };
    }
    const suitability = g.values.get("suitability");
    if (!isPlanGpuSuitability(suitability)) {
      out.push(diag(FUNGI_PLAN_002, "Gpu suitability is outside the closed vocabulary.", "suitability"));
      return { ok: false, diagnostics: Object.freeze(out) };
    }
    if (g.values.get("recommendedTarget") !== "node") {
      out.push(diag(FUNGI_PLAN_004, "GpuPlan recommendedTarget violates the v1 freeze.", "recommendedTarget"));
      return { ok: false, diagnostics: Object.freeze(out) };
    }
    const gDiags = snapshotDiagnostics(g.values.get("diagnostics"), "diagnostics", out);
    if (gDiags === undefined) return { ok: false, diagnostics: Object.freeze(out) };
    gpu = Object.freeze({
      schema: PLAN_GPU_SCHEMA,
      suitability,
      recommendedTarget: "node" as const,
      diagnostics: gDiags,
    });
  }

  let optical: PlanOpticalPlan | null = null;
  const opticalRaw = snap.values.get("optical");
  if (opticalRaw !== null) {
    const o = snapshotRecord(opticalRaw, PLAN_OPTICAL_FIELDS.length + 8);
    if (!o.ok) {
      out.push(diag(FUNGI_PLAN_001, "OpticalPlan must be a plain data object.", "optical"));
      return { ok: false, diagnostics: Object.freeze(out) };
    }
    const oKnown = new Set<string>(PLAN_OPTICAL_FIELDS);
    if ([...o.values.keys()].some((k) => !oKnown.has(k))) {
      out.push(diag(FUNGI_PLAN_001, "OpticalPlan has a key outside the closed shape.", "optical"));
      return { ok: false, diagnostics: Object.freeze(out) };
    }
    for (const field of PLAN_OPTICAL_FIELDS) {
      if (!o.values.has(field)) {
        out.push(diag(FUNGI_PLAN_001, "OpticalPlan is missing a required field.", field as PlanDiagnosticField));
        return { ok: false, diagnostics: Object.freeze(out) };
      }
    }
    if (o.values.get("schema") !== PLAN_OPTICAL_SCHEMA) {
      out.push(diag(FUNGI_PLAN_002, "OpticalPlan schema is not admitted.", "schema"));
      return { ok: false, diagnostics: Object.freeze(out) };
    }
    const need = o.values.get("need");
    if (!isPlanOpticalNeed(need)) {
      out.push(diag(FUNGI_PLAN_002, "Optical need is outside the closed vocabulary.", "need"));
      return { ok: false, diagnostics: Object.freeze(out) };
    }
    const mode = o.values.get("recommendedMode");
    if (!isPlanOpticalMode(mode)) {
      out.push(diag(FUNGI_PLAN_002, "Optical mode is outside the closed vocabulary.", "recommendedMode"));
      return { ok: false, diagnostics: Object.freeze(out) };
    }
    const fallback = o.values.get("fallbackTarget");
    if (!isPlanOpticalFallbackTarget(fallback)) {
      out.push(diag(FUNGI_PLAN_002, "Optical fallback is outside the closed vocabulary.", "fallbackTarget"));
      return { ok: false, diagnostics: Object.freeze(out) };
    }
    const oDiags = snapshotDiagnostics(o.values.get("diagnostics"), "diagnostics", out);
    if (oDiags === undefined) return { ok: false, diagnostics: Object.freeze(out) };
    optical = Object.freeze({
      schema: PLAN_OPTICAL_SCHEMA,
      need,
      recommendedMode: mode,
      fallbackTarget: fallback,
      diagnostics: oDiags,
    });
  }

  let wasm: PlanWasmTarget | null = null;
  const wasmRaw = snap.values.get("wasm");
  if (wasmRaw !== null) {
    if (!isPlanWasmTarget(wasmRaw)) {
      out.push(diag(FUNGI_PLAN_002, "Wasm target is outside the closed vocabulary.", "wasm"));
      return { ok: false, diagnostics: Object.freeze(out) };
    }
    wasm = wasmRaw;
  }

  let compatibility: PlanCompatibility | null = null;
  const compatRaw = snap.values.get("compatibility");
  if (compatRaw !== null) {
    const c = snapshotRecord(compatRaw, PLAN_COMPAT_FIELDS.length + 8);
    if (!c.ok) {
      out.push(diag(FUNGI_PLAN_001, "Compatibility report must be a plain data object.", "compatibility"));
      return { ok: false, diagnostics: Object.freeze(out) };
    }
    const cKnown = new Set<string>(PLAN_COMPAT_FIELDS);
    if ([...c.values.keys()].some((k) => !cKnown.has(k))) {
      out.push(diag(FUNGI_PLAN_001, "Compatibility report has a key outside the closed shape.", "compatibility"));
      return { ok: false, diagnostics: Object.freeze(out) };
    }
    for (const field of PLAN_COMPAT_FIELDS) {
      if (!c.values.has(field)) {
        out.push(
          diag(FUNGI_PLAN_001, "Compatibility report is missing a required field.", field as PlanDiagnosticField),
        );
        return { ok: false, diagnostics: Object.freeze(out) };
      }
    }
    if (c.values.get("schema") !== PLAN_COMPAT_SCHEMA) {
      out.push(diag(FUNGI_PLAN_002, "Compatibility schema is not admitted.", "schema"));
      return { ok: false, diagnostics: Object.freeze(out) };
    }
    const compatible = c.values.get("compatible");
    if (compatible !== true && compatible !== false) {
      out.push(diag(FUNGI_PLAN_002, "Flag must be a boolean.", "compatible"));
      return { ok: false, diagnostics: Object.freeze(out) };
    }
    const targets = readTargetList(c.values.get("targets"), "targets", out);
    if (targets === undefined) return { ok: false, diagnostics: Object.freeze(out) };
    const cDiags = snapshotDiagnostics(c.values.get("diagnostics"), "diagnostics", out);
    if (cDiags === undefined) return { ok: false, diagnostics: Object.freeze(out) };
    compatibility = Object.freeze({
      schema: PLAN_COMPAT_SCHEMA,
      compatible,
      targets,
      diagnostics: cDiags,
    });
  }

  return {
    ok: true,
    value: Object.freeze({
      target: targetRaw,
      gpu,
      optical,
      wasm,
      compatibility,
      estimatedMemoryMb,
      parallelism,
      diagnostics,
    }),
  };
}

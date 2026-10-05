// Build contracts (TODO pass, Grok 2026-10-05; zero-trust defaults, owner may revisit).
//
// Closed-shape BuildResult / BuildWorkspaceInput / BuildDiagnostic and
// buildWorkspace(). No CLI wiring, no artefact emission, no 14-pass pipeline,
// no package dependency on galerina-core-compiler.
//
// Zero-trust rules:
//  - Closed shapes via property descriptors (no getters run; symbols / accessors /
//    custom prototypes refuse). Unknown keys refuse without echoing the key.
//  - Target tokens are an exact closed vocabulary (same as deploy/plan).
//  - Nested BuildArtefact entries are closed via the verify-integrity reader.
//  - Diagnostics never echo paths, targets, profiles, keys or unknown values.
//  - Numbers are finite, non-negative, safe integers within bounds (no NaN/Infinity).
//
// Not covered: build-command / build-pipeline / build-reporter / build-artifacts /
// build-integrity writers, flag parsing, or emitting runtime-manifest.json /
// compiler-report.json / effect-report.json / capability-report.json /
// audit-report.json / build-hash.txt.

import {
  BUILD_ARTEFACT_KINDS,
  readBuildArtefact,
  type BuildArtefactReadResult,
} from "../verify/verify-integrity.js";
import type { BuildArtefact } from "../verify.js";

/** Record / input is not a closed data object. */
export const FUNGI_BUILD_001 = "FUNGI-BUILD-001";
/** A field value is outside its closed domain. */
export const FUNGI_BUILD_002 = "FUNGI-BUILD-002";
/** Workspace / outDir path token refuse (absolute, traversal, empty). */
export const FUNGI_BUILD_003 = "FUNGI-BUILD-003";
/** Artefact set refuse (not dense, duplicate path, or nested shape refuse). */
export const FUNGI_BUILD_004 = "FUNGI-BUILD-004";
/** Result consistency / pipeline-not-admitted refuse. */
export const FUNGI_BUILD_005 = "FUNGI-BUILD-005";

export const BUILD_RUNTIME_TARGETS = Object.freeze([
  "node",
  "wasm",
  "native",
  "serverless",
  "edge",
  "gpu",
  "photonic",
] as const);

export type BuildRuntimeTarget = (typeof BUILD_RUNTIME_TARGETS)[number];

export const BUILD_RESULT_FIELDS = Object.freeze([
  "success",
  "artefacts",
  "diagnostics",
  "manifestPath",
  "duration",
] as const);

export const BUILD_WORKSPACE_INPUT_FIELDS = Object.freeze([
  "workspace",
  "target",
  "strict",
  "profile",
  "outDir",
] as const);

export type BuildDiagnosticField =
  | "record"
  | "input"
  | "workspace"
  | "target"
  | "strict"
  | "profile"
  | "outDir"
  | "success"
  | "artefacts"
  | "diagnostics"
  | "manifestPath"
  | "duration"
  | "pipeline";

export interface BuildDiagnostic {
  readonly code: string;
  readonly severity: "error";
  readonly message: string;
  readonly field: BuildDiagnosticField;
}

export interface BuildWorkspaceInput {
  readonly workspace: string;
  readonly target: BuildRuntimeTarget;
  readonly strict: boolean;
  /** Optional closed dotted token; omit key entirely when absent. */
  readonly profile?: string;
  readonly outDir: string;
}

export interface BuildResult {
  readonly success: boolean;
  readonly artefacts: readonly BuildArtefact[];
  readonly diagnostics: readonly BuildDiagnostic[];
  readonly manifestPath: string;
  readonly duration: number;
}

export type ReadBuildResultResult =
  | { readonly ok: true; readonly value: BuildResult }
  | { readonly ok: false; readonly diagnostics: readonly BuildDiagnostic[] };

export type ReadBuildWorkspaceInputResult =
  | { readonly ok: true; readonly value: BuildWorkspaceInput }
  | { readonly ok: false; readonly diagnostics: readonly BuildDiagnostic[] };

const TARGET_SET = new Set<string>(BUILD_RUNTIME_TARGETS);
const KIND_SET = new Set<string>(BUILD_ARTEFACT_KINDS);
const PROFILE = /^[a-z][A-Za-z0-9_]*(?:\.[a-z][A-Za-z0-9_]*)*$/;
const REL_PATH = /^(?:[A-Za-z0-9._-]+(?:[\\/][A-Za-z0-9._-]+)*)$/;
const MAX_TOKEN = 128;
const MAX_PATH = 512;
const MAX_LIST = 4096;
const MAX_DURATION_MS = 86_400_000;

const diag = (code: string, message: string, field: BuildDiagnosticField): BuildDiagnostic =>
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

/** True when value is one of the closed BuildRuntimeTarget tokens. */
export function isBuildRuntimeTarget(value: unknown): value is BuildRuntimeTarget {
  return typeof value === "string" && TARGET_SET.has(value);
}

function isRelativePathToken(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= MAX_PATH &&
    !value.includes("\0") &&
    REL_PATH.test(value) &&
    !value.split(/[\\/]/).includes("..")
  );
}

function readRelativePath(
  value: unknown,
  field: BuildDiagnosticField,
  out: BuildDiagnostic[],
): string | undefined {
  if (!isRelativePathToken(value)) {
    out.push(diag(FUNGI_BUILD_003, "Path token must be a relative non-empty closed path.", field));
    return undefined;
  }
  return value;
}

function readBoundedInt(
  value: unknown,
  field: BuildDiagnosticField,
  max: number,
  out: BuildDiagnostic[],
): number | undefined {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value > max
  ) {
    out.push(diag(FUNGI_BUILD_002, "Numeric field is outside the closed domain.", field));
    return undefined;
  }
  return value;
}

function snapshotDiagnostics(
  value: unknown,
  field: BuildDiagnosticField,
  out: BuildDiagnostic[],
): readonly BuildDiagnostic[] | undefined {
  const items = snapshotArray(value, MAX_LIST);
  if (items === undefined) {
    out.push(diag(FUNGI_BUILD_001, "Diagnostics must be a dense array within bounds.", field));
    return undefined;
  }
  const result: BuildDiagnostic[] = [];
  for (const item of items) {
    const snap = snapshotRecord(item, 8);
    if (!snap.ok) {
      out.push(diag(FUNGI_BUILD_001, "Diagnostic entry must be a plain data object.", field));
      return undefined;
    }
    const known = new Set(["code", "severity", "message", "field"]);
    if ([...snap.values.keys()].some((k) => !known.has(k))) {
      out.push(diag(FUNGI_BUILD_001, "Diagnostic entry has a key outside the closed shape.", field));
      return undefined;
    }
    for (const req of known) {
      if (!snap.values.has(req)) {
        out.push(diag(FUNGI_BUILD_001, "Diagnostic entry is missing a required field.", field));
        return undefined;
      }
    }
    const code = snap.values.get("code");
    const severity = snap.values.get("severity");
    const message = snap.values.get("message");
    const f = snap.values.get("field");
    if (typeof code !== "string" || code.length === 0 || code.length > MAX_TOKEN) {
      out.push(diag(FUNGI_BUILD_002, "Diagnostic code is outside the closed domain.", field));
      return undefined;
    }
    if (severity !== "error") {
      out.push(diag(FUNGI_BUILD_002, "Diagnostic severity is outside the closed domain.", field));
      return undefined;
    }
    if (typeof message !== "string" || message.length === 0 || message.length > 512) {
      out.push(diag(FUNGI_BUILD_002, "Diagnostic message is outside the closed domain.", field));
      return undefined;
    }
    if (typeof f !== "string" || f.length === 0 || f.length > MAX_TOKEN) {
      out.push(diag(FUNGI_BUILD_002, "Diagnostic field is outside the closed domain.", field));
      return undefined;
    }
    result.push(Object.freeze({ code, severity: "error" as const, message, field: f as BuildDiagnosticField }));
  }
  return Object.freeze(result);
}

function readArtefactList(
  value: unknown,
  out: BuildDiagnostic[],
): readonly BuildArtefact[] | undefined {
  const items = snapshotArray(value, MAX_LIST);
  if (items === undefined) {
    out.push(diag(FUNGI_BUILD_004, "Artefact set must be a dense array within bounds.", "artefacts"));
    return undefined;
  }
  const artefacts: BuildArtefact[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    const read: BuildArtefactReadResult = readBuildArtefact(item);
    if (!read.ok) {
      out.push(diag(FUNGI_BUILD_004, "Artefact entry refused closed-shape integrity read.", "artefacts"));
      return undefined;
    }
    if (!KIND_SET.has(read.artefact.kind)) {
      out.push(diag(FUNGI_BUILD_004, "Artefact kind is outside the closed vocabulary.", "artefacts"));
      return undefined;
    }
    if (seen.has(read.artefact.path)) {
      out.push(diag(FUNGI_BUILD_004, "Artefact path is listed twice.", "artefacts"));
      return undefined;
    }
    seen.add(read.artefact.path);
    artefacts.push(read.artefact);
  }
  return Object.freeze(artefacts);
}

function refusedResult(diagnostics: readonly BuildDiagnostic[]): BuildResult {
  return Object.freeze({
    success: false,
    artefacts: Object.freeze([] as BuildArtefact[]),
    diagnostics: Object.freeze([...diagnostics]),
    manifestPath: "",
    duration: 0,
  });
}

/**
 * Build a frozen BuildResult. success is recomputed as diagnostics.length === 0.
 * Never throws. Never echoes refused values.
 */
export function createBuildResult(input: unknown): BuildResult {
  try {
    const snap = snapshotRecord(input, BUILD_RESULT_FIELDS.length + 2);
    if (!snap.ok) return refusedResult([diag(FUNGI_BUILD_001, "BuildResult must be a plain data object.", "record")]);
    const known = new Set<string>(BUILD_RESULT_FIELDS);
    if ([...snap.values.keys()].some((k) => !known.has(k))) {
      return refusedResult([diag(FUNGI_BUILD_001, "BuildResult has a key outside the closed shape.", "record")]);
    }
    for (const req of BUILD_RESULT_FIELDS) {
      if (!snap.values.has(req)) {
        return refusedResult([diag(FUNGI_BUILD_001, "BuildResult is missing a required field.", "record")]);
      }
    }
    const out: BuildDiagnostic[] = [];
    const successRaw = snap.values.get("success");
    if (successRaw !== true && successRaw !== false) {
      out.push(diag(FUNGI_BUILD_002, "success must be a boolean.", "success"));
    }
    const artefacts = readArtefactList(snap.values.get("artefacts"), out);
    const diagnostics = snapshotDiagnostics(snap.values.get("diagnostics"), "diagnostics", out);
    const manifestPathRaw = snap.values.get("manifestPath");
    let manifestPath = "";
    if (typeof manifestPathRaw !== "string") {
      out.push(diag(FUNGI_BUILD_002, "manifestPath must be a string.", "manifestPath"));
    } else if (manifestPathRaw.length > 0) {
      const mp = readRelativePath(manifestPathRaw, "manifestPath", out);
      if (mp !== undefined) manifestPath = mp;
    } else {
      manifestPath = "";
    }
    const duration = readBoundedInt(snap.values.get("duration"), "duration", MAX_DURATION_MS, out);
    if (out.length > 0 || artefacts === undefined || diagnostics === undefined || duration === undefined) {
      return refusedResult(out.length > 0 ? out : [diag(FUNGI_BUILD_005, "BuildResult consistency refuse.", "record")]);
    }
    const success = diagnostics.length === 0;
    if (successRaw === true && diagnostics.length > 0) {
      return refusedResult([
        ...diagnostics,
        diag(FUNGI_BUILD_005, "success must be false when diagnostics are present.", "success"),
      ]);
    }
    return Object.freeze({
      success,
      artefacts,
      diagnostics,
      manifestPath,
      duration,
    });
  } catch {
    return refusedResult([diag(FUNGI_BUILD_001, "BuildResult could not be read safely.", "record")]);
  }
}

/** Closed-shape read of a BuildResult. Never throws. */
export function readBuildResult(input: unknown): ReadBuildResultResult {
  const value = createBuildResult(input);
  if (value.diagnostics.some((d) => d.code === FUNGI_BUILD_001 || d.code === FUNGI_BUILD_002 || d.code === FUNGI_BUILD_003 || d.code === FUNGI_BUILD_004 || (d.code === FUNGI_BUILD_005 && d.field === "record"))) {
    // Distinguishing "constructed refuse" from "valid failure result" is hard when
    // createBuildResult always returns a BuildResult. Prefer: ok when the input
    // snapshotted cleanly into the closed shape and success matches diagnostics.
    // Re-validate via a second path below.
  }
  const snap = snapshotRecord(input, BUILD_RESULT_FIELDS.length + 2);
  if (!snap.ok) {
    return Object.freeze({
      ok: false as const,
      diagnostics: Object.freeze([diag(FUNGI_BUILD_001, "BuildResult must be a plain data object.", "record")]),
    });
  }
  const known = new Set<string>(BUILD_RESULT_FIELDS);
  if ([...snap.values.keys()].some((k) => !known.has(k))) {
    return Object.freeze({
      ok: false as const,
      diagnostics: Object.freeze([diag(FUNGI_BUILD_001, "BuildResult has a key outside the closed shape.", "record")]),
    });
  }
  for (const req of BUILD_RESULT_FIELDS) {
    if (!snap.values.has(req)) {
      return Object.freeze({
        ok: false as const,
        diagnostics: Object.freeze([diag(FUNGI_BUILD_001, "BuildResult is missing a required field.", "record")]),
      });
    }
  }
  const out: BuildDiagnostic[] = [];
  const successRaw = snap.values.get("success");
  if (successRaw !== true && successRaw !== false) {
    out.push(diag(FUNGI_BUILD_002, "success must be a boolean.", "success"));
  }
  const artefacts = readArtefactList(snap.values.get("artefacts"), out);
  const diagnostics = snapshotDiagnostics(snap.values.get("diagnostics"), "diagnostics", out);
  const manifestPathRaw = snap.values.get("manifestPath");
  let manifestPath = "";
  if (typeof manifestPathRaw !== "string") {
    out.push(diag(FUNGI_BUILD_002, "manifestPath must be a string.", "manifestPath"));
  } else if (manifestPathRaw.length > 0) {
    const mp = readRelativePath(manifestPathRaw, "manifestPath", out);
    if (mp !== undefined) manifestPath = mp;
  }
  const duration = readBoundedInt(snap.values.get("duration"), "duration", MAX_DURATION_MS, out);
  if (out.length > 0 || artefacts === undefined || diagnostics === undefined || duration === undefined) {
    return Object.freeze({
      ok: false as const,
      diagnostics: Object.freeze(out.length > 0 ? out : [diag(FUNGI_BUILD_005, "BuildResult consistency refuse.", "record")]),
    });
  }
  const success = diagnostics.length === 0;
  if (successRaw === true && !success) {
    return Object.freeze({
      ok: false as const,
      diagnostics: Object.freeze([
        diag(FUNGI_BUILD_005, "success must be false when diagnostics are present.", "success"),
      ]),
    });
  }
  if (successRaw === false && success) {
    return Object.freeze({
      ok: false as const,
      diagnostics: Object.freeze([
        diag(FUNGI_BUILD_005, "success must be true when diagnostics are empty.", "success"),
      ]),
    });
  }
  return Object.freeze({
    ok: true as const,
    value: Object.freeze({
      success,
      artefacts,
      diagnostics,
      manifestPath,
      duration,
    }),
  });
}

/** Closed-shape read of BuildWorkspaceInput. Never throws. */
export function readBuildWorkspaceInput(input: unknown): ReadBuildWorkspaceInputResult {
  try {
    const snap = snapshotRecord(input, BUILD_WORKSPACE_INPUT_FIELDS.length + 2);
    if (!snap.ok) {
      return Object.freeze({
        ok: false as const,
        diagnostics: Object.freeze([diag(FUNGI_BUILD_001, "BuildWorkspaceInput must be a plain data object.", "input")]),
      });
    }
    const known = new Set<string>(BUILD_WORKSPACE_INPUT_FIELDS);
    if ([...snap.values.keys()].some((k) => !known.has(k))) {
      return Object.freeze({
        ok: false as const,
        diagnostics: Object.freeze([diag(FUNGI_BUILD_001, "BuildWorkspaceInput has a key outside the closed shape.", "input")]),
      });
    }
    for (const req of ["workspace", "target", "strict", "outDir"] as const) {
      if (!snap.values.has(req)) {
        return Object.freeze({
          ok: false as const,
          diagnostics: Object.freeze([diag(FUNGI_BUILD_001, "BuildWorkspaceInput is missing a required field.", "input")]),
        });
      }
    }
    const out: BuildDiagnostic[] = [];
    const workspace = readRelativePath(snap.values.get("workspace"), "workspace", out);
    const targetRaw = snap.values.get("target");
    let target: BuildRuntimeTarget | undefined;
    if (!isBuildRuntimeTarget(targetRaw)) {
      out.push(diag(FUNGI_BUILD_002, "target is outside the closed vocabulary.", "target"));
    } else {
      target = targetRaw;
    }
    const strictRaw = snap.values.get("strict");
    if (strictRaw !== true && strictRaw !== false) {
      out.push(diag(FUNGI_BUILD_002, "strict must be a boolean.", "strict"));
    }
    let profile: string | undefined;
    if (snap.values.has("profile")) {
      const p = snap.values.get("profile");
      if (typeof p !== "string" || p.length === 0 || p.length > MAX_TOKEN || !PROFILE.test(p)) {
        out.push(diag(FUNGI_BUILD_002, "profile is outside the closed domain.", "profile"));
      } else {
        profile = p;
      }
    }
    const outDir = readRelativePath(snap.values.get("outDir"), "outDir", out);
    if (out.length > 0 || workspace === undefined || target === undefined || outDir === undefined || (strictRaw !== true && strictRaw !== false)) {
      return Object.freeze({
        ok: false as const,
        diagnostics: Object.freeze(out.length > 0 ? out : [diag(FUNGI_BUILD_001, "BuildWorkspaceInput consistency refuse.", "input")]),
      });
    }
    const value: BuildWorkspaceInput =
      profile === undefined
        ? Object.freeze({ workspace, target, strict: strictRaw, outDir })
        : Object.freeze({ workspace, target, strict: strictRaw, profile, outDir });
    return Object.freeze({ ok: true as const, value });
  } catch {
    return Object.freeze({
      ok: false as const,
      diagnostics: Object.freeze([diag(FUNGI_BUILD_001, "BuildWorkspaceInput could not be read safely.", "input")]),
    });
  }
}

/**
 * Validate BuildWorkspaceInput and return a closed BuildResult.
 * Never throws. Does not run the 14-pass pipeline, open the workspace, or emit artefacts.
 * On a valid input, returns success:false with FUNGI-BUILD-005 (pipeline not admitted).
 */
export async function buildWorkspace(input: unknown): Promise<BuildResult> {
  try {
    const read = readBuildWorkspaceInput(input);
    if (!read.ok) {
      return Object.freeze({
        success: false,
        artefacts: Object.freeze([] as BuildArtefact[]),
        diagnostics: Object.freeze([...read.diagnostics]),
        manifestPath: "",
        duration: 0,
      });
    }
    // Valid closed input: pipeline is not admitted on this tip.
    void read.value;
    return Object.freeze({
      success: false,
      artefacts: Object.freeze([] as BuildArtefact[]),
      diagnostics: Object.freeze([
        diag(
          FUNGI_BUILD_005,
          "14-pass build pipeline is not admitted on this tip.",
          "pipeline",
        ),
      ]),
      manifestPath: "",
      duration: 0,
    });
  } catch {
    return refusedResult([diag(FUNGI_BUILD_001, "BuildWorkspaceInput could not be read safely.", "input")]);
  }
}

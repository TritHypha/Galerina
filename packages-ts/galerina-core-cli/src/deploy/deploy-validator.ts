// Deploy contracts (TODO pass, Grok 2026-10-05; zero-trust defaults, owner may revisit).
//
// Closed-shape DeploymentTarget / DeploymentResult / EffectsPolicy / ValidateEffectsInput
// and validateEffects(). No network, filesystem deploy, or package dependency on
// galerina-core-reports / compiler. Manifest shape used here is the deploy-relevant
// slice (allowedEffects + verified); callers should run verifyRuntimeManifest first.
//
// Zero-trust rules:
//  - Closed shapes via property descriptors (no getters run; symbols / accessors /
//    custom prototypes refuse). Unknown keys refuse without echoing the key.
//  - DeploymentTarget is an exact closed vocabulary (package TODO / README).
//  - Effects are dotted lower-camel tokens, strictly ascending, bounded.
//  - Diagnostics never echo effect names, targets, hashes, paths or unknown keys.
//
// Not covered: deploy-command wiring, deployment-report.json writer, dry-run, live
// target probing, module-hash checks against the filesystem, or FUNGI-BOUNDARY-008.

/** Record / input is not a closed data object. */
export const FUNGI_DEPLOY_001 = "FUNGI-DEPLOY-001";
/** A field value is outside its closed domain. */
export const FUNGI_DEPLOY_002 = "FUNGI-DEPLOY-002";
/** Policy denies one or more declared effects for this deployment. */
export const FUNGI_DEPLOY_003 = "FUNGI-DEPLOY-003";
/** Target is incompatible with the policy's allowedTargets. */
export const FUNGI_DEPLOY_004 = "FUNGI-DEPLOY-004";
/** Verified gate failed (requireVerified and manifest.verified is not true). */
export const FUNGI_DEPLOY_005 = "FUNGI-DEPLOY-005";

export const DEPLOYMENT_TARGETS = Object.freeze([
  "node",
  "wasm",
  "native",
  "serverless",
  "edge",
  "gpu",
  "photonic",
] as const);

export type DeploymentTarget = (typeof DEPLOYMENT_TARGETS)[number];

export const DEPLOYMENT_RESULT_FIELDS = Object.freeze([
  "success",
  "target",
  "manifestHash",
  "diagnostics",
  "reportPath",
] as const);

export const EFFECTS_POLICY_FIELDS = Object.freeze([
  "allowedEffects",
  "allowedTargets",
  "requireVerified",
] as const);

export const DEPLOY_MANIFEST_SLICE_FIELDS = Object.freeze([
  "allowedEffects",
  "verified",
] as const);

export const VALIDATE_EFFECTS_INPUT_FIELDS = Object.freeze([
  "manifest",
  "policy",
  "target",
] as const);

export type DeployDiagnosticField =
  | "record"
  | "input"
  | "manifest"
  | "policy"
  | "target"
  | "allowedEffects"
  | "allowedTargets"
  | "requireVerified"
  | "verified"
  | "manifestHash"
  | "diagnostics"
  | "reportPath"
  | "success";

export interface DeployDiagnostic {
  readonly code: string;
  readonly severity: "error";
  readonly message: string;
  readonly field: DeployDiagnosticField;
}

export interface EffectsPolicy {
  readonly allowedEffects: readonly string[];
  readonly allowedTargets: readonly DeploymentTarget[];
  readonly requireVerified: boolean;
}

export interface DeployManifestSlice {
  readonly allowedEffects: readonly string[];
  readonly verified: boolean;
}

export interface ValidateEffectsInput {
  readonly manifest: DeployManifestSlice;
  readonly policy: EffectsPolicy;
  readonly target: DeploymentTarget;
}

export interface DeploymentResult {
  readonly success: boolean;
  readonly target: DeploymentTarget;
  readonly manifestHash: string;
  readonly diagnostics: readonly DeployDiagnostic[];
  readonly reportPath?: string;
}

const EFFECT = /^[a-z][A-Za-z0-9_]*(?:\.[a-z][A-Za-z0-9_]*)*$/;
const SHA256 = /^sha256:[0-9a-f]{64}$/;
const MAX_TOKEN = 128;
const MAX_LIST = 4096;
const TARGET_SET = new Set<string>(DEPLOYMENT_TARGETS);

const diag = (code: string, message: string, field: DeployDiagnosticField): DeployDiagnostic =>
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

function strictlyAscendingTargets(xs: readonly DeploymentTarget[]): boolean {
  return xs.every((x, i) => i === 0 || (xs[i - 1] as string) < x);
}

/** True when value is one of the closed DeploymentTarget tokens (exact string match). */
export function isDeploymentTarget(value: unknown): value is DeploymentTarget {
  return typeof value === "string" && TARGET_SET.has(value);
}

function readEffectList(
  value: unknown,
  field: DeployDiagnosticField,
  out: DeployDiagnostic[],
): readonly string[] | undefined {
  const items = snapshotArray(value, MAX_LIST);
  if (items === undefined) {
    out.push(diag(FUNGI_DEPLOY_001, "Effect list must be a dense array within bounds.", field));
    return undefined;
  }
  const strings: string[] = [];
  for (const item of items) {
    if (typeof item !== "string" || item.length === 0 || item.length > MAX_TOKEN || !EFFECT.test(item)) {
      out.push(diag(FUNGI_DEPLOY_002, "Effect token is outside the closed domain.", field));
      return undefined;
    }
    strings.push(item);
  }
  if (!strictlyAscending(strings)) {
    out.push(diag(FUNGI_DEPLOY_002, "Effect list must be strictly ascending with no duplicates.", field));
    return undefined;
  }
  return Object.freeze(strings);
}

function readTargetList(
  value: unknown,
  field: DeployDiagnosticField,
  out: DeployDiagnostic[],
): readonly DeploymentTarget[] | undefined {
  const items = snapshotArray(value, DEPLOYMENT_TARGETS.length);
  if (items === undefined) {
    out.push(diag(FUNGI_DEPLOY_001, "Target list must be a dense array within bounds.", field));
    return undefined;
  }
  const targets: DeploymentTarget[] = [];
  for (const item of items) {
    if (!isDeploymentTarget(item)) {
      out.push(diag(FUNGI_DEPLOY_002, "Target token is outside the closed vocabulary.", field));
      return undefined;
    }
    targets.push(item);
  }
  if (!strictlyAscendingTargets(targets)) {
    out.push(diag(FUNGI_DEPLOY_002, "Target list must be strictly ascending with no duplicates.", field));
    return undefined;
  }
  return Object.freeze(targets);
}

function readPolicy(value: unknown, out: DeployDiagnostic[]): EffectsPolicy | undefined {
  const snap = snapshotRecord(value, EFFECTS_POLICY_FIELDS.length + 8);
  if (!snap.ok) {
    out.push(diag(FUNGI_DEPLOY_001, "Effects policy must be a plain data object.", "policy"));
    return undefined;
  }
  const known = new Set<string>(EFFECTS_POLICY_FIELDS);
  if ([...snap.values.keys()].some((k) => !known.has(k))) {
    out.push(diag(FUNGI_DEPLOY_001, "Effects policy has a key outside the closed shape.", "policy"));
    return undefined;
  }
  for (const field of EFFECTS_POLICY_FIELDS) {
    if (!snap.values.has(field)) {
      out.push(diag(FUNGI_DEPLOY_001, "Effects policy is missing a required field.", field as DeployDiagnosticField));
      return undefined;
    }
  }
  const allowedEffects = readEffectList(snap.values.get("allowedEffects"), "allowedEffects", out);
  if (allowedEffects === undefined) return undefined;
  const allowedTargets = readTargetList(snap.values.get("allowedTargets"), "allowedTargets", out);
  if (allowedTargets === undefined) return undefined;
  const requireVerified = snap.values.get("requireVerified");
  if (requireVerified !== true && requireVerified !== false) {
    out.push(diag(FUNGI_DEPLOY_002, "requireVerified must be a boolean.", "requireVerified"));
    return undefined;
  }
  return Object.freeze({ allowedEffects, allowedTargets, requireVerified });
}

function readManifestSlice(value: unknown, out: DeployDiagnostic[]): DeployManifestSlice | undefined {
  const snap = snapshotRecord(value, DEPLOY_MANIFEST_SLICE_FIELDS.length + 8);
  if (!snap.ok) {
    out.push(diag(FUNGI_DEPLOY_001, "Deploy manifest slice must be a plain data object.", "manifest"));
    return undefined;
  }
  const known = new Set<string>(DEPLOY_MANIFEST_SLICE_FIELDS);
  if ([...snap.values.keys()].some((k) => !known.has(k))) {
    out.push(diag(FUNGI_DEPLOY_001, "Deploy manifest slice has a key outside the closed shape.", "manifest"));
    return undefined;
  }
  for (const field of DEPLOY_MANIFEST_SLICE_FIELDS) {
    if (!snap.values.has(field)) {
      out.push(diag(FUNGI_DEPLOY_001, "Deploy manifest slice is missing a required field.", field as DeployDiagnosticField));
      return undefined;
    }
  }
  const allowedEffects = readEffectList(snap.values.get("allowedEffects"), "allowedEffects", out);
  if (allowedEffects === undefined) return undefined;
  const verified = snap.values.get("verified");
  if (verified !== true && verified !== false) {
    out.push(diag(FUNGI_DEPLOY_002, "verified must be a boolean.", "verified"));
    return undefined;
  }
  return Object.freeze({ allowedEffects, verified });
}

function readDiagnosticsList(value: unknown, out: DeployDiagnostic[]): readonly DeployDiagnostic[] | undefined {
  const items = snapshotArray(value, MAX_LIST);
  if (items === undefined) {
    out.push(diag(FUNGI_DEPLOY_001, "Diagnostics must be a dense array within bounds.", "diagnostics"));
    return undefined;
  }
  const list: DeployDiagnostic[] = [];
  for (const item of items) {
    const snap = snapshotRecord(item, 8);
    if (!snap.ok) {
      out.push(diag(FUNGI_DEPLOY_001, "Diagnostic entry must be a plain data object.", "diagnostics"));
      return undefined;
    }
    if (
      snap.values.size !== 4 ||
      !snap.values.has("code") ||
      !snap.values.has("severity") ||
      !snap.values.has("message") ||
      !snap.values.has("field")
    ) {
      out.push(diag(FUNGI_DEPLOY_001, "Diagnostic entry must have exactly code|severity|message|field.", "diagnostics"));
      return undefined;
    }
    const code = snap.values.get("code");
    const severity = snap.values.get("severity");
    const message = snap.values.get("message");
    const field = snap.values.get("field");
    if (typeof code !== "string" || code.length === 0 || code.length > MAX_TOKEN) {
      out.push(diag(FUNGI_DEPLOY_002, "Diagnostic code is outside the closed domain.", "diagnostics"));
      return undefined;
    }
    if (severity !== "error") {
      out.push(diag(FUNGI_DEPLOY_002, "Diagnostic severity must be error.", "diagnostics"));
      return undefined;
    }
    if (typeof message !== "string" || message.length === 0 || message.length > 512) {
      out.push(diag(FUNGI_DEPLOY_002, "Diagnostic message is outside the closed domain.", "diagnostics"));
      return undefined;
    }
    if (typeof field !== "string" || field.length === 0 || field.length > MAX_TOKEN) {
      out.push(diag(FUNGI_DEPLOY_002, "Diagnostic field is outside the closed domain.", "diagnostics"));
      return undefined;
    }
    list.push(Object.freeze({ code, severity: "error" as const, message, field: field as DeployDiagnosticField }));
  }
  return Object.freeze(list);
}

/**
 * Read a closed-shape DeploymentResult. success must equal (diagnostics length === 0).
 * reportPath is optional; when present it must be a non-empty relative path token without
 * traversal. Never throws; never echoes values.
 */
export function readDeploymentResult(
  value: unknown,
): { readonly ok: true; readonly value: DeploymentResult } | { readonly ok: false; readonly diagnostics: readonly DeployDiagnostic[] } {
  const out: DeployDiagnostic[] = [];
  const snap = snapshotRecord(value, DEPLOYMENT_RESULT_FIELDS.length + 8);
  if (!snap.ok) {
    out.push(diag(FUNGI_DEPLOY_001, "DeploymentResult must be a plain data object.", "record"));
    return { ok: false, diagnostics: Object.freeze(out) };
  }
  const known = new Set<string>(DEPLOYMENT_RESULT_FIELDS);
  if ([...snap.values.keys()].some((k) => !known.has(k))) {
    out.push(diag(FUNGI_DEPLOY_001, "DeploymentResult has a key outside the closed shape.", "record"));
    return { ok: false, diagnostics: Object.freeze(out) };
  }
  for (const field of ["success", "target", "manifestHash", "diagnostics"] as const) {
    if (!snap.values.has(field)) {
      out.push(diag(FUNGI_DEPLOY_001, "DeploymentResult is missing a required field.", field));
      return { ok: false, diagnostics: Object.freeze(out) };
    }
  }
  const success = snap.values.get("success");
  if (success !== true && success !== false) {
    out.push(diag(FUNGI_DEPLOY_002, "success must be a boolean.", "success"));
    return { ok: false, diagnostics: Object.freeze(out) };
  }
  const target = snap.values.get("target");
  if (!isDeploymentTarget(target)) {
    out.push(diag(FUNGI_DEPLOY_002, "target is outside the closed vocabulary.", "target"));
    return { ok: false, diagnostics: Object.freeze(out) };
  }
  const manifestHash = snap.values.get("manifestHash");
  if (typeof manifestHash !== "string" || !SHA256.test(manifestHash)) {
    out.push(diag(FUNGI_DEPLOY_002, "manifestHash must be sha256:<64 lower-case hex>.", "manifestHash"));
    return { ok: false, diagnostics: Object.freeze(out) };
  }
  const diagnostics = readDiagnosticsList(snap.values.get("diagnostics"), out);
  if (diagnostics === undefined) return { ok: false, diagnostics: Object.freeze(out) };
  let reportPath: string | undefined;
  if (snap.values.has("reportPath")) {
    const rp = snap.values.get("reportPath");
    if (
      typeof rp !== "string" ||
      rp.length === 0 ||
      rp.length > 256 ||
      rp.includes("\0") ||
      rp.includes("..") ||
      rp.startsWith("/") ||
      rp.startsWith("\\") ||
      /^[A-Za-z]:/.test(rp)
    ) {
      out.push(diag(FUNGI_DEPLOY_002, "reportPath must be a relative path token without traversal.", "reportPath"));
      return { ok: false, diagnostics: Object.freeze(out) };
    }
    reportPath = rp;
  }
  if (success !== (diagnostics.length === 0)) {
    out.push(diag(FUNGI_DEPLOY_002, "success must equal (diagnostics length === 0).", "success"));
    return { ok: false, diagnostics: Object.freeze(out) };
  }
  const result: DeploymentResult =
    reportPath === undefined
      ? Object.freeze({ success, target, manifestHash, diagnostics })
      : Object.freeze({ success, target, manifestHash, diagnostics, reportPath });
  return { ok: true, value: result };
}

/** Build a frozen DeploymentResult from parts. success is recomputed from diagnostics. */
export function createDeploymentResult(
  target: DeploymentTarget,
  manifestHash: string,
  diagnostics: readonly DeployDiagnostic[],
  reportPath?: string,
): DeploymentResult {
  if (!isDeploymentTarget(target)) {
    return Object.freeze({
      success: false,
      target: "node",
      manifestHash: "sha256:" + "0".repeat(64),
      diagnostics: Object.freeze([diag(FUNGI_DEPLOY_002, "target is outside the closed vocabulary.", "target")]),
    });
  }
  if (typeof manifestHash !== "string" || !SHA256.test(manifestHash)) {
    return Object.freeze({
      success: false,
      target,
      manifestHash: "sha256:" + "0".repeat(64),
      diagnostics: Object.freeze([diag(FUNGI_DEPLOY_002, "manifestHash must be sha256:<64 lower-case hex>.", "manifestHash")]),
    });
  }
  const list = Array.isArray(diagnostics)
    ? Object.freeze([...diagnostics])
    : Object.freeze([diag(FUNGI_DEPLOY_001, "Diagnostics must be a dense array.", "diagnostics")]);
  if (reportPath !== undefined) {
    if (
      typeof reportPath !== "string" ||
      reportPath.length === 0 ||
      reportPath.length > 256 ||
      reportPath.includes("\0") ||
      reportPath.includes("..") ||
      reportPath.startsWith("/") ||
      reportPath.startsWith("\\") ||
      /^[A-Za-z]:/.test(reportPath)
    ) {
      return Object.freeze({
        success: false,
        target,
        manifestHash,
        diagnostics: Object.freeze([
          diag(FUNGI_DEPLOY_002, "reportPath must be a relative path token without traversal.", "reportPath"),
        ]),
      });
    }
    return Object.freeze({ success: list.length === 0, target, manifestHash, diagnostics: list, reportPath });
  }
  return Object.freeze({ success: list.length === 0, target, manifestHash, diagnostics: list });
}

/**
 * Validate effects for a deployment target against a closed EffectsPolicy.
 * Never throws. Never echoes effect names or targets.
 */
export function validateEffects(input: unknown): readonly DeployDiagnostic[] {
  const out: DeployDiagnostic[] = [];
  const snap = snapshotRecord(input, VALIDATE_EFFECTS_INPUT_FIELDS.length + 8);
  if (!snap.ok) {
    out.push(diag(FUNGI_DEPLOY_001, "ValidateEffectsInput must be a plain data object.", "input"));
    return Object.freeze(out);
  }
  const known = new Set<string>(VALIDATE_EFFECTS_INPUT_FIELDS);
  if ([...snap.values.keys()].some((k) => !known.has(k))) {
    out.push(diag(FUNGI_DEPLOY_001, "ValidateEffectsInput has a key outside the closed shape.", "input"));
    return Object.freeze(out);
  }
  for (const field of VALIDATE_EFFECTS_INPUT_FIELDS) {
    if (!snap.values.has(field)) {
      out.push(diag(FUNGI_DEPLOY_001, "ValidateEffectsInput is missing a required field.", field as DeployDiagnosticField));
      return Object.freeze(out);
    }
  }

  const targetRaw = snap.values.get("target");
  if (!isDeploymentTarget(targetRaw)) {
    out.push(diag(FUNGI_DEPLOY_002, "target is outside the closed vocabulary.", "target"));
    return Object.freeze(out);
  }
  const target = targetRaw;

  const policy = readPolicy(snap.values.get("policy"), out);
  if (policy === undefined) return Object.freeze(out);
  const manifest = readManifestSlice(snap.values.get("manifest"), out);
  if (manifest === undefined) return Object.freeze(out);

  if (!policy.allowedTargets.includes(target)) {
    out.push(diag(FUNGI_DEPLOY_004, "Deployment target is not admitted by the policy.", "target"));
  }

  if (policy.requireVerified === true && manifest.verified !== true) {
    out.push(diag(FUNGI_DEPLOY_005, "Policy requires a verified manifest slice.", "verified"));
  }

  const allowed = new Set(policy.allowedEffects);
  for (const effect of manifest.allowedEffects) {
    if (!allowed.has(effect)) {
      out.push(diag(FUNGI_DEPLOY_003, "A declared effect is denied by the deployment policy.", "allowedEffects"));
      break;
    }
  }

  return Object.freeze(out);
}

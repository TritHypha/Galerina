// Closed-shape deploy policy reader (SuperGrok 2026-10-08; zero-trust defaults, owner may revisit).
//
// Two admitted shapes:
//   1. EffectsPolicy (three fields) — existing dry-run --policy files.
//   2. galerina.deploy-policy/v1 — schema + capabilities + environment on top of
//      the EffectsPolicy slice.
//
// Never throws. Never echoes keys, tokens, environments, or paths.
// Does not load an environment config file (that row stays HOLD).

import {
  FUNGI_DEPLOY_001,
  FUNGI_DEPLOY_002,
  isDeploymentTarget,
  type DeployDiagnostic,
  type DeployDiagnosticField,
  type DeploymentTarget,
  type EffectsPolicy,
} from "./deploy-validator.js";

export const DEPLOY_POLICY_SCHEMA = "galerina.deploy-policy/v1";

export const DEPLOY_POLICY_ENVIRONMENTS = Object.freeze([
  "development",
  "test",
  "staging",
  "production",
] as const);

export type DeployPolicyEnvironment = (typeof DEPLOY_POLICY_ENVIRONMENTS)[number];

export const DEPLOY_POLICY_V1_FIELDS = Object.freeze([
  "schema",
  "allowedEffects",
  "allowedTargets",
  "requireVerified",
  "capabilities",
  "environment",
] as const);

const POLICY_SLICE_FIELDS = Object.freeze([
  "allowedEffects",
  "allowedTargets",
  "requireVerified",
] as const);

export interface DeployPolicy {
  readonly policy: EffectsPolicy;
  readonly capabilities: readonly string[];
  readonly environment?: DeployPolicyEnvironment;
}

const EFFECT = /^[a-z][A-Za-z0-9_]*(?:\.[a-z][A-Za-z0-9_]*)*$/;
const TOKEN = /^[a-z][A-Za-z0-9_]*(?:\.[a-z][A-Za-z0-9_]*)*$/;
const MAX_TOKEN = 128;
const MAX_LIST = 4096;
const ENV_SET = new Set<string>(DEPLOY_POLICY_ENVIRONMENTS);
const TARGET_MAX = 16;

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

function readTokenList(
  value: unknown,
  field: DeployDiagnosticField,
  pattern: RegExp,
  out: DeployDiagnostic[],
): readonly string[] | undefined {
  const items = snapshotArray(value, MAX_LIST);
  if (items === undefined) {
    out.push(diag(FUNGI_DEPLOY_001, "Token list must be a dense array within bounds.", field));
    return undefined;
  }
  const strings: string[] = [];
  for (const item of items) {
    if (typeof item !== "string" || item.length === 0 || item.length > MAX_TOKEN || !pattern.test(item)) {
      out.push(diag(FUNGI_DEPLOY_002, "Token is outside the closed domain.", field));
      return undefined;
    }
    strings.push(item);
  }
  if (!strictlyAscending(strings)) {
    out.push(diag(FUNGI_DEPLOY_002, "Token list must be strictly ascending with no duplicates.", field));
    return undefined;
  }
  return Object.freeze(strings);
}

function readTargetList(value: unknown, out: DeployDiagnostic[]): readonly DeploymentTarget[] | undefined {
  const items = snapshotArray(value, TARGET_MAX);
  if (items === undefined) {
    out.push(diag(FUNGI_DEPLOY_001, "Target list must be a dense array within bounds.", "allowedTargets"));
    return undefined;
  }
  const targets: DeploymentTarget[] = [];
  for (const item of items) {
    if (!isDeploymentTarget(item)) {
      out.push(diag(FUNGI_DEPLOY_002, "Target token is outside the closed vocabulary.", "allowedTargets"));
      return undefined;
    }
    targets.push(item);
  }
  if (!strictlyAscending(targets as readonly string[])) {
    out.push(diag(FUNGI_DEPLOY_002, "Target list must be strictly ascending with no duplicates.", "allowedTargets"));
    return undefined;
  }
  return Object.freeze(targets);
}

function readEffectsSlice(
  values: ReadonlyMap<string, unknown>,
  out: DeployDiagnostic[],
): EffectsPolicy | undefined {
  const allowedEffects = readTokenList(values.get("allowedEffects"), "allowedEffects", EFFECT, out);
  if (allowedEffects === undefined) return undefined;
  const allowedTargets = readTargetList(values.get("allowedTargets"), out);
  if (allowedTargets === undefined) return undefined;
  const requireVerified = values.get("requireVerified");
  if (requireVerified !== true && requireVerified !== false) {
    out.push(diag(FUNGI_DEPLOY_002, "requireVerified must be a boolean.", "requireVerified"));
    return undefined;
  }
  return Object.freeze({ allowedEffects, allowedTargets, requireVerified });
}

/**
 * Read a closed-shape deploy policy. Never throws; never echoes values.
 */
export function readDeployPolicy(
  value: unknown,
):
  | { readonly ok: true; readonly value: DeployPolicy }
  | { readonly ok: false; readonly diagnostics: readonly DeployDiagnostic[] } {
  const out: DeployDiagnostic[] = [];
  const snap = snapshotRecord(value, DEPLOY_POLICY_V1_FIELDS.length + 8);
  if (!snap.ok) {
    out.push(diag(FUNGI_DEPLOY_001, "Deploy policy must be a plain data object.", "policy"));
    return { ok: false, diagnostics: Object.freeze(out) };
  }

  if (snap.values.has("schema")) {
    const known = new Set<string>(DEPLOY_POLICY_V1_FIELDS);
    if ([...snap.values.keys()].some((k) => !known.has(k))) {
      out.push(diag(FUNGI_DEPLOY_001, "Deploy policy has a key outside the closed v1 shape.", "policy"));
      return { ok: false, diagnostics: Object.freeze(out) };
    }
    for (const field of DEPLOY_POLICY_V1_FIELDS) {
      if (!snap.values.has(field)) {
        out.push(diag(FUNGI_DEPLOY_001, "Deploy policy is missing a required v1 field.", "policy"));
        return { ok: false, diagnostics: Object.freeze(out) };
      }
    }
    if (snap.values.get("schema") !== DEPLOY_POLICY_SCHEMA) {
      out.push(diag(FUNGI_DEPLOY_001, "Deploy policy schema is not admitted.", "schema"));
      return { ok: false, diagnostics: Object.freeze(out) };
    }
    const policy = readEffectsSlice(snap.values, out);
    if (policy === undefined) return { ok: false, diagnostics: Object.freeze(out) };
    const capabilities = readTokenList(snap.values.get("capabilities"), "capabilities", TOKEN, out);
    if (capabilities === undefined) return { ok: false, diagnostics: Object.freeze(out) };
    const environment = snap.values.get("environment");
    if (typeof environment !== "string" || !ENV_SET.has(environment)) {
      out.push(diag(FUNGI_DEPLOY_002, "environment is outside the closed vocabulary.", "environment"));
      return { ok: false, diagnostics: Object.freeze(out) };
    }
    return {
      ok: true,
      value: Object.freeze({
        policy,
        capabilities,
        environment: environment as DeployPolicyEnvironment,
      }),
    };
  }

  const known = new Set<string>(POLICY_SLICE_FIELDS);
  if ([...snap.values.keys()].some((k) => !known.has(k))) {
    out.push(diag(FUNGI_DEPLOY_001, "Effects policy has a key outside the closed shape.", "policy"));
    return { ok: false, diagnostics: Object.freeze(out) };
  }
  for (const field of POLICY_SLICE_FIELDS) {
    if (!snap.values.has(field)) {
      out.push(diag(FUNGI_DEPLOY_001, "Effects policy is missing a required field.", field as DeployDiagnosticField));
      return { ok: false, diagnostics: Object.freeze(out) };
    }
  }
  const policy = readEffectsSlice(snap.values, out);
  if (policy === undefined) return { ok: false, diagnostics: Object.freeze(out) };
  return { ok: true, value: Object.freeze({ policy, capabilities: Object.freeze([]) }) };
}

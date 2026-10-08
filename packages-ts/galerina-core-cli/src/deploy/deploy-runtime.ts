// Closed-shape workspace live runtime profile (SuperGrok 2026-10-08; zero-trust
// defaults, owner may revisit).
//
// Reads a declared galerina.deploy-runtime/v1 JSON object. Does NOT probe a live
// host, process, or network. Never throws. Never echoes refused values / paths /
// keys.
//
// Codes: FUNGI-DEPLOY-006 shape/schema, FUNGI-DEPLOY-007 domain (token / target /
// memory), FUNGI-DEPLOY-008 consistency (target mismatch vs --target).

import {
  FUNGI_DEPLOY_003,
  FUNGI_DEPLOY_006,
  FUNGI_DEPLOY_007,
  FUNGI_DEPLOY_008,
  isDeploymentTarget,
  type DeployDiagnostic,
  type DeployDiagnosticField,
  type DeploymentTarget,
} from "./deploy-validator.js";

export const DEPLOY_RUNTIME_SCHEMA = "galerina.deploy-runtime/v1";

export const DEPLOY_RUNTIME_PROFILE_FIELDS = Object.freeze([
  "schema",
  "profile",
  "target",
  "effects",
  "capabilities",
  "memoryMb",
] as const);

export interface DeployRuntimeProfile {
  readonly schema: typeof DEPLOY_RUNTIME_SCHEMA;
  readonly profile: string;
  readonly target: DeploymentTarget;
  readonly effects: readonly string[];
  readonly capabilities: readonly string[];
  readonly memoryMb?: number;
}

const TOKEN = /^[a-z][A-Za-z0-9_]*(?:\.[a-z][A-Za-z0-9_]*)*$/;
const MAX_TOKEN = 128;
const MAX_LIST = 4096;
const MAX_MEMORY_MB = 1_048_576;
const REQUIRED = Object.freeze(["schema", "profile", "target", "effects", "capabilities"] as const);
const OPTIONAL = Object.freeze(["memoryMb"] as const);
const KNOWN = new Set<string>([...REQUIRED, ...OPTIONAL]);

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

function readToken(
  value: unknown,
  field: DeployDiagnosticField,
  out: DeployDiagnostic[],
): string | undefined {
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_TOKEN || !TOKEN.test(value)) {
    out.push(diag(FUNGI_DEPLOY_007, "Runtime token is outside the closed domain.", field));
    return undefined;
  }
  return value;
}

function readTokenList(
  value: unknown,
  field: DeployDiagnosticField,
  out: DeployDiagnostic[],
): readonly string[] | undefined {
  const items = snapshotArray(value, MAX_LIST);
  if (items === undefined) {
    out.push(diag(FUNGI_DEPLOY_006, "Token list must be a dense array within bounds.", field));
    return undefined;
  }
  const strings: string[] = [];
  for (const item of items) {
    if (typeof item !== "string" || item.length === 0 || item.length > MAX_TOKEN || !TOKEN.test(item)) {
      out.push(diag(FUNGI_DEPLOY_007, "Runtime token is outside the closed domain.", field));
      return undefined;
    }
    strings.push(item);
  }
  if (!strictlyAscending(strings)) {
    out.push(diag(FUNGI_DEPLOY_007, "Token list must be strictly ascending with no duplicates.", field));
    return undefined;
  }
  return Object.freeze(strings);
}

/**
 * Read a closed-shape DeployRuntimeProfile. Never throws; never echoes values.
 */
export function readDeployRuntimeProfile(
  value: unknown,
):
  | { readonly ok: true; readonly value: DeployRuntimeProfile }
  | { readonly ok: false; readonly diagnostics: readonly DeployDiagnostic[] } {
  const out: DeployDiagnostic[] = [];
  const snap = snapshotRecord(value, DEPLOY_RUNTIME_PROFILE_FIELDS.length + 8);
  if (!snap.ok) {
    out.push(diag(FUNGI_DEPLOY_006, "DeployRuntimeProfile must be a plain data object.", "runtime"));
    return { ok: false, diagnostics: Object.freeze(out) };
  }
  for (const key of snap.values.keys()) {
    if (!KNOWN.has(key)) {
      out.push(diag(FUNGI_DEPLOY_006, "DeployRuntimeProfile has an unknown key.", "runtime"));
      return { ok: false, diagnostics: Object.freeze(out) };
    }
  }
  for (const req of REQUIRED) {
    if (!snap.values.has(req)) {
      out.push(diag(FUNGI_DEPLOY_006, "DeployRuntimeProfile is missing a required field.", "runtime"));
      return { ok: false, diagnostics: Object.freeze(out) };
    }
  }
  if (snap.values.get("schema") !== DEPLOY_RUNTIME_SCHEMA) {
    out.push(diag(FUNGI_DEPLOY_006, "DeployRuntimeProfile schema is not admitted.", "schema"));
    return { ok: false, diagnostics: Object.freeze(out) };
  }
  const profile = readToken(snap.values.get("profile"), "profile", out);
  if (profile === undefined) return { ok: false, diagnostics: Object.freeze(out) };
  const targetRaw = snap.values.get("target");
  if (!isDeploymentTarget(targetRaw)) {
    out.push(diag(FUNGI_DEPLOY_007, "Runtime target is outside the closed vocabulary.", "target"));
    return { ok: false, diagnostics: Object.freeze(out) };
  }
  const effects = readTokenList(snap.values.get("effects"), "effects", out);
  if (effects === undefined) return { ok: false, diagnostics: Object.freeze(out) };
  const capabilities = readTokenList(snap.values.get("capabilities"), "capabilities", out);
  if (capabilities === undefined) return { ok: false, diagnostics: Object.freeze(out) };

  let memoryMb: number | undefined;
  if (snap.values.has("memoryMb")) {
    const m = snap.values.get("memoryMb");
    if (typeof m !== "number" || !Number.isInteger(m) || m <= 0 || m > MAX_MEMORY_MB || Object.is(m, -0)) {
      out.push(diag(FUNGI_DEPLOY_007, "memoryMb is outside the closed domain.", "runtime"));
      return { ok: false, diagnostics: Object.freeze(out) };
    }
    memoryMb = m;
  }

  return {
    ok: true,
    value: Object.freeze({
      schema: DEPLOY_RUNTIME_SCHEMA,
      profile,
      target: targetRaw,
      effects,
      capabilities,
      ...(memoryMb !== undefined ? { memoryMb } : {}),
    }),
  };
}

/**
 * Fail-closed consistency: declared runtime target must equal the CLI --target.
 * Effects must be a subset of the policy allowedEffects. Never echoes tokens.
 */
export function checkDeployRuntimeConsistency(
  profile: DeployRuntimeProfile,
  target: DeploymentTarget,
  allowedEffects: readonly string[],
): readonly DeployDiagnostic[] {
  const out: DeployDiagnostic[] = [];
  if (profile.target !== target) {
    out.push(diag(FUNGI_DEPLOY_008, "Runtime profile target does not match --target.", "target"));
  }
  const allowed = new Set(allowedEffects);
  for (const effect of profile.effects) {
    if (!allowed.has(effect)) {
      out.push(diag(FUNGI_DEPLOY_003, "A declared runtime effect is denied by the deployment policy.", "effects"));
      break;
    }
  }
  return Object.freeze(out);
}

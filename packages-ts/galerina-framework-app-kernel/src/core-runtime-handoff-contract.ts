// App-kernel <-> core-runtime handoff contract (TODO pass, SuperGrok 2026-10-07;
// closed Open L30 2026-10-08; zero-trust defaults, owner may revisit).
//
// Closed-shape CoreRuntimeHandoff for the app-kernel TODO row "Define app-kernel
// to galerina-core-runtime handoff contract". Records a deny-all seam-version +
// effect-policy descriptor that REFERENCES structured-await-policy, queue-job-
// contract and runtime-audit-report-format (does not copy their fields). It is
// not wired into kernel.ts (RD-1413) and does not add an @galerina/core-runtime
// package dependency.
//
// Live crossing today: none. app-kernel package.json depends on core-config and
// tower-citizen only. core-runtime comment (src/index.ts) says the app-kernel is
// allowed to depend on core-runtime; live package.json does not. Unplugged
// executor stays deny-all (DENY_ALL_RUNTIME_EXECUTOR).
//
// Omitted on purpose (OWNER-REVISIT; fail-closed default = omit):
//  - GovernedRuntimeRequest WASM twin fields (artifactSha256, attestation,
//    exportName, args) — fusing twin-WASM execution into this request handoff
//    is a separate named contract if the owner wants it.
//  - RuntimeContext mode / projectRoot / environment / entryFile / timeoutMs.
//  - A live executor identity (executorBinding is deny_all only).
//  - Lifting Structured Await queue_handoff.
//  - SLIDE admission / VOK receipts on this handoff (Galerina-only expected).
//
// Zero-trust rules: closed shapes via property descriptors (no getters run;
// proxies / symbols / accessors / custom prototypes refuse); unknown keys
// refuse; diagnostics never echo keys, tokens, values, paths or ids; never
// throws.

import { types as nodeUtilTypes } from "node:util";

import { QUEUE_JOB_CONTRACT_SCHEMA } from "./queue-job-contract.js";
import { RUNTIME_AUDIT_REPORT_FORMAT_SCHEMA } from "./runtime-audit-report-format.js";
import { STRUCTURED_AWAIT_POLICY_SCHEMA } from "./structured-await-policy.js";

const isProxy = (value: unknown): boolean => nodeUtilTypes.isProxy(value);

/** Record / input is not a closed data object. */
export const FUNGI_APPK_CRH_001 = "FUNGI-APPK-CRH-001";
/** A field value is outside its closed domain. */
export const FUNGI_APPK_CRH_002 = "FUNGI-APPK-CRH-002";
/** Contract consistency refuse (effect list, reference tokens). */
export const FUNGI_APPK_CRH_003 = "FUNGI-APPK-CRH-003";
/** Nested record / list refuse. */
export const FUNGI_APPK_CRH_004 = "FUNGI-APPK-CRH-004";
/** Result consistency refuse. */
export const FUNGI_APPK_CRH_005 = "FUNGI-APPK-CRH-005";

export const CORE_RUNTIME_HANDOFF_SCHEMA = "galerina.app-kernel.core-runtime-handoff/v1";

/**
 * Mirrored from galerina-core-runtime GOVERNED_RUNTIME_SEAM_VERSION. No package
 * import: a filesystem drift test pins the string. Mismatch binds deny-all on
 * the producer seam.
 */
export const CORE_RUNTIME_SEAM_VERSION = "galerina.runtime.seam.v1";

/** Unplugged executor only. A live executor identity is OWNER-REVISIT. */
export const CORE_RUNTIME_EXECUTOR_BINDINGS = Object.freeze(["deny_all"] as const);
export type CoreRuntimeExecutorBinding = (typeof CORE_RUNTIME_EXECUTOR_BINDINGS)[number];

/**
 * Closed default matching core-runtime DEFAULT_RUNTIME_EFFECT_POLICY.
 * Adding filesystem / network / process / environment is OWNER-REVISIT.
 */
export const CORE_RUNTIME_ALLOWED_EFFECTS = Object.freeze(["clock", "random"] as const);
export type CoreRuntimeAllowedEffect = (typeof CORE_RUNTIME_ALLOWED_EFFECTS)[number];

export const CORE_RUNTIME_HANDOFF_FIELDS = Object.freeze([
  "schema",
  "name",
  "seamVersion",
  "executorBinding",
  "effectPolicy",
  "structuredAwait",
  "queueJob",
  "audit",
  "diagnostics",
] as const);

export const CORE_RUNTIME_EFFECT_POLICY_FIELDS = Object.freeze([
  "allowedEffects",
  "denyProcessEffects",
  "requireExplicitNetworkPermission",
] as const);

export const CORE_RUNTIME_OMITTED_SEAM_FIELDS = Object.freeze([
  "artifactSha256",
  "attestation",
  "exportName",
  "args",
  "mode",
  "projectRoot",
  "environment",
  "entryFile",
  "timeoutMs",
] as const);

export type CoreRuntimeHandoffDiagnosticField =
  | "record"
  | "schema"
  | "name"
  | "seamVersion"
  | "executorBinding"
  | "effectPolicy"
  | "allowedEffects"
  | "denyProcessEffects"
  | "requireExplicitNetworkPermission"
  | "structuredAwait"
  | "queueJob"
  | "audit"
  | "diagnostics";

export interface CoreRuntimeHandoffDiagnostic {
  readonly code: string;
  readonly severity: "error";
  readonly message: string;
  readonly field: string;
}

export interface CoreRuntimeEffectPolicy {
  readonly allowedEffects: readonly CoreRuntimeAllowedEffect[];
  readonly denyProcessEffects: true;
  readonly requireExplicitNetworkPermission: true;
}

export interface CoreRuntimeHandoff {
  readonly schema: typeof CORE_RUNTIME_HANDOFF_SCHEMA;
  readonly name: string;
  readonly seamVersion: typeof CORE_RUNTIME_SEAM_VERSION;
  readonly executorBinding: CoreRuntimeExecutorBinding;
  readonly effectPolicy: CoreRuntimeEffectPolicy;
  readonly structuredAwait: typeof STRUCTURED_AWAIT_POLICY_SCHEMA;
  readonly queueJob: typeof QUEUE_JOB_CONTRACT_SCHEMA;
  readonly audit: typeof RUNTIME_AUDIT_REPORT_FORMAT_SCHEMA;
  readonly diagnostics: readonly CoreRuntimeHandoffDiagnostic[];
}

export type ReadCoreRuntimeHandoffResult =
  | { readonly ok: true; readonly value: CoreRuntimeHandoff }
  | { readonly ok: false; readonly diagnostics: readonly CoreRuntimeHandoffDiagnostic[] };

export type CoreRuntimeHandoffCheck =
  | { readonly ok: true; readonly schema: typeof CORE_RUNTIME_HANDOFF_SCHEMA }
  | {
      readonly ok: false;
      readonly schema: typeof CORE_RUNTIME_HANDOFF_SCHEMA;
      readonly diagnostics: readonly CoreRuntimeHandoffDiagnostic[];
    };

const TYPE_NAME = /^[A-Z][A-Za-z0-9_]{0,63}$/;
const MAX_TOKEN = 128;
const EXECUTOR_SET = new Set<string>(CORE_RUNTIME_EXECUTOR_BINDINGS);

const diag = (code: string, message: string, field: string): CoreRuntimeHandoffDiagnostic =>
  Object.freeze({ code, severity: "error" as const, message, field });

type Snapshot = { readonly ok: true; readonly values: ReadonlyMap<string, unknown> } | { readonly ok: false };

function snapshotRecord(value: unknown, maxKeys: number): Snapshot {
  try {
    if (value === null || typeof value !== "object" || Array.isArray(value) || isProxy(value)) return { ok: false };
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
    if (!Array.isArray(value) || isProxy(value) || Object.getPrototypeOf(value) !== Array.prototype) return undefined;
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

function requireKeysSubset(
  snap: Extract<Snapshot, { ok: true }>,
  allowed: readonly string[],
  required: readonly string[],
  field: string,
  out: CoreRuntimeHandoffDiagnostic[],
): boolean {
  const allowedSet = new Set(allowed);
  for (const key of snap.values.keys()) {
    if (!allowedSet.has(key)) {
      out.push(diag(FUNGI_APPK_CRH_001, "Record has a key outside the closed shape.", field));
      return false;
    }
  }
  for (const key of required) {
    if (!snap.values.has(key)) {
      out.push(diag(FUNGI_APPK_CRH_001, "Record is missing a required field.", field));
      return false;
    }
  }
  return true;
}

function snapshotDiagnostics(
  value: unknown,
  out: CoreRuntimeHandoffDiagnostic[],
): readonly CoreRuntimeHandoffDiagnostic[] | undefined {
  const items = snapshotArray(value, 4096);
  if (items === undefined) {
    out.push(diag(FUNGI_APPK_CRH_001, "Diagnostics must be a dense array within bounds.", "diagnostics"));
    return undefined;
  }
  const result: CoreRuntimeHandoffDiagnostic[] = [];
  const known = ["code", "severity", "message", "field"];
  for (const item of items) {
    const snap = snapshotRecord(item, 8);
    if (!snap.ok) {
      out.push(diag(FUNGI_APPK_CRH_001, "Diagnostic entry must be a plain data object.", "diagnostics"));
      return undefined;
    }
    if (!requireKeysSubset(snap, known, known, "diagnostics", out)) return undefined;
    const code = snap.values.get("code");
    const severity = snap.values.get("severity");
    const message = snap.values.get("message");
    const f = snap.values.get("field");
    if (
      typeof code !== "string" ||
      code.length === 0 ||
      code.length > MAX_TOKEN ||
      severity !== "error" ||
      typeof message !== "string" ||
      message.length === 0 ||
      message.length > 512 ||
      typeof f !== "string" ||
      f.length === 0 ||
      f.length > MAX_TOKEN
    ) {
      out.push(diag(FUNGI_APPK_CRH_002, "Diagnostic entry is outside the closed domain.", "diagnostics"));
      return undefined;
    }
    result.push(Object.freeze({ code, severity: "error" as const, message, field: f }));
  }
  return Object.freeze(result);
}

function readEffectPolicy(value: unknown, out: CoreRuntimeHandoffDiagnostic[]): CoreRuntimeEffectPolicy | undefined {
  const snap = snapshotRecord(value, CORE_RUNTIME_EFFECT_POLICY_FIELDS.length);
  if (!snap.ok) {
    out.push(diag(FUNGI_APPK_CRH_004, "Effect policy must be a plain data object.", "effectPolicy"));
    return undefined;
  }
  if (
    !requireKeysSubset(
      snap,
      CORE_RUNTIME_EFFECT_POLICY_FIELDS,
      CORE_RUNTIME_EFFECT_POLICY_FIELDS,
      "effectPolicy",
      out,
    )
  ) {
    return undefined;
  }

  const effects = snapshotArray(snap.values.get("allowedEffects"), CORE_RUNTIME_ALLOWED_EFFECTS.length);
  if (effects === undefined) {
    out.push(diag(FUNGI_APPK_CRH_004, "allowedEffects must be a dense array within the closed bound.", "allowedEffects"));
    return undefined;
  }
  if (effects.length !== CORE_RUNTIME_ALLOWED_EFFECTS.length) {
    out.push(diag(FUNGI_APPK_CRH_003, "allowedEffects must be the closed default pair.", "allowedEffects"));
    return undefined;
  }
  for (let i = 0; i < effects.length; i += 1) {
    if (effects[i] !== CORE_RUNTIME_ALLOWED_EFFECTS[i]) {
      out.push(diag(FUNGI_APPK_CRH_002, "allowedEffects is outside the closed vocabulary.", "allowedEffects"));
      return undefined;
    }
  }

  if (snap.values.get("denyProcessEffects") !== true) {
    out.push(diag(FUNGI_APPK_CRH_002, "denyProcessEffects admits true only.", "denyProcessEffects"));
    return undefined;
  }
  if (snap.values.get("requireExplicitNetworkPermission") !== true) {
    out.push(
      diag(FUNGI_APPK_CRH_002, "requireExplicitNetworkPermission admits true only.", "requireExplicitNetworkPermission"),
    );
    return undefined;
  }

  return Object.freeze({
    allowedEffects: CORE_RUNTIME_ALLOWED_EFFECTS,
    denyProcessEffects: true as const,
    requireExplicitNetworkPermission: true as const,
  });
}

function refusedHandoff(diagnostics: readonly CoreRuntimeHandoffDiagnostic[]): CoreRuntimeHandoff {
  return Object.freeze({
    schema: CORE_RUNTIME_HANDOFF_SCHEMA,
    name: "",
    seamVersion: CORE_RUNTIME_SEAM_VERSION,
    executorBinding: "deny_all" as const,
    effectPolicy: Object.freeze({
      allowedEffects: CORE_RUNTIME_ALLOWED_EFFECTS,
      denyProcessEffects: true as const,
      requireExplicitNetworkPermission: true as const,
    }),
    structuredAwait: STRUCTURED_AWAIT_POLICY_SCHEMA,
    queueJob: QUEUE_JOB_CONTRACT_SCHEMA,
    audit: RUNTIME_AUDIT_REPORT_FORMAT_SCHEMA,
    diagnostics: Object.freeze([...diagnostics]),
  });
}

/** Build a closed CoreRuntimeHandoff; never throws; success recomputed from diagnostics. */
export function createCoreRuntimeHandoff(input: unknown): CoreRuntimeHandoff {
  const out: CoreRuntimeHandoffDiagnostic[] = [];
  try {
    const snap = snapshotRecord(input, CORE_RUNTIME_HANDOFF_FIELDS.length);
    if (!snap.ok) {
      out.push(diag(FUNGI_APPK_CRH_001, "Core-runtime handoff must be a plain data object.", "record"));
      return refusedHandoff(out);
    }
    if (
      !requireKeysSubset(
        snap,
        CORE_RUNTIME_HANDOFF_FIELDS,
        CORE_RUNTIME_HANDOFF_FIELDS.filter((k) => k !== "diagnostics"),
        "record",
        out,
      )
    ) {
      return refusedHandoff(out);
    }

    if (snap.values.get("schema") !== CORE_RUNTIME_HANDOFF_SCHEMA) {
      out.push(diag(FUNGI_APPK_CRH_002, "Schema token is outside the closed vocabulary.", "schema"));
      return refusedHandoff(out);
    }

    const name = snap.values.get("name");
    if (typeof name !== "string" || !TYPE_NAME.test(name)) {
      out.push(diag(FUNGI_APPK_CRH_002, "Handoff name is outside the closed domain.", "name"));
      return refusedHandoff(out);
    }

    if (snap.values.get("seamVersion") !== CORE_RUNTIME_SEAM_VERSION) {
      out.push(diag(FUNGI_APPK_CRH_002, "Seam version is outside the closed vocabulary.", "seamVersion"));
      return refusedHandoff(out);
    }

    const binding = snap.values.get("executorBinding");
    if (typeof binding !== "string" || !EXECUTOR_SET.has(binding)) {
      out.push(diag(FUNGI_APPK_CRH_002, "Executor binding is outside the closed vocabulary.", "executorBinding"));
      return refusedHandoff(out);
    }

    const effectPolicy = readEffectPolicy(snap.values.get("effectPolicy"), out);
    if (effectPolicy === undefined) return refusedHandoff(out);

    if (snap.values.get("structuredAwait") !== STRUCTURED_AWAIT_POLICY_SCHEMA) {
      out.push(diag(FUNGI_APPK_CRH_002, "structuredAwait must reference the shipped Structured Await schema.", "structuredAwait"));
      return refusedHandoff(out);
    }
    if (snap.values.get("queueJob") !== QUEUE_JOB_CONTRACT_SCHEMA) {
      out.push(diag(FUNGI_APPK_CRH_002, "queueJob must reference the shipped queue/job schema.", "queueJob"));
      return refusedHandoff(out);
    }
    if (snap.values.get("audit") !== RUNTIME_AUDIT_REPORT_FORMAT_SCHEMA) {
      out.push(diag(FUNGI_APPK_CRH_002, "audit must reference the shipped runtime-audit schema.", "audit"));
      return refusedHandoff(out);
    }

    let diagnostics: readonly CoreRuntimeHandoffDiagnostic[] = Object.freeze([]);
    if (snap.values.has("diagnostics")) {
      const nested = snapshotDiagnostics(snap.values.get("diagnostics"), out);
      if (nested === undefined) return refusedHandoff(out);
      if (nested.length > 0) {
        out.push(diag(FUNGI_APPK_CRH_005, "Input diagnostics must be empty on create.", "diagnostics"));
        return refusedHandoff(out);
      }
      diagnostics = nested;
    }

    return Object.freeze({
      schema: CORE_RUNTIME_HANDOFF_SCHEMA,
      name,
      seamVersion: CORE_RUNTIME_SEAM_VERSION,
      executorBinding: "deny_all" as const,
      effectPolicy,
      structuredAwait: STRUCTURED_AWAIT_POLICY_SCHEMA,
      queueJob: QUEUE_JOB_CONTRACT_SCHEMA,
      audit: RUNTIME_AUDIT_REPORT_FORMAT_SCHEMA,
      diagnostics,
    });
  } catch {
    return refusedHandoff([diag(FUNGI_APPK_CRH_001, "Core-runtime handoff read failed closed.", "record")]);
  }
}

/** Read a closed CoreRuntimeHandoff; never throws; never echoes refused tokens. */
export function readCoreRuntimeHandoff(value: unknown): ReadCoreRuntimeHandoffResult {
  const created = createCoreRuntimeHandoff(value);
  if (created.diagnostics.length > 0) {
    return { ok: false, diagnostics: created.diagnostics };
  }
  return { ok: true, value: created };
}

/**
 * Data check of a candidate handoff descriptor. A passing value is well-formed,
 * not admitted and not wired.
 */
export function checkCoreRuntimeHandoff(value: unknown): CoreRuntimeHandoffCheck {
  const created = createCoreRuntimeHandoff(value);
  if (created.diagnostics.length === 0) {
    return Object.freeze({ ok: true as const, schema: CORE_RUNTIME_HANDOFF_SCHEMA });
  }
  return Object.freeze({
    ok: false as const,
    schema: CORE_RUNTIME_HANDOFF_SCHEMA,
    diagnostics: created.diagnostics,
  });
}

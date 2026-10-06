// deployment-denial.json reader + denial explain (TODO pass, Grok 2026-10-05; zero-trust defaults, owner may revisit).
//
// Closed-shape DeploymentDenial: schema, status, reasonCode, subject, profile,
// optional module / function. Tokens are dotted lower-camel; free-form reasons
// are refused. Never throws. Never echoes refused values / paths / keys.
// Produces ExplainResult with label "denial" traces.

import {
  FUNGI_EXPLAIN_001,
  FUNGI_EXPLAIN_002,
  createExplainResult,
  type ExplainDiagnostic,
  type ExplainDiagnosticField,
  type ExplainResult,
  type ExplainTrace,
} from "./explain-trace.js";

/** Denial schema or status refuse. */
export const FUNGI_EXPLAIN_005 = "FUNGI-EXPLAIN-005";
/** Denial domain refuse (reasonCode / subject / profile / module / function). */
export const FUNGI_EXPLAIN_006 = "FUNGI-EXPLAIN-006";

export const DEPLOYMENT_DENIAL_SCHEMA = "galerina.deployment-denial/v1";

export const DEPLOYMENT_DENIAL_REASON_CODES = Object.freeze([
  "effect",
  "capability",
  "target",
  "verified",
  "module",
  "integrity",
  "policy",
] as const);

export type DeploymentDenialReasonCode = (typeof DEPLOYMENT_DENIAL_REASON_CODES)[number];

export const DEPLOYMENT_DENIAL_FIELDS = Object.freeze([
  "schema",
  "status",
  "reasonCode",
  "subject",
  "profile",
  "module",
  "function",
] as const);

export interface DeploymentDenial {
  readonly schema: typeof DEPLOYMENT_DENIAL_SCHEMA;
  readonly status: "denied";
  readonly reasonCode: DeploymentDenialReasonCode;
  readonly subject: string;
  readonly profile: string;
  readonly module?: string;
  readonly function?: string;
}

const TOKEN = /^[a-z][A-Za-z0-9_]*(?:\.[a-z][A-Za-z0-9_]*)*$/;
const MAX_TOKEN = 128;
const REASON_SET = new Set<string>(DEPLOYMENT_DENIAL_REASON_CODES);
const REQUIRED = Object.freeze(["schema", "status", "reasonCode", "subject", "profile"] as const);
const OPTIONAL = Object.freeze(["module", "function"] as const);
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

function readToken(
  value: unknown,
  field: ExplainDiagnosticField,
  out: ExplainDiagnostic[],
): string | undefined {
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_TOKEN || !TOKEN.test(value)) {
    out.push(diag(FUNGI_EXPLAIN_006, "Denial token is outside the closed domain.", field));
    return undefined;
  }
  return value;
}

/** True when value is one of the closed DeploymentDenialReasonCode tokens. */
export function isDeploymentDenialReasonCode(value: unknown): value is DeploymentDenialReasonCode {
  return typeof value === "string" && REASON_SET.has(value);
}

/**
 * Read a closed-shape DeploymentDenial. Never throws; never echoes values.
 * Codes: FUNGI-EXPLAIN-001 shape, FUNGI-EXPLAIN-006 domain.
 */
export function readDeploymentDenial(
  value: unknown,
):
  | { readonly ok: true; readonly value: DeploymentDenial }
  | { readonly ok: false; readonly diagnostics: readonly ExplainDiagnostic[] } {
  const out: ExplainDiagnostic[] = [];
  const snap = snapshotRecord(value, DEPLOYMENT_DENIAL_FIELDS.length + 8);
  if (!snap.ok) {
    out.push(diag(FUNGI_EXPLAIN_001, "DeploymentDenial must be a plain data object.", "record"));
    return { ok: false, diagnostics: Object.freeze(out) };
  }
  if ([...snap.values.keys()].some((k) => !KNOWN.has(k))) {
    out.push(diag(FUNGI_EXPLAIN_001, "DeploymentDenial has a key outside the closed shape.", "record"));
    return { ok: false, diagnostics: Object.freeze(out) };
  }
  for (const field of REQUIRED) {
    if (!snap.values.has(field)) {
      out.push(diag(FUNGI_EXPLAIN_001, "DeploymentDenial is missing a required field.", field as ExplainDiagnosticField));
      return { ok: false, diagnostics: Object.freeze(out) };
    }
  }

  const schema = snap.values.get("schema");
  if (schema !== DEPLOYMENT_DENIAL_SCHEMA) {
    out.push(diag(FUNGI_EXPLAIN_005, "DeploymentDenial schema is outside the closed domain.", "record"));
    return { ok: false, diagnostics: Object.freeze(out) };
  }
  const status = snap.values.get("status");
  if (status !== "denied") {
    out.push(diag(FUNGI_EXPLAIN_005, "DeploymentDenial status must be denied.", "record"));
    return { ok: false, diagnostics: Object.freeze(out) };
  }
  const reasonCodeRaw = snap.values.get("reasonCode");
  if (!isDeploymentDenialReasonCode(reasonCodeRaw)) {
    out.push(diag(FUNGI_EXPLAIN_006, "reasonCode is outside the closed vocabulary.", "label"));
    return { ok: false, diagnostics: Object.freeze(out) };
  }
  const subject = readToken(snap.values.get("subject"), "output", out);
  if (subject === undefined) return { ok: false, diagnostics: Object.freeze(out) };
  const profile = readToken(snap.values.get("profile"), "input", out);
  if (profile === undefined) return { ok: false, diagnostics: Object.freeze(out) };

  let moduleToken: string | undefined;
  if (snap.values.has("module")) {
    moduleToken = readToken(snap.values.get("module"), "imports", out);
    if (moduleToken === undefined) return { ok: false, diagnostics: Object.freeze(out) };
  }
  let functionToken: string | undefined;
  if (snap.values.has("function")) {
    functionToken = readToken(snap.values.get("function"), "output", out);
    if (functionToken === undefined) return { ok: false, diagnostics: Object.freeze(out) };
  }

  const denial: DeploymentDenial = Object.freeze({
    schema: DEPLOYMENT_DENIAL_SCHEMA,
    status: "denied" as const,
    reasonCode: reasonCodeRaw,
    subject,
    profile,
    ...(moduleToken !== undefined ? { module: moduleToken } : {}),
    ...(functionToken !== undefined ? { function: functionToken } : {}),
  });
  return { ok: true, value: denial };
}

/**
 * Explain a closed DeploymentDenial as denial-label traces.
 * Never throws. Never echoes refused values.
 */
export function explainDenial(value: unknown): ExplainResult {
  const read = readDeploymentDenial(value);
  if (!read.ok) {
    return createExplainResult([], [], [], [], read.diagnostics);
  }
  const d = read.value;
  const traces: ExplainTrace[] = [];
  traces.push(
    Object.freeze({
      step: 0,
      label: "denial" as const,
      input: `denial.${d.reasonCode}`,
      output: d.subject,
      diagnostics: Object.freeze([]),
    }),
  );
  traces.push(
    Object.freeze({
      step: 1,
      label: "denial" as const,
      input: "denial.profile",
      output: d.profile,
      diagnostics: Object.freeze([]),
    }),
  );
  if (d.module !== undefined) {
    traces.push(
      Object.freeze({
        step: traces.length,
        label: "denial" as const,
        input: "denial.module",
        output: d.module,
        diagnostics: Object.freeze([]),
      }),
    );
  }
  if (d.function !== undefined) {
    traces.push(
      Object.freeze({
        step: traces.length,
        label: "denial" as const,
        input: "denial.function",
        output: d.function,
        diagnostics: Object.freeze([]),
      }),
    );
  }
  return createExplainResult(Object.freeze(traces), [], [], [], []);
}

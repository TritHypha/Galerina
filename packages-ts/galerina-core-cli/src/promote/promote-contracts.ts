// Promote contracts (TODO pass, Grok 2026-10-05; zero-trust defaults, owner may revisit).
//
// Closed-shape PromoteRequest / PromoteResult and createPromotePlan(). Admits a
// declared artefact promotion between two closed CLI environments without live
// wrap/sign/push/deploy. Matches README "galerina promote" + cicd
// "galerina promote staging production" as a plan-only closed shape.
//
// Zero-trust rules:
//  - Closed shapes via property descriptors (no getters run; symbols / accessors /
//    custom prototypes refuse). Unknown keys refuse without echoing the key.
//  - Environments are the exact CliEnvironment vocabulary
//    (development|test|staging|production).
//  - Targets are the exact deploy/build/plan vocabulary.
//  - Hashes are sha256:<64 lowercase hex> only. Diagnostics never echo hashes,
//    environments, targets, paths or unknown keys.
//  - fromEnvironment must differ from toEnvironment (same-env promote refused).
//  - No live promote / wrap / static-analysis / sign / push / deploy / rollback.
//
// Not covered: environment config-file loading (no convention), live promote
// pipeline (#121), rollback, or attaching to a deployed host.

/** Record / input is not a closed data object. */
export const FUNGI_PROMOTE_001 = "FUNGI-PROMOTE-001";
/** A field value is outside its closed domain. */
export const FUNGI_PROMOTE_002 = "FUNGI-PROMOTE-002";
/** Promote consistency refuse (same-env / plan refuse). */
export const FUNGI_PROMOTE_003 = "FUNGI-PROMOTE-003";
/** Result consistency refuse. */
export const FUNGI_PROMOTE_004 = "FUNGI-PROMOTE-004";
/** Live promote / apply / sign / push / deploy not admitted. */
export const FUNGI_PROMOTE_005 = "FUNGI-PROMOTE-005";

export const PROMOTE_ENVIRONMENTS = Object.freeze([
  "development",
  "test",
  "staging",
  "production",
] as const);
export type PromoteEnvironment = (typeof PROMOTE_ENVIRONMENTS)[number];

export const PROMOTE_TARGETS = Object.freeze([
  "node",
  "wasm",
  "native",
  "serverless",
  "edge",
  "gpu",
  "photonic",
] as const);
export type PromoteTarget = (typeof PROMOTE_TARGETS)[number];

export const PROMOTE_REQUEST_SCHEMA = "galerina.promote-request/v1";

export const PROMOTE_REQUEST_FIELDS = Object.freeze([
  "schema",
  "fromEnvironment",
  "toEnvironment",
  "buildHash",
  "target",
  "moduleHash",
] as const);

export const PROMOTE_RESULT_FIELDS = Object.freeze([
  "success",
  "admitted",
  "diagnostics",
  "fromEnvironment",
  "toEnvironment",
  "buildHash",
  "target",
  "reportPath",
] as const);

export type PromoteDiagnosticField =
  | "record"
  | "input"
  | "request"
  | "schema"
  | "fromEnvironment"
  | "toEnvironment"
  | "buildHash"
  | "target"
  | "moduleHash"
  | "success"
  | "admitted"
  | "diagnostics"
  | "reportPath"
  | "live";

export interface PromoteDiagnostic {
  readonly code: string;
  readonly severity: "error";
  readonly message: string;
  readonly field: PromoteDiagnosticField;
}

export interface PromoteRequest {
  readonly schema: typeof PROMOTE_REQUEST_SCHEMA;
  readonly fromEnvironment: PromoteEnvironment;
  readonly toEnvironment: PromoteEnvironment;
  readonly buildHash: string;
  readonly target: PromoteTarget;
  readonly moduleHash?: string;
}

export interface PromoteResult {
  readonly success: boolean;
  readonly admitted: boolean;
  readonly diagnostics: readonly PromoteDiagnostic[];
  readonly fromEnvironment: string;
  readonly toEnvironment: string;
  readonly buildHash: string;
  readonly target: string;
  readonly reportPath?: string;
}

export type ReadPromoteRequestResult =
  | { readonly ok: true; readonly value: PromoteRequest }
  | { readonly ok: false; readonly diagnostics: readonly PromoteDiagnostic[] };

export type ReadPromoteResultResult =
  | { readonly ok: true; readonly value: PromoteResult }
  | { readonly ok: false; readonly diagnostics: readonly PromoteDiagnostic[] };

const ENV_SET = new Set<string>(PROMOTE_ENVIRONMENTS);
const TARGET_SET = new Set<string>(PROMOTE_TARGETS);
const SHA256 = /^sha256:[0-9a-f]{64}$/;
const REL_PATH = /^(?:[A-Za-z0-9._-]+(?:[\\/][A-Za-z0-9._-]+)*)$/;
const MAX_TOKEN = 128;
const MAX_PATH = 512;
const MAX_LIST = 4096;

const FIELD_SET = new Set<string>([
  "record",
  "input",
  "request",
  "schema",
  "fromEnvironment",
  "toEnvironment",
  "buildHash",
  "target",
  "moduleHash",
  "success",
  "admitted",
  "diagnostics",
  "reportPath",
  "live",
]);

const diag = (code: string, message: string, field: PromoteDiagnosticField): PromoteDiagnostic =>
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

/** True when value is one of the closed PromoteEnvironment tokens. */
export function isPromoteEnvironment(value: unknown): value is PromoteEnvironment {
  return typeof value === "string" && ENV_SET.has(value);
}

/** True when value is one of the closed PromoteTarget tokens. */
export function isPromoteTarget(value: unknown): value is PromoteTarget {
  return typeof value === "string" && TARGET_SET.has(value);
}

function isSha256(value: unknown): value is string {
  return typeof value === "string" && SHA256.test(value);
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

function snapshotDiagnostics(
  value: unknown,
  field: PromoteDiagnosticField,
  out: PromoteDiagnostic[],
): readonly PromoteDiagnostic[] | undefined {
  const items = snapshotArray(value, MAX_LIST);
  if (items === undefined) {
    out.push(diag(FUNGI_PROMOTE_001, "Diagnostics must be a dense array within bounds.", field));
    return undefined;
  }
  const result: PromoteDiagnostic[] = [];
  for (const item of items) {
    const snap = snapshotRecord(item, 8);
    if (!snap.ok) {
      out.push(diag(FUNGI_PROMOTE_001, "Diagnostic entry must be a plain data object.", field));
      return undefined;
    }
    const known = new Set(["code", "severity", "message", "field"]);
    if ([...snap.values.keys()].some((k) => !known.has(k))) {
      out.push(diag(FUNGI_PROMOTE_001, "Diagnostic entry has a key outside the closed shape.", field));
      return undefined;
    }
    for (const req of known) {
      if (!snap.values.has(req)) {
        out.push(diag(FUNGI_PROMOTE_001, "Diagnostic entry is missing a required field.", field));
        return undefined;
      }
    }
    const code = snap.values.get("code");
    const severity = snap.values.get("severity");
    const message = snap.values.get("message");
    const f = snap.values.get("field");
    if (typeof code !== "string" || code.length === 0 || code.length > MAX_TOKEN) {
      out.push(diag(FUNGI_PROMOTE_002, "Diagnostic code is outside the closed domain.", field));
      return undefined;
    }
    if (severity !== "error") {
      out.push(diag(FUNGI_PROMOTE_002, "Diagnostic severity is outside the closed domain.", field));
      return undefined;
    }
    if (typeof message !== "string" || message.length === 0 || message.length > 512) {
      out.push(diag(FUNGI_PROMOTE_002, "Diagnostic message is outside the closed domain.", field));
      return undefined;
    }
    if (typeof f !== "string" || !FIELD_SET.has(f)) {
      out.push(diag(FUNGI_PROMOTE_002, "Diagnostic field is outside the closed domain.", field));
      return undefined;
    }
    result.push(Object.freeze({ code, severity: "error" as const, message, field: f as PromoteDiagnosticField }));
  }
  return Object.freeze(result);
}

function refusedResult(diagnostics: readonly PromoteDiagnostic[]): PromoteResult {
  return Object.freeze({
    success: false,
    admitted: false,
    diagnostics: Object.freeze([...diagnostics]),
    fromEnvironment: "",
    toEnvironment: "",
    buildHash: "",
    target: "",
  });
}

/** Read a closed PromoteRequest. Never throws. Never echoes refused tokens. */
export function readPromoteRequest(input: unknown): ReadPromoteRequestResult {
  const out: PromoteDiagnostic[] = [];
  const snap = snapshotRecord(input, 8);
  if (!snap.ok) {
    return {
      ok: false,
      diagnostics: Object.freeze([
        diag(FUNGI_PROMOTE_001, "Promote request must be a plain data object.", "request"),
      ]),
    };
  }
  const known = new Set<string>(PROMOTE_REQUEST_FIELDS);
  for (const k of snap.values.keys()) {
    if (!known.has(k)) {
      out.push(diag(FUNGI_PROMOTE_001, "Promote request has a key outside the closed shape.", "request"));
      return { ok: false, diagnostics: Object.freeze(out) };
    }
  }
  for (const req of ["schema", "fromEnvironment", "toEnvironment", "buildHash", "target"] as const) {
    if (!snap.values.has(req)) {
      out.push(diag(FUNGI_PROMOTE_001, "Promote request is missing a required field.", "request"));
      return { ok: false, diagnostics: Object.freeze(out) };
    }
  }
  const schema = snap.values.get("schema");
  if (schema !== PROMOTE_REQUEST_SCHEMA) {
    out.push(diag(FUNGI_PROMOTE_002, "Promote request schema is outside the closed domain.", "schema"));
    return { ok: false, diagnostics: Object.freeze(out) };
  }
  const fromEnvironment = snap.values.get("fromEnvironment");
  if (!isPromoteEnvironment(fromEnvironment)) {
    out.push(diag(FUNGI_PROMOTE_002, "fromEnvironment is outside the closed vocabulary.", "fromEnvironment"));
    return { ok: false, diagnostics: Object.freeze(out) };
  }
  const toEnvironment = snap.values.get("toEnvironment");
  if (!isPromoteEnvironment(toEnvironment)) {
    out.push(diag(FUNGI_PROMOTE_002, "toEnvironment is outside the closed vocabulary.", "toEnvironment"));
    return { ok: false, diagnostics: Object.freeze(out) };
  }
  if (fromEnvironment === toEnvironment) {
    out.push(diag(FUNGI_PROMOTE_003, "fromEnvironment and toEnvironment must differ.", "toEnvironment"));
    return { ok: false, diagnostics: Object.freeze(out) };
  }
  const buildHash = snap.values.get("buildHash");
  if (!isSha256(buildHash)) {
    out.push(diag(FUNGI_PROMOTE_002, "buildHash is outside the closed domain.", "buildHash"));
    return { ok: false, diagnostics: Object.freeze(out) };
  }
  const target = snap.values.get("target");
  if (!isPromoteTarget(target)) {
    out.push(diag(FUNGI_PROMOTE_002, "target is outside the closed vocabulary.", "target"));
    return { ok: false, diagnostics: Object.freeze(out) };
  }
  let moduleHash: string | undefined;
  if (snap.values.has("moduleHash")) {
    const mh = snap.values.get("moduleHash");
    if (!isSha256(mh)) {
      out.push(diag(FUNGI_PROMOTE_002, "moduleHash is outside the closed domain.", "moduleHash"));
      return { ok: false, diagnostics: Object.freeze(out) };
    }
    moduleHash = mh;
  }
  const value: PromoteRequest =
    moduleHash === undefined
      ? Object.freeze({
          schema: PROMOTE_REQUEST_SCHEMA,
          fromEnvironment,
          toEnvironment,
          buildHash,
          target,
        })
      : Object.freeze({
          schema: PROMOTE_REQUEST_SCHEMA,
          fromEnvironment,
          toEnvironment,
          buildHash,
          target,
          moduleHash,
        });
  return { ok: true, value };
}

/** Create a closed PromoteResult; success recomputed as diagnostics.length === 0 && admitted. */
export function createPromoteResult(input: {
  readonly admitted: boolean;
  readonly diagnostics: readonly PromoteDiagnostic[];
  readonly fromEnvironment: string;
  readonly toEnvironment: string;
  readonly buildHash: string;
  readonly target: string;
  readonly reportPath?: string;
}): PromoteResult {
  const diagnostics = Object.freeze(
    (Array.isArray(input.diagnostics) ? input.diagnostics : []).map((d) =>
      Object.freeze({
        code: typeof d?.code === "string" ? d.code : "FUNGI-PROMOTE-001",
        severity: "error" as const,
        message:
          typeof d?.message === "string" && d.message.length > 0 ? d.message : "diagnostic withheld",
        field: (typeof d?.field === "string" && d.field.length > 0
          ? d.field
          : "record") as PromoteDiagnosticField,
      }),
    ),
  );
  const out: PromoteDiagnostic[] = [...diagnostics];
  let reportPath: string | undefined;
  if (input.reportPath !== undefined) {
    if (!isRelativePathToken(input.reportPath)) {
      out.push(diag(FUNGI_PROMOTE_002, "reportPath is outside the closed domain.", "reportPath"));
    } else {
      reportPath = input.reportPath;
    }
  }
  const admitted = input.admitted === true && out.length === 0;
  const success = admitted && out.length === 0;
  const base = {
    success,
    admitted,
    diagnostics: Object.freeze(out),
    fromEnvironment: typeof input.fromEnvironment === "string" ? input.fromEnvironment : "",
    toEnvironment: typeof input.toEnvironment === "string" ? input.toEnvironment : "",
    buildHash: typeof input.buildHash === "string" ? input.buildHash : "",
    target: typeof input.target === "string" ? input.target : "",
  };
  return reportPath === undefined ? Object.freeze(base) : Object.freeze({ ...base, reportPath });
}

/** Read a closed PromoteResult. Never throws. */
export function readPromoteResult(input: unknown): ReadPromoteResultResult {
  const out: PromoteDiagnostic[] = [];
  const snap = snapshotRecord(input, 16);
  if (!snap.ok) {
    return {
      ok: false,
      diagnostics: Object.freeze([
        diag(FUNGI_PROMOTE_001, "Promote result must be a plain data object.", "record"),
      ]),
    };
  }
  const known = new Set<string>(PROMOTE_RESULT_FIELDS);
  for (const k of snap.values.keys()) {
    if (!known.has(k)) {
      out.push(diag(FUNGI_PROMOTE_001, "Promote result has a key outside the closed shape.", "record"));
      return { ok: false, diagnostics: Object.freeze(out) };
    }
  }
  for (const req of [
    "success",
    "admitted",
    "diagnostics",
    "fromEnvironment",
    "toEnvironment",
    "buildHash",
    "target",
  ] as const) {
    if (!snap.values.has(req)) {
      out.push(diag(FUNGI_PROMOTE_001, "Promote result is missing a required field.", "record"));
      return { ok: false, diagnostics: Object.freeze(out) };
    }
  }
  const success = snap.values.get("success");
  const admitted = snap.values.get("admitted");
  if (typeof success !== "boolean" || typeof admitted !== "boolean") {
    out.push(diag(FUNGI_PROMOTE_002, "success/admitted must be boolean.", "success"));
    return { ok: false, diagnostics: Object.freeze(out) };
  }
  const diagnostics = snapshotDiagnostics(snap.values.get("diagnostics"), "diagnostics", out);
  if (diagnostics === undefined) {
    return { ok: false, diagnostics: Object.freeze(out) };
  }
  const expectedSuccess = admitted && diagnostics.length === 0;
  if (success !== expectedSuccess) {
    out.push(
      diag(FUNGI_PROMOTE_004, "Promote result success is inconsistent with admitted/diagnostics.", "success"),
    );
    return { ok: false, diagnostics: Object.freeze(out) };
  }
  for (const tokenField of ["fromEnvironment", "toEnvironment", "buildHash", "target"] as const) {
    const v = snap.values.get(tokenField);
    if (typeof v !== "string" || v.length > MAX_PATH) {
      out.push(diag(FUNGI_PROMOTE_002, "Promote result token is outside the closed domain.", tokenField));
      return { ok: false, diagnostics: Object.freeze(out) };
    }
  }
  let reportPath: string | undefined;
  if (snap.values.has("reportPath")) {
    const rp = snap.values.get("reportPath");
    if (!isRelativePathToken(rp)) {
      out.push(diag(FUNGI_PROMOTE_002, "reportPath is outside the closed domain.", "reportPath"));
      return { ok: false, diagnostics: Object.freeze(out) };
    }
    reportPath = rp;
  }
  const value =
    reportPath === undefined
      ? createPromoteResult({
          admitted,
          diagnostics,
          fromEnvironment: snap.values.get("fromEnvironment") as string,
          toEnvironment: snap.values.get("toEnvironment") as string,
          buildHash: snap.values.get("buildHash") as string,
          target: snap.values.get("target") as string,
        })
      : createPromoteResult({
          admitted,
          diagnostics,
          fromEnvironment: snap.values.get("fromEnvironment") as string,
          toEnvironment: snap.values.get("toEnvironment") as string,
          buildHash: snap.values.get("buildHash") as string,
          target: snap.values.get("target") as string,
          reportPath,
        });
  return { ok: true, value };
}

/**
 * Admit a closed promote plan between two environments for a declared artefact.
 * Never throws. Never executes live promote / wrap / sign / push / deploy.
 */
export function createPromotePlan(input: unknown): PromoteResult {
  try {
    const read = readPromoteRequest(input);
    if (!read.ok) {
      return refusedResult(read.diagnostics);
    }
    const req = read.value;
    return createPromoteResult({
      admitted: true,
      diagnostics: [],
      fromEnvironment: req.fromEnvironment,
      toEnvironment: req.toEnvironment,
      buildHash: req.buildHash,
      target: req.target,
    });
  } catch {
    return refusedResult([
      diag(FUNGI_PROMOTE_001, "Promote plan refused after an unexpected failure.", "input"),
    ]);
  }
}

// Verify-deploy contracts (TODO pass, Grok 2026-10-05; zero-trust defaults, owner may revisit).
//
// Closed-shape RunningVersionReceipt / BuildManifestSlice / VerifyDeployResult and
// verifyDeploy(). Compares a declared receipt against a declared build-manifest slice.
// No live process attach, no pid probe, no package dependency on galerina-core-runtime.
//
// Zero-trust rules:
//  - Closed shapes via property descriptors (no getters run; symbols / accessors /
//    custom prototypes refuse). Unknown keys refuse without echoing the key.
//  - Target tokens are an exact closed vocabulary (same as deploy/build/plan).
//  - Hashes are sha256:<64 lowercase hex> only. Diagnostics never echo hashes,
//    version ids, targets, paths or unknown keys.
//  - Numbers (none required on the v1 receipt/manifest) refuse NaN/Infinity if present.
//
// Not covered: live running-process capture, promote/rollback, environment config
// loading, or attaching to a deployed host.

/** Record / input is not a closed data object. */
export const FUNGI_VDEPLOY_001 = "FUNGI-VDEPLOY-001";
/** A field value is outside its closed domain. */
export const FUNGI_VDEPLOY_002 = "FUNGI-VDEPLOY-002";
/** Receipt / manifest hash, target or moduleHash mismatch. */
export const FUNGI_VDEPLOY_003 = "FUNGI-VDEPLOY-003";
/** Result consistency refuse (success vs diagnostics). */
export const FUNGI_VDEPLOY_004 = "FUNGI-VDEPLOY-004";
/** Live process / pid / host probe not admitted. */
export const FUNGI_VDEPLOY_005 = "FUNGI-VDEPLOY-005";

export const VDEPLOY_TARGETS = Object.freeze([
  "node",
  "wasm",
  "native",
  "serverless",
  "edge",
  "gpu",
  "photonic",
] as const);

export type VDeployTarget = (typeof VDEPLOY_TARGETS)[number];

export const RUNNING_VERSION_RECEIPT_SCHEMA = "galerina.running-version-receipt/v1";
export const BUILD_MANIFEST_SLICE_SCHEMA = "galerina.build-manifest-slice/v1";

export const RUNNING_VERSION_RECEIPT_FIELDS = Object.freeze([
  "schema",
  "versionId",
  "buildHash",
  "target",
  "moduleHash",
] as const);

export const BUILD_MANIFEST_SLICE_FIELDS = Object.freeze([
  "schema",
  "buildHash",
  "target",
  "moduleHash",
] as const);

export const VERIFY_DEPLOY_RESULT_FIELDS = Object.freeze([
  "success",
  "matched",
  "diagnostics",
  "receiptVersionId",
  "reportPath",
] as const);

export type VDeployDiagnosticField =
  | "record"
  | "input"
  | "receipt"
  | "manifest"
  | "schema"
  | "versionId"
  | "buildHash"
  | "target"
  | "moduleHash"
  | "success"
  | "matched"
  | "diagnostics"
  | "receiptVersionId"
  | "reportPath"
  | "live";

export interface VDeployDiagnostic {
  readonly code: string;
  readonly severity: "error";
  readonly message: string;
  readonly field: VDeployDiagnosticField;
}

export interface RunningVersionReceipt {
  readonly schema: typeof RUNNING_VERSION_RECEIPT_SCHEMA;
  readonly versionId: string;
  readonly buildHash: string;
  readonly target: VDeployTarget;
  readonly moduleHash?: string;
}

export interface BuildManifestSlice {
  readonly schema: typeof BUILD_MANIFEST_SLICE_SCHEMA;
  readonly buildHash: string;
  readonly target: VDeployTarget;
  readonly moduleHash?: string;
}

export interface VerifyDeployResult {
  readonly success: boolean;
  readonly matched: boolean;
  readonly diagnostics: readonly VDeployDiagnostic[];
  readonly receiptVersionId: string;
  readonly reportPath?: string;
}

export type ReadRunningVersionReceiptResult =
  | { readonly ok: true; readonly value: RunningVersionReceipt }
  | { readonly ok: false; readonly diagnostics: readonly VDeployDiagnostic[] };

export type ReadBuildManifestSliceResult =
  | { readonly ok: true; readonly value: BuildManifestSlice }
  | { readonly ok: false; readonly diagnostics: readonly VDeployDiagnostic[] };

export type ReadVerifyDeployResultResult =
  | { readonly ok: true; readonly value: VerifyDeployResult }
  | { readonly ok: false; readonly diagnostics: readonly VDeployDiagnostic[] };

const TARGET_SET = new Set<string>(VDEPLOY_TARGETS);
const SHA256 = /^sha256:[0-9a-f]{64}$/;
const VERSION_ID = /^[a-z][A-Za-z0-9_]*(?:\.[a-z][A-Za-z0-9_]*)*$/;
const REL_PATH = /^(?:[A-Za-z0-9._-]+(?:[\\/][A-Za-z0-9._-]+)*)$/;
const MAX_TOKEN = 128;
const MAX_PATH = 512;
const MAX_LIST = 4096;

const diag = (code: string, message: string, field: VDeployDiagnosticField): VDeployDiagnostic =>
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

/** True when value is one of the closed VDeployTarget tokens. */
export function isVDeployTarget(value: unknown): value is VDeployTarget {
  return typeof value === "string" && TARGET_SET.has(value);
}

function isSha256(value: unknown): value is string {
  return typeof value === "string" && SHA256.test(value);
}

function isVersionId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= MAX_TOKEN && VERSION_ID.test(value);
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
  field: VDeployDiagnosticField,
  out: VDeployDiagnostic[],
): readonly VDeployDiagnostic[] | undefined {
  const items = snapshotArray(value, MAX_LIST);
  if (items === undefined) {
    out.push(diag(FUNGI_VDEPLOY_001, "Diagnostics must be a dense array within bounds.", field));
    return undefined;
  }
  const result: VDeployDiagnostic[] = [];
  for (const item of items) {
    const snap = snapshotRecord(item, 8);
    if (!snap.ok) {
      out.push(diag(FUNGI_VDEPLOY_001, "Diagnostic entry must be a plain data object.", field));
      return undefined;
    }
    const known = new Set(["code", "severity", "message", "field"]);
    if ([...snap.values.keys()].some((k) => !known.has(k))) {
      out.push(diag(FUNGI_VDEPLOY_001, "Diagnostic entry has a key outside the closed shape.", field));
      return undefined;
    }
    for (const req of known) {
      if (!snap.values.has(req)) {
        out.push(diag(FUNGI_VDEPLOY_001, "Diagnostic entry is missing a required field.", field));
        return undefined;
      }
    }
    const code = snap.values.get("code");
    const severity = snap.values.get("severity");
    const message = snap.values.get("message");
    const f = snap.values.get("field");
    if (typeof code !== "string" || code.length === 0 || code.length > MAX_TOKEN) {
      out.push(diag(FUNGI_VDEPLOY_002, "Diagnostic code is outside the closed domain.", field));
      return undefined;
    }
    if (severity !== "error") {
      out.push(diag(FUNGI_VDEPLOY_002, "Diagnostic severity is outside the closed domain.", field));
      return undefined;
    }
    if (typeof message !== "string" || message.length === 0 || message.length > 512) {
      out.push(diag(FUNGI_VDEPLOY_002, "Diagnostic message is outside the closed domain.", field));
      return undefined;
    }
    if (typeof f !== "string" || f.length === 0 || f.length > MAX_TOKEN) {
      out.push(diag(FUNGI_VDEPLOY_002, "Diagnostic field is outside the closed domain.", field));
      return undefined;
    }
    result.push(Object.freeze({ code, severity: "error" as const, message, field: f as VDeployDiagnosticField }));
  }
  return Object.freeze(result);
}

function refusedResult(diagnostics: readonly VDeployDiagnostic[], receiptVersionId = ""): VerifyDeployResult {
  return Object.freeze({
    success: false,
    matched: false,
    diagnostics: Object.freeze([...diagnostics]),
    receiptVersionId,
  });
}

/** Read a closed RunningVersionReceipt. Never throws. Never echoes refused tokens. */
export function readRunningVersionReceipt(input: unknown): ReadRunningVersionReceiptResult {
  const out: VDeployDiagnostic[] = [];
  const snap = snapshotRecord(input, 8);
  if (!snap.ok) {
    return { ok: false, diagnostics: Object.freeze([diag(FUNGI_VDEPLOY_001, "Receipt must be a plain data object.", "receipt")]) };
  }
  const known = new Set<string>(RUNNING_VERSION_RECEIPT_FIELDS);
  for (const k of snap.values.keys()) {
    if (!known.has(k)) {
      out.push(diag(FUNGI_VDEPLOY_001, "Receipt has a key outside the closed shape.", "receipt"));
      return { ok: false, diagnostics: Object.freeze(out) };
    }
  }
  for (const req of ["schema", "versionId", "buildHash", "target"] as const) {
    if (!snap.values.has(req)) {
      out.push(diag(FUNGI_VDEPLOY_001, "Receipt is missing a required field.", "receipt"));
      return { ok: false, diagnostics: Object.freeze(out) };
    }
  }
  const schema = snap.values.get("schema");
  if (schema !== RUNNING_VERSION_RECEIPT_SCHEMA) {
    out.push(diag(FUNGI_VDEPLOY_002, "Receipt schema is outside the closed domain.", "schema"));
    return { ok: false, diagnostics: Object.freeze(out) };
  }
  const versionId = snap.values.get("versionId");
  if (!isVersionId(versionId)) {
    out.push(diag(FUNGI_VDEPLOY_002, "versionId is outside the closed domain.", "versionId"));
    return { ok: false, diagnostics: Object.freeze(out) };
  }
  const buildHash = snap.values.get("buildHash");
  if (!isSha256(buildHash)) {
    out.push(diag(FUNGI_VDEPLOY_002, "buildHash is outside the closed domain.", "buildHash"));
    return { ok: false, diagnostics: Object.freeze(out) };
  }
  const target = snap.values.get("target");
  if (!isVDeployTarget(target)) {
    out.push(diag(FUNGI_VDEPLOY_002, "target is outside the closed vocabulary.", "target"));
    return { ok: false, diagnostics: Object.freeze(out) };
  }
  let moduleHash: string | undefined;
  if (snap.values.has("moduleHash")) {
    const mh = snap.values.get("moduleHash");
    if (!isSha256(mh)) {
      out.push(diag(FUNGI_VDEPLOY_002, "moduleHash is outside the closed domain.", "moduleHash"));
      return { ok: false, diagnostics: Object.freeze(out) };
    }
    moduleHash = mh;
  }
  const value: RunningVersionReceipt = moduleHash === undefined
    ? Object.freeze({ schema: RUNNING_VERSION_RECEIPT_SCHEMA, versionId, buildHash, target })
    : Object.freeze({ schema: RUNNING_VERSION_RECEIPT_SCHEMA, versionId, buildHash, target, moduleHash });
  return { ok: true, value };
}

/** Read a closed BuildManifestSlice. Never throws. Never echoes refused tokens. */
export function readBuildManifestSlice(input: unknown): ReadBuildManifestSliceResult {
  const out: VDeployDiagnostic[] = [];
  const snap = snapshotRecord(input, 8);
  if (!snap.ok) {
    return { ok: false, diagnostics: Object.freeze([diag(FUNGI_VDEPLOY_001, "Manifest slice must be a plain data object.", "manifest")]) };
  }
  const known = new Set<string>(BUILD_MANIFEST_SLICE_FIELDS);
  for (const k of snap.values.keys()) {
    if (!known.has(k)) {
      out.push(diag(FUNGI_VDEPLOY_001, "Manifest slice has a key outside the closed shape.", "manifest"));
      return { ok: false, diagnostics: Object.freeze(out) };
    }
  }
  for (const req of ["schema", "buildHash", "target"] as const) {
    if (!snap.values.has(req)) {
      out.push(diag(FUNGI_VDEPLOY_001, "Manifest slice is missing a required field.", "manifest"));
      return { ok: false, diagnostics: Object.freeze(out) };
    }
  }
  const schema = snap.values.get("schema");
  if (schema !== BUILD_MANIFEST_SLICE_SCHEMA) {
    out.push(diag(FUNGI_VDEPLOY_002, "Manifest schema is outside the closed domain.", "schema"));
    return { ok: false, diagnostics: Object.freeze(out) };
  }
  const buildHash = snap.values.get("buildHash");
  if (!isSha256(buildHash)) {
    out.push(diag(FUNGI_VDEPLOY_002, "buildHash is outside the closed domain.", "buildHash"));
    return { ok: false, diagnostics: Object.freeze(out) };
  }
  const target = snap.values.get("target");
  if (!isVDeployTarget(target)) {
    out.push(diag(FUNGI_VDEPLOY_002, "target is outside the closed vocabulary.", "target"));
    return { ok: false, diagnostics: Object.freeze(out) };
  }
  let moduleHash: string | undefined;
  if (snap.values.has("moduleHash")) {
    const mh = snap.values.get("moduleHash");
    if (!isSha256(mh)) {
      out.push(diag(FUNGI_VDEPLOY_002, "moduleHash is outside the closed domain.", "moduleHash"));
      return { ok: false, diagnostics: Object.freeze(out) };
    }
    moduleHash = mh;
  }
  const value: BuildManifestSlice = moduleHash === undefined
    ? Object.freeze({ schema: BUILD_MANIFEST_SLICE_SCHEMA, buildHash, target })
    : Object.freeze({ schema: BUILD_MANIFEST_SLICE_SCHEMA, buildHash, target, moduleHash });
  return { ok: true, value };
}

/** Create a closed VerifyDeployResult; success recomputed as diagnostics.length === 0 && matched. */
export function createVerifyDeployResult(input: {
  readonly success?: boolean;
  readonly matched: boolean;
  readonly diagnostics: readonly VDeployDiagnostic[];
  readonly receiptVersionId: string;
  readonly reportPath?: string;
}): VerifyDeployResult {
  const diagnostics = Object.freeze(
    (Array.isArray(input.diagnostics) ? input.diagnostics : []).map((d) =>
      Object.freeze({
        code: typeof d?.code === "string" ? d.code : FUNGI_VDEPLOY_001,
        severity: "error" as const,
        message: typeof d?.message === "string" && d.message.length > 0 ? d.message : "diagnostic withheld",
        field: (typeof d?.field === "string" && d.field.length > 0 ? d.field : "record") as VDeployDiagnosticField,
      }),
    ),
  );
  const matched = input.matched === true && diagnostics.length === 0;
  const success = matched && diagnostics.length === 0;
  const receiptVersionId = isVersionId(input.receiptVersionId) ? input.receiptVersionId : "";
  if (input.reportPath !== undefined) {
    if (!isRelativePathToken(input.reportPath)) {
      return Object.freeze({
        success: false,
        matched: false,
        diagnostics: Object.freeze([
          ...diagnostics,
          diag(FUNGI_VDEPLOY_002, "reportPath is outside the closed domain.", "reportPath"),
        ]),
        receiptVersionId,
      });
    }
    return Object.freeze({ success, matched, diagnostics, receiptVersionId, reportPath: input.reportPath });
  }
  return Object.freeze({ success, matched, diagnostics, receiptVersionId });
}

/** Read a closed VerifyDeployResult. Never throws. */
export function readVerifyDeployResult(input: unknown): ReadVerifyDeployResultResult {
  const out: VDeployDiagnostic[] = [];
  const snap = snapshotRecord(input, 8);
  if (!snap.ok) {
    return { ok: false, diagnostics: Object.freeze([diag(FUNGI_VDEPLOY_001, "Result must be a plain data object.", "record")]) };
  }
  const known = new Set<string>(VERIFY_DEPLOY_RESULT_FIELDS);
  for (const k of snap.values.keys()) {
    if (!known.has(k)) {
      out.push(diag(FUNGI_VDEPLOY_001, "Result has a key outside the closed shape.", "record"));
      return { ok: false, diagnostics: Object.freeze(out) };
    }
  }
  for (const req of ["success", "matched", "diagnostics", "receiptVersionId"] as const) {
    if (!snap.values.has(req)) {
      out.push(diag(FUNGI_VDEPLOY_001, "Result is missing a required field.", "record"));
      return { ok: false, diagnostics: Object.freeze(out) };
    }
  }
  const successRaw = snap.values.get("success");
  const matchedRaw = snap.values.get("matched");
  if (typeof successRaw !== "boolean" || typeof matchedRaw !== "boolean") {
    out.push(diag(FUNGI_VDEPLOY_002, "Boolean field is outside the closed domain.", "success"));
    return { ok: false, diagnostics: Object.freeze(out) };
  }
  const diagnostics = snapshotDiagnostics(snap.values.get("diagnostics"), "diagnostics", out);
  if (diagnostics === undefined) return { ok: false, diagnostics: Object.freeze(out) };
  const receiptVersionId = snap.values.get("receiptVersionId");
  if (!(receiptVersionId === "" || isVersionId(receiptVersionId))) {
    out.push(diag(FUNGI_VDEPLOY_002, "receiptVersionId is outside the closed domain.", "receiptVersionId"));
    return { ok: false, diagnostics: Object.freeze(out) };
  }
  let reportPath: string | undefined;
  if (snap.values.has("reportPath")) {
    const rp = snap.values.get("reportPath");
    if (!isRelativePathToken(rp)) {
      out.push(diag(FUNGI_VDEPLOY_002, "reportPath is outside the closed domain.", "reportPath"));
      return { ok: false, diagnostics: Object.freeze(out) };
    }
    reportPath = rp;
  }
  const expectedMatched = matchedRaw === true && diagnostics.length === 0;
  const expectedSuccess = expectedMatched && diagnostics.length === 0;
  // Recompute: claimed success/matched must match diagnostics / matched invariant.
  if (matchedRaw !== expectedMatched || successRaw !== expectedSuccess) {
    // If caller claimed matched=true with diagnostics, or success with !matched, refuse.
    if (diagnostics.length > 0 && (successRaw === true || matchedRaw === true)) {
      out.push(diag(FUNGI_VDEPLOY_004, "Result success/matched is inconsistent with diagnostics.", "success"));
      return { ok: false, diagnostics: Object.freeze(out) };
    }
    if (diagnostics.length === 0 && matchedRaw === true && successRaw !== true) {
      out.push(diag(FUNGI_VDEPLOY_004, "Result success/matched is inconsistent with diagnostics.", "success"));
      return { ok: false, diagnostics: Object.freeze(out) };
    }
    if (diagnostics.length === 0 && matchedRaw === false && successRaw === true) {
      out.push(diag(FUNGI_VDEPLOY_004, "Result success/matched is inconsistent with diagnostics.", "success"));
      return { ok: false, diagnostics: Object.freeze(out) };
    }
  }
  const value = reportPath === undefined
    ? createVerifyDeployResult({
      matched: matchedRaw,
      diagnostics,
      receiptVersionId: typeof receiptVersionId === "string" ? receiptVersionId : "",
    })
    : createVerifyDeployResult({
      matched: matchedRaw,
      diagnostics,
      receiptVersionId: typeof receiptVersionId === "string" ? receiptVersionId : "",
      reportPath,
    });
  return { ok: true, value };
}

/**
 * Compare a running-version receipt against a build-manifest slice.
 * Never throws. Never opens a process, pid, or host. Never echoes refused tokens.
 */
export function verifyDeploy(receiptInput: unknown, manifestInput: unknown): VerifyDeployResult {
  const receipt = readRunningVersionReceipt(receiptInput);
  if (!receipt.ok) return refusedResult(receipt.diagnostics);

  const manifest = readBuildManifestSlice(manifestInput);
  if (!manifest.ok) return refusedResult(manifest.diagnostics, receipt.value.versionId);

  const diagnostics: VDeployDiagnostic[] = [];
  if (receipt.value.buildHash !== manifest.value.buildHash) {
    diagnostics.push(diag(FUNGI_VDEPLOY_003, "Receipt buildHash does not match the manifest slice.", "buildHash"));
  }
  if (receipt.value.target !== manifest.value.target) {
    diagnostics.push(diag(FUNGI_VDEPLOY_003, "Receipt target does not match the manifest slice.", "target"));
  }
  const rModule = receipt.value.moduleHash;
  const mModule = manifest.value.moduleHash;
  if (rModule !== undefined || mModule !== undefined) {
    if (rModule === undefined || mModule === undefined || rModule !== mModule) {
      diagnostics.push(diag(FUNGI_VDEPLOY_003, "Receipt moduleHash does not match the manifest slice.", "moduleHash"));
    }
  }

  return createVerifyDeployResult({
    matched: diagnostics.length === 0,
    diagnostics: Object.freeze(diagnostics),
    receiptVersionId: receipt.value.versionId,
  });
}

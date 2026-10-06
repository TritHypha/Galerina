// Capability lease / attenuation / approver-chain schemas (TODO pass, Grok 2026-10-05;
// zero-trust defaults, owner may revisit).
//
// Closed-shape contracts for the security TODO row "Define capability lease,
// attenuation and approver-chain diagnostics". Aligns capability tokens and
// allow|deny|abstain decisions with capability-contracts / policy-contracts,
// without inventing SecretReference v0.2 or live lease enforcement.
//
// Zero-trust rules:
//  - Closed shapes via property descriptors (no getters; symbols / accessors /
//    custom prototypes refuse). Unknown keys refuse without echoing the key.
//  - Epoch seconds are finite safe integers only (refuse NaN / Infinity).
//  - expiresAtEpochSec >= issuedAtEpochSec.
//  - parentLeaseId is an ID token or the closed sentinel "none" (root lease).
//  - Attenuation: childCapabilities must be a subset of parentCapabilities;
//    parentLeaseId !== childLeaseId; both lists unique ascending.
//  - Approver chain: allow requires non-empty approverIds; deny/abstain may be empty.
//  - Never throws; never echoes lease ids, subject ids, capability names,
//    approver ids, or unknown values.
//
// Not covered: SecretReference v0.2, live lease issuance / revocation runtime,
// clock sources, OWASP / crypto-inventory rows, or report file writers.

/** Record / input is not a closed data object. */
export const FUNGI_SEC_CLA_001 = "FUNGI-SEC-CLA-001";
/** A field value is outside its closed domain (incl. NaN / Infinity / unknown status). */
export const FUNGI_SEC_CLA_002 = "FUNGI-SEC-CLA-002";
/** Consistency refuse (empty when required / duplicate / unsorted / subset / time order). */
export const FUNGI_SEC_CLA_003 = "FUNGI-SEC-CLA-003";
/** Nested record / list refuse. */
export const FUNGI_SEC_CLA_004 = "FUNGI-SEC-CLA-004";
/** Result consistency refuse. */
export const FUNGI_SEC_CLA_005 = "FUNGI-SEC-CLA-005";

export const CAPABILITY_LEASE_SCHEMA = "galerina.security.capability-lease/v1";
export const CAPABILITY_ATTENUATION_SCHEMA = "galerina.security.capability-attenuation/v1";
export const APPROVER_CHAIN_SCHEMA = "galerina.security.approver-chain/v1";

export const CAPABILITY_LEASE_STATUSES = Object.freeze([
  "active",
  "denied",
  "expired",
  "revoked",
] as const);
export type CapabilityLeaseStatus = (typeof CAPABILITY_LEASE_STATUSES)[number];

export const CAPABILITY_LEASE_PARENT_NONE = "none";

export const APPROVER_CHAIN_DECISIONS = Object.freeze(["abstain", "allow", "deny"] as const);
export type ApproverChainDecision = (typeof APPROVER_CHAIN_DECISIONS)[number];

export const CAPABILITY_LEASE_FIELDS = Object.freeze([
  "schema", "leaseId", "boundaryId", "subjectId", "capabilities", "status",
  "issuedAtEpochSec", "expiresAtEpochSec", "parentLeaseId", "diagnostics",
] as const);

export const CAPABILITY_ATTENUATION_FIELDS = Object.freeze([
  "schema", "attenuationId", "parentLeaseId", "childLeaseId",
  "parentCapabilities", "childCapabilities", "complete", "diagnostics",
] as const);

export const APPROVER_CHAIN_FIELDS = Object.freeze([
  "schema", "chainId", "leaseId", "subjectId", "approverIds", "decision",
  "complete", "diagnostics",
] as const);

export type CapabilityLeaseDiagnosticField =
  | "record" | "schema" | "leaseId" | "boundaryId" | "subjectId" | "capabilities"
  | "status" | "issuedAtEpochSec" | "expiresAtEpochSec" | "parentLeaseId"
  | "diagnostics" | "attenuationId" | "childLeaseId" | "parentCapabilities"
  | "childCapabilities" | "complete" | "chainId" | "approverIds" | "decision";

export interface CapabilityLeaseDiagnostic {
  readonly code: string;
  readonly severity: "error";
  readonly message: string;
  readonly field: CapabilityLeaseDiagnosticField;
}

export interface CapabilityLease {
  readonly schema: typeof CAPABILITY_LEASE_SCHEMA;
  readonly leaseId: string;
  readonly boundaryId: string;
  readonly subjectId: string;
  readonly capabilities: readonly string[];
  readonly status: CapabilityLeaseStatus;
  readonly issuedAtEpochSec: number;
  readonly expiresAtEpochSec: number;
  readonly parentLeaseId: string;
  readonly diagnostics: readonly CapabilityLeaseDiagnostic[];
}

export interface CapabilityAttenuation {
  readonly schema: typeof CAPABILITY_ATTENUATION_SCHEMA;
  readonly attenuationId: string;
  readonly parentLeaseId: string;
  readonly childLeaseId: string;
  readonly parentCapabilities: readonly string[];
  readonly childCapabilities: readonly string[];
  readonly complete: boolean;
  readonly diagnostics: readonly CapabilityLeaseDiagnostic[];
}

export interface ApproverChain {
  readonly schema: typeof APPROVER_CHAIN_SCHEMA;
  readonly chainId: string;
  readonly leaseId: string;
  readonly subjectId: string;
  readonly approverIds: readonly string[];
  readonly decision: ApproverChainDecision;
  readonly complete: boolean;
  readonly diagnostics: readonly CapabilityLeaseDiagnostic[];
}

export type ReadCapabilityLeaseResult =
  | { readonly ok: true; readonly value: CapabilityLease }
  | { readonly ok: false; readonly diagnostics: readonly CapabilityLeaseDiagnostic[] };

export type ReadCapabilityAttenuationResult =
  | { readonly ok: true; readonly value: CapabilityAttenuation }
  | { readonly ok: false; readonly diagnostics: readonly CapabilityLeaseDiagnostic[] };

export type ReadApproverChainResult =
  | { readonly ok: true; readonly value: ApproverChain }
  | { readonly ok: false; readonly diagnostics: readonly CapabilityLeaseDiagnostic[] };

const ID_TOKEN = /^[A-Za-z][A-Za-z0-9._-]{0,63}$/;
const MAX_LIST = 4096;
const MAX_KEYS = 32;
const STATUS_SET = new Set<string>(CAPABILITY_LEASE_STATUSES);
const DECISION_SET = new Set<string>(APPROVER_CHAIN_DECISIONS);
const MAX_EPOCH = 4102444800; // 2100-01-01T00:00:00Z

const diag = (
  code: string,
  message: string,
  field: CapabilityLeaseDiagnosticField,
): CapabilityLeaseDiagnostic => Object.freeze({ code, severity: "error" as const, message, field });

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
    if (typeof length !== "number" || !Number.isSafeInteger(length) || length < 0 || length > max) {
      return undefined;
    }
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

function requireKeysSubset(
  snap: Extract<Snapshot, { ok: true }>,
  allowed: readonly string[],
  required: readonly string[],
  field: CapabilityLeaseDiagnosticField,
  out: CapabilityLeaseDiagnostic[],
): boolean {
  const allowedSet = new Set(allowed);
  for (const key of snap.values.keys()) {
    if (!allowedSet.has(key)) {
      out.push(diag(FUNGI_SEC_CLA_001, "Record has a key outside the closed shape.", field));
      return false;
    }
  }
  for (const key of required) {
    if (!snap.values.has(key)) {
      out.push(diag(FUNGI_SEC_CLA_001, "Record is missing a required field.", field));
      return false;
    }
  }
  return true;
}

function readIdToken(
  value: unknown,
  field: CapabilityLeaseDiagnosticField,
  out: CapabilityLeaseDiagnostic[],
): string | undefined {
  if (typeof value !== "string" || !ID_TOKEN.test(value)) {
    out.push(diag(FUNGI_SEC_CLA_002, "Identifier is outside the closed token domain.", field));
    return undefined;
  }
  return value;
}

function readParentLeaseId(
  value: unknown,
  field: CapabilityLeaseDiagnosticField,
  out: CapabilityLeaseDiagnostic[],
): string | undefined {
  if (value === CAPABILITY_LEASE_PARENT_NONE) return CAPABILITY_LEASE_PARENT_NONE;
  return readIdToken(value, field, out);
}

function readTokenList(
  value: unknown,
  field: CapabilityLeaseDiagnosticField,
  requireNonEmpty: boolean,
  out: CapabilityLeaseDiagnostic[],
): readonly string[] | undefined {
  const items = snapshotArray(value, MAX_LIST);
  if (items === undefined) {
    out.push(diag(FUNGI_SEC_CLA_004, "List must be a dense array within bounds.", field));
    return undefined;
  }
  if (requireNonEmpty && items.length === 0) {
    out.push(diag(FUNGI_SEC_CLA_003, "List must be non-empty.", field));
    return undefined;
  }
  const outList: string[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    if (typeof item !== "string" || !ID_TOKEN.test(item)) {
      out.push(diag(FUNGI_SEC_CLA_002, "List entry is outside the closed token domain.", field));
      return undefined;
    }
    if (seen.has(item)) {
      out.push(diag(FUNGI_SEC_CLA_003, "List entries must be unique.", field));
      return undefined;
    }
    seen.add(item);
    outList.push(item);
  }
  if (!strictlyAscending(outList)) {
    out.push(diag(FUNGI_SEC_CLA_002, "List must be strictly ascending.", field));
    return undefined;
  }
  return Object.freeze(outList);
}

function readEpochSec(
  value: unknown,
  field: CapabilityLeaseDiagnosticField,
  out: CapabilityLeaseDiagnostic[],
): number | undefined {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value > MAX_EPOCH
  ) {
    out.push(diag(FUNGI_SEC_CLA_002, "Epoch second is outside the closed domain.", field));
    return undefined;
  }
  return value;
}

function isSubset(child: readonly string[], parent: readonly string[]): boolean {
  const set = new Set(parent);
  return child.every((c) => set.has(c));
}

function snapshotDiagnostics(
  value: unknown,
  out: CapabilityLeaseDiagnostic[],
): readonly CapabilityLeaseDiagnostic[] | undefined {
  const items = snapshotArray(value, MAX_LIST);
  if (items === undefined) {
    out.push(diag(FUNGI_SEC_CLA_001, "Diagnostics must be a dense array within bounds.", "diagnostics"));
    return undefined;
  }
  const result: CapabilityLeaseDiagnostic[] = [];
  const known = ["code", "severity", "message", "field"];
  for (const item of items) {
    const snap = snapshotRecord(item, 8);
    if (!snap.ok) {
      out.push(diag(FUNGI_SEC_CLA_001, "Diagnostic entry must be a plain data object.", "diagnostics"));
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
      code.length > 128 ||
      severity !== "error" ||
      typeof message !== "string" ||
      message.length === 0 ||
      message.length > 256 ||
      typeof f !== "string" ||
      f.length === 0 ||
      f.length > 64
    ) {
      out.push(diag(FUNGI_SEC_CLA_002, "Diagnostic fields are outside the closed domain.", "diagnostics"));
      return undefined;
    }
    result.push(Object.freeze({
      code,
      severity: "error" as const,
      message,
      field: f as CapabilityLeaseDiagnosticField,
    }));
  }
  return Object.freeze(result);
}

function fail(out: CapabilityLeaseDiagnostic[]): ReadCapabilityLeaseResult {
  return Object.freeze({ ok: false as const, diagnostics: Object.freeze([...out]) });
}

function failAtt(out: CapabilityLeaseDiagnostic[]): ReadCapabilityAttenuationResult {
  return Object.freeze({ ok: false as const, diagnostics: Object.freeze([...out]) });
}

function failChain(out: CapabilityLeaseDiagnostic[]): ReadApproverChainResult {
  return Object.freeze({ ok: false as const, diagnostics: Object.freeze([...out]) });
}

export function readCapabilityLease(input: unknown): ReadCapabilityLeaseResult {
  const out: CapabilityLeaseDiagnostic[] = [];
  const snap = snapshotRecord(input, MAX_KEYS);
  if (!snap.ok) {
    out.push(diag(FUNGI_SEC_CLA_001, "Capability lease must be a plain data object.", "record"));
    return fail(out);
  }
  if (!requireKeysSubset(snap, CAPABILITY_LEASE_FIELDS, CAPABILITY_LEASE_FIELDS, "record", out)) {
    return fail(out);
  }
  if (snap.values.get("schema") !== CAPABILITY_LEASE_SCHEMA) {
    out.push(diag(FUNGI_SEC_CLA_002, "Schema is outside the closed domain.", "schema"));
    return fail(out);
  }
  const leaseId = readIdToken(snap.values.get("leaseId"), "leaseId", out);
  if (leaseId === undefined) return fail(out);
  const boundaryId = readIdToken(snap.values.get("boundaryId"), "boundaryId", out);
  if (boundaryId === undefined) return fail(out);
  const subjectId = readIdToken(snap.values.get("subjectId"), "subjectId", out);
  if (subjectId === undefined) return fail(out);
  const capabilities = readTokenList(snap.values.get("capabilities"), "capabilities", false, out);
  if (capabilities === undefined) return fail(out);
  const statusRaw = snap.values.get("status");
  if (typeof statusRaw !== "string" || !STATUS_SET.has(statusRaw)) {
    out.push(diag(FUNGI_SEC_CLA_002, "Status is outside the closed vocabulary.", "status"));
    return fail(out);
  }
  if (statusRaw === "active" && capabilities.length === 0) {
    out.push(diag(FUNGI_SEC_CLA_003, "Active lease requires at least one capability.", "capabilities"));
    return fail(out);
  }
  if (statusRaw === "denied" && capabilities.length !== 0) {
    out.push(diag(FUNGI_SEC_CLA_003, "Denied lease must carry an empty capability list.", "capabilities"));
    return fail(out);
  }
  const issuedAtEpochSec = readEpochSec(snap.values.get("issuedAtEpochSec"), "issuedAtEpochSec", out);
  if (issuedAtEpochSec === undefined) return fail(out);
  const expiresAtEpochSec = readEpochSec(snap.values.get("expiresAtEpochSec"), "expiresAtEpochSec", out);
  if (expiresAtEpochSec === undefined) return fail(out);
  if (expiresAtEpochSec < issuedAtEpochSec) {
    out.push(diag(FUNGI_SEC_CLA_003, "Expiry must not precede issue time.", "expiresAtEpochSec"));
    return fail(out);
  }
  const parentLeaseId = readParentLeaseId(snap.values.get("parentLeaseId"), "parentLeaseId", out);
  if (parentLeaseId === undefined) return fail(out);
  if (parentLeaseId === leaseId) {
    out.push(diag(FUNGI_SEC_CLA_003, "Lease cannot be its own parent.", "parentLeaseId"));
    return fail(out);
  }
  const diagnostics = snapshotDiagnostics(snap.values.get("diagnostics"), out);
  if (diagnostics === undefined) return fail(out);
  if (diagnostics.length !== 0) {
    out.push(diag(FUNGI_SEC_CLA_005, "Successful lease must carry empty diagnostics.", "diagnostics"));
    return fail(out);
  }
  const value: CapabilityLease = Object.freeze({
    schema: CAPABILITY_LEASE_SCHEMA,
    leaseId,
    boundaryId,
    subjectId,
    capabilities,
    status: statusRaw as CapabilityLeaseStatus,
    issuedAtEpochSec,
    expiresAtEpochSec,
    parentLeaseId,
    diagnostics,
  });
  return Object.freeze({ ok: true as const, value });
}

export function readCapabilityAttenuation(input: unknown): ReadCapabilityAttenuationResult {
  const out: CapabilityLeaseDiagnostic[] = [];
  const snap = snapshotRecord(input, MAX_KEYS);
  if (!snap.ok) {
    out.push(diag(FUNGI_SEC_CLA_001, "Capability attenuation must be a plain data object.", "record"));
    return failAtt(out);
  }
  if (!requireKeysSubset(snap, CAPABILITY_ATTENUATION_FIELDS, CAPABILITY_ATTENUATION_FIELDS, "record", out)) {
    return failAtt(out);
  }
  if (snap.values.get("schema") !== CAPABILITY_ATTENUATION_SCHEMA) {
    out.push(diag(FUNGI_SEC_CLA_002, "Schema is outside the closed domain.", "schema"));
    return failAtt(out);
  }
  const attenuationId = readIdToken(snap.values.get("attenuationId"), "attenuationId", out);
  if (attenuationId === undefined) return failAtt(out);
  const parentLeaseId = readIdToken(snap.values.get("parentLeaseId"), "parentLeaseId", out);
  if (parentLeaseId === undefined) return failAtt(out);
  const childLeaseId = readIdToken(snap.values.get("childLeaseId"), "childLeaseId", out);
  if (childLeaseId === undefined) return failAtt(out);
  if (parentLeaseId === childLeaseId) {
    out.push(diag(FUNGI_SEC_CLA_003, "Parent and child lease ids must differ.", "childLeaseId"));
    return failAtt(out);
  }
  const parentCapabilities = readTokenList(
    snap.values.get("parentCapabilities"),
    "parentCapabilities",
    false,
    out,
  );
  if (parentCapabilities === undefined) return failAtt(out);
  const childCapabilities = readTokenList(
    snap.values.get("childCapabilities"),
    "childCapabilities",
    false,
    out,
  );
  if (childCapabilities === undefined) return failAtt(out);
  if (!isSubset(childCapabilities, parentCapabilities)) {
    out.push(diag(FUNGI_SEC_CLA_003, "Child capabilities must be a subset of parent capabilities.", "childCapabilities"));
    return failAtt(out);
  }
  const complete = snap.values.get("complete");
  if (typeof complete !== "boolean") {
    out.push(diag(FUNGI_SEC_CLA_002, "Complete flag must be a boolean.", "complete"));
    return failAtt(out);
  }
  const diagnostics = snapshotDiagnostics(snap.values.get("diagnostics"), out);
  if (diagnostics === undefined) return failAtt(out);
  if (diagnostics.length !== 0) {
    out.push(diag(FUNGI_SEC_CLA_005, "Successful attenuation must carry empty diagnostics.", "diagnostics"));
    return failAtt(out);
  }
  const value: CapabilityAttenuation = Object.freeze({
    schema: CAPABILITY_ATTENUATION_SCHEMA,
    attenuationId,
    parentLeaseId,
    childLeaseId,
    parentCapabilities,
    childCapabilities,
    complete,
    diagnostics,
  });
  return Object.freeze({ ok: true as const, value });
}

export function readApproverChain(input: unknown): ReadApproverChainResult {
  const out: CapabilityLeaseDiagnostic[] = [];
  const snap = snapshotRecord(input, MAX_KEYS);
  if (!snap.ok) {
    out.push(diag(FUNGI_SEC_CLA_001, "Approver chain must be a plain data object.", "record"));
    return failChain(out);
  }
  if (!requireKeysSubset(snap, APPROVER_CHAIN_FIELDS, APPROVER_CHAIN_FIELDS, "record", out)) {
    return failChain(out);
  }
  if (snap.values.get("schema") !== APPROVER_CHAIN_SCHEMA) {
    out.push(diag(FUNGI_SEC_CLA_002, "Schema is outside the closed domain.", "schema"));
    return failChain(out);
  }
  const chainId = readIdToken(snap.values.get("chainId"), "chainId", out);
  if (chainId === undefined) return failChain(out);
  const leaseId = readIdToken(snap.values.get("leaseId"), "leaseId", out);
  if (leaseId === undefined) return failChain(out);
  const subjectId = readIdToken(snap.values.get("subjectId"), "subjectId", out);
  if (subjectId === undefined) return failChain(out);
  const decisionRaw = snap.values.get("decision");
  if (typeof decisionRaw !== "string" || !DECISION_SET.has(decisionRaw)) {
    out.push(diag(FUNGI_SEC_CLA_002, "Decision is outside the closed vocabulary.", "decision"));
    return failChain(out);
  }
  const requireApprovers = decisionRaw === "allow";
  const approverIds = readTokenList(snap.values.get("approverIds"), "approverIds", requireApprovers, out);
  if (approverIds === undefined) return failChain(out);
  const complete = snap.values.get("complete");
  if (typeof complete !== "boolean") {
    out.push(diag(FUNGI_SEC_CLA_002, "Complete flag must be a boolean.", "complete"));
    return failChain(out);
  }
  const diagnostics = snapshotDiagnostics(snap.values.get("diagnostics"), out);
  if (diagnostics === undefined) return failChain(out);
  if (diagnostics.length !== 0) {
    out.push(diag(FUNGI_SEC_CLA_005, "Successful approver chain must carry empty diagnostics.", "diagnostics"));
    return failChain(out);
  }
  const value: ApproverChain = Object.freeze({
    schema: APPROVER_CHAIN_SCHEMA,
    chainId,
    leaseId,
    subjectId,
    approverIds,
    decision: decisionRaw as ApproverChainDecision,
    complete,
    diagnostics,
  });
  return Object.freeze({ ok: true as const, value });
}

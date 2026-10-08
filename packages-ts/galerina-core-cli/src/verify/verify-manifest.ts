// Runtime manifest verification beyond hash (TODO pass, Grok 2026-10-05; zero-trust defaults, owner may revisit).
//
// `verifyHash` (../verify.ts) proves only that some bytes match a digest. This module checks
// what those bytes claim. It validates the per-flow runtime manifest the compiler ships today,
// `fungi.runtime.manifest.v1`. The shape mirrors `RuntimeManifest` in
// galerina-core-compiler/src/type-registry.ts and the producer in governance-verifier.ts
// (production profile). tests/verify-manifest.test.mjs pins this mirror against the compiler
// source, so it cannot drift silently.
//
// Zero-trust rules:
//  - Closed shape. A record must be a plain data object with exactly the v1 keys. Unknown keys,
//    symbol keys, accessors (getters) and non-plain prototypes are refused. Values are copied
//    once through property descriptors, so a getter never runs and a proxy cannot change a
//    value between checks.
//  - An unknown schemaVersion is refused, and no other field is interpreted under it.
//  - Every field has a closed domain: identifier-safe names, a known qualifier, only the
//    governance flag bits the compiler defines, strictly sorted effects, and bounded lengths.
//  - The fields must agree with each other the way the producer derives them: the booleans and
//    the flag mask, the actor context, the secure-only intent flag, production-strict against
//    verified, audit with effects, and proof obligations bound to this flow.
//  - `verified: false` never verifies.
//  - Diagnostics are closed: a fixed code, a fixed message and a field name from the v1 list.
//    They never echo a value or an unknown key name.
//
// File-container check (SuperGrok 2026-10-07): a JSON object with schemaVersion
// `galerina.manifest.v1` is the planned pass-14 `runtime-manifest.json` (compiler README v0.2).
// Nested routes/functions/effects/permissions are PROPOSED only — there is no producer to pin.
// GovernanceSignature exists for ProofGraph (compiler proof-graph.ts); it is not a file-container
// signature. This module refuses that object as unsigned (FUNGI-VERIFY-017) or unverifiable under
// all-zero operational pins (FUNGI-VERIFY-018). Nested fields are not interpreted.

export const RUNTIME_MANIFEST_SCHEMA = "fungi.runtime.manifest.v1";

/** Record is not a closed v1 data object: unreadable, non-plain, accessor, unknown/missing key or wrong type. */
export const FUNGI_VERIFY_006 = "FUNGI-VERIFY-006";
/** schemaVersion is not exactly `fungi.runtime.manifest.v1`. */
export const FUNGI_VERIFY_007 = "FUNGI-VERIFY-007";
/** A field value is outside its closed domain. */
export const FUNGI_VERIFY_008 = "FUNGI-VERIFY-008";
/** Fields contradict each other (flag mask vs booleans/context/qualifier/verified; audit without effects; obligation not bound to the flow). */
export const FUNGI_VERIFY_009 = "FUNGI-VERIFY-009";
/** The manifest is not compiler-verified (`verified` is false). */
export const FUNGI_VERIFY_010 = "FUNGI-VERIFY-010";
/** The manifest set is not a non-empty bounded array, or lists a flow twice. */
export const FUNGI_VERIFY_011 = "FUNGI-VERIFY-011";

/** The exact v1 key list, in the compiler's declaration order. `arenaLimitMb` may be absent (undefined is dropped by JSON). */
export const RUNTIME_MANIFEST_FIELDS = Object.freeze([
  "schemaVersion",
  "flow",
  "qualifier",
  "requiresAudit",
  "deniesRemote",
  "allowedEffects",
  "requiredContext",
  "computeTarget",
  "governanceFlagsMask",
  "proofObligations",
  "policyPurposes",
  "verified",
  "arenaLimitMb",
] as const);

export type RuntimeManifestField = (typeof RUNTIME_MANIFEST_FIELDS)[number];

/** Mirrors GovernanceFlags in galerina-core-compiler/src/type-registry.ts. */
export const RUNTIME_MANIFEST_GOVERNANCE_FLAGS = Object.freeze({
  RequiresAudit: 1 << 0,
  DenyRemote: 1 << 1,
  ContainsPII: 1 << 2,
  AllowsNetwork: 1 << 3,
  RequiresActor: 1 << 4,
  ProductionStrict: 1 << 5,
  RequiresIntent: 1 << 6,
  HasPolicy: 1 << 7,
} as const);

/** Mirrors the parser's flow qualifier union (galerina-core-compiler/src/parser.ts). */
export const RUNTIME_MANIFEST_QUALIFIERS: readonly string[] = Object.freeze(["flow", "secure", "pure", "guarded"]);

/**
 * computeTarget values admitted. The shipped producer emits only "best" (Phase 20 compute-block
 * extraction is not built). Anything else is refused until the compiler emits it (owner may revisit).
 */
export const RUNTIME_MANIFEST_COMPUTE_TARGETS: readonly string[] = Object.freeze(["best"]);

export type ManifestDiagnosticField = RuntimeManifestField | "record" | "set" | "signature" | "container";

export interface ManifestDiagnostic {
  readonly code: string;
  readonly severity: "error";
  readonly message: string;
  readonly field: ManifestDiagnosticField;
  /** Position of the record in the set (0 for a single record; -1 for set-level diagnostics). */
  readonly index: number;
}

export interface VerifiedRuntimeManifest {
  readonly index: number;
  /** The flow name, only when it passed validation; otherwise "". */
  readonly flow: string;
  readonly verified: boolean;
  readonly diagnostics: readonly ManifestDiagnostic[];
}

export interface RuntimeManifestVerification {
  readonly success: boolean;
  readonly manifests: readonly VerifiedRuntimeManifest[];
  readonly diagnostics: readonly ManifestDiagnostic[];
}

const ALL_FLAG_BITS = Object.values(RUNTIME_MANIFEST_GOVERNANCE_FLAGS).reduce((a, b) => a | b, 0);
const IDENT = /^[A-Za-z_][A-Za-z0-9_]{0,127}$/;
const EFFECT = /^[a-z][A-Za-z0-9_]*(?:\.[a-z][A-Za-z0-9_]*)*$/;
const TOKEN = /^[A-Za-z0-9_][A-Za-z0-9_.:-]{0,127}$/;
const OBLIGATION_KIND = /^[a-z][a-z0-9_-]*$/;
// C0 controls, DEL and the Unicode line/paragraph separators are refused in obligation text.
const CONTROL = /[\u0000-\u001f\u007f\u2028\u2029]/;
const MAX_TOKEN = 128;
const MAX_OBLIGATION = 1024;
const MAX_LIST = 256;
const MAX_OBLIGATIONS = 1024;
/** Upper bound on records in one set (owner may revisit). */
export const RUNTIME_MANIFEST_MAX_SET = 4096;

const diag = (code: string, message: string, field: ManifestDiagnosticField, index: number): ManifestDiagnostic =>
  Object.freeze({ code, severity: "error" as const, message, field, index });

type Snapshot = { readonly ok: true; readonly values: ReadonlyMap<string, unknown> } | { readonly ok: false };

/** Copy own data properties of a plain object without running getters. Any trap failure, accessor or symbol key refuses. */
function snapshotRecord(value: unknown): Snapshot {
  try {
    if (value === null || typeof value !== "object" || Array.isArray(value)) return { ok: false };
    const proto: unknown = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) return { ok: false };
    const values = new Map<string, unknown>();
    const keys = Reflect.ownKeys(value);
    if (keys.length > RUNTIME_MANIFEST_FIELDS.length + 64) return { ok: false };
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

/** Copy a dense array of strings through descriptors. Returns undefined when it is not one. */
function snapshotStrings(value: unknown, max: number): readonly string[] | undefined {
  try {
    if (!Array.isArray(value)) return undefined;
    const lengthDesc = Object.getOwnPropertyDescriptor(value, "length");
    const length: unknown = lengthDesc?.value;
    if (typeof length !== "number" || !Number.isSafeInteger(length) || length < 0 || length > max) return undefined;
    const keys = Reflect.ownKeys(value);
    if (keys.length !== length + 1) return undefined; // indices + "length" only: no holes, no extra keys
    const out: string[] = [];
    for (let i = 0; i < length; i += 1) {
      const d = Object.getOwnPropertyDescriptor(value, String(i));
      if (d === undefined || !("value" in d) || typeof d.value !== "string") return undefined;
      out.push(d.value);
    }
    return out;
  } catch {
    return undefined;
  }
}

/** Copy a dense array of arbitrary values through descriptors (for the record set). */
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
      if (d === undefined || !("value" in d)) return undefined;
      out.push(d.value);
    }
    return out;
  } catch {
    return undefined;
  }
}

const unique = (xs: readonly string[]): boolean => new Set(xs).size === xs.length;
const strictlyAscending = (xs: readonly string[]): boolean => xs.every((x, i) => i === 0 || (xs[i - 1] as string) < x);

/** Verify one `fungi.runtime.manifest.v1` record. Never throws. */
export function verifyRuntimeManifest(record: unknown, index = 0): VerifiedRuntimeManifest {
  const at = Number.isSafeInteger(index) && index >= 0 ? index : 0;
  const out: ManifestDiagnostic[] = [];
  const done = (flow: string): VerifiedRuntimeManifest =>
    Object.freeze({ index: at, flow, verified: out.length === 0, diagnostics: Object.freeze([...out]) });

  const snap = snapshotRecord(record);
  if (!snap.ok) {
    out.push(diag(FUNGI_VERIFY_006, "Manifest record must be a plain data object (no accessors, symbols or custom prototype).", "record", at));
    return done("");
  }
  const v = snap.values;
  const known = new Set<string>(RUNTIME_MANIFEST_FIELDS);
  if ([...v.keys()].some((k) => !known.has(k))) {
    out.push(diag(FUNGI_VERIFY_006, "Manifest record has a key outside the closed v1 shape.", "record", at));
  }
  for (const field of RUNTIME_MANIFEST_FIELDS) {
    if (field !== "arenaLimitMb" && !v.has(field)) out.push(diag(FUNGI_VERIFY_006, "Manifest record is missing a required v1 field.", field, at));
  }

  const schemaVersion = v.get("schemaVersion");
  if (v.has("schemaVersion")) {
    if (typeof schemaVersion !== "string") {
      out.push(diag(FUNGI_VERIFY_006, "Field has the wrong type.", "schemaVersion", at));
      return done("");
    }
    if (schemaVersion !== RUNTIME_MANIFEST_SCHEMA) {
      out.push(diag(FUNGI_VERIFY_007, "Unsupported runtime manifest schemaVersion; fields are not interpreted.", "schemaVersion", at));
      return done("");
    }
  }
  if (out.length > 0) return done("");

  const wrongType = (field: RuntimeManifestField): void => { out.push(diag(FUNGI_VERIFY_006, "Field has the wrong type.", field, at)); };
  const outOfDomain = (field: RuntimeManifestField, message: string): void => { out.push(diag(FUNGI_VERIFY_008, message, field, at)); };

  // Scalars
  const flow = v.get("flow");
  let flowOk = false;
  if (typeof flow !== "string") wrongType("flow");
  else if (!IDENT.test(flow)) outOfDomain("flow", "Flow name must be an identifier of at most 128 characters.");
  else flowOk = true;

  const qualifier = v.get("qualifier");
  if (typeof qualifier !== "string") wrongType("qualifier");
  else if (!RUNTIME_MANIFEST_QUALIFIERS.includes(qualifier)) outOfDomain("qualifier", "Qualifier is not a known flow qualifier.");

  const requiresAudit = v.get("requiresAudit");
  if (typeof requiresAudit !== "boolean") wrongType("requiresAudit");
  const deniesRemote = v.get("deniesRemote");
  if (typeof deniesRemote !== "boolean") wrongType("deniesRemote");
  const verified = v.get("verified");
  if (typeof verified !== "boolean") wrongType("verified");

  const computeTarget = v.get("computeTarget");
  if (typeof computeTarget !== "string") wrongType("computeTarget");
  else if (!RUNTIME_MANIFEST_COMPUTE_TARGETS.includes(computeTarget)) outOfDomain("computeTarget", "computeTarget is not a value the compiler emits.");

  const mask = v.get("governanceFlagsMask");
  if (typeof mask !== "number") wrongType("governanceFlagsMask");
  else if (!Number.isSafeInteger(mask) || mask < 0 || (mask & ~ALL_FLAG_BITS) !== 0) {
    outOfDomain("governanceFlagsMask", "governanceFlagsMask must be a non-negative integer using only defined governance flag bits.");
  }

  if (v.has("arenaLimitMb")) {
    const arena = v.get("arenaLimitMb");
    if (arena !== undefined) {
      if (typeof arena !== "number") wrongType("arenaLimitMb");
      else if (!Number.isFinite(arena) || arena <= 0) outOfDomain("arenaLimitMb", "arenaLimitMb must be a finite number greater than zero.");
    }
  }

  // Lists
  const allowedEffects = snapshotStrings(v.get("allowedEffects"), MAX_LIST);
  if (allowedEffects === undefined) wrongType("allowedEffects");
  else if (!allowedEffects.every((e) => e.length <= MAX_TOKEN && EFFECT.test(e))) outOfDomain("allowedEffects", "Each effect must be a dotted lower-camel name of at most 128 characters (no wildcards).");
  else if (!strictlyAscending(allowedEffects)) outOfDomain("allowedEffects", "allowedEffects must be sorted with no duplicates.");

  const requiredContext = snapshotStrings(v.get("requiredContext"), MAX_LIST);
  if (requiredContext === undefined) wrongType("requiredContext");
  else if (!requiredContext.every((c) => IDENT.test(c))) outOfDomain("requiredContext", "Each required context field must be an identifier of at most 128 characters.");
  else if (!unique(requiredContext)) outOfDomain("requiredContext", "requiredContext must not list a field twice.");

  const policyPurposes = snapshotStrings(v.get("policyPurposes"), MAX_LIST);
  if (policyPurposes === undefined) wrongType("policyPurposes");
  else if (!policyPurposes.every((p) => TOKEN.test(p))) outOfDomain("policyPurposes", "Each policy purpose must be a safe token of at most 128 characters.");
  else if (!unique(policyPurposes)) outOfDomain("policyPurposes", "policyPurposes must not list a purpose twice.");

  const proofObligations = snapshotStrings(v.get("proofObligations"), MAX_OBLIGATIONS);
  if (proofObligations === undefined) wrongType("proofObligations");
  else if (!proofObligations.every((o) => o.length > 0 && o.length <= MAX_OBLIGATION && !CONTROL.test(o))) {
    outOfDomain("proofObligations", "Each proof obligation must be 1-1024 characters with no control characters.");
  }

  if (out.length > 0) return done(flowOk ? (flow as string) : "");

  // Cross-field consistency: only on a record whose every field is well-formed.
  const f = flow as string;
  const m = mask as number;
  const F = RUNTIME_MANIFEST_GOVERNANCE_FLAGS;
  const effects = allowedEffects as readonly string[];
  const context = requiredContext as readonly string[];
  const obligations = proofObligations as readonly string[];
  const conflict = (field: RuntimeManifestField, message: string): void => { out.push(diag(FUNGI_VERIFY_009, message, field, at)); };

  if (requiresAudit !== ((m & F.RequiresAudit) !== 0)) conflict("requiresAudit", "requiresAudit disagrees with the RequiresAudit flag.");
  if (deniesRemote !== ((m & F.DenyRemote) !== 0)) conflict("deniesRemote", "deniesRemote disagrees with the DenyRemote flag.");
  if (((m & F.RequiresActor) !== 0) !== context.some((c) => c === "actor" || c === "user_id")) {
    conflict("requiredContext", "The RequiresActor flag disagrees with requiredContext (actor/user_id).");
  }
  if (((m & F.ProductionStrict) !== 0) !== verified) conflict("verified", "The ProductionStrict flag disagrees with verified.");
  if ((m & F.RequiresIntent) !== 0 && qualifier !== "secure") conflict("qualifier", "RequiresIntent is set on a flow that is not secure.");
  if ((m & F.RequiresAudit) !== 0 && effects.length === 0) conflict("allowedEffects", "An audited flow must declare at least one allowed effect.");
  // Each obligation must be `<kind>:<this flow>` or `<kind>:<this flow>:...`. The producer filters with
  // includes(flow), which also admits another flow whose name contains this one; that is refused here.
  const boundToFlow = (o: string): boolean => {
    const first = o.indexOf(":");
    if (first <= 0 || !OBLIGATION_KIND.test(o.slice(0, first))) return false;
    const rest = o.slice(first + 1);
    return rest === f || rest.startsWith(`${f}:`);
  };
  if (!obligations.every(boundToFlow)) conflict("proofObligations", "A proof obligation is not bound to this flow.");

  if (verified === false) out.push(diag(FUNGI_VERIFY_010, "Manifest is not compiler-verified; it never verifies.", "verified", at));

  return done(f);
}

/**
 * Verify a set of `fungi.runtime.manifest.v1` records, as in GovernanceVerifyResult.runtimeManifests.
 * Success needs a non-empty bounded array in which every record verifies and no flow appears twice.
 * Never throws.
 */
export function verifyRuntimeManifestSet(records: unknown): RuntimeManifestVerification {
  const items = snapshotArray(records, RUNTIME_MANIFEST_MAX_SET);
  if (items === undefined) {
    return Object.freeze({
      success: false,
      manifests: Object.freeze([]),
      diagnostics: Object.freeze([diag(FUNGI_VERIFY_011, "Manifest set must be a dense array of at most 4096 records.", "set", -1)]),
    });
  }
  const setDiagnostics: ManifestDiagnostic[] = [];
  if (items.length === 0) setDiagnostics.push(diag(FUNGI_VERIFY_011, "No runtime manifests were given to verify.", "set", -1));
  const manifests = items.map((item, i) => verifyRuntimeManifest(item, i));
  const seen = new Set<string>();
  for (const m of manifests) {
    if (m.flow === "") continue;
    if (seen.has(m.flow)) setDiagnostics.push(diag(FUNGI_VERIFY_011, "Manifest set lists a flow twice.", "set", m.index));
    seen.add(m.flow);
  }
  const diagnostics = [...setDiagnostics, ...manifests.flatMap((m) => m.diagnostics)];
  return Object.freeze({ success: diagnostics.length === 0, manifests: Object.freeze(manifests), diagnostics: Object.freeze(diagnostics) });
}

/** Planned pass-14 file container (compiler README v0.2). Nested fields are not interpreted. */
export const FILE_CONTAINER_SCHEMA = "galerina.manifest.v1";

/** 64-zero hex: operational Ed25519 / ML-DSA / delegation pins in governance/beta-v1-platform-policy.json. */
export const ALL_ZERO_OPERATIONAL_PIN = "0000000000000000000000000000000000000000000000000000000000000000";

/** File container is not `galerina.manifest.v1`, or it is unsigned. */
export const FUNGI_VERIFY_017 = "FUNGI-VERIFY-017";
/** Operational pins are all-zero, so a file-container signature cannot verify. */
export const FUNGI_VERIFY_018 = "FUNGI-VERIFY-018";

export interface FileContainerVerification {
  readonly success: boolean;
  readonly diagnostics: readonly ManifestDiagnostic[];
}

function hasNonEmptySignature(values: ReadonlyMap<string, unknown>): boolean {
  if (!values.has("signature")) return false;
  const sig = values.get("signature");
  if (typeof sig === "string") return sig.length > 0;
  if (sig !== null && typeof sig === "object" && !Array.isArray(sig)) return true;
  return false;
}

/**
 * Extra fail-closed check for a `galerina.manifest.v1` file container.
 * Does not read nested README fields. Does not call compiler crypto. Never throws.
 * Today operational pins are all-zero, so a container never verifies.
 */
export function verifyFileContainer(record: unknown): FileContainerVerification {
  const out: ManifestDiagnostic[] = [];
  const done = (): FileContainerVerification =>
    Object.freeze({ success: false, diagnostics: Object.freeze([...out]) });

  const snap = snapshotRecord(record);
  if (!snap.ok) {
    out.push(diag(FUNGI_VERIFY_017, "File container must be a plain data object (no accessors, symbols or custom prototype).", "container", -1));
    return done();
  }
  const schemaVersion = snap.values.get("schemaVersion");
  if (typeof schemaVersion !== "string" || schemaVersion !== FILE_CONTAINER_SCHEMA) {
    out.push(diag(FUNGI_VERIFY_017, "File container schemaVersion is not galerina.manifest.v1; nested fields are not interpreted.", "schemaVersion", -1));
    return done();
  }
  if (!hasNonEmptySignature(snap.values)) {
    out.push(diag(FUNGI_VERIFY_017, "File container is unsigned; verify refuses it.", "signature", -1));
    return done();
  }
  out.push(diag(FUNGI_VERIFY_018, "Operational pins are all-zero; a file-container signature cannot verify.", "signature", -1));
  return done();
}

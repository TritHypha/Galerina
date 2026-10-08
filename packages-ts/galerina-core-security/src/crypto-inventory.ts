// Crypto inventory and post-quantum readiness report schema (TODO pass, Grok
// 2026-10-05; zero-trust defaults, owner may revisit).
//
// Closed-shape contracts for the security TODO row "Define crypto inventory and
// post-quantum readiness report schemas". Grounded in README Safety Contracts
// ("cryptographic choices must be policy-driven and reportable"; "post-quantum
// readiness must be reported through crypto inventory evidence"),
// docs/reports/reports-crypto-inventory.md and docs/rules/rules-quantum-readiness.md
// ("Unknown quantum or cryptographic states must not collapse into allow").
//
// LABELS ONLY. This module does not assess, certify or claim post-quantum
// readiness of Galerina or of any application. `postQuantumReadiness` is the
// caller's declared policy state; the reader only refuses a "ready" declaration
// that its own inventory contradicts. Algorithm labels below are coarse baseline
// categories for the closed in-package algorithm vocabulary, owner may revisit.
//
// Zero-trust rules:
//  - Closed shapes via property descriptors (no getters; symbols / accessors /
//    custom prototypes refuse). Unknown keys refuse without echoing the key.
//  - Algorithms are the closed vocabulary: CryptoAlgorithm + WeakCryptoAlgorithm
//    (src/index.ts) + ml-dsa-65 (already used for hybrid manifest signing).
//  - status must be the algorithm's baseline label or "unassessed"; weak
//    algorithms must be "legacy_weak" and "denied".
//  - "unassessed" or hard-coded uses can never be "approved".
//  - Uses unique by (purpose, algorithm), strictly ascending.
//  - Never throws; never echoes algorithm names / ids / tokens / unknown values.
//
// Not covered: library / deployment / fingerprint fields, key sizes, hybrid
// pair records, quantum target / measurement / fallback reports, SecureRandom
// diagnostics, scanners, or report file writers. SecretReference v0.2 and taint
// types remain do-not-invent.

/** Record / input is not a closed data object. */
export const FUNGI_SEC_CIV_001 = "FUNGI-SEC-CIV-001";
/** A field value is outside its closed domain. */
export const FUNGI_SEC_CIV_002 = "FUNGI-SEC-CIV-002";
/** Use consistency refuse (label / decision / migration / duplicate / order). */
export const FUNGI_SEC_CIV_003 = "FUNGI-SEC-CIV-003";
/** Nested record / list refuse. */
export const FUNGI_SEC_CIV_004 = "FUNGI-SEC-CIV-004";
/** Result consistency refuse (readiness contradiction / diagnostics) / lookup miss. */
export const FUNGI_SEC_CIV_005 = "FUNGI-SEC-CIV-005";

export const CRYPTO_INVENTORY_SCHEMA = "galerina.security.crypto-inventory/v1";

export const CRYPTO_INVENTORY_ALGORITHMS = Object.freeze([
  "3des",
  "aes-256-gcm",
  "argon2id",
  "chacha20-poly1305",
  "des",
  "ed25519",
  "md5",
  "ml-dsa-65",
  "rc4",
  "rsa-pkcs1-v1_5",
  "sha-1",
  "sha-256",
  "sha-512",
  "x25519",
] as const);
export type CryptoInventoryAlgorithm = (typeof CRYPTO_INVENTORY_ALGORITHMS)[number];

export const CRYPTO_INVENTORY_PURPOSES = Object.freeze([
  "data_encryption",
  "integrity_digest",
  "key_agreement",
  "manifest_signature",
  "other",
  "package_signature",
  "password_hashing",
  "token_signature",
  "transport",
] as const);
export type CryptoInventoryPurpose = (typeof CRYPTO_INVENTORY_PURPOSES)[number];

export const CRYPTO_INVENTORY_STATUSES = Object.freeze([
  "legacy_weak",
  "post_quantum",
  "quantum_vulnerable",
  "symmetric_or_hash",
  "unassessed",
] as const);
export type CryptoInventoryStatus = (typeof CRYPTO_INVENTORY_STATUSES)[number];

export const CRYPTO_POLICY_DECISIONS = Object.freeze(["approved", "denied", "review"] as const);
export type CryptoPolicyDecision = (typeof CRYPTO_POLICY_DECISIONS)[number];

export const CRYPTO_MIGRATION_PATHS = Object.freeze([
  "hybrid_planned",
  "none",
  "not_applicable",
  "post_quantum_planned",
] as const);
export type CryptoMigrationPath = (typeof CRYPTO_MIGRATION_PATHS)[number];

export const POST_QUANTUM_READINESS_STATES = Object.freeze(["not_assessed", "not_ready", "ready"] as const);
export type PostQuantumReadiness = (typeof POST_QUANTUM_READINESS_STATES)[number];

export const CRYPTO_INVENTORY_FIELDS = Object.freeze([
  "schema", "uses", "postQuantumReadiness", "complete", "diagnostics",
] as const);

export const CRYPTO_INVENTORY_USE_FIELDS = Object.freeze([
  "purpose", "algorithm", "status", "policyDecision", "hardCoded", "migrationPath",
] as const);

type BaselineLabel = Exclude<CryptoInventoryStatus, "unassessed">;

/**
 * Coarse baseline category per algorithm. Labels only (owner may revisit):
 * weak list -> legacy_weak; symmetric AEAD / hash / password KDF ->
 * symmetric_or_hash; classical elliptic-curve signature / agreement ->
 * quantum_vulnerable; ML-DSA-65 (FIPS 204) -> post_quantum.
 */
export const CRYPTO_ALGORITHM_BASELINE_LABELS: Readonly<Record<CryptoInventoryAlgorithm, BaselineLabel>> =
  Object.freeze({
    "3des": "legacy_weak",
    "aes-256-gcm": "symmetric_or_hash",
    "argon2id": "symmetric_or_hash",
    "chacha20-poly1305": "symmetric_or_hash",
    "des": "legacy_weak",
    "ed25519": "quantum_vulnerable",
    "md5": "legacy_weak",
    "ml-dsa-65": "post_quantum",
    "rc4": "legacy_weak",
    "rsa-pkcs1-v1_5": "legacy_weak",
    "sha-1": "legacy_weak",
    "sha-256": "symmetric_or_hash",
    "sha-512": "symmetric_or_hash",
    "x25519": "quantum_vulnerable",
  });

export type CryptoInventoryDiagnosticField =
  | "record" | "schema" | "uses" | "postQuantumReadiness" | "complete" | "diagnostics"
  | "purpose" | "algorithm" | "status" | "policyDecision" | "hardCoded" | "migrationPath";

export interface CryptoInventoryDiagnostic {
  readonly code: string;
  readonly severity: "error";
  readonly message: string;
  readonly field: CryptoInventoryDiagnosticField;
}

export interface CryptoInventoryUse {
  readonly purpose: CryptoInventoryPurpose;
  readonly algorithm: CryptoInventoryAlgorithm;
  readonly status: CryptoInventoryStatus;
  readonly policyDecision: CryptoPolicyDecision;
  readonly hardCoded: boolean;
  readonly migrationPath: CryptoMigrationPath;
}

export interface CryptoInventoryReport {
  readonly schema: typeof CRYPTO_INVENTORY_SCHEMA;
  readonly uses: readonly CryptoInventoryUse[];
  readonly postQuantumReadiness: PostQuantumReadiness;
  readonly complete: boolean;
  readonly diagnostics: readonly CryptoInventoryDiagnostic[];
}

export type ReadCryptoInventoryResult =
  | { readonly ok: true; readonly value: CryptoInventoryReport }
  | { readonly ok: false; readonly diagnostics: readonly CryptoInventoryDiagnostic[] };

export type LookupCryptoAlgorithmLabelResult =
  | { readonly ok: true; readonly value: BaselineLabel }
  | { readonly ok: false; readonly diagnostics: readonly CryptoInventoryDiagnostic[] };

const MAX_USES = 256;
const MAX_KEYS = 16;
const ALGORITHM_SET = new Set<string>(CRYPTO_INVENTORY_ALGORITHMS);
const PURPOSE_SET = new Set<string>(CRYPTO_INVENTORY_PURPOSES);
const STATUS_SET = new Set<string>(CRYPTO_INVENTORY_STATUSES);
const DECISION_SET = new Set<string>(CRYPTO_POLICY_DECISIONS);
const MIGRATION_SET = new Set<string>(CRYPTO_MIGRATION_PATHS);
const READINESS_SET = new Set<string>(POST_QUANTUM_READINESS_STATES);
const READY_STATUSES = new Set<string>(["post_quantum", "symmetric_or_hash"]);

const diag = (
  code: string,
  message: string,
  field: CryptoInventoryDiagnosticField,
): CryptoInventoryDiagnostic => Object.freeze({ code, severity: "error" as const, message, field });

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

function requireExactKeys(
  snap: Extract<Snapshot, { ok: true }>,
  keys: readonly string[],
  field: CryptoInventoryDiagnosticField,
  out: CryptoInventoryDiagnostic[],
): boolean {
  const allowed = new Set(keys);
  for (const key of snap.values.keys()) {
    if (!allowed.has(key)) {
      out.push(diag(FUNGI_SEC_CIV_001, "Record has a key outside the closed shape.", field));
      return false;
    }
  }
  for (const key of keys) {
    if (!snap.values.has(key)) {
      out.push(diag(FUNGI_SEC_CIV_001, "Record is missing a required field.", field));
      return false;
    }
  }
  return true;
}

function closed<T extends string>(
  value: unknown,
  set: ReadonlySet<string>,
  field: CryptoInventoryDiagnosticField,
  message: string,
  out: CryptoInventoryDiagnostic[],
): T | undefined {
  if (typeof value !== "string" || !set.has(value)) {
    out.push(diag(FUNGI_SEC_CIV_002, message, field));
    return undefined;
  }
  return value as T;
}

function readUse(value: unknown, out: CryptoInventoryDiagnostic[]): CryptoInventoryUse | undefined {
  const snap = snapshotRecord(value, MAX_KEYS);
  if (!snap.ok) {
    out.push(diag(FUNGI_SEC_CIV_004, "Inventory use must be a plain data object.", "uses"));
    return undefined;
  }
  if (!requireExactKeys(snap, CRYPTO_INVENTORY_USE_FIELDS, "uses", out)) return undefined;
  const purpose = closed<CryptoInventoryPurpose>(
    snap.values.get("purpose"), PURPOSE_SET, "purpose", "Purpose is outside the closed vocabulary.", out);
  if (purpose === undefined) return undefined;
  const algorithm = closed<CryptoInventoryAlgorithm>(
    snap.values.get("algorithm"), ALGORITHM_SET, "algorithm", "Algorithm is outside the closed vocabulary.", out);
  if (algorithm === undefined) return undefined;
  const status = closed<CryptoInventoryStatus>(
    snap.values.get("status"), STATUS_SET, "status", "Status is outside the closed vocabulary.", out);
  if (status === undefined) return undefined;
  const policyDecision = closed<CryptoPolicyDecision>(
    snap.values.get("policyDecision"), DECISION_SET, "policyDecision", "Policy decision is outside the closed vocabulary.", out);
  if (policyDecision === undefined) return undefined;
  const hardCoded = snap.values.get("hardCoded");
  if (typeof hardCoded !== "boolean") {
    out.push(diag(FUNGI_SEC_CIV_002, "Hard-coded flag must be a boolean.", "hardCoded"));
    return undefined;
  }
  const migrationPath = closed<CryptoMigrationPath>(
    snap.values.get("migrationPath"), MIGRATION_SET, "migrationPath", "Migration path is outside the closed vocabulary.", out);
  if (migrationPath === undefined) return undefined;

  const label = CRYPTO_ALGORITHM_BASELINE_LABELS[algorithm];
  if (label === "legacy_weak" && status !== "legacy_weak") {
    out.push(diag(FUNGI_SEC_CIV_003, "Weak algorithm must carry status legacy_weak.", "status"));
    return undefined;
  }
  if (status !== label && status !== "unassessed") {
    out.push(diag(FUNGI_SEC_CIV_003, "Status contradicts the algorithm baseline label.", "status"));
    return undefined;
  }
  if (status === "legacy_weak" && policyDecision !== "denied") {
    out.push(diag(FUNGI_SEC_CIV_003, "Weak algorithm use must be denied.", "policyDecision"));
    return undefined;
  }
  if (status === "unassessed" && policyDecision === "approved") {
    out.push(diag(FUNGI_SEC_CIV_003, "Unassessed use must not collapse into approved.", "policyDecision"));
    return undefined;
  }
  if (hardCoded && policyDecision === "approved") {
    out.push(diag(FUNGI_SEC_CIV_003, "Hard-coded crypto choice must be reviewed or denied, not approved.", "hardCoded"));
    return undefined;
  }
  if (status === "post_quantum" && migrationPath !== "not_applicable") {
    out.push(diag(FUNGI_SEC_CIV_003, "Post-quantum use must carry migration path not_applicable.", "migrationPath"));
    return undefined;
  }
  if ((status === "quantum_vulnerable" || status === "legacy_weak") && migrationPath === "not_applicable") {
    out.push(diag(FUNGI_SEC_CIV_003, "Vulnerable or weak use must declare a migration path state.", "migrationPath"));
    return undefined;
  }
  return Object.freeze({ purpose, algorithm, status, policyDecision, hardCoded, migrationPath });
}

function snapshotDiagnostics(
  value: unknown,
  out: CryptoInventoryDiagnostic[],
): readonly CryptoInventoryDiagnostic[] | undefined {
  const items = snapshotArray(value, MAX_USES);
  if (items === undefined) {
    out.push(diag(FUNGI_SEC_CIV_001, "Diagnostics must be a dense array within bounds.", "diagnostics"));
    return undefined;
  }
  const result: CryptoInventoryDiagnostic[] = [];
  const known = ["code", "severity", "message", "field"];
  for (const item of items) {
    const snap = snapshotRecord(item, 8);
    if (!snap.ok) {
      out.push(diag(FUNGI_SEC_CIV_001, "Diagnostic entry must be a plain data object.", "diagnostics"));
      return undefined;
    }
    if (!requireExactKeys(snap, known, "diagnostics", out)) return undefined;
    const code = snap.values.get("code");
    const severity = snap.values.get("severity");
    const message = snap.values.get("message");
    const f = snap.values.get("field");
    if (
      typeof code !== "string" || code.length === 0 || code.length > 128 ||
      severity !== "error" ||
      typeof message !== "string" || message.length === 0 || message.length > 256 ||
      typeof f !== "string" || f.length === 0 || f.length > 64
    ) {
      out.push(diag(FUNGI_SEC_CIV_002, "Diagnostic fields are outside the closed domain.", "diagnostics"));
      return undefined;
    }
    result.push(Object.freeze({ code, severity: "error" as const, message, field: f as CryptoInventoryDiagnosticField }));
  }
  return Object.freeze(result);
}

function fail(out: CryptoInventoryDiagnostic[]): ReadCryptoInventoryResult {
  return Object.freeze({ ok: false as const, diagnostics: Object.freeze([...out]) });
}

function useKey(u: CryptoInventoryUse): string {
  return `${u.purpose}\u0000${u.algorithm}`;
}

/**
 * Read a crypto inventory report. Never throws. A "ready" post-quantum
 * readiness declaration is refused unless the inventory is complete, non-empty
 * and every use carries post_quantum or symmetric_or_hash. Accepting a report
 * does not certify readiness; it only means the declaration is not contradicted.
 */
export function readCryptoInventory(input: unknown): ReadCryptoInventoryResult {
  const out: CryptoInventoryDiagnostic[] = [];
  const snap = snapshotRecord(input, MAX_KEYS);
  if (!snap.ok) {
    out.push(diag(FUNGI_SEC_CIV_001, "Crypto inventory must be a plain data object.", "record"));
    return fail(out);
  }
  if (!requireExactKeys(snap, CRYPTO_INVENTORY_FIELDS, "record", out)) return fail(out);
  if (snap.values.get("schema") !== CRYPTO_INVENTORY_SCHEMA) {
    out.push(diag(FUNGI_SEC_CIV_002, "Schema is outside the closed domain.", "schema"));
    return fail(out);
  }
  const rawUses = snapshotArray(snap.values.get("uses"), MAX_USES);
  if (rawUses === undefined) {
    out.push(diag(FUNGI_SEC_CIV_004, "Uses must be a dense array within bounds.", "uses"));
    return fail(out);
  }
  const uses: CryptoInventoryUse[] = [];
  for (const raw of rawUses) {
    const use = readUse(raw, out);
    if (use === undefined) return fail(out);
    const prev = uses[uses.length - 1];
    if (prev !== undefined && !(useKey(prev) < useKey(use))) {
      out.push(diag(FUNGI_SEC_CIV_003, "Uses must be unique and strictly ascending by purpose then algorithm.", "uses"));
      return fail(out);
    }
    uses.push(use);
  }
  const readiness = closed<PostQuantumReadiness>(
    snap.values.get("postQuantumReadiness"), READINESS_SET, "postQuantumReadiness",
    "Post-quantum readiness is outside the closed vocabulary.", out);
  if (readiness === undefined) return fail(out);
  const complete = snap.values.get("complete");
  if (typeof complete !== "boolean") {
    out.push(diag(FUNGI_SEC_CIV_002, "Complete flag must be a boolean.", "complete"));
    return fail(out);
  }
  if (readiness === "ready") {
    if (!complete || uses.length === 0 || !uses.every((u) => READY_STATUSES.has(u.status))) {
      out.push(diag(FUNGI_SEC_CIV_005,
        "Readiness ready is contradicted by an incomplete, empty, unassessed, vulnerable or weak inventory.",
        "postQuantumReadiness"));
      return fail(out);
    }
  }
  const diagnostics = snapshotDiagnostics(snap.values.get("diagnostics"), out);
  if (diagnostics === undefined) return fail(out);
  if (diagnostics.length !== 0) {
    out.push(diag(FUNGI_SEC_CIV_005, "Successful crypto inventory must carry empty diagnostics.", "diagnostics"));
    return fail(out);
  }
  const value: CryptoInventoryReport = Object.freeze({
    schema: CRYPTO_INVENTORY_SCHEMA,
    uses: Object.freeze(uses),
    postQuantumReadiness: readiness,
    complete,
    diagnostics,
  });
  return Object.freeze({ ok: true as const, value });
}

/**
 * Look up the baseline label for an algorithm. Never throws; a non-string or
 * unknown algorithm refuses without echoing the input.
 */
export function lookupCryptoAlgorithmLabel(algorithm: unknown): LookupCryptoAlgorithmLabelResult {
  if (typeof algorithm !== "string" || !ALGORITHM_SET.has(algorithm)) {
    return Object.freeze({
      ok: false as const,
      diagnostics: Object.freeze([diag(FUNGI_SEC_CIV_005, "Algorithm has no baseline label entry.", "algorithm")]),
    });
  }
  return Object.freeze({
    ok: true as const,
    value: CRYPTO_ALGORITHM_BASELINE_LABELS[algorithm as CryptoInventoryAlgorithm],
  });
}

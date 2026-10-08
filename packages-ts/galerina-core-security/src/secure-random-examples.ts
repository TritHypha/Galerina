// SecureRandom versus Random diagnostic examples (TODO pass, Grok
// 2026-10-05; zero-trust defaults, owner may revisit).
//
// Closed-shape contracts for the security TODO row "Define SecureRandom
// versus Random diagnostic examples". Grounded in:
//  - docs/rules/rules-non-negotiable.md ("Security randomness must use
//    SecureRandom; Random is forbidden for secrets, keys, tokens, salts and
//    nonces.")
//  - docs/rules/rules-quantum-readiness.md (same pair of rules)
//  - docs/reports/reports-crypto-inventory.md ("Random used for tokens, keys,
//    salts or nonces should be an error.")
//  - README Safety Contracts ("Random must not be used for secrets, keys,
//    tokens, salts or nonces")
//
// EXAMPLES ONLY. This module does not implement SecureRandom or Random, does
// not draw entropy, does not scan source, and does not register new production
// Galerina_SECURITY_* codes. It freezes a closed catalog of illustrative
// diagnostic examples and a reader that validates closed example sets.
//
// Zero-trust rules:
//  - Closed shapes via property descriptors (no getters; symbols / accessors /
//    custom prototypes refuse). Unknown keys refuse without echoing the key.
//  - Purpose vocabulary is exactly the rule list: secret|key|token|salt|nonce.
//  - Source vocabulary is exactly SecureRandom|Random.
//  - Random + any purpose must be denied with severity error.
//  - SecureRandom + any purpose must be allowed with severity info.
//  - Examples unique by (purpose, source), strictly ascending.
//  - Never throws; never echoes purpose / source / tokens / unknown values.
//
// Not covered: CSPRNG runtime, scanners, report writers, SecretReference v0.2,
// taint types, hardware-risk report inputs, or production Galerina_SECURITY_*
// code registration.

/** Record / input is not a closed data object. */
export const FUNGI_SEC_SRN_001 = "FUNGI-SEC-SRN-001";
/** A field value is outside its closed domain. */
export const FUNGI_SEC_SRN_002 = "FUNGI-SEC-SRN-002";
/** Consistency refuse (verdict / severity / duplicate / order). */
export const FUNGI_SEC_SRN_003 = "FUNGI-SEC-SRN-003";
/** Nested record / list refuse. */
export const FUNGI_SEC_SRN_004 = "FUNGI-SEC-SRN-004";
/** Result consistency refuse / lookup miss. */
export const FUNGI_SEC_SRN_005 = "FUNGI-SEC-SRN-005";

export const SECURE_RANDOM_EXAMPLES_SCHEMA = "galerina.security.secure-random-examples/v1";

export const SECURE_RANDOM_PURPOSES = Object.freeze([
  "key",
  "nonce",
  "salt",
  "secret",
  "token",
] as const);
export type SecureRandomPurpose = (typeof SECURE_RANDOM_PURPOSES)[number];

export const RANDOMNESS_SOURCES = Object.freeze(["Random", "SecureRandom"] as const);
export type RandomnessSource = (typeof RANDOMNESS_SOURCES)[number];

export const SECURE_RANDOM_VERDICTS = Object.freeze(["allowed", "denied"] as const);
export type SecureRandomVerdict = (typeof SECURE_RANDOM_VERDICTS)[number];

export const SECURE_RANDOM_SEVERITIES = Object.freeze(["error", "info"] as const);
export type SecureRandomExampleSeverity = (typeof SECURE_RANDOM_SEVERITIES)[number];

export const SECURE_RANDOM_EXAMPLE_CODES = Object.freeze([
  "example.random.forbidden",
  "example.secure-random.required",
] as const);
export type SecureRandomExampleCode = (typeof SECURE_RANDOM_EXAMPLE_CODES)[number];

export const SECURE_RANDOM_EXAMPLES_FIELDS = Object.freeze([
  "schema", "examples", "complete", "diagnostics",
] as const);

export const SECURE_RANDOM_EXAMPLE_FIELDS = Object.freeze([
  "purpose", "source", "verdict", "severity", "code", "safeMessage",
] as const);

export type SecureRandomDiagnosticField =
  | "record" | "schema" | "examples" | "complete" | "diagnostics"
  | "purpose" | "source" | "verdict" | "severity" | "code" | "safeMessage";

export interface SecureRandomDiagnostic {
  readonly code: string;
  readonly severity: "error";
  readonly message: string;
  readonly field: SecureRandomDiagnosticField;
}

export interface SecureRandomExample {
  readonly purpose: SecureRandomPurpose;
  readonly source: RandomnessSource;
  readonly verdict: SecureRandomVerdict;
  readonly severity: SecureRandomExampleSeverity;
  readonly code: SecureRandomExampleCode;
  readonly safeMessage: string;
}

export interface SecureRandomExamplesReport {
  readonly schema: typeof SECURE_RANDOM_EXAMPLES_SCHEMA;
  readonly examples: readonly SecureRandomExample[];
  readonly complete: boolean;
  readonly diagnostics: readonly SecureRandomDiagnostic[];
}

export type ReadSecureRandomExamplesResult =
  | { readonly ok: true; readonly value: SecureRandomExamplesReport }
  | { readonly ok: false; readonly diagnostics: readonly SecureRandomDiagnostic[] };

export type LookupSecureRandomExampleResult =
  | { readonly ok: true; readonly value: SecureRandomExample }
  | { readonly ok: false; readonly diagnostics: readonly SecureRandomDiagnostic[] };

const MAX_EXAMPLES = 64;
const MAX_KEYS = 16;
const PURPOSE_SET = new Set<string>(SECURE_RANDOM_PURPOSES);
const SOURCE_SET = new Set<string>(RANDOMNESS_SOURCES);
const VERDICT_SET = new Set<string>(SECURE_RANDOM_VERDICTS);
const SEVERITY_SET = new Set<string>(SECURE_RANDOM_SEVERITIES);
const CODE_SET = new Set<string>(SECURE_RANDOM_EXAMPLE_CODES);

const DENIED_MESSAGE = "Random must not be used for secrets, keys, tokens, salts or nonces.";
const ALLOWED_MESSAGE = "SecureRandom is required for security randomness.";

const diag = (
  code: string,
  message: string,
  field: SecureRandomDiagnosticField,
): SecureRandomDiagnostic => Object.freeze({ code, severity: "error" as const, message, field });

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
  field: SecureRandomDiagnosticField,
  out: SecureRandomDiagnostic[],
): boolean {
  const allowed = new Set(keys);
  for (const key of snap.values.keys()) {
    if (!allowed.has(key)) {
      out.push(diag(FUNGI_SEC_SRN_001, "Record has a key outside the closed shape.", field));
      return false;
    }
  }
  for (const key of keys) {
    if (!snap.values.has(key)) {
      out.push(diag(FUNGI_SEC_SRN_001, "Record is missing a required field.", field));
      return false;
    }
  }
  return true;
}

function closed<T extends string>(
  value: unknown,
  set: ReadonlySet<string>,
  field: SecureRandomDiagnosticField,
  message: string,
  out: SecureRandomDiagnostic[],
): T | undefined {
  if (typeof value !== "string" || !set.has(value)) {
    out.push(diag(FUNGI_SEC_SRN_002, message, field));
    return undefined;
  }
  return value as T;
}

function exampleKey(e: SecureRandomExample): string {
  return `${e.purpose}\u0000${e.source}`;
}

function expectedFor(source: RandomnessSource): {
  readonly verdict: SecureRandomVerdict;
  readonly severity: SecureRandomExampleSeverity;
  readonly code: SecureRandomExampleCode;
  readonly safeMessage: string;
} {
  if (source === "Random") {
    return {
      verdict: "denied",
      severity: "error",
      code: "example.random.forbidden",
      safeMessage: DENIED_MESSAGE,
    };
  }
  return {
    verdict: "allowed",
    severity: "info",
    code: "example.secure-random.required",
    safeMessage: ALLOWED_MESSAGE,
  };
}

function readExample(value: unknown, out: SecureRandomDiagnostic[]): SecureRandomExample | undefined {
  const snap = snapshotRecord(value, MAX_KEYS);
  if (!snap.ok) {
    out.push(diag(FUNGI_SEC_SRN_004, "Example must be a plain data object.", "examples"));
    return undefined;
  }
  if (!requireExactKeys(snap, SECURE_RANDOM_EXAMPLE_FIELDS, "examples", out)) return undefined;
  const purpose = closed<SecureRandomPurpose>(
    snap.values.get("purpose"), PURPOSE_SET, "purpose", "Purpose is outside the closed vocabulary.", out);
  if (purpose === undefined) return undefined;
  const source = closed<RandomnessSource>(
    snap.values.get("source"), SOURCE_SET, "source", "Source is outside the closed vocabulary.", out);
  if (source === undefined) return undefined;
  const verdict = closed<SecureRandomVerdict>(
    snap.values.get("verdict"), VERDICT_SET, "verdict", "Verdict is outside the closed vocabulary.", out);
  if (verdict === undefined) return undefined;
  const severity = closed<SecureRandomExampleSeverity>(
    snap.values.get("severity"), SEVERITY_SET, "severity", "Severity is outside the closed vocabulary.", out);
  if (severity === undefined) return undefined;
  const code = closed<SecureRandomExampleCode>(
    snap.values.get("code"), CODE_SET, "code", "Example code is outside the closed vocabulary.", out);
  if (code === undefined) return undefined;
  const safeMessage = snap.values.get("safeMessage");
  if (typeof safeMessage !== "string" || safeMessage.length === 0 || safeMessage.length > 256) {
    out.push(diag(FUNGI_SEC_SRN_002, "Safe message is outside the closed domain.", "safeMessage"));
    return undefined;
  }
  const expected = expectedFor(source);
  if (verdict !== expected.verdict) {
    out.push(diag(FUNGI_SEC_SRN_003, "Verdict contradicts the SecureRandom versus Random rule.", "verdict"));
    return undefined;
  }
  if (severity !== expected.severity) {
    out.push(diag(FUNGI_SEC_SRN_003, "Severity contradicts the SecureRandom versus Random rule.", "severity"));
    return undefined;
  }
  if (code !== expected.code) {
    out.push(diag(FUNGI_SEC_SRN_003, "Example code contradicts the SecureRandom versus Random rule.", "code"));
    return undefined;
  }
  if (safeMessage !== expected.safeMessage) {
    out.push(diag(FUNGI_SEC_SRN_003, "Safe message contradicts the SecureRandom versus Random rule.", "safeMessage"));
    return undefined;
  }
  return Object.freeze({ purpose, source, verdict, severity, code, safeMessage });
}

function snapshotDiagnostics(
  value: unknown,
  out: SecureRandomDiagnostic[],
): readonly SecureRandomDiagnostic[] | undefined {
  const items = snapshotArray(value, MAX_EXAMPLES);
  if (items === undefined) {
    out.push(diag(FUNGI_SEC_SRN_001, "Diagnostics must be a dense array within bounds.", "diagnostics"));
    return undefined;
  }
  const result: SecureRandomDiagnostic[] = [];
  const known = ["code", "severity", "message", "field"];
  for (const item of items) {
    const snap = snapshotRecord(item, 8);
    if (!snap.ok) {
      out.push(diag(FUNGI_SEC_SRN_001, "Diagnostic entry must be a plain data object.", "diagnostics"));
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
      out.push(diag(FUNGI_SEC_SRN_002, "Diagnostic fields are outside the closed domain.", "diagnostics"));
      return undefined;
    }
    result.push(Object.freeze({ code, severity: "error" as const, message, field: f as SecureRandomDiagnosticField }));
  }
  return Object.freeze(result);
}

function fail(out: SecureRandomDiagnostic[]): ReadSecureRandomExamplesResult {
  return Object.freeze({ ok: false as const, diagnostics: Object.freeze([...out]) });
}

/**
 * Baseline catalog: every security purpose from the rule list is shown once
 * with Random (denied/error) and once with SecureRandom (allowed/info).
 * Owner may revisit the safe-message wording; the verdict matrix is fixed by
 * the non-negotiable / quantum-readiness / crypto-inventory report rules.
 */
export const SECURE_RANDOM_DIAGNOSTIC_EXAMPLES: readonly SecureRandomExample[] = Object.freeze(
  SECURE_RANDOM_PURPOSES.flatMap((purpose) =>
    RANDOMNESS_SOURCES.map((source) => {
      const expected = expectedFor(source);
      return Object.freeze({
        purpose,
        source,
        verdict: expected.verdict,
        severity: expected.severity,
        code: expected.code,
        safeMessage: expected.safeMessage,
      });
    }),
  ).sort((a, b) => (exampleKey(a) < exampleKey(b) ? -1 : exampleKey(a) > exampleKey(b) ? 1 : 0)),
);

/**
 * Read a SecureRandom-versus-Random diagnostic examples report. Never throws.
 * Accepting a report means the closed example set is consistent with the rule
 * matrix; it does not claim a scanner ran or that any application is safe.
 */
export function readSecureRandomExamples(input: unknown): ReadSecureRandomExamplesResult {
  const out: SecureRandomDiagnostic[] = [];
  const snap = snapshotRecord(input, MAX_KEYS);
  if (!snap.ok) {
    out.push(diag(FUNGI_SEC_SRN_001, "SecureRandom examples must be a plain data object.", "record"));
    return fail(out);
  }
  if (!requireExactKeys(snap, SECURE_RANDOM_EXAMPLES_FIELDS, "record", out)) return fail(out);
  if (snap.values.get("schema") !== SECURE_RANDOM_EXAMPLES_SCHEMA) {
    out.push(diag(FUNGI_SEC_SRN_002, "Schema is outside the closed domain.", "schema"));
    return fail(out);
  }
  const raw = snapshotArray(snap.values.get("examples"), MAX_EXAMPLES);
  if (raw === undefined) {
    out.push(diag(FUNGI_SEC_SRN_004, "Examples must be a dense array within bounds.", "examples"));
    return fail(out);
  }
  const examples: SecureRandomExample[] = [];
  for (const item of raw) {
    const example = readExample(item, out);
    if (example === undefined) return fail(out);
    const prev = examples[examples.length - 1];
    if (prev !== undefined && !(exampleKey(prev) < exampleKey(example))) {
      out.push(diag(FUNGI_SEC_SRN_003, "Examples must be unique and strictly ascending by purpose then source.", "examples"));
      return fail(out);
    }
    examples.push(example);
  }
  const complete = snap.values.get("complete");
  if (typeof complete !== "boolean") {
    out.push(diag(FUNGI_SEC_SRN_002, "Complete flag must be a boolean.", "complete"));
    return fail(out);
  }
  if (complete) {
    if (examples.length !== SECURE_RANDOM_DIAGNOSTIC_EXAMPLES.length) {
      out.push(diag(FUNGI_SEC_SRN_005, "Complete example set must cover the baseline catalog size.", "complete"));
      return fail(out);
    }
    for (let i = 0; i < examples.length; i += 1) {
      const a = examples[i]!;
      const b = SECURE_RANDOM_DIAGNOSTIC_EXAMPLES[i]!;
      if (
        a.purpose !== b.purpose || a.source !== b.source || a.verdict !== b.verdict ||
        a.severity !== b.severity || a.code !== b.code || a.safeMessage !== b.safeMessage
      ) {
        out.push(diag(FUNGI_SEC_SRN_005, "Complete example set must match the baseline catalog.", "examples"));
        return fail(out);
      }
    }
  }
  const diagnostics = snapshotDiagnostics(snap.values.get("diagnostics"), out);
  if (diagnostics === undefined) return fail(out);
  if (diagnostics.length !== 0) {
    out.push(diag(FUNGI_SEC_SRN_005, "Successful SecureRandom examples must carry empty diagnostics.", "diagnostics"));
    return fail(out);
  }
  const value: SecureRandomExamplesReport = Object.freeze({
    schema: SECURE_RANDOM_EXAMPLES_SCHEMA,
    examples: Object.freeze(examples),
    complete,
    diagnostics,
  });
  return Object.freeze({ ok: true as const, value });
}

/**
 * Look up the baseline SecureRandom-versus-Random diagnostic example for a
 * (purpose, source) pair. Never throws; unknown or non-string inputs refuse
 * without echoing.
 */
export function lookupSecureRandomExample(
  purpose: unknown,
  source: unknown,
): LookupSecureRandomExampleResult {
  if (typeof purpose !== "string" || !PURPOSE_SET.has(purpose) || typeof source !== "string" || !SOURCE_SET.has(source)) {
    return Object.freeze({
      ok: false as const,
      diagnostics: Object.freeze([diag(FUNGI_SEC_SRN_005, "Example has no baseline catalog entry.", "purpose")]),
    });
  }
  const found = SECURE_RANDOM_DIAGNOSTIC_EXAMPLES.find(
    (e) => e.purpose === purpose && e.source === source,
  );
  if (found === undefined) {
    return Object.freeze({
      ok: false as const,
      diagnostics: Object.freeze([diag(FUNGI_SEC_SRN_005, "Example has no baseline catalog entry.", "purpose")]),
    });
  }
  return Object.freeze({ ok: true as const, value: found });
}

// Rate-limit and workload control policy (TODO pass, Grok 2026-10-05; zero-trust defaults, owner may revisit).
//
// Closed-shape RateLimitWorkloadPolicy / RateLimitRule / WorkloadControl for the
// app-kernel "Define rate-limit and workload control policy" TODO. Captures the
// rate-limit rule table and workload ceilings a kernel may consult without
// wiring createAppKernel enforcement, running a live limiter, or talking to a
// queue / Structured Await / IdempotencyStore.
//
// Zero-trust rules:
//  - Closed shapes via property descriptors (no getters run; symbols / accessors /
//    custom prototypes refuse). Unknown keys refuse without echoing the key.
//  - defaultDecision admits only "deny" (allow / bypass reserved and refused).
//  - keyKind is a closed vocabulary; wildcards ("*", "any", "all") refused.
//  - Numeric ceilings are finite, positive, safe integers within bounds (no
//    NaN / Infinity / 0 / negative / "unlimited").
//  - Diagnostic messages never echo tokens, labels, keys, paths, secrets or
//    unknown values.
//
// Not covered: live rate-limit enforcement, token-bucket/leaky-bucket state,
// IdempotencyStore, Structured Await, queue/job contracts, runtime audit report,
// or handoff contracts to core-runtime / api-server.

/** Record / input is not a closed data object. */
export const FUNGI_APPK_RLW_001 = "FUNGI-APPK-RLW-001";
/** A field value is outside its closed domain. */
export const FUNGI_APPK_RLW_002 = "FUNGI-APPK-RLW-002";
/** Policy set consistency refuse (empty rules / duplicate ids / keyKind subset). */
export const FUNGI_APPK_RLW_003 = "FUNGI-APPK-RLW-003";
/** Nested rule / workload / list refuse. */
export const FUNGI_APPK_RLW_004 = "FUNGI-APPK-RLW-004";
/** Result consistency refuse. */
export const FUNGI_APPK_RLW_005 = "FUNGI-APPK-RLW-005";

export const RATE_LIMIT_WORKLOAD_POLICY_SCHEMA =
  "galerina.app-kernel.rate-limit-workload-policy/v1";

/** Zero-trust default: only deny is admitted. "allow" / "bypass" are reserved and refused. */
export const RATE_LIMIT_DEFAULT_DECISIONS = Object.freeze(["deny"] as const);
export type RateLimitDefaultDecision = (typeof RATE_LIMIT_DEFAULT_DECISIONS)[number];

export const RATE_LIMIT_KEY_KINDS = Object.freeze([
  "principal",
  "route",
  "principal_route",
] as const);
export type RateLimitKeyKind = (typeof RATE_LIMIT_KEY_KINDS)[number];

export const RATE_LIMIT_WORKLOAD_POLICY_FIELDS = Object.freeze([
  "schema",
  "name",
  "defaultDecision",
  "admittedKeyKinds",
  "rules",
  "workload",
  "diagnostics",
] as const);

export const RATE_LIMIT_RULE_FIELDS = Object.freeze([
  "id",
  "keyKind",
  "windowMs",
  "maxRequests",
] as const);

export const WORKLOAD_CONTROL_FIELDS = Object.freeze([
  "maxConcurrent",
  "maxQueueDepth",
  "maxRequestDurationMs",
] as const);

export type RateLimitDiagnosticField =
  | "record"
  | "schema"
  | "name"
  | "defaultDecision"
  | "admittedKeyKinds"
  | "rules"
  | "workload"
  | "diagnostics"
  | "id"
  | "keyKind"
  | "windowMs"
  | "maxRequests"
  | "maxConcurrent"
  | "maxQueueDepth"
  | "maxRequestDurationMs";

export interface RateLimitDiagnostic {
  readonly code: string;
  readonly severity: "error";
  readonly message: string;
  readonly field: RateLimitDiagnosticField;
}

export interface RateLimitRule {
  readonly id: string;
  readonly keyKind: RateLimitKeyKind;
  readonly windowMs: number;
  readonly maxRequests: number;
}

export interface WorkloadControl {
  readonly maxConcurrent: number;
  readonly maxQueueDepth: number;
  readonly maxRequestDurationMs: number;
}

export interface RateLimitWorkloadPolicy {
  readonly schema: typeof RATE_LIMIT_WORKLOAD_POLICY_SCHEMA;
  readonly name: string;
  readonly defaultDecision: RateLimitDefaultDecision;
  readonly admittedKeyKinds: readonly RateLimitKeyKind[];
  readonly rules: readonly RateLimitRule[];
  readonly workload: WorkloadControl;
  readonly diagnostics: readonly RateLimitDiagnostic[];
}

export type ReadRateLimitWorkloadPolicyResult =
  | { readonly ok: true; readonly value: RateLimitWorkloadPolicy }
  | { readonly ok: false; readonly diagnostics: readonly RateLimitDiagnostic[] };

const TYPE_NAME = /^[A-Z][A-Za-z0-9_]{0,63}$/;
const RULE_ID = /^[a-z][a-z0-9_]{0,63}$/;
const MAX_RULES = 64;
const MAX_KEY_KINDS = RATE_LIMIT_KEY_KINDS.length;
const MAX_LIST = 4096;
const MAX_TOKEN = 128;
const MIN_WINDOW_MS = 1;
const MAX_WINDOW_MS = 86_400_000; // 24h
const MIN_MAX_REQUESTS = 1;
const MAX_MAX_REQUESTS = 1_000_000;
const MIN_CONCURRENT = 1;
const MAX_CONCURRENT = 100_000;
const MIN_QUEUE_DEPTH = 1;
const MAX_QUEUE_DEPTH = 1_000_000;
const MIN_DURATION_MS = 1;
const MAX_DURATION_MS = 3_600_000; // 1h
const DEFAULT_SET = new Set<string>(RATE_LIMIT_DEFAULT_DECISIONS);
const KEY_KIND_SET = new Set<string>(RATE_LIMIT_KEY_KINDS);

const diag = (
  code: string,
  message: string,
  field: RateLimitDiagnosticField,
): RateLimitDiagnostic => Object.freeze({ code, severity: "error" as const, message, field });

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

function requireKeysSubset(
  snap: Extract<Snapshot, { ok: true }>,
  allowed: readonly string[],
  required: readonly string[],
  field: RateLimitDiagnosticField,
  out: RateLimitDiagnostic[],
): boolean {
  const allowedSet = new Set(allowed);
  for (const key of snap.values.keys()) {
    if (!allowedSet.has(key)) {
      out.push(diag(FUNGI_APPK_RLW_001, "Record has a key outside the closed shape.", field));
      return false;
    }
  }
  for (const key of required) {
    if (!snap.values.has(key)) {
      out.push(diag(FUNGI_APPK_RLW_001, "Record is missing a required field.", field));
      return false;
    }
  }
  return true;
}

function readPositiveSafeInt(
  value: unknown,
  field: RateLimitDiagnosticField,
  min: number,
  max: number,
  out: RateLimitDiagnostic[],
): number | undefined {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    !Number.isSafeInteger(value) ||
    value < min ||
    value > max
  ) {
    out.push(diag(FUNGI_APPK_RLW_002, "Numeric ceiling is outside the closed domain.", field));
    return undefined;
  }
  return value;
}

function readKeyKindList(
  value: unknown,
  field: RateLimitDiagnosticField,
  out: RateLimitDiagnostic[],
): readonly RateLimitKeyKind[] | undefined {
  const items = snapshotArray(value, MAX_KEY_KINDS);
  if (items === undefined) {
    out.push(diag(FUNGI_APPK_RLW_004, "Key-kind list must be a dense array within bounds.", field));
    return undefined;
  }
  if (items.length === 0) {
    out.push(diag(FUNGI_APPK_RLW_003, "Key-kind list must be non-empty.", field));
    return undefined;
  }
  const kinds: RateLimitKeyKind[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    if (typeof item !== "string" || !KEY_KIND_SET.has(item)) {
      out.push(diag(FUNGI_APPK_RLW_002, "Key kind is outside the closed vocabulary.", field));
      return undefined;
    }
    if (seen.has(item)) {
      out.push(diag(FUNGI_APPK_RLW_003, "Key kinds must be unique.", field));
      return undefined;
    }
    seen.add(item);
    kinds.push(item as RateLimitKeyKind);
  }
  if (!strictlyAscending(kinds)) {
    out.push(diag(FUNGI_APPK_RLW_002, "Key-kind list must be strictly ascending.", field));
    return undefined;
  }
  return Object.freeze(kinds);
}

function snapshotDiagnostics(
  value: unknown,
  field: RateLimitDiagnosticField,
  out: RateLimitDiagnostic[],
): readonly RateLimitDiagnostic[] | undefined {
  const items = snapshotArray(value, MAX_LIST);
  if (items === undefined) {
    out.push(diag(FUNGI_APPK_RLW_001, "Diagnostics must be a dense array within bounds.", field));
    return undefined;
  }
  const result: RateLimitDiagnostic[] = [];
  for (const item of items) {
    const snap = snapshotRecord(item, 8);
    if (!snap.ok) {
      out.push(diag(FUNGI_APPK_RLW_001, "Diagnostic entry must be a plain data object.", field));
      return undefined;
    }
    const known = new Set(["code", "severity", "message", "field"]);
    if ([...snap.values.keys()].some((k) => !known.has(k))) {
      out.push(diag(FUNGI_APPK_RLW_001, "Diagnostic entry has a key outside the closed shape.", field));
      return undefined;
    }
    for (const req of known) {
      if (!snap.values.has(req)) {
        out.push(diag(FUNGI_APPK_RLW_001, "Diagnostic entry is missing a required field.", field));
        return undefined;
      }
    }
    const code = snap.values.get("code");
    const severity = snap.values.get("severity");
    const message = snap.values.get("message");
    const f = snap.values.get("field");
    if (typeof code !== "string" || code.length === 0 || code.length > MAX_TOKEN) {
      out.push(diag(FUNGI_APPK_RLW_002, "Diagnostic code is outside the closed domain.", field));
      return undefined;
    }
    if (severity !== "error") {
      out.push(diag(FUNGI_APPK_RLW_002, "Diagnostic severity is outside the closed domain.", field));
      return undefined;
    }
    if (typeof message !== "string" || message.length === 0 || message.length > 512) {
      out.push(diag(FUNGI_APPK_RLW_002, "Diagnostic message is outside the closed domain.", field));
      return undefined;
    }
    if (typeof f !== "string" || f.length === 0 || f.length > MAX_TOKEN) {
      out.push(diag(FUNGI_APPK_RLW_002, "Diagnostic field is outside the closed domain.", field));
      return undefined;
    }
    result.push(
      Object.freeze({ code, severity: "error" as const, message, field: f as RateLimitDiagnosticField }),
    );
  }
  return Object.freeze(result);
}

function readRule(
  value: unknown,
  admitted: ReadonlySet<string>,
  out: RateLimitDiagnostic[],
): RateLimitRule | undefined {
  const snap = snapshotRecord(value, RATE_LIMIT_RULE_FIELDS.length);
  if (!snap.ok) {
    out.push(diag(FUNGI_APPK_RLW_004, "Rate-limit rule must be a plain data object.", "rules"));
    return undefined;
  }
  if (!requireKeysSubset(snap, RATE_LIMIT_RULE_FIELDS, ["id", "keyKind", "windowMs", "maxRequests"], "rules", out)) {
    return undefined;
  }

  const id = snap.values.get("id");
  if (typeof id !== "string" || !RULE_ID.test(id)) {
    out.push(diag(FUNGI_APPK_RLW_002, "Rule id is outside the closed domain.", "id"));
    return undefined;
  }

  const keyKind = snap.values.get("keyKind");
  if (typeof keyKind !== "string" || !KEY_KIND_SET.has(keyKind)) {
    out.push(diag(FUNGI_APPK_RLW_002, "Key kind is outside the closed vocabulary.", "keyKind"));
    return undefined;
  }
  if (!admitted.has(keyKind)) {
    out.push(diag(FUNGI_APPK_RLW_003, "Rule keyKind must be a member of admittedKeyKinds.", "keyKind"));
    return undefined;
  }

  const windowMs = readPositiveSafeInt(snap.values.get("windowMs"), "windowMs", MIN_WINDOW_MS, MAX_WINDOW_MS, out);
  if (windowMs === undefined) return undefined;

  const maxRequests = readPositiveSafeInt(
    snap.values.get("maxRequests"),
    "maxRequests",
    MIN_MAX_REQUESTS,
    MAX_MAX_REQUESTS,
    out,
  );
  if (maxRequests === undefined) return undefined;

  return Object.freeze({
    id,
    keyKind: keyKind as RateLimitKeyKind,
    windowMs,
    maxRequests,
  });
}

function readWorkload(value: unknown, out: RateLimitDiagnostic[]): WorkloadControl | undefined {
  const snap = snapshotRecord(value, WORKLOAD_CONTROL_FIELDS.length);
  if (!snap.ok) {
    out.push(diag(FUNGI_APPK_RLW_004, "Workload control must be a plain data object.", "workload"));
    return undefined;
  }
  if (
    !requireKeysSubset(
      snap,
      WORKLOAD_CONTROL_FIELDS,
      ["maxConcurrent", "maxQueueDepth", "maxRequestDurationMs"],
      "workload",
      out,
    )
  ) {
    return undefined;
  }

  const maxConcurrent = readPositiveSafeInt(
    snap.values.get("maxConcurrent"),
    "maxConcurrent",
    MIN_CONCURRENT,
    MAX_CONCURRENT,
    out,
  );
  if (maxConcurrent === undefined) return undefined;

  const maxQueueDepth = readPositiveSafeInt(
    snap.values.get("maxQueueDepth"),
    "maxQueueDepth",
    MIN_QUEUE_DEPTH,
    MAX_QUEUE_DEPTH,
    out,
  );
  if (maxQueueDepth === undefined) return undefined;

  const maxRequestDurationMs = readPositiveSafeInt(
    snap.values.get("maxRequestDurationMs"),
    "maxRequestDurationMs",
    MIN_DURATION_MS,
    MAX_DURATION_MS,
    out,
  );
  if (maxRequestDurationMs === undefined) return undefined;

  return Object.freeze({ maxConcurrent, maxQueueDepth, maxRequestDurationMs });
}

function refusedPolicy(diagnostics: readonly RateLimitDiagnostic[]): RateLimitWorkloadPolicy {
  return Object.freeze({
    schema: RATE_LIMIT_WORKLOAD_POLICY_SCHEMA,
    name: "Refused",
    defaultDecision: "deny" as const,
    admittedKeyKinds: Object.freeze([] as RateLimitKeyKind[]),
    rules: Object.freeze([] as RateLimitRule[]),
    workload: Object.freeze({ maxConcurrent: 1, maxQueueDepth: 1, maxRequestDurationMs: 1 }),
    diagnostics: Object.freeze([...diagnostics]),
  });
}

/** Build a closed RateLimitWorkloadPolicy; never throws; success recomputed from diagnostics. */
export function createRateLimitWorkloadPolicy(input: unknown): RateLimitWorkloadPolicy {
  const out: RateLimitDiagnostic[] = [];
  try {
    const snap = snapshotRecord(input, RATE_LIMIT_WORKLOAD_POLICY_FIELDS.length);
    if (!snap.ok) {
      out.push(diag(FUNGI_APPK_RLW_001, "Rate-limit workload policy must be a plain data object.", "record"));
      return refusedPolicy(out);
    }
    if (
      !requireKeysSubset(
        snap,
        RATE_LIMIT_WORKLOAD_POLICY_FIELDS,
        ["schema", "name", "defaultDecision", "admittedKeyKinds", "rules", "workload"],
        "record",
        out,
      )
    ) {
      return refusedPolicy(out);
    }

    const schema = snap.values.get("schema");
    if (schema !== RATE_LIMIT_WORKLOAD_POLICY_SCHEMA) {
      out.push(diag(FUNGI_APPK_RLW_002, "Schema token is outside the closed vocabulary.", "schema"));
      return refusedPolicy(out);
    }

    const name = snap.values.get("name");
    if (typeof name !== "string" || !TYPE_NAME.test(name)) {
      out.push(diag(FUNGI_APPK_RLW_002, "Policy name is outside the closed domain.", "name"));
      return refusedPolicy(out);
    }

    const defaultDecision = snap.values.get("defaultDecision");
    if (typeof defaultDecision !== "string" || !DEFAULT_SET.has(defaultDecision)) {
      out.push(diag(FUNGI_APPK_RLW_002, "Default decision is outside the closed vocabulary.", "defaultDecision"));
      return refusedPolicy(out);
    }

    const admittedKeyKinds = readKeyKindList(snap.values.get("admittedKeyKinds"), "admittedKeyKinds", out);
    if (admittedKeyKinds === undefined) return refusedPolicy(out);
    const admittedSet = new Set<string>(admittedKeyKinds);

    const ruleItems = snapshotArray(snap.values.get("rules"), MAX_RULES);
    if (ruleItems === undefined) {
      out.push(diag(FUNGI_APPK_RLW_004, "Rules must be a dense array within bounds.", "rules"));
      return refusedPolicy(out);
    }
    if (ruleItems.length === 0) {
      out.push(diag(FUNGI_APPK_RLW_003, "Rate-limit workload policy requires at least one rule.", "rules"));
      return refusedPolicy(out);
    }

    const rules: RateLimitRule[] = [];
    const seenIds = new Set<string>();
    for (const item of ruleItems) {
      const rule = readRule(item, admittedSet, out);
      if (rule === undefined) return refusedPolicy(out);
      if (seenIds.has(rule.id)) {
        out.push(diag(FUNGI_APPK_RLW_003, "Rule ids must be unique.", "id"));
        return refusedPolicy(out);
      }
      seenIds.add(rule.id);
      rules.push(rule);
    }

    const ids = rules.map((r) => r.id);
    if (!strictlyAscending(ids)) {
      out.push(diag(FUNGI_APPK_RLW_003, "Rules must be ordered by strictly ascending id.", "rules"));
      return refusedPolicy(out);
    }

    const workload = readWorkload(snap.values.get("workload"), out);
    if (workload === undefined) return refusedPolicy(out);

    let diagnostics: readonly RateLimitDiagnostic[] = Object.freeze([]);
    if (snap.values.has("diagnostics")) {
      const nested = snapshotDiagnostics(snap.values.get("diagnostics"), "diagnostics", out);
      if (nested === undefined) return refusedPolicy(out);
      if (nested.length > 0) {
        out.push(diag(FUNGI_APPK_RLW_005, "Input diagnostics must be empty on create.", "diagnostics"));
        return refusedPolicy(out);
      }
      diagnostics = nested;
    }

    return Object.freeze({
      schema: RATE_LIMIT_WORKLOAD_POLICY_SCHEMA,
      name,
      defaultDecision: defaultDecision as RateLimitDefaultDecision,
      admittedKeyKinds,
      rules: Object.freeze(rules),
      workload,
      diagnostics,
    });
  } catch {
    return refusedPolicy([diag(FUNGI_APPK_RLW_001, "Rate-limit workload policy read failed closed.", "record")]);
  }
}

/** Read a closed RateLimitWorkloadPolicy; never throws; never echoes refused tokens. */
export function readRateLimitWorkloadPolicy(value: unknown): ReadRateLimitWorkloadPolicyResult {
  const created = createRateLimitWorkloadPolicy(value);
  if (created.diagnostics.length > 0) {
    return { ok: false, diagnostics: created.diagnostics };
  }
  return { ok: true, value: created };
}

export function isRateLimitDefaultDecision(value: unknown): value is RateLimitDefaultDecision {
  return typeof value === "string" && DEFAULT_SET.has(value);
}

export function isRateLimitKeyKind(value: unknown): value is RateLimitKeyKind {
  return typeof value === "string" && KEY_KIND_SET.has(value);
}

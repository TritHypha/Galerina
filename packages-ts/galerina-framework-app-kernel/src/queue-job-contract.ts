// Queue/job contract (TODO pass, Grok 2026-10-05; zero-trust defaults, owner may
// revisit).
//
// Closed-shape QueueJobContract / QueueJobDescriptor / QueueJobRetryPolicy for
// the app-kernel "Define queue/job contract" TODO. Captures the ARCHITECTURE.md
// "Structured Await Policy" rule "queue jobs declare payload, retry, timeout,
// idempotency/audit policy where relevant" as data a kernel or queue adapter
// may consult, without wiring createAppKernel, enqueuing or executing work,
// choosing a queue adapter (Redis / SQS / Pub/Sub / RabbitMQ / Kafka), or
// defining the runtime audit report format.
//
// Zero-trust rules:
//  - Closed shapes via property descriptors (no getters run; symbols / accessors /
//    custom prototypes refuse). Unknown keys refuse without echoing the key.
//  - defaultDecision admits only "deny": a job that is not declared here is not
//    admitted (allow / bypass refused).
//  - admittedQueues is a non-empty, strictly ascending list of lower-case queue
//    names; wildcards refused. Every job's queue must be admitted.
//  - jobs is a non-empty, strictly ascending (by id) list of unique descriptors.
//  - payloadType must be a named type; untyped payload names (Any / Unknown /
//    Json / Object / Dynamic / Raw ...) are refused.
//  - maxPayloadBytes / timeoutMs / retry ceilings are finite, positive, safe
//    integers within bounds (no NaN / Infinity / 0 / negative / "unlimited").
//  - retry.backoff admits only "exponential" / "fixed"; initialDelayMs must not
//    exceed maxDelayMs, and "fixed" requires initialDelayMs === maxDelayMs.
//  - audit admits only "required" (optional / none refused).
//  - idempotency is reserved while the app-kernel idempotency / IdempotencyStore
//    contract is on HOLD: a job carrying an `idempotency` key is refused.
//  - Diagnostic messages never echo tokens, names, keys, paths, secrets or
//    unknown values.
//
// Not covered: live enqueue / dequeue / execution, delivery guarantees, dead-letter
// routing, queue adapters, IdempotencyStore (HOLD), the runtime audit report
// format, lifting the Structured Await `queue_handoff` reservation, or handoff
// contracts to core-runtime / api-server.

/** Record / input is not a closed data object. */
export const FUNGI_APPK_QJC_001 = "FUNGI-APPK-QJC-001";
/** A field value is outside its closed domain (incl. reserved idempotency). */
export const FUNGI_APPK_QJC_002 = "FUNGI-APPK-QJC-002";
/** Contract consistency refuse (empty / duplicate lists, unadmitted queue, delay ordering). */
export const FUNGI_APPK_QJC_003 = "FUNGI-APPK-QJC-003";
/** Nested record / list refuse. */
export const FUNGI_APPK_QJC_004 = "FUNGI-APPK-QJC-004";
/** Result consistency refuse. */
export const FUNGI_APPK_QJC_005 = "FUNGI-APPK-QJC-005";

export const QUEUE_JOB_CONTRACT_SCHEMA = "galerina.app-kernel.queue-job-contract/v1";

/** Undeclared jobs are not admitted. */
export const QUEUE_JOB_DEFAULT_DECISIONS = Object.freeze(["deny"] as const);
export type QueueJobDefaultDecision = (typeof QUEUE_JOB_DEFAULT_DECISIONS)[number];

export const QUEUE_JOB_BACKOFF_KINDS = Object.freeze(["exponential", "fixed"] as const);
export type QueueJobBackoffKind = (typeof QUEUE_JOB_BACKOFF_KINDS)[number];

/** Every job emits runtime audit facts. */
export const QUEUE_JOB_AUDIT_POLICIES = Object.freeze(["required"] as const);
export type QueueJobAuditPolicy = (typeof QUEUE_JOB_AUDIT_POLICIES)[number];

/** Payload type names that would admit untyped / raw payloads; refused. */
export const QUEUE_JOB_UNTYPED_PAYLOAD_NAMES = Object.freeze([
  "Any",
  "Dynamic",
  "JSON",
  "Json",
  "JsonValue",
  "Object",
  "Raw",
  "RawJson",
  "Unknown",
] as const);

export const QUEUE_JOB_CONTRACT_FIELDS = Object.freeze([
  "schema",
  "name",
  "defaultDecision",
  "admittedQueues",
  "jobs",
  "diagnostics",
] as const);

export const QUEUE_JOB_DESCRIPTOR_FIELDS = Object.freeze([
  "id",
  "queue",
  "payloadType",
  "maxPayloadBytes",
  "timeoutMs",
  "retry",
  "audit",
] as const);

export const QUEUE_JOB_RETRY_FIELDS = Object.freeze([
  "maxAttempts",
  "backoff",
  "initialDelayMs",
  "maxDelayMs",
] as const);

/** Job-descriptor key reserved while the idempotency contract is on HOLD. */
export const QUEUE_JOB_RESERVED_FIELDS = Object.freeze(["idempotency"] as const);

export type QueueJobDiagnosticField =
  | "record"
  | "schema"
  | "name"
  | "defaultDecision"
  | "admittedQueues"
  | "jobs"
  | "diagnostics"
  | "id"
  | "queue"
  | "payloadType"
  | "maxPayloadBytes"
  | "timeoutMs"
  | "retry"
  | "audit"
  | "idempotency"
  | "maxAttempts"
  | "backoff"
  | "initialDelayMs"
  | "maxDelayMs";

export interface QueueJobDiagnostic {
  readonly code: string;
  readonly severity: "error";
  readonly message: string;
  readonly field: QueueJobDiagnosticField;
}

export interface QueueJobRetryPolicy {
  readonly maxAttempts: number;
  readonly backoff: QueueJobBackoffKind;
  readonly initialDelayMs: number;
  readonly maxDelayMs: number;
}

export interface QueueJobDescriptor {
  readonly id: string;
  readonly queue: string;
  readonly payloadType: string;
  readonly maxPayloadBytes: number;
  readonly timeoutMs: number;
  readonly retry: QueueJobRetryPolicy;
  readonly audit: QueueJobAuditPolicy;
}

export interface QueueJobContract {
  readonly schema: typeof QUEUE_JOB_CONTRACT_SCHEMA;
  readonly name: string;
  readonly defaultDecision: QueueJobDefaultDecision;
  readonly admittedQueues: readonly string[];
  readonly jobs: readonly QueueJobDescriptor[];
  readonly diagnostics: readonly QueueJobDiagnostic[];
}

export type ReadQueueJobContractResult =
  | { readonly ok: true; readonly value: QueueJobContract }
  | { readonly ok: false; readonly diagnostics: readonly QueueJobDiagnostic[] };

const TYPE_NAME = /^[A-Z][A-Za-z0-9_]{0,63}$/;
const LOWER_TOKEN = /^[a-z][a-z0-9_-]{0,63}$/;
const MAX_QUEUES = 64;
const MAX_JOBS = 256;
const MAX_LIST = 4096;
const MAX_TOKEN = 128;
const MIN_PAYLOAD_BYTES = 1;
const MAX_PAYLOAD_BYTES = 16 * 1024 * 1024; // 16 MiB
const MIN_TIMEOUT_MS = 1;
const MAX_TIMEOUT_MS = 3_600_000; // 1h
const MIN_ATTEMPTS = 1;
const MAX_ATTEMPTS = 100;
const MIN_DELAY_MS = 1;
const MAX_DELAY_MS = 86_400_000; // 24h
const DEFAULT_DECISION_SET = new Set<string>(QUEUE_JOB_DEFAULT_DECISIONS);
const BACKOFF_SET = new Set<string>(QUEUE_JOB_BACKOFF_KINDS);
const AUDIT_SET = new Set<string>(QUEUE_JOB_AUDIT_POLICIES);
const UNTYPED_SET = new Set<string>(QUEUE_JOB_UNTYPED_PAYLOAD_NAMES);
const RESERVED_SET = new Set<string>(QUEUE_JOB_RESERVED_FIELDS);

const diag = (code: string, message: string, field: QueueJobDiagnosticField): QueueJobDiagnostic =>
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

function requireKeysSubset(
  snap: Extract<Snapshot, { ok: true }>,
  allowed: readonly string[],
  required: readonly string[],
  field: QueueJobDiagnosticField,
  out: QueueJobDiagnostic[],
): boolean {
  const allowedSet = new Set(allowed);
  for (const key of snap.values.keys()) {
    if (!allowedSet.has(key)) {
      out.push(diag(FUNGI_APPK_QJC_001, "Record has a key outside the closed shape.", field));
      return false;
    }
  }
  for (const key of required) {
    if (!snap.values.has(key)) {
      out.push(diag(FUNGI_APPK_QJC_001, "Record is missing a required field.", field));
      return false;
    }
  }
  return true;
}

function readPositiveSafeInt(
  value: unknown,
  field: QueueJobDiagnosticField,
  min: number,
  max: number,
  out: QueueJobDiagnostic[],
): number | undefined {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    !Number.isSafeInteger(value) ||
    value < min ||
    value > max
  ) {
    out.push(diag(FUNGI_APPK_QJC_002, "Numeric limit is outside the closed domain.", field));
    return undefined;
  }
  return value;
}

function readClosedToken(
  value: unknown,
  allowed: ReadonlySet<string>,
  field: QueueJobDiagnosticField,
  message: string,
  out: QueueJobDiagnostic[],
): string | undefined {
  if (typeof value !== "string" || !allowed.has(value)) {
    out.push(diag(FUNGI_APPK_QJC_002, message, field));
    return undefined;
  }
  return value;
}

function readQueueList(value: unknown, out: QueueJobDiagnostic[]): readonly string[] | undefined {
  const items = snapshotArray(value, MAX_QUEUES);
  if (items === undefined) {
    out.push(diag(FUNGI_APPK_QJC_004, "Queue list must be a dense array within bounds.", "admittedQueues"));
    return undefined;
  }
  if (items.length === 0) {
    out.push(diag(FUNGI_APPK_QJC_003, "Queue list must be non-empty.", "admittedQueues"));
    return undefined;
  }
  const queues: string[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    if (typeof item !== "string" || !LOWER_TOKEN.test(item)) {
      out.push(diag(FUNGI_APPK_QJC_002, "Queue name is outside the closed domain.", "admittedQueues"));
      return undefined;
    }
    if (seen.has(item)) {
      out.push(diag(FUNGI_APPK_QJC_003, "Queue names must be unique.", "admittedQueues"));
      return undefined;
    }
    seen.add(item);
    queues.push(item);
  }
  if (!strictlyAscending(queues)) {
    out.push(diag(FUNGI_APPK_QJC_002, "Queue list must be strictly ascending.", "admittedQueues"));
    return undefined;
  }
  return Object.freeze(queues);
}

function readRetry(value: unknown, out: QueueJobDiagnostic[]): QueueJobRetryPolicy | undefined {
  const snap = snapshotRecord(value, QUEUE_JOB_RETRY_FIELDS.length);
  if (!snap.ok) {
    out.push(diag(FUNGI_APPK_QJC_004, "Retry policy must be a plain data object.", "retry"));
    return undefined;
  }
  if (!requireKeysSubset(snap, QUEUE_JOB_RETRY_FIELDS, QUEUE_JOB_RETRY_FIELDS, "retry", out)) return undefined;

  const maxAttempts = readPositiveSafeInt(snap.values.get("maxAttempts"), "maxAttempts", MIN_ATTEMPTS, MAX_ATTEMPTS, out);
  if (maxAttempts === undefined) return undefined;

  const backoff = readClosedToken(
    snap.values.get("backoff"),
    BACKOFF_SET,
    "backoff",
    "Retry backoff is outside the closed vocabulary.",
    out,
  );
  if (backoff === undefined) return undefined;

  const initialDelayMs = readPositiveSafeInt(
    snap.values.get("initialDelayMs"),
    "initialDelayMs",
    MIN_DELAY_MS,
    MAX_DELAY_MS,
    out,
  );
  if (initialDelayMs === undefined) return undefined;

  const maxDelayMs = readPositiveSafeInt(snap.values.get("maxDelayMs"), "maxDelayMs", MIN_DELAY_MS, MAX_DELAY_MS, out);
  if (maxDelayMs === undefined) return undefined;

  if (initialDelayMs > maxDelayMs) {
    out.push(diag(FUNGI_APPK_QJC_003, "Initial retry delay must not exceed the maximum retry delay.", "initialDelayMs"));
    return undefined;
  }
  if (backoff === "fixed" && initialDelayMs !== maxDelayMs) {
    out.push(diag(FUNGI_APPK_QJC_003, "Fixed backoff requires equal initial and maximum delays.", "maxDelayMs"));
    return undefined;
  }

  return Object.freeze({ maxAttempts, backoff: backoff as QueueJobBackoffKind, initialDelayMs, maxDelayMs });
}

function readJob(
  value: unknown,
  admittedQueues: ReadonlySet<string>,
  out: QueueJobDiagnostic[],
): QueueJobDescriptor | undefined {
  const snap = snapshotRecord(value, QUEUE_JOB_DESCRIPTOR_FIELDS.length + QUEUE_JOB_RESERVED_FIELDS.length);
  if (!snap.ok) {
    out.push(diag(FUNGI_APPK_QJC_004, "Job descriptor must be a plain data object.", "jobs"));
    return undefined;
  }
  for (const key of snap.values.keys()) {
    if (RESERVED_SET.has(key)) {
      out.push(
        diag(
          FUNGI_APPK_QJC_002,
          "Idempotency policy is reserved until the app-kernel idempotency contract lands.",
          "idempotency",
        ),
      );
      return undefined;
    }
  }
  if (!requireKeysSubset(snap, QUEUE_JOB_DESCRIPTOR_FIELDS, QUEUE_JOB_DESCRIPTOR_FIELDS, "jobs", out)) return undefined;

  const id = snap.values.get("id");
  if (typeof id !== "string" || !LOWER_TOKEN.test(id)) {
    out.push(diag(FUNGI_APPK_QJC_002, "Job id is outside the closed domain.", "id"));
    return undefined;
  }

  const queue = snap.values.get("queue");
  if (typeof queue !== "string" || !LOWER_TOKEN.test(queue)) {
    out.push(diag(FUNGI_APPK_QJC_002, "Job queue name is outside the closed domain.", "queue"));
    return undefined;
  }
  if (!admittedQueues.has(queue)) {
    out.push(diag(FUNGI_APPK_QJC_003, "Job queue is not in the admitted queue list.", "queue"));
    return undefined;
  }

  const payloadType = snap.values.get("payloadType");
  if (typeof payloadType !== "string" || !TYPE_NAME.test(payloadType) || UNTYPED_SET.has(payloadType)) {
    out.push(diag(FUNGI_APPK_QJC_002, "Job payload type must be a named, typed record.", "payloadType"));
    return undefined;
  }

  const maxPayloadBytes = readPositiveSafeInt(
    snap.values.get("maxPayloadBytes"),
    "maxPayloadBytes",
    MIN_PAYLOAD_BYTES,
    MAX_PAYLOAD_BYTES,
    out,
  );
  if (maxPayloadBytes === undefined) return undefined;

  const timeoutMs = readPositiveSafeInt(snap.values.get("timeoutMs"), "timeoutMs", MIN_TIMEOUT_MS, MAX_TIMEOUT_MS, out);
  if (timeoutMs === undefined) return undefined;

  const retry = readRetry(snap.values.get("retry"), out);
  if (retry === undefined) return undefined;

  const audit = readClosedToken(
    snap.values.get("audit"),
    AUDIT_SET,
    "audit",
    "Job audit policy is outside the closed vocabulary.",
    out,
  );
  if (audit === undefined) return undefined;

  return Object.freeze({
    id,
    queue,
    payloadType,
    maxPayloadBytes,
    timeoutMs,
    retry,
    audit: audit as QueueJobAuditPolicy,
  });
}

function readJobList(
  value: unknown,
  admittedQueues: readonly string[],
  out: QueueJobDiagnostic[],
): readonly QueueJobDescriptor[] | undefined {
  const items = snapshotArray(value, MAX_JOBS);
  if (items === undefined) {
    out.push(diag(FUNGI_APPK_QJC_004, "Job list must be a dense array within bounds.", "jobs"));
    return undefined;
  }
  if (items.length === 0) {
    out.push(diag(FUNGI_APPK_QJC_003, "Job list must be non-empty.", "jobs"));
    return undefined;
  }
  const queueSet = new Set<string>(admittedQueues);
  const jobs: QueueJobDescriptor[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    const job = readJob(item, queueSet, out);
    if (job === undefined) return undefined;
    if (seen.has(job.id)) {
      out.push(diag(FUNGI_APPK_QJC_003, "Job ids must be unique.", "jobs"));
      return undefined;
    }
    seen.add(job.id);
    jobs.push(job);
  }
  if (!strictlyAscending(jobs.map((j) => j.id))) {
    out.push(diag(FUNGI_APPK_QJC_002, "Job list must be strictly ascending by id.", "jobs"));
    return undefined;
  }
  return Object.freeze(jobs);
}

function snapshotDiagnostics(value: unknown, out: QueueJobDiagnostic[]): readonly QueueJobDiagnostic[] | undefined {
  const items = snapshotArray(value, MAX_LIST);
  if (items === undefined) {
    out.push(diag(FUNGI_APPK_QJC_001, "Diagnostics must be a dense array within bounds.", "diagnostics"));
    return undefined;
  }
  const result: QueueJobDiagnostic[] = [];
  const known = ["code", "severity", "message", "field"];
  for (const item of items) {
    const snap = snapshotRecord(item, 8);
    if (!snap.ok) {
      out.push(diag(FUNGI_APPK_QJC_001, "Diagnostic entry must be a plain data object.", "diagnostics"));
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
      out.push(diag(FUNGI_APPK_QJC_002, "Diagnostic entry is outside the closed domain.", "diagnostics"));
      return undefined;
    }
    result.push(Object.freeze({ code, severity: "error" as const, message, field: f as QueueJobDiagnosticField }));
  }
  return Object.freeze(result);
}

function refusedContract(diagnostics: readonly QueueJobDiagnostic[]): QueueJobContract {
  return Object.freeze({
    schema: QUEUE_JOB_CONTRACT_SCHEMA,
    name: "Refused",
    defaultDecision: "deny" as const,
    admittedQueues: Object.freeze([] as string[]),
    jobs: Object.freeze([] as QueueJobDescriptor[]),
    diagnostics: Object.freeze([...diagnostics]),
  });
}

/** Build a closed QueueJobContract; never throws; success recomputed from diagnostics. */
export function createQueueJobContract(input: unknown): QueueJobContract {
  const out: QueueJobDiagnostic[] = [];
  try {
    const snap = snapshotRecord(input, QUEUE_JOB_CONTRACT_FIELDS.length);
    if (!snap.ok) {
      out.push(diag(FUNGI_APPK_QJC_001, "Queue/job contract must be a plain data object.", "record"));
      return refusedContract(out);
    }
    if (
      !requireKeysSubset(
        snap,
        QUEUE_JOB_CONTRACT_FIELDS,
        QUEUE_JOB_CONTRACT_FIELDS.filter((k) => k !== "diagnostics"),
        "record",
        out,
      )
    ) {
      return refusedContract(out);
    }

    if (snap.values.get("schema") !== QUEUE_JOB_CONTRACT_SCHEMA) {
      out.push(diag(FUNGI_APPK_QJC_002, "Schema token is outside the closed vocabulary.", "schema"));
      return refusedContract(out);
    }

    const name = snap.values.get("name");
    if (typeof name !== "string" || !TYPE_NAME.test(name)) {
      out.push(diag(FUNGI_APPK_QJC_002, "Contract name is outside the closed domain.", "name"));
      return refusedContract(out);
    }

    if (
      readClosedToken(
        snap.values.get("defaultDecision"),
        DEFAULT_DECISION_SET,
        "defaultDecision",
        "Default decision is outside the closed vocabulary.",
        out,
      ) === undefined
    ) {
      return refusedContract(out);
    }

    const admittedQueues = readQueueList(snap.values.get("admittedQueues"), out);
    if (admittedQueues === undefined) return refusedContract(out);

    const jobs = readJobList(snap.values.get("jobs"), admittedQueues, out);
    if (jobs === undefined) return refusedContract(out);

    let diagnostics: readonly QueueJobDiagnostic[] = Object.freeze([]);
    if (snap.values.has("diagnostics")) {
      const nested = snapshotDiagnostics(snap.values.get("diagnostics"), out);
      if (nested === undefined) return refusedContract(out);
      if (nested.length > 0) {
        out.push(diag(FUNGI_APPK_QJC_005, "Input diagnostics must be empty on create.", "diagnostics"));
        return refusedContract(out);
      }
      diagnostics = nested;
    }

    return Object.freeze({
      schema: QUEUE_JOB_CONTRACT_SCHEMA,
      name,
      defaultDecision: "deny" as const,
      admittedQueues,
      jobs,
      diagnostics,
    });
  } catch {
    return refusedContract([diag(FUNGI_APPK_QJC_001, "Queue/job contract read failed closed.", "record")]);
  }
}

/** Read a closed QueueJobContract; never throws; never echoes refused tokens. */
export function readQueueJobContract(value: unknown): ReadQueueJobContractResult {
  const created = createQueueJobContract(value);
  if (created.diagnostics.length > 0) {
    return { ok: false, diagnostics: created.diagnostics };
  }
  return { ok: true, value: created };
}

export function isQueueJobBackoffKind(value: unknown): value is QueueJobBackoffKind {
  return typeof value === "string" && BACKOFF_SET.has(value);
}

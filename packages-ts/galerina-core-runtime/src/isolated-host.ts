// Isolated hard-termination host adapter and authenticated task-event / termination
// receipts (TODO pass, Grok 2026-10-05). Zero-trust defaults, owner may revisit.
//
// The Structured Await reducer never treats a cancellation request as termination. This
// module supplies the two host-side pieces it was waiting for:
//
//   1. createIsolatedHost runs one guest module in a separate Node process under the Node
//      permission model and hard-terminates it (SIGKILL, TerminateProcess on Windows) on its
//      deadline, on host cancel or on an output flood. There is no grace period and no
//      cooperative signal: non-cooperative guests are stopped by the OS. Termination is
//      claimed only after the child's "close" event is observed; if it never arrives the
//      result is "termination_unconfirmed" and no receipt is issued.
//   2. createReceiptSigner / createReceiptVerifier authenticate task-event and termination
//      receipts with HMAC-SHA256 under a host-held key, refuse unknown keys, tampering,
//      replays and reordering (strict per-scope sequence via an injected sequence store that the host can make durable across restarts), and turn a verified receipt into
//      the exact StructuredAwaitEvent the reducer admits.
//
// No Node builtin is imported. The host passes the process-spawn capability and the
// HMAC-SHA256 primitive in explicitly, so importing @galerina/core-runtime grants no process
// or key authority. The injected HMAC is checked against RFC 4231 test case 2 before use.
//
// Non-claims: this is not an OS sandbox. The guest gets no filesystem write, child process,
// worker or native addon access, and can read only its own entry file (Node permission
// model), but network access is not confined by this adapter and CPU use is bounded only by
// the wall-clock deadline (heap by --max-old-space-size). A receipt proves that the host
// adapter observed an outcome; it does not prove the guest's output is correct. Guest output
// is returned as untrusted text.

import type { StructuredAwaitEvent } from "./structured-await.js";

export const TASK_RECEIPT_VERSION = "galerina.runtime.receipt.v1" as const;
export const MIN_RECEIPT_KEY_BYTES = 32;
export const MAX_RECEIPT_KEYS = 16;
export const MAX_RECEIPT_SCOPES = 4_096;
export const MAX_ISOLATED_INPUT_BYTES = 65_536;
export const MAX_ISOLATED_OUTPUT_BYTES = 1_048_576;
export const MAX_ISOLATED_DEADLINE_MS = 600_000;
export const MIN_ISOLATED_HEAP_MB = 16;
export const MAX_ISOLATED_HEAP_MB = 4_096;
export const ISOLATED_KILL_CONFIRM_MS = 5_000;
export const MIN_ISOLATED_NODE_MAJOR = 22;

/** Node flags every guest runs with, before the entry path. Exported for audit. */
export const ISOLATED_GUEST_FLAGS: readonly string[] = Object.freeze([
  "--permission",
  "--disallow-code-generation-from-strings",
]);

export interface ReceiptErrorMetadata {
  readonly code: string;
  readonly safeMessage: string;
}

const err = (code: string, safeMessage: string): ReceiptErrorMetadata => Object.freeze({ code, safeMessage });
export const ERR_RUNTIME_RECEIPT_SHAPE = err("ERR_RUNTIME_RECEIPT_SHAPE", "Task receipt is not the exact closed contract.");
export const ERR_RUNTIME_RECEIPT_VERSION = err("ERR_RUNTIME_RECEIPT_VERSION", "Task receipt version is not admitted.");
export const ERR_RUNTIME_RECEIPT_KEY = err("ERR_RUNTIME_RECEIPT_KEY", "Task receipt key is not admitted by this verifier.");
export const ERR_RUNTIME_RECEIPT_CAUSE = err("ERR_RUNTIME_RECEIPT_CAUSE", "Task receipt kind and cause do not agree.");
export const ERR_RUNTIME_RECEIPT_MAC = err("ERR_RUNTIME_RECEIPT_MAC", "Task receipt authentication failed.");
export const ERR_RUNTIME_RECEIPT_REPLAY = err("ERR_RUNTIME_RECEIPT_REPLAY", "Task receipt was replayed or arrived out of order.");
export const ERR_RUNTIME_RECEIPT_CAPACITY = err("ERR_RUNTIME_RECEIPT_CAPACITY", "Task receipt scope capacity is exhausted.");
export const ERR_RUNTIME_RECEIPT_HMAC = err("ERR_RUNTIME_RECEIPT_HMAC", "Injected HMAC-SHA256 failed the RFC 4231 self-test.");
export const ERR_RUNTIME_RECEIPT_CONFIG = err("ERR_RUNTIME_RECEIPT_CONFIG", "Task receipt key configuration is invalid.");
export const ERR_RUNTIME_RECEIPT_SEQUENCE_STORE = err("ERR_RUNTIME_RECEIPT_SEQUENCE_STORE", "Task receipt sequence store failed or returned an invalid value.");
export const ERR_RUNTIME_ISOLATED_CONFIG = err("ERR_RUNTIME_ISOLATED_CONFIG", "Isolated host configuration is invalid.");
export const ERR_RUNTIME_ISOLATED_SPEC = err("ERR_RUNTIME_ISOLATED_SPEC", "Isolated task specification is not the exact closed contract.");
export const ERR_RUNTIME_ISOLATED_RECEIPT = err("ERR_RUNTIME_ISOLATED_RECEIPT", "Isolated task outcome could not be receipted.");

/** Error thrown by constructors and by the signer; carries only a fixed code and message. */
export class RuntimeReceiptError extends Error {
  readonly code: string;
  constructor(metadata: ReceiptErrorMetadata) {
    super(metadata.safeMessage);
    this.name = "RuntimeReceiptError";
    this.code = metadata.code;
  }
}

export type TaskReceiptKind = "task_succeeded" | "task_failed" | "task_cancelled";
export type TaskReceiptCause =
  | "exit_zero"
  | "exit_nonzero"
  | "output_invalid"
  | "spawn_failed"
  | "output_limit_kill"
  | "deadline_kill"
  | "cancel_kill";

/** Each cause has exactly one receipt kind; kill causes map to task_cancelled because the
 *  task was stopped by the host, which is the acknowledgement the reducer waits for. */
export const TASK_RECEIPT_CAUSE_KIND: Readonly<Record<TaskReceiptCause, TaskReceiptKind>> = Object.freeze({
  exit_zero: "task_succeeded",
  exit_nonzero: "task_failed",
  output_invalid: "task_failed",
  spawn_failed: "task_failed",
  output_limit_kill: "task_failed",
  deadline_kill: "task_cancelled",
  cancel_kill: "task_cancelled",
});

export interface TaskReceiptBody {
  readonly scopeId: string;
  readonly taskId: string;
  readonly cause: TaskReceiptCause;
  readonly elapsedMs: number;
}

export interface TaskReceipt {
  readonly version: typeof TASK_RECEIPT_VERSION;
  readonly keyId: string;
  readonly scopeId: string;
  readonly taskId: string;
  readonly kind: TaskReceiptKind;
  readonly cause: TaskReceiptCause;
  readonly elapsedMs: number;
  readonly sequence: number;
  /** Lowercase hex HMAC-SHA256 over the canonical receipt text. */
  readonly mac: string;
}

export type HmacSha256 = (key: Uint8Array, data: Uint8Array) => Uint8Array;

export interface ReceiptKey {
  readonly keyId: string;
  readonly key: Uint8Array;
}

export interface ReceiptSigner {
  readonly keyId: string;
  sign(body: TaskReceiptBody): TaskReceipt;
}

export type ReceiptVerification =
  | { readonly ok: true; readonly receipt: TaskReceipt; readonly event: StructuredAwaitEvent }
  | { readonly ok: false; readonly error: ReceiptErrorMetadata };

export interface ReceiptVerifier {
  verify(input: unknown): ReceiptVerification;
}

/** Host-injected last-seen / last-issued sequence store. The verifier persists the last
 *  accepted sequence per scope before returning ok, so a validly-signed receipt cannot be
 *  replayed after a verifier restart when the store is durable. createMemoryReceiptSequenceStore
 *  is process-local only (does not survive restart); hosts that need durability inject a store
 *  that commits before setLastSequence returns. No Node builtin is imported here. */
export interface ReceiptSequenceStore {
  /** Last sequence recorded for scope, or undefined if none. */
  getLastSequence(scopeId: string): number | undefined;
  /** Persist last sequence for scope. Must complete durably before returning; throws on failure. */
  setLastSequence(scopeId: string, sequence: number): void;
  /** Number of distinct scopes currently recorded (capacity accounting). */
  scopeCount(): number;
}

/** Process-local sequence store. Does not survive process restart — for tests and hosts that
 *  explicitly accept in-memory last-seen (zero-trust default is to inject a durable store). */
export function createMemoryReceiptSequenceStore(): ReceiptSequenceStore {
  const sequences = new Map<string, number>();
  return Object.freeze({
    getLastSequence(scopeId: string): number | undefined {
      if (!isIdentifier(scopeId)) return undefined;
      return sequences.get(scopeId);
    },
    setLastSequence(scopeId: string, sequence: number): void {
      if (!isIdentifier(scopeId) || !isPositiveInt(sequence)) throw new RuntimeReceiptError(ERR_RUNTIME_RECEIPT_SEQUENCE_STORE);
      sequences.set(scopeId, sequence);
    },
    scopeCount(): number {
      return sequences.size;
    },
  });
}

// Same identifier alphabet as the Structured Await reducer, so receipts and plans agree.
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const MAC_HEX = /^[0-9a-f]{64}$/;
const isIdentifier = (value: unknown): value is string => typeof value === "string" && IDENTIFIER.test(value);
const isNonNegativeInt = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const isPositiveInt = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value > 0;
const isCause = (value: unknown): value is TaskReceiptCause =>
  typeof value === "string" && Object.prototype.hasOwnProperty.call(TASK_RECEIPT_CAUSE_KIND, value);

const RECEIPT_FIELDS = ["version", "keyId", "scopeId", "taskId", "kind", "cause", "elapsedMs", "sequence", "mac"] as const;
const BODY_FIELDS = ["scopeId", "taskId", "cause", "elapsedMs"] as const;
const SPEC_FIELDS = ["scopeId", "taskId", "entry", "input", "deadlineMs", "maxOutputBytes", "maxHeapMb"] as const;

/** Reads exactly the named own data properties of a plain object. Accessors, symbols, extra
 *  keys, proxies that throw and non-plain prototypes all return undefined. */
function exactData(input: unknown, fields: readonly string[]): Record<string, unknown> | undefined {
  try {
    if (typeof input !== "object" || input === null || Array.isArray(input)) return undefined;
    const proto = Object.getPrototypeOf(input);
    if (proto !== Object.prototype && proto !== null) return undefined;
    const keys = Reflect.ownKeys(input);
    if (keys.length !== fields.length) return undefined;
    const out: Record<string, unknown> = Object.create(null);
    for (const field of fields) {
      const descriptor = Object.getOwnPropertyDescriptor(input, field);
      if (descriptor === undefined || !("value" in descriptor) || descriptor.enumerable !== true) return undefined;
      out[field] = descriptor.value;
    }
    return out;
  } catch {
    return undefined;
  }
}

const encoder = new TextEncoder();
const hex = (bytes: Uint8Array): string => {
  let out = "";
  for (const byte of bytes) out += byte.toString(16).padStart(2, "0");
  return out;
};

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) return false;
  let diff = 0;
  for (let i = 0; i < a.byteLength; i += 1) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}

// RFC 4231 test case 2.
const RFC4231_KEY = encoder.encode("Jefe");
const RFC4231_DATA = encoder.encode("what do ya want for nothing?");
const RFC4231_MAC = "5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843";

function checkedHmac(hmac: unknown): HmacSha256 {
  if (typeof hmac !== "function") throw new RuntimeReceiptError(ERR_RUNTIME_RECEIPT_HMAC);
  const fn = hmac as HmacSha256;
  const run = (key: Uint8Array, data: Uint8Array): Uint8Array => {
    const out: unknown = fn(key, data);
    if (!(out instanceof Uint8Array) || out.byteLength !== 32) throw new RuntimeReceiptError(ERR_RUNTIME_RECEIPT_HMAC);
    return Uint8Array.from(out);
  };
  let probe: Uint8Array;
  try {
    probe = run(RFC4231_KEY.slice(), RFC4231_DATA.slice());
  } catch {
    throw new RuntimeReceiptError(ERR_RUNTIME_RECEIPT_HMAC);
  }
  if (hex(probe) !== RFC4231_MAC) throw new RuntimeReceiptError(ERR_RUNTIME_RECEIPT_HMAC);
  return run;
}

function checkedKey(input: unknown): { keyId: string; key: Uint8Array } {
  const values = exactData(input, ["keyId", "key"]);
  if (values === undefined || !isIdentifier(values.keyId)) throw new RuntimeReceiptError(ERR_RUNTIME_RECEIPT_CONFIG);
  const key = values.key;
  if (!(key instanceof Uint8Array) || key.byteLength < MIN_RECEIPT_KEY_BYTES) throw new RuntimeReceiptError(ERR_RUNTIME_RECEIPT_CONFIG);
  // Copy, so later caller mutation of the buffer cannot change the key in use.
  return { keyId: values.keyId, key: Uint8Array.from(key) };
}


function checkedSequenceStore(input: unknown): ReceiptSequenceStore {
  if (typeof input !== "object" || input === null) throw new RuntimeReceiptError(ERR_RUNTIME_RECEIPT_CONFIG);
  const store = input as ReceiptSequenceStore;
  if (typeof store.getLastSequence !== "function" || typeof store.setLastSequence !== "function" || typeof store.scopeCount !== "function") {
    throw new RuntimeReceiptError(ERR_RUNTIME_RECEIPT_CONFIG);
  }
  return store;
}

function readLastSequence(store: ReceiptSequenceStore, scopeId: string): number | undefined {
  let previous: unknown;
  try {
    previous = store.getLastSequence(scopeId);
  } catch {
    throw new RuntimeReceiptError(ERR_RUNTIME_RECEIPT_SEQUENCE_STORE);
  }
  if (previous === undefined) return undefined;
  if (!isPositiveInt(previous)) throw new RuntimeReceiptError(ERR_RUNTIME_RECEIPT_SEQUENCE_STORE);
  return previous;
}

function writeLastSequence(store: ReceiptSequenceStore, scopeId: string, sequence: number): void {
  try {
    store.setLastSequence(scopeId, sequence);
  } catch {
    throw new RuntimeReceiptError(ERR_RUNTIME_RECEIPT_SEQUENCE_STORE);
  }
}

function readScopeCount(store: ReceiptSequenceStore): number {
  let size: unknown;
  try {
    size = store.scopeCount();
  } catch {
    throw new RuntimeReceiptError(ERR_RUNTIME_RECEIPT_SEQUENCE_STORE);
  }
  if (!isNonNegativeInt(size)) throw new RuntimeReceiptError(ERR_RUNTIME_RECEIPT_SEQUENCE_STORE);
  return size;
}

function canonicalReceiptText(r: Omit<TaskReceipt, "mac">): Uint8Array {
  // Every field is an identifier, a closed enum or a safe integer, so "\n" cannot appear
  // inside a field and the encoding is injective.
  return encoder.encode([r.version, r.keyId, r.scopeId, r.taskId, r.kind, r.cause, String(r.elapsedMs), String(r.sequence)].join("\n"));
}

/** Host-side signer. Issues a strictly increasing per-scope sequence through the injected
 *  sequence store so a durable store keeps issuance monotonic across signer restarts. Throws
 *  RuntimeReceiptError on an invalid body (a host bug, never guest data). */
export function createReceiptSigner(options: { readonly key: ReceiptKey; readonly hmacSha256: HmacSha256; readonly sequenceStore: ReceiptSequenceStore }): ReceiptSigner {
  const values = exactData(options, ["key", "hmacSha256", "sequenceStore"]);
  if (values === undefined) throw new RuntimeReceiptError(ERR_RUNTIME_RECEIPT_CONFIG);
  const { keyId, key } = checkedKey(values.key);
  const hmac = checkedHmac(values.hmacSha256);
  const sequenceStore = checkedSequenceStore(values.sequenceStore);
  return Object.freeze({
    keyId,
    sign(input: TaskReceiptBody): TaskReceipt {
      const body = exactData(input, BODY_FIELDS);
      if (body === undefined || !isIdentifier(body.scopeId) || !isIdentifier(body.taskId) || !isCause(body.cause) || !isNonNegativeInt(body.elapsedMs)) {
        throw new RuntimeReceiptError(ERR_RUNTIME_RECEIPT_SHAPE);
      }
      const previous = readLastSequence(sequenceStore, body.scopeId);
      if (previous === undefined && readScopeCount(sequenceStore) >= MAX_RECEIPT_SCOPES) throw new RuntimeReceiptError(ERR_RUNTIME_RECEIPT_CAPACITY);
      const sequence = (previous ?? 0) + 1;
      const unsigned = {
        version: TASK_RECEIPT_VERSION,
        keyId,
        scopeId: body.scopeId,
        taskId: body.taskId,
        kind: TASK_RECEIPT_CAUSE_KIND[body.cause],
        cause: body.cause,
        elapsedMs: body.elapsedMs,
        sequence,
      };
      const mac = hex(hmac(key, canonicalReceiptText(unsigned)));
      writeLastSequence(sequenceStore, body.scopeId, sequence);
      return Object.freeze({ ...unsigned, mac });
    },
  });
}

/** Verifier for the receiving side of the host boundary. A receipt is accepted at most once,
 *  only in strictly increasing per-scope sequence order, and only after its MAC verifies, so a
 *  forged receipt cannot burn a sequence number. The last accepted sequence is written to the
 *  injected sequence store before ok is returned, so a durable store refuses replay across
 *  verifier restarts. Errors carry fixed codes and never echo input. */
export function createReceiptVerifier(options: { readonly keys: readonly ReceiptKey[]; readonly hmacSha256: HmacSha256; readonly sequenceStore: ReceiptSequenceStore }): ReceiptVerifier {
  const values = exactData(options, ["keys", "hmacSha256", "sequenceStore"]);
  if (values === undefined || !Array.isArray(values.keys) || values.keys.length < 1 || values.keys.length > MAX_RECEIPT_KEYS) {
    throw new RuntimeReceiptError(ERR_RUNTIME_RECEIPT_CONFIG);
  }
  const keys = new Map<string, Uint8Array>();
  for (const entry of values.keys as unknown[]) {
    const { keyId, key } = checkedKey(entry);
    if (keys.has(keyId)) throw new RuntimeReceiptError(ERR_RUNTIME_RECEIPT_CONFIG);
    keys.set(keyId, key);
  }
  const hmac = checkedHmac(values.hmacSha256);
  const sequenceStore = checkedSequenceStore(values.sequenceStore);
  const refuse = (error: ReceiptErrorMetadata): ReceiptVerification => Object.freeze({ ok: false as const, error });
  return Object.freeze({
    verify(input: unknown): ReceiptVerification {
      const r = exactData(input, RECEIPT_FIELDS);
      if (r === undefined) return refuse(ERR_RUNTIME_RECEIPT_SHAPE);
      if (r.version !== TASK_RECEIPT_VERSION) return refuse(ERR_RUNTIME_RECEIPT_VERSION);
      if (
        !isIdentifier(r.keyId) || !isIdentifier(r.scopeId) || !isIdentifier(r.taskId) ||
        !isNonNegativeInt(r.elapsedMs) || !isPositiveInt(r.sequence) ||
        typeof r.mac !== "string" || !MAC_HEX.test(r.mac) || typeof r.kind !== "string"
      ) {
        return refuse(ERR_RUNTIME_RECEIPT_SHAPE);
      }
      if (!isCause(r.cause) || TASK_RECEIPT_CAUSE_KIND[r.cause] !== r.kind) return refuse(ERR_RUNTIME_RECEIPT_CAUSE);
      const key = keys.get(r.keyId);
      if (key === undefined) return refuse(ERR_RUNTIME_RECEIPT_KEY);
      const receipt: TaskReceipt = Object.freeze({
        version: TASK_RECEIPT_VERSION,
        keyId: r.keyId,
        scopeId: r.scopeId,
        taskId: r.taskId,
        kind: r.kind as TaskReceiptKind,
        cause: r.cause,
        elapsedMs: r.elapsedMs,
        sequence: r.sequence,
        mac: r.mac,
      });
      let expected: Uint8Array;
      try {
        expected = hmac(key, canonicalReceiptText(receipt));
      } catch {
        return refuse(ERR_RUNTIME_RECEIPT_MAC);
      }
      const presented = new Uint8Array(32);
      for (let i = 0; i < 32; i += 1) presented[i] = Number.parseInt(r.mac.slice(i * 2, i * 2 + 2), 16);
      if (!constantTimeEqual(expected, presented)) return refuse(ERR_RUNTIME_RECEIPT_MAC);
      let previous: number | undefined;
      try {
        previous = readLastSequence(sequenceStore, receipt.scopeId);
      } catch {
        return refuse(ERR_RUNTIME_RECEIPT_SEQUENCE_STORE);
      }
      if (previous !== undefined && receipt.sequence <= previous) return refuse(ERR_RUNTIME_RECEIPT_REPLAY);
      if (previous === undefined) {
        let size: number;
        try {
          size = readScopeCount(sequenceStore);
        } catch {
          return refuse(ERR_RUNTIME_RECEIPT_SEQUENCE_STORE);
        }
        if (size >= MAX_RECEIPT_SCOPES) return refuse(ERR_RUNTIME_RECEIPT_CAPACITY);
      }
      try {
        writeLastSequence(sequenceStore, receipt.scopeId, receipt.sequence);
      } catch {
        return refuse(ERR_RUNTIME_RECEIPT_SEQUENCE_STORE);
      }
      const event: StructuredAwaitEvent = Object.freeze({ kind: receipt.kind, taskId: receipt.taskId, elapsedMs: receipt.elapsedMs });
      return Object.freeze({ ok: true as const, receipt, event });
    },
  });
}

// ── Isolated hard-termination host adapter ────────────────────────────────────────────────

/** Minimal structural view of node:child_process objects, so no Node typings are required. */
export interface IsolatedChildStream {
  on(event: string, listener: (...args: unknown[]) => void): unknown;
}
export interface IsolatedChildStdin extends IsolatedChildStream {
  end(chunk?: string): unknown;
}
export interface IsolatedChildProcess {
  readonly pid?: number | undefined;
  readonly stdin: IsolatedChildStdin | null;
  readonly stdout: IsolatedChildStream | null;
  on(event: string, listener: (...args: unknown[]) => void): unknown;
  kill(signal?: string): boolean;
}
export interface IsolatedSpawnOptions {
  readonly cwd: string;
  readonly env: Readonly<Record<string, string>>;
  readonly stdio: readonly ["pipe", "pipe", "ignore"];
  readonly shell: false;
  readonly windowsHide: true;
  readonly detached: false;
}
export type IsolatedSpawn = (command: string, args: readonly string[], options: IsolatedSpawnOptions) => IsolatedChildProcess;

export interface IsolatedHostConfig {
  /** Absolute path of the Node executable (normally process.execPath). */
  readonly execPath: string;
  /** Major version of that executable; the stable --permission flag needs 22 or later. */
  readonly nodeMajor: number;
  /** The process-spawn capability (normally node:child_process spawn). */
  readonly spawn: IsolatedSpawn;
  readonly signer: ReceiptSigner;
  /** Scope-relative elapsed milliseconds, as fed to the Structured Await reducer. */
  readonly elapsedMs: () => number;
}

export interface IsolatedTaskSpec {
  readonly scopeId: string;
  readonly taskId: string;
  /** Absolute path of the guest .mjs entry; the only file the guest may read. */
  readonly entry: string;
  /** Written to the guest's stdin, then stdin is closed. */
  readonly input: string;
  readonly deadlineMs: number;
  readonly maxOutputBytes: number;
  readonly maxHeapMb: number;
}

export type IsolatedTaskOutcome = "succeeded" | "failed" | "timed_out" | "cancelled";

export type IsolatedTaskResult =
  | {
      readonly outcome: IsolatedTaskOutcome;
      readonly receipt: TaskReceipt;
      /** Guest stdout, only for "succeeded". Untrusted text: validate before use. */
      readonly output?: string;
    }
  | { readonly outcome: "refused"; readonly error: ReceiptErrorMetadata }
  | { readonly outcome: "termination_unconfirmed"; readonly error: ReceiptErrorMetadata }
  | { readonly outcome: "receipt_unavailable"; readonly error: ReceiptErrorMetadata };

export interface IsolatedRun {
  readonly result: Promise<IsolatedTaskResult>;
  /** Hard-kills the guest. Idempotent; a no-op once the run has settled. */
  cancel(): void;
}

export interface IsolatedHost {
  run(spec: IsolatedTaskSpec): IsolatedRun;
}

export const ERR_RUNTIME_ISOLATED_UNCONFIRMED = err(
  "ERR_RUNTIME_ISOLATED_UNCONFIRMED",
  "Isolated guest exit was not observed after a hard kill; termination is not claimed.",
);

const OUTCOME_OF: Readonly<Record<TaskReceiptCause, IsolatedTaskOutcome>> = Object.freeze({
  exit_zero: "succeeded",
  exit_nonzero: "failed",
  output_invalid: "failed",
  spawn_failed: "failed",
  output_limit_kill: "failed",
  deadline_kill: "timed_out",
  cancel_kill: "cancelled",
});

const WINDOWS_ABSOLUTE = /^[A-Za-z]:\\/;
/** Absolute, normalised-looking .mjs path with no characters that change flag or path meaning. */
function isSafeEntryPath(value: unknown): value is string {
  if (typeof value !== "string" || value.length < 6 || value.length > 1024) return false;
  if (!value.endsWith(".mjs")) return false;
  // NUL/control characters, flag list separators, wildcards and quoting are refused.
  if (/[\u0000-\u001f\u007f,*?"'`$%|<>;&]/.test(value)) return false;
  const windows = WINDOWS_ABSOLUTE.test(value);
  if (!windows && !value.startsWith("/")) return false;
  if (windows && value.includes("/")) return false;
  const segments = value.slice(windows ? 3 : 1).split(windows ? "\\" : "/");
  return segments.every((segment) => segment !== "" && segment !== "." && segment !== "..");
}

function directoryOf(entry: string): string {
  const windows = WINDOWS_ABSOLUTE.test(entry);
  const cut = entry.lastIndexOf(windows ? "\\" : "/");
  const dir = entry.slice(0, cut);
  return windows ? (dir.length === 2 ? dir + "\\" : dir) : (dir === "" ? "/" : dir);
}

function utf8Length(text: string): number {
  return encoder.encode(text).byteLength;
}

function admitSpec(input: unknown): IsolatedTaskSpec | undefined {
  const v = exactData(input, SPEC_FIELDS);
  if (v === undefined) return undefined;
  if (!isIdentifier(v.scopeId) || !isIdentifier(v.taskId) || !isSafeEntryPath(v.entry)) return undefined;
  if (typeof v.input !== "string" || utf8Length(v.input) > MAX_ISOLATED_INPUT_BYTES) return undefined;
  if (!isPositiveInt(v.deadlineMs) || v.deadlineMs > MAX_ISOLATED_DEADLINE_MS) return undefined;
  if (!isPositiveInt(v.maxOutputBytes) || v.maxOutputBytes > MAX_ISOLATED_OUTPUT_BYTES) return undefined;
  if (!isPositiveInt(v.maxHeapMb) || v.maxHeapMb < MIN_ISOLATED_HEAP_MB || v.maxHeapMb > MAX_ISOLATED_HEAP_MB) return undefined;
  return Object.freeze({
    scopeId: v.scopeId,
    taskId: v.taskId,
    entry: v.entry,
    input: v.input,
    deadlineMs: v.deadlineMs,
    maxOutputBytes: v.maxOutputBytes,
    maxHeapMb: v.maxHeapMb,
  });
}

/** Exact argument vector for a guest. The guest may read only its entry file. */
export function isolatedGuestArgs(spec: Pick<IsolatedTaskSpec, "entry" | "maxHeapMb">): readonly string[] {
  return Object.freeze([
    ...ISOLATED_GUEST_FLAGS,
    `--allow-fs-read=${spec.entry}`,
    `--max-old-space-size=${spec.maxHeapMb}`,
    "--",
    spec.entry,
  ]);
}

function isSafeExecPath(value: unknown): value is string {
  if (typeof value !== "string" || value.length < 2 || value.length > 1024) return false;
  if (/[\u0000-\u001f\u007f]/.test(value)) return false;
  return WINDOWS_ABSOLUTE.test(value) || value.startsWith("/");
}

/** Creates the isolated host. Throws RuntimeReceiptError on an invalid configuration. */
export function createIsolatedHost(config: IsolatedHostConfig): IsolatedHost {
  const c = exactData(config, ["execPath", "nodeMajor", "spawn", "signer", "elapsedMs"]);
  if (
    c === undefined || !isSafeExecPath(c.execPath) ||
    !isPositiveInt(c.nodeMajor) || c.nodeMajor < MIN_ISOLATED_NODE_MAJOR ||
    typeof c.spawn !== "function" || typeof c.elapsedMs !== "function" ||
    typeof c.signer !== "object" || c.signer === null || typeof (c.signer as ReceiptSigner).sign !== "function"
  ) {
    throw new RuntimeReceiptError(ERR_RUNTIME_ISOLATED_CONFIG);
  }
  const execPath = c.execPath;
  const spawn = c.spawn as IsolatedSpawn;
  const signer = c.signer as ReceiptSigner;
  const elapsed = c.elapsedMs as () => number;

  return Object.freeze({
    run(input: IsolatedTaskSpec): IsolatedRun {
      const spec = admitSpec(input);
      if (spec === undefined) {
        return Object.freeze({
          result: Promise.resolve(Object.freeze({ outcome: "refused" as const, error: ERR_RUNTIME_ISOLATED_SPEC })),
          cancel: () => undefined,
        });
      }

      let resolveResult!: (value: IsolatedTaskResult) => void;
      const result = new Promise<IsolatedTaskResult>((resolve) => { resolveResult = resolve; });
      let settled = false;
      let killCause: TaskReceiptCause | undefined;
      let child: IsolatedChildProcess | undefined;
      let deadlineTimer: ReturnType<typeof setTimeout> | undefined;
      let confirmTimer: ReturnType<typeof setTimeout> | undefined;
      const chunks: Uint8Array[] = [];
      let outputBytes = 0;

      const clearTimers = (): void => {
        if (deadlineTimer !== undefined) clearTimeout(deadlineTimer);
        if (confirmTimer !== undefined) clearTimeout(confirmTimer);
        deadlineTimer = undefined;
        confirmTimer = undefined;
      };

      const settle = (value: IsolatedTaskResult): void => {
        if (settled) return;
        settled = true;
        clearTimers();
        resolveResult(Object.freeze(value));
      };

      const finish = (cause: TaskReceiptCause, output?: string): void => {
        if (settled) return;
        let receipt: TaskReceipt;
        try {
          const at: unknown = elapsed();
          if (!isNonNegativeInt(at)) throw new RuntimeReceiptError(ERR_RUNTIME_ISOLATED_RECEIPT);
          receipt = signer.sign({ scopeId: spec.scopeId, taskId: spec.taskId, cause, elapsedMs: at });
        } catch {
          settle({ outcome: "receipt_unavailable", error: ERR_RUNTIME_ISOLATED_RECEIPT });
          return;
        }
        settle(output === undefined ? { outcome: OUTCOME_OF[cause], receipt } : { outcome: OUTCOME_OF[cause], receipt, output });
      };

      const hardKill = (cause: TaskReceiptCause): void => {
        if (settled || killCause !== undefined || child === undefined) return;
        killCause = cause;
        if (deadlineTimer !== undefined) clearTimeout(deadlineTimer);
        deadlineTimer = undefined;
        try {
          child.kill("SIGKILL");
        } catch {
          // Fall through to the confirmation watchdog; termination is not claimed without "close".
        }
        confirmTimer = setTimeout(() => {
          settle({ outcome: "termination_unconfirmed", error: ERR_RUNTIME_ISOLATED_UNCONFIRMED });
        }, ISOLATED_KILL_CONFIRM_MS);
      };

      try {
        child = spawn(execPath, isolatedGuestArgs(spec), Object.freeze({
          cwd: directoryOf(spec.entry),
          // Empty environment: no NODE_OPTIONS, no inherited secrets, no extra --allow-* flags.
          env: Object.freeze({}),
          stdio: Object.freeze(["pipe", "pipe", "ignore"] as const),
          shell: false as const,
          windowsHide: true as const,
          detached: false as const,
        }));
      } catch {
        child = undefined;
      }
      if (child === undefined || typeof child !== "object" || typeof child.on !== "function" || typeof child.kill !== "function") {
        child = undefined;
        finish("spawn_failed");
        return Object.freeze({ result, cancel: () => undefined });
      }
      const proc = child;

      proc.on("error", () => {
        if (settled) return;
        // No pid means the process never started, so there is nothing left to terminate.
        if (proc.pid === undefined && killCause === undefined) {
          finish("spawn_failed");
          return;
        }
        hardKill(killCause ?? "spawn_failed");
      });
      proc.on("close", (code: unknown, signal: unknown) => {
        if (settled) return;
        clearTimers();
        if (killCause !== undefined) {
          finish(killCause);
          return;
        }
        if (code !== 0 || signal !== null) {
          finish("exit_nonzero");
          return;
        }
        let text: string;
        try {
          const joined = new Uint8Array(outputBytes);
          let offset = 0;
          for (const chunk of chunks) {
            joined.set(chunk, offset);
            offset += chunk.byteLength;
          }
          text = new TextDecoder("utf-8", { fatal: true }).decode(joined);
        } catch {
          finish("output_invalid");
          return;
        }
        finish("exit_zero", text);
      });
      proc.stdout?.on("data", (chunk: unknown) => {
        if (settled || killCause !== undefined) return;
        if (!(chunk instanceof Uint8Array)) {
          hardKill("output_limit_kill");
          return;
        }
        outputBytes += chunk.byteLength;
        if (outputBytes > spec.maxOutputBytes) {
          hardKill("output_limit_kill");
          return;
        }
        chunks.push(Uint8Array.from(chunk));
      });
      if (proc.stdin !== null && proc.stdin !== undefined) {
        // A guest that exits without reading stdin causes EPIPE; that is not a host failure.
        proc.stdin.on("error", () => undefined);
        try {
          proc.stdin.end(spec.input);
        } catch {
          // The close handler still decides the outcome.
        }
      }
      deadlineTimer = setTimeout(() => hardKill("deadline_kill"), spec.deadlineMs);

      return Object.freeze({ result, cancel: () => hardKill("cancel_kill") });
    },
  });
}

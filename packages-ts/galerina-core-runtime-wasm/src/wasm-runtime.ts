/**
 * wasm-runtime.ts — the P9 WASM execution harness, built as a SECURITY ADMISSION
 * GATE rather than a generic module loader (#105).
 *
 * The discipline (locked design, see galerina-build-roadmap.md "Next up"):
 *   1. ATTESTATION FIRST. A binary is verified BEFORE any host function is linked.
 *      An unsigned / tampered / unpinned module throws CRITICAL_SECURITY_VIOLATION
 *      and never reaches `WebAssembly.instantiate` — so host capabilities are never
 *      handed to unattested code.
 *   2. CLOSED-ALLOWLIST IMPORTS. The instance receives ONLY the host functions in
 *      the runtime's import object (`{ host: { __array_create, … } }`). No ambient
 *      globalThis / Node scope crosses the boundary — the WASI capability principle.
 *   3. ENFORCEMENT IS INVARIANT; only OBSERVABILITY changes between dev and prod.
 *      Dev passes an `Observer` (host-call log, trap memory dump); prod passes none.
 *      Neither path can skip the attestation or allowlist — there is no "dev bypass".
 *
 * Crypto is Ed25519 via node:crypto. This is the BORDER-SAFE TCB home (RD-0361 R4 / #143):
 * it lives in @galerina/core-runtime-wasm, reachable by the kernel/DSS but NEVER importing the
 * compiler — so the layering is clean (this package → node:crypto + record-abi ONLY, the Hardened
 * Border holds). It provides the LowLevelWasmExecutor / admission-verify / hash that core-runtime's
 * createGovernedRuntimeExecutor INJECTS (never imports).
 */

import {
  sign as edSign, verify as edVerify, generateKeyPairSync, createHash,
} from "node:crypto";
import { types as nodeTypes } from "node:util";
// RD-0389 record-marshalling ABI (ARG direction): the record staging base + field size are the
// SAME constants the emitter lays records out with, so a host-staged record and a module-built one
// share one layout (single source of truth — no drift). Used only inside allocRecord (call-time).
// #143 (RD-0361 R4): record-abi is now a sibling module IN this border-safe package — imported locally,
// so the TCB carries no cross-package import for its own layout.
import { WAT_HEAP_BASE, WAT_REC_FIELD_SIZE } from "./record-abi.js";
// R6: the one canonical exact Decimal/Money core (shared with the interpreter and stdlib).
import {
  HOST_MONEY_MINOR_UNITS, admitMoneyAmount, isExactTrapLabel, parseDec,
  decAdd, decSub, decMul, decNeg, decCompare, decDiv, decRem, decFromInt,
} from "./decimal-core.js";

// Capture the platform accessor before guest-controlled or granted host callbacks run. Reads
// must not dispatch through a mutable WebAssembly.Memory.prototype getter during execution.
const WASM_MEMORY_BUFFER_GETTER = Object.getOwnPropertyDescriptor(WebAssembly.Memory.prototype, "buffer")?.get;
const WASM_REFLECT_APPLY = Reflect.apply;
// Capture output-construction intrinsics before callbacks or callers can replace them.
// Owned-return snapshots must not dispatch through mutable Array/Object methods before wipe.
const WASM_OBJECT_FREEZE = Object.freeze;
const WASM_OBJECT_DEFINE_PROPERTY = Object.defineProperty;
const WASM_OBJECT_CREATE = Object.create;
const WASM_ARRAY_IS_ARRAY = Array.isArray;
const WASM_MAP_GET = Map.prototype.get;
const WASM_MAP_SET = Map.prototype.set;
const WASM_WEAKMAP_GET = WeakMap.prototype.get;
const WASM_WEAKMAP_SET = WeakMap.prototype.set;
const WASM_JSON_PARSE = JSON.parse;
const WASM_JSON_STRINGIFY = JSON.stringify;
const WASM_TEXT_DECODER_CONSTRUCTOR = TextDecoder;
const WASM_TEXT_DECODER_DECODE = TextDecoder.prototype.decode;
const WASM_NUMBER_IS_INTEGER = Number.isInteger;
const WASM_NUMBER_IS_SAFE_INTEGER = Number.isSafeInteger;
const WASM_ARRAYBUFFER_BYTE_LENGTH_GETTER = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, "byteLength")?.get;
const WASM_SHARED_ARRAYBUFFER_BYTE_LENGTH_GETTER = typeof SharedArrayBuffer === "undefined"
  ? undefined
  : Object.getOwnPropertyDescriptor(SharedArrayBuffer.prototype, "byteLength")?.get;
const WASM_INT32_ARRAY_CONSTRUCTOR = Int32Array;
const WASM_UINT8_ARRAY_CONSTRUCTOR = Uint8Array;
const WASM_TYPED_ARRAY_LENGTH_GETTER = Object.getOwnPropertyDescriptor(
  Object.getPrototypeOf(Int32Array.prototype),
  "length",
)?.get;

function safeDataPropertyDescriptor(
  value: unknown,
  writable: boolean,
  enumerable: boolean,
  configurable: boolean,
): PropertyDescriptor {
  const descriptor = WASM_REFLECT_APPLY(WASM_OBJECT_CREATE, Object, [null]) as PropertyDescriptor;
  descriptor.value = value;
  descriptor.writable = writable;
  descriptor.enumerable = enumerable;
  descriptor.configurable = configurable;
  return descriptor;
}

function readWasmMemoryBuffer(memory: WebAssembly.Memory): ArrayBufferLike {
  const getter = WASM_MEMORY_BUFFER_GETTER;
  if (typeof getter !== "function") {
    throw new Error("FUNGI-WASM-MEMORY-001: trusted WebAssembly.Memory buffer accessor is unavailable");
  }
  return WASM_REFLECT_APPLY(getter, memory, []) as ArrayBufferLike;
}

function decodeWasmUtf8(bytes: Uint8Array): string {
  const decoder = new WASM_TEXT_DECODER_CONSTRUCTOR("utf-8", { fatal: true, ignoreBOM: true });
  return WASM_REFLECT_APPLY(WASM_TEXT_DECODER_DECODE, decoder, [bytes]) as string;
}

function wasmByteSubarray(bytes: Uint8Array, start: number, end: number): Uint8Array {
  if (typeof WASM_TYPED_ARRAY_LENGTH_GETTER !== "function") {
    throw new Error("FUNGI-WASM-MEMORY-001: trusted typed-array length accessor is unavailable");
  }
  const byteLength = WASM_REFLECT_APPLY(WASM_TYPED_ARRAY_LENGTH_GETTER, bytes, []) as number;
  const length = end - start;
  if (!WASM_NUMBER_IS_SAFE_INTEGER(start) || !WASM_NUMBER_IS_SAFE_INTEGER(end)
    || start < 0 || length < 0 || end > byteLength) {
    throw new Error("FUNGI-WASM-MEMORY-001: byte slice is outside the validated input");
  }
  // TypedArray.prototype.subarray consults this.constructor[Symbol.species]. A
  // previously captured method therefore still dispatches through mutable
  // species. Copy by indexed reads into a fresh captured-constructor buffer.
  const copy = new WASM_UINT8_ARRAY_CONSTRUCTOR(length);
  for (let index = 0; index < length; index += 1) {
    const byte = bytes[start + index];
    if (typeof byte !== "number") {
      throw new Error("FUNGI-WASM-MEMORY-001: byte slice contains an unavailable element");
    }
    copy[index] = byte;
  }
  return copy;
}

function isWasmMemory(value: unknown): value is WebAssembly.Memory {
  const getter = WASM_MEMORY_BUFFER_GETTER;
  if (typeof getter !== "function" || value === null || typeof value !== "object") return false;
  try {
    WASM_REFLECT_APPLY(getter, value, []);
    return true;
  } catch {
    return false;
  }
}

function readWasmBufferByteLength(buffer: ArrayBufferLike): number {
  const arrayBufferGetter = WASM_ARRAYBUFFER_BYTE_LENGTH_GETTER;
  if (typeof arrayBufferGetter !== "function") {
    throw new Error("FUNGI-WASM-MEMORY-001: trusted ArrayBuffer byteLength accessor is unavailable");
  }
  try {
    return WASM_REFLECT_APPLY(arrayBufferGetter, buffer, []) as number;
  } catch {
    const sharedArrayBufferGetter = WASM_SHARED_ARRAYBUFFER_BYTE_LENGTH_GETTER;
    if (typeof sharedArrayBufferGetter !== "function") {
      throw new Error("FUNGI-WASM-MEMORY-001: trusted SharedArrayBuffer byteLength accessor is unavailable");
    }
    try {
      return WASM_REFLECT_APPLY(sharedArrayBufferGetter, buffer, []) as number;
    } catch {
      throw new Error("FUNGI-WASM-MEMORY-001: memory buffer has no trusted byte length");
    }
  }
}

function readWasmWordView(memory: WebAssembly.Memory): { view: Int32Array; wordLength: number } {
  const buffer = readWasmMemoryBuffer(memory);
  const byteLength = readWasmBufferByteLength(buffer);
  if (!Number.isSafeInteger(byteLength) || byteLength < 0 || (byteLength & 3) !== 0) {
    throw new Error("FUNGI-WASM-MEMORY-001: memory byte length is not a valid word multiple");
  }
  const view = new WASM_INT32_ARRAY_CONSTRUCTOR(buffer);
  const lengthGetter = WASM_TYPED_ARRAY_LENGTH_GETTER;
  if (typeof lengthGetter !== "function") {
    throw new Error("FUNGI-WASM-MEMORY-001: trusted typed-array length accessor is unavailable");
  }
  const wordLength = WASM_REFLECT_APPLY(lengthGetter, view, []) as number;
  if (wordLength !== byteLength / 4) {
    throw new Error("FUNGI-WASM-MEMORY-001: typed-array length does not match trusted memory length");
  }
  return { view, wordLength };
}

function copyWasmMemorySnapshot(memory: WebAssembly.Memory): Uint8Array {
  const buffer = readWasmMemoryBuffer(memory);
  const byteLength = readWasmBufferByteLength(buffer);
  if (!Number.isSafeInteger(byteLength) || byteLength < 0) {
    throw new Error("FUNGI-WASM-MEMORY-001: memory byte length is invalid");
  }
  const source = new WASM_UINT8_ARRAY_CONSTRUCTOR(buffer);
  const snapshot = new WASM_UINT8_ARRAY_CONSTRUCTOR(byteLength);
  for (let index = 0; index < byteLength; index++) snapshot[index] = source[index]!;
  return snapshot;
}

export const MAX_WASM_ARRAYS = 4096;
export const MAX_WASM_ARRAY_ITEMS = 1_000_000;
export const MAX_WASM_STRINGS = 4096;
export const MAX_WASM_STRING_CHARS = 1_048_576;
export const MAX_WASM_HOST_RECORDS = 4096;

// ─────────────────────────────────────────────────────────────────────────────
// Attestation (Ed25519 over the raw .wasm binary)
// ─────────────────────────────────────────────────────────────────────────────

export interface AdmissionPolicy {
  /** Require a valid Ed25519 signature over the wasm binary. */
  readonly requireSigned?: boolean;
  /** PEM SPKI public key used to verify the signature. */
  readonly publicKeyPem?: string;
  /** Optional sha256 allow-list — pin the exact binary(ies) permitted. */
  readonly allowedHashes?: readonly string[];
  /**
   * Require the attestation's declared profile to be "certified". A dev/ephemeral
   * attestation is then refused — the production gate. Default off (dev harness).
   */
  readonly requireCertifiedProfile?: boolean;
}

export type RunnerProfile = "dev" | "certified";

export interface WasmAttestation {
  /** sha256 hex of the wasm binary (the signing pre-image). */
  readonly sha256: string;
  /** base64 Ed25519 signature over the binary. Absent ⇒ unsigned. */
  readonly signature?: string;
  /** Provenance profile — "dev" for an ephemeral runner key, "certified" for a pinned release. */
  readonly profile: RunnerProfile;
}

export interface AdmissionVerdict {
  readonly ok: boolean;
  readonly reason?: string;
  readonly hash: string;
}

/** sha256 hex of a wasm binary. */
export function wasmHash(wasm: Uint8Array): string {
  return createHash("sha256").update(wasm).digest("hex");
}

/** Generate an Ed25519 runner keypair (PEM). The dev harness mints an ephemeral one
 *  per run; a release pins the public key into the production AdmissionPolicy. */
export function generateRunnerKeypair(): { publicKeyPem: string; privateKeyPem: string } {
  // PEM-encoded form (matches src/attestation.ts) — node:crypto signs with the PEM
  // key directly, so no createPrivateKey/createPublicKey is needed.
  const { publicKey, privateKey } = generateKeyPairSync("ed25519", {
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  return { publicKeyPem: publicKey, privateKeyPem: privateKey };
}

/** Sign a wasm binary, producing an attestation. */
/** Domain-separated admission pre-image (#173). The signature binds the module hash AND the profile,
 *  so the `profile` label is no longer OUTSIDE the signature — a dev attestation can no longer be
 *  re-labeled `certified` and still verify. Versioned tag so the pre-image can evolve fail-closed. */
const WASM_ADMIT_DOMAIN = "FUNGI-WASM-ADMIT-v1";
function admissionPreimage(sha256Hex: string, profile: RunnerProfile): Uint8Array {
  return Buffer.from(`${WASM_ADMIT_DOMAIN}\0${sha256Hex}\0${profile}`, "utf8");
}

export function signWasm(
  wasm: Uint8Array, privateKeyPem: string, profile: RunnerProfile = "dev",
): WasmAttestation {
  const sha256 = wasmHash(wasm);
  // #173: sign over (domain ∥ hash ∥ profile), NOT the raw bytes — binds the profile into the signature.
  // (admissionPreimage returns a Uint8Array, which IS an ArrayBufferView — no cast needed; a `BufferSource`
  //  cast would (wrongly) widen to ArrayBuffer and is rejected by current node types.)
  const sig = edSign(null, admissionPreimage(sha256, profile), { key: privateKeyPem, dsaEncoding: "ieee-p1363" });
  return { sha256, signature: Buffer.from(sig).toString("base64"), profile };
}

function snapshotPlainDataRecord(
  value: unknown,
  allowedKeys: ReadonlySet<string>,
  requiredKeys: readonly string[],
): Readonly<Record<string, unknown>> | undefined {
  if (
    value === null
    || typeof value !== "object"
    || Array.isArray(value)
    || nodeTypes.isProxy(value)
  ) return undefined;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return undefined;
  const keys = Reflect.ownKeys(value);
  if (keys.some((key) => typeof key !== "string" || !allowedKeys.has(key))) return undefined;
  const snapshot: Record<string, unknown> = Object.create(null);
  for (const key of keys as string[]) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !("value" in descriptor) || !descriptor.enumerable) return undefined;
    snapshot[key] = descriptor.value;
  }
  if (requiredKeys.some((key) => !Object.hasOwn(snapshot, key))) return undefined;
  return Object.freeze(snapshot);
}

function snapshotStringArray(value: unknown): readonly string[] | undefined {
  if (!Array.isArray(value) || nodeTypes.isProxy(value) || Object.getPrototypeOf(value) !== Array.prototype) {
    return undefined;
  }
  const lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
  const length = lengthDescriptor?.value;
  if (!Number.isSafeInteger(length) || (length as number) < 0 || Reflect.ownKeys(value).length !== (length as number) + 1) {
    return undefined;
  }
  const copied: string[] = [];
  for (let index = 0; index < (length as number); index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (descriptor === undefined || !("value" in descriptor) || !descriptor.enumerable || typeof descriptor.value !== "string") {
      return undefined;
    }
    copied.push(descriptor.value);
  }
  return Object.freeze(copied);
}

function snapshotFiniteNumberArray(value: unknown): readonly number[] | undefined {
  if (!Array.isArray(value) || nodeTypes.isProxy(value) || Object.getPrototypeOf(value) !== Array.prototype) return undefined;
  const lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
  const length = lengthDescriptor?.value;
  if (!Number.isSafeInteger(length) || (length as number) < 0 || Reflect.ownKeys(value).length !== (length as number) + 1) {
    return undefined;
  }
  const copied: number[] = [];
  for (let index = 0; index < (length as number); index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (descriptor === undefined || !("value" in descriptor) || !descriptor.enumerable
      || typeof descriptor.value !== "number" || !Number.isFinite(descriptor.value)) return undefined;
    copied.push(descriptor.value);
  }
  return Object.freeze(copied);
}

function snapshotAdmissionPolicy(value: AdmissionPolicy): AdmissionPolicy | undefined {
  const record = snapshotPlainDataRecord(
    value,
    new Set(["requireSigned", "publicKeyPem", "allowedHashes", "requireCertifiedProfile"]),
    [],
  );
  if (record === undefined) return undefined;
  const requireSigned = record.requireSigned;
  const requireCertifiedProfile = record.requireCertifiedProfile;
  const publicKeyPem = record.publicKeyPem;
  if (requireSigned !== undefined && typeof requireSigned !== "boolean") return undefined;
  if (requireCertifiedProfile !== undefined && typeof requireCertifiedProfile !== "boolean") return undefined;
  if (publicKeyPem !== undefined && typeof publicKeyPem !== "string") return undefined;
  const allowedHashes = record.allowedHashes === undefined ? undefined : snapshotStringArray(record.allowedHashes);
  if (record.allowedHashes !== undefined && allowedHashes === undefined) return undefined;
  return Object.freeze({
    ...(requireSigned === undefined ? {} : { requireSigned }),
    ...(requireCertifiedProfile === undefined ? {} : { requireCertifiedProfile }),
    ...(publicKeyPem === undefined ? {} : { publicKeyPem }),
    ...(allowedHashes === undefined ? {} : { allowedHashes }),
  });
}

function snapshotWasmAttestation(value: WasmAttestation): WasmAttestation | undefined {
  const record = snapshotPlainDataRecord(
    value,
    new Set(["sha256", "signature", "profile"]),
    ["sha256", "profile"],
  );
  if (record === undefined) return undefined;
  if (
    typeof record.sha256 !== "string"
    || (record.profile !== "dev" && record.profile !== "certified")
    || (record.signature !== undefined && typeof record.signature !== "string")
  ) return undefined;
  return Object.freeze({
    sha256: record.sha256,
    profile: record.profile,
    ...(record.signature === undefined ? {} : { signature: record.signature }),
  });
}

/**
 * Verify a wasm attestation against a policy. Fails CLOSED — a missing attestation,
 * a hash mismatch, an unpinned hash, a bad signature, or a profile shortfall all
 * return { ok: false }. Pure check; performs NO instantiation.
 */
export function verifyWasm(
  wasm: Uint8Array, attestation: WasmAttestation | undefined, policy: AdmissionPolicy,
): AdmissionVerdict {
  // RD-0236 finding #11 — a certified profile MUST require a verified signature, not
  // just a matching string. `requireCertifiedProfile` used to be a bare string compare
  // gated separately by `requireSigned`, so a "certified"-labelled attestation with NO
  // signature was admitted whenever the caller forgot `requireSigned`. Since #173 binds
  // the profile INTO the signature, an unsigned "certified" claim is unverifiable — force
  // `requireSigned` here (mirrors bridge-attestation.ts verifyAttestationHybrid, which
  // forces requireSigned even if the caller omitted it). Certified ⇒ signed, always.
  const hash = wasmHash(wasm);
  if (!attestation) return { ok: false, reason: "no attestation provided", hash };
  const safePolicy = snapshotAdmissionPolicy(policy);
  if (safePolicy === undefined) return { ok: false, reason: "invalid admission policy data shape", hash };
  const safeAttestation = snapshotWasmAttestation(attestation);
  if (safeAttestation === undefined) return { ok: false, reason: "invalid attestation data shape", hash };
  const effectivePolicy: AdmissionPolicy = safePolicy.requireCertifiedProfile
    ? { ...safePolicy, requireSigned: true }
    : safePolicy;
  if (safeAttestation.sha256 !== hash) {
    return { ok: false, reason: `attestation hash ${safeAttestation.sha256} ≠ binary hash ${hash}`, hash };
  }
  if (effectivePolicy.requireCertifiedProfile && safeAttestation.profile !== "certified") {
    return { ok: false, reason: `certified profile required, attestation is "${safeAttestation.profile}"`, hash };
  }
  if (effectivePolicy.allowedHashes && effectivePolicy.allowedHashes.length > 0 && !effectivePolicy.allowedHashes.includes(hash)) {
    return { ok: false, reason: `binary hash not pinned: ${hash}`, hash };
  }
  if (effectivePolicy.requireSigned) {
    if (!safeAttestation.signature) return { ok: false, reason: "signature required but absent", hash };
    if (!effectivePolicy.publicKeyPem) return { ok: false, reason: "no public key configured to verify signature", hash };
    try {
      // #173: verify over (domain ∥ recomputed-hash ∥ attestation.profile). `hash` is the recomputed
      // binary hash (already checked === attestation.sha256 above), so a flipped profile changes the
      // pre-image and the signature fails — closing the re-label privilege escalation.
      const ok = edVerify(
        null,
        admissionPreimage(hash, safeAttestation.profile),
        { key: effectivePolicy.publicKeyPem, dsaEncoding: "ieee-p1363" },
        Buffer.from(safeAttestation.signature, "base64"),
      );
      if (!ok) return { ok: false, reason: "signature verification failed", hash };
    } catch (e) {
      return { ok: false, reason: `signature check error: ${(e as Error).message}`, hash };
    }
  }
  return { ok: true, hash };
}

/** Governed adapters require signed admission even when a development caller's general policy omits it. */
export function verifyWasmSigned(
  wasm: Uint8Array,
  attestation: WasmAttestation | undefined,
  policy: AdmissionPolicy,
): AdmissionVerdict {
  const safePolicy = snapshotAdmissionPolicy(policy);
  if (safePolicy === undefined) return { ok: false, reason: "invalid admission policy data shape", hash: wasmHash(wasm) };
  return verifyWasm(wasm, attestation, { ...safePolicy, requireSigned: true });
}

// ─────────────────────────────────────────────────────────────────────────────
// Observability (trusted host callbacks; not an effect-free security boundary)
// ─────────────────────────────────────────────────────────────────────────────

export interface Observer {
  /** Each host-import call: name, args, return value. */
  readonly onHostCall?: (name: string, args: readonly number[], ret: number | undefined) => void;
  /**
   * Trusted host diagnostic callback, invoked for a refused admission. It runs outside guest
   * import gating and may itself perform effects or re-enter another admitted runtime. Never
   * treat this callback as effect-free, and never supply an untrusted observer here.
   */
  readonly onViolation?: (reason: string, wasm: Uint8Array) => void;
  /** A WASM trap (e.g. `unreachable`) — receives a snapshot of linear memory. */
  readonly onTrap?: (err: unknown, memory: Uint8Array | null) => void;
  /**
   * A line emitted by the module through the `print`/`println` I/O stdlib. When set, output is
   * captured HERE — the governed, auditable sink a DSS supervisor wires up — instead of hitting the
   * ambient console. Absent → dev fallback to `console.log`. Observation only; never affects control.
   */
  readonly onOutput?: (line: string) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Closed host runtime — the ONLY capabilities a module can reach
// ─────────────────────────────────────────────────────────────────────────────

export interface HostRuntime {
  /** The closed import object handed to WebAssembly.instantiate. */
  readonly imports: WebAssembly.Imports;
  /** Register an input string, returning its i32 handle. */
  internString(s: string): number;
  /** Set a string at an EXACT handle (for seeding the emitter's intern table, #145). */
  seedString(handle: number, s: string): void;
  /** Resolve a string handle (created by the host or by `__int_to_str`). */
  readString(handle: number): string | undefined;
  /** Resolve an array handle (created by `__array_create`) to its element list. */
  readArray(handle: number): readonly number[] | undefined;
  /** Resolve a Result handle (from `__result_ok`/`__result_err`) to its tag + value. */
  readResult(handle: number): { tag: "ok" | "err"; value: number } | undefined;
  /** Resolve an Option handle. `-1` is the sole None value; all other values are registry handles. */
  readOption(handle: number): { tag: "none" } | { tag: "some"; value: number };
  /** Resolve a Money handle (from a `__money_*` currency constructor) to its currency + amount. */
  readMoney(handle: number): { currency: string; amountStr: string } | undefined;
  /** Resolve a Decimal handle (C02 exact base-10 host value). */
  readDecimal(handle: number): string | undefined;
  /** Intern a canonical decimal string, returning its handle. */
  internDecimal(text: string): number;
  /** Bind test/helper memory before admission, or the admitted instance's memory internally. */
  bindMemory(memory: WebAssembly.Memory): void;
  /** Read field `slot` (0-based i32 slots) of a record at linear-memory `ptr`. */
  readRecordField(ptr: number, slot: number): number;
  /**
   * RD-0389 (ARG direction): build a host-side array from element handles (record ptrs, string
   * handles, or raw values), returning its i32 handle — the counterpart of `readArray`. The module
   * reads it with `__array_length` / `__array_get`. Test/differential marshalling ONLY (never on the
   * production admission path; the closed import set is unchanged).
   */
  internArray(items: readonly number[]): number;
  /**
   * Typed consumer: copy each interned array element's guest record fields.
   * Snapshots the handle list first, then copies `fieldCount` i32 words from
   * each aligned heap pointer. Guest mutation after return does not change the
   * snapshot. Incomplete copies refuse with no partial success.
   */
  copyArrayRecords(handle: number, fieldCount: number): readonly (readonly number[])[];
  /**
   * Schema-directed copy: nested `record` fields are owned inner rows, not
   * leftover guest pointers. Omitted nested pointers (`< WAT_HEAP_BASE`)
   * become zeros in the layout shape. Cycles and over-depth refuse.
   */
  copyArrayRecordsLayout(handle: number, fields: readonly RecordCopyField[]): readonly unknown[];
  /**
   * RD-0389 (ARG direction): stage a record in the module's OWN exported linear memory — write each
   * field (one i32 slot) contiguously from a host bump pointer based at `WAT_HEAP_BASE`, returning
   * the base ptr — the counterpart of `readRecordField`. The module reads a field with
   * `i32.load(ptr + slot*WAT_REC_FIELD_SIZE)`, the SAME layout the emitter writes. FAIL-CLOSED:
   * requires `bindMemory` first and ≥1 field, and traps rather than writing out of bounds. Valid for
   * passing inputs to a flow that does NOT itself allocate records over that region (the differential
   * contract); a String/nested-record field is passed as its handle/ptr, so records compose. Test/
   * differential ONLY.
   */
  allocRecord(fields: readonly number[]): number;
  /** A snapshot of linear memory (for the trap observer). null before bindMemory. */
  snapshotMemory(): Uint8Array | null;
}

type HostRuntimeAdmissionLifecycle = {
  state: "ready" | "admitting" | "admitted" | "quarantined";
  memoryBoundBeforeAdmission: boolean;
  internalBindPermit: boolean;
  activeCall: boolean;
};

const FACTORY_HOST_RUNTIMES = new WeakMap<HostRuntime, HostRuntimeAdmissionLifecycle>();
const FACTORY_OWNED_RETURN_COPIERS = new WeakMap<HostRuntime, OwnedReturnCopier>();

type OptionKind = "i32" | "f64";
type OptionEntry = { readonly kind: OptionKind; readonly value: number };

/** Must match Galerina's admitted generic type nesting bound in the compiler lexer. */
const MAX_OPTION_FLOAT_EQUALITY_DEPTH = 8;

/** Schema for one record field when copying array-of-record values. Nested
 *  `record` fields occupy one i32 pointer slot and recurse. */
export type RecordCopyField =
  | { readonly kind: "i32" }
  | { readonly kind: "record"; readonly fields: readonly RecordCopyField[] };

/** Attested schema for an owned value returned across the WASM boundary. */
export type OwnedReturnShape =
  | { readonly kind: "i32" }
  | { readonly kind: "record"; readonly fields: readonly OwnedReturnShape[] }
  | { readonly kind: "array"; readonly element: OwnedReturnShape }
  | { readonly kind: "result"; readonly ok: OwnedReturnShape; readonly err: OwnedReturnShape };

function ownedReturnShapeRequiresCleanup(shape: OwnedReturnShape): boolean {
  return shape.kind !== "i32";
}

type OwnedReturnSchemas = Readonly<Record<string, OwnedReturnShape>>;
type OwnedReturnCopier = (shape: OwnedReturnShape, value: number) => unknown;

export const MAX_RECORD_COPY_DEPTH = 8;
export const MAX_RECORD_COPY_NODES = 4096;

/** Closed non-secret ABI for granted WASM host imports. */
export interface WasmEffectGrantAbiEntry {
  readonly module: "host";
  readonly name: string;
  readonly effect: string;
  readonly params: readonly ["i32", "i32"];
  readonly results: readonly ["i32"];
}

export const WASM_EFFECT_GRANT_ABI: readonly WasmEffectGrantAbiEntry[] = Object.freeze([
  Object.freeze({ module: "host", name: "audit.write", effect: "audit.write", params: Object.freeze(["i32", "i32"] as const), results: Object.freeze(["i32"] as const) }),
  Object.freeze({ module: "host", name: "audit.log", effect: "audit.write", params: Object.freeze(["i32", "i32"] as const), results: Object.freeze(["i32"] as const) }),
]);

const WASM_ABI_VALUE_TYPE = Object.freeze({ i32: 0x7f });

function encodeWasmU32(value: number): number[] {
  if (!Number.isSafeInteger(value) || value < 0 || value > 0xffff_ffff) {
    throw new RangeError("Wasm section length is outside u32 range");
  }
  const bytes: number[] = [];
  let remaining = value;
  do {
    let byte = remaining & 0x7f;
    remaining = Math.floor(remaining / 0x80);
    if (remaining !== 0) byte |= 0x80;
    bytes.push(byte);
  } while (remaining !== 0);
  return bytes;
}

function encodeWasmName(value: string): number[] {
  const bytes = Array.from(new TextEncoder().encode(value));
  return [...encodeWasmU32(bytes.length), ...bytes];
}

type WasmI32FunctionSignature = {
  readonly name?: string;
  readonly params: readonly "i32"[];
  readonly results: readonly "i32"[];
};

const effectGrantSignatureModules = new Map<string, WebAssembly.Module>();

function effectGrantSignatureModule(entry: WasmI32FunctionSignature): WebAssembly.Module {
  const key = `${entry.params.join(",")}->${entry.results.join(",")}`;
  const existing = effectGrantSignatureModules.get(key);
  if (existing) return existing;

  const encodeTypes = (types: readonly "i32"[]): number[] => types.map((type) => {
    const code = WASM_ABI_VALUE_TYPE[type];
    if (code === undefined) throw new TypeError(`unsupported Wasm effect-grant type '${type}'`);
    return code;
  });
  const signature = [
    0x60,
    ...encodeWasmU32(entry.params.length), ...encodeTypes(entry.params),
    ...encodeWasmU32(entry.results.length), ...encodeTypes(entry.results),
  ];
  const typePayload = [...encodeWasmU32(1), ...signature];
  const importPayload = [
    ...encodeWasmU32(1), ...encodeWasmName("bridge"), ...encodeWasmName("callback"), 0x00, 0x00,
  ];
  const exportPayload = [...encodeWasmU32(1), ...encodeWasmName("callback"), 0x00, 0x00];
  const section = (id: number, payload: readonly number[]): number[] => [
    id, ...encodeWasmU32(payload.length), ...payload,
  ];
  const bytes = new Uint8Array([
    0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00,
    ...section(1, typePayload),
    ...section(2, importPayload),
    ...section(7, exportPayload),
  ]);
  const compiled = new WebAssembly.Module(bytes);
  effectGrantSignatureModules.set(key, compiled);
  return compiled;
}

function typeEffectGrantHandler(
  entry: WasmI32FunctionSignature,
  handler: (...args: number[]) => number,
): (...args: number[]) => number {
  const bridge = new WebAssembly.Instance(effectGrantSignatureModule(entry), {
    bridge: { callback: handler },
  });
  const callback = bridge.exports.callback;
  if (typeof callback !== "function") {
    throw new TypeError(`Wasm typed host-import bridge did not export '${entry.name ?? "function"}'`);
  }
  return callback as (...args: number[]) => number;
}

export const FUNGI_WASM_GRANT_001 = Object.freeze({
  code: "FUNGI-WASM-GRANT-001",
  name: "EFFECT_GRANT_NOT_ALLOWLISTED",
  severity: "error",
} as const);

function makeEffectGrantDiag(detail: string): Error {
  return new Error(`${FUNGI_WASM_GRANT_001.code}: ${detail} (deny-by-default; fail-closed)`);
}

function refuseHostCopy(detail: string): never {
  throw new Error(`FUNGI-WASM-HOST-001: ${detail}`);
}

function admitCopyFields(fields: readonly RecordCopyField[], depth: number): void {
  if (!Array.isArray(fields) || fields.length < 1 || fields.length > 64) {
    refuseHostCopy(`layout fieldCount=${Array.isArray(fields) ? String(fields.length) : "invalid"}`);
  }
  if (depth > MAX_RECORD_COPY_DEPTH) {
    refuseHostCopy(`nested record copy exceeded depth ${MAX_RECORD_COPY_DEPTH}`);
  }
  for (const field of fields) {
    if (field === null || typeof field !== "object") refuseHostCopy("invalid layout field");
    if (field.kind === "i32") continue;
    if (field.kind === "record") {
      admitCopyFields(field.fields, depth + 1);
      continue;
    }
    refuseHostCopy("invalid layout kind");
  }
}

function snapshotReturnLayouts(
  layouts: Readonly<Record<string, readonly RecordCopyField[]>> | undefined,
): Readonly<Record<string, readonly RecordCopyField[]>> | undefined {
  if (layouts === undefined) return undefined;
  if (layouts === null || typeof layouts !== "object") {
    refuseHostCopy("return layouts must be a plain record");
  }
  if (nodeTypes.isProxy(layouts)) refuseHostCopy("return layouts cannot contain Proxy objects");
  const prototype = Object.getPrototypeOf(layouts);
  if (prototype !== Object.prototype && prototype !== null) {
    refuseHostCopy("return layouts must be a plain record");
  }

  const snapshot = Object.create(null) as Record<string, readonly RecordCopyField[]>;
  const layoutKeys = Reflect.ownKeys(layouts);
  if (layoutKeys.length > MAX_RECORD_COPY_NODES) {
    refuseHostCopy(`return layout export count exceeded node bound ${MAX_RECORD_COPY_NODES}`);
  }

  let nodes = 0;
  const readDataProperty = (value: object, key: PropertyKey): unknown => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !("value" in descriptor)) {
      refuseHostCopy("return layout contains a missing or accessor-backed property");
    }
    return descriptor.value;
  };

  const copyFields = (fields: unknown, depth: number): readonly RecordCopyField[] => {
    if (depth > MAX_RECORD_COPY_DEPTH) {
      refuseHostCopy(`nested record copy exceeded depth ${MAX_RECORD_COPY_DEPTH}`);
    }
    if (!Array.isArray(fields)) refuseHostCopy("layout fields must be plain arrays");
    if (nodeTypes.isProxy(fields)) refuseHostCopy("layout fields cannot contain Proxy objects");
    if (Object.getPrototypeOf(fields) !== Array.prototype) {
      refuseHostCopy("layout fields must be plain arrays");
    }
    const length = readDataProperty(fields, "length");
    if (!Number.isSafeInteger(length) || (length as number) < 1 || (length as number) > 64) {
      refuseHostCopy(`layout fieldCount=${String(length)}`);
    }
    const keys = Reflect.ownKeys(fields);
    if (keys.length !== (length as number) + 1) {
      refuseHostCopy("layout arrays must be dense and have no extra properties");
    }

    const copied: RecordCopyField[] = [];
    for (let index = 0; index < (length as number); index += 1) {
      const field = readDataProperty(fields, String(index));
      if (field === null || typeof field !== "object") refuseHostCopy("invalid layout field");
      if (nodeTypes.isProxy(field)) refuseHostCopy("layout fields cannot contain Proxy objects");
      const fieldPrototype = Object.getPrototypeOf(field);
      if (fieldPrototype !== Object.prototype && fieldPrototype !== null) {
        refuseHostCopy("layout fields must be plain records");
      }
      const fieldKeys = Reflect.ownKeys(field);
      const kind = readDataProperty(field, "kind");
      nodes += 1;
      if (nodes > MAX_RECORD_COPY_NODES) {
        refuseHostCopy(`return layout exceeded node bound ${MAX_RECORD_COPY_NODES}`);
      }
      if (kind === "i32" && fieldKeys.length === 1) {
        copied.push(Object.freeze({ kind: "i32" }));
        continue;
      }
      if (kind === "record" && fieldKeys.length === 2) {
        const nested = copyFields(readDataProperty(field, "fields"), depth + 1);
        copied.push(Object.freeze({ kind: "record", fields: nested }));
        continue;
      }
      refuseHostCopy("invalid layout field shape");
    }
    return Object.freeze(copied);
  };

  for (const key of layoutKeys) {
    if (typeof key !== "string") refuseHostCopy("return layout export names must be strings");
    const fields = copyFields(readDataProperty(layouts, key), 0);
    admitCopyFields(fields, 0);
    Object.defineProperty(snapshot, key, { value: fields, enumerable: true });
  }
  return Object.freeze(snapshot);
}

const OWNED_RETURN_SECTION = "fungi.owned-returns.v1";
const MAX_OWNED_RETURN_SCHEMA_BYTES = 65_536;
const MAX_OWNED_RETURN_EXPORTS = 256;

function snapshotOwnedReturnSchemas(value: unknown): OwnedReturnSchemas {
  const refuse = (detail: string): never => refuseHostCopy(`owned-return schema ${detail}`);
  if (value === null || typeof value !== "object" || Array.isArray(value)) refuse("must be an object");
  const schema = value as Record<string, unknown>;
  if (Object.keys(schema).sort().join(",") !== "exports,version" || schema.version !== 1) {
    refuse("has unsupported version or fields");
  }
  const exportsValue = schema.exports;
  if (exportsValue === null || typeof exportsValue !== "object" || Array.isArray(exportsValue)) {
    refuse("exports must be an object");
  }
  const exportsRecord = exportsValue as Record<string, unknown>;
  const names = Object.keys(exportsRecord);
  if (names.length === 0 || names.length > MAX_OWNED_RETURN_EXPORTS) refuse("export count is outside bounds");
  const output = Object.create(null) as Record<string, OwnedReturnShape>;
  let nodes = 0;
  const parseShape = (candidate: unknown, depth: number): OwnedReturnShape => {
    if (depth > MAX_RECORD_COPY_DEPTH) refuse(`exceeds depth ${MAX_RECORD_COPY_DEPTH}`);
    if (candidate === null || typeof candidate !== "object" || Array.isArray(candidate)) refuse("contains invalid shape");
    const shape = candidate as Record<string, unknown>;
    const kind = shape.kind;
    nodes += 1;
    if (nodes > MAX_RECORD_COPY_NODES) refuse("exceeds node bound");
    if (kind === "i32" && Object.keys(shape).length === 1) return Object.freeze({ kind });
    if (kind === "record" && Object.keys(shape).sort().join(",") === "fields,kind") {
      const fields = shape.fields;
      if (!Array.isArray(fields) || fields.length < 1 || fields.length > 64) {
        return refuse("record fields are outside bounds");
      }
      return Object.freeze({
        kind,
        fields: Object.freeze((fields as unknown[]).map((field: unknown) => parseShape(field, depth + 1))),
      });
    }
    if (kind === "array" && Object.keys(shape).sort().join(",") === "element,kind") {
      return Object.freeze({ kind, element: parseShape(shape.element, depth + 1) });
    }
    if (kind === "result" && Object.keys(shape).sort().join(",") === "err,kind,ok") {
      return Object.freeze({ kind, ok: parseShape(shape.ok, depth + 1), err: parseShape(shape.err, depth + 1) });
    }
    return refuse("contains unknown kind or fields");
  };
  for (const name of names) {
    if (name.length === 0 || name.startsWith("__fungi_")) refuse(`uses reserved export '${name}'`);
    Object.defineProperty(output, name, { value: parseShape(exportsRecord[name], 0), enumerable: true });
  }
  return Object.freeze(output);
}

function parseOwnedReturnSchemas(wasm: Uint8Array): OwnedReturnSchemas | undefined {
  if (wasm.length < 8 || wasm[0] !== 0 || wasm[1] !== 0x61 || wasm[2] !== 0x73 || wasm[3] !== 0x6d) {
    refuseHostCopy("WASM header is invalid");
  }
  let offset = 8;
  let found: OwnedReturnSchemas | undefined;
  while (offset < wasm.length) {
    const sectionId = wasm[offset++];
    if (sectionId === undefined) refuseHostCopy("section id is truncated");
    const cursor = { offset };
    const length = readWasmU32(wasm, cursor, wasm.length);
    if (length === undefined || length > wasm.length - cursor.offset) refuseHostCopy("section length is invalid");
    const end = cursor.offset + length;
    if (sectionId === 0) {
      const name = skipWasmName(wasm, cursor, end);
      if (name === OWNED_RETURN_SECTION) {
        if (found !== undefined) refuseHostCopy("contains duplicate metadata sections");
        const payloadLength = end - cursor.offset;
        if (payloadLength < 1 || payloadLength > MAX_OWNED_RETURN_SCHEMA_BYTES) {
          refuseHostCopy("payload is empty or exceeds byte bound");
        }
        try {
          const text = decodeWasmUtf8(wasmByteSubarray(wasm, cursor.offset, end));
          const parsed = WASM_JSON_PARSE(text) as unknown;
          if (WASM_JSON_STRINGIFY(parsed) !== text) {
            refuseHostCopy("metadata must use canonical JSON encoding");
          }
          found = snapshotOwnedReturnSchemas(parsed);
        } catch (error) {
          if (error instanceof Error && error.message.startsWith("FUNGI-WASM-HOST-001:")) throw error;
          refuseHostCopy(`cannot decode metadata: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }
    offset = end;
  }
  return found;
}

function zeroCopyShape(fields: readonly RecordCopyField[]): unknown[] {
  return fields.map((field) => (field.kind === "i32" ? 0 : zeroCopyShape(field.fields)));
}

function freezeCopyRow(row: readonly unknown[]): readonly unknown[] {
  const copied: unknown[] = [];
  for (let index = 0; index < row.length; index++) {
    const cell = row[index];
    const value = WASM_ARRAY_IS_ARRAY(cell) ? freezeCopyRow(cell as readonly unknown[]) : cell;
    WASM_REFLECT_APPLY(WASM_OBJECT_DEFINE_PROPERTY, Object, [
      copied,
      index,
      safeDataPropertyDescriptor(value, true, true, true),
    ]);
  }
  return WASM_REFLECT_APPLY(WASM_OBJECT_FREEZE, Object, [copied]) as readonly unknown[];
}

function copyGuestRecord(
  view: Int32Array,
  wordLength: number,
  ptr: number,
  fields: readonly RecordCopyField[],
  depth: number,
  visiting: Set<number>,
  nodes: { count: number },
): unknown[] {
  if (depth > MAX_RECORD_COPY_DEPTH) {
    refuseHostCopy(`nested record copy exceeded depth ${MAX_RECORD_COPY_DEPTH}`);
  }
  nodes.count += 1;
  if (nodes.count > MAX_RECORD_COPY_NODES) {
    refuseHostCopy(`nested record copy exceeded node bound ${MAX_RECORD_COPY_NODES}`);
  }
  if (!Number.isSafeInteger(ptr) || ptr < WAT_HEAP_BASE) return zeroCopyShape(fields);
  if ((ptr & 3) !== 0) refuseHostCopy(`record pointer ${String(ptr)} is not an aligned heap record`);
  if (visiting.has(ptr)) refuseHostCopy("cyclic record pointer");
  const start = ptr >>> 2;
  if (start < 0 || wordLength - start < fields.length) {
    refuseHostCopy("short memory for nested record copy");
  }
  visiting.add(ptr);
  const row: unknown[] = [];
  for (let i = 0; i < fields.length; i++) {
    const field = fields[i]!;
    const word = view[start + i]!;
    const value = field.kind === "i32"
      ? word
      : copyGuestRecord(view, wordLength, word, field.fields, depth + 1, visiting, nodes);
    WASM_REFLECT_APPLY(WASM_OBJECT_DEFINE_PROPERTY, Object, [
      row,
      i,
      safeDataPropertyDescriptor(value, true, true, true),
    ]);
  }
  visiting.delete(ptr);
  return row;
}

/**
 * Deterministic String ordering used by the interpreter and the WASM host.
 *
 * JavaScript relational String comparison is lexicographic over UTF-16 code
 * units. Galerina adopts that exact rule so the Stage-A interpreter, the
 * TypeScript bootstrap and host-backed WAT execution share one oracle. Locale,
 * process settings and normalization are deliberately not consulted here;
 * callers that require normalized text must admit it before comparison.
 */
export function compareUtf16CodeUnits(left: string, right: string): -1 | 0 | 1 {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

/**
 * Exact base-10 host Decimal: the SAME canonical core the interpreter and stdlib use (R6). The host keeps
 * no parser, formatter or rounding of its own, so the tiers cannot drift. A trap is thrown as an Error whose
 * message is exactly the shared trap label (`MalformedDecimal`, `DivisionByZero`, `ScaleOutOfRange`,
 * `UnknownRoundMode`, `MissingRoundMode`, `DecimalLimitExceeded`, `UnknownDecimalHandle`, and the Money labels).
 */
function hostDecOrThrow(r: string): string {
  if (isExactTrapLabel(r)) throw new Error(r);
  return r;
}

/**
 * Build the closed host runtime for the self-hosted lexer's 4-function surface:
 *   __array_create() → handle · __array_append(handle, item) → () ·
 *   __str_char_at(strHandle, idx) → charCode · __int_to_str(n) → strHandle
 *
 * Strings and arrays live in host-side registries (handles are i32 indices); records
 * live in the module's linear memory (P9.4b) and are read via readRecordField. This
 * mirrors the interpreter's value model: chars are code points, strings are interned.
 */
export function createHostRuntime(
  observe?: Observer,
  grants?: {
    /**
     * #105 sanctioned effect grants (deny-by-default). A module whose DECLARED effects put
     * host imports in its import table (e.g. "audit.write" or "audit.log") link ONLY
     * if the admitting caller explicitly supplies a handler keyed by the declared effect
     * name or the exact allow-listed import name here. A canonical effect handler grants
     * every mapped import; an explicit import-name handler overrides only that import.
     * No handler → the import stays outside the closed set → admission refuses with
     * CRITICAL_SECURITY_VIOLATION, exactly as before (this parameter cannot weaken that).
     * Every granted call is routed through the observer tap, so the audit layer sees it.
     */
    readonly effectHandlers?: Readonly<Record<string, (a: number, b: number) => number>>;
  },
): HostRuntime {
  const admissionLifecycle: HostRuntimeAdmissionLifecycle = {
    state: "ready",
    memoryBoundBeforeAdmission: false,
    internalBindPermit: false,
    activeCall: false,
  };
  const refuseGuestMemoryDuringCall = (operation: string): void => {
    if (admissionLifecycle.activeCall || admissionLifecycle.state === "quarantined") {
      throw new Error(`FUNGI-WASM-MEMORY-001: ${operation} refused while admitted guest memory is active or quarantined`);
    }
  };
  const strings: string[] = [];
  // Canonicalize only immutable host-created values. Seeded slots are caller-owned
  // inputs and may be overwritten, so they must never be returned as derived values.
  const canonicalStringHandles = new Map<string, number>();
  const immutableStringHandles = new Set<number>();
  const arrays: number[][] = [];
  const internArrayItems = (items: number[]): number => {
    if (arrays.length >= MAX_WASM_ARRAYS) {
      throw new Error("Array store exceeds the host bound");
    }
    if (items.length > MAX_WASM_ARRAY_ITEMS) {
      throw new Error("Array cardinality exceeds the host bound");
    }
    const id = arrays.length;
    arrays.push(items.slice());
    return id;
  };
  const internStringValue = (s: string): number => {
    if (typeof s !== "string") {
      throw new Error("String intern requires a string");
    }
    if (s.length > MAX_WASM_STRING_CHARS) {
      throw new Error("String intern exceeds the host char bound");
    }
    const existing = canonicalStringHandles.get(s);
    if (existing !== undefined) return existing;
    if (strings.length >= MAX_WASM_STRINGS) {
      throw new Error("String store exceeds the host bound");
    }
    const id = strings.length;
    strings.push(s);
    canonicalStringHandles.set(s, id);
    immutableStringHandles.add(id);
    return id;
  };
  const results: { tag: "ok" | "err"; value: number }[] = [];
  // Option values need their own registry. A raw i32 payload cannot carry presence: -1 is a
  // perfectly valid Int, so the old `Some(v) = v / None = -1` convention made Some(-1) absent.
  // `-1` remains the wire-level None value for compatibility; every Some is a non-negative
  // handle whose payload is stored here. Raw array access stays separate for counted loops.
  const options: OptionEntry[] = [];
  const optionHandles = new Map<string, number>();
  const moneys: { currency: string; amountStr: string }[] = [];
  const decimals: string[] = [];
  const internResult = (entry: { tag: "ok" | "err"; value: number }): number => {
    if (results.length >= MAX_WASM_HOST_RECORDS) {
      throw new Error("Result store exceeds the host bound");
    }
    const id = results.length;
    results.push({ tag: entry.tag, value: entry.value });
    return id;
  };
  const internOption = (entry: OptionEntry): number => {
    // Options are immutable value wrappers. Reuse the existing handle for an identical
    // payload so repeated transient Some values do not consume the host's lifetime bound.
    // Keep the payload ABI lane in the key; preserve the observable distinction between
    // Float +0 and -0. All accepted Float payloads are finite at their import boundary.
    const valueKey = entry.kind === "f64" && Object.is(entry.value, -0) ? "-0" : String(entry.value);
    const key = `${entry.kind}:${valueKey}`;
    const existing = optionHandles.get(key);
    if (existing !== undefined) return existing;
    if (options.length >= MAX_WASM_HOST_RECORDS) {
      throw new Error("Option store exceeds the host bound");
    }
    const id = options.length;
    options.push({ kind: entry.kind, value: entry.value });
    optionHandles.set(key, id);
    return id;
  };
  const internMoney = (currency: string, amountStr: string): number => {
    if (moneys.length >= MAX_WASM_HOST_RECORDS) {
      throw new Error("Money store exceeds the host bound");
    }
    const id = moneys.length;
    moneys.push({ currency, amountStr });
    return id;
  };
  const internDecimalValue = (text: string): number => {
    if (decimals.length >= MAX_WASM_HOST_RECORDS) {
      throw new Error("Decimal store exceeds the host bound");
    }
    const id = decimals.length;
    decimals.push(text);
    return id;
  };
  let memory: WebAssembly.Memory | null = null;
  // R6/R11 host value helpers. An unknown handle is a named trap, never "" / "0.00" / a default.
  const decimalAt = (h: number): string => {
    const text = decimals[h];
    if (text === undefined) throw new Error("UnknownDecimalHandle");
    return text;
  };
  const pushDecimal = (text: string): number => internDecimalValue(text);
  const moneyCtor = (currency: string, name: string, h: number): number => {
    const text = strings[h];
    if (text === undefined) throw new Error("MalformedMoneyAmount");
    const minor = HOST_MONEY_MINOR_UNITS.get(currency);
    if (minor === undefined) throw new Error("UnknownCurrency");
    const admitted = admitMoneyAmount(text, minor);
    if (!admitted.ok) throw new Error(admitted.trap);
    const id = internMoney(currency, admitted.amount);
    return tap(name, [h], id) as number;
  };
  // RD-0389: host bump pointer for records STAGED to pass in (allocRecord), based at the same
  // WAT_HEAP_BASE the emitter allocates from. Monotone for this host's lifetime — a fresh host per
  // scenario resets it, and it never overlaps a heap-free consuming flow (which makes no allocations).
  let recordBump = WAT_HEAP_BASE;
  // Host-side Array.range must not outrun guest linear memory or a work budget.
  // One WASM page is 65536 bytes = 16384 i32 words; that is the unbound default.
  const UNBOUND_GUEST_WORDS = 16_384;
  let rangeFuel = UNBOUND_GUEST_WORDS;
  // I/O sink — print/println route through the observer's capture when one is wired (the governed,
  // auditable path a DSS supervisor supplies); otherwise dev fallback to console.log. With an observer
  // present nothing hits the ambient console — a supervisor/test sees exactly what the module emitted.
  const outputSink: (s: string) => void = (s) => {
    if (observe?.onOutput) observe.onOutput(s);
    else console.log(s);
  };

  const tap = (name: string, args: number[], ret: number | undefined): number | undefined => {
    observe?.onHostCall?.(name, args, ret);
    return ret;
  };

  const admittedString = (handle: number): string => {
    const value = strings[handle];
    if (value === undefined) {
      throw new Error(`unknown string handle ${handle} (fail-closed)`);
    }
    return value;
  };

  const optionEntry = (handle: number): OptionEntry => {
    if (handle === -1) throw new Error("cannot read Option payload from None (fail-closed)");
    const entry = options[handle];
    if (entry === undefined || !Number.isInteger(handle) || handle < 0) {
      throw new Error(`unknown Option handle ${handle} (fail-closed)`);
    }
    return entry;
  };

  const typedOptionEntry = (handle: number, kind: OptionKind): OptionEntry => {
    const entry = optionEntry(handle);
    if (entry.kind !== kind) {
      throw new Error(`Float64 Option payload kind mismatch: expected ${kind}, got ${entry.kind}`);
    }
    return entry;
  };

  const optionF64ValuesEqual = (left: number, right: number): boolean => {
    if (left === -1 && right === -1) return true;
    if (left === -1 || right === -1) {
      typedOptionEntry(left === -1 ? right : left, "f64");
      return false;
    }
    return typedOptionEntry(left, "f64").value === typedOptionEntry(right, "f64").value;
  };

  const optionOptionF64ValuesEqual = (left: number, right: number): boolean => {
    if (left === -1 && right === -1) return true;
    if (left === -1 || right === -1) {
      const inner = typedOptionEntry(left === -1 ? right : left, "i32").value;
      optionF64ValuesEqual(-1, inner);
      return false;
    }
    const leftInner = typedOptionEntry(left, "i32").value;
    const rightInner = typedOptionEntry(right, "i32").value;
    return optionF64ValuesEqual(leftInner, rightInner);
  };

  const deeplyNestedOptionF64ValuesEqual = (left: number, right: number, depth: number): boolean => {
    if (!Number.isInteger(depth) || depth < 3 || depth > MAX_OPTION_FLOAT_EQUALITY_DEPTH) {
      throw new Error(`Option<Float> equality depth is outside the host bound (${MAX_OPTION_FLOAT_EQUALITY_DEPTH})`);
    }
    const compare = (leftHandle: number, rightHandle: number, remaining: number): boolean => {
      if (remaining === 1) return optionF64ValuesEqual(leftHandle, rightHandle);
      if (leftHandle === -1 && rightHandle === -1) return true;
      if (leftHandle === -1 || rightHandle === -1) {
        const present = leftHandle === -1 ? rightHandle : leftHandle;
        const inner = typedOptionEntry(present, "i32").value;
        compare(-1, inner, remaining - 1);
        return false;
      }
      const leftInner = typedOptionEntry(leftHandle, "i32").value;
      const rightInner = typedOptionEntry(rightHandle, "i32").value;
      return compare(leftInner, rightInner, remaining - 1);
    };
    return compare(left, right, depth);
  };

  const internStringOptionFromHandle = (x: number): number => {
    const value = admittedString(x);
    if (value.length > MAX_WASM_STRING_CHARS) {
      throw new Error("String intern exceeds the host char bound");
    }
    const existingString = canonicalStringHandles.get(value);
    if (existingString !== undefined) {
      const existingOption = optionHandles.get(`i32:${String(existingString)}`);
      if (existingOption !== undefined) return existingOption;
      if (options.length >= MAX_WASM_HOST_RECORDS) {
        throw new Error("Option store exceeds the host bound");
      }
    } else {
      // Check both bounded stores before mutating either one.
      if (options.length >= MAX_WASM_HOST_RECORDS) {
        throw new Error("Option store exceeds the host bound");
      }
      if (strings.length >= MAX_WASM_STRINGS) {
        throw new Error("String store exceeds the host bound");
      }
    }
    const stableStringHandle = existingString ?? internStringValue(value);
    return internOption({ kind: "i32", value: stableStringHandle });
  };

  const stringArrayAt = (id: number): number[] => {
    const entry = arrays[id];
    if (!Number.isInteger(id) || id < 0 || entry === undefined) {
      throw new Error(`unknown array handle ${id} (fail-closed)`);
    }
    return entry;
  };

  const deepOptionEqualityImports: Record<string, (...a: number[]) => number> = {};
  for (let depth = 3; depth <= MAX_OPTION_FLOAT_EQUALITY_DEPTH; depth++) {
    const name = `__option_eq_f64_depth_${depth}_v2`;
    deepOptionEqualityImports[name] = (left: number, right: number) => tap(
      name,
      [left, right],
      deeplyNestedOptionF64ValuesEqual(left, right, depth) ? 1 : 0,
    ) as number;
  }

  const host: Record<string, (...a: number[]) => number | void> = {
    ...deepOptionEqualityImports,
    __array_create: () => {
      const id = internArrayItems([]);
      return tap("__array_create", [], id) as number;
    },
    __array_append: (id: number, item: number) => {
      if (!Number.isInteger(id) || id < 0 || id >= arrays.length) {
        throw new Error(`unknown array handle ${id} (fail-closed)`);
      }
      const arr = arrays[id];
      if (arr === undefined) {
        throw new Error(`unknown array handle ${id} (fail-closed)`);
      }
      if (arr.length >= MAX_WASM_ARRAY_ITEMS) {
        throw new Error("Array cardinality exceeds the host bound");
      }
      arr.push(item);
      // #145a: return the array handle so `arr = arr.append(x)` lowers cleanly.
      return tap("__array_append", [id, item], id) as number;
    },
    // #170 — index/length by CODE POINT (not UTF-16 unit), as a mutually-consistent
    // set with __str_length below, matching stdlib.ts charAt/length ([...s], codePointAt).
    // Char literals lower via codePointAt in the emitter, so this keeps `charAt(i) == 'x'`
    // correct for non-BMP chars. ASCII is unaffected (code point == code unit).
    __str_char_at: (strHandle: number, idx: number) => {
      const cps = [...(strings[strHandle] ?? "")];
      const code = idx >= 0 && idx < cps.length ? (cps[idx]!.codePointAt(0) ?? -1) : -1;
      return tap("__str_char_at", [strHandle, idx], code) as number;
    },
    __str_count: (strHandle: number) => {
      const n = [...(strings[strHandle] ?? "")].length;
      return tap("__str_count", [strHandle], n) as number;
    },
    __int_to_str: (n: number) => {
      const id = internStringValue(String(n | 0));
      return tap("__int_to_str", [n], id) as number;
    },
    __float_to_str: (n: number) => {
      if (!Number.isFinite(n)) throw new Error("NonFiniteFloat");
      const id = internStringValue(String(n));
      return tap("__float_to_str", [n], id) as number;
    },
    __result_ok: (value: number) => {
      const id = internResult({ tag: "ok", value });
      return tap("__result_ok", [value], id) as number;
    },
    __result_err: (value: number) => {
      const id = internResult({ tag: "err", value });
      return tap("__result_err", [value], id) as number;
    },
    // #164 — read a Result handle's discriminant + payload, so `match r { Ok(v) => …,
    // Err(e) => … }` can dispatch and bind in WASM. tag: Ok→0, Err→1 (unknown handle→1).
    __result_tag: (h: number) => tap("__result_tag", [h], results[h]?.tag === "ok" ? 0 : 1) as number,
    __result_value: (h: number) => tap("__result_value", [h], results[h]?.value ?? 0) as number,

    // ── #145 host stdlib completion (matches src/stdlib.ts + interpreter semantics) ──
    // Option/Result boundary: None is encoded as -1; Some is a handle into the option registry.
    // Raw array access remains a separate bridge because for-in lowering needs element values,
    // including negative integers, rather than an Option wrapper.
    __str_concat: (a: number, b: number) => {
      const id = internStringValue((strings[a] ?? "") + (strings[b] ?? ""));
      return tap("__str_concat", [a, b], id) as number;
    },
    __str_length: (h: number) => tap("__str_length", [h], [...(strings[h] ?? "")].length) as number, // #170: code-point length (consistent with __str_count/__str_char_at)
    __str_eq: (a: number, b: number) => tap("__str_eq", [a, b], (strings[a] ?? "") === (strings[b] ?? "") ? 1 : 0) as number,
    // Ordered comparison is by UTF-16 CODE UNIT value, never by opaque handle
    // identity or locale. Unknown handles trap instead of becoming the empty
    // string, because an ordering guard that accepts an unbound handle is a
    // canonicalization fail-open.
    __str_compare: (a: number, b: number) => tap(
      "__str_compare",
      [a, b],
      compareUtf16CodeUnits(admittedString(a), admittedString(b)),
    ) as number,
    // #162 — String methods (mirror src/stdlib.ts EXACTLY for byte-parity; note slice/
    // indexOf are UTF-16 in stdlib while charAt/length are code-point — replicate as-is).
    __str_starts_with: (h: number, p: number) => tap("__str_starts_with", [h, p], (strings[h] ?? "").startsWith(strings[p] ?? "") ? 1 : 0) as number,
    __str_ends_with: (h: number, p: number) => tap("__str_ends_with", [h, p], (strings[h] ?? "").endsWith(strings[p] ?? "") ? 1 : 0) as number,
    __str_contains: (h: number, p: number) => tap("__str_contains", [h, p], (strings[h] ?? "").includes(strings[p] ?? "") ? 1 : 0) as number,
    __str_index_of: (h: number, p: number) => tap("__str_index_of", [h, p], (strings[h] ?? "").indexOf(strings[p] ?? "")) as number,
    __str_to_lower: (h: number) => { const id = internStringValue((strings[h] ?? "").toLowerCase()); return tap("__str_to_lower", [h], id) as number; },
    __str_to_upper: (h: number) => { const id = internStringValue((strings[h] ?? "").toUpperCase()); return tap("__str_to_upper", [h], id) as number; },
    __str_trim: (h: number) => { const id = internStringValue((strings[h] ?? "").trim()); return tap("__str_trim", [h], id) as number; },
    __str_slice: (h: number, start: number, end: number) => { const id = internStringValue((strings[h] ?? "").slice(start, end)); return tap("__str_slice", [h, start, end], id) as number; },
    // #162/#169 — Char.toUpper/toLower return a Char (code point), not a String handle.
    __char_to_upper: (code: number) => tap("__char_to_upper", [code], code >= 0 ? (String.fromCodePoint(code).toUpperCase().codePointAt(0) ?? code) : code) as number,
    __char_to_lower: (code: number) => tap("__char_to_lower", [code], code >= 0 ? (String.fromCodePoint(code).toLowerCase().codePointAt(0) ?? code) : code) as number,
    __str_to_int: (h: number) => {
      const n = parseInt(strings[h] ?? "", 10);
      return tap("__str_to_int", [h], Number.isNaN(n) ? -1 : n) as number; // Option<Int>: -1 = None
    },
    __str_to_int_option_v2: (h: number) => {
      const n = parseInt(strings[h] ?? "", 10);
      const option = Number.isNaN(n) ? -1 : internOption({ kind: "i32", value: n | 0 });
      return tap("__str_to_int_option_v2", [h], option) as number;
    },
    // Char.fromCode (RD-0528 step 1) — Int -> Char. A Char IS its code point i32, so the VALUE is
    // the argument unchanged; this exists for the REFUSAL, not the conversion. stdlib.ts:1961-1963
    // calls String.fromCodePoint with no range check, so the interpreter THROWS on a negative or
    // > 0x10FFFF code point. Calling it here the same way mirrors that exactly (§313: mirror stdlib
    // for byte-parity) and the throw surfaces as a WASM trap — fault-parity by construction rather
    // than by re-deriving the range rule. Lowering it as a bare identity in the emitter would have
    // been a fail-OPEN: WASM would silently accept a code point the interpreter refuses.
    __char_from_code: (code: number) => {
      String.fromCodePoint(code);                       // throws RangeError on an invalid code point
      return tap("__char_from_code", [code], code) as number;
    },
    // Char ops — a char is its code point i32 (see __str_char_at). Mirrors stdlib.ts.
    __char_is_letter: (code: number) =>
      tap("__char_is_letter", [code], code >= 0 && /\p{L}/u.test(String.fromCodePoint(code)) ? 1 : 0) as number,
    __char_is_digit: (code: number) =>
      tap("__char_is_digit", [code], code >= 48 && code <= 57 ? 1 : 0) as number,
    // #169 — Char classifiers (mirror stdlib.ts isUpper/isLower/isWhitespace exactly).
    __char_is_upper: (code: number) => {
      if (code < 0) return tap("__char_is_upper", [code], 0) as number;
      const ch = String.fromCodePoint(code);
      return tap("__char_is_upper", [code], ch === ch.toUpperCase() && ch !== ch.toLowerCase() ? 1 : 0) as number;
    },
    __char_is_lower: (code: number) => {
      if (code < 0) return tap("__char_is_lower", [code], 0) as number;
      const ch = String.fromCodePoint(code);
      return tap("__char_is_lower", [code], ch === ch.toLowerCase() && ch !== ch.toUpperCase() ? 1 : 0) as number;
    },
    __char_is_whitespace: (code: number) =>
      tap("__char_is_whitespace", [code], code >= 0 && /\s/.test(String.fromCodePoint(code)) ? 1 : 0) as number,
    __char_to_string: (code: number) => {
      const id = internStringValue(code >= 0 ? String.fromCodePoint(code) : "");
      return tap("__char_to_string", [code], id) as number;
    },
    // Array ops — raw handles/indexing. Out-of-range / empty ⇒ -1 for the legacy raw bridge.
    __array_get: (id: number, i: number) => {
      const a = arrays[id] ?? [];
      return tap("__array_get", [id, i], i >= 0 && i < a.length ? a[i]! : -1) as number;
    },
    __array_length: (id: number) => tap("__array_length", [id], (arrays[id] ?? []).length) as number,
    __array_contains: (id: number, x: number) => tap("__array_contains", [id, x], (arrays[id] ?? []).includes(x) ? 1 : 0) as number,
    // Value-based membership for Array<String> — compares interned string VALUES, not
    // handles (equal strings may have distinct handles). Needed for keyword-table lookup.
    __array_contains_str: (id: number, sh: number) => {
      const needle = strings[sh] ?? "";
      const found = (arrays[id] ?? []).some((h) => (strings[h] ?? "") === needle) ? 1 : 0;
      return tap("__array_contains_str", [id, sh], found) as number;
    },
    __array_first: (id: number) => { const a = arrays[id] ?? []; return tap("__array_first", [id], a.length > 0 ? a[0]! : -1) as number; },
    __array_last: (id: number) => { const a = arrays[id] ?? []; return tap("__array_last", [id], a.length > 0 ? a[a.length - 1]! : -1) as number; },
    // Option-producing array accessors keep a present negative element distinct from absence.
    __array_get_option_v2: (id: number, i: number) => {
      const a = arrays[id] ?? [];
      const option = i >= 0 && i < a.length ? internOption({ kind: "i32", value: a[i]! | 0 }) : -1;
      return tap("__array_get_option_v2", [id, i], option) as number;
    },
    __array_get_option_string_v2: (id: number, i: number) => {
      const a = stringArrayAt(id);
      const option = i >= 0 && i < a.length ? internStringOptionFromHandle(a[i]!) : -1;
      return tap("__array_get_option_string_v2", [id, i], option) as number;
    },
    __array_first_option_v2: (id: number) => {
      const a = arrays[id] ?? [];
      const option = a.length > 0 ? internOption({ kind: "i32", value: a[0]! | 0 }) : -1;
      return tap("__array_first_option_v2", [id], option) as number;
    },
    __array_first_option_string_v2: (id: number) => {
      const a = stringArrayAt(id);
      const option = a.length > 0 ? internStringOptionFromHandle(a[0]!) : -1;
      return tap("__array_first_option_string_v2", [id], option) as number;
    },
    __array_last_option_v2: (id: number) => {
      const a = arrays[id] ?? [];
      const option = a.length > 0 ? internOption({ kind: "i32", value: a[a.length - 1]! | 0 }) : -1;
      return tap("__array_last_option_v2", [id], option) as number;
    },
    __array_last_option_string_v2: (id: number) => {
      const a = stringArrayAt(id);
      const option = a.length > 0 ? internStringOptionFromHandle(a[a.length - 1]!) : -1;
      return tap("__array_last_option_string_v2", [id], option) as number;
    },
    __str_char_at_option_v2: (strHandle: number, idx: number) => {
      const cps = [...(strings[strHandle] ?? "")];
      const code = idx >= 0 && idx < cps.length ? (cps[idx]!.codePointAt(0) ?? -1) : -1;
      const option = code >= 0 ? internOption({ kind: "i32", value: code | 0 }) : -1;
      return tap("__str_char_at_option_v2", [strHandle, idx], option) as number;
    },
    // Legacy Option helpers retain the original raw-sentinel ABI for already-built modules.
    __unwrap_or: (opt: number, def: number) => tap("__unwrap_or", [opt, def], opt >= 0 ? opt : def) as number,
    __option_some: (x: number) => tap("__option_some", [x], x) as number,
    __option_none: () => tap("__option_none", [], -1) as number,
    // Versioned registry helpers separate presence from payload for new compiler output. The distinct
    // import names are an ABI binding: a pre-repair module cannot accidentally run against this layout.
    __unwrap_or_v2: (opt: number, def: number) => tap("__unwrap_or_v2", [opt, def], opt === -1 ? def : typedOptionEntry(opt, "i32").value) as number,
    __option_some_v2: (x: number) => {
      const handle = internOption({ kind: "i32", value: x | 0 });
      return tap("__option_some_v2", [x], handle) as number;
    },
    // String payloads are values, not caller-owned string-slot identities. Snapshot
    // their current contents into the immutable canonical string store before the
    // Option is retained, so later host reseeding cannot mutate an existing Some.
    __option_some_string_v2: (x: number) => {
      const handle = internStringOptionFromHandle(x);
      return tap("__option_some_string_v2", [x], handle) as number;
    },
    __option_none_v2: () => tap("__option_none_v2", [], -1) as number,
    __option_eq_f64_v2: (left: number, right: number) => {
      return tap("__option_eq_f64_v2", [left, right], optionF64ValuesEqual(left, right) ? 1 : 0) as number;
    },
    __option_eq_option_f64_v2: (left: number, right: number) => {
      return tap("__option_eq_option_f64_v2", [left, right], optionOptionF64ValuesEqual(left, right) ? 1 : 0) as number;
    },
    __option_is_some_v2: (opt: number) => tap("__option_is_some_v2", [opt], opt === -1 ? 0 : (optionEntry(opt), 1)) as number,
    __option_is_none_v2: (opt: number) => tap("__option_is_none_v2", [opt], opt === -1 ? 1 : (optionEntry(opt), 0)) as number,
    __option_value_v2: (opt: number) => tap("__option_value_v2", [opt], typedOptionEntry(opt, "i32").value) as number,
    // Float64 Option helpers keep the payload as f64. They use distinct import
    // names so an i32 Option handle cannot be read through the wrong ABI lane.
    __option_some_f64_v2: (x: number) => {
      if (!Number.isFinite(x)) throw new Error("NonFiniteFloat");
      const handle = internOption({ kind: "f64", value: x });
      return tap("__option_some_f64_v2", [x], handle) as number;
    },
    __option_value_f64_v2: (opt: number) => tap(
      "__option_value_f64_v2", [opt], typedOptionEntry(opt, "f64").value,
    ) as number,
    __unwrap_or_f64_v2: (opt: number, def: number) => {
      if (!Number.isFinite(def)) throw new Error("NonFiniteFloat");
      return tap(
        "__unwrap_or_f64_v2", [opt, def], opt === -1 ? def : typedOptionEntry(opt, "f64").value,
      ) as number;
    },

    // ── Money currency constructors (ISO 4217) ───────────────────────────────
    // Each accepts a string handle (the amount) and returns a Money handle (i32 index into the moneys
    // registry). R11 (zero-trust): the amount must be canonical Decimal text with at most the currency's
    // minor units (JPY 0). It is stored padded to exactly the minor units. An unknown string handle, a
    // malformed amount or excess scale is a named trap: never a "0.00" default and never a rounding.
    __money_gbp: (h: number) => moneyCtor("GBP", "__money_gbp", h),
    __money_eur: (h: number) => moneyCtor("EUR", "__money_eur", h),
    __money_usd: (h: number) => moneyCtor("USD", "__money_usd", h),
    __money_chf: (h: number) => moneyCtor("CHF", "__money_chf", h),
    __money_jpy: (h: number) => moneyCtor("JPY", "__money_jpy", h),
    __money_cad: (h: number) => moneyCtor("CAD", "__money_cad", h),
    __money_aud: (h: number) => moneyCtor("AUD", "__money_aud", h),
    __money_nzd: (h: number) => moneyCtor("NZD", "__money_nzd", h),
    __money_sgd: (h: number) => moneyCtor("SGD", "__money_sgd", h),
    __money_hkd: (h: number) => moneyCtor("HKD", "__money_hkd", h),

    // ── I/O ──────────────────────────────────────────────────────────────────
    // print(strHandle) / println(strHandle): emit the interned string to the
    // observer's output sink (or to console.log as a fallback in dev). Returns 0.
    __print:   (h: number) => { outputSink(strings[h] ?? "");       return tap("__print",   [h], 0) as number; },
    __println: (h: number) => { outputSink((strings[h] ?? "") + "\n"); return tap("__println", [h], 0) as number; },

    // ── Privacy ───────────────────────────────────────────────────────────────
    // redact(strHandle): returns a redacted-sentinel handle. The sentinel value
    // -2 is distinct from -1 (None) and from any valid string/array handle (≥0).
    // Consumers should treat any negative value as opaque in this context.
    __redact: (h: number) => tap("__redact", [h], -2) as number,

    // ── Collections ──────────────────────────────────────────────────────────
    // range(lo, hi): returns an Array<Int> handle containing [lo, lo+1, … hi-1].
    // Mirrors stdlib.ts Array.range (exclusive upper bound, step 1).
    __range: (lo: number, hi: number) => {
      const from = lo | 0;
      const to = hi | 0;
      if (!Number.isSafeInteger(from) || !Number.isSafeInteger(to)) {
        throw new Error("Array.range: bounds are not a finite progressing interval");
      }
      if (arrays.length >= MAX_WASM_ARRAYS) {
        throw new Error("Array store exceeds the host bound");
      }
      if (to <= from) {
        const id = internArrayItems([]);
        return tap("__range", [lo, hi], id) as number;
      }
      const count = to - from;
      if (!Number.isSafeInteger(count) || count < 0 || count > MAX_WASM_ARRAY_ITEMS) {
        throw new Error("Array.range: cardinality exceeds the host bound");
      }
      const guestWords = memory !== null
        ? readWasmWordView(memory).wordLength
        : UNBOUND_GUEST_WORDS;
      if (count > guestWords) {
        throw new Error("Array.range: cardinality exceeds guest memory");
      }
      if (count > rangeFuel) {
        throw new Error("Array.range: fuel exhausted");
      }
      const items: number[] = [];
      for (let i = from; i < to; i++) items.push(i);
      const id = internArrayItems(items);
      rangeFuel -= count;
      return tap("__range", [lo, hi], id) as number;
    },

    __decimal_from_str: (h: number) => {
      const text = strings[h];
      if (text === undefined) throw new Error("MalformedDecimal");
      const parsed = parseDec(text);
      if (!parsed.ok) throw new Error(parsed.trap);
      const id = internDecimalValue(text);
      return tap("__decimal_from_str", [h], id) as number;
    },
    __decimal_to_str: (h: number) => {
      const text = decimalAt(h);
      const id = internStringValue(text);
      return tap("__decimal_to_str", [h], id) as number;
    },
    __decimal_add: (a: number, b: number) =>
      tap("__decimal_add", [a, b], pushDecimal(hostDecOrThrow(decAdd(decimalAt(a), decimalAt(b))))) as number,
    __decimal_sub: (a: number, b: number) =>
      tap("__decimal_sub", [a, b], pushDecimal(hostDecOrThrow(decSub(decimalAt(a), decimalAt(b))))) as number,
    __decimal_mul: (a: number, b: number) =>
      tap("__decimal_mul", [a, b], pushDecimal(hostDecOrThrow(decMul(decimalAt(a), decimalAt(b))))) as number,
    __decimal_neg: (h: number) =>
      tap("__decimal_neg", [h], pushDecimal(hostDecOrThrow(decNeg(decimalAt(h))))) as number,
    __decimal_compare: (a: number, b: number) => {
      const cmp = decCompare(decimalAt(a), decimalAt(b));
      if (typeof cmp !== "number") throw new Error(cmp);
      return tap("__decimal_compare", [a, b], cmp) as number;
    },
    __decimal_div: (a: number, b: number, scale: number, modeHandle: number) => {
      const mode = strings[modeHandle];
      if (mode === undefined) throw new Error("MissingRoundMode");
      const r = hostDecOrThrow(decDiv(decimalAt(a), decimalAt(b), scale, mode));
      return tap("__decimal_div", [a, b, scale, modeHandle], pushDecimal(r)) as number;
    },
    __decimal_rem: (a: number, b: number) =>
      tap("__decimal_rem", [a, b], pushDecimal(hostDecOrThrow(decRem(decimalAt(a), decimalAt(b))))) as number,
    // R9: exact Int -> Decimal (scale 0). An i32 is always a safe integer, so this never rounds.
    __decimal_from_int: (n: number) =>
      tap("__decimal_from_int", [n], pushDecimal(hostDecOrThrow(decFromInt(n)))) as number,
  };

  // Sanctioned effect grants: explicit, per-admission, deny-by-default. Canonical effect
  // keys grant every ABI import implementing that effect; an explicit import-name key may
  // override one import to preserve callers that intentionally grant aliases separately.
  // The stdlib bridge can never be shadowed by a grant — bridge names win.
  const grantAbiEffects = new Set(WASM_EFFECT_GRANT_ABI.map((entry) => entry.effect));
  const grantAbiNames = new Set(WASM_EFFECT_GRANT_ABI.map((entry) => entry.name));
  const effectHandlers = grants?.effectHandlers ?? {};
  // Snapshot own enumerable grant entries once: inherited properties are not authority,
  // and accessor-backed values must not change between validation and installation.
  const validatedEffectHandlers = new Map(Object.entries(effectHandlers));
  for (const [grantName, fn] of validatedEffectHandlers) {
    if (!grantAbiEffects.has(grantName) && !grantAbiNames.has(grantName)) {
      throw makeEffectGrantDiag(`effect grant '${grantName}' is not in the closed non-secret WASM effect-grant ABI [${[...new Set([...grantAbiEffects, ...grantAbiNames])].join(", ")}]`);
    }
    if (typeof fn !== "function") {
      throw makeEffectGrantDiag(`effect grant '${grantName}' handler is not a function`);
    }
  }
  for (const abi of WASM_EFFECT_GRANT_ABI) {
    if (Object.prototype.hasOwnProperty.call(host, abi.name)) continue;
    const fn = validatedEffectHandlers.get(abi.name) ?? validatedEffectHandlers.get(abi.effect);
    if (!fn) continue;
    host[abi.name] = typeEffectGrantHandler(abi, (a: number, b: number) =>
      tap(abi.name, [a, b], fn(a, b)) as number,
    );
  }

  // Kept out of the public HostRuntime surface. The admission wrapper receives this
  // closure from a WeakMap, so guest-controlled code cannot substitute registry readers.
  const copyOwnedReturn: OwnedReturnCopier = (rootShape, rootValue) => {
    if (memory === null) refuseHostCopy("cannot snapshot before admitted memory is bound");
    const { view, wordLength } = readWasmWordView(memory);
    const visiting = new Set<string>();
    const nodes = { count: 0 };
    const visit = (shape: OwnedReturnShape, value: number, depth: number): unknown => {
      if (depth > MAX_RECORD_COPY_DEPTH) refuseHostCopy(`snapshot exceeds depth ${MAX_RECORD_COPY_DEPTH}`);
      nodes.count += 1;
      if (nodes.count > MAX_RECORD_COPY_NODES) refuseHostCopy("snapshot exceeds node bound");
      if (!WASM_NUMBER_IS_INTEGER(value) || value < -0x8000_0000 || value > 0x7fff_ffff) {
        refuseHostCopy("snapshot contains a non-i32 registry value");
      }
      if (shape.kind === "i32") return value;
      if (shape.kind === "record") {
        if (!WASM_NUMBER_IS_SAFE_INTEGER(value) || value < WAT_HEAP_BASE || (value & 3) !== 0) {
          refuseHostCopy("record pointer is not aligned inside the guest heap");
        }
        const identity = `record:${value}`;
        if (visiting.has(identity)) refuseHostCopy("snapshot contains a record cycle");
        const start = value >>> 2;
        if (wordLength - start < shape.fields.length) refuseHostCopy("record extends beyond guest memory");
        visiting.add(identity);
        try {
          const row: unknown[] = [];
          for (let index = 0; index < shape.fields.length; index += 1) {
            WASM_OBJECT_DEFINE_PROPERTY(
              row,
              String(index),
              safeDataPropertyDescriptor(visit(shape.fields[index]!, view[start + index]!, depth + 1), false, true, false),
            );
          }
          return WASM_OBJECT_FREEZE(row);
        } finally {
          visiting.delete(identity);
        }
      }
      if (shape.kind === "array") {
        const items = arrays[value];
        if (items === undefined || value < 0) refuseHostCopy("unknown array registry handle");
        const identity = `array:${value}`;
        if (visiting.has(identity)) refuseHostCopy("snapshot contains an array cycle");
        if (items.length > MAX_WASM_ARRAY_ITEMS) refuseHostCopy("array exceeds host cardinality bound");
        visiting.add(identity);
        try {
          const copied: unknown[] = [];
          for (let index = 0; index < items.length; index += 1) {
            WASM_OBJECT_DEFINE_PROPERTY(
              copied,
              String(index),
              safeDataPropertyDescriptor(visit(shape.element, items[index]!, depth + 1), false, true, false),
            );
          }
          return WASM_OBJECT_FREEZE(copied);
        } finally {
          visiting.delete(identity);
        }
      }
      const entry = results[value];
      if (entry === undefined || value < 0) refuseHostCopy("unknown Result registry handle");
      const identity = `result:${value}`;
      if (visiting.has(identity)) refuseHostCopy("snapshot contains a Result cycle");
      visiting.add(identity);
      try {
        return WASM_OBJECT_FREEZE({
          tag: entry.tag,
          value: visit(entry.tag === "ok" ? shape.ok : shape.err, entry.value, depth + 1),
        });
      } finally {
        visiting.delete(identity);
      }
    };
    return visit(rootShape, rootValue, 0);
  };

  const refuseQuarantinedRuntime = (operation: string): void => {
    if (admissionLifecycle.state === "quarantined") {
      throw new Error(`FUNGI-WASM-QUARANTINED-001: ${operation} refused after host-runtime quarantine`);
    }
  };
  const guardedImports: Record<string, (...args: number[]) => number | void> = Object.create(null);
  for (const [name, handler] of Object.entries(host)) {
    guardedImports[name] = (...args: number[]) => {
      refuseQuarantinedRuntime(`host import ${name}`);
      return WASM_REFLECT_APPLY(handler, host, args) as number | void;
    };
  }
  const runtime: HostRuntime = {
    imports: Object.freeze({ host: Object.freeze(guardedImports) }),
    internString(s: string): number {
      return internStringValue(s);
    },
    seedString(handle: number, s: string): void {
      if (!Number.isInteger(handle) || handle < 0 || handle >= MAX_WASM_STRINGS) {
        throw new Error(`unknown string handle ${handle} (fail-closed)`);
      }
      if (typeof s !== "string") {
        throw new Error("String intern requires a string");
      }
      if (s.length > MAX_WASM_STRING_CHARS) {
        throw new Error("String intern exceeds the host char bound");
      }
      while (strings.length < handle) {
        strings.push("");
      }
      if (handle === strings.length) {
        strings.push(s);
      } else {
        if (immutableStringHandles.has(handle)) {
          throw new Error(`cannot overwrite immutable interned string handle ${handle}`);
        }
        strings[handle] = s;
      }
    },
    readString(handle: number) { return strings[handle]; },
    readArray(handle: number) {
      const stored = arrays[handle];
      return stored === undefined ? undefined : Object.freeze(stored.slice());
    },
    readResult(handle: number) {
      const stored = results[handle];
      return stored === undefined ? undefined : { tag: stored.tag, value: stored.value };
    },
    readOption(handle: number) { return handle === -1 ? { tag: "none" } : { tag: "some", value: optionEntry(handle).value }; },
    readMoney(handle: number) {
      const stored = moneys[handle];
      return stored === undefined ? undefined : { currency: stored.currency, amountStr: stored.amountStr };
    },
    readDecimal(handle: number) { return decimals[handle]; },
    internDecimal(text: string): number {
      const parsed = parseDec(text);
      if (!parsed.ok) throw new Error(parsed.trap);
      return internDecimalValue(text);
    },
    bindMemory(m: WebAssembly.Memory) {
      if (admissionLifecycle.state === "quarantined") {
        throw new Error("cannot bind memory on a quarantined host runtime");
      }
      if (admissionLifecycle.state === "admitting" && !admissionLifecycle.internalBindPermit) {
        throw new Error("cannot externally bind memory while host admission is in progress");
      }
      if (admissionLifecycle.state === "admitted" && memory === null) {
        throw new Error("cannot add memory after host admission");
      }
      if (admissionLifecycle.state === "admitted" && memory !== m) {
        throw new Error("cannot change memory after host admission");
      }
      if (memory !== null && memory !== m) {
        throw new Error("host runtime memory binding is immutable");
      }
      if (admissionLifecycle.state === "ready") {
        admissionLifecycle.memoryBoundBeforeAdmission = true;
      }
      const nextRangeFuel = readWasmWordView(m).wordLength;
      memory = m;
      rangeFuel = nextRangeFuel;
    },
    readRecordField(ptr: number, slot: number): number {
      refuseGuestMemoryDuringCall("readRecordField");
      if (memory === null) throw new Error("readRecordField before bindMemory");
      return readWasmWordView(memory).view[(ptr >>> 2) + slot] ?? 0;
    },
    internArray(items: readonly number[]): number {
      if (items.length > MAX_WASM_ARRAY_ITEMS) {
        throw new Error("Array cardinality exceeds the host bound");
      }
      return internArrayItems(items.map((x) => x | 0));
    },
    copyArrayRecords(handle: number, fieldCount: number): readonly (readonly number[])[] {
      refuseGuestMemoryDuringCall("copyArrayRecords");
      if (memory === null) {
        throw new Error("FUNGI-WASM-HOST-001: copyArrayRecords before bindMemory");
      }
      if (!Number.isInteger(fieldCount) || fieldCount < 1 || fieldCount > MAX_COPIED_RECORD_WORDS) {
        throw new Error(`FUNGI-WASM-HOST-001: fieldCount=${String(fieldCount)}`);
      }
      const stored = arrays[handle];
      if (stored === undefined || !Number.isInteger(handle) || handle < 0) {
        throw new Error(`FUNGI-WASM-HOST-001: unknown array handle ${String(handle)}`);
      }
      const ptrs = stored.slice();
      const totalWords = ptrs.length * fieldCount;
      if (totalWords > MAX_WASM_ARRAY_ITEMS) {
        throw new Error(`FUNGI-WASM-HOST-001: copied words ${totalWords} exceed host bound`);
      }
      const { view, wordLength } = readWasmWordView(memory);
      for (const ptr of ptrs) {
        if (!Number.isSafeInteger(ptr) || ptr < WAT_HEAP_BASE || (ptr & 3) !== 0) {
          throw new Error(`FUNGI-WASM-HOST-001: record pointer ${String(ptr)} is not an aligned heap record`);
        }
        const start = ptr >>> 2;
        if (start < 0 || wordLength - start < fieldCount) {
          throw new Error("FUNGI-WASM-HOST-001: short memory for array-of-record copy");
        }
      }
      const out: number[][] = [];
      for (const ptr of ptrs) {
        const start = ptr >>> 2;
        const fields: number[] = [];
        for (let i = 0; i < fieldCount; i++) fields.push(view[start + i]!);
        out.push(fields);
      }
      return Object.freeze(out.map((row) => Object.freeze(row)));
    },
    copyArrayRecordsLayout(handle: number, fields: readonly RecordCopyField[]): readonly unknown[] {
      refuseGuestMemoryDuringCall("copyArrayRecordsLayout");
      if (memory === null) refuseHostCopy("copyArrayRecordsLayout before bindMemory");
      admitCopyFields(fields, 0);
      const stored = arrays[handle];
      if (stored === undefined || !Number.isInteger(handle) || handle < 0) {
        refuseHostCopy(`unknown array handle ${String(handle)}`);
      }
      const ptrs = stored.slice();
      const { view, wordLength } = readWasmWordView(memory);
      const nodes = { count: 0 };
      const out: unknown[] = [];
      for (const ptr of ptrs) {
        out.push(copyGuestRecord(view, wordLength, ptr, fields, 0, new Set(), nodes));
      }
      return Object.freeze(out.map((row) => freezeCopyRow(row as unknown[])));
    },
    allocRecord(fields: readonly number[]): number {
      refuseGuestMemoryDuringCall("allocRecord");
      if (memory === null) throw new Error("allocRecord before bindMemory — instantiate the module first (fail-closed)");
      if (fields.length === 0) throw new Error("allocRecord: a record must have ≥1 field (fail-closed)");
      const { view: words, wordLength } = readWasmWordView(memory);
      const start = recordBump >>> 2;
      // Bounds-check BEFORE any write — a staged record that would spill past linear memory traps at
      // construction rather than corrupting memory or silently truncating (RD-0389 §5 fail-closed).
      if (start + fields.length > wordLength) {
        throw new Error("allocRecord: record staging overflowed linear memory (fail-closed)");
      }
      for (let i = 0; i < fields.length; i++) words[start + i] = fields[i]! | 0;
      const ptr = recordBump;
      recordBump += fields.length * WAT_REC_FIELD_SIZE;
      return ptr;
    },
    snapshotMemory(): Uint8Array | null {
      refuseGuestMemoryDuringCall("snapshotMemory");
      if (memory === null) return null;
      return copyWasmMemorySnapshot(memory);
    },
  };
  for (const [name, operation] of Object.entries(runtime)) {
    if (name === "imports" || typeof operation !== "function") continue;
    Object.defineProperty(runtime, name, {
      value: (...args: unknown[]) => {
        refuseQuarantinedRuntime(`host runtime operation ${name}`);
        return WASM_REFLECT_APPLY(operation, runtime, args);
      },
      enumerable: true,
      configurable: false,
      writable: false,
    });
  }
  FACTORY_HOST_RUNTIMES.set(runtime, admissionLifecycle);
  FACTORY_OWNED_RETURN_COPIERS.set(runtime, copyOwnedReturn);
  return Object.freeze(runtime);
}

// ─────────────────────────────────────────────────────────────────────────────
// The admission gate
// ─────────────────────────────────────────────────────────────────────────────

export interface AdmissionResult {
  readonly instance: WebAssembly.Instance;
  readonly host: HostRuntime;
  readonly hash: string;
}

/**
 * Admit and instantiate a wasm module. Verifies the attestation FIRST (fail-closed,
 * before host linking), then instantiates with ONLY the closed host import object.
 * A HostRuntime is single-admission: each admitted instance owns its host-side registries and
 * memory binding. A runtime is consumed by an admission attempt and quarantined on failure.
 * Throws `CRITICAL_SECURITY_VIOLATION: …` on rejection. The trusted `observe.onViolation`
 * callback may itself have effects; guest-import denial does not constrain that host callback.
 */
function snapshotWasmBytes(wasm: Uint8Array): Uint8Array {
  if (
    !(wasm instanceof Uint8Array)
    || Object.getPrototypeOf(wasm) !== Uint8Array.prototype
    || wasm.buffer instanceof SharedArrayBuffer
  ) {
    throw new Error("CRITICAL_SECURITY_VIOLATION: wasm bytes are not an exclusively owned Uint8Array");
  }
  return Uint8Array.from(wasm);
}

export async function admitAndInstantiate(opts: {
  wasm: Uint8Array;
  attestation: WasmAttestation | undefined;
  policy: AdmissionPolicy;
  host: HostRuntime;
  observe?: Observer;
  /** Optional per-export nested return layout for wrapped secret finalize. */
  returnLayouts?: Readonly<Record<string, readonly RecordCopyField[]>>;
  /** Require signed custom-section metadata for every public function result. */
  requireOwnedReturnSchemas?: boolean;
}): Promise<AdmissionResult> {
  // Capture once: callers may mutate options or expose a changing accessor while
  // compilation is pending. Validate and use this same identity throughout.
  const host = opts.host;
  const requireOwnedReturnSchemas = opts.requireOwnedReturnSchemas;
  if (requireOwnedReturnSchemas !== undefined && typeof requireOwnedReturnSchemas !== "boolean") {
    refuseHostCopy("strict owned-return policy must be a boolean");
  }
  const wasm = snapshotWasmBytes(opts.wasm);
  const ownedReturnSchemas = parseOwnedReturnSchemas(wasm);
  const capturedPolicy = snapshotAdmissionPolicy(opts.policy);
  if (capturedPolicy === undefined) {
    const reason = "invalid admission policy data shape";
    const hash = wasmHash(wasm);
    opts.observe?.onViolation?.(reason, wasm);
    throw new Error(`CRITICAL_SECURITY_VIOLATION: ${reason} (hash=${hash})`);
  }
  const ownedReturnRequiresSignature = requireOwnedReturnSchemas === true || ownedReturnSchemas !== undefined;
  const effectivePolicy = ownedReturnRequiresSignature
    ? Object.freeze({ ...capturedPolicy, requireSigned: true })
    : capturedPolicy;
  const verdict = verifyWasm(wasm, opts.attestation, effectivePolicy);
  if (!verdict.ok) {
    // Attestation First: dump state and refuse BEFORE any host function is linked.
    opts.observe?.onViolation?.(verdict.reason ?? "attestation failed", wasm);
    throw new Error(`CRITICAL_SECURITY_VIOLATION: ${verdict.reason ?? "attestation failed"} (hash=${verdict.hash})`);
  }
  if (wasmHash(wasm) !== verdict.hash) {
    throw new Error("CRITICAL_SECURITY_VIOLATION: admitted bytes changed before instantiate");
  }
  const lifecycle = FACTORY_HOST_RUNTIMES.get(host);
  if (lifecycle === undefined) {
    const reason = "host runtime was not created by createHostRuntime";
    opts.observe?.onViolation?.(reason, wasm);
    throw new Error(`CRITICAL_SECURITY_VIOLATION: ${reason} (hash=${verdict.hash})`);
  }
  if (lifecycle.state !== "ready" || lifecycle.memoryBoundBeforeAdmission) {
    const reason = "host runtime is already claimed or consumed, or was pre-bound outside admission";
    opts.observe?.onViolation?.(reason, wasm);
    throw new Error(`CRITICAL_SECURITY_VIOLATION: ${reason} (hash=${verdict.hash})`);
  }
  // Claim synchronously before the first await or any guest-controlled layout access. A
  // concurrent or re-entrant admission cannot observe/share this host's mutable registries.
  lifecycle.state = "admitting";
  // Instantiate with ONLY the closed host import object. A LinkError here means the
  // module declared a host import the closed set does NOT provide — i.e. it tried to
  // reach a capability outside its grant. Fail CLOSED: classify it as a CRITICAL
  // security violation (fire onViolation, then throw) rather than leaking a raw
  // LinkError that a caller might mistake for an ordinary runtime fault (#105).
  let wasmResult: unknown;
  let returnLayouts: Readonly<Record<string, readonly RecordCopyField[]>> | undefined;
  const effectGate = { active: false, startupImportAttempted: false, quarantined: false };
  try {
    // Capture caller-controlled copy/wipe policy synchronously before compilation yields.
    returnLayouts = snapshotReturnLayouts(opts.returnLayouts);
    if (ownedReturnSchemas !== undefined && returnLayouts !== undefined && Object.keys(returnLayouts).length > 0) {
      refuseHostCopy("attested metadata cannot be combined with caller-supplied legacy layouts");
    }
    const compiled = await WebAssembly.compile(wasm as Uint8Array<ArrayBuffer>);
    const moduleExports = WebAssembly.Module.exports(compiled);
    const publicFunctions = moduleExports
      .filter((entry) => entry.kind === "function" && !SECRET_HELPER_EXPORTS.has(entry.name));
    if (requireOwnedReturnSchemas === true && ownedReturnSchemas === undefined) {
      refuseHostCopy("strict admission requires attested owned-return metadata");
    }
    if ((requireOwnedReturnSchemas === true || ownedReturnSchemas !== undefined)
      && moduleExports.some((entry) => entry.kind === "table")) {
      refuseHostCopy("strict owned-return schemas refuse exported callable tables");
    }
    if (ownedReturnSchemas !== undefined) {
      if (publicFunctions.some((entry) => ownedReturnSchemas?.[entry.name] === undefined)) {
        refuseHostCopy("metadata requires a schema for every public function export");
      }
      if (!publicFunctions.length || !publicFunctions.every((entry) => {
        const signature = parseWasmFunctionSignature(wasm, entry.name);
        return signature !== undefined && signature.results.length === 1 && signature.results[0] === 0x7f;
      })) {
        refuseHostCopy("metadata requires each public function to return one i32 owned handle");
      }
      const requiresOwnedCleanup = Object.keys(ownedReturnSchemas).some((name) =>
        ownedReturnShapeRequiresCleanup(ownedReturnSchemas[name]!),
      );
      if (requiresOwnedCleanup
        && !WebAssembly.Module.exports(compiled).some((entry) => entry.name === "__fungi_wipe_owned" && entry.kind === "function")) {
        refuseHostCopy("attested owned-return metadata requires the owned-memory cleanup export");
      }
    }
    for (const [name] of Object.entries(ownedReturnSchemas ?? {})) {
      const signature = parseWasmFunctionSignature(wasm, name);
      if (signature === undefined || signature.results.length !== 1 || signature.results[0] !== 0x7f) {
        refuseHostCopy(`export '${name}' must return exactly one i32 registry or pointer handle`);
      }
    }
    const provided = host.imports as unknown as Record<string, Record<string, unknown>>;
    const moduleImports = WebAssembly.Module.imports(compiled);
    for (const imp of moduleImports) {
      // The closed host surface exposes functions only. Reject kind substitution for
      // every import, not just named effect grants: a function-valued JS capability
      // supplied as an externref/global is still a capability escape.
      if (imp.kind !== "function") {
        throw new WebAssembly.LinkError(
          `unsupported host import kind: ${imp.module}.${imp.name} is ${imp.kind}, expected function`,
        );
      }
      const effectGrant = WASM_EFFECT_GRANT_ABI.find(
        (entry) => entry.module === imp.module && entry.name === imp.name,
      );
      const namespace = Object.prototype.hasOwnProperty.call(provided, imp.module)
        ? provided[imp.module]
        : undefined;
      if (namespace === undefined || !Object.prototype.hasOwnProperty.call(namespace, imp.name)) {
        throw new WebAssembly.LinkError(
          `disallowed host import: import ${imp.module}.${imp.name} (${imp.kind}) is not provided`,
        );
      }
    }
    if (!hasOnlyNumericFunctionImportSignatures(wasm)) {
      throw new Error("FUNGI-WASM-REFERENCE-001: host function imports must use numeric-only parameters and results");
    }

    // WebAssembly runs a module's start function as part of instantiation. Keep
    // every host function import closed until instantiation and admission have
    // fully succeeded; startup must be guest-local and cannot mutate host state,
    // emit output, or escape through an effect before a later trap.
    const gatedHost = Object.assign(Object.create(null) as Record<string, unknown>, provided.host);
    for (const imp of moduleImports) {
      const effectGrant = WASM_EFFECT_GRANT_ABI.find(
        (entry) => entry.module === imp.module && entry.name === imp.name,
      );
      if (imp.kind !== "function") continue;
      const handler = gatedHost[imp.name];
      if (typeof handler !== "function") {
        throw new WebAssembly.LinkError(`host function import ${imp.module}.${imp.name} is not a function`);
      }
      const guardedHandler = (...args: number[]) => {
        if (effectGate.quarantined) {
          throw new Error("FUNGI-WASM-QUARANTINED-001: host effect refused after cleanup failure");
        }
        if (!effectGate.active) {
          effectGate.startupImportAttempted = true;
          const kind = effectGrant === undefined ? "host import" : "host effect";
          throw new Error(`${kind} ${imp.module}.${imp.name} invoked before module admission completed`);
        }
        return (handler as (...values: number[]) => number)(...args);
      };
      gatedHost[imp.name] = effectGrant === undefined
        ? guardedHandler
        : typeEffectGrantHandler(effectGrant, guardedHandler);
    }
    const instantiationImports = { ...host.imports, host: Object.freeze(gatedHost) } as WebAssembly.Imports;
    wasmResult = await WebAssembly.instantiate(compiled, instantiationImports);
  } catch (err) {
    lifecycle.state = "quarantined";
    const reason = err instanceof WebAssembly.LinkError
      ? `module import/link failed: ${err.message}`
      : `instantiation failed: ${err instanceof Error ? err.message : String(err)}`;
    opts.observe?.onViolation?.(reason, wasm);
    throw new Error(`CRITICAL_SECURITY_VIOLATION: ${reason} (hash=${verdict.hash})`);
  }
  if (effectGate.startupImportAttempted) {
    lifecycle.state = "quarantined";
    const reason = "module startup attempted a host import before initialization completed";
    opts.observe?.onViolation?.(reason, wasm);
    throw new Error(`CRITICAL_SECURITY_VIOLATION: ${reason} (hash=${verdict.hash})`);
  }
  const instance = (wasmResult as { instance?: WebAssembly.Instance }).instance
    ?? (wasmResult as WebAssembly.Instance);
  const mem = requireWasmInstanceExports(instance)["memory"];
  try {
    // Build every potentially-throwing export wrapper before committing the host's memory
    // binding. A malformed/accessor-backed layout therefore cannot leave a rejected guest's
    // memory visible through the host or replace a previously admitted instance's memory.
    const ownedReturnCopier = FACTORY_OWNED_RETURN_COPIERS.get(host);
    if (ownedReturnSchemas !== undefined && ownedReturnCopier === undefined) {
      refuseHostCopy("factory-owned copier is unavailable");
    }
    const wrappedInstance = wrapAdmittedExports(instance, returnLayouts, () => {
      effectGate.quarantined = true;
      effectGate.active = false;
      lifecycle.state = "quarantined";
    }, lifecycle, ownedReturnSchemas, ownedReturnCopier);
    if (isWasmMemory(mem)) {
      lifecycle.internalBindPermit = true;
      try {
        host.bindMemory(mem);
      } finally {
        lifecycle.internalBindPermit = false;
      }
    }
    lifecycle.state = "admitted";
    effectGate.active = true;
    ADMITTED_RAW_INSTANCES.add(instance);
    return { instance: wrappedInstance, host, hash: verdict.hash };
  } catch (err) {
    lifecycle.state = "quarantined";
    const reason = `admission finalization failed: ${err instanceof Error ? err.message : String(err)}`;
    opts.observe?.onViolation?.(reason, wasm);
    throw new Error(`CRITICAL_SECURITY_VIOLATION: ${reason} (hash=${verdict.hash})`);
  }
}

const SECRET_HELPER_EXPORTS = new Set([
  "__fungi_wipe_owned",
  "__fungi_heap_get",
  "__fungi_ret_is_heap_get",
  "__fungi_ret_words_get",
]);
const RAW_ADMITTED_INSTANCES = new WeakMap<WebAssembly.Instance, WebAssembly.Instance>();
const ADMITTED_RAW_INSTANCES = new WeakSet<WebAssembly.Instance>();
const ADMITTED_SECRET_HELPER_FUNCTIONS = new WeakMap<WebAssembly.Instance, ReadonlyMap<Function, string>>();

type WasmFunctionSignature = Readonly<{ params: readonly number[]; results: readonly number[] }>;
const WASM_NUMERIC_IMPORT_TYPES = new Set([0x7f, 0x7e, 0x7d, 0x7c]);

function readWasmU32(bytes: Uint8Array, cursor: { offset: number }, end: number): number | undefined {
  let value = 0;
  for (let shift = 0; shift <= 28; shift += 7) {
    if (cursor.offset >= end) return undefined;
    const byte = bytes[cursor.offset++];
    if (byte === undefined) return undefined;
    if (shift === 28 && (byte & 0xf0) !== 0) return undefined;
    value += (byte & 0x7f) * 2 ** shift;
    if ((byte & 0x80) === 0) return value;
  }
  return undefined;
}

function skipWasmName(bytes: Uint8Array, cursor: { offset: number }, end: number): string | undefined {
  const length = readWasmU32(bytes, cursor, end);
  if (length === undefined || length > end - cursor.offset) return undefined;
  try {
    const value = decodeWasmUtf8(wasmByteSubarray(bytes, cursor.offset, cursor.offset + length));
    cursor.offset += length;
    return value;
  } catch {
    return undefined;
  }
}

function readWasmValueType(bytes: Uint8Array, cursor: { offset: number }, end: number): number | undefined {
  if (cursor.offset >= end) return undefined;
  const type = bytes[cursor.offset++];
  if (type === undefined) return undefined;
  if ([0x7f, 0x7e, 0x7d, 0x7c, 0x7b, 0x70, 0x6f].includes(type)) return type;
  // Typed references carry an s33 heap type. Consume it, but mark the type as unsupported by this ABI.
  if (type === 0x63 || type === 0x64) {
    for (let index = 0; index < 5; index += 1) {
      if (cursor.offset >= end) return undefined;
      const byte = bytes[cursor.offset++];
      if (byte === undefined) return undefined;
      if ((byte & 0x80) === 0) return 0xff;
    }
  }
  return undefined;
}

function hasOnlyNumericFunctionImportSignatures(wasm: Uint8Array): boolean {
  if (wasm.length < 8 || wasm[0] !== 0 || wasm[1] !== 0x61 || wasm[2] !== 0x73 || wasm[3] !== 0x6d) {
    return false;
  }
  const types: WasmFunctionSignature[] = [];
  const importedFunctionTypes: number[] = [];
  let offset = 8;

  while (offset < wasm.length) {
    const sectionId = wasm[offset++];
    if (sectionId === undefined) return false;
    const sectionCursor = { offset };
    const sectionLength = readWasmU32(wasm, sectionCursor, wasm.length);
    if (sectionLength === undefined || sectionLength > wasm.length - sectionCursor.offset) return false;
    const end = sectionCursor.offset + sectionLength;
    const cursor = { offset: sectionCursor.offset };

    if (sectionId === 1) {
      const count = readWasmU32(wasm, cursor, end);
      if (count === undefined || count > end - cursor.offset) return false;
      for (let index = 0; index < count; index += 1) {
        if (cursor.offset >= end || wasm[cursor.offset++] !== 0x60) return false;
        const paramCount = readWasmU32(wasm, cursor, end);
        if (paramCount === undefined || paramCount > end - cursor.offset) return false;
        const params: number[] = [];
        for (let param = 0; param < paramCount; param += 1) {
          const valueType = readWasmValueType(wasm, cursor, end);
          if (valueType === undefined) return false;
          params.push(valueType);
        }
        const resultCount = readWasmU32(wasm, cursor, end);
        if (resultCount === undefined || resultCount > end - cursor.offset) return false;
        const results: number[] = [];
        for (let result = 0; result < resultCount; result += 1) {
          const valueType = readWasmValueType(wasm, cursor, end);
          if (valueType === undefined) return false;
          results.push(valueType);
        }
        types.push({ params, results });
      }
      if (cursor.offset !== end) return false;
    } else if (sectionId === 2) {
      const count = readWasmU32(wasm, cursor, end);
      if (count === undefined || count > end - cursor.offset) return false;
      for (let index = 0; index < count; index += 1) {
        if (skipWasmName(wasm, cursor, end) === undefined || skipWasmName(wasm, cursor, end) === undefined
          || cursor.offset >= end) return false;
        const kind = wasm[cursor.offset++];
        // This admission boundary currently exposes function imports only. The caller also
        // checks kinds via the engine API; refuse here because this parser cannot validate
        // non-function import signatures or authority-bearing reference values.
        if (kind !== 0) return false;
        const typeIndex = readWasmU32(wasm, cursor, end);
        if (typeIndex === undefined) return false;
        importedFunctionTypes.push(typeIndex);
      }
      if (cursor.offset !== end) return false;
    }

    offset = end;
  }

  return importedFunctionTypes.every((typeIndex) => {
    const signature = types[typeIndex];
    return signature !== undefined
      && signature.params.every((type) => WASM_NUMERIC_IMPORT_TYPES.has(type))
      && signature.results.every((type) => WASM_NUMERIC_IMPORT_TYPES.has(type));
  });
}

function parseWasmFunctionSignature(wasm: Uint8Array, exportName: string): WasmFunctionSignature | undefined {
  if (wasm.length < 8 || wasm[0] !== 0 || wasm[1] !== 0x61 || wasm[2] !== 0x73 || wasm[3] !== 0x6d) return undefined;
  const types: WasmFunctionSignature[] = [];
  const importedFunctionTypes: number[] = [];
  const definedFunctionTypes: number[] = [];
  let exportedFunctionIndex: number | undefined;
  let offset = 8;

  while (offset < wasm.length) {
    const sectionId = wasm[offset++];
    const sectionCursor = { offset };
    const sectionLength = readWasmU32(wasm, sectionCursor, wasm.length);
    if (sectionLength === undefined || sectionLength > wasm.length - sectionCursor.offset) return undefined;
    const end = sectionCursor.offset + sectionLength;
    const cursor = { offset: sectionCursor.offset };

    if (sectionId === 1) {
      const count = readWasmU32(wasm, cursor, end);
      if (count === undefined || count > end - cursor.offset) return undefined;
      for (let index = 0; index < count; index += 1) {
        if (cursor.offset >= end || wasm[cursor.offset++] !== 0x60) return undefined;
        const paramCount = readWasmU32(wasm, cursor, end);
        if (paramCount === undefined || paramCount > end - cursor.offset) return undefined;
        const params: number[] = [];
        for (let param = 0; param < paramCount; param += 1) {
          const valueType = readWasmValueType(wasm, cursor, end);
          if (valueType === undefined) return undefined;
          params.push(valueType);
        }
        const resultCount = readWasmU32(wasm, cursor, end);
        if (resultCount === undefined || resultCount > end - cursor.offset) return undefined;
        const results: number[] = [];
        for (let result = 0; result < resultCount; result += 1) {
          const valueType = readWasmValueType(wasm, cursor, end);
          if (valueType === undefined) return undefined;
          results.push(valueType);
        }
        types.push(Object.freeze({ params: Object.freeze(params), results: Object.freeze(results) }));
      }
      if (cursor.offset !== end) return undefined;
    } else if (sectionId === 2) {
      const count = readWasmU32(wasm, cursor, end);
      if (count === undefined || count > end - cursor.offset) return undefined;
      for (let index = 0; index < count; index += 1) {
        if (skipWasmName(wasm, cursor, end) === undefined || skipWasmName(wasm, cursor, end) === undefined
          || cursor.offset >= end) return undefined;
        const kind = wasm[cursor.offset++];
        // This synchronous ABI currently admits only function imports.
        if (kind !== 0) return undefined;
        const typeIndex = readWasmU32(wasm, cursor, end);
        if (typeIndex === undefined) return undefined;
        importedFunctionTypes.push(typeIndex);
      }
      if (cursor.offset !== end) return undefined;
    } else if (sectionId === 3) {
      const count = readWasmU32(wasm, cursor, end);
      if (count === undefined || count > end - cursor.offset) return undefined;
      for (let index = 0; index < count; index += 1) {
        const typeIndex = readWasmU32(wasm, cursor, end);
        if (typeIndex === undefined) return undefined;
        definedFunctionTypes.push(typeIndex);
      }
      if (cursor.offset !== end) return undefined;
    } else if (sectionId === 7) {
      const count = readWasmU32(wasm, cursor, end);
      if (count === undefined || count > end - cursor.offset) return undefined;
      for (let index = 0; index < count; index += 1) {
        const name = skipWasmName(wasm, cursor, end);
        if (name === undefined || cursor.offset >= end) return undefined;
        const kind = wasm[cursor.offset++];
        const functionIndex = readWasmU32(wasm, cursor, end);
        if (functionIndex === undefined) return undefined;
        if (name === exportName && kind === 0) exportedFunctionIndex = functionIndex;
      }
      if (cursor.offset !== end) return undefined;
    }

    offset = end;
  }

  if (exportedFunctionIndex === undefined) return undefined;
  const typeIndex = [...importedFunctionTypes, ...definedFunctionTypes][exportedFunctionIndex];
  if (typeIndex === undefined) return undefined;
  return types[typeIndex];
}

function isSupportedSynchronousWasmSignature(
  signature: WasmFunctionSignature | undefined,
  argumentCount: number,
): signature is WasmFunctionSignature {
  if (signature === undefined || signature.params.length !== argumentCount || signature.results.length > 1) return false;
  const jsNumberParams = new Set([0x7f, 0x7d, 0x7c]);
  const numericResults = new Set([0x7f, 0x7e, 0x7d, 0x7c]);
  return signature.params.every((type) => jsNumberParams.has(type))
    && signature.results.every((type) => numericResults.has(type));
}

type PreparedSynchronousWasmInvocation = {
  readonly module: WebAssembly.Module;
  readonly exportName: string;
  readonly args: readonly number[];
  readonly host: HostRuntime;
  readonly lifecycle: HostRuntimeAdmissionLifecycle;
  readonly hash: string;
};

/**
 * Private-pairing authority for the synchronous core-runtime seam. Preparation verifies signed admission and
 * snapshots/compiles the exact invocation. Only a frozen token held in this authority's WeakMap can cross into
 * synchronous instantiation; the token is consumed before guest startup. This is deliberately not re-exported
 * from the package barrel. The asynchronous public `admitAndInstantiate` path remains the primary full runtime.
 */
export function createWasmInvocationAuthority(policy: AdmissionPolicy): {
  prepare(input: {
    readonly wasm: Uint8Array;
    readonly attestation: WasmAttestation;
    readonly artifactSha256: string;
    readonly exportName: string;
    readonly args: readonly unknown[];
  }): object | false;
  execute(permit: object): { readonly ok: true; readonly result?: unknown } | { readonly ok: false; readonly reason: string };
} {
  const preparedInvocations = new WeakMap<object, PreparedSynchronousWasmInvocation>();
  const safePolicy = snapshotAdmissionPolicy(policy);
  const signedPolicy = safePolicy === undefined ? undefined : Object.freeze({ ...safePolicy, requireSigned: true });

  return {
    prepare(input): object | false {
      if (signedPolicy === undefined) return false;
      try {
        const record = snapshotPlainDataRecord(
          input,
          new Set(["wasm", "attestation", "artifactSha256", "exportName", "args"]),
          ["wasm", "attestation", "artifactSha256", "exportName", "args"],
        );
        if (record === undefined) return false;
        const sourceWasm = record.wasm;
        const sourceAttestation = record.attestation;
        const artifactSha256 = record.artifactSha256;
        const exportName = record.exportName;
        const sourceArgs = record.args;
        if (
          nodeTypes.isProxy(sourceWasm)
          || !(sourceWasm instanceof Uint8Array)
          || typeof artifactSha256 !== "string"
          || typeof exportName !== "string"
          || !Array.isArray(sourceArgs)
        ) return false;
        const wasm = Uint8Array.from(sourceWasm);
        // This one-shot synchronous seam has no owned-return finalizer yet. Do not
        // silently ignore a signed descriptor and execute the legacy result path.
        if (parseOwnedReturnSchemas(wasm) !== undefined) return false;
        const attestation = snapshotWasmAttestation(sourceAttestation as WasmAttestation);
        if (attestation === undefined) return false;
        const verdict = verifyWasm(wasm, attestation, signedPolicy);
        if (!verdict.ok || verdict.hash !== artifactSha256) return false;

        const frozenArgs = snapshotFiniteNumberArray(sourceArgs);
        if (frozenArgs === undefined) return false;
        const module = new WebAssembly.Module(wasm as BufferSource);
        if (!WebAssembly.Module.exports(module).some((entry) => entry.name === exportName && entry.kind === "function")) {
          return false;
        }
        if (!hasOnlyNumericFunctionImportSignatures(wasm)) return false;
        if (!isSupportedSynchronousWasmSignature(parseWasmFunctionSignature(wasm, exportName), frozenArgs.length)) {
          return false;
        }

        const host = createHostRuntime();
        const lifecycle = FACTORY_HOST_RUNTIMES.get(host);
        if (lifecycle === undefined || lifecycle.state !== "ready" || lifecycle.memoryBoundBeforeAdmission) return false;
        const provided = host.imports as Record<string, Record<string, unknown>>;
        for (const imported of WebAssembly.Module.imports(module)) {
          if (imported.kind !== "function") return false;
          const namespace = Object.prototype.hasOwnProperty.call(provided, imported.module)
            ? provided[imported.module]
            : undefined;
          if (namespace === undefined || !Object.prototype.hasOwnProperty.call(namespace, imported.name)
            || typeof namespace[imported.name] !== "function") return false;
        }

        // Claim this fresh host before publishing its one-shot permit.
        lifecycle.state = "admitting";
        const permit = Object.freeze(Object.create(null)) as object;
        preparedInvocations.set(permit, Object.freeze({
          module,
          exportName,
          args: frozenArgs,
          host,
          lifecycle,
          hash: verdict.hash,
        }));
        return permit;
      } catch {
        return false;
      }
    },

    execute(permit): { readonly ok: true; readonly result?: unknown } | { readonly ok: false; readonly reason: string } {
      const prepared = preparedInvocations.get(permit);
      if (prepared === undefined) return { ok: false, reason: "missing, foreign, or already-consumed invocation permit" };
      // Burn first: startup, import, binding or guest failures cannot replay this authorization.
      preparedInvocations.delete(permit);
      const { module, exportName, args, host, lifecycle } = prepared;
      let instance: WebAssembly.Instance | undefined;
      const effectGate = { active: false, startupImportAttempted: false, quarantined: false };
      try {
        const provided = host.imports as Record<string, Record<string, unknown>>;
        const importObject = Object.create(null) as Record<string, Record<string, (...args: number[]) => number>>;
        for (const imported of WebAssembly.Module.imports(module)) {
          if (imported.kind !== "function") throw new WebAssembly.LinkError("only function imports are admitted");
          const namespace = Object.prototype.hasOwnProperty.call(provided, imported.module)
            ? provided[imported.module]
            : undefined;
          const handler = namespace !== undefined && Object.prototype.hasOwnProperty.call(namespace, imported.name)
            ? namespace[imported.name]
            : undefined;
          if (typeof handler !== "function") throw new WebAssembly.LinkError(`host function ${imported.module}.${imported.name} is not provided`);
          const effectGrant = WASM_EFFECT_GRANT_ABI.find((entry) => entry.module === imported.module && entry.name === imported.name);
          const guardedHandler = (...values: number[]) => {
            if (effectGate.quarantined) throw new Error("FUNGI-WASM-QUARANTINED-001: host effect refused after cleanup failure");
            if (!effectGate.active) {
              effectGate.startupImportAttempted = true;
              throw new Error(`host import ${imported.module}.${imported.name} invoked before module admission completed`);
            }
            return (handler as (...args: number[]) => number)(...values);
          };
          let importNamespace = importObject[imported.module];
          if (importNamespace === undefined) {
            importNamespace = Object.create(null) as Record<string, (...args: number[]) => number>;
            importObject[imported.module] = importNamespace;
          }
          importNamespace[imported.name] = effectGrant === undefined
            ? guardedHandler
            : typeEffectGrantHandler(effectGrant, guardedHandler);
        }
        for (const namespace of Object.values(importObject)) Object.freeze(namespace);
        const imports = Object.freeze(importObject) as WebAssembly.Imports;
        instance = new WebAssembly.Instance(module, imports);
        if (effectGate.startupImportAttempted) throw new Error("module startup attempted a host import before admission completed");

        const exports = getWasmInstanceExports(instance);
        if (exports === undefined) throw new TypeError("newly instantiated WASM module did not produce a genuine instance");
        const memory = exports["memory"];
        const wrapped = wrapAdmittedExports(instance, undefined, () => {
          effectGate.quarantined = true;
          effectGate.active = false;
          lifecycle.state = "quarantined";
        }, lifecycle);
        if (isWasmMemory(memory)) {
          lifecycle.internalBindPermit = true;
          try {
            host.bindMemory(memory);
          } finally {
            lifecycle.internalBindPermit = false;
          }
        }
        lifecycle.state = "admitted";
        effectGate.active = true;
        ADMITTED_RAW_INSTANCES.add(instance);
        const result = invokeAdmittedExport(wrapped, exportName, args);
        if (!result.ok) return result;
        return { ok: true, result: result.result };
      } catch (error) {
        lifecycle.state = "quarantined";
        effectGate.active = false;
        effectGate.quarantined = true;
        return { ok: false, reason: error instanceof Error ? error.message : String(error) };
      }
    },
  };
}

interface AdmittedExportCallState {
  active: boolean;
  quarantined: boolean;
  lifecycle?: HostRuntimeAdmissionLifecycle;
  onQuarantine?: () => void;
}
const ADMITTED_EXPORT_CALL_STATES = new WeakMap<WebAssembly.Instance, AdmittedExportCallState>();
const ADMITTED_RETURN_LAYOUTS = new WeakMap<
  WebAssembly.Instance,
  Readonly<Record<string, readonly RecordCopyField[]>> | undefined
>();
const ADMITTED_OWNED_RETURN_SCHEMAS = new WeakMap<WebAssembly.Instance, OwnedReturnSchemas | undefined>();
const ADMITTED_OWNED_RETURN_COPIERS = new WeakMap<WebAssembly.Instance, OwnedReturnCopier | undefined>();
const WASM_INSTANCE_EXPORTS_GETTER = Object.getOwnPropertyDescriptor(
  WebAssembly.Instance.prototype,
  "exports",
)?.get;
const WASM_GLOBAL_VALUE_GETTER = Object.getOwnPropertyDescriptor(WebAssembly.Global.prototype, "value")?.get;
const WASM_TABLE_GET = WebAssembly.Table.prototype.get;
const WASM_TABLE_LENGTH_GETTER = Object.getOwnPropertyDescriptor(WebAssembly.Table.prototype, "length")?.get;
const APPLY_INTRINSIC = Reflect.apply;

function admittedExportCallState(
  instance: WebAssembly.Instance,
  onQuarantine?: () => void,
  lifecycle?: HostRuntimeAdmissionLifecycle,
): AdmittedExportCallState {
  const existing = ADMITTED_EXPORT_CALL_STATES.get(instance);
  if (existing !== undefined) {
    if (onQuarantine !== undefined) existing.onQuarantine = onQuarantine;
    if (lifecycle !== undefined) existing.lifecycle = lifecycle;
    return existing;
  }
  const state: AdmittedExportCallState = { active: false, quarantined: false };
  if (onQuarantine !== undefined) state.onQuarantine = onQuarantine;
  if (lifecycle !== undefined) state.lifecycle = lifecycle;
  ADMITTED_EXPORT_CALL_STATES.set(instance, state);
  return state;
}

function setAdmittedCallActive(callState: AdmittedExportCallState, active: boolean): void {
  callState.active = active;
  if (callState.lifecycle !== undefined) callState.lifecycle.activeCall = active;
}

function refuseQuarantinedInstance(callState: AdmittedExportCallState): void {
  if (callState.quarantined) {
    throw new Error("FUNGI-WASM-QUARANTINED-001: instance refused after owned-memory cleanup failure");
  }
}

function quarantineAdmittedInstance(callState: AdmittedExportCallState): void {
  if (callState.quarantined) return;
  callState.quarantined = true;
  if (callState.lifecycle !== undefined) callState.lifecycle.state = "quarantined";
  callState.onQuarantine?.();
}

function getWasmInstanceExports(
  instance: WebAssembly.Instance,
): Record<string, unknown> | undefined {
  if (typeof WASM_INSTANCE_EXPORTS_GETTER !== "function") return undefined;
  try {
    return APPLY_INTRINSIC(WASM_INSTANCE_EXPORTS_GETTER, instance, []) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

function requireWasmInstanceExports(instance: WebAssembly.Instance): Record<string, unknown> {
  const exports = getWasmInstanceExports(instance);
  if (exports === undefined) throw new TypeError("a genuine WebAssembly.Instance is required");
  return exports;
}

function wrapReadOnlyAdmittedGlobal(value: WebAssembly.Global, name: string): WebAssembly.Global {
  if (typeof WASM_GLOBAL_VALUE_GETTER !== "function") {
    throw new Error(`FUNGI-WASM-GLOBAL-001: WebAssembly.Global.value is unavailable for export '${name}'`);
  }
  return new Proxy(value, {
    get(target, property) {
      if (property === "value") return APPLY_INTRINSIC(WASM_GLOBAL_VALUE_GETTER, target, []);
      if (property === Symbol.toStringTag) return "WebAssembly.Global";
      return undefined;
    },
    set(_target, property) {
      throw new Error(`FUNGI-WASM-GLOBAL-001: host mutation of exported global '${name}' (${String(property)}) is refused`);
    },
    defineProperty() {
      return false;
    },
    deleteProperty() {
      return false;
    },
    setPrototypeOf() {
      return false;
    },
  });
}

function wrapOpaqueAdmittedMemory(value: WebAssembly.Memory, name: string): WebAssembly.Memory {
  return new Proxy(value, {
    get(_target, property) {
      if (property === "buffer" || property === "grow") {
        throw new Error(`FUNGI-WASM-MEMORY-001: host access to admitted memory '${name}' is refused`);
      }
      if (property === Symbol.toStringTag) return "WebAssembly.Memory";
      return undefined;
    },
    set() {
      throw new Error(`FUNGI-WASM-MEMORY-001: host mutation of admitted memory '${name}' is refused`);
    },
    defineProperty() {
      return false;
    },
    deleteProperty() {
      return false;
    },
    setPrototypeOf() {
      return false;
    },
  });
}

function wrapAdmittedFunction(
  instanceExports: Record<string, unknown>,
  callState: AdmittedExportCallState,
  value: (...args: unknown[]) => unknown,
  layout?: readonly RecordCopyField[],
  ownedReturnShape?: OwnedReturnShape,
  ownedReturnCopier?: OwnedReturnCopier,
): (...args: unknown[]) => unknown {
  return (...args: unknown[]) => {
    refuseQuarantinedInstance(callState);
    if (callState.active) {
      throw new Error("FUNGI-WASM-REENTRANT-001: nested admitted export refused while a prior export is active");
    }
    setAdmittedCallActive(callState, true);
    const cleanup = createCleanupAttempt();
    try {
      const result = value(...args);
      return finalizeSecretExportResultWithAttempt(
        instanceExports,
        result,
        layout,
        cleanup,
        ownedReturnShape,
        ownedReturnCopier,
        () => quarantineAdmittedInstance(callState),
      );
    } catch (err) {
      if (!cleanup.attempted) {
        try {
          wipeOwnedSecrets(instanceExports, cleanup, () => quarantineAdmittedInstance(callState));
        } catch (cleanupErr) {
          quarantineAdmittedInstance(callState);
          throw combineCleanupFailure(err, cleanupErr);
        }
      }
      if (cleanup.failed) quarantineAdmittedInstance(callState);
      throw err;
    } finally {
      setAdmittedCallActive(callState, false);
    }
  };
}

function wrapAdmittedHelper(
  value: (...args: unknown[]) => unknown,
  name: string,
  callState: AdmittedExportCallState,
  instanceExports: Record<string, unknown>,
): (...args: unknown[]) => unknown {
  return (...args: unknown[]) => {
    refuseQuarantinedInstance(callState);
    if (callState.active) {
      throw new Error(`FUNGI-WASM-REENTRANT-001: secret helper '${name}' refused while an admitted export is active`);
    }
    setAdmittedCallActive(callState, true);
    try {
      const result = value(...args);
      const valid = name === "__fungi_wipe_owned"
        ? result === undefined
        : typeof result === "number" && Number.isInteger(result);
      if (!valid) {
        throw new Error(`FUNGI-WASM-REFERENCE-001: secret helper '${name}' returned a non-scalar or invalid result`);
      }
      return result;
    } catch (err) {
      if (name === "__fungi_wipe_owned") {
        quarantineAdmittedInstance(callState);
      } else {
        const cleanup = createCleanupAttempt();
        try {
          wipeOwnedSecrets(instanceExports, cleanup, () => quarantineAdmittedInstance(callState));
        } catch (cleanupErr) {
          quarantineAdmittedInstance(callState);
          throw combineCleanupFailure(err, cleanupErr);
        }
        quarantineAdmittedInstance(callState);
      }
      throw err;
    } finally {
      setAdmittedCallActive(callState, false);
    }
  };
}

function wrapAdmittedTable(
  table: WebAssembly.Table,
  instanceExports: Record<string, unknown>,
  callState: AdmittedExportCallState,
  helperFunctions: ReadonlyMap<Function, string>,
): WebAssembly.Table {
  return new Proxy(table, {
    get(target, property, receiver) {
      if (property === "get") {
        return (index: number): unknown => {
          const value = APPLY_INTRINSIC(WASM_TABLE_GET, target, [index]) as unknown;
          if (typeof value !== "function") return value;
          const helperName = WASM_REFLECT_APPLY(WASM_MAP_GET, helperFunctions, [value]) as string | undefined;
          return helperName === undefined
            ? wrapAdmittedFunction(instanceExports, callState, value as (...args: unknown[]) => unknown)
            : wrapAdmittedHelper(value as (...args: unknown[]) => unknown, helperName, callState, instanceExports);
        };
      }
      if (property === "set") {
        return (index: number, value: unknown): void => {
          refuseQuarantinedInstance(callState);
          void index;
          void value;
          throw new Error("FUNGI-WASM-TABLE-001: host table mutation refused after artifact admission");
        };
      }
      if (property === "grow") {
        return (delta: number, value?: unknown): number => {
          refuseQuarantinedInstance(callState);
          void delta;
          void value;
          throw new Error("FUNGI-WASM-TABLE-001: host table mutation refused after artifact admission");
        };
      }
      if (property === "length") {
        if (WASM_TABLE_LENGTH_GETTER === undefined) {
          throw new Error("FUNGI-WASM-TABLE-001: table length is unavailable in this host runtime");
        }
        return APPLY_INTRINSIC(WASM_TABLE_LENGTH_GETTER, target, []) as number;
      }
      if (property === Symbol.toStringTag) return "WebAssembly.Table";
      return undefined;
    },
    set() {
      return false;
    },
    defineProperty() {
      return false;
    },
    deleteProperty() {
      return false;
    },
    setPrototypeOf() {
      return false;
    },
  });
}

function wrapAdmittedExports(
  instance: WebAssembly.Instance,
  returnLayouts?: Readonly<Record<string, readonly RecordCopyField[]>>,
  onQuarantine?: () => void,
  lifecycle?: HostRuntimeAdmissionLifecycle,
  ownedReturnSchemas?: OwnedReturnSchemas,
  ownedReturnCopier?: OwnedReturnCopier,
): WebAssembly.Instance {
  const instanceExports = requireWasmInstanceExports(instance);
  if (returnLayouts !== undefined) {
    for (const name of Object.keys(returnLayouts)) {
      if (typeof instanceExports[name] !== "function") {
        throw new Error(`FUNGI-WASM-RET-001: declared return layout names missing export '${name}'`);
      }
    }
    if (Object.keys(returnLayouts).length > 0 && typeof instanceExports["__fungi_wipe_owned"] !== "function") {
      throw new Error("FUNGI-WASM-RET-001: declared result layout requires owned-memory cleanup");
    }
  }
  const callState = admittedExportCallState(instance, onQuarantine, lifecycle);
  const helperFunctions = new Map<Function, string>();
  for (const name of SECRET_HELPER_EXPORTS) {
    const value = instanceExports[name];
    if (typeof value === "function") {
      const existingName = WASM_REFLECT_APPLY(WASM_MAP_GET, helperFunctions, [value]) as string | undefined;
      if (existingName !== undefined && existingName !== name) {
        throw new Error("FUNGI-WASM-REFERENCE-001: reserved secret helper exports must not alias the same function");
      }
      WASM_REFLECT_APPLY(WASM_MAP_SET, helperFunctions, [value, name]);
    }
  }
  WASM_REFLECT_APPLY(WASM_WEAKMAP_SET, ADMITTED_SECRET_HELPER_FUNCTIONS, [instance, helperFunctions]);
  const wrappedExports: Record<string, unknown> = Object.create(null);
  for (const [name, value] of Object.entries(instanceExports)) {
    if (SECRET_HELPER_EXPORTS.has(name) && typeof value !== "function") {
      throw new Error(`FUNGI-WASM-REFERENCE-001: reserved secret helper export '${name}' must be a function`);
    }
    if (isWasmMemory(value)) {
      wrappedExports[name] = wrapOpaqueAdmittedMemory(value, name);
      continue;
    }
    if (value instanceof WebAssembly.Global) {
      if (typeof WASM_GLOBAL_VALUE_GETTER !== "function") {
        throw new Error(`FUNGI-WASM-GLOBAL-001: WebAssembly.Global.value is unavailable for export '${name}'`);
      }
      const globalValue = APPLY_INTRINSIC(WASM_GLOBAL_VALUE_GETTER, value, []);
      if (typeof globalValue !== "number" && typeof globalValue !== "bigint") {
        throw new Error(`FUNGI-WASM-REFERENCE-001: reference-valued global export '${name}' is not admitted`);
      }
      wrappedExports[name] = wrapReadOnlyAdmittedGlobal(value, name);
      continue;
    }
    const helperName = typeof value === "function"
      ? WASM_REFLECT_APPLY(WASM_MAP_GET, helperFunctions, [value]) as string | undefined
      : undefined;
    if (SECRET_HELPER_EXPORTS.has(name) || helperName !== undefined) {
      wrappedExports[name] = wrapAdmittedHelper(
        value as (...args: unknown[]) => unknown,
        helperName ?? name,
        callState,
        instanceExports,
      );
      continue;
    }
    if (typeof value === "function" && !SECRET_HELPER_EXPORTS.has(name)) {
      const layout = returnLayouts?.[name];
      const ownedReturnShape = ownedReturnSchemas?.[name];
      wrappedExports[name] = wrapAdmittedFunction(
        instanceExports,
        callState,
        value as (...args: unknown[]) => unknown,
        layout,
        ownedReturnShape,
        ownedReturnCopier,
      );
    } else if (value instanceof WebAssembly.Table) {
      wrappedExports[name] = wrapAdmittedTable(value, instanceExports, callState, helperFunctions);
    } else {
      wrappedExports[name] = value;
    }
  }
  const wrapped = new Proxy(instance, {
    get(target, prop, receiver) {
      if (prop === "exports") return wrappedExports;
      return Reflect.get(target, prop, receiver);
    },
  }) as WebAssembly.Instance;
  RAW_ADMITTED_INSTANCES.set(wrapped, instance);
  ADMITTED_RETURN_LAYOUTS.set(wrapped, returnLayouts);
  ADMITTED_OWNED_RETURN_SCHEMAS.set(wrapped, ownedReturnSchemas);
  ADMITTED_OWNED_RETURN_COPIERS.set(wrapped, ownedReturnCopier);
  return wrapped;
}

const MAX_COPIED_RECORD_WORDS = 64;

interface CleanupAttempt {
  attempted: boolean;
  failed: boolean;
  failure?: unknown;
}

function createCleanupAttempt(): CleanupAttempt {
  // Declare every mutable field as an own data property. In particular, cleanup
  // failure reporting must not dispatch through an inherited `failure` setter
  // before the admitted instance is quarantined.
  return { attempted: false, failed: false, failure: undefined };
}

function wipeOwnedSecrets(
  exports: Record<string, unknown>,
  attempt: CleanupAttempt,
  onCleanupFailure?: () => void,
): void {
  if (attempt.attempted) {
    if (attempt.failed) throw attempt.failure;
    return;
  }
  attempt.attempted = true;
  const wipe = exports["__fungi_wipe_owned"];
  if (typeof wipe !== "function") return;
  try {
    (wipe as () => void)();
  } catch {
    // Mark failure before diagnostic construction: a replaced Error constructor must not leave
    // the cleanup attempt looking successful. Keep a primitive fallback if construction throws.
    const message = "FUNGI-WASM-CLEANUP-001: owned-memory cleanup failed after guest trap or host cleanup error";
    attempt.failed = true;
    attempt.failure = message;
    onCleanupFailure?.();
    const failure = new Error(message);
    attempt.failure = failure;
    throw failure;
  }
}

function combineCleanupFailure(primary: unknown, cleanup: unknown): AggregateError {
  return new AggregateError(
    [primary, cleanup],
    `FUNGI-WASM-CLEANUP-001: cleanup failed while handling ${primary instanceof Error ? primary.message : String(primary)}`,
  );
}

function refuseIncompleteSecretCopy(detail: string): never {
  throw new Error(`FUNGI-WASM-RET-001: incomplete secret return copy (${detail})`);
}

/**
 * After a guest export returns, copy `returnWordCount` i32 words from the
 * pointer when the guest tagged a heap result, then wipe
 * `[WAT_HEAP_BASE, $__fungi_heap)`. One word stays a number (numeric-fold ABI);
 * several words become a frozen array. Modules without `__fungi_wipe_owned`
 * are unchanged. Incomplete copies (oversize tag, zero/negative tag, short
 * memory) refuse rather than returning a truncated success.
 */
export function finalizeSecretExportResult(
  instance: WebAssembly.Instance,
  result: unknown,
  layout?: readonly RecordCopyField[],
): unknown {
  const rawInstance = RAW_ADMITTED_INSTANCES.get(instance) ?? instance;
  const callState = ADMITTED_EXPORT_CALL_STATES.get(rawInstance);
  if (callState !== undefined) {
    refuseQuarantinedInstance(callState);
    if (callState.active) {
      throw new Error("FUNGI-WASM-REENTRANT-001: secret result finalization refused while an admitted export is active");
    }
  }
  try {
    if (callState !== undefined) setAdmittedCallActive(callState, true);
    return finalizeSecretExportResultWithAttempt(
      requireWasmInstanceExports(rawInstance),
      result,
      layout,
      createCleanupAttempt(),
      undefined,
      undefined,
      callState === undefined ? undefined : () => quarantineAdmittedInstance(callState),
    );
  } finally {
    if (callState !== undefined) setAdmittedCallActive(callState, false);
  }
}

function finalizeSecretExportResultWithAttempt(
  exports: Record<string, unknown>,
  result: unknown,
  layout: readonly RecordCopyField[] | undefined,
  cleanup: CleanupAttempt,
  ownedReturnShape?: OwnedReturnShape,
  ownedReturnCopier?: OwnedReturnCopier,
  onCleanupFailure?: () => void,
): unknown {
  const wipe = exports["__fungi_wipe_owned"];
  const scalarResult = result === undefined || typeof result === "number" || typeof result === "bigint";
  if (!scalarResult) {
    const detail = typeof result === "function" ? "function-valued" : "reference or multi-value";
    let refusal: unknown;
    try {
      refusal = new Error(`FUNGI-WASM-REFERENCE-001: ${detail} export results are not admitted`);
    } catch (diagnosticErr) {
      refusal = diagnosticErr;
    }
    if (typeof wipe !== "function") throw refusal;
    try {
      wipeOwnedSecrets(exports, cleanup, onCleanupFailure);
    } catch (cleanupErr) {
      throw combineCleanupFailure(refusal, cleanupErr);
    }
    throw refusal;
  }
  if (typeof wipe !== "function") {
    if (layout !== undefined || (ownedReturnShape !== undefined && ownedReturnShapeRequiresCleanup(ownedReturnShape))) {
      refuseIncompleteSecretCopy("declared return schema has no owned-memory cleanup export");
    }
    return result;
  }
  let finalized: unknown = result;
  let copyFailure: unknown;
  let copyFailed = false;
  try {
    if (ownedReturnShape !== undefined) {
      if (typeof result !== "number" || ownedReturnCopier === undefined) {
        refuseIncompleteSecretCopy("attested owned-return metadata has no runtime copier or scalar handle");
      }
      if (layout !== undefined) refuseIncompleteSecretCopy("attested and legacy return layouts cannot overlap");
      finalized = ownedReturnCopier(ownedReturnShape, result);
    } else {
      const heapResult = exports["__fungi_ret_is_heap_get"];
      const resultIsHeapPointer = typeof heapResult === "function" && (heapResult as () => number)() === 1;
      if (layout !== undefined && !resultIsHeapPointer) {
        refuseIncompleteSecretCopy("declared return layout requires a heap-result tag");
      }
      if (layout !== undefined && (
        typeof result !== "number"
        || !Number.isSafeInteger(result)
        || result < WAT_HEAP_BASE
        || (result & 3) !== 0
      )) {
        refuseIncompleteSecretCopy("declared return layout requires an aligned in-heap result pointer");
      }
      if (
        resultIsHeapPointer
        && typeof result === "number"
        && Number.isSafeInteger(result)
        && result >= WAT_HEAP_BASE
        && (result & 3) === 0
      ) {
      const memory = exports["memory"];
      if (isWasmMemory(memory)) {
        if (layout !== undefined) {
          const { view, wordLength } = readWasmWordView(memory);
          admitCopyFields(layout, 0);
          const copied = copyGuestRecord(view, wordLength, result, layout, 0, new Set(), { count: 0 });
          finalized = freezeCopyRow(copied);
        } else {
          const start = result >>> 2;
          const wordsGet = exports["__fungi_ret_words_get"];
          const taggedWords = typeof wordsGet === "function" ? (wordsGet as () => number)() : 1;
          if (!Number.isSafeInteger(taggedWords) || taggedWords <= 0) {
            refuseIncompleteSecretCopy(`taggedWords=${String(taggedWords)}`);
          }
          if (taggedWords > MAX_COPIED_RECORD_WORDS) {
            refuseIncompleteSecretCopy(`taggedWords=${taggedWords} max=${MAX_COPIED_RECORD_WORDS}`);
          }
          // The guest metadata call may grow memory and detach an ordinary-memory
          // view, so acquire the private view only after all guest calls finish.
          const { view, wordLength } = readWasmWordView(memory);
          const remaining = wordLength - start;
          if (start < 0 || remaining < taggedWords) {
            refuseIncompleteSecretCopy(`short memory remaining=${remaining} taggedWords=${taggedWords}`);
          }
          const words: number[] = [];
          for (let i = 0; i < taggedWords; i++) {
            const word = view[start + i];
            if (typeof word !== "number") {
              refuseIncompleteSecretCopy(`unavailable copied word index=${i}`);
            }
            WASM_REFLECT_APPLY(WASM_OBJECT_DEFINE_PROPERTY, Object, [
              words,
              i,
              safeDataPropertyDescriptor(word, true, true, true),
            ]);
          }
          finalized = words.length === 1
            ? words[0]!
            : WASM_REFLECT_APPLY(WASM_OBJECT_FREEZE, Object, [words]);
        }
      } else if (layout !== undefined) {
        refuseIncompleteSecretCopy("declared return layout requires exported linear memory");
      }
      }
    }
  } catch (err) {
    copyFailed = true;
    copyFailure = err;
  }
  try {
    wipeOwnedSecrets(exports, cleanup, onCleanupFailure);
  } catch (cleanupErr) {
    if (copyFailed) throw combineCleanupFailure(copyFailure, cleanupErr);
    throw cleanupErr;
  }
  if (copyFailed) throw copyFailure;
  return finalized;
}

/** Call an admitted export then apply guest-owned secret finalize. */
export function invokeAdmittedExport(
  instance: WebAssembly.Instance,
  exportName: string,
  args: readonly number[],
  layout?: readonly RecordCopyField[],
): { readonly ok: true; readonly result: unknown } | { readonly ok: false; readonly reason: string } {
  const isAdmittedWrapper = RAW_ADMITTED_INSTANCES.has(instance);
  if (!isAdmittedWrapper && nodeTypes.isProxy(instance)) {
    return { ok: false, reason: "unregistered proxy instance refused" };
  }
  const raw = RAW_ADMITTED_INSTANCES.get(instance) ?? instance;
  const rawExports = getWasmInstanceExports(raw);
  if (rawExports === undefined) {
    return { ok: false, reason: "a genuine WebAssembly.Instance is required" };
  }
  if (!ADMITTED_RAW_INSTANCES.has(raw)) {
    return { ok: false, reason: "instance has not completed admission" };
  }
  if (isAdmittedWrapper && layout !== undefined) {
    return { ok: false, reason: "per-call return-layout override refused; admitted layout is fixed at admission" };
  }
  if (SECRET_HELPER_EXPORTS.has(exportName)) {
    return { ok: false, reason: `reserved secret helper export '${exportName}' cannot be invoked as an application export` };
  }
  const capturedLayouts = isAdmittedWrapper ? ADMITTED_RETURN_LAYOUTS.get(instance) : undefined;
  const effectiveLayout = isAdmittedWrapper ? capturedLayouts?.[exportName] : layout;
  const ownedReturnShape = isAdmittedWrapper
    ? ADMITTED_OWNED_RETURN_SCHEMAS.get(instance)?.[exportName]
    : undefined;
  const ownedReturnCopier = isAdmittedWrapper ? ADMITTED_OWNED_RETURN_COPIERS.get(instance) : undefined;
  const fn = rawExports[exportName];
  if (typeof fn !== "function") {
    return { ok: false, reason: `export '${exportName}' is not a callable function of the module` };
  }
  const helperFunctions = WASM_REFLECT_APPLY(WASM_WEAKMAP_GET, ADMITTED_SECRET_HELPER_FUNCTIONS, [raw]) as
    | ReadonlyMap<Function, string>
    | undefined;
  if (helperFunctions !== undefined && WASM_REFLECT_APPLY(WASM_MAP_GET, helperFunctions, [fn]) !== undefined) {
    return { ok: false, reason: `reserved secret helper export '${exportName}' cannot be invoked as an application export` };
  }
  const callState = admittedExportCallState(raw);
  if (callState.quarantined) {
    return { ok: false, reason: "FUNGI-WASM-QUARANTINED-001: instance refused after owned-memory cleanup failure" };
  }
  if (callState.active) {
    return {
      ok: false,
      reason: "FUNGI-WASM-REENTRANT-001: nested admitted export refused while a prior export is active",
    };
  }
  setAdmittedCallActive(callState, true);
  const cleanup = createCleanupAttempt();
  const onCleanupFailure = () => quarantineAdmittedInstance(callState);
  try {
    const value = (fn as (...a: number[]) => unknown)(...args);
    return {
      ok: true,
      result: finalizeSecretExportResultWithAttempt(
        rawExports, value, effectiveLayout, cleanup, ownedReturnShape, ownedReturnCopier,
        onCleanupFailure,
      ),
    };
  } catch (err) {
    if (!cleanup.attempted) {
      try {
        wipeOwnedSecrets(rawExports, cleanup, onCleanupFailure);
      } catch (cleanupErr) {
        quarantineAdmittedInstance(callState);
        err = combineCleanupFailure(err, cleanupErr);
      }
    }
    if (cleanup.failed) quarantineAdmittedInstance(callState);
    return {
      ok: false,
      reason: `trap during '${exportName}': ${err instanceof Error ? err.message : String(err)}`,
    };
  } finally {
    setAdmittedCallActive(callState, false);
  }
}

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
  const effectivePolicy: AdmissionPolicy =
    policy.requireCertifiedProfile ? { ...policy, requireSigned: true } : policy;
  const hash = wasmHash(wasm);
  if (!attestation) return { ok: false, reason: "no attestation provided", hash };
  if (attestation.sha256 !== hash) {
    return { ok: false, reason: `attestation hash ${attestation.sha256} ≠ binary hash ${hash}`, hash };
  }
  if (effectivePolicy.requireCertifiedProfile && attestation.profile !== "certified") {
    return { ok: false, reason: `certified profile required, attestation is "${attestation.profile}"`, hash };
  }
  if (effectivePolicy.allowedHashes && effectivePolicy.allowedHashes.length > 0 && !effectivePolicy.allowedHashes.includes(hash)) {
    return { ok: false, reason: `binary hash not pinned: ${hash}`, hash };
  }
  if (effectivePolicy.requireSigned) {
    if (!attestation.signature) return { ok: false, reason: "signature required but absent", hash };
    if (!effectivePolicy.publicKeyPem) return { ok: false, reason: "no public key configured to verify signature", hash };
    try {
      // #173: verify over (domain ∥ recomputed-hash ∥ attestation.profile). `hash` is the recomputed
      // binary hash (already checked === attestation.sha256 above), so a flipped profile changes the
      // pre-image and the signature fails — closing the re-label privilege escalation.
      const ok = edVerify(
        null,
        admissionPreimage(hash, attestation.profile),
        { key: effectivePolicy.publicKeyPem, dsaEncoding: "ieee-p1363" },
        Buffer.from(attestation.signature, "base64"),
      );
      if (!ok) return { ok: false, reason: "signature verification failed", hash };
    } catch (e) {
      return { ok: false, reason: `signature check error: ${(e as Error).message}`, hash };
    }
  }
  return { ok: true, hash };
}

// ─────────────────────────────────────────────────────────────────────────────
// Observability (dev lens only — never affects enforcement)
// ─────────────────────────────────────────────────────────────────────────────

export interface Observer {
  /** Each host-import call: name, args, return value. */
  readonly onHostCall?: (name: string, args: readonly number[], ret: number | undefined) => void;
  /** Attestation refusal — fired BEFORE any instantiation, with the rejected binary. */
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
  /** Bind the instance's exported memory after instantiation (for record reads). */
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

const FACTORY_HOST_RUNTIMES = new WeakSet<HostRuntime>();

type OptionKind = "i32" | "f64";
type OptionEntry = { readonly kind: OptionKind; readonly value: number };

/** Schema for one record field when copying array-of-record values. Nested
 *  `record` fields occupy one i32 pointer slot and recurse. */
export type RecordCopyField =
  | { readonly kind: "i32" }
  | { readonly kind: "record"; readonly fields: readonly RecordCopyField[] };

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

const effectGrantSignatureModules = new Map<string, WebAssembly.Module>();

function effectGrantSignatureModule(entry: WasmEffectGrantAbiEntry): WebAssembly.Module {
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
  entry: WasmEffectGrantAbiEntry,
  handler: (...args: number[]) => number,
): (...args: number[]) => number {
  const bridge = new WebAssembly.Instance(effectGrantSignatureModule(entry), {
    bridge: { callback: handler },
  });
  const callback = bridge.exports.callback;
  if (typeof callback !== "function") {
    throw new TypeError(`Wasm effect-grant signature bridge did not export '${entry.name}'`);
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

function zeroCopyShape(fields: readonly RecordCopyField[]): unknown[] {
  return fields.map((field) => (field.kind === "i32" ? 0 : zeroCopyShape(field.fields)));
}

function freezeCopyRow(row: readonly unknown[]): readonly unknown[] {
  return Object.freeze(row.map((cell) => (Array.isArray(cell) ? freezeCopyRow(cell) : cell)));
}

function copyGuestRecord(
  view: Int32Array,
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
  if (start < 0 || view.length - start < fields.length) {
    refuseHostCopy("short memory for nested record copy");
  }
  visiting.add(ptr);
  const row: unknown[] = [];
  for (let i = 0; i < fields.length; i++) {
    const field = fields[i]!;
    const word = view[start + i]!;
    if (field.kind === "i32") row.push(word);
    else row.push(copyGuestRecord(view, word, field.fields, depth + 1, visiting, nodes));
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
     * host imports in its import table (e.g. the DSS supervisor's "audit.write") links ONLY
     * if the admitting caller explicitly supplies a handler for that exact effect name here.
     * No handler → the import stays outside the closed set → admission refuses with
     * CRITICAL_SECURITY_VIOLATION, exactly as before (this parameter cannot weaken that).
     * Every granted call is routed through the observer tap, so the audit layer sees it.
     */
    readonly effectHandlers?: Readonly<Record<string, (a: number, b: number) => number>>;
  },
): HostRuntime {
  const strings: string[] = [];
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
    if (strings.length >= MAX_WASM_STRINGS) {
      throw new Error("String store exceeds the host bound");
    }
    const id = strings.length;
    strings.push(s);
    return id;
  };
  const results: { tag: "ok" | "err"; value: number }[] = [];
  // Option values need their own registry. A raw i32 payload cannot carry presence: -1 is a
  // perfectly valid Int, so the old `Some(v) = v / None = -1` convention made Some(-1) absent.
  // `-1` remains the wire-level None value for compatibility; every Some is a non-negative
  // handle whose payload is stored here. Raw array access stays separate for counted loops.
  const options: OptionEntry[] = [];
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
    if (options.length >= MAX_WASM_HOST_RECORDS) {
      throw new Error("Option store exceeds the host bound");
    }
    const id = options.length;
    options.push({ kind: entry.kind, value: entry.value });
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

  const host: Record<string, (...a: number[]) => number | void> = {
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
    __array_first_option_v2: (id: number) => {
      const a = arrays[id] ?? [];
      const option = a.length > 0 ? internOption({ kind: "i32", value: a[0]! | 0 }) : -1;
      return tap("__array_first_option_v2", [id], option) as number;
    },
    __array_last_option_v2: (id: number) => {
      const a = arrays[id] ?? [];
      const option = a.length > 0 ? internOption({ kind: "i32", value: a[a.length - 1]! | 0 }) : -1;
      return tap("__array_last_option_v2", [id], option) as number;
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
    __option_none_v2: () => tap("__option_none_v2", [], -1) as number,
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
        ? Math.floor(memory.buffer.byteLength / 4)
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

  // Sanctioned effect grants (see the `grants` doc above): explicit, per-admission, deny-by-
  // default. The stdlib bridge can never be shadowed by a grant — bridge names win.
  const grantAbiByName = new Map(WASM_EFFECT_GRANT_ABI.map((entry) => [entry.name, entry]));
  for (const [effect, fn] of Object.entries(grants?.effectHandlers ?? {})) {
    const abi = grantAbiByName.get(effect);
    if (!abi) {
      throw makeEffectGrantDiag(`effect grant '${effect}' is not in the closed non-secret WASM effect-grant ABI [${[...grantAbiByName.keys()].join(", ")}]`);
    }
    if (typeof fn !== "function") {
      throw makeEffectGrantDiag(`effect grant '${effect}' handler is not a function`);
    }
    if (Object.prototype.hasOwnProperty.call(host, effect)) continue;
    host[effect] = typeEffectGrantHandler(abi, (a: number, b: number) =>
      tap(effect, [a, b], fn(a, b)) as number,
    );
  }

  const runtime: HostRuntime = {
    imports: Object.freeze({ host: Object.freeze(host) }),
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
      memory = m;
      rangeFuel = Math.floor(m.buffer.byteLength / 4);
    },
    readRecordField(ptr: number, slot: number): number {
      if (memory === null) throw new Error("readRecordField before bindMemory");
      return new Int32Array(memory.buffer)[(ptr >>> 2) + slot] ?? 0;
    },
    internArray(items: readonly number[]): number {
      if (items.length > MAX_WASM_ARRAY_ITEMS) {
        throw new Error("Array cardinality exceeds the host bound");
      }
      return internArrayItems(items.map((x) => x | 0));
    },
    copyArrayRecords(handle: number, fieldCount: number): readonly (readonly number[])[] {
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
      const view = new Int32Array(memory.buffer);
      for (const ptr of ptrs) {
        if (!Number.isSafeInteger(ptr) || ptr < WAT_HEAP_BASE || (ptr & 3) !== 0) {
          throw new Error(`FUNGI-WASM-HOST-001: record pointer ${String(ptr)} is not an aligned heap record`);
        }
        const start = ptr >>> 2;
        if (start < 0 || view.length - start < fieldCount) {
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
      if (memory === null) refuseHostCopy("copyArrayRecordsLayout before bindMemory");
      admitCopyFields(fields, 0);
      const stored = arrays[handle];
      if (stored === undefined || !Number.isInteger(handle) || handle < 0) {
        refuseHostCopy(`unknown array handle ${String(handle)}`);
      }
      const ptrs = stored.slice();
      const view = new Int32Array(memory.buffer);
      const nodes = { count: 0 };
      const out: unknown[] = [];
      for (const ptr of ptrs) {
        out.push(copyGuestRecord(view, ptr, fields, 0, new Set(), nodes));
      }
      return Object.freeze(out.map((row) => freezeCopyRow(row as unknown[])));
    },
    allocRecord(fields: readonly number[]): number {
      if (memory === null) throw new Error("allocRecord before bindMemory — instantiate the module first (fail-closed)");
      if (fields.length === 0) throw new Error("allocRecord: a record must have ≥1 field (fail-closed)");
      const words = new Int32Array(memory.buffer);
      const start = recordBump >>> 2;
      // Bounds-check BEFORE any write — a staged record that would spill past linear memory traps at
      // construction rather than corrupting memory or silently truncating (RD-0389 §5 fail-closed).
      if (start + fields.length > words.length) {
        throw new Error("allocRecord: record staging overflowed linear memory (fail-closed)");
      }
      for (let i = 0; i < fields.length; i++) words[start + i] = fields[i]! | 0;
      const ptr = recordBump;
      recordBump += fields.length * WAT_REC_FIELD_SIZE;
      return ptr;
    },
    snapshotMemory(): Uint8Array | null {
      return memory === null ? null : new Uint8Array(memory.buffer.slice(0));
    },
  };
  FACTORY_HOST_RUNTIMES.add(runtime);
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
 * Throws `CRITICAL_SECURITY_VIOLATION: …` on any attestation failure — and fires
 * `observe.onViolation` with the rejected binary before throwing.
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
}): Promise<AdmissionResult> {
  const wasm = snapshotWasmBytes(opts.wasm);
  const verdict = verifyWasm(wasm, opts.attestation, opts.policy);
  if (!verdict.ok) {
    // Attestation First: dump state and refuse BEFORE any host function is linked.
    opts.observe?.onViolation?.(verdict.reason ?? "attestation failed", wasm);
    throw new Error(`CRITICAL_SECURITY_VIOLATION: ${verdict.reason ?? "attestation failed"} (hash=${verdict.hash})`);
  }
  if (wasmHash(wasm) !== verdict.hash) {
    throw new Error("CRITICAL_SECURITY_VIOLATION: admitted bytes changed before instantiate");
  }
  if (!FACTORY_HOST_RUNTIMES.has(opts.host)) {
    const reason = "host runtime was not created by createHostRuntime";
    opts.observe?.onViolation?.(reason, wasm);
    throw new Error(`CRITICAL_SECURITY_VIOLATION: ${reason} (hash=${verdict.hash})`);
  }
  // Instantiate with ONLY the closed host import object. A LinkError here means the
  // module declared a host import the closed set does NOT provide — i.e. it tried to
  // reach a capability outside its grant. Fail CLOSED: classify it as a CRITICAL
  // security violation (fire onViolation, then throw) rather than leaking a raw
  // LinkError that a caller might mistake for an ordinary runtime fault (#105).
  let wasmResult: unknown;
  try {
    const compiled = await WebAssembly.compile(wasm as Uint8Array<ArrayBuffer>);
    const provided = opts.host.imports as unknown as Record<string, Record<string, unknown>>;
    for (const imp of WebAssembly.Module.imports(compiled)) {
      const effectGrant = WASM_EFFECT_GRANT_ABI.find(
        (entry) => entry.module === imp.module && entry.name === imp.name,
      );
      if (effectGrant !== undefined && imp.kind !== "function") {
        throw new WebAssembly.LinkError(
          `effect grant import kind mismatch: ${imp.module}.${imp.name} is declared ${imp.kind}, expected function`,
        );
      }
      const namespace = Object.prototype.hasOwnProperty.call(provided, imp.module)
        ? provided[imp.module]
        : undefined;
      if (namespace === undefined || !Object.prototype.hasOwnProperty.call(namespace, imp.name)) {
        throw new WebAssembly.LinkError(
          `disallowed host import: import ${imp.module}.${imp.name} (${imp.kind}) is not provided`,
        );
      }
    }
    wasmResult = await WebAssembly.instantiate(compiled, opts.host.imports);
  } catch (err) {
    const reason = err instanceof WebAssembly.LinkError
      ? `module import/link failed: ${err.message}`
      : `instantiation failed: ${err instanceof Error ? err.message : String(err)}`;
    opts.observe?.onViolation?.(reason, wasm);
    throw new Error(`CRITICAL_SECURITY_VIOLATION: ${reason} (hash=${verdict.hash})`);
  }
  const instance = (wasmResult as { instance?: WebAssembly.Instance }).instance
    ?? (wasmResult as WebAssembly.Instance);
  const mem = (instance.exports as Record<string, unknown>)["memory"];
  if (mem instanceof WebAssembly.Memory) opts.host.bindMemory(mem);
  return { instance: wrapAdmittedExports(instance, opts.returnLayouts), host: opts.host, hash: verdict.hash };
}

const SECRET_HELPER_EXPORTS = new Set([
  "__fungi_wipe_owned",
  "__fungi_heap_get",
  "__fungi_ret_is_heap_get",
  "__fungi_ret_words_get",
]);
const RAW_ADMITTED_INSTANCES = new WeakMap<WebAssembly.Instance, WebAssembly.Instance>();

function wrapAdmittedExports(
  instance: WebAssembly.Instance,
  returnLayouts?: Readonly<Record<string, readonly RecordCopyField[]>>,
): WebAssembly.Instance {
  const wrappedExports: Record<string, unknown> = Object.create(null);
  for (const [name, value] of Object.entries(instance.exports)) {
    if (typeof value === "function" && !SECRET_HELPER_EXPORTS.has(name)) {
      const layout = returnLayouts?.[name];
      wrappedExports[name] = (...args: unknown[]) => {
        const cleanup = createCleanupAttempt();
        try {
          const result = (value as (...a: unknown[]) => unknown)(...args);
          return finalizeSecretExportResultWithAttempt(
            instance,
            result,
            layout,
            cleanup,
          );
        } catch (err) {
          if (!cleanup.attempted) {
            try {
              wipeOwnedSecrets(instance.exports as Record<string, unknown>, cleanup);
            } catch (cleanupErr) {
              throw combineCleanupFailure(err, cleanupErr);
            }
          }
          throw err;
        }
      };
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
  return wrapped;
}

const MAX_COPIED_RECORD_WORDS = 64;

interface CleanupAttempt {
  attempted: boolean;
  failed: boolean;
  failure?: unknown;
}

function createCleanupAttempt(): CleanupAttempt {
  return { attempted: false, failed: false };
}

function wipeOwnedSecrets(exports: Record<string, unknown>, attempt: CleanupAttempt): void {
  if (attempt.attempted) {
    if (attempt.failed) throw attempt.failure;
    return;
  }
  attempt.attempted = true;
  const wipe = exports["__fungi_wipe_owned"];
  if (typeof wipe !== "function") return;
  try {
    (wipe as () => void)();
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    const failure = new Error(`FUNGI-WASM-CLEANUP-001: owned-memory cleanup failed (${detail})`);
    Object.defineProperty(failure, "cause", { value: cause, configurable: true });
    attempt.failed = true;
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
  return finalizeSecretExportResultWithAttempt(instance, result, layout, createCleanupAttempt());
}

function finalizeSecretExportResultWithAttempt(
  instance: WebAssembly.Instance,
  result: unknown,
  layout: readonly RecordCopyField[] | undefined,
  cleanup: CleanupAttempt,
): unknown {
  const exports = instance.exports as Record<string, unknown>;
  const wipe = exports["__fungi_wipe_owned"];
  if (typeof wipe !== "function") return result;
  let finalized = result;
  let copyFailure: unknown;
  let copyFailed = false;
  try {
    const heapResult = exports["__fungi_ret_is_heap_get"];
    const resultIsHeapPointer = typeof heapResult === "function" && (heapResult as () => number)() === 1;
    if (
      resultIsHeapPointer
      && typeof result === "number"
      && Number.isSafeInteger(result)
      && result >= WAT_HEAP_BASE
      && (result & 3) === 0
    ) {
      const memory = exports["memory"];
      if (memory instanceof WebAssembly.Memory) {
        const view = new Int32Array(memory.buffer);
        if (layout !== undefined) {
          admitCopyFields(layout, 0);
          const copied = copyGuestRecord(view, result, layout, 0, new Set(), { count: 0 });
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
          const remaining = view.length - start;
          if (start < 0 || remaining < taggedWords) {
            refuseIncompleteSecretCopy(`short memory remaining=${remaining} taggedWords=${taggedWords}`);
          }
          const words: number[] = [];
          for (let i = 0; i < taggedWords; i++) words.push(view[start + i]!);
          finalized = words.length === 1 ? words[0]! : Object.freeze(words);
        }
      }
    }
  } catch (err) {
    copyFailed = true;
    copyFailure = err;
  }
  try {
    wipeOwnedSecrets(exports, cleanup);
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
  const raw = RAW_ADMITTED_INSTANCES.get(instance) ?? instance;
  const fn = (raw.exports as Record<string, unknown>)[exportName];
  if (typeof fn !== "function") {
    return { ok: false, reason: `export '${exportName}' is not a callable function of the module` };
  }
  const cleanup = createCleanupAttempt();
  try {
    const value = (fn as (...a: number[]) => unknown)(...args);
    return { ok: true, result: finalizeSecretExportResultWithAttempt(raw, value, layout, cleanup) };
  } catch (err) {
    if (!cleanup.attempted) {
      try {
        wipeOwnedSecrets(raw.exports as Record<string, unknown>, cleanup);
      } catch (cleanupErr) {
        err = combineCleanupFailure(err, cleanupErr);
      }
    }
    return {
      ok: false,
      reason: `trap during '${exportName}': ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

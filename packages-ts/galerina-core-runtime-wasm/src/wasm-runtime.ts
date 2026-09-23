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

type OptionKind = "i32" | "f64";
type OptionEntry = { readonly kind: OptionKind; readonly value: number };

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

/** Exact base-10 host Decimal (mirrors compiler decimal-arith.ts; no IEEE-754). */
function parseHostDecimal(text: string): { unscaled: bigint; scale: number } | null {
  const match = /^([+-]?)(\d*)(?:\.(\d*))?$/.exec(text.trim());
  if (!match) return null;
  const sign = match[1] === "-" ? -1n : 1n;
  const intPart = match[2] ?? "";
  const fracPart = match[3] ?? "";
  if (intPart === "" && fracPart === "") return null;
  const digits = intPart + fracPart;
  return { unscaled: sign * BigInt(digits === "" ? "0" : digits), scale: fracPart.length };
}

function formatHostDecimal(unscaled: bigint, scale: number): string {
  const neg = unscaled < 0n;
  let digits = (neg ? -unscaled : unscaled).toString();
  if (scale === 0) return (neg ? "-" : "") + digits;
  while (digits.length <= scale) digits = "0" + digits;
  return (neg ? "-" : "") + digits.slice(0, digits.length - scale) + "." + digits.slice(digits.length - scale);
}

function alignHostDecimal(
  left: { unscaled: bigint; scale: number },
  right: { unscaled: bigint; scale: number },
): { ua: bigint; ub: bigint; scale: number } {
  const scale = Math.max(left.scale, right.scale);
  const pow = (n: number): bigint => 10n ** BigInt(n);
  return {
    ua: left.unscaled * pow(scale - left.scale),
    ub: right.unscaled * pow(scale - right.scale),
    scale,
  };
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
  const results: { tag: "ok" | "err"; value: number }[] = [];
  // Option values need their own registry. A raw i32 payload cannot carry presence: -1 is a
  // perfectly valid Int, so the old `Some(v) = v / None = -1` convention made Some(-1) absent.
  // `-1` remains the wire-level None value for compatibility; every Some is a non-negative
  // handle whose payload is stored here. Raw array access stays separate for counted loops.
  const options: OptionEntry[] = [];
  const moneys: { currency: string; amountStr: string }[] = [];
  const decimals: string[] = [];
  let memory: WebAssembly.Memory | null = null;
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
      const id = arrays.length; arrays.push([]);
      return tap("__array_create", [], id) as number;
    },
    __array_append: (id: number, item: number) => {
      (arrays[id] ?? (arrays[id] = [])).push(item);
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
      const id = strings.length; strings.push(String(n | 0));
      return tap("__int_to_str", [n], id) as number;
    },
    __float_to_str: (n: number) => {
      if (!Number.isFinite(n)) throw new Error("NonFiniteFloat");
      const id = strings.length; strings.push(String(n));
      return tap("__float_to_str", [n], id) as number;
    },
    __result_ok: (value: number) => {
      const id = results.length; results.push({ tag: "ok", value });
      return tap("__result_ok", [value], id) as number;
    },
    __result_err: (value: number) => {
      const id = results.length; results.push({ tag: "err", value });
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
      const id = strings.length; strings.push((strings[a] ?? "") + (strings[b] ?? ""));
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
    __str_to_lower: (h: number) => { const id = strings.length; strings.push((strings[h] ?? "").toLowerCase()); return tap("__str_to_lower", [h], id) as number; },
    __str_to_upper: (h: number) => { const id = strings.length; strings.push((strings[h] ?? "").toUpperCase()); return tap("__str_to_upper", [h], id) as number; },
    __str_trim: (h: number) => { const id = strings.length; strings.push((strings[h] ?? "").trim()); return tap("__str_trim", [h], id) as number; },
    __str_slice: (h: number, start: number, end: number) => { const id = strings.length; strings.push((strings[h] ?? "").slice(start, end)); return tap("__str_slice", [h, start, end], id) as number; },
    // #162/#169 — Char.toUpper/toLower return a Char (code point), not a String handle.
    __char_to_upper: (code: number) => tap("__char_to_upper", [code], code >= 0 ? (String.fromCodePoint(code).toUpperCase().codePointAt(0) ?? code) : code) as number,
    __char_to_lower: (code: number) => tap("__char_to_lower", [code], code >= 0 ? (String.fromCodePoint(code).toLowerCase().codePointAt(0) ?? code) : code) as number,
    __str_to_int: (h: number) => {
      const n = parseInt(strings[h] ?? "", 10);
      return tap("__str_to_int", [h], Number.isNaN(n) ? -1 : n) as number; // Option<Int>: -1 = None
    },
    __str_to_int_option_v2: (h: number) => {
      const n = parseInt(strings[h] ?? "", 10);
      const option = Number.isNaN(n) ? -1 : options.push({ kind: "i32", value: n | 0 }) - 1;
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
      const id = strings.length; strings.push(code >= 0 ? String.fromCodePoint(code) : "");
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
      const option = i >= 0 && i < a.length ? options.push({ kind: "i32", value: a[i]! | 0 }) - 1 : -1;
      return tap("__array_get_option_v2", [id, i], option) as number;
    },
    __array_first_option_v2: (id: number) => {
      const a = arrays[id] ?? [];
      const option = a.length > 0 ? options.push({ kind: "i32", value: a[0]! | 0 }) - 1 : -1;
      return tap("__array_first_option_v2", [id], option) as number;
    },
    __array_last_option_v2: (id: number) => {
      const a = arrays[id] ?? [];
      const option = a.length > 0 ? options.push({ kind: "i32", value: a[a.length - 1]! | 0 }) - 1 : -1;
      return tap("__array_last_option_v2", [id], option) as number;
    },
    __str_char_at_option_v2: (strHandle: number, idx: number) => {
      const cps = [...(strings[strHandle] ?? "")];
      const code = idx >= 0 && idx < cps.length ? (cps[idx]!.codePointAt(0) ?? -1) : -1;
      const option = code >= 0 ? options.push({ kind: "i32", value: code | 0 }) - 1 : -1;
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
      const handle = options.push({ kind: "i32", value: x | 0 }) - 1;
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
      const handle = options.push({ kind: "f64", value: x }) - 1;
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
    // Each accepts a string handle (the amount) and returns a Money handle (i32
    // index into the moneys registry). The host stores { currency, amountStr } so
    // WASM code can pass the handle back to a method or to the observer.
    // NOTE: `strings[amountStrHandle]` retrieves the amount; an unknown handle
    // yields "0.00" (fail-safe). The observer receives the handle, not the currency.
    __money_gbp: (h: number) => { const id = moneys.length; moneys.push({ currency: "GBP", amountStr: strings[h] ?? "0.00" }); return tap("__money_gbp", [h], id) as number; },
    __money_eur: (h: number) => { const id = moneys.length; moneys.push({ currency: "EUR", amountStr: strings[h] ?? "0.00" }); return tap("__money_eur", [h], id) as number; },
    __money_usd: (h: number) => { const id = moneys.length; moneys.push({ currency: "USD", amountStr: strings[h] ?? "0.00" }); return tap("__money_usd", [h], id) as number; },
    __money_chf: (h: number) => { const id = moneys.length; moneys.push({ currency: "CHF", amountStr: strings[h] ?? "0.00" }); return tap("__money_chf", [h], id) as number; },
    __money_jpy: (h: number) => { const id = moneys.length; moneys.push({ currency: "JPY", amountStr: strings[h] ?? "0.00" }); return tap("__money_jpy", [h], id) as number; },
    __money_cad: (h: number) => { const id = moneys.length; moneys.push({ currency: "CAD", amountStr: strings[h] ?? "0.00" }); return tap("__money_cad", [h], id) as number; },
    __money_aud: (h: number) => { const id = moneys.length; moneys.push({ currency: "AUD", amountStr: strings[h] ?? "0.00" }); return tap("__money_aud", [h], id) as number; },
    __money_nzd: (h: number) => { const id = moneys.length; moneys.push({ currency: "NZD", amountStr: strings[h] ?? "0.00" }); return tap("__money_nzd", [h], id) as number; },
    __money_sgd: (h: number) => { const id = moneys.length; moneys.push({ currency: "SGD", amountStr: strings[h] ?? "0.00" }); return tap("__money_sgd", [h], id) as number; },
    __money_hkd: (h: number) => { const id = moneys.length; moneys.push({ currency: "HKD", amountStr: strings[h] ?? "0.00" }); return tap("__money_hkd", [h], id) as number; },

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
      if (to <= from) {
        const id = arrays.length;
        arrays.push([]);
        return tap("__range", [lo, hi], id) as number;
      }
      const count = to - from;
      const guestWords = memory !== null
        ? Math.floor(memory.buffer.byteLength / 4)
        : UNBOUND_GUEST_WORDS;
      if (count > guestWords) {
        throw new Error("Array.range: cardinality exceeds guest memory");
      }
      if (count > rangeFuel) {
        throw new Error("Array.range: fuel exhausted");
      }
      rangeFuel -= count;
      const items: number[] = [];
      for (let i = from; i < to; i++) items.push(i);
      const id = arrays.length; arrays.push(items);
      return tap("__range", [lo, hi], id) as number;
    },

    __decimal_from_str: (h: number) => {
      const text = strings[h];
      if (text === undefined || parseHostDecimal(text) === null) {
        throw new Error("MalformedDecimal");
      }
      const id = decimals.length;
      decimals.push(text);
      return tap("__decimal_from_str", [h], id) as number;
    },
    __decimal_to_str: (h: number) => {
      const text = decimals[h];
      if (text === undefined) throw new Error(`unknown Decimal handle ${h} (fail-closed)`);
      const id = strings.length;
      strings.push(text);
      return tap("__decimal_to_str", [h], id) as number;
    },
    __decimal_add: (a: number, b: number) => {
      const left = parseHostDecimal(decimals[a] ?? "");
      const right = parseHostDecimal(decimals[b] ?? "");
      if (!left || !right) throw new Error("MalformedDecimal");
      const { ua, ub, scale } = alignHostDecimal(left, right);
      const id = decimals.length;
      decimals.push(formatHostDecimal(ua + ub, scale));
      return tap("__decimal_add", [a, b], id) as number;
    },
    __decimal_sub: (a: number, b: number) => {
      const left = parseHostDecimal(decimals[a] ?? "");
      const right = parseHostDecimal(decimals[b] ?? "");
      if (!left || !right) throw new Error("MalformedDecimal");
      const { ua, ub, scale } = alignHostDecimal(left, right);
      const id = decimals.length;
      decimals.push(formatHostDecimal(ua - ub, scale));
      return tap("__decimal_sub", [a, b], id) as number;
    },
    __decimal_mul: (a: number, b: number) => {
      const left = parseHostDecimal(decimals[a] ?? "");
      const right = parseHostDecimal(decimals[b] ?? "");
      if (!left || !right) throw new Error("MalformedDecimal");
      const id = decimals.length;
      decimals.push(formatHostDecimal(left.unscaled * right.unscaled, left.scale + right.scale));
      return tap("__decimal_mul", [a, b], id) as number;
    },
    __decimal_neg: (h: number) => {
      const parsed = parseHostDecimal(decimals[h] ?? "");
      if (!parsed) throw new Error("MalformedDecimal");
      const id = decimals.length;
      decimals.push(formatHostDecimal(-parsed.unscaled, parsed.scale));
      return tap("__decimal_neg", [h], id) as number;
    },
    __decimal_compare: (a: number, b: number) => {
      const left = parseHostDecimal(decimals[a] ?? "");
      const right = parseHostDecimal(decimals[b] ?? "");
      if (!left || !right) throw new Error("MalformedDecimal");
      const { ua, ub } = alignHostDecimal(left, right);
      const cmp = ua < ub ? -1 : ua > ub ? 1 : 0;
      return tap("__decimal_compare", [a, b], cmp) as number;
    },
    __decimal_div: (a: number, b: number, scale: number, modeHandle: number) => {
      const left = parseHostDecimal(decimals[a] ?? "");
      const right = parseHostDecimal(decimals[b] ?? "");
      const mode = strings[modeHandle];
      if (!left || !right || !Number.isInteger(scale) || scale < 0 || scale > 100) {
        throw new Error("MalformedDecimal");
      }
      if (right.unscaled === 0n) throw new Error("DivideByZero");
      const modes = new Set(["halfEven", "halfUp", "halfDown", "up", "down", "ceiling", "floor"]);
      if (mode === undefined || !modes.has(mode)) throw new Error("MalformedDecimal");
      const exp = scale + right.scale - left.scale;
      let num = left.unscaled;
      let den = right.unscaled;
      const pow = (n: number): bigint => 10n ** BigInt(n);
      if (exp >= 0) num *= pow(exp);
      else den *= pow(-exp);
      if (den < 0n) { num = -num; den = -den; }
      const q = num / den;
      const r = num - q * den;
      let rounded = q;
      if (r !== 0n) {
        const neg = num < 0n;
        const twiceAbsR = (r < 0n ? -r : r) * 2n;
        let roundAway = false;
        if (mode === "up") roundAway = true;
        else if (mode === "down") roundAway = false;
        else if (mode === "floor") roundAway = neg;
        else if (mode === "ceiling") roundAway = !neg;
        else if (mode === "halfUp") roundAway = twiceAbsR >= den;
        else if (mode === "halfDown") roundAway = twiceAbsR > den;
        else roundAway = twiceAbsR > den || (twiceAbsR === den && (q % 2n) !== 0n);
        if (roundAway) rounded = neg ? q - 1n : q + 1n;
      }
      const id = decimals.length;
      decimals.push(formatHostDecimal(rounded, scale));
      return tap("__decimal_div", [a, b, scale, modeHandle], id) as number;
    },
    __decimal_rem: (a: number, b: number) => {
      const left = parseHostDecimal(decimals[a] ?? "");
      const right = parseHostDecimal(decimals[b] ?? "");
      if (!left || !right) throw new Error("MalformedDecimal");
      if (right.unscaled === 0n) throw new Error("DivideByZero");
      const { ua, ub, scale } = alignHostDecimal(left, right);
      const q = ua / ub;
      const id = decimals.length;
      decimals.push(formatHostDecimal(ua - q * ub, scale));
      return tap("__decimal_rem", [a, b], id) as number;
    },
  };

  // Sanctioned effect grants (see the `grants` doc above): explicit, per-admission, deny-by-
  // default. The stdlib bridge can never be shadowed by a grant — bridge names win.
  for (const [effect, fn] of Object.entries(grants?.effectHandlers ?? {})) {
    if (Object.prototype.hasOwnProperty.call(host, effect)) continue;
    host[effect] = (a: number, b: number) => tap(effect, [a, b], fn(a, b)) as number;
  }

  return {
    imports: { host },
    internString(s: string): number {
      const id = strings.length; strings.push(s); return id;
    },
    seedString(handle: number, s: string): void { strings[handle] = s; },
    readString(handle: number) { return strings[handle]; },
    readArray(handle: number) { return arrays[handle]; },
    readResult(handle: number) { return results[handle]; },
    readOption(handle: number) { return handle === -1 ? { tag: "none" } : { tag: "some", value: optionEntry(handle).value }; },
    readMoney(handle: number) { return moneys[handle]; },
    readDecimal(handle: number) { return decimals[handle]; },
    internDecimal(text: string): number {
      if (parseHostDecimal(text) === null) throw new Error("MalformedDecimal");
      const id = decimals.length;
      decimals.push(text);
      return id;
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
      const id = arrays.length; arrays.push(items.map((x) => x | 0)); return id;
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
  // Instantiate with ONLY the closed host import object. A LinkError here means the
  // module declared a host import the closed set does NOT provide — i.e. it tried to
  // reach a capability outside its grant. Fail CLOSED: classify it as a CRITICAL
  // security violation (fire onViolation, then throw) rather than leaking a raw
  // LinkError that a caller might mistake for an ordinary runtime fault (#105).
  let wasmResult: unknown;
  try {
    wasmResult = await WebAssembly.instantiate(wasm, opts.host.imports);
  } catch (err) {
    const reason = err instanceof WebAssembly.LinkError
      ? `disallowed host import (module requires an import outside the closed host set): ${err.message}`
      : `instantiation failed: ${err instanceof Error ? err.message : String(err)}`;
    opts.observe?.onViolation?.(reason, wasm);
    throw new Error(`CRITICAL_SECURITY_VIOLATION: ${reason} (hash=${verdict.hash})`);
  }
  const instance = (wasmResult as { instance?: WebAssembly.Instance }).instance
    ?? (wasmResult as WebAssembly.Instance);
  const mem = (instance.exports as Record<string, unknown>)["memory"];
  if (mem instanceof WebAssembly.Memory) opts.host.bindMemory(mem);
  return { instance: wrapAdmittedExports(instance), host: opts.host, hash: verdict.hash };
}

const SECRET_HELPER_EXPORTS = new Set([
  "__fungi_wipe_owned",
  "__fungi_heap_get",
  "__fungi_ret_is_heap_get",
  "__fungi_ret_words_get",
]);
const RAW_ADMITTED_INSTANCES = new WeakMap<WebAssembly.Instance, WebAssembly.Instance>();

function wrapAdmittedExports(instance: WebAssembly.Instance): WebAssembly.Instance {
  const wrappedExports: Record<string, unknown> = Object.create(null);
  for (const [name, value] of Object.entries(instance.exports)) {
    if (typeof value === "function" && !SECRET_HELPER_EXPORTS.has(name)) {
      wrappedExports[name] = (...args: unknown[]) =>
        finalizeSecretExportResult(instance, (value as (...a: unknown[]) => unknown)(...args));
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

/**
 * After a guest export returns, copy `returnWordCount` i32 words from the
 * pointer when the guest tagged a heap result, then wipe
 * `[WAT_HEAP_BASE, $__fungi_heap)`. One word stays a number (numeric-fold ABI);
 * several words become a frozen array. Modules without `__fungi_wipe_owned`
 * are unchanged.
 */
export function finalizeSecretExportResult(
  instance: WebAssembly.Instance,
  result: unknown,
): unknown {
  const exports = instance.exports as Record<string, unknown>;
  const wipe = exports["__fungi_wipe_owned"];
  if (typeof wipe !== "function") return result;
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
      const start = result >>> 2;
      const wordsGet = exports["__fungi_ret_words_get"];
      const taggedWords = typeof wordsGet === "function" ? (wordsGet as () => number)() : 1;
      const count = Math.min(
        MAX_COPIED_RECORD_WORDS,
        Math.max(1, Number.isSafeInteger(taggedWords) ? taggedWords : 1),
        Math.max(0, view.length - start),
      );
      if (count > 0 && start < view.length) {
        const words: number[] = [];
        for (let i = 0; i < count; i++) words.push(view[start + i]!);
        (wipe as () => void)();
        return words.length === 1 ? words[0]! : Object.freeze(words);
      }
    }
  }
  (wipe as () => void)();
  return result;
}

/** Call an admitted export then apply guest-owned secret finalize. */
export function invokeAdmittedExport(
  instance: WebAssembly.Instance,
  exportName: string,
  args: readonly number[],
): { readonly ok: true; readonly result: unknown } | { readonly ok: false; readonly reason: string } {
  const raw = RAW_ADMITTED_INSTANCES.get(instance) ?? instance;
  const fn = (raw.exports as Record<string, unknown>)[exportName];
  if (typeof fn !== "function") {
    return { ok: false, reason: `export '${exportName}' is not a callable function of the module` };
  }
  try {
    const value = (fn as (...a: number[]) => unknown)(...args);
    return { ok: true, result: finalizeSecretExportResult(raw, value) };
  } catch (err) {
    return {
      ok: false,
      reason: `trap during '${exportName}': ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

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
 * Crypto is Ed25519 via node:crypto (the same primitive the Tower uses for bridge
 * attestation; the compiler signs its own runner artifacts, it does not import the
 * Tower). This keeps the layering clean: compiler → node:crypto, never → tower.
 */

import {
  sign as edSign, verify as edVerify, generateKeyPairSync, createHash,
} from "node:crypto";
// RD-0389 record-marshalling ABI (ARG direction): the record staging base + field size are the
// SAME constants the emitter lays records out with, so a host-staged record and a module-built one
// share one layout (single source of truth — no drift). Used only inside allocRecord (call-time),
// so the wat-emitter ↔ wasm-runtime edge is init-order-safe even under a cycle.
import { WAT_HEAP_BASE, WAT_REC_FIELD_SIZE } from "./wat-emitter.js";

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
  const sig = edSign(null, admissionPreimage(sha256, profile) as unknown as BufferSource, { key: privateKeyPem, dsaEncoding: "ieee-p1363" });
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
        admissionPreimage(hash, attestation.profile) as unknown as BufferSource,
        { key: effectivePolicy.publicKeyPem, dsaEncoding: "ieee-p1363" },
        Buffer.from(attestation.signature, "base64") as unknown as BufferSource,
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
  let memory: WebAssembly.Memory | null = null;
  // RD-0389: host bump pointer for records STAGED to pass in (allocRecord), based at the same
  // WAT_HEAP_BASE the emitter allocates from. Monotone for this host's lifetime — a fresh host per
  // scenario resets it, and it never overlaps a heap-free consuming flow (which makes no allocations).
  let recordBump = WAT_HEAP_BASE;

  const tap = (name: string, args: number[], ret: number | undefined): number | undefined => {
    observe?.onHostCall?.(name, args, ret);
    return ret;
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
    // Option/Result sentinel convention at the WASM boundary: None / empty / not-found
    // is encoded as -1; Some(v) is v itself (string/array/char handles are all >= 0).
    __str_concat: (a: number, b: number) => {
      const id = strings.length; strings.push((strings[a] ?? "") + (strings[b] ?? ""));
      return tap("__str_concat", [a, b], id) as number;
    },
    __str_length: (h: number) => tap("__str_length", [h], [...(strings[h] ?? "")].length) as number, // #170: code-point length (consistent with __str_count/__str_char_at)
    __str_eq: (a: number, b: number) => tap("__str_eq", [a, b], (strings[a] ?? "") === (strings[b] ?? "") ? 1 : 0) as number,
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
    // Array ops — handles index `arrays`. Out-of-range / empty ⇒ -1 (None sentinel).
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
    // Option/Result helpers.
    __unwrap_or: (opt: number, def: number) => tap("__unwrap_or", [opt, def], opt >= 0 ? opt : def) as number,
    __option_some: (x: number) => tap("__option_some", [x], x) as number,
    __option_none: () => tap("__option_none", [], -1) as number,
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
    bindMemory(m: WebAssembly.Memory) { memory = m; },
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
export async function admitAndInstantiate(opts: {
  wasm: Uint8Array;
  attestation: WasmAttestation | undefined;
  policy: AdmissionPolicy;
  host: HostRuntime;
  observe?: Observer;
}): Promise<AdmissionResult> {
  const verdict = verifyWasm(opts.wasm, opts.attestation, opts.policy);
  if (!verdict.ok) {
    // Attestation First: dump state and refuse BEFORE any host function is linked.
    opts.observe?.onViolation?.(verdict.reason ?? "attestation failed", opts.wasm);
    throw new Error(`CRITICAL_SECURITY_VIOLATION: ${verdict.reason ?? "attestation failed"} (hash=${verdict.hash})`);
  }
  // Instantiate with ONLY the closed host import object. A LinkError here means the
  // module declared a host import the closed set does NOT provide — i.e. it tried to
  // reach a capability outside its grant. Fail CLOSED: classify it as a CRITICAL
  // security violation (fire onViolation, then throw) rather than leaking a raw
  // LinkError that a caller might mistake for an ordinary runtime fault (#105).
  let wasmResult: unknown;
  try {
    wasmResult = await WebAssembly.instantiate(opts.wasm as BufferSource, opts.host.imports);
  } catch (err) {
    const reason = err instanceof WebAssembly.LinkError
      ? `disallowed host import (module requires an import outside the closed host set): ${err.message}`
      : `instantiation failed: ${err instanceof Error ? err.message : String(err)}`;
    opts.observe?.onViolation?.(reason, opts.wasm);
    throw new Error(`CRITICAL_SECURITY_VIOLATION: ${reason} (hash=${verdict.hash})`);
  }
  const instance = (wasmResult as { instance?: WebAssembly.Instance }).instance
    ?? (wasmResult as WebAssembly.Instance);
  const mem = (instance.exports as Record<string, unknown>)["memory"];
  if (mem instanceof WebAssembly.Memory) opts.host.bindMemory(mem);
  return { instance, host: opts.host, hash: verdict.hash };
}

// =============================================================================
// prefilter.ts — deny-only ternary (Kleene-3) admission pre-filter.
//
// ⚠️ THIS IS A PERFORMANCE PRE-FILTER, NOT A SECURITY BOUNDARY. ⚠️
//
// It evaluates a bit-packed K3 (+1 / 0 / -1) subject vector against a PUBLIC
// capability/requirement mask and returns exactly one of two verdicts:
//   • Verdict.Deny  — cheaply proven mismatch (authoritative reject).
//   • Verdict.Maybe — could NOT be cheaply rejected; the caller MUST now run the
//                     real keyed crypto gate. Maybe is NOT an allow.
//
// The mask C is PUBLIC, so the dot-product form I = Σ Sᵢ·Cᵢ has ZERO
// unforgeability: an attacker sets S = C and hits the max score with no secret.
// That is precisely why Maybe is never an Allow — the only sound use is
//   final = prefilter == Deny ? DENY : realKeyedGate()   (see compose.ts::admit)
//
// Encoding: 2 bits per trit, 4 trits per byte (little-endian within a byte).
//   0b00 = 0 (don't-care/absent), 0b01 = +1 (present), 0b10 = -1 (forbidden),
//   0b11 = reserved → treated as a hard Deny (fail-closed) anywhere it appears.
// 256 trits pack into a 64-byte cache line.
//
// TS-native port of the RD-0162/0163 sound half. The Rust/C-ABI/WASM core lives
// in the INDEPENDENT ZT-tritsocket repo (not vendored here); this port keeps the
// same encoding and ABI-compatible verdict values (Deny=0, Maybe=1).
// =============================================================================

/** The two — and only two — verdicts. There is deliberately no `Allow`. */
export const Verdict = {
  /** Cheaply proven mismatch — reject now. Authoritative. */
  Deny: 0,
  /** Not cheaply rejected — the caller MUST run the real keyed gate next. NOT an allow. */
  Maybe: 1,
} as const;
export type Verdict = (typeof Verdict)[keyof typeof Verdict];

/** A trit value in the Kleene-3 alphabet. */
export type Trit = -1 | 0 | 1;

/** Number of packed bytes needed for `lenTrits` trits. */
export function packedLen(lenTrits: number): number {
  return Math.floor((lenTrits + 3) / 4);
}

/**
 * Pack a slice of trit values (-1 | 0 | +1) into the 2-bit encoding.
 * Any value outside {-1,0,1} is encoded as reserved 0b11 (which the pre-filter
 * treats as a hard Deny).
 */
export function pack(trits: readonly number[]): Uint8Array {
  const out = new Uint8Array(packedLen(trits.length));
  for (let i = 0; i < trits.length; i++) {
    const t = trits[i];
    const code = t === 0 ? 0b00 : t === 1 ? 0b01 : t === -1 ? 0b10 : 0b11;
    const idx = i >> 2;
    out[idx] = (out[idx] ?? 0) | (code << ((i & 3) * 2));
  }
  return out;
}

/** Decode the 2-bit code at logical index `i`; OOB reads return reserved (fail-closed). */
function codeAt(packed: Uint8Array, i: number): number {
  const byte = packed[i >> 2];
  if (byte === undefined) return 0b11; // out of bounds → reserved → Deny
  return (byte >> ((i & 3) * 2)) & 0b11;
}

/** Decode a 2-bit code to its trit value; reserved (0b11) decodes to `null`. */
function tritOf(code: number): Trit | null {
  return code === 0b00 ? 0 : code === 0b01 ? 1 : code === 0b10 ? -1 : null;
}

/** Decode a packed buffer back to `lenTrits` trit values (reserved → 0). Interop/debug helper. */
export function unpack(packed: Uint8Array, lenTrits: number): Trit[] {
  const out: Trit[] = new Array<Trit>(lenTrits).fill(0);
  for (let i = 0; i < lenTrits; i++) out[i] = tritOf(codeAt(packed, i)) ?? 0;
  return out;
}

/**
 * The core deny-only pre-filter. For each lane the PUBLIC mask C states a requirement:
 *   • Cᵢ = +1 (must be present): a cheap Deny if Sᵢ != +1.
 *   • Cᵢ = -1 (must be absent):  a cheap Deny if Sᵢ == +1.
 *   • Cᵢ =  0 (don't care):      no constraint.
 * Any reserved code, or an undersized buffer, → Deny (fail-closed). Otherwise → Maybe.
 * `Deny` is authoritative (a necessary condition truly failed); `Maybe` defers to the real gate.
 */
export function prefilter(
  subjectPacked: Uint8Array,
  maskPacked: Uint8Array,
  lenTrits: number,
): Verdict {
  const need = packedLen(lenTrits);
  if (subjectPacked.length < need || maskPacked.length < need) return Verdict.Deny;
  for (let i = 0; i < lenTrits; i++) {
    const s = tritOf(codeAt(subjectPacked, i));
    const c = tritOf(codeAt(maskPacked, i));
    if (s === null || c === null) return Verdict.Deny; // reserved anywhere → fail-closed
    if (c === 1 && s !== 1) return Verdict.Deny;        // required capability absent
    if (c === -1 && s === 1) return Verdict.Deny;       // forbidden capability present
  }
  return Verdict.Maybe;
}

/**
 * The forgeable dot-product functional I = Σ Sᵢ·Cᵢ. For interoperability/benchmarks ONLY.
 * ⚠️ Its output MUST NOT be used as an allow: over a public mask C, S = C maximises I with
 * no secret. Reserved codes contribute 0 (and should have been Denied by `prefilter` first).
 */
export function dot(subjectPacked: Uint8Array, maskPacked: Uint8Array, lenTrits: number): number {
  const need = packedLen(lenTrits);
  if (subjectPacked.length < need || maskPacked.length < need) return 0;
  let acc = 0;
  for (let i = 0; i < lenTrits; i++) {
    acc += (tritOf(codeAt(subjectPacked, i)) ?? 0) * (tritOf(codeAt(maskPacked, i)) ?? 0);
  }
  return acc;
}

/**
 * Batch-evaluate `n` contiguous subjects (each `packedLen(lenTrits)` bytes) against one mask.
 * Honest complexity: Θ(n · lenTrits) — a fast constant-factor per lane, but LINEAR in the work,
 * NOT O(1). "A million connections in the time of ten" is false; a million is ~100000× ten.
 */
export function prefilterBatch(
  subjects: Uint8Array,
  maskPacked: Uint8Array,
  lenTrits: number,
  n: number,
): Verdict[] {
  const stride = packedLen(lenTrits);
  const out: Verdict[] = new Array(n).fill(Verdict.Deny);
  for (let k = 0; k < n; k++) {
    out[k] = prefilter(subjects.subarray(k * stride, (k + 1) * stride), maskPacked, lenTrits);
  }
  return out;
}

/** ABI/version probe — matches the native ZT-tritsocket core (ts_abi_version). */
export const ABI_VERSION = 1;

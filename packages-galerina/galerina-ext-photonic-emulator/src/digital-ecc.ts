/**
 * digital-ecc.ts — digital forward-error-correction (FEC) for the post-ADC readout of the noisy/photonic
 * lane. Extended Hamming(8,4) SEC-DED: per 4-bit codeword it CORRECTS any single-bit error and DETECTS
 * (but refuses to "correct") any double-bit error.
 *
 * ZERO-TRUST / honesty fences (this is a degrade-only DATA codec, never a trust primitive):
 *   • Fail-closed by construction. A double-bit error returns `{ kind: "uncorrectable" }` — the decoder
 *     NEVER guesses a "corrected" value it cannot stand behind. The caller degrades (recompute on the
 *     digital core, or trap), it does not consume a maybe-wrong word. Silent miscorrection is the exact
 *     fail-open this code exists to avoid.
 *   • NOT for crypto / hashes / signatures / the K3 verdict. Those stay BIT-EXACT on the deterministic
 *     digital core (SPORE-SUBSTRATE-001 / crypto-on-core). FEC corrects a NOISY analog readout of a COMPUTE
 *     result; it does not manufacture integrity for a value that must be exact a priori.
 *   • Bounded power, stated plainly. Hamming SEC-DED corrects ≤1 and detects =2 bit errors PER codeword.
 *     ≥3 bit errors can alias to a wrong syndrome and be silently miscorrected — the fundamental limit of
 *     a distance-4 code. That is why FEC is a COMPLEMENT to, not a replacement for, the lane-level NMR
 *     majority vote (substrate-model) and the per-call conformance gate (parity-conformance): independent
 *     redundancy layers, never trusted alone. A photonic result is admitted only after the conformance
 *     gate agrees with the binary reference within `substrate { tolerance }`.
 *
 * The codeword layout is the textbook Hamming(7,4) (parity at positions 1,2,4; data at 3,5,6,7) plus an
 * overall parity bit at position 0 that upgrades single-error-correct to single-correct / double-detect.
 */

export type EccDecode =
  | { readonly kind: "ok"; readonly data: number }                              // clean — no error
  | { readonly kind: "corrected"; readonly data: number; readonly bit: number } // 1-bit error, fixed (Hamming position 0..7)
  | { readonly kind: "uncorrectable" };                                         // ≥2-bit error detected — fail-closed

const bit = (x: number, i: number): number => (x >> i) & 1;

/** Encode a 4-bit data nibble (0..15) into an 8-bit extended-Hamming SEC-DED codeword (0..255). */
export function eccEncodeNibble(data4: number): number {
  if (!Number.isInteger(data4) || data4 < 0 || data4 > 15) {
    throw new RangeError(`eccEncodeNibble: data must be a 4-bit nibble (0..15), got ${data4}`);
  }
  // Hamming data positions 3,5,6,7 carry the four data bits d0..d3 (LSB-first).
  const d3 = bit(data4, 0), d5 = bit(data4, 1), d6 = bit(data4, 2), d7 = bit(data4, 3);
  const p1 = d3 ^ d5 ^ d7;  // covers positions {1,3,5,7}
  const p2 = d3 ^ d6 ^ d7;  // covers positions {2,3,6,7}
  const p4 = d5 ^ d6 ^ d7;  // covers positions {4,5,6,7}
  // pos[1..7]
  const c1 = p1, c2 = p2, c3 = d3, c4 = p4, c5 = d5, c6 = d6, c7 = d7;
  const p0 = c1 ^ c2 ^ c3 ^ c4 ^ c5 ^ c6 ^ c7; // overall parity → total parity of positions 0..7 is even
  return (
    (p0 << 0) | (c1 << 1) | (c2 << 2) | (c3 << 3) |
    (c4 << 4) | (c5 << 5) | (c6 << 6) | (c7 << 7)
  );
}

/** Extract the 4 data bits (positions 3,5,6,7) from an 8-bit codeword into a nibble. */
function extractData(cw: number): number {
  return bit(cw, 3) | (bit(cw, 5) << 1) | (bit(cw, 6) << 2) | (bit(cw, 7) << 3);
}

/**
 * Decode an 8-bit codeword, fail-closed. Returns the clean data, a single-bit correction, or
 * `uncorrectable` for a detected double-bit error (NEVER a silently miscorrected value at distance 2).
 */
export function eccDecodeNibble(codeword: number): EccDecode {
  if (!Number.isInteger(codeword) || codeword < 0 || codeword > 255) {
    return { kind: "uncorrectable" }; // out-of-range input cannot be trusted — fail-closed
  }
  const s1 = bit(codeword, 1) ^ bit(codeword, 3) ^ bit(codeword, 5) ^ bit(codeword, 7);
  const s2 = bit(codeword, 2) ^ bit(codeword, 3) ^ bit(codeword, 6) ^ bit(codeword, 7);
  const s4 = bit(codeword, 4) ^ bit(codeword, 5) ^ bit(codeword, 6) ^ bit(codeword, 7);
  const syndrome = s1 | (s2 << 1) | (s4 << 2); // 0 = no Hamming error, else the 1..7 error position
  let overall = 0;
  for (let i = 0; i < 8; i++) overall ^= bit(codeword, i); // 1 ⇒ odd number of bit errors

  if (overall === 1) {
    // Odd error count ⇒ a single bit flipped (correctable). syndrome 0 means the flip was the overall
    // parity bit itself (position 0) — the data is already intact.
    if (syndrome === 0) return { kind: "corrected", data: extractData(codeword), bit: 0 };
    return { kind: "corrected", data: extractData(codeword ^ (1 << syndrome)), bit: syndrome };
  }
  // overall === 0
  if (syndrome === 0) return { kind: "ok", data: extractData(codeword) }; // clean
  return { kind: "uncorrectable" }; // even error count with a non-zero syndrome ⇒ double-bit error — DETECTED, not fixed
}

/**
 * Encode a byte stream: each data byte → two SEC-DED codeword bytes (low nibble, then high nibble).
 * Output length is 2× the input.
 */
export function eccEncode(data: Uint8Array): Uint8Array {
  const out = new Uint8Array(data.length * 2);
  for (let i = 0; i < data.length; i++) {
    out[i * 2] = eccEncodeNibble(data[i] & 0x0f);
    out[i * 2 + 1] = eccEncodeNibble((data[i] >> 4) & 0x0f);
  }
  return out;
}

export type EccBlockResult =
  | { readonly kind: "ok"; readonly data: Uint8Array; readonly corrections: number }
  | { readonly kind: "uncorrectable"; readonly at: number }; // codeword index of the first uncorrectable nibble

/**
 * Decode a codeword stream (even length, low/high nibble pairs). Fail-closed: the FIRST uncorrectable
 * codeword aborts the whole block with its index — a block is never returned partially-trusted.
 */
export function eccDecode(codewords: Uint8Array): EccBlockResult {
  if (codewords.length % 2 !== 0) return { kind: "uncorrectable", at: codewords.length - 1 };
  const out = new Uint8Array(codewords.length / 2);
  let corrections = 0;
  for (let i = 0; i < codewords.length; i += 2) {
    const lo = eccDecodeNibble(codewords[i]);
    const hi = eccDecodeNibble(codewords[i + 1]);
    if (lo.kind === "uncorrectable") return { kind: "uncorrectable", at: i };
    if (hi.kind === "uncorrectable") return { kind: "uncorrectable", at: i + 1 };
    if (lo.kind === "corrected") corrections++;
    if (hi.kind === "corrected") corrections++;
    out[i / 2] = (lo.data & 0x0f) | ((hi.data & 0x0f) << 4);
  }
  return { kind: "ok", data: out, corrections };
}

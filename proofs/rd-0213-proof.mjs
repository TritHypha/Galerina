// proof-RD-0213.mjs
// HEAD RD-0213 — 2-bit tri-state packing on binary silicon + SIMD bitwise masking + two's complement.
// Claims to verify (kind=maths):
//   (A) Encoding: 00=0/boundary, 01=+1, 10=-1, 11=reserved-error.
//   (B) 64-bit register holds 32 tri-state edges (64/2).
//   (C) 64-byte L1 cache line holds 256 tri-state edges (64*8/2).
//   (D) Bitwise NOR selects 00 (boundary): NOR(00)=11(all-ones/true), anything else -> not-all-ones.
//   (E) Two's complement: the 2-bit pattern 10, read as a signed 2-bit integer, is -1;
//       and the ALU adds it natively (a - 1 == a + (two's-complement of 1)).
// Convention (per task): assert-FAIL any overclaim, assert-PASS the corrected value.
// Uses node built-ins only.

import assert from 'node:assert/strict';

const log = (...a) => console.log(...a);
let pass = 0;
function check(name, fn) { fn(); pass++; log('PASS  ' + name); }

// ---------------------------------------------------------------------------
// (A) Encoding table. Two bits -> 4 patterns; 3 used, 1 reserved.
// ---------------------------------------------------------------------------
const ENC = { 0: 0b00, 1: 0b01, [-1]: 0b10 };   // tri-state -> 2-bit code
const RESERVED = 0b11;                            // 11 = error/wipe
check('(A) 2 bits yield exactly 4 patterns', () => {
  assert.equal(1 << 2, 4);
});
check('(A) encoding is 00=0, 01=+1, 10=-1, 11=reserved (distinct codes)', () => {
  assert.equal(ENC[0], 0b00);
  assert.equal(ENC[1], 0b01);
  assert.equal(ENC[-1], 0b10);
  assert.equal(RESERVED, 0b11);
  const codes = new Set([ENC[0], ENC[1], ENC[-1], RESERVED]);
  assert.equal(codes.size, 4);                   // all four distinct -> lossless
});

// ---------------------------------------------------------------------------
// (B) 64-bit register: 64 bits / 2 bits per edge = 32 edges.
// ---------------------------------------------------------------------------
const BITS_PER_EDGE = 2;
check('(B) 64-bit register holds 32 tri-state edges', () => {
  assert.equal(64 / BITS_PER_EDGE, 32);
});

// ---------------------------------------------------------------------------
// (C) 64-byte L1 line: 64 bytes * 8 bits / 2 = 256 edges. (Re-derives RD-0166.)
// ---------------------------------------------------------------------------
check('(C) 64-byte L1 cache line holds 256 tri-state edges', () => {
  assert.equal((64 * 8) / BITS_PER_EDGE, 256);
});
// Empirical pack: fill a 64-byte buffer with 256 edges, unpack, compare.
check('(C-empirical) actually pack/unpack 256 edges into 64 bytes losslessly', () => {
  const N = 256;
  const buf = new Uint8Array(64);                // 64 bytes = one L1 line
  // deterministic tri-state stream over {0,+1,-1}
  const stream = Array.from({ length: N }, (_, i) => [0, 1, -1][i % 3]);
  for (let i = 0; i < N; i++) {
    const code = ENC[stream[i]];                 // 2-bit code
    const byteIdx = i >> 2;                       // 4 edges per byte
    const shift = (i & 3) * 2;                    // 0,2,4,6
    buf[byteIdx] |= code << shift;
  }
  const out = [];
  for (let i = 0; i < N; i++) {
    const byteIdx = i >> 2;
    const shift = (i & 3) * 2;
    const code = (buf[byteIdx] >> shift) & 0b11;
    const val = code === 0b00 ? 0 : code === 0b01 ? 1 : code === 0b10 ? -1 : 'ERR';
    out.push(val);
  }
  assert.deepEqual(out, stream);                 // exact round-trip, 256 edges, 64 bytes
});

// ---------------------------------------------------------------------------
// (D) Bitwise NOR selects the 00 (boundary) state.
// For a single 2-bit lane, NOR(x) = ~x & 0b11. Boundary 00 -> 11 (all-ones/true);
// every other code -> not-all-ones. This is the "select all zeros" mask.
// ---------------------------------------------------------------------------
function nor2(x) { return (~x) & 0b11; }
check('(D) NOR(00) == 11 (boundary selected -> true)', () => {
  assert.equal(nor2(0b00), 0b11);
});
check('(D) NOR of any non-00 code != 11 (not selected)', () => {
  assert.notEqual(nor2(0b01), 0b11);             // +1 -> 10
  assert.notEqual(nor2(0b10), 0b11);             // -1 -> 01
  assert.notEqual(nor2(0b11), 0b11);             // reserved -> 00
});
// SIMD-style: NOR a whole 8-bit lane-vector (4 edges) and reduce per-lane.
check('(D-vector) NOR mask flags exactly the boundary lanes in a packed byte', () => {
  // pack [ +1, 0, -1, 0 ] -> lanes 0..3
  const vals = [1, 0, -1, 0];
  let packed = 0;
  vals.forEach((v, i) => { packed |= ENC[v] << (i * 2); });
  const nored = (~packed) & 0xff;                // NOR across the byte
  // a lane is boundary iff its 2-bit NOR result == 11
  const boundaryLanes = [];
  for (let i = 0; i < 4; i++) {
    if (((nored >> (i * 2)) & 0b11) === 0b11) boundaryLanes.push(i);
  }
  assert.deepEqual(boundaryLanes, [1, 3]);       // exactly the two 0-state lanes
});

// ---------------------------------------------------------------------------
// (E) Two's complement. THE NOTE OVERCLAIMS: it says the ALU natively reads the
// 2-bit pattern "10" as -1. That is FALSE. In native 2-bit two's complement the
// field {00,01,10,11} = {0, +1, -2, -1}. So the raw pattern 10 = -2, not -1.
// The "10 = -1" in the note is a *label mapping* (a lookup the software imposes),
// NOT what the silicon's signed-2-bit interpretation yields. We assert the REAL
// native value here and keep the label mapping separate & explicit.
// ---------------------------------------------------------------------------
function signed2(code) {                          // NATIVE two's-complement value of a 2-bit field
  return (code & 0b10) ? code - 4 : code;         // sign-extend from 2 bits: 00,01,10,11 -> 0,1,-2,-1
}
check('(E) NATIVE two\'s-complement of the 2-bit field: 00->0, 01->+1, 10->-2, 11->-1', () => {
  assert.equal(signed2(0b00), 0);
  assert.equal(signed2(0b01), 1);
  assert.equal(signed2(0b10), -2);  // <-- the note's "10 = -1 natively" is REFUTED: it is -2
  assert.equal(signed2(0b11), -1);
});
// The tri-state "-1" is a decoded LABEL, not the field's native signed value.
const LABEL = { 0b00: 0, 0b01: 1, 0b10: -1, 0b11: 'ERR' }; // software-imposed mapping
check('(E-label) the "10 = -1" claim only holds as a decode/label, not native ALU signed value', () => {
  assert.equal(LABEL[0b10], -1);                  // label says -1
  assert.notEqual(signed2(0b10), LABEL[0b10]);    // but the native field value (-2) differs
});
// ALU "subtraction is addition of the complement": 5 - 1 == 5 + twoscomp(1)
check('(E) ALU adds -1 natively: a + (-1) via two\'s complement on 8-bit lane', () => {
  const width = 8, mask = 0xff;
  const a = 5;
  const negOne = ((~1) + 1) & mask;              // two's complement of 1 in 8 bits = 0xFF
  assert.equal(negOne, 0xff);
  const sum = (a + negOne) & mask;               // hardware add, drop carry
  assert.equal(sum, 4);                          // 5 + (-1) == 4, no subtract circuit
});
// Signed-Laplacian-style accumulation. CAVEAT the note misses: you CANNOT just add
// the raw 2-bit fields (that would treat -1 as -2 and give the wrong sum). Correct
// tri-state arithmetic requires decoding each 2-bit code to a proper signed int
// (label map / a real sign-extend of the *tri-state*, not the 2-bit field) FIRST.
check('(E-accumulate) WRONG if you add raw 2-bit fields; RIGHT only after decoding the label', () => {
  const edges = [1, 1, -1, 0, -1, 1, -1, 0]; // true sum = 0
  const trueSum = edges.reduce((s, v) => s + v, 0);
  assert.equal(trueSum, 0);
  // (a) naive: feed the raw 2-bit field to the ALU -> treats -1 as -2 -> WRONG
  const naive = edges.reduce((s, v) => s + signed2(ENC[v]), 0);
  assert.notEqual(naive, trueSum);                // demonstrates the trap: -3 != 0
  assert.equal(naive, -3);
  // (b) correct: decode the tri-state label first, then accumulate -> RIGHT
  const correct = edges.reduce((s, v) => s + LABEL[ENC[v]], 0);
  assert.equal(correct, trueSum);
});

// ---------------------------------------------------------------------------
// (F) GUARD: refute the *overclaim* that the packing changes the ORDER of work.
// Selecting the boundary set still touches all N lanes: it is Theta(N), not O(1).
// (Per binding RD-0036/0156/0157/0166: SIMD cuts the CONSTANT, never the ORDER.)
// This block ASSERT-FAILS the "O(1) regardless of N" claim and ASSERT-PASSES Theta(N).
// ---------------------------------------------------------------------------
check('(F) boundary-select is Theta(N): lanes touched scales linearly, NOT O(1)', () => {
  function lanesTouched(N) {                      // must inspect every packed lane
    let touched = 0;
    for (let i = 0; i < N; i++) touched++;        // even SIMD reads all N/lanes-per-op groups
    return touched;
  }
  const t1 = lanesTouched(256);
  const t2 = lanesTouched(256 * 1000);
  // OVERCLAIM ("same fraction of a nanosecond for 100 or 100 billion") would be t1 === t2.
  assert.notEqual(t1, t2);                        // FAILS the O(1) overclaim
  assert.equal(t2 / t1, 1000);                    // PASSES the Theta(N) reality
});

log('\nALL ' + pass + ' CHECKS PASSED');
log('Summary: encoding lossless (4 distinct 2-bit codes); 64/2=32 edges/register; ' +
    '64*8/2=256 edges/L1-line (empirically round-tripped); NOR selects the 00 boundary. ' +
    'CAVEAT (E): the note\'s "10 = -1 natively in the ALU" is imprecise — the raw 2-bit ' +
    'field 10 sign-extends to -2, so tri-state values must be DECODED (label/sign-extended ' +
    'as tri-state) before ALU add; adding raw fields gives the wrong sum. ' +
    'Guard (F): boundary-select stays Theta(N) — the "O(1)/same-time-regardless-of-count" ' +
    'framing elsewhere in the note is REFUTED (SIMD cuts the constant, not the order).');
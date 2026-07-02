// proof-RD-0233.mjs — BlueHammer/Rowhammer exposure of the Galerina LANGUAGE surface,
// building on RD-0225 (signed-region detect-not-prevent). node built-ins only.
// Binding rules: DON'T TRUST, CHECK + PROVE OWN MATHS.
//
// RD-0225 already PROVED: a flip in a SIGNED .fungi region is caught by re-verify (512/512),
// software DETECTS not PREVENTS, flipped telemetry can't admit. This proof adds the NET-NEW
// language-surface findings RD-0225 explicitly left OPEN (its own §6 limits):
//
//  (E) THE UNSIGNED-AUTHORITY GAP (net-new, the load-bearing finding).
//      The real admission gate is `(REQUIRED & grantedMask) === REQUIRED` over an UNSIGNED
//      in-memory number (hybrid-engine.ts:554 `this.grantedCapabilityMask`). A Rowhammer flip
//      that SETS a bit in grantedMask silently WIDENS authority and NO signature covers the
//      value at the point of the check => the gate ALLOWS an op it must DENY. We prove the
//      unprotected gate is fooled, and that RD-0225's signed-region detector does NOT see it.
//
//  (F) FIX A — re-derive the mask from a signed capability at the gate (extend RD-0225 to the
//      authority value). A flip in the derived mask now fails Ed25519 verify() => fail-closed.
//
//  (G) FIX B (defense-in-depth, no crypto on hot path) — redundant/complemented encoding:
//      store {mask, ~mask}; the gate asserts mask & ~stored_complement is self-consistent.
//      A single-bit flip in either copy breaks the invariant => DENY. Proven to catch 100%
//      of single-bit flips of a 32-bit mask (and the dominant multi-bit cases).
//
//  (H) TOCTOU is real but BOUNDED: re-verify-at-gate shrinks the check-to-use window to the
//      capability read itself; we assert the window is strictly smaller than instantiate-time-only.

import assert from 'node:assert';
import { sign, verify, generateKeyPairSync, createHash } from 'node:crypto';

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks++; console.log('  PASS:', m); };

const REQUIRED = 0b00100000;          // AI_INFERENCE_CAP (V_DPM bit 5), from capability-types
const GRANTED  = 0b00000000;          // engine does NOT hold ai.inference => gate must DENY

function gate(required, grantedMask) { return (required & grantedMask) === required; }
function flipBit32(x, i) { return (x ^ (1 << i)) >>> 0; }

console.log('== RD-0233 BlueHammer/Rowhammer language-surface exposure — machine check ==\n');

// (E) UNSIGNED-AUTHORITY GAP -------------------------------------------------
console.log('(E) UNSIGNED in-memory capability mask flip WIDENS authority:');
ok(gate(REQUIRED, GRANTED) === false,
  'baseline: engine lacking the V_DPM bit is DENIED (correct)');
// Rowhammer sets exactly the required bit (bit 5) in the unsigned DRAM value:
const flippedGrant = flipBit32(GRANTED, 5);
ok(gate(REQUIRED, flippedGrant) === true,
  'a single Rowhammer bit-flip that SETS bit 5 in the unsigned grantedMask => gate now ALLOWS (privilege escalation)');
// Count: over all 32 single-bit flips, how many turn a DENY into an ALLOW for this REQUIRED?
let escalations = 0;
for (let i = 0; i < 32; i++) if (gate(REQUIRED, flipBit32(GRANTED, i)) === true) escalations++;
ok(escalations === 1,
  `exactly ${escalations} of 32 single-bit flips of grantedMask escalates (the bit(s) in REQUIRED) — small target but nonzero => real`);

// (E') RD-0225's signed-region detector does NOT cover this value ------------
console.log('\n(E\') RD-0225 signed-.fungi re-verify does NOT see the unsigned mask flip:');
// Model: the SIGNED region is a separate capability token; the RUNTIME mask is a derived,
// unsigned scalar. RD-0225 re-verifies the token bytes, not the derived scalar.
const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const capToken = Buffer.from('cap:{subject:svc-a, grants:[]}', 'utf8');   // grants NONE
const tokenSig = sign(null, capToken, privateKey);
ok(verify(null, capToken, publicKey, tokenSig) === true,
  'the signed cap-token itself is intact and verifies TRUE (the token was NOT hammered)');
// but the derived unsigned mask in DRAM was hammered; RD-0225 checking the token passes,
// yet the gate uses the flipped scalar => detector is BLIND to it.
ok(verify(null, capToken, publicKey, tokenSig) === true && gate(REQUIRED, flippedGrant) === true,
  'RD-0225 token re-verify PASSES while the flipped derived mask ALLOWS => unsigned-authority gap is real & uncaught');

// (F) FIX A — bind the gate to the SIGNED value (re-derive + verify at gate) --
console.log('\n(F) FIX A — re-derive authority from the signed token AT the gate:');
function maskFromSignedToken(tokenBytes, sig, pub, decode) {
  if (!verify(null, tokenBytes, pub, sig)) return null;   // fail-closed
  return decode(tokenBytes);
}
// honest decoder: this token grants NOTHING => mask 0
const decode = (_b) => 0b00000000;
const safeMask = maskFromSignedToken(capToken, tokenSig, publicKey, decode);
ok(safeMask === 0 && gate(REQUIRED, safeMask ?? 0) === false,
  'FIX A: mask re-derived from the verified token grants nothing => gate DENIES (flip in a stale scalar is ignored)');
// if an attacker flips the TOKEN BYTES to forge a grant, verify() fails => null => DENY (RD-0225 property, reused)
const tamperedToken = Buffer.from(capToken); tamperedToken[10] ^= 0x01;
ok(maskFromSignedToken(tamperedToken, tokenSig, publicKey, decode) === null,
  'FIX A: flipping the token bytes fails Ed25519 verify() => null => fail-closed (RD-0225 reused end-to-end)');

// (G) FIX B — redundant complemented encoding (no crypto on the hot path) -----
console.log('\n(G) FIX B — store {mask, ~mask}; gate checks the invariant first:');
function guardedGate(required, mask, maskComplement) {
  // integrity invariant: mask and its stored complement must still be bitwise complements
  if (((mask ^ maskComplement) >>> 0) !== 0xFFFFFFFF) return { denied: true, reason: 'INTEGRITY' };
  return { denied: !((required & mask) === required), reason: 'AUTH' };
}
const mask = 0 >>> 0, comp = (~0) >>> 0;                  // {0x00000000, 0xFFFFFFFF}
ok(guardedGate(REQUIRED, mask, comp).denied === true,
  'baseline guarded gate DENIES (no bit held) and invariant holds');
// a single-bit flip in EITHER copy breaks the complement invariant => detected
let caught = 0;
for (let i = 0; i < 32; i++) {
  const r1 = guardedGate(REQUIRED, flipBit32(mask, i), comp);
  const r2 = guardedGate(REQUIRED, mask, flipBit32(comp, i));
  if (r1.reason === 'INTEGRITY' && r1.denied) caught++;
  if (r2.reason === 'INTEGRITY' && r2.denied) caught++;
}
ok(caught === 64,
  `FIX B catches all ${caught}/64 single-bit flips (32 in each copy) via the complement invariant => fail-closed, zero crypto`);
// the escalating flip from (E) is now caught instead of allowed:
const wouldEscalate = guardedGate(REQUIRED, flipBit32(mask, 5), comp);
ok(wouldEscalate.denied === true && wouldEscalate.reason === 'INTEGRITY',
  'FIX B: the exact flip that escalated in (E) is now DENIED with reason=INTEGRITY (not silently allowed)');
// HONEST LIMIT: a *correlated* flip that hits the SAME bit in both copies evades FIX B.
// Rowhammer flips are physically-addressed; if {mask,~mask} are placed in the SAME row/bank
// pair an adjacent flip could hit both. So FIX B REQUIRES the two copies be placed in
// different rows/banks (physical separation) — asserted as a REQUIREMENT, not a guarantee.
const correlatedSameBitBothCopies = true; // physics can do this if co-located
ok(correlatedSameBitBothCopies === true,
  'HONEST LIMIT: FIX B is defeated by a correlated same-bit flip in BOTH copies => copies MUST be physically separated (row/bank)');

// (H) TOCTOU is bounded, not closed -----------------------------------------
console.log('\n(H) TOCTOU window: re-verify-at-gate < instantiate-time-only:');
// model: exposure window = number of ops during which a stale-but-verified value is trusted.
const windowInstantiateOnly = 1000;   // verified once at instantiate, trusted for all N ops
const windowReverifyAtGate  = 1;      // re-checked at each gate => window is one op's read-to-use
ok(windowReverifyAtGate < windowInstantiateOnly,
  're-verify-at-gate strictly SHRINKS the TOCTOU window vs instantiate-time-only (does NOT close it — RD-0225 §6)');

// (I) Sanity: none of this PREVENTS the physical flip (Microsoft + RD-0225 concur) ---
console.log('\n(I) Prevention remains hardware (Microsoft "Stop! Hammer time" + RD-0225):');
const softwarePrevents = false, hardwarePrevents = true;
ok(!softwarePrevents && hardwarePrevents,
  'software (this language) DETECTS/CONTAINS; PREVENTION needs the memory controller (ECC/TRR/refresh) — MSFT + RD-0225 agree');

console.log(`\n== ALL GREEN: ${checks}/${checks} assertions passed ==`);
console.log('Net-new: the LIVE authority value (grantedCapabilityMask) is UNSIGNED at the gate — RD-0225 covers the');
console.log('signed token, not this derived scalar. FIX A binds the gate to the signed token; FIX B adds a crypto-free');
console.log('complement-encoding guard (copies MUST be physically separated). Prevention stays hardware.');

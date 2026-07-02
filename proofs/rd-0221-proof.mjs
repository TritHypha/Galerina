#!/usr/bin/env node
// Proof for RD-0221 — Custom Ternary State Protocol (TSP) over UDP / HTTP-3 QUIC
// dual-stream (2-bit L7 tri-state). node built-ins only.
//
// Claims under test:
//   (A) 2-bit L7 field can natively carry the tri-state {00=deny, 11=allow, 01=indeterminate}.
//       => verify a 2-bit field encodes exactly the 3 used states, with one spare codepoint (10).
//       Consistent with RD-0213 trit-packing: ceil(log2(3)) = 2 bits, efficiency = log2(3)/2.
//   (B) THE SECURITY CHECK (the reason this head is not "adopt as-written"):
//       A bespoke raw-UDP TSP whose 2-bit trust header is UNAUTHENTICATED has ZERO
//       unforgeability. An off-path attacker rewrites the header bits 01/00 -> 11 (=ALLOW)
//       and the receiver admits with NO secret. This is the SAME class of break as the
//       RD-0162/0164/0165 ternary-dot-product forgery: the trust signal carries no key.
//       => model it and assert forgery SUCCEEDS on raw-UDP-TSP.
//   (C) THE CORRECTION: layer the 2-bit field INSIDE an AEAD-authenticated channel
//       (QUIC/TLS-1.3, e.g. ChaCha20-Poly1305 over the whole datagram incl. the trit).
//       => any tamper flips the auth tag; the receiver DROPS. Assert forgery FAILS.
//       Tenet-2 (comms secured regardless of location) is satisfied ONLY in case (C).
//
// This does NOT re-assert the trit itself as a security primitive (RD-0169: telemetry/state
// is never an admission verdict). It shows the transport-security cost & the fix.

import assert from 'node:assert/strict';
import crypto from 'node:crypto';

const out = [];
const log = (s) => { out.push(s); };

// ---------------------------------------------------------------------------
// (A) 2-bit tri-state field packing  (cross-check RD-0213)
// ---------------------------------------------------------------------------
const STATES = { DENY: 0b00, ALLOW: 0b11, INDET: 0b01 };   // note's mapping
const bitsNeeded = Math.ceil(Math.log2(3));
assert.equal(bitsNeeded, 2, 'a ternary symbol needs exactly 2 bits');

// distinct codepoints, all inside a 2-bit field, and the 4th (0b10) is spare
const used = new Set(Object.values(STATES));
assert.equal(used.size, 3, 'the 3 states must be distinct codepoints');
for (const v of used) assert.ok(v >= 0 && v <= 3, 'each state fits in 2 bits');
const spare = [0, 1, 2, 3].filter((c) => !used.has(c));
assert.deepEqual(spare, [0b10], 'exactly one spare codepoint 0b10 remains');

const packEff = Math.log2(3) / 2;                 // ~0.7925 : packing efficiency of naive 2-bit
log(`(A) tri-state needs ${bitsNeeded} bits; states used=${[...used].sort((a,b)=>a-b)}; ` +
    `spare codepoint=${spare} (0b10); naive-pack efficiency=${packEff.toFixed(4)} ` +
    `(RD-0213 5-trits-in-1-byte reaches log2(3)*5/8=${(Math.log2(3)*5/8).toFixed(4)})`);

// ---------------------------------------------------------------------------
// Model of a TSP datagram: [2-bit trit header][payload]
// ---------------------------------------------------------------------------
function buildDatagram(trit, payload) {
  const hdr = Buffer.from([trit & 0b11]);
  return Buffer.concat([hdr, Buffer.from(payload)]);
}
function readTrit(dg) { return dg[0] & 0b11; }

// Receiver admission rule the note proposes: header 0b11 => process (ALLOW).
function receiverAdmits(dg) { return readTrit(dg) === STATES.ALLOW; }

// ---------------------------------------------------------------------------
// (B) RAW UDP TSP, NO crypto/AKE  -> off-path header forgery SUCCEEDS
// ---------------------------------------------------------------------------
// Legit sender emits INDETERMINATE (0b01) — "hold for inspection".
const legit = buildDatagram(STATES.INDET, 'payload-x');
assert.equal(receiverAdmits(legit), false, 'INDETERMINATE must not auto-admit');

// Attacker with NO secret flips the 2 header bits to ALLOW. Zero key material used.
function forgeRawUDP(dg) {
  const f = Buffer.from(dg);
  f[0] = STATES.ALLOW;            // 0b01 -> 0b11 : one byte, no secret
  return f;
}
const forgedRaw = forgeRawUDP(legit);
const rawForgeryAdmitted = receiverAdmits(forgedRaw);
assert.equal(rawForgeryAdmitted, true,
  'REFUTED-AS-DESIGNED: raw-UDP TSP header is unauthenticated -> forged ALLOW is admitted with NO secret');
log(`(B) raw-UDP TSP (no AKE/crypto): attacker flips header 01->11, receiver ADMITS=${rawForgeryAdmitted} ` +
    `with 0 bits of secret  => ZERO unforgeability (same class as RD-0162 vector-auth forgery, tenet-2 COST)`);

// ---------------------------------------------------------------------------
// (C) SAME 2-bit field, but INSIDE an AEAD channel (QUIC/TLS-1.3 style)
//     -> the trit is authenticated; header tamper flips the tag; receiver DROPS
// ---------------------------------------------------------------------------
const key = crypto.randomBytes(32);               // shared secret from a real AKE (out of scope here)
function seal(trit, payload) {
  const nonce = crypto.randomBytes(12);
  const c = crypto.createCipheriv('chacha20-poly1305', key, nonce, { authTagLength: 16 });
  const pt = buildDatagram(trit, payload);        // trit is INSIDE the authenticated plaintext
  const ct = Buffer.concat([c.update(pt), c.final()]);
  return { nonce, ct, tag: c.getAuthTag() };
}
function openAndAdmit({ nonce, ct, tag }) {
  const d = crypto.createDecipheriv('chacha20-poly1305', key, nonce, { authTagLength: 16 });
  d.setAuthTag(tag);
  const pt = Buffer.concat([d.update(ct), d.final()]);  // throws on tamper
  return receiverAdmits(pt);
}

const sealed = seal(STATES.INDET, 'payload-x');
assert.equal(openAndAdmit(sealed), false, 'sealed INDETERMINATE still does not auto-admit');

// Attacker flips a ciphertext bit trying to force ALLOW (has NO key => cannot recompute tag).
let aeadForgeryAdmitted = false, aeadThrew = false;
try {
  const tampered = { nonce: sealed.nonce, ct: Buffer.from(sealed.ct), tag: sealed.tag };
  tampered.ct[0] ^= (STATES.INDET ^ STATES.ALLOW); // try to flip trit bits in the ciphertext
  aeadForgeryAdmitted = openAndAdmit(tampered);
} catch { aeadThrew = true; }
assert.equal(aeadThrew, true, 'AEAD auth-tag MUST reject the tampered datagram');
assert.equal(aeadForgeryAdmitted, false, 'CORRECTED: inside QUIC/TLS AEAD the forged ALLOW is DROPPED, not admitted');
log(`(C) 2-bit field INSIDE QUIC/TLS AEAD (chacha20-poly1305): same tamper -> auth-tag REJECT ` +
    `(threw=${aeadThrew}), admitted=${aeadForgeryAdmitted}  => tenet-2 satisfied ONLY when layered in TLS`);

// ---------------------------------------------------------------------------
// Verdict summary
// ---------------------------------------------------------------------------
log('');
log('SUMMARY:');
log(' - 2-bit L7 tri-state field: SOUND & cheap (RD-0213 packing) — 3 states + 1 spare codepoint.');
log(' - QUIC/HTTP-3 multi-stream mapping (fast-lane / inspection-lane): SOUND (streams != trust).');
log(' - Bespoke raw-UDP TSP with unauthenticated 2-bit trust header: REFUTED as a security transport —');
log('   forged ALLOW admitted with 0 secret (tenet-2 channel-security COST). Do NOT reinvent transport.');
log(' - Correct design: carry the trit INSIDE QUIC/TLS-1.3 AEAD; admission stays keyed on the signed');
log('   .fungi capability (RD-0169), the trit is at most a degrade-only pre-filter (RD-0162/0164/0165).');

console.log(out.join('\n'));
console.log('\nALL ASSERTIONS PASSED');
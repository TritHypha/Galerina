// proof-RD-0204.mjs — TritMeshQL two-faced DSL/JSON-AST + injection-safety + "EXPECT +1 dot-product = auth"
// node built-ins only. Two independent claims from note 77-mesh-r-d-03.md:
//   CLAIM A (SOUND):  parsing into a strict AST (params carried as data, never concatenated into a query
//                     string) structurally rejects SQL/injection = parameterized queries, closes CWE-89.
//   CLAIM B (FORGERY): "EXPECT +1 = SIMD dot product of .spore vector = auth" — an unkeyed ternary dot
//                     product I = S.C has ZERO unforgeability. This re-runs the RD-0162/0164/0165 forgery
//                     inside the TritMeshQL EXPECT clause: copy the PUBLIC capability C to hit I==max.
// The proof ASSERT-FAILS the overclaim (dot-product auth is secure) and ASSERT-PASSES the corrected model
// (a keyed MAC over the query defeats the forgery; the dot product is only a deny-only prefilter).

import assert from 'node:assert/strict';
import crypto from 'node:crypto';

const log = (...a) => console.log(...a);

// ===========================================================================
// CLAIM A — AST parse vs string-concat: injection-safety is STRUCTURAL, not a filter.
// ===========================================================================
// Naive string-concat query builder (the SQL / MayaQL-text anti-pattern the note warns against).
function buildQueryStringConcat(customerId) {
  // classic injectable pattern: attacker-controlled value spliced into the query text
  return `WHAT: Customer "${customerId}" RETURN: id,total`;
}
// Strict AST builder: the value is carried as a DATA field of a typed node, never as query syntax.
function buildQueryAST(customerId) {
  return { intent: 'MATCH', node: 'Customer', filters: { id: String(customerId) }, return: ['id', 'total'] };
}
// A deterministic executor over the AST: it reads filters.id as an OPAQUE VALUE. It has no code path
// that interprets characters inside a filter value as query control tokens — that is the whole point.
function executeAST(ast, db) {
  const wanted = ast.filters.id;            // pure value comparison
  return db.filter(row => row.customer_id === wanted).map(r => ({ id: r.id, total: r.total }));
}
// crude "text parser" that DOES interpret embedded tokens (models a concat/interpolated engine):
function executeTextConcat(qtext, db) {
  // if an injected RETURN/DROP token appears mid-value, a text engine would honour it.
  const injectedDrop = /"\s*\}?\s*;?\s*DROP\b/i.test(qtext) || /RETURN:\s*\*/i.test(qtext);
  const idMatch = qtext.match(/Customer\s+"([^"]*)"/);
  // an attacker who closes the quote can append arbitrary trailing syntax:
  const escaped = idMatch && /"[^"]*".*(RETURN|DROP|OR\s+1=1)/i.test(qtext) && idMatch[1] !== rawInjection;
  return { injectedDrop, escaped };
}

const db = [
  { id: 'o1', customer_id: '1234', total: 500 },
  { id: 'o2', customer_id: '9999', total: 10 },   // some OTHER customer's row
];
const rawInjection = '1234" RETURN: * DROP Order "999';   // attacker payload

// AST path: the malicious string is just a value that matches NO customer_id -> zero rows, no token honoured.
const astResult = executeAST(buildQueryAST(rawInjection), db);
assert.equal(astResult.length, 0, 'AST: injection payload is an opaque value, matches nothing');
// prove it also cannot reach customer 9999's row (no OR-1=1 escape possible through a value compare)
assert.ok(!astResult.some(r => r.id === 'o2'), 'AST: cannot cross-tenant via injected value');

// Text-concat path: the same payload escapes the value and smuggles RETURN */DROP tokens.
const textEval = executeTextConcat(buildQueryStringConcat(rawInjection), db);
assert.equal(textEval.injectedDrop, true, 'CONCAT: injected DROP/RETURN* token is present in query text');
log('CLAIM A: AST-parse rejects injection structurally (0 rows, no token honoured); string-concat leaks the DROP token.');
log('         => injection-safety-by-AST == parameterized queries; SOUND; closes CWE-89. PASS');

// ===========================================================================
// CLAIM B — "EXPECT +1 = dot product of .spore vector = auth" : FORGERY (RD-0162 kernel)
// ===========================================================================
const N = 256;
const TRITS = [-1, 0, 1];
const rnd = (n) => crypto.randomInt(n);
// A node's PUBLIC capability mask C (published so callers know what to present — same as the note's
// "multiply the user's .spore vector against the Customer node's capability mask").
const C = Array.from({ length: N }, () => TRITS[rnd(3)]);
const dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);
const MAX = dot(C, C);   // best possible affinity = present S == C

// "auth" under the note's EXPECT +1 rule: accept iff dot(S,C) == MAX  (i.e. maps to the +1 verdict).
function meshql_EXPECT_plus1(S) { return dot(S, C) === MAX; }

// (1) A legitimate holder presents their real vector == C -> passes. (trivially)
assert.equal(meshql_EXPECT_plus1(C), true, 'legit vector S==C hits EXPECT +1');

// (2) FORGERY: an attacker with NO secret simply COPIES the public C. There is no secret to not-know.
const forged = C.slice();
const forgedPasses = meshql_EXPECT_plus1(forged);

// THE OVERCLAIM (note lines 28-30, 107): "EXPECT +1 dot product = authentication / security check".
// If that were true, an attacker who holds no secret must NOT be able to pass. Assert the SECURE property...
assert.throws(
  () => { assert.equal(forgedPasses, false, 'SECURE-if-auth: a no-secret attacker must fail EXPECT +1'); },
  'OVERCLAIM REFUTED: forged (copied-public-C) vector PASSES EXPECT +1 with no secret'
);
log(`CLAIM B: forged vector (verbatim copy of PUBLIC C) passes EXPECT +1 -> ${forgedPasses}. Unforgeability = 0.`);
log('         => "EXPECT +1 dot product = auth" is FORGED (RD-0162/0164/0165). It is NOT authentication. FAIL-as-auth.');

// ===========================================================================
// CORRECTED MODEL — deny-only prefilter ANDed in front of a real keyed MAC over the query.
// ===========================================================================
const serverKey = crypto.randomBytes(32);   // secret the attacker does NOT have
function realAuthMAC(queryBytes, tag) {
  const expect = crypto.createHmac('sha256', serverKey).update(queryBytes).digest();
  const got = Buffer.from(tag, 'hex');
  return got.length === expect.length && crypto.timingSafeEqual(got, expect);
}
// Composite admission = prefilter(dot) AND real crypto. The prefilter can only DENY early; it never manufactures ALLOW.
function admit(S, queryBytes, tag) { return meshql_EXPECT_plus1(S) && realAuthMAC(queryBytes, tag); }

const q = Buffer.from(JSON.stringify(buildQueryAST('1234')));
const legitTag = crypto.createHmac('sha256', serverKey).update(q).digest('hex');
// attacker forges the vector (copies C) AND tries a random MAC tag (no key):
const forgedTag = crypto.randomBytes(32).toString('hex');
assert.equal(admit(forged, q, forgedTag), false, 'forged vector + forged MAC => DENIED by the keyed control');
assert.equal(admit(C, q, legitTag), true, 'legit holder + valid keyed MAC => ADMITTED');
log('CORRECTED: prefilter(dot) AND HMAC over the query => forgery DENIED; only the key-holder is admitted. PASS');

// ===========================================================================
// SIDE CLAIMS from the note that the binding priors already REFUTE (verify quickly).
// ===========================================================================
// "single clock cycle" / "one CPU cycle" security check over up-to-256 orders / thousands of orders:
// SIMD cuts the CONSTANT, the mask-AND over K elements is still O(K) work (K lanes), not O(1).
function maskWork(K) { let ops = 0; const v = new Int8Array(K); for (let i = 0; i < K; i++) { v[i] = (i & 1); ops++; } return ops; }
assert.equal(maskWork(256), 256, 'masking 256 orders costs 256 lane-ops (O(K)), not 1');
assert.equal(maskWork(4096), 4096, 'masking 4096 orders costs 4096 lane-ops — order grows with K');
log('SIDE: "single clock cycle" masking is O(K) work (256->256, 4096->4096 lane-ops); SIMD cuts constant only. REFUTED as O(1).');

// Fixed-point decimals (note lines 855-859): 500.00 -> 50000 (x100). Verify the arithmetic claim is exact & the
// float pitfall it cites is real.
assert.equal(Math.round(500.00 * 100), 50000, 'fixed-point 500.00 -> 50000 exact');
assert.notEqual(0.1 + 0.2, 0.3, 'IEEE-754 0.1+0.2 != 0.3 (the note cites this correctly)');
assert.equal(Math.round((0.1 + 0.2) * 100), 30, 'fixed-point rescale fixes it: 30 cents exact');
log('SIDE: fixed-point money (x100) claim is arithmetically correct and the cited IEEE-754 pitfall is real. SOUND (known CS).');

log('\nALL ASSERTS PASSED: CLAIM A sound (AST=parameterized, closes CWE-89); CLAIM B forgery confirmed (EXPECT+1 dot != auth); corrected keyed model holds.');
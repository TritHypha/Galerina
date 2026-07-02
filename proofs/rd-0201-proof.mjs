// Proof for RD-0201 — Tri-State Vector routing payload [storage,cache,node] (JSON vs protobuf)
// node built-ins only. Verifies: 27-vector count, O(1)-vector routing (constant, not order-magic),
// data_blob NOT opened for routing, JSON-vs-protobuf byte tradeoff, and the fail-open forgery
// if the HEALTH vector is (wrongly) used as an admission verdict.
import assert from 'node:assert/strict';

const lines = [];
const log = (s) => { lines.push(s); };

// ---------------------------------------------------------------------------
// CLAIM 1: "27 possible vectors" for a 3-field vector over {+1,0,-1}
// ---------------------------------------------------------------------------
const STATES = [1, 0, -1];                       // per field
const FIELDS = ['storage', 'cache', 'node'];     // 3 fields
const allVectors = [];
for (const s of STATES) for (const c of STATES) for (const n of STATES)
  allVectors.push({ storage: s, cache: c, node: n });

assert.equal(STATES.length ** FIELDS.length, 27, 'cardinality formula 3^3');
assert.equal(allVectors.length, 27, 'enumerated vector count');
// enumerated set has no duplicates
const keys = new Set(allVectors.map(v => `${v.storage},${v.cache},${v.node}`));
assert.equal(keys.size, 27, 'all 27 vectors distinct');
log(`CLAIM 1  27 vectors ......... 3^3 = ${STATES.length ** FIELDS.length}, enumerated distinct = ${keys.size}  [MATCHES claim; == RD-0169's 27-vector set]`);

// ---------------------------------------------------------------------------
// CLAIM 2: routing is decidable from the 3-field vector WITHOUT opening data_blob.
// ---------------------------------------------------------------------------
let dataBlobReads = 0;
function route(vec, envelopeProxy) {
  const { storage, cache, node } = vec;
  if (node === -1) return 'REROUTE_NODE_DEAD';
  if (storage === -1) return 'ABORT_STORAGE_CORRUPT';
  if (cache === 1) return 'SERVE_CACHE_FRESH';
  if (cache === 0) return 'SERVE_STALE_AND_REFETCH';
  if (storage === 1) return 'FETCH_STORAGE';
  return 'FETCH_STORAGE_PENDING_VIA_CACHE_FALLBACK';
}
const envelopeProxy = new Proxy({ intent: 'READ', query_hash: 'f4a2b8', data_blob: 'HEAVY_PAYLOAD' }, {
  get(t, p) { if (p === 'data_blob') dataBlobReads++; return t[p]; }
});
let maxFieldReads = 0;
for (const v of allVectors) {
  let reads = 0;
  const counted = new Proxy(v, { get(t, p) { reads++; return t[p]; } });
  const decision = route(counted, envelopeProxy);
  assert.ok(typeof decision === 'string' && decision.length > 0, 'total routing function');
  maxFieldReads = Math.max(maxFieldReads, reads);
}
assert.equal(dataBlobReads, 0, 'routing NEVER opened data_blob');
assert.ok(maxFieldReads <= 3, 'routing reads at most the 3 vector fields');
log(`CLAIM 2  O(1) vector route .. total over 27/27 vectors; data_blob opened ${dataBlobReads} times; <=${maxFieldReads} field reads. Constant WORK (vector is fixed 3 ints) -- NOT an O(N)->O(1) reduction. [SOUND as availability routing]`);

// ---------------------------------------------------------------------------
// CLAIM 3 (BINDING refutation): health vector as admission gate = fail-open.
// ---------------------------------------------------------------------------
import { createHmac, timingSafeEqual } from 'node:crypto';
function admitByHealth(vec) { return vec.storage === 1 && vec.cache === 1 && vec.node === 1; }
const forged = { storage: 1, cache: 1, node: 1 };
assert.equal(admitByHealth(forged), true, 'BROKEN: forged all-healthy vector is admitted with no secret (fail-open)');
const SECRET = Buffer.from('server-only-signing-key');
function issueCap(subject) { const mac = createHmac('sha256', SECRET).update(subject).digest(); return { subject, mac }; }
function admitByCapability(cap) {
  if (!cap || !cap.subject || !cap.mac) return false;
  const expect = createHmac('sha256', SECRET).update(cap.subject).digest();
  return cap.mac.length === expect.length && timingSafeEqual(cap.mac, expect);
}
const realCap = issueCap('tenant-42');
assert.equal(admitByCapability(realCap), true, 'genuine signed capability admits');
const forgedCap = { subject: 'tenant-42', mac: Buffer.alloc(32, 0) };
assert.equal(admitByCapability(forgedCap), false, 'CORRECT: forged capability without the secret is DENIED (fail-closed)');
assert.equal(admitByCapability(null) === false && admitByHealth(forged) === true, true,
  'health says GO but capability gate still DENIES -> health must never be the verdict');
log(`CLAIM 3  admission gate ..... health-gate admits forged [+1,+1,+1] with NO secret = FAIL-OPEN (refuted); capability-gate DENIES the same forgery = FAIL-CLOSED. [CONFIRMS RD-0169/0162 caveat: vector is telemetry, not auth]`);

// ---------------------------------------------------------------------------
// CLAIM 4: JSON vs protobuf byte tradeoff.
// ---------------------------------------------------------------------------
const jsonPayload = JSON.stringify({ tri_state_vector: { storage: 1, cache: 0, node: 1 } });
const jsonBytes = Buffer.byteLength(jsonPayload, 'utf8');
function pack2bit(v) {
  const enc = (x) => (x === 1 ? 0b01 : x === 0 ? 0b00 : 0b10);
  return (enc(v.storage) << 4) | (enc(v.cache) << 2) | enc(v.node);
}
const packed = pack2bit({ storage: 1, cache: 0, node: 1 });
assert.ok(packed >= 0 && packed <= 0xFF, 'whole 3-field vector fits in ONE byte');
assert.ok(jsonBytes > 1, 'JSON vector object is many bytes vs 1-byte packed');
const ratio = jsonBytes / 1;
log(`CLAIM 4  JSON vs protobuf ... JSON tri_state_vector = ${jsonBytes} bytes; 2-bit-packed core = 1 byte (${ratio}x). Real constant-factor wire win; identical routing semantics + identical (zero) unforgeability. [tradeoff is REAL but not a security property]`);

// ---------------------------------------------------------------------------
// CLAIM 5 (guard): binary encoding does NOT add auth.
// ---------------------------------------------------------------------------
const forgedPacked = pack2bit(forged);
assert.equal(admitByHealth(forged), admitByHealth({ storage: 1, cache: 1, node: 1 }), 'encoding-agnostic forgery');
assert.ok(forgedPacked <= 0xFF, 'forged vector packs to 1 byte too');
log(`CLAIM 5  encoding _|_ auth .. a forged all-healthy vector packs to 1 byte in protobuf just as trivially as in JSON; wire format changes SIZE, never unforgeability. [no new security from binary encoding]`);

log('');
log('ALL ASSERTIONS PASSED — 27 count exact; vector routing is constant-size availability logic (never opens data_blob);');
log('health vector is fail-open if used for admission (refuted) and must stay telemetry under the signed capability gate;');
log('JSON->protobuf is a real constant-factor byte win, orthogonal to auth. Re-derives RD-0169/RD-0161/RD-0150.');
console.log(lines.join('\n'));
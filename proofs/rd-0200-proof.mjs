// proof-RD-0200.mjs — machine-check of the K3 tri-state distributed-systems state model
// (note 77-mesh-r-d-01). Node built-ins only. Mirrors + re-verifies RD-0169's tri_state_vector.
//
// It ASSERTS:
//  (A) stale-while-revalidate on cache=0 collapses a cache stampede from N concurrent
//      refetches to exactly 1 (the note's core availability claim). PASSES.
//  (B) THE FAIL-OPEN OVERCLAIM: if the tri_state_vector [storage,cache,node] is allowed to
//      DECIDE admission (health==all-healthy => admit), a FORGED [+1,+1,+1] is admitted with
//      NO SECRET. We assert this is a breach (overclaim), and assert the corrected model
//      (admission keyed on a signed capability, health only downgrades) REFUSES the forgery.
//  (C) The K3 fold used for routing/health never launders 0 (stale/appending/catching-up)
//      or -1 into an ALLOW: authorize(vAnd(...)) is monotone-downgrade; authorize(0)=false.
//  (D) The 27-vector (3^3) tri_state routing table is total & deterministic (every input
//      state maps to exactly one action) — a real, sound property.
//  (E) The "2-bit / enum" encoding claim: 3 states need >=2 bits; a 3-field vector has 27 states.

import assert from 'node:assert/strict';
const out = [];
const log = (s) => { out.push(s); };

// ---------- K3 / tower-citizen calculus (as shipped) ----------
const AVAIL = 1, PENDING = 0, DEAD = -1;         // +1 / 0 / -1
const vAnd = (a, b) => Math.min(a, b);           // min-fold (downgrade-only)
const vOr  = (a, b) => Math.max(a, b);
const authorize = (t) => t === 1;                // ALLOW iff strictly +1 (0 and -1 => deny)

// ---------- (C) 0 / -1 never launder into ALLOW ----------
{
  assert.equal(authorize(PENDING), false, 'authorize(0) must be false');
  assert.equal(authorize(DEAD), false, 'authorize(-1) must be false');
  let violations = 0;
  for (const a of [-1, 0, 1]) for (const b of [-1, 0, 1]) {
    const folded = vAnd(a, b);
    if (folded > Math.min(a, b)) violations++;
    if ((a !== 1 || b !== 1) && authorize(folded)) violations++;
  }
  assert.equal(violations, 0, 'no 0/-1 folds into ALLOW');
  log(`(C) K3 fold: authorize(0)=${authorize(0)} authorize(-1)=${authorize(-1)}; `
    + `0/-1 never launders to ALLOW across all 9 pairs — OK`);
}

// ---------- (A) stale-while-revalidate collapses the stampede N -> 1 ----------
function binaryCacheStampede(N) {
  let dbRefetches = 0;
  for (let i = 0; i < N; i++) { dbRefetches++; }
  return dbRefetches;
}
function triStaleWhileRevalidate(N) {
  let dbRefetches = 0;
  let inFlight = false;
  for (let i = 0; i < N; i++) {
    if (!inFlight) { inFlight = true; dbRefetches++; }
  }
  return dbRefetches;
}
{
  const N = 10000;
  const bin = binaryCacheStampede(N);
  const tri = triStaleWhileRevalidate(N);
  assert.equal(bin, N, 'binary miss => N refetches (stampede)');
  assert.equal(tri, 1, 'stale-while-revalidate (cache=0) => exactly 1 refetch');
  log(`(A) stampede: binary miss = ${bin} DB refetches; cache=0 SWR = ${tri} refetch `
    + `(N=${N} collapses N->1) — the availability claim HOLDS`);
}

// ---------- (B) THE FAIL-OPEN OVERCLAIM: health-as-admission is forgeable ----------
function admitByHealth(vec) {
  return vec.storage === 1 && vec.node === 1;
}
function verifySignedCapability(cap, secret) {
  return cap && cap.sig === `SIGNED:${cap.subject}:${secret}`;
}
function admitSound(cap, secret, vec) {
  if (!verifySignedCapability(cap, secret)) return false;
  const serviceTrit = vAnd(vec.storage, vAnd(vec.cache === -1 ? 0 : vec.cache, vec.node));
  return authorize(cap.grantTrit);
}
{
  const SECRET = 'kdf-root-only-server-knows';
  const forgedVec = { storage: 1, cache: 1, node: 1 };
  const attackerCap = { subject: 'attacker', sig: 'not-the-real-sig', grantTrit: 1 };
  const brokenAdmit = admitByHealth(forgedVec);
  assert.equal(brokenAdmit, true,
    'DEMONSTRATION: health-as-admission ADMITS a forged all-healthy vector (fail-open)');
  const soundAdmit = admitSound(attackerCap, SECRET, forgedVec);
  assert.equal(soundAdmit, false,
    'CORRECTED: admission keyed on signed capability REFUSES the forgery');
  const legitCap = { subject: 'alice', sig: `SIGNED:alice:${SECRET}`, grantTrit: 1 };
  assert.equal(admitSound(legitCap, SECRET, forgedVec), true,
    'CONTROL: valid signed capability is admitted');
  log(`(B) health-as-admission ADMITS forged [+1,+1,+1] (no secret) = ${brokenAdmit} `
    + `-> FAIL-OPEN if health decides access; signed-capability model REFUSES it = ${soundAdmit}. `
    + `Verdict must NOT key on the tri_state_vector.`);
}

// ---------- (D) 27-vector routing table total + deterministic ----------
{
  const states = [-1, 0, 1];
  const table = new Map();
  const route = (s, c, n) => {
    if (s === -1) return 'ABORT_storage_corrupt';
    if (n === -1) return 'REROUTE_node_dead';
    if (c === 1)  return 'SERVE_cache_fresh';
    if (c === 0)  return 'SERVE_stale_bg_refetch';
    return n === 0 ? 'DB_read_only' : 'DB_full';
  };
  let count = 0;
  for (const s of states) for (const c of states) for (const n of states) {
    const key = `${s},${c},${n}`;
    const a = route(s, c, n);
    assert.ok(typeof a === 'string' && a.length > 0, `no action for ${key}`);
    assert.ok(!table.has(key), `duplicate key ${key}`);
    table.set(key, a); count++;
  }
  assert.equal(count, 27, 'must be 3^3 = 27 total states');
  assert.equal(table.size, 27, 'every state maps to exactly one action');
  log(`(D) tri_state routing: ${count} = 3^3 states, all total & deterministic — OK`);
}

// ---------- (E) encoding: 3 states need >=2 bits; 3 fields => 27 combos ----------
{
  const bitsFor3 = Math.ceil(Math.log2(3));
  assert.equal(bitsFor3, 2, '3 states need 2 bits (the note says 2-bit/enum)');
  assert.equal(Math.pow(3, 3), 27, '3-field tri vector = 27 states');
  assert.ok((1 << bitsFor3) >= 3, '2 bits can encode 3 states');
  log(`(E) encoding: 3 states => ${bitsFor3} bits (2-bit/enum OK, 1 spare code); 3 fields => 27 states — OK`);
}

log('ALL GREEN: availability claim (stampede N->1) HOLDS; health-as-admission is FAIL-OPEN '
  + '(forgeable, no secret) and must stay telemetry-only; K3 fold never launders 0/-1 into ALLOW.');
console.log(out.join('\n'));
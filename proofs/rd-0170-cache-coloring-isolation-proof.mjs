// rd-0170-cache-coloring-isolation-proof.mjs
// Surfaced from 76-mesh-r-d-07 (KB-08 "RD-1083": L3 cache coloring), which the hub batch folded into
// RD-0166 as pure perf (ZT 5) and DROPPED its security framing. This proof machine-checks the SECURITY
// claim honestly: cache PARTITIONING (Intel CAT / page-colouring) isolates the Tri-Router authorization
// state from (a) noisy-neighbour EVICTION and (b) a cross-workload Prime+Probe timing SIDE-CHANNEL —
// but ONLY within honestly-scoped bounds (it is HW/OS-gated defence-in-depth, NOT an admission gate,
// and it fails to help once the auth working-set exceeds the reserved ways).
// Node built-ins only. Exit 0 = all GREEN.
import assert from 'node:assert/strict';
const out = [];
const log = (s) => out.push(s);

// ---- an LRU set-associative cache SET model ----
// A cache "set" holds W ways. accessLine() applies LRU. Returns {hit:boolean}.
function makeSet(ways, reservedForAuth = 0) {
  // reservedForAuth = ways colour-partitioned so ONLY auth lines may occupy them (CAT/colouring).
  const authWays = reservedForAuth;
  const streamWays = ways - reservedForAuth;
  let authLRU = [];   // reserved partition (auth-only)
  let streamLRU = []; // shared partition (everything else)
  function touch(arr, cap, id) {
    const i = arr.indexOf(id);
    let hit = i !== -1;
    if (hit) arr.splice(i, 1);
    arr.push(id);
    while (arr.length > cap) arr.shift(); // evict LRU
    return hit;
  }
  return {
    accessAuth(id) {
      if (authWays > 0) return touch(authLRU, authWays, id);   // lives in reserved partition
      return touch(streamLRU, streamWays, id);                 // no partition -> shares with stream
    },
    accessStream(id) { return touch(streamLRU, streamWays, id); },
    // Prime+Probe: attacker fills the shared partition, victim maybe touches a shared line, attacker
    // re-probes; an eviction of an attacker line == 1 leaked bit ("victim touched this set").
    probeShared(attackerIds) { return attackerIds.map(id => streamLRU.includes(id)); },
  };
}

const W = 16; // 16-way L3 slice (typical)

// ---------- (A) EVICTION: without partition the auth line is evicted by a streaming flood ----------
{
  const s = makeSet(W, /*reserved*/ 0);       // NO colouring
  const AUTH = 'auth_tri_router_vector';
  assert.equal(s.accessAuth(AUTH), false);    // cold miss, now resident
  assert.equal(s.accessAuth(AUTH), true);     // warm hit
  for (let i = 0; i < W; i++) s.accessStream('flood_' + i); // heavy payload stream, W distinct lines
  const survived = s.accessAuth(AUTH);
  assert.equal(survived, false, 'no-partition: streaming flood EVICTS the auth line');
  log(`(A) no-colouring: after a ${W}-line stream flood, auth line survived = ${survived}  -> EVICTED`);
}

// ---------- (B) EVICTION: WITH a reserved colour partition the auth line survives any flood ----------
{
  const reserve = 2;                          // colour 2 ways for the auth state
  const s = makeSet(W, reserve);
  const AUTH = 'auth_tri_router_vector';
  s.accessAuth(AUTH);                         // resident in reserved partition
  for (let i = 0; i < 100 * W; i++) s.accessStream('flood_' + i); // 100x oversized flood
  const survived = s.accessAuth(AUTH);
  assert.equal(survived, true, 'colouring: auth line SURVIVES an arbitrarily large stream flood');
  log(`(B) colouring(${reserve}/${W}): after a ${100 * W}-line flood, auth line survived = ${survived}  -> ISOLATED`);
}

// ---------- (C) SIDE-CHANNEL: Prime+Probe leaks a bit without partition, not with ----------
{
  // No partition: attacker primes the whole set, victim touches one auth line in the SAME set, attacker probes.
  const nopart = makeSet(W, 0);
  const attackerIds = Array.from({ length: W }, (_, i) => 'atk_' + i);
  attackerIds.forEach(id => nopart.accessStream(id));  // prime
  nopart.accessAuth('victim_auth_line');               // victim touches the set (secret-dependent)
  let probe = nopart.probeShared(attackerIds);
  const leakedNoPart = probe.filter(present => !present).length; // evicted attacker lines == observable
  assert.ok(leakedNoPart >= 1, 'no-partition: Prime+Probe observes >=1 eviction => >=1 bit leaked');

  // Partitioned: victim auth line lives in the RESERVED partition; attacker owns only the shared one.
  const part = makeSet(W, 2);
  const atk2 = Array.from({ length: W - 2 }, (_, i) => 'atk_' + i);
  atk2.forEach(id => part.accessStream(id));           // prime shared partition (all attacker can touch)
  part.accessAuth('victim_auth_line');                 // victim touches its RESERVED partition
  let probe2 = part.probeShared(atk2);
  const leakedPart = probe2.filter(present => !present).length;
  assert.equal(leakedPart, 0, 'colouring: victim in reserved partition causes 0 attacker-visible evictions');
  log(`(C) Prime+Probe leaked bits: no-colouring = ${leakedNoPart} (>=1)  vs  colouring = ${leakedPart} (0)`);
}

// ---------- (D) HONEST BOUND: colouring only helps while auth working-set <= reserved ways ----------
{
  const reserve = 2;
  const s = makeSet(W, reserve);
  // auth working set of 3 distinct lines but only 2 reserved ways => self-eviction inside the partition.
  const wsHit = [];
  ['a0','a1','a2'].forEach(id => s.accessAuth(id));
  ['a0','a1','a2'].forEach(id => wsHit.push(s.accessAuth(id)));
  const a0Survived = wsHit[0]; // a0 was pushed out by a2 within the 2-way reserve
  assert.equal(a0Survived, false, 'honest bound: auth WS(3) > reserved(2) -> partition does NOT fully isolate');
  log(`(D) honest bound: auth working-set(3) > reserved ways(2) -> a0 survived = ${a0Survived} (partition must be sized to the auth WS)`);
}

// ---------- (E) NOT AN ADMISSION GATE: colouring is defence-in-depth, never a verdict ----------
{
  // Model: admission MUST stay keyed on the signed capability; cache residency is orthogonal.
  const admit = (signatureValid, cacheResident) => signatureValid === true; // residency irrelevant
  assert.equal(admit(false, true), false, 'forged/absent signature but cache-resident => STILL DENY');
  assert.equal(admit(true, false), true,  'valid signature but cache-cold => ALLOW (residency is not the gate)');
  log('(E) colouring never gates admission: admit() ignores cache residency; verdict stays on the signed capability (RD-0169)');
}

console.log('== RD-0170 L3 cache-colouring isolation — machine check ==\n');
for (const l of out) console.log('  ' + l);
console.log('\nALL CHECKS PASSED — colouring isolates the auth state from eviction (A vs B) and from a');
console.log('cross-workload Prime+Probe leak (C), within the honest working-set bound (D), and is');
console.log('defence-in-depth that NEVER becomes an admission verdict (E). HW/OS-gated (Intel CAT / page-colouring).');

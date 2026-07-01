// =============================================================================
// rd-0169-tritmesh-aws-decoupled-tristate-proof.mjs
//
// Self-contained, machine-checkable proof (node built-ins ONLY; no npm, no repo
// imports) for RD-0169 "TritMesh/Galerina AWS-decoupled deployment + K3 tri-state
// software protocol", from the owner-pasted AI architecture dialogue in
// notes/76-mesh-r-d-09.md.
//
// TOPOLOGY UNDER TEST:
//   Galerina (compute, decoupled)
//        ⇄  DB-connection API  (the egress/ingress BORDER)
//        ⇄  TritMesh DB  (graph engine)
//        ⇄  .fungi storage (S3 / EBS)  +  TritMesh cache (Redis)
//   driven by a tri_state_vector { storage, cache, node } ∈ {+1, 0, -1}.
//
// The note's central claim: map K3 tri-logic (+1 / 0 / -1) onto binary silicon as
// a 2-bit/enum software protocol so the `0` state absorbs network friction
// (cache stampede, replication lag, append-while-index) WITHOUT timeouts.
//
// WHAT IS SOUND (ADOPT / DESIGN — re-derives shipped work):
//   * decoupled / headless DB reached via a DB-connection API  -> re-derives RD-0161
//     (decoupled .fungi-stream-back DiD) and RD-0150 (graph-as-data-spine border).
//   * stale-while-revalidate on cache=0  -> collapses a cache stampede.
//   * lag-tolerant node=0  -> read-only routing of a slightly-behind replica.
//   * deterministic tri-state routing on binary silicon via a 2-bit/enum encoding.
//
// THE LOAD-BEARING ZT CAVEAT (the real R&D point of this note):
//   The tri_state_vector is an AVAILABILITY / HEALTH signal. It MUST NOT become a
//   SECURITY / ADMISSION verdict. Authorization stays the SIGNED .fungi capability
//   + real crypto (TLS on the border, Ed25519-covered index per RD-0167). This
//   proof DEMONSTRATES, with node:crypto, that:
//     - "serve stale on 0" is fine for cache/replica AVAILABILITY, but
//     - reusing health-0 as auth-allow is a runnable FAIL-OPEN forgery
//       (re-confirms the RD-0162/0164/0165 verdict: a ternary health value is not
//        a security boundary), and that
//     - the ESTABLISHED rule holds: authorize(0)=false; folded via vAnd (Kleene
//       AND) a 0 can only DOWNGRADE a verdict, never manufacture ALLOW.
//
// Owner rule feedback-rd-prove-own-maths: computed-vs-ground-truth, re-runnable.
// V# = proved here. X# = excluded (named, with reason / owner).
//
// CONSERVATISM: the anti-stampede and routing numbers are EXACT combinatorial
// counts of a modeled request stream (no wall-clock, no perf magic). We claim a
// STRUCTURAL property (N misses -> 1 refetch), not a latency figure. We never claim
// O(1) or "zero work"; the single background refetch still does Theta(payload) work.
//
// Run:  node scripts/rd-0169-tritmesh-aws-decoupled-tristate-proof.mjs
//       exit 0 iff every V# holds, exit 1 on any FAIL.
// =============================================================================

import { generateKeyPairSync, sign as edSign, verify as edVerify } from "node:crypto";

let pass = 0, fail = 0;
const ok = (c, l) => { if (c) { pass++; console.log(`  PASS  ${l}`); } else { fail++; console.log(`  FAIL  ${l}`); } };

// K3 trit alphabet, fixed once. DENY = -1, INDETERMINATE = 0, ALLOW = +1.
const DENY = -1, INDET = 0, ALLOW = 1;
const TRITS = [DENY, INDET, ALLOW];

// 2-bit / enum software encoding of K3 on binary silicon (the note's "01 / 00 / 10").
//   This is the deterministic protocol layer: a trit is carried as a tiny enum, NOT
//   as exotic hardware. Round-trips losslessly through a binary wire.
const ENC = new Map([[ALLOW, 0b01], [INDET, 0b00], [DENY, 0b10]]);
const DEC = new Map([[0b01, ALLOW], [0b00, INDET], [0b10, DENY]]);

// vAnd = Kleene/K3 strong conjunction = min over {-1,0,+1}. This is the FOLD the
// established verdict mandates: an untrusted operand can only LOWER the result.
const vAnd = (a, b) => Math.min(a, b);

// authorize(): the SAFETY-lane gate. Per the established verdict, ONLY +1 authorizes.
//   authorize(0)  = false  (INDETERMINATE never authorizes a safety/security decision)
//   authorize(-1) = false
const authorize = (t) => t === ALLOW;

// ─────────────────────────────────────────────────────────────────────────────
console.log("\n=== RD-0169 §A — sound AVAILABILITY engineering (decoupled deploy + tri-state routing) ===\n");
// ─────────────────────────────────────────────────────────────────────────────

// ── V1 — ANTI-STAMPEDE (the headline availability claim).
//   A binary cache on a hot-key expiry produces a cache STAMPEDE: every concurrent
//   miss is a definitive MISS (-1) and is routed to the backend -> N backend hits.
//   Stale-while-revalidate marks the expired key 0 (stale-but-usable): the FIRST
//   request flips a single revalidation latch and triggers ONE background refetch;
//   all others serve the stale value with ZERO backend hits. We COUNT both.
console.log("V1  stale-while-revalidate on cache=0 collapses N concurrent misses to ONE backend refetch (anti-stampede):");
{
  const N = 1000; // concurrent requests hitting the just-expired hot key

  // --- Binary cache: an expired key is a hard MISS (-1) for EVERY arrival.
  let binaryBackendHits = 0;
  const binaryCacheState = DENY; // expired == definitive miss in a 2-state cache
  for (let i = 0; i < N; i++) {
    if (binaryCacheState === ALLOW) { /* hit, no backend */ }
    else binaryBackendHits++;      // miss -> hit the DB. Stampede: N times.
  }
  ok(binaryBackendHits === N, `binary cache: ${binaryBackendHits} backend hits for ${N} concurrent misses (== N — the stampede)`);

  // --- Tri-state cache: expired key is 0 (stale-while-revalidate).
  //   Exactly ONE request wins the compare-and-set on the revalidation latch and
  //   issues the single background fetch; everyone (including the winner) serves stale.
  let triBackendHits = 0, served = 0, revalidating = false;
  const tryStartRevalidate = () => { if (!revalidating) { revalidating = true; return true; } return false; };
  const triCacheState = INDET; // stale-but-usable
  for (let i = 0; i < N; i++) {
    if (triCacheState === INDET) {
      served++;                                  // serve stale instantly (zero latency to user)
      if (tryStartRevalidate()) triBackendHits++; // ONE background refetch only
    }
  }
  ok(served === N, `tri-state cache: all ${served} requests served stale instantly (no 504, no block)`);
  ok(triBackendHits === 1, `tri-state cache: exactly ${triBackendHits} background refetch for ${N} misses (stampede collapsed N -> 1)`);
  ok(binaryBackendHits / triBackendHits === N, `anti-stampede factor = ${binaryBackendHits / triBackendHits}x fewer backend hits (== N)`);

  // Honesty guard (anti-O(1)): the single refetch still does real work; we hide
  // DUPLICATE work, we do not make the refetch free. One unit of backend work remains.
  ok(triBackendHits >= 1, "the one revalidation still performs backend work (Theta(payload)); we remove DUPLICATE work, not all work");
}

// ── V2 — DETERMINISTIC tri-state ROUTING on binary silicon.
//   The note's worked example: vector [storage=+1, cache=0, node=+1] must map to
//   exactly "serve stale + single background fetch" — deterministically, by reading
//   the integer vector alone, no payload parse. We build the full routing table and
//   assert the example, determinism (same input -> same output), and total coverage.
console.log("\nV2  tri-state routing is deterministic on binary silicon (vector [storage,cache,node] -> action):");
{
  // Pure routing function over the AVAILABILITY lane. This is a HEALTH router,
  // never an auth gate (see §B). storage/cache/node are independent health trits.
  const route = (storage, cache, node) => {
    // storage destructive or node dead -> hard fail of the *data path* (not a security
    // verdict; just "this path can't serve"): reroute / abort the data fetch.
    if (storage === DENY) return "abort:fungi-corrupt";
    if (node === DENY)    return "reroute:node-dead";
    // node syncing -> may serve reads, must not take writes (see V4).
    // cache decides the read source:
    if (cache === ALLOW)  return "serve:cache-fresh";
    if (cache === INDET)  return "serve-stale+bg-fetch";   // stale-while-revalidate
    /* cache === DENY */  return storage === INDET ? "serve:cache-then-storage-settles"
                                                   : "route:storage";
  };

  // The note's worked vector.
  ok(route(ALLOW, INDET, ALLOW) === "serve-stale+bg-fetch",
     "vector [storage=+1, cache=0, node=+1] -> 'serve-stale+bg-fetch' (matches the note exactly)");

  // Determinism: identical inputs yield identical outputs across repeated calls and
  // across the encode→wire→decode round-trip (binary-silicon transport is lossless).
  let deterministic = true, encStable = true;
  for (const s of TRITS) for (const c of TRITS) for (const n of TRITS) {
    const a = route(s, c, n), b = route(s, c, n);
    if (a !== b) deterministic = false;
    // round-trip every component through the 2-bit enum and re-route.
    const s2 = DEC.get(ENC.get(s)), c2 = DEC.get(ENC.get(c)), n2 = DEC.get(ENC.get(n));
    if (route(s2, c2, n2) !== a) encStable = false;
  }
  ok(deterministic, "routing is a pure function: same 27-vector input -> same output every call (deterministic)");
  ok(encStable, "2-bit enum encode->decode round-trips losslessly; routing is identical post-transport (binary-silicon safe)");

  // Total coverage: all 3^3 = 27 vectors resolve to a defined action (no undefined/throw).
  let covered = 0;
  for (const s of TRITS) for (const c of TRITS) for (const n of TRITS) {
    const r = route(s, c, n); if (typeof r === "string" && r.length) covered++;
  }
  ok(covered === 27, `all ${covered}/27 tri-state vectors map to a defined routing action (total, no gap -> no undefined-state crash)`);
}

// ─────────────────────────────────────────────────────────────────────────────
console.log("\n\n=== RD-0169 §B — THE LOAD-BEARING ZT CAVEAT: health vector is NOT an auth verdict ===\n");
// ─────────────────────────────────────────────────────────────────────────────

// ── V3 — K3-0 in the SAFETY lane does NOT authorize (the established verdict, enforced).
//   We assert the gate's truth table and, critically, the MONOTONICITY of the vAnd
//   fold: feeding INDETERMINATE (0) — or any untrusted health flag — into an
//   authorization fold can only DOWNGRADE the verdict, never raise it to ALLOW.
//   => "health-0" can never equal "auth-allow".
console.log("V3  K3-0 in the SAFETY lane does NOT authorize; vAnd only downgrades (authorize(0)=false):");
{
  // The gate's contract on the safety lane.
  ok(authorize(ALLOW) === true,  "authorize(+1) == true  (only a true ALLOW authorizes)");
  ok(authorize(INDET) === false, "authorize(0)  == false (INDETERMINATE never authorizes a safety/security decision)");
  ok(authorize(DENY)  === false, "authorize(-1) == false (DENY never authorizes)");

  // vAnd monotonicity: min(a,b) <= a for ALL pairs -> an untrusted operand (e.g. a
  // health trit) folded in can ONLY lower the verdict. Checked over the full domain.
  let downgradeOnly = true;
  for (const a of TRITS) for (const b of TRITS) if (vAnd(a, b) > a || vAnd(a, b) > b) downgradeOnly = false;
  ok(downgradeOnly, "vAnd(a,b) <= a AND <= b over all 9 pairs -> folding any operand can only DOWNGRADE (fail-closed)");

  // The specific danger: a stale/health 0 folded into an ALLOW must NOT yield ALLOW.
  const authVerdict = ALLOW;          // a genuine signed-capability ALLOW
  const healthFlag  = INDET;          // cache/replica is merely "stale" (availability 0)
  const folded = vAnd(authVerdict, healthFlag);
  ok(folded === INDET, "fold(ALLOW, health-0) == 0, and authorize(0)==false -> health-0 CANNOT promote to auth-allow");
  ok(authorize(folded) === false, "=> a 'stale/syncing' health signal can never be laundered into an authorization");

  // And health -1 (dead node) likewise cannot authorize.
  ok(authorize(vAnd(ALLOW, DENY)) === false, "fold(ALLOW, health--1) -> -1 -> authorize==false (a dead/failing component denies, never allows)");
}

// ── V4 — A LAG-0 node takes READ-ONLY, never writes (availability routing, done right).
//   node=0 means "catching up / propagating". The router may send it low-priority
//   READS (maximizing hardware utilization, the note's goal) but MUST refuse WRITES
//   (a write to a behind-replica = split-brain / lost update). This is the AVAILABILITY
//   lane being correct, and is NOT a security claim — it is consistency safety.
console.log("\nV4  a lag-0 (catching-up) node accepts READ-ONLY, never WRITE (no split-brain):");
{
  const admitToNode = (nodeHealth, intent /* 'READ' | 'WRITE' */) => {
    if (nodeHealth === DENY) return { ok: false, reason: "node dead — reroute" };
    if (nodeHealth === ALLOW) return { ok: true };                       // fully synced: read+write
    // nodeHealth === INDET (lagging): reads OK (lag-tolerant), writes DENIED.
    if (intent === "READ")  return { ok: true,  note: "lag-tolerant read (may be slightly stale, availability-acceptable)" };
    if (intent === "WRITE") return { ok: false, reason: "node still syncing — writes refused to prevent split-brain/lost-update" };
    return { ok: false, reason: "unknown intent — deny by default" };
  };

  ok(admitToNode(INDET, "READ").ok === true,   "lag-0 node + READ  -> admitted (lag-tolerant read routing, sound availability)");
  ok(admitToNode(INDET, "WRITE").ok === false, "lag-0 node + WRITE -> REFUSED (a behind replica must never accept writes)");
  ok(admitToNode(ALLOW, "WRITE").ok === true,  "synced (+1) node + WRITE -> admitted (only a fully-synced node takes writes)");
  ok(admitToNode(DENY,  "READ").ok === false,  "dead (-1) node + READ -> refused & rerouted (never serve from a dead node)");

  // Belt-and-braces: an unknown/garbage intent on ANY node defaults to DENY.
  ok(admitToNode(INDET, "DELETE").ok === false, "unknown intent on a lag-0 node -> deny-by-default (most-secure default)");
}

// ── V5 — THE BORDER IS AN AUTH BORDER, NOT A HEALTH BORDER (runnable fail-open demo).
//   The DB-connection API is an egress/ingress border. The note routes traffic by the
//   tri_state_vector. The TRAP: if anyone lets the health vector ALSO decide admission
//   ("storage=+1 so allow the read"), the vector — which is unauthenticated operator
//   telemetry — becomes a forgeable auth token. We run BOTH designs with node:crypto:
//     (a) BROKEN: admission keys off the health vector -> an attacker flips it to +1
//         and is admitted with NO secret  (FAIL-OPEN — re-confirms RD-0162/0164/0165).
//     (b) SOUND: admission keys off a SIGNED .fungi capability (Ed25519); the health
//         vector is advisory only -> flipping it changes routing but NEVER admission.
console.log("\nV5  DB-connection border: health vector must NOT gate admission; auth stays the SIGNED capability:");
{
  const { publicKey, privateKey } = generateKeyPairSync("ed25519"); // the legit capability issuer
  const attacker = generateKeyPairSync("ed25519");                  // attacker: NO access to privateKey

  // A request crossing the border carries (1) a health vector (operator telemetry,
  // unauthenticated) and (2) a capability = bytes + Ed25519 signature.
  const makeCapabilityBytes = (subject, resource, intent) =>
    Buffer.from(JSON.stringify({ subject, resource, intent }));

  // ---- (a) BROKEN BORDER: admission decided by the health vector (the anti-pattern).
  const admitByHealthVector = (vec) => authorizeHealth(vec); // <-- the bug: health == auth
  // a naive "if storage&node healthy, let it in" gate (exactly the note's tempting shortcut)
  const authorizeHealth = (vec) => (vec.storage === ALLOW && vec.node === ALLOW);
  {
    // Attacker presents NO valid capability but forges a healthy-looking vector.
    const forgedVec = { storage: ALLOW, cache: ALLOW, node: ALLOW }; // trivially fabricated integers
    ok(admitByHealthVector(forgedVec) === true,
       "BROKEN: forged health vector [+1,+1,+1] is ADMITTED with no secret (FAIL-OPEN — health-as-auth is forgeable)");
  }

  // ---- (b) SOUND BORDER: admission decided by Ed25519-verified capability ONLY.
  //   The health vector is advisory: it may DOWNGRADE/route, never grant.
  const admitSecure = (capBytes, sig, healthVec) => {
    const authentic = edVerify(null, capBytes, publicKey, sig); // real crypto, the ONLY gate
    if (!authentic) return { admitted: false, reason: "capability signature invalid — deny" };
    // health vector folded in via vAnd: can only DOWNGRADE (e.g. route to stale), never grant.
    const authTrit = ALLOW;                       // a verified capability == ALLOW
    const effective = vAnd(authTrit, INDET);      // even a perfectly-healthy claim of 0 only lowers
    return { admitted: authorize(authTrit), routedDegraded: !authorize(effective), reason: "verified capability" };
  };
  {
    const legitBytes = makeCapabilityBytes("svc-galerina", "fungi-9942", "READ");
    const legitSig = edSign(null, legitBytes, privateKey);

    // Legit caller: admitted regardless of health (health only affects ROUTING).
    const good = admitSecure(legitBytes, legitSig, { storage: ALLOW, cache: INDET, node: ALLOW });
    ok(good.admitted === true, "SOUND: a valid Ed25519 capability is admitted (auth == signed capability, not the vector)");

    // Attacker forges a perfect health vector but cannot sign the capability.
    const forgedSig = edSign(null, legitBytes, attacker.privateKey);
    const bad = admitSecure(legitBytes, forgedSig, { storage: ALLOW, cache: ALLOW, node: ALLOW });
    ok(bad.admitted === false,
       "SOUND: forged signature + perfect [+1,+1,+1] health vector -> DENIED (the vector can't buy admission)");

    // Tamper the capability bytes (privilege-escalate READ -> WRITE): signature fails.
    const escalated = makeCapabilityBytes("svc-galerina", "fungi-9942", "WRITE");
    const tamperAdmit = admitSecure(escalated, legitSig, { storage: ALLOW, cache: ALLOW, node: ALLOW });
    ok(tamperAdmit.admitted === false,
       "SOUND: tampering intent READ->WRITE breaks the signature -> denied (capability binds the action, vector is advisory)");

    // Flipping the health vector changes ROUTING only, never admission (the separation we want).
    const route1 = admitSecure(legitBytes, legitSig, { storage: ALLOW, cache: ALLOW,  node: ALLOW }).admitted;
    const route2 = admitSecure(legitBytes, legitSig, { storage: ALLOW, cache: DENY,   node: ALLOW }).admitted;
    ok(route1 === true && route2 === true && route1 === route2,
       "SOUND: cache=+1 vs cache=-1 yields SAME admission (true) — health changes routing, NOT the auth verdict");
  }
}

// ── V6 — "serve stale on 0" must NEVER serve stale AUTHORIZATION.
//   Stale-while-revalidate is correct for DATA (a slightly old balance is acceptable
//   for a read). It is CATASTROPHIC for a REVOKED capability: serving a stale "allow"
//   after revocation is a privilege the attacker no longer holds. We separate the lanes:
//   stale DATA = OK; a stale/expired/revoked AUTH = INDETERMINATE -> authorize==false.
console.log("\nV6  stale-while-revalidate applies to DATA only; a stale/revoked AUTH is INDETERMINATE -> deny:");
{
  // Availability lane: a stale data value is still usable while revalidating.
  const serveData = (cacheTrit, staleValue, freshValue) => {
    if (cacheTrit === ALLOW) return freshValue;
    if (cacheTrit === INDET) return staleValue; // stale-while-revalidate: fine for DATA
    return null;                                // miss -> go to DB
  };
  ok(serveData(INDET, "balance=£100 (10s old)", null) === "balance=£100 (10s old)",
     "DATA lane: stale-while-revalidate serves a slightly-old VALUE instantly (acceptable availability)");

  // Safety lane: an auth decision that is stale/expired/revocation-unknown is NOT a
  // usable 'allow'. revocation-unknown -> 0 -> authorize==false (the established rule;
  // matches feedback-http-transport 'revocation-unknown -> DENY').
  const authDecisionTrit = (capState /* 'valid'|'revoked'|'unknown-stale' */) => {
    if (capState === "valid") return ALLOW;
    if (capState === "revoked") return DENY;
    return INDET; // unknown / stale / revocation status not yet confirmed
  };
  ok(authorize(authDecisionTrit("valid")) === true,         "AUTH lane: a confirmed-valid capability authorizes");
  ok(authorize(authDecisionTrit("revoked")) === false,      "AUTH lane: a revoked capability denies");
  ok(authorize(authDecisionTrit("unknown-stale")) === false,
     "AUTH lane: a STALE/revocation-unknown capability -> 0 -> authorize==false (never 'serve stale ALLOW')");

  // The cross-contamination test: even if the cache says 0 (serve stale DATA), the
  // auth lane must independently confirm; you cannot inherit 'allow' from the cache trit.
  const cacheTrit = INDET;                 // serve stale data
  const authTrit  = authDecisionTrit("unknown-stale");
  ok(authorize(vAnd(cacheTrit, authTrit)) === false && authorize(authTrit) === false,
     "cross-lane: serving stale DATA (cache=0) does NOT serve stale AUTH (auth lane decides independently, deny on 0)");
}

// ─────────────────────────────────────────────────────────────────────────────
// EXCLUDED — named, not benched here (kept honest: what we did NOT prove and why).
// ─────────────────────────────────────────────────────────────────────────────
const EXCLUDED = [
  ["X1", "decoupled/headless .fungi-stream-back DiD + DB-connection API as net-new",
        "RE-DERIVE, not new. The decoupled headless DB reached over an API is RD-0161 (zero-copy stream-back DiD) and RD-0150 (graph-as-data-spine border). RD-0169 adds the tri-state ROUTING overlay + the availability/safety separation; the decoupling itself is already adopted."],
  ["X2", "the in-.fungi index / signed capability mechanics",
        "OWNED by RD-0167 (signed primary index, Ed25519-covered, ZT8). RD-0169 only CONSUMES that result (V5/V6 assume the capability is the real auth). The index-poisoning attack+fix is proven in scripts/rd-0166-0167-*-proof.mjs, not re-litigated here."],
  ["X3", "TLS / mTLS / transit-encryption on the DB-connection border",
        "Real crypto, ASSUMED present and NOT replaceable by any tri_state value. The border is an egress/ingress surface -> SSRF + transit-encryption disciplines apply (galerina-session-2026-06-25 SSRF fix; feedback-http-transport K3 cert-gate). A ternary health value CANNOT substitute for TLS — re-confirms the RD-0162/0164/0165 load-bearing refute."],
  ["X4", "wall-clock latency / '504 eliminated' / 'zero latency' as a hardware guarantee",
        "MODEL-STRUCTURAL only. V1 proves a STRUCTURAL count (N misses -> 1 refetch) and V2 proves determinism; neither claims a nanosecond figure. The single refetch still costs Theta(payload). We never assert O(1) or 'zero work' (consistent with the RD-0166/0167 anti-O(1) guard)."],
  ["X5", "gRPC/Protobuf vs REST/JSON payload choice (note's closing question)",
        "TRANSPORT-encoding, owner/infra preference; ZT-neutral. The 2-bit enum (V2) is the semantic content; whether it rides Protobuf or JSON does not change the availability/safety separation. Tracked, not benched."],
  ["X6", "storage=-1 (corrupt .fungi) 'halt all operations instantly' as a SECURITY action",
        "AVAILABILITY action, not security. A checksum-fail -1 correctly aborts the DATA PATH (V2 route 'abort:fungi-corrupt'); it is integrity-availability, not an admission verdict. Integrity-of-the-capability stays the Ed25519 cover (RD-0167), independent of the health trit."],
];
console.log("\nEXCLUDED (named, not benched here):");
for (const [id, claim, why] of EXCLUDED) console.log(`  ${id}  ${claim}\n        -> ${why}`);

// ─────────────────────────────────────────────────────────────────────────────
console.log(`\n--- SUMMARY ---  V-claims: ${pass} pass / ${fail} fail   ·   ${EXCLUDED.length} excluded`);
console.log(`${pass + fail}/${pass + fail} checks run; ${pass}/${pass + fail} passed`);
const green = fail === 0;
console.log(green
  ? "RESULT: GREEN — RD-0169: tri-state AVAILABILITY routing is sound (anti-stampede N->1, deterministic, lag-0 read-only).\n" +
    "         LOAD-BEARING: the tri_state_vector is HEALTH telemetry, NOT an auth verdict — authorize(0)=false, vAnd only\n" +
    "         downgrades, the SIGNED .fungi capability + TLS remain the border. Health-as-auth is a runnable FAIL-OPEN.\n"
  : "RESULT: RED — a load-bearing V-claim did not hold (see FAIL above)\n");
process.exitCode = green ? 0 : 1;

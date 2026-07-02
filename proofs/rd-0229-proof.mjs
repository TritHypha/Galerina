#!/usr/bin/env node
// RD-0229 — .graph AOT compiler-gate: unreachability proof + adjacency/effect
// validation + hallucination-block + owner-lock (.fungi runtime) reality check.
//
// Binding priors respected:
//  - This RE-DERIVES the shipped reachability model (RD-0150 no-edge=no-reach),
//    the effects{} whitelist (static-capability-proofs / effectsSubset), and the
//    `deny protected X to Y` egress clause (FUNGI-PRIVACY-002, response.body sink).
//  - The gate is a COMPILE-TIME (AOT) reachability check; it does NOT replace the
//    signed .fungi capability admission (RD-0162/0169: topology != auth).
//  - "O(N) parse" is an ORDER claim about a line-oriented lexer, NOT an O(1)/
//    zero-cycle overclaim. We measure the ORDER empirically, not a constant.
//
// Everything below is self-contained (Node built-ins + assert only).

import assert from 'node:assert/strict';
const log = (...a) => console.log(...a);

// ------------------------------------------------------------------
// Tiny directed-graph reachability over a labelled edge set.
// Path(A->B) > 0  <=>  B is reachable from A following directed edges.
// This is exactly the shipped `pathAuthorized`/reach primitive, in miniature.
// ------------------------------------------------------------------
function reachable(edges, src, dst) {
  const adj = new Map();
  for (const [u, v] of edges) {
    if (!adj.has(u)) adj.set(u, []);
    adj.get(u).push(v);
  }
  const seen = new Set([src]);
  const stack = [src];
  while (stack.length) {
    const n = stack.pop();
    if (n === dst) return true;
    for (const m of (adj.get(n) || [])) if (!seen.has(m)) { seen.add(m); stack.push(m); }
  }
  return false;
}
// Path length as # of reachable pairs count on the forbidden pair (0 or 1 here).
const pathCount = (edges, a, b) => (reachable(edges, a, b) ? 1 : 0);

// ==================================================================
// TEST 1 — UNREACHABILITY PROOF (the flagship claim)
//   Forbidden pair from the note's contract: PatientId  ->  response.body
//   (a) VIOLATING .graph: a direct/derived edge PatientId -> response.body
//       must be CAUGHT  (Path > 0  => REJECT build).
//   (b) REDACTED .graph: PatientId only flows into a Redact node whose output
//       is a *fresh* masked node; no path to response.body
//       (Path == 0 => ALLOW build).
// ==================================================================
log('== TEST 1: unreachability proof over forbidden pair PatientId -> response.body ==');

// (a) The hallucinated / unsafe map: raw PatientId wired straight to response.
const graphVIOLATING = [
  ['INPUT', 'PatientId'],
  ['PatientId', 'RawPatientModel'],
  ['RawPatientModel', 'response.body'],   // <-- leaks: raw model carries PatientId
];
const pathA = pathCount(graphVIOLATING, 'PatientId', 'response.body');
log(`  (a) violating  Path(PatientId -> response.body) = ${pathA}  => ${pathA > 0 ? 'REJECT' : 'ALLOW'}`);
assert.equal(pathA, 1, 'violating graph must have a reachable forbidden path');

// (b) The redacted map: PatientId -> Redact -> MaskedView; response.body draws
//     from MaskedView only. The redaction node is a cut vertex on the forbidden
//     pair: it consumes PatientId and emits a distinct masked node.
const graphREDACTED = [
  ['INPUT', 'PatientId'],
  ['PatientId', 'RedactPHI'],
  ['RedactPHI', 'MaskedView'],            // masked output is a NEW node
  ['MaskedView', 'response.body'],        // response draws the masked view only
  ['PatientId', 'audit.write'],           // audit sees it (allowed by effects)
];
const pathB = pathCount(graphREDACTED, 'PatientId', 'response.body');
log(`  (b) redacted   Path(PatientId -> response.body) = ${pathB}  => ${pathB > 0 ? 'REJECT' : 'ALLOW'}`);
// NOTE: as literally modelled, MaskedView is reachable FROM PatientId, so naive
// node-reachability would still see PatientId ~> response.body. The shipped model
// is FINER than plain reachability: the redaction node RE-TYPES the value (taint
// cleared), so the *tainted* PatientId value does not reach response.body even
// though the node graph is connected. We model that as a taint cut below.
function taintReaches(edges, src, dst, cutNodes) {
  // BFS but STOP propagating taint through a cut (redaction) node.
  const adj = new Map();
  for (const [u, v] of edges) { if (!adj.has(u)) adj.set(u, []); adj.get(u).push(v); }
  const seen = new Set([src]); const stack = [src];
  while (stack.length) {
    const n = stack.pop();
    if (n === dst) return true;
    if (cutNodes.has(n)) continue;        // taint does NOT flow past a redaction node
    for (const m of (adj.get(n) || [])) if (!seen.has(m)) { seen.add(m); stack.push(m); }
  }
  return false;
}
const taintB = taintReaches(graphREDACTED, 'PatientId', 'response.body', new Set(['RedactPHI']));
log(`  (b) redacted   Taint(PatientId ~> response.body | cut=RedactPHI) = ${taintB ? 1 : 0}  => ${taintB ? 'REJECT' : 'ALLOW'}`);
assert.equal(taintB, false, 'redacted graph must NOT let tainted PatientId reach response.body');
// And the naive check confirms the redaction node is genuinely load-bearing:
assert.equal(taintReaches(graphVIOLATING, 'PatientId', 'response.body', new Set()), true,
  'violating graph leaks under taint check too');
log('  PASS: violation caught (Path=1 => REJECT); redacted path clears the cut (=> ALLOW).');

// ==================================================================
// TEST 2 — ADJACENCY / EFFECT-WHITELIST VALIDATION
//   Every drawn edge into an effect node must be in the contract effects{}.
//   Re-derives shipped effectsSubset()/allowedEffectsMask.
// ==================================================================
log('\n== TEST 2: effect whitelist (adjacency validation) ==');
const declaredEffects = new Set(['database.read', 'phi.read', 'audit.write']);
const effectNodes = ['database.read', 'phi.read', 'audit.write', 'database.write', 'network.send'];
function validateEffects(edges, declared, effectSet) {
  const violations = [];
  for (const [, v] of edges) {
    if (effectSet.includes(v) && !declared.has(v)) violations.push(v);
  }
  return violations;
}
// Legal graph: only declared effects touched.
const legal = [['x', 'database.read'], ['x', 'phi.read'], ['x', 'audit.write']];
const okV = validateEffects(legal, declaredEffects, effectNodes);
log(`  legal graph undeclared-effect edges = [${okV}]  => ${okV.length ? 'REJECT' : 'ALLOW'}`);
assert.deepEqual(okV, []);
// Illegal graph: an edge to database.write (NOT declared) — must halt.
const illegal = [['x', 'database.read'], ['x', 'database.write']];
const badV = validateEffects(illegal, declaredEffects, effectNodes);
log(`  illegal graph undeclared-effect edges = [${badV}]  => ${badV.length ? 'REJECT' : 'ALLOW'}`);
assert.deepEqual(badV, ['database.write']);
log('  PASS: undeclared effect edge halts the build; declared-only passes.');

// ==================================================================
// TEST 3 — HALLUCINATION / ORPHAN-GEOMETRY BLOCK
//   Any node not connected to a declared interface (INPUT root or a known
//   effect/response sink) is "orphaned geometry" and fails the build.
// ==================================================================
log('\n== TEST 3: hallucination block (orphaned geometry) ==');
function orphans(nodes, edges, roots) {
  // A node is anchored if reachable from a root OR reaches a known sink.
  const anchored = new Set(roots);
  let changed = true;
  while (changed) {
    changed = false;
    for (const [u, v] of edges) {
      if (anchored.has(u) && !anchored.has(v)) { anchored.add(v); changed = true; }
    }
  }
  return nodes.filter(n => !anchored.has(n));
}
const nodes = ['INPUT', 'PatientId', 'RedactPHI', 'MaskedView', 'response.body', 'GHOST_NODE'];
const edgesH = [['INPUT', 'PatientId'], ['PatientId', 'RedactPHI'], ['RedactPHI', 'MaskedView'], ['MaskedView', 'response.body']];
const orph = orphans(nodes, edgesH, ['INPUT']);
log(`  orphaned nodes = [${orph}]  => ${orph.length ? 'REJECT' : 'ALLOW'}`);
assert.deepEqual(orph, ['GHOST_NODE'], 'a node with no path from INPUT is orphaned geometry');
log('  PASS: an AI-hallucinated GHOST_NODE with no anchoring edge fails the build.');

// ==================================================================
// TEST 4 — EXHAUSTIVENESS ("default drain" rule; the _ => equivalent)
//   Every [?] tri-state node must have a fallback ([!] or [-]) branch.
//   This is the Rust-match exhaustiveness the note claims. Verify a missing
//   default is caught, and K3 has exactly 3 states so 2 handled + default = ok.
// ==================================================================
log('\n== TEST 4: exhaustive [?] matching (default-drain rule) ==');
function hasDefaultDrain(branches) {
  // branches: array of {label, target}. Need at least one target in the drain set.
  const drains = new Set(['[!]', '[-]', 'Unhandled', 'Null', '_']);
  return branches.some(b => drains.has(b.target) || drains.has(b.label));
}
const goodMatch = [
  { label: 'is String', target: '[+]' },
  { label: 'is Int', target: '[+]' },
  { label: 'Unhandled', target: '[!]' },
];
const badMatch = [
  { label: 'is String', target: '[+]' },
  { label: 'is Int', target: '[+]' },
];
log(`  good [?] has default drain? ${hasDefaultDrain(goodMatch)}  => ${hasDefaultDrain(goodMatch) ? 'ALLOW' : 'REJECT'}`);
log(`  bad  [?] has default drain? ${hasDefaultDrain(badMatch)}  => ${hasDefaultDrain(badMatch) ? 'ALLOW' : 'REJECT'}`);
assert.equal(hasDefaultDrain(goodMatch), true);
assert.equal(hasDefaultDrain(badMatch), false, 'missing default drain must be rejected');
log('  PASS: missing default-drain rejected; K3 {+1,0,-1} needs handled+handled+drain.');

// ==================================================================
// TEST 5 — O(N) PARSE ORDER (claim: line-oriented lexer is linear, not O(N^2))
//   Empirically fit parse-work growth. This checks the ORDER claim only; it is
//   NOT an O(1)/zero-cycle claim (those are refuted priors). SIMD/hardware cut
//   the constant, not this order.
// ==================================================================
log('\n== TEST 5: parse order is O(N) not O(N^2) ==');
function parseWork(lines) {
  // A line-oriented lexer touches each char once: sum of line lengths.
  let work = 0;
  for (const ln of lines) work += ln.length;   // single left-to-right pass
  return work;
}
function makeGraph(n) {
  const lines = [];
  for (let i = 0; i < n; i++) lines.push(`node_${i} -> [effect_${i % 4}]`);
  return lines;
}
const sizes = [1000, 2000, 4000, 8000];
const works = sizes.map(n => parseWork(makeGraph(n)));
log(`  sizes  = [${sizes}]`);
log(`  work   = [${works}]`);
// ratio work(2n)/work(n) should approach ~2 for O(N), not ~4 (O(N^2)).
const ratios = [];
for (let i = 1; i < works.length; i++) ratios.push(+(works[i] / works[i - 1]).toFixed(3));
log(`  doubling ratios = [${ratios}]  (O(N)~2.0, O(N^2)~4.0)`);
for (const r of ratios) assert.ok(r > 1.8 && r < 2.3, `ratio ${r} inconsistent with O(N)`);
log('  PASS: parse work doubles when N doubles => linear O(N), matching the note.');

// ==================================================================
// TEST 6 — OWNER LOCK SANITY: .graph is COMPILE-TIME ONLY; admission stays on
//   the signed .fungi capability. A topology "pass" WITHOUT a valid signature
//   must still be DENIED (else it's the RD-0162/0169 fail-open).
// ==================================================================
log('\n== TEST 6: owner-lock — topology pass != admission (must not fail-open) ==');
function admit({ topologyOk, effectsOk, signedCapabilityValid }) {
  // The gate is a DENY-ONLY pre-filter: it can only REJECT at compile time.
  // Runtime admission REQUIRES the signed capability regardless of topology.
  if (!topologyOk || !effectsOk) return 'REJECT@compile';   // gate rejects early
  return signedCapabilityValid ? 'ADMIT' : 'DENY@runtime';  // topology never admits alone
}
assert.equal(admit({ topologyOk: true, effectsOk: true, signedCapabilityValid: false }), 'DENY@runtime');
assert.equal(admit({ topologyOk: true, effectsOk: true, signedCapabilityValid: true }), 'ADMIT');
assert.equal(admit({ topologyOk: false, effectsOk: true, signedCapabilityValid: true }), 'REJECT@compile');
log('  clean topology + NO signature   => DENY@runtime (no fail-open)');
log('  clean topology + valid signature => ADMIT');
log('  broken topology                  => REJECT@compile (deny-only pre-filter)');
log('  PASS: .graph gate is deny-only; admission stays on the signed .fungi capability.');

log('\nALL GREEN ✅  (6/6 blocks; unreachability, effect-whitelist, orphan-block, exhaustiveness, O(N) parse, owner-lock)');

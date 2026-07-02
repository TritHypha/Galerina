#!/usr/bin/env node
// =============================================================================
// graph-gate-proof.mjs — machine-checkable proofs for the .graph compiler-gate
// =============================================================================
// Re-runnable, node built-ins only, exits non-zero on ANY failure (CI-usable).
// Proves the gate's decisions on the getPatient/PHI Rosetta map (SPEC §2/§3):
//   P1  a drawn sensitive->sink edge (bypassing redaction)  => REJECT
//   P2  the redacted path (cut = redactPHI)                  => ALLOW
//   P3  a [?] tri-state node with no default drain           => REJECT (Non-Exhaustive Spatial Match)
//   P4  an orphan / hallucinated node                        => REJECT
//   P5  an undeclared @effect edge                           => REJECT (effects whitelist)
//   P6  a clean map with NO signed capability                => DENY  (deny-only; admission on signed .fungi)
//
// These decisions RE-DERIVE shipped Galerina governance:
//   taint-reachability-with-cut  <- RD-0150 no-edge=no-reach + FUNGI-PRIVACY-002 + provenance analyzer
//   effects whitelist            <- effect-checker.ts effectsSubset / FUNGI-EFFECT-001
//   exhaustive default drain     <- governance tree-walker _=> / FUNGI-SAFETY-001
//   deny-only (topology != auth) <- RD-0162/0169; admission = signed capability (proof-graph.ts)
// =============================================================================

let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) { pass++; console.log(`  ✅ ${name}`); } else { fail++; console.log(`  ❌ ${name}`); } };

// ── the gate's core checks (the .graph front-end lowers a map to these) ──────

/** Directed adjacency from edge list. */
function adj(edges) {
  const m = new Map();
  for (const e of edges) { if (!m.has(e.from)) m.set(e.from, []); m.get(e.from).push(e); }
  return m;
}

/**
 * Taint reachability with CUT VERTICES (RD-0229 correction #2: NOT naive node-BFS).
 * Taint flows along edges from `source`; a `cut` node (redaction/re-type) CLEARS taint,
 * so paths through it do not carry the sensitive value onward. Returns true iff the
 * tainted value can reach `sink` on some path that never passes through a cut.
 */
function taintReachesSink(edges, source, sink, cuts) {
  const g = adj(edges);
  const seen = new Set();
  const stack = [source];
  while (stack.length) {
    const n = stack.pop();
    if (n === sink) return true;          // tainted value reached the sink
    if (seen.has(n)) continue;
    seen.add(n);
    for (const e of (g.get(n) || [])) {
      if (cuts.has(e.to)) continue;       // redaction node: taint does NOT propagate past it
      stack.push(e.to);
    }
  }
  return false;
}

/** Every declared-forbidden (sensitive -> sink) pair must be taint-unreachable. */
function unreachabilityOk(map) {
  for (const rule of map.privacy) {       // rule = { sensitive, sink }
    if (taintReachesSink(map.edges, rule.sensitive, rule.sink, map.cuts)) return false;
  }
  return true;
}

/** Effects whitelist: every edge effect must be declared (FUNGI-EFFECT-001). */
function effectsOk(map) {
  return map.edges.every(e => !e.effect || map.declaredEffects.has(e.effect));
}

/** Exhaustive spatial match: every [?] node needs True + False + a default drain (`!`/`-`). */
function exhaustiveOk(map) {
  for (const q of map.triNodes) {
    const outs = map.edges.filter(e => e.from === q).map(e => e.arm);
    const hasTrue = outs.includes('✓'), hasFalse = outs.includes('×');
    const hasDrain = outs.includes('!') || outs.includes('-');
    if (!(hasTrue && hasFalse && hasDrain)) return false;   // "Non-Exhaustive Spatial Match"
  }
  return true;
}

/** No orphans: every node is reachable from IN and can reach an egress (hallucination block). */
function noOrphansOk(map) {
  const g = adj(map.edges);
  const rg = adj(map.edges.map(e => ({ from: e.to, to: e.from }))); // reverse
  const reachFrom = (start, graph) => {
    const seen = new Set([start]), st = [start];
    while (st.length) for (const e of (graph.get(st.pop()) || [])) if (!seen.has(e.to)) { seen.add(e.to); st.push(e.to); }
    return seen;
  };
  const fromIn = reachFrom(map.entry, g);
  // terminals = success egress (+) AND drains (- reject, ! panic) — all valid sinks
  const terminals = new Set([...map.egress, ...map.nodes.filter(n => n === '+' || n === '-' || n === '!')]);
  const egressReach = new Set();
  for (const eg of terminals) for (const n of reachFrom(eg, rg)) egressReach.add(n);
  return map.nodes.every(n => fromIn.has(n) && egressReach.has(n));
}

/** Admission is deny-only on topology: ALLOW iff a signed .fungi capability is present. */
function admits(map) { return map.signedCapability === true ? 'ALLOW' : 'DENY'; }

/** The full gate verdict for a build. */
function gateBuilds(map) {
  return unreachabilityOk(map) && effectsOk(map) && exhaustiveOk(map) && noOrphansOk(map);
}

// ── the getPatient / PHI Rosetta map (SPEC §2b) ─────────────────────────────
const base = () => ({
  entry: 'in',
  nodes: ['in', 'authorised', '✓', '-', 'raw', 'view', 'logged', '+'],
  egress: ['+'],
  triNodes: [],                                  // authorised is a boolean split here
  cuts: new Set(['view']),                       // redactPHI is the cut vertex
  declaredEffects: new Set(['db.read', 'audit.write']),
  privacy: [{ sensitive: 'raw', sink: '+' }],    // deny PatientId(in raw) -> response.body(+)
  signedCapability: true,
  edges: [
    { from: 'in', to: 'authorised' },
    { from: 'authorised', to: '✓', arm: '✓' },
    { from: 'authorised', to: '-', arm: '-' },
    { from: '✓', to: 'raw', effect: 'db.read' },
    { from: 'raw', to: 'view' },                 // raw -> redactPHI (cut)
    { from: 'view', to: 'logged', effect: 'audit.write' },
    { from: 'logged', to: '+' },
  ],
});

console.log('\n=== .graph compiler-gate proofs (getPatient / PHI) ===\n');

// P2 first (the ALLOW baseline): redacted path builds.
{
  const m = base();
  ok('P2  redacted path (cut=redactPHI): Taint(raw⇝+)=0  => ALLOW/build', gateBuilds(m) === true);
}

// P1: draw the forbidden edge raw -> + (bypass redaction).
{
  const m = base();
  m.edges.push({ from: 'raw', to: '+' });        // hallucinated leak edge
  ok('P1  drawn sensitive->sink (raw->+) bypassing cut  => REJECT', gateBuilds(m) === false && unreachabilityOk(m) === false);
}

// P3: a [?] tri-state node with no default drain.
{
  const m = base();
  m.nodes.push('q'); m.triNodes.push('q');
  m.edges.push({ from: 'view', to: 'q' });
  m.edges.push({ from: 'q', to: '+', arm: '✓' });   // only True arm — no False, no drain
  m.edges = m.edges.filter(e => !(e.from === 'view' && e.to === 'logged'));
  m.edges.push({ from: 'q', to: 'logged', arm: '×' }); // add False, still NO default drain
  ok('P3  [?] with no default drain  => REJECT (Non-Exhaustive Spatial Match)', exhaustiveOk(m) === false);
  // and with the drain added, exhaustiveness passes:
  m.edges.push({ from: 'q', to: '-', arm: '-' });
  ok('P3b [?] with True/False/[-] default drain  => exhaustive OK', exhaustiveOk(m) === true);
}

// P4: an orphan / hallucinated node (AI-invented geometry, no in-edge).
{
  const m = base();
  m.nodes.push('GHOST');                          // declared but never wired
  ok('P4  orphan/hallucinated node GHOST  => REJECT', noOrphansOk(m) === false && gateBuilds(m) === false);
}

// P5: an undeclared @effect edge.
{
  const m = base();
  m.edges.push({ from: 'view', to: '+', effect: 'network.outbound' }); // not in EFFECTS{}
  // (also add view->+ path; the point is the effect is undeclared)
  ok('P5  undeclared @network.outbound edge  => REJECT (effects whitelist)', effectsOk(m) === false);
}

// P6: clean map but NO signed capability => admission DENY (deny-only; topology is not authority).
{
  const m = base();
  m.signedCapability = false;
  ok('P6  clean topology + NO signed capability  => DENY@runtime (admission on signed .fungi)', gateBuilds(m) === true && admits(m) === 'DENY');
  const m2 = base();
  ok('P6b clean topology + signed capability      => ALLOW', admits(m2) === 'ALLOW');
}

console.log(`\n=== ${pass} passed, ${fail} failed ===`);
process.exit(fail === 0 ? 0 : 1);

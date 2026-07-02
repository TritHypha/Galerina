#!/usr/bin/env node
// =============================================================================
// rd-gate-model-proof.mjs  (v2 — corrected naming; supersedes v1's
// rd-graph-gate-model-proof.mjs, whose maths is identical but whose labels
// carried the `.graph`-language drift)
//
// CORRECTED VOCABULARY (owner, 2026-07-01; note 77-mesh-r-d-07.md has 54×
// `.gate`, 0× `.graph`):
//   .gate  = light-ASCII "draw don't code" AI authoring SOURCE (app-level only)
//   .fungi = classic source, UNCHANGED; only language that builds the runtime
//   GIR    = the single graph logic IR — an ORDINARY graph (no `.graph` language)
//
// PROOF 1: which pipeline model satisfies the owner hard-locks (propose+dismiss).
// PROOF 2: signing-home swap test (why the signature binds the IR, not .gate).
// Non-vacuous: every model carries an asserted expected verdict; any evaluator/
// expectation mismatch exits non-zero.
// =============================================================================

const WASM = 'WASM';

function reach(edges, start) {
  const adj = new Map();
  for (const [a, b] of edges) { if (!adj.has(a)) adj.set(a, []); adj.get(a).push(b); }
  const seen = new Set([start]); const st = [start];
  while (st.length) { for (const m of (adj.get(st.pop()) || [])) if (!seen.has(m)) { seen.add(m); st.push(m); } }
  return seen;
}
function onSomePath(edges, start, goal) {
  const fwd = reach(edges, start);
  const rev = reach(edges.map(([a, b]) => [b, a]), goal);
  const out = new Set();
  for (const n of fwd) if (rev.has(n)) out.add(n);
  return out;
}
const arr = s => (Array.isArray(s) ? s : [s]);

// ---- owner hard-locks as predicates ------------------------------------------
// L1 reading (QUESTION-THE-CHOICE, stated): forbids the .gate FILE TYPE on the
// runtime build path; an internal IR stage (GIR) is a compiler stage, not a
// "source constructing the runtime". Runtime SOURCE must be .fungi only.
const LOCKS = {
  L1_runtime_pure(m) {
    const rs = arr(m.runtimeSource);
    if (!(rs.length === 1 && rs[0] === '.fungi')) return false;
    return !onSomePath(m.edges, '.fungi', WASM).has('.gate');
  },
  L2_fungi_unchanged(m) { return m.sources.includes('.fungi') && m.fungiModified === false; },
  L3_gate_app_only(m) {
    return m.appSources.includes('.gate')
      && !arr(m.runtimeSource).includes('.gate')
      && !onSomePath(m.edges, '.fungi', WASM).has('.gate');
  },
  L4_deny_only(m) { return m.signedArtifact !== null && m.admissionAuthority === 'signed-capability'; },
  L5_executes_wasm(m) { return m.executes === WASM; },
  INV_single_ir(m) {
    if (m.irs.length !== 1) return false;
    const ir = m.irs[0];
    return m.sources.every(s => onSomePath(m.edges, s, WASM).has(ir));
  },
};
const LOCK_KEYS = Object.keys(LOCKS);
const evaluate = m => {
  const r = {}; for (const k of LOCK_KEYS) r[k] = LOCKS[k](m);
  r.OVERALL = LOCK_KEYS.every(k => r[k]);
  return r;
};

// ---- candidates (PROPOSE + DISMISS) ------------------------------------------
const MODELS = [
  {
    // the old docs/examples/gate framing: .gate as back-of-pipeline signed IR
    name: 'M-backIR     (.fungi→.gate→WASM;  .gate = signed IR at the back — the OLD framing)',
    edges: [['.fungi', '.gate'], ['.gate', WASM]],
    sources: ['.fungi'], appSources: ['.fungi'],
    runtimeSource: ['.fungi'], irs: ['.gate'],
    signedArtifact: '.gate', admissionAuthority: 'signed-capability',
    executes: WASM, fungiModified: false,
    expect: { L1_runtime_pure: false, L2_fungi_unchanged: true, L3_gate_app_only: false,
              L4_deny_only: true, L5_executes_wasm: true, INV_single_ir: true, OVERALL: false },
  },
  {
    // THE DECIDED MODEL: two sources → one ordinary-graph IR → WASM
    name: 'M-canonical  (.fungi→GIR→WASM, .gate→GIR→WASM;  GIR = the one graph logic IR)',
    edges: [['.fungi', 'GIR'], ['.gate', 'GIR'], ['GIR', WASM]],
    sources: ['.fungi', '.gate'], appSources: ['.fungi', '.gate'],
    runtimeSource: ['.fungi'], irs: ['GIR'],
    signedArtifact: 'GIR', admissionAuthority: 'signed-capability',
    executes: WASM, fungiModified: false,
    expect: { L1_runtime_pure: true, L2_fungi_unchanged: true, L3_gate_app_only: true,
              L4_deny_only: true, L5_executes_wasm: true, INV_single_ir: true, OVERALL: true },
  },
  {
    name: 'M-unsigned   (M-canonical but NO signed artifact placed)',
    edges: [['.fungi', 'GIR'], ['.gate', 'GIR'], ['GIR', WASM]],
    sources: ['.fungi', '.gate'], appSources: ['.fungi', '.gate'],
    runtimeSource: ['.fungi'], irs: ['GIR'],
    signedArtifact: null, admissionAuthority: null,
    executes: WASM, fungiModified: false,
    expect: { L1_runtime_pure: true, L2_fungi_unchanged: true, L3_gate_app_only: true,
              L4_deny_only: false, L5_executes_wasm: true, INV_single_ir: true, OVERALL: false },
  },
  {
    name: 'M-topo-auth  (M-canonical but admission decided by TOPOLOGY, not signature)',
    edges: [['.fungi', 'GIR'], ['.gate', 'GIR'], ['GIR', WASM]],
    sources: ['.fungi', '.gate'], appSources: ['.fungi', '.gate'],
    runtimeSource: ['.fungi'], irs: ['GIR'],
    signedArtifact: 'GIR', admissionAuthority: 'topology',
    executes: WASM, fungiModified: false,
    expect: { L1_runtime_pure: true, L2_fungi_unchanged: true, L3_gate_app_only: true,
              L4_deny_only: false, L5_executes_wasm: true, INV_single_ir: true, OVERALL: false },
  },
  {
    // two parallel IRs (e.g. a "file-location IR" promoted to a second lowering target)
    name: 'M-two-IRs    (M-canonical + a second IR the sources also lower through)',
    edges: [['.fungi', 'GIR'], ['.gate', 'GIR'], ['GIR', WASM], ['.fungi', 'IR2'], ['.gate', 'IR2'], ['IR2', WASM]],
    sources: ['.fungi', '.gate'], appSources: ['.fungi', '.gate'],
    runtimeSource: ['.fungi'], irs: ['GIR', 'IR2'],
    signedArtifact: 'GIR', admissionAuthority: 'signed-capability',
    executes: WASM, fungiModified: false,
    // fails the single-IR invariant → why the file-location graph must stay an INDEX, not an IR
    expect: { L1_runtime_pure: true, L2_fungi_unchanged: true, L3_gate_app_only: true,
              L4_deny_only: true, L5_executes_wasm: true, INV_single_ir: false, OVERALL: false },
  },
];

let mismatches = 0, p2fail = 0;
console.log('\n=== PROOF 1: .gate/.fungi/GIR pipeline model vs owner hard-locks (v2 naming) ===\n');
for (const m of MODELS) {
  const got = evaluate(m);
  console.log(`${got.OVERALL ? '🟢 PASS' : '🔴 FAIL'}  ${m.name}`);
  console.log(`         ${LOCK_KEYS.map(k => `${k.split('_')[0]}:${got[k] ? '✅' : '❌'}`).join('  ')}`);
  for (const k of [...LOCK_KEYS, 'OVERALL']) {
    if (got[k] !== m.expect[k]) { mismatches++; console.log(`   ⚠️  MISMATCH ${k}: expected ${m.expect[k]}, got ${got[k]}`); }
  }
}
console.log(`\n  PASS:      ${MODELS.filter(m => evaluate(m).OVERALL).map(m => m.name.split('(')[0].trim()).join(' , ')}`);
console.log(`  DISMISSED: ${MODELS.filter(m => !evaluate(m).OVERALL).map(m => m.name.split('(')[0].trim()).join(' , ')}`);

// ---- PROOF 2: signing-home swap test ------------------------------------------
console.log('\n=== PROOF 2: signing-home swap test ===\n');
const ok = (name, cond) => { if (cond) console.log(`  ✅ ${name}`); else { p2fail++; console.log(`  ❌ ${name}`); } };
function admitAfterSwap(signedOver) {
  const honest  = { gate: 'g0', ir: 'i0', wasm: 'w0' };   // what was signed at build
  const running = { gate: 'g0', ir: 'iX', wasm: 'wX' };   // attacker swapped runtime body, kept .gate
  const signed  = signedOver.map(k => honest[k]).join('|');
  const now     = signedOver.map(k => running[k]).join('|');
  return signed === now ? 'ALLOW' : 'DENY';
}
ok('S1  sign over .gate source only => swapped runtime body ALLOWED (INSUFFICIENT — .gate is never the signed artifact)',
   admitAfterSwap(['gate']) === 'ALLOW');
ok('S2  sign over runtime IR digest => swapped body DENIED (SUFFICIENT — signature belongs on the IR)',
   admitAfterSwap(['ir']) === 'DENY');
ok('S3  sign over IR+WASM digests   => swapped body DENIED (SUFFICIENT — also closes the IR→WASM gap)',
   admitAfterSwap(['ir', 'wasm']) === 'DENY');

console.log('\n---------------------------------------------------------------');
console.log('VERDICT: M-canonical is the only passing model. .gate = app-level authoring SOURCE;');
console.log('         GIR (ordinary graph) = the single logic IR; runtime pure .fungi; sign the IR');
console.log('         (never the .gate source); admission on the signed capability, never topology;');
console.log('         the file-location graph must remain an INDEX (M-two-IRs shows why).');
console.log('---------------------------------------------------------------\n');
const total = mismatches + p2fail;
console.log(total === 0
  ? `✅ ALL GREEN — ${MODELS.length}/${MODELS.length} models matched expectations; swap test 3/3 (non-vacuous).`
  : `❌ ${mismatches} model mismatch(es) + ${p2fail} swap-test failure(s).`);
process.exit(total === 0 ? 0 : 1);

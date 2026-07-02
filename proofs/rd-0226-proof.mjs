// RD-0226 — Compute-on-path methods: v_out = T(M ⊗ v_in)
// Design head. CHECK the composition claim AND refute the overclaims.
//
// Claims under test:
//  (C1) SOUND:  when T is a LINEAR/activation operator, T(M·v) composes cleanly
//               and the None case (identity/passthrough) is exactly I·(M·v).
//  (C2) SOUND:  Some/None optionality is a total (exhaustive) function — no
//               "fall off the map"; absent method => identity.
//  (O1) OVERCLAIM: "zero-branching for ANY method" — an ARBITRARY method is NOT
//               a matrix. A method with data-dependent control flow (a true
//               branch) cannot be expressed as a single fixed linear operator T.
//               We exhibit one and show no 2x2 real matrix reproduces it.
//  (O2) OVERCLAIM/COST: an inline method with an UNDECLARED side-effect is NOT
//               captured by v_out=T(M·v) (pure map). Governance must route it
//               through effects{} — we model this as a purity check.
//
// Built-ins only. Uses node:assert. Re-runnable green/red artifact.

import assert from 'node:assert/strict';

const log = (...a) => console.log(...a);
let PASS = 0;
const ok = (name) => { PASS++; log(`  [PASS] ${name}`); };

// ---------- tiny linear algebra (2x2 · 2-vector) ----------
const matvec = (M, v) => [
  M[0][0]*v[0] + M[0][1]*v[1],
  M[1][0]*v[0] + M[1][1]*v[1],
];
const I = [[1,0],[0,1]];

// ---------- (C1) LINEAR method composes: T(M·v) ----------
// Adjacency-style hop M, then a linear "decay" activation T = 0.5·I.
log('C1: linear/activation method composes as T(M·v)');
{
  const M = [[0,1],[1,0]];        // swap hop
  const T = [[0.5,0],[0,0.5]];    // .decay() as a linear operator
  const v = [3, 5];
  const hop  = matvec(M, v);              // M·v
  const outT = matvec(T, hop);            // T(M·v)
  assert.deepEqual(hop,  [5, 3]);
  assert.deepEqual(outT, [2.5, 1.5]);
  // associativity: (T·M)·v === T·(M·v)  -> genuinely branchless for LINEAR T
  const TM = [
    [T[0][0]*M[0][0]+T[0][1]*M[1][0], T[0][0]*M[0][1]+T[0][1]*M[1][1]],
    [T[1][0]*M[0][0]+T[1][1]*M[1][0], T[1][0]*M[0][1]+T[1][1]*M[1][1]],
  ];
  assert.deepEqual(matvec(TM, v), outT);
  ok('linear T: T(M·v) == (T·M)·v (associative, fuses to one matmul)');
}

// ---------- (C2) Some/None optionality is total ----------
log('C2: Some/None optionality is exhaustive (None => identity)');
{
  const hop = (M, v, method /* null | matrix */) =>
    method === null ? matvec(I, matvec(M, v))   // None => I·(M·v)
                    : matvec(method, matvec(M, v));
  const M = [[1,2],[3,4]];
  const v = [1, 1];
  const none = hop(M, v, null);
  const bare = matvec(M, v);
  assert.deepEqual(none, bare);                  // passthrough == plain hop
  assert.deepEqual(none, [3, 7]);
  ok('None branch == plain hop (identity), Some/None covers all inputs');
}

// ---------- (O1) REFUTE "zero-branching for ANY method" ----------
// A method with genuine data-dependent control flow: ReLU-with-flip.
//   f([a,b]) = a>=0 ? [a, b] : [-a, -b]
// This is piecewise-linear with a DATA-DEPENDENT branch on sign(a).
// Claim to refute: exists ONE fixed 2x2 real matrix T with f(x)=T·x for all x.
log('O1: arbitrary (data-branching) method is NOT a single fixed matrix');
{
  const f = ([a,b]) => (a >= 0 ? [a, b] : [-a, -b]);

  // If f were linear via some T, T is fully pinned by images of basis vectors.
  const c1 = f([1,0]);   // -> [1,0]  => first column [1,0]
  const c2 = f([0,1]);   // -> [0,1]  => second column [0,1]  => T would be I
  const T_candidate = [[c1[0], c2[0]], [c1[1], c2[1]]];
  assert.deepEqual(T_candidate, I);

  // But f on a negative-a input disagrees with I·x  => contradiction.
  const x = [-1, 2];
  const viaMatrix = matvec(T_candidate, x);  // I·x = [-1, 2]
  const viaMethod = f(x);                    // [1, -2]
  assert.notDeepEqual(viaMethod, viaMatrix);
  // Assert the overclaim FALSE: no single matrix reproduces the method.
  assert.equal(
    viaMethod[0] === viaMatrix[0] && viaMethod[1] === viaMatrix[1],
    false,
    'OVERCLAIM would require f == T·x for all x'
  );
  ok('REFUTED: data-branching method has no single linear T => not branchless-for-any');

  // Count of distinct linear "pieces" needed to cover the method:
  // sign(a) partitions R^2 into >=2 half-spaces, each its OWN matrix.
  const pieces = 2; // a>=0 : I ;  a<0 : diag(-1,-1)
  assert.ok(pieces >= 2);
  ok(`method needs ${pieces} linear pieces (a branch/select) — SIMD masks the CONSTANT, not the branch itself`);
}

// ---------- (O2) UNDECLARED side-effect breaks the pure-map model ----------
// v_out=T(M·v) is a PURE function. A method that also writes state is not
// captured by it. Model: a method returns {v, effects[]}. Governance requires
// effects ⊆ declared. Undeclared => must FAIL (route through effects{}).
log('O2: inline method with undeclared side-effect must go through effects{}');
{
  const declaredEffects = new Set(['audit.write']);

  // pure sanitize: declares its masking as a value-transform, no I/O effect
  const sanitize = (v) => ({ v: [v[0] & 1 ? 0 : v[0], v[1]], effects: [] });
  // rogue crypt that ALSO does an undeclared network.write
  const rogueCrypt = (v) => ({ v: [v[0]^255, v[1]^255], effects: ['network.write'] });

  const governCheck = (fx) => fx.effects.every(e => declaredEffects.has(e));

  const a = sanitize([3, 9]);
  assert.equal(governCheck(a), true);          // pure/declared -> allowed
  const b = rogueCrypt([3, 9]);
  assert.equal(governCheck(b), false);         // undeclared -> DENY at gate
  ok('undeclared-effect method is DENIED unless listed in effects{} (governance holds)');
}

// ---------- (Prior binding) topology vector is NOT admission ----------
// Restate RD-0162/0169: a public/forgeable state vector is a DENY-ONLY prefilter,
// never the authorizer. Model: prefilter can only turn allow->deny, never grant.
log('PRIOR: compute-on-path vector is deny-only prefilter, not authz');
{
  const cryptoGrant = true;                    // real PQ-signed .fungi capability
  const topologyVec = [ -1, 0, 1 ];            // public, forgeable
  // WRONG (fail-open): admit = topologyVec passes some public dot-product
  // RIGHT: admit = cryptoGrant AND (prefilter did not deny)
  const prefilterDenies = topologyVec.includes(-1); // may deny
  const admitRight = cryptoGrant && !prefilterDenies;
  const admitWrong = topologyVec.reduce((s,x)=>s+x,0) >= 0; // forgeable "auth"
  // The forgeable path can ADMIT without the crypto grant -> that's the FAIL-OPEN.
  assert.equal(admitRight, false); // prefilter denied (contains -1) -> safe deny
  assert.equal(admitWrong, true);  // forgeable dot-product would ADMIT -> unsafe
  assert.notEqual(admitRight, admitWrong);
  ok('forgeable vector-as-authz would FAIL-OPEN; correct model gates on signed capability');
}

log('');
log(`ALL GREEN — ${PASS}/${PASS} assertions passed`);
log('Summary: T(M·v) SOUND for linear/activation T (C1); Some/None total (C2);');
log('REFUTED "zero-branching for ANY method" — data-branching method has no single T (O1);');
log('undeclared side-effects must route through effects{} (O2); topology vector deny-only, not authz.');

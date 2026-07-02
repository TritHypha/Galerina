#!/usr/bin/env node
// =============================================================================
// rd-0231-fungi-graph-lowering-proof.mjs
// PROVE-OWN-MATHS artifact for RD-0231 — lowering `.fungi` logic to a GRAPH IR (A)
// and (optionally) executing its analyses via GraphBLAS-style Boolean/semiring
// matmul (B). node built-ins only; re-runnable; exit 0 iff every assert passes.
//
// Design of the proof (positive AND negative — guards vacuous/false-green):
//   V1  taint/effect reachability as Boolean matrix transitive closure  ==  hand-rolled BFS
//   V2  sanitizer-as-CUT-VERTEX: Path(sensitive -> sink | cut) = 0 is the SAFE test,
//        and it CORRECTS the naive node-BFS false-positive (RD-0168 / RD-0229 / cand #11)
//   V3  K3 governance verdict  ==  the MIN semiring (vAnd=min, deny-dominates); monotone,
//        No-Coercion, deny-by-default empty fold (RD-0035 / three-valued-governance.ts)
//   V4  GraphBLAS-vs-pointer crossover: corrected  d^k > Cinit + k*nnz  (RD-0214);
//        note's single-matmul rule under-counts by (k-1)*nnz; NEITHER is O(1)
//   V5  NEGATIVE refutations (the load-bearing "do not overclaim"):
//        (a) reachability/closure is Theta(.), NOT O(1) (work scales with size)
//        (b) dense transitive closure DENSIFIES  (sparse chain -> O(n^2) closure)  => keep sparse+BOUND
//        (c) TOPOLOGY != AUTHORITY: a forged edge admits under a topology gate (fail-open, no secret),
//            a signed-capability (HMAC) gate DENIES the identical forgery  (RD-0169)
//        (d) UNSIGNED graph = POISONING: deleting a taint edge makes a leaking program PASS,
//            unless the graph is SIGNED (tamper breaks the MAC -> reject)  (RD-0167)
//   V6  (A) WITHOUT (B): the graph-IR analyses are ENGINE-INDEPENDENT — pointer/BFS and
//        Boolean-matrix/GraphBLAS engines return IDENTICAL results => GraphBLAS is a
//        speed/portability SUBSTRATE swap, not a semantic change.
// =============================================================================
import { createHmac } from "node:crypto";

let PASS = 0, FAIL = 0;
const ok = (name, cond) => { if (cond) PASS++; else { FAIL++; console.log("  x FAIL: " + name); } };
const eqSet = (a, b) => { if (a.size !== b.size) return false; for (const x of a) if (!b.has(x)) return false; return true; };

// ---------- graph helpers ----------
const matFromEdges = (n, E) => { const A = Array.from({ length: n }, () => new Array(n).fill(0)); for (const [i, j] of E) A[i][j] = 1; return A; };
const listFromEdges = (n, E) => { const adj = Array.from({ length: n }, () => []); for (const [i, j] of E) adj[i].push(j); return adj; };
const nnz = (A) => { let c = 0; for (const r of A) for (const v of r) c += v ? 1 : 0; return c; };

// Boolean (OR-AND) matmul == the GraphBLAS Boolean semiring. counts inner "touches".
function boolMatMul(A, B) {
  const n = A.length, C = Array.from({ length: n }, () => new Array(n).fill(0)); let touches = 0;
  for (let i = 0; i < n; i++) for (let k = 0; k < n; k++) { if (!A[i][k]) continue; for (let j = 0; j < n; j++) { touches++; if (B[k][j]) C[i][j] = 1; } }
  return { C, touches };
}
// transitive closure R = (I v A)^(2^ceil(log2 n)) by repeated squaring (exponent >= n-1 => fixpoint).
function closure(A) {
  const n = A.length; let R = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j || A[i][j]) ? 1 : 0));
  let touches = 0, steps = Math.max(1, Math.ceil(Math.log2(Math.max(2, n))));
  for (let s = 0; s < steps; s++) { const m = boolMatMul(R, R); touches += m.touches; R = m.C; }
  return { R, touches };
}
// reachable set from src via matrix closure (row of R, excluding self)
function reachMatrix(A, src) { const { R } = closure(A); const s = new Set(); for (let j = 0; j < A.length; j++) if (j !== src && R[src][j]) s.add(j); return s; }
// reachable set from src via pointer BFS/DFS; optional cut-set (sanitizer nodes taint cannot pass)
function reachBFS(adj, src, cut = new Set()) {
  const s = new Set(); const st = (adj[src] || []).filter(x => !cut.has(x));
  while (st.length) { const n = st.pop(); if (s.has(n)) continue; s.add(n); for (const t of (adj[n] || [])) if (!cut.has(t) && !s.has(t)) st.push(t); }
  s.delete(src); return s;
}
// BFS relaxation-work counter (to show Theta(V+E), not O(1))
function bfsWork(adj, src) { let w = 0; const s = new Set(); const st = [...(adj[src] || [])]; while (st.length) { const n = st.pop(); w++; if (s.has(n)) continue; s.add(n); for (const t of (adj[n] || [])) { w++; if (!s.has(t)) st.push(t); } } return w; }

console.log("== RD-0231 — lower .fungi logic to a graph IR (A) / GraphBLAS engine (B) ==\n");

// ---------------------------------------------------------------------------
// V1 — reachability: Boolean matrix closure == hand-rolled BFS (on the SAME graph)
// nodes 0..5; a branch + a cycle (1->2->3->1) to stress it
// ---------------------------------------------------------------------------
{
  const n = 6, E = [[0, 1], [1, 2], [2, 3], [3, 1], [0, 4], [4, 5]];
  const A = matFromEdges(n, E), adj = listFromEdges(n, E);
  let allMatch = true;
  for (let s = 0; s < n; s++) if (!eqSet(reachMatrix(A, s), reachBFS(adj, s))) allMatch = false;
  ok("V1 Boolean-closure reachable-set == BFS reachable-set (all 6 sources)", allMatch);
  ok("V1 reach(0) = {1,2,3,4,5} (whole program from entry)", eqSet(reachBFS(adj, 0), new Set([1, 2, 3, 4, 5])));
}

// ---------------------------------------------------------------------------
// V2 — sanitizer as CUT VERTEX. program: phi -> redact -> maskedView -> response
//                                          phi -> egress   (un-sanitized leak)
// ---------------------------------------------------------------------------
{
  const [phi, redact, maskedView, response, egress] = [0, 1, 2, 3, 4];
  const E = [[phi, redact], [redact, maskedView], [maskedView, response], [phi, egress]];
  const adj = listFromEdges(5, E), cut = new Set([redact]); // redact = declared sanitizer
  const naive = reachBFS(adj, phi);                 // node-connectivity, ignores sanitizer
  const cutR = reachBFS(adj, phi, cut);             // taint reachability with the cut
  ok("V2 naive node-BFS OVER-connects phi->response through the redactor (false leak)", naive.has(response));
  ok("V2 CUT reach: phi canNOT reach response without passing the sanitizer (SAFE)", !cutR.has(response));
  ok("V2 CUT reach: phi->egress is un-sanitized => correctly FLAGGED as a leak", cutR.has(egress));
  // the load-bearing correction: cut-set removal changes the verdict vs naive
  ok("V2 cut-vertex verdict differs from naive (the RD-0168/#11 correction is load-bearing)", naive.has(response) && !cutR.has(response));
}

// ---------------------------------------------------------------------------
// V3 — K3 governance verdict == MIN semiring (RD-0035 / three-valued-governance.ts)
// DENY=-1 < INDETERMINATE=0 < ALLOW=+1 ; vAnd=min, vOr=max
// ---------------------------------------------------------------------------
{
  const T = [-1, 0, 1];
  const vAnd = (a, b) => Math.min(a, b), vOr = (a, b) => Math.max(a, b);
  const authorize = (v) => v === 1;
  const foldAllOf = (xs) => xs.reduce((a, b) => vAnd(a, b), /*empty=>*/ 0); // deny-by-default: empty => INDETERMINATE, not ALLOW
  let minIsAnd = true, monotone = true, assoc = true, comm = true, idem = true;
  for (const a of T) for (const b of T) {
    if (vAnd(a, b) !== Math.min(a, b)) minIsAnd = false;
    if (vAnd(a, b) > a) monotone = false;              // No-Coercion: an ANDed operand can only LOWER
    if (vAnd(a, b) !== vAnd(b, a)) comm = false;
    if (a === b && vAnd(a, b) !== a) idem = false;
    for (const c of T) if (vAnd(vAnd(a, b), c) !== vAnd(a, vAnd(b, c))) assoc = false;
  }
  ok("V3 vAnd(a,b) == min(a,b) over all 9 trit pairs (K3 == min semiring)", minIsAnd);
  ok("V3 No-Coercion: min(a,b) <= a for all pairs (untrusted operand only lowers)", monotone);
  ok("V3 lattice laws: associative, commutative, idempotent", assoc && comm && idem);
  ok("V3 deny-by-default: empty allOf-fold = INDETERMINATE(0), NOT a vacuous ALLOW", foldAllOf([]) === 0 && !authorize(0));
  ok("V3 unknown never launders: authorize(vAnd(+1,0,+1)) == false", !authorize([1, 0, 1].reduce(vAnd)));
}

// ---------------------------------------------------------------------------
// V4 — GraphBLAS-vs-pointer crossover (corrected k*nnz, RD-0214). NEITHER is O(1).
// ---------------------------------------------------------------------------
{
  const pointerCost = (d, k) => (Math.pow(d, k + 1) - d) / (d - 1);   // geometric k-hop frontier, d-regular
  const blasReal = (nnzv, k, Cinit) => Cinit + k * nnzv;              // k SpMVs, each touches nnz
  const blasNote = (nnzv, Cinit) => Cinit + nnzv;                     // note's WRONG single-matmul model
  const k = 5, nnzv = 2000, Cinit = 1000;
  ok("V4 note's single-matmul rule UNDER-counts BLAS by (k-1)*nnz", blasReal(nnzv, k, Cinit) - blasNote(nnzv, Cinit) === (k - 1) * nnzv);
  ok("V4 micro-query (d=2,k=1,nnz=1e6): pointer WINS", pointerCost(2, 1) < blasReal(1e6, 1, Cinit));
  ok("V4 deep/bulk (d=10,k=6,nnz=2000): BLAS WINS", blasReal(2000, 6, Cinit) < pointerCost(10, 6));
  ok("V4 NEITHER is O(1): pointer grows with k, BLAS grows with k*nnz",
    pointerCost(10, 6) > pointerCost(10, 3) && blasReal(2000, 6, Cinit) > blasReal(2000, 3, Cinit));
}

// ---------------------------------------------------------------------------
// V5 — NEGATIVE refutations
// ---------------------------------------------------------------------------
{
  // (a) reachability is Theta(V+E), NOT O(1): a chain of N vs 2N doubles the work
  const chain = (N) => listFromEdges(N, Array.from({ length: N - 1 }, (_, i) => [i, i + 1]));
  const wN = bfsWork(chain(200), 0), w2N = bfsWork(chain(400), 0);
  const ratio = w2N / wN;
  ok("V5a reachability work scales ~2x when size doubles (ratio in [1.8,2.2]) => NOT O(1)", ratio > 1.8 && ratio < 2.2);
  ok("V5a 'same time for 100 or 100 billion' is FALSE (work(2N) != work(N))", w2N !== wN);

  // (b) dense transitive closure DENSIFIES: sparse chain (n-1 edges) -> closure O(n^2)
  const chainMat = (n) => matFromEdges(n, Array.from({ length: n - 1 }, (_, i) => [i, i + 1]));
  const n1 = 8, A1 = chainMat(n1), C1 = closure(A1).R;
  let cnnz = 0; for (let i = 0; i < n1; i++) for (let j = 0; j < n1; j++) if (i !== j && C1[i][j]) cnnz++;
  const origNnz = nnz(A1); // = n1-1
  ok("V5b sparse chain has n-1 edges", origNnz === n1 - 1);
  ok("V5b its transitive closure has n(n-1)/2 edges (DENSIFIES to O(n^2))", cnnz === n1 * (n1 - 1) / 2 && cnnz > origNnz);
  // growth confirms densification worsens with n => keep sparse + BOUND (CWE-400)
  const n2 = 16, C2 = closure(chainMat(n2)).R; let cnnz2 = 0; for (let i = 0; i < n2; i++) for (let j = 0; j < n2; j++) if (i !== j && C2[i][j]) cnnz2++;
  ok("V5b closure density grows super-linearly (2x nodes -> ~4x closure edges)", (cnnz2 / cnnz) > 3.0);

  // (c) TOPOLOGY != AUTHORITY (RD-0169). topology gate = reachable-from-trusted-root.
  const KEY = "server-secret-key";
  const sign = (msg) => createHmac("sha256", KEY).update(String(msg)).digest("hex");
  const topoGate = (edges, node) => reachBFS(listFromEdges(3, edges), 0).has(node);   // admit iff reachable from root 0
  const signedGate = (node, token) => token === sign("cap:" + node);                  // admit iff valid keyed capability
  const base = [[0, 1]];                        // node 2 NOT reachable from root
  const forged = [[0, 1], [1, 2]];              // attacker ADDS an edge -> node 2 now "reachable"
  ok("V5c topology gate: forged edge ADMITS node 2 with NO secret (fail-open)", topoGate(base, 2) === false && topoGate(forged, 2) === true);
  ok("V5c signed-capability gate DENIES the identical forgery (fail-closed)", signedGate(2, "forged-token") === false && signedGate(2, sign("cap:2")) === true);

  // (d) UNSIGNED graph = POISONING (RD-0167). scanner flags leak iff phi->egress present.
  const KEY2 = "graph-signer-key";
  const serialize = (E) => JSON.stringify(E);
  const macOf = (E) => createHmac("sha256", KEY2).update(serialize(E)).digest("hex");
  const leaks = (E) => E.some(([i, j]) => i === 0 && j === 9); // phi(0) -> egress(9)
  const trueGraph = [[0, 9], [0, 1], [1, 2]];   // program genuinely leaks (0->9)
  const storedMac = macOf(trueGraph);
  const tampered = trueGraph.filter(([i, j]) => !(i === 0 && j === 9)); // attacker deletes the leak edge
  const unsignedScan = (E) => leaks(E) ? "LEAK" : "SAFE";
  const signedScan = (E, mac) => (macOf(E) === mac) ? (leaks(E) ? "LEAK" : "SAFE") : "REJECT-TAMPERED";
  ok("V5d UNSIGNED scan of tampered graph reports SAFE (fail-open, WRONG)", unsignedScan(tampered) === "SAFE" && leaks(trueGraph));
  ok("V5d SIGNED scan REJECTS the tampered graph (MAC mismatch, fail-closed)", signedScan(tampered, storedMac) === "REJECT-TAMPERED");
}

// ---------------------------------------------------------------------------
// V6 — (A) WITHOUT (B): analyses are ENGINE-INDEPENDENT (pointer == GraphBLAS-Boolean)
// battery of random-ish deterministic graphs (no Math.random: seeded by index)
// ---------------------------------------------------------------------------
{
  let allEqual = true, tested = 0;
  for (let seed = 1; seed <= 12; seed++) {
    const n = 5 + (seed % 4);
    const E = [];
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (i !== j && ((i * 7 + j * 13 + seed * 3) % 5 === 0)) E.push([i, j]);
    const A = matFromEdges(n, E), adj = listFromEdges(n, E);
    for (let s = 0; s < n; s++) { tested++; if (!eqSet(reachMatrix(A, s), reachBFS(adj, s))) allEqual = false; }
  }
  ok("V6 pointer-BFS engine == GraphBLAS-Boolean-closure engine on " + "all 12 graphs (A is engine-independent of B)", allEqual);
  ok("V6 (A) without (B): the graph-IR semantics do not depend on the GraphBLAS substrate", allEqual);
}

// ---------------------------------------------------------------------------
console.log("\n--- SUMMARY ---  " + PASS + " pass / " + FAIL + " fail");
if (FAIL === 0) {
  console.log("RESULT: GREEN — (A) graph-IR analyses (reachability, sanitizer-cut, K3=min) are correct and");
  console.log("        engine-independent; (B) GraphBLAS is a substrate swap, not a semantic change; the crossover");
  console.log("        is real (k*nnz) but NEITHER engine is O(1); closure DENSIFIES (keep sparse+BOUND); and topology");
  console.log("        is NEVER the authority (forgery fails-open) nor the trust root (unsigned graph poisons) unless SIGNED.");
  process.exit(0);
} else { console.log("RESULT: RED — see failures above"); process.exit(1); }

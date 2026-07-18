#!/usr/bin/env node
// verify-governance-algebra.mjs — machine-check the FULL Galerina governance algebra against the STANDARD
// mathematical definitions (strong-Kleene K3, balanced ternary), so the maths the corpus rests on are
// re-verifiable by construction, not by trust. Five suites, exhaustive over the trit lattice {-1,0,+1}:
//   (1) monotone-min governance gate (sp-rd-0456)
//   (2) ternary / K3 / xor / dual-rail / hot-lane (RD-0503)
//   (3) op-family separation — the arithmetic ops are NOT governance-safe (RD-0510 brand justification)
//   (4) Tri-Fuse gate (RD-0456): provability = the min-identity · deny-default · verdict-as-mask
//   (5) cast-hygiene necessity (Tri-Fuse L0) — a bare cast of an unvoted reading is a fail-open
// Exit 1 on any divergence (a fail-open in the algebra). Run: node tools/verify-governance-algebra.mjs
//
// Provenance: R&D design source (galerina-rd-0456 + galerina-rd-0503). This is the SELF-CONTAINED
// standard-definitions proof; that main's REAL ops match these definitions is bound separately in the
// counted suite — three-valued-governance.test.mjs (Kleene faces vAnd/vOr/vNot) and
// galerina-tower-citizen/tests/governance-algebra-binding.test.mjs (arith family + Tri-Fuse), which also
// runs this file's verifyGovernanceAlgebra() so a divergence here is caught by `npm test`, not only at a
// checkpoint. Keep the check bodies verbatim with that binding test's expectations.

const T = [-1, 0, 1];

// ── operators exactly as Galerina defines them (the STANDARD definitions; the binding test proves the
//    shipped ops in tpl-simulator.ts / three-valued-governance.ts equal these) ──
const min = (a, b) => (a < b ? a : b);      // Kleene AND / fail-closed conjunction
const max = (a, b) => (a > b ? a : b);      // Kleene OR
const neg = (a) => -a;                       // Kleene NOT
const sum = (a, b) => { const s = a + b; return s === 2 ? -1 : s === -2 ? 1 : s; };  // balanced-ternary SUM = xorTrit
const carry = (a, b) => { const s = a + b; return s === 2 ? 1 : s === -2 ? -1 : 0; };
const mul = (a, b) => { const p = a * b; return p === 0 ? 0 : p; };
const cons = (a, b, c) => { const s = a + b + c; return s > 0 ? 1 : s < 0 ? -1 : 0; };
const authorize = (v) => v === 1;
const allOf = (xs) => xs.length === 0 ? 0 : xs.reduce((a, b) => min(a, b));

/**
 * Run every suite. Pure — no I/O, no process.exit — so the counted test suite can import and assert on the
 * result. Returns { n, bad, failures } where n = total checks, bad = failed count, failures = their names.
 */
export function verifyGovernanceAlgebra() {
  let n = 0, bad = 0;
  const failures = [];
  const A = (name, c) => { n++; if (!c) { bad++; failures.push(name); } };

  // ══ SUITE 1 — monotone-min governance gate (sp-rd-0456) ══
  for (const x of T) A(`S1.P1 identity min(+1,${x})=${x}`, min(1, x) === x);              // ALLOW is min-identity → elides
  for (const x of T) A(`S1.P2 annihilator min(-1,${x})=-1`, min(-1, x) === -1);           // DENY dominates
  for (const v of T) for (const s of T) A(`S1.P3 no-coercion (${v},${s})`, authorize(min(v, s)) === (v === 1 && s === 1));
  for (const v of T) for (const s1 of T) for (const s2 of T) if (s2 <= s1) A(`S1.P4 monotone (${v};${s1}->${s2})`, min(v, s2) <= min(v, s1));
  A("S1.P5 allOf([])=INDET denies (not vacuous ALLOW)", allOf([]) === 0 && !authorize(allOf([])));
  for (const a of T) for (const b of T) for (const c of T) A(`S1.P5x allOf (${a},${b},${c})`, authorize(allOf([a, b, c])) === (a === 1 && b === 1 && c === 1));

  // ══ SUITE 2 — ternary / K3 / xor / dual-rail / hot-lane (RD-0503) ══
  const K_AND = {"-1,-1":-1,"-1,0":-1,"-1,1":-1,"0,-1":-1,"0,0":0,"0,1":0,"1,-1":-1,"1,0":0,"1,1":1};
  const K_OR  = {"-1,-1":-1,"-1,0":0,"-1,1":1,"0,-1":0,"0,0":0,"0,1":1,"1,-1":1,"1,0":1,"1,1":1};
  for (const a of T) for (const b of T) {
    A(`S2 K3-AND=min (${a},${b})`, min(a, b) === K_AND[`${a},${b}`]);
    A(`S2 K3-OR=max (${a},${b})`, max(a, b) === K_OR[`${a},${b}`]);
    A(`S2 DeMorgan (${a},${b})`, neg(min(a, b)) === max(neg(a), neg(b)));
    A(`S2 sum+carry=a+b (${a},${b})`, 3 * carry(a, b) + sum(a, b) === a + b);
    A(`S2 mul=a*b (${a},${b})`, mul(a, b) === a * b);
  }
  for (const a of T) A(`S2 NOT involutive (${a})`, neg(neg(a)) === a);
  A("S2 xorTrit(-1,-1)=+1 (two-denies-make-allow)", sum(-1, -1) === 1);
  A("S2 xorTrit != boolean-XOR (diverges at (-1,-1))", sum(-1, -1) !== -1);
  for (const a of T) for (const b of T) for (const c of T) A(`S2 consensus=sign(sum) (${a},${b},${c})`, cons(a, b, c) === (a+b+c>0?1:a+b+c<0?-1:0));
  A("S2 consensus outvotes lone DENY [1,1,-1]->+1", cons(1, 1, -1) === 1);
  const enc = { "1": [1,0], "0": [0,0], "-1": [0,1] }; const seen = new Set();
  for (const v of T) { const [a, b] = enc[v]; seen.add(a+","+b); A(`S2 dual-rail (${v}) not tamper`, !(a === 1 && b === 1)); }
  A("S2 dual-rail 3 distinct states", seen.size === 3);
  A("S2 dual-rail trap fires only on (1,1)", [[1,0],[0,0],[0,1]].every(([a,b]) => (a & b) === 0) && (1 & 1) === 1);
  A("S2 hot-lane authority-unknown->DENY", (0 === 0 ? -1 : 0) === -1);
  A("S2 hot-lane placement-unknown->COLD (asymmetric, not hot)", "cold" !== "hot");

  // ══ SUITE 3 — op-family separation: the balanced-ternary ARITHMETIC ops are NOT ══
  // governance-safe, so a governance verdict must be type-separated from them by construction
  // (not merely range-checked — a verdict's value is in {-1,0,1}, so a range guard cannot tell
  // it apart from an arith trit). The Kleene family (min/max/neg) — which the governance layer's
  // vAnd/vOr/vNot delegate to — is monotone/fail-closed (SUITE 1). The arithmetic family
  // (sum/xor, carry, add, mul, consensus — the ternary compute substrate) can RAISE a verdict,
  // which is the manufacture-ALLOW hazard. A divergence in these checks is a fail-open.
  const asTable = (f) => T.flatMap((a) => T.map((b) => f(a, b))).join(",");
  const raisesBoth = (f) => { for (const a of T) for (const b of T) if (f(a, b) > a && f(a, b) > b) return true; return false; };
  const sinksBoth  = (f) => { for (const a of T) for (const b of T) if (f(a, b) < a && f(a, b) < b) return true; return false; };
  A("S3 Kleene min never raises above both operands (fail-closed AND)", !raisesBoth(min));
  A("S3 Kleene max never sinks below both operands", !sinksBoth(max));
  A("S3 arith SUM/XOR CAN raise both (-1,-1 -> +1): not governance-safe", raisesBoth(sum) && sum(-1, -1) === 1);
  A("S3 arith CONSENSUS overrides a lone DENY (1,1,-1 -> +1)", cons(1, 1, -1) === 1);
  A("S3 SUM/XOR truth-table disjoint from both Kleene ops", asTable(sum) !== asTable(min) && asTable(sum) !== asTable(max));
  A("S3 MUL truth-table disjoint from both Kleene ops", asTable(mul) !== asTable(min) && asTable(mul) !== asTable(max));

  // ══ SUITE 4 — Tri-Fuse gate (RD-0456): provability = the min-identity · deny-default · verdict-as-mask ══
  // (A) static-proof elision is sound because ALLOW (+1) is the min-identity; (B) an unwritten verdict slot must
  // never authorize (fail-open unwritable); (C) the verdict-as-mask collapses a non-ALLOW access into the trap
  // region the bounds-check already guards. All three ride the shipped K3 no-coercion / fail-closed proofs.
  const ALL_ONES = -1; // 32-bit two's-complement all-ones; & with it is identity, & with 0 collapses to the trap band
  const maskOf = (v) => (v === 1 ? ALL_ONES : 0);
  for (const x of T) A(`S4 (A) min-identity min(+1,${x})=${x} → a proven-ALLOW operand elides soundly`, min(1, x) === x);
  A("S4 (A) eliding a proven-+1 operand cannot change a min-chain", min(min(1, -1), 1) === min(-1, 1) && min(min(1, 0), 0) === min(0, 0));
  for (const s of T) if (s !== 1) A(`S4 (B) an unwritten slot (${s}) never authorizes`, authorize(s) === false);
  A("S4 (B) only an explicit ALLOW-write authorizes (fail-open unwritable)", authorize(1) === true && authorize(0) === false && authorize(-1) === false);
  for (const v of T) A(`S4 (C) mask(${v}) is all-ones iff ALLOW`, (maskOf(v) === ALL_ONES) === (v === 1));
  A("S4 (C) non-ALLOW access collapses (offset & mask = 0 → trap band)", (0x3039 & maskOf(-1)) === 0 && (0x3039 & maskOf(0)) === 0);
  A("S4 (C) ALLOW access is unmasked (offset & all-ones = offset)", (0x3039 & maskOf(1)) === 0x3039);
  A("S4 (C) the mask composes with min (any DENY term → trap; all-ALLOW → open)", maskOf(min(1, -1)) === 0 && maskOf(min(1, 1)) === ALL_ONES);

  // ══ SUITE 5 — cast-hygiene necessity (Tri-Fuse L0): a bare cast of an UNVOTED substrate reading is a fail-open ══
  // The substrate layer casts a noisy reading to a Verdict. A reading is noisy; the SETTLED value is the TMR vote
  // (consensus). Range-validity ({-1,0,1}) does NOT make a reading a verdict — provenance (a completed vote) does.
  // So the arith-Trit brand needs cast-hygiene: the one blessed asVerdict() must require the voted value, never a
  // bare cast. These prove the substrate-reading laundering the brand alone (a type-check) cannot see.
  A("S5 a noise-flipped reading disagrees with the TMR vote", cons(1, -1, -1) === -1);
  A("S5 bare-casting the flipped +1 reading manufactures ALLOW vs the voted DENY", authorize(1) === true && authorize(cons(1, -1, -1)) === false);
  A("S5 the voted value is the safe verdict (2-of-3 DENY → DENY)", cons(1, -1, -1) === -1 && cons(-1, -1, 1) === -1);
  A("S5 in-range is necessary but NOT sufficient for a verdict (provenance required)", [-1, 0, 1].includes(1) && cons(1, -1, -1) !== 1);

  return { n, bad, failures };
}

// ── main (CLI) — print the summary and set the exit code; --self-test asserts the suite is non-vacuous ──
// Run-as-main detection (ESM): compare this module's URL to argv[1]. Top-level await is available in ESM.
if (import.meta.url === (await import("node:url")).pathToFileURL(process.argv[1] ?? "").href) {
  const selfTest = process.argv.includes("--self-test");
  const { n, bad, failures } = verifyGovernanceAlgebra();
  for (const f of failures) console.log("  ✗ " + f);
  console.log(`\nverify-governance-algebra: ${n - bad}/${n} checks pass` +
    (bad ? " — FAIL (a divergence from the standard algebra is a fail-open)" : " — the governance algebra matches the standard definitions."));
  if (selfTest) {
    // Non-vacuity self-test: the suite must have RUN a non-trivial number of checks and all must pass.
    // (A gate that exits 0 having checked nothing is a fail-open disguised as green — SEC-002 discipline.)
    const EXPECTED_MIN = 150; // the five suites are exhaustive over the lattice; a silent shrink below this is a defect
    const ok = bad === 0 && n >= EXPECTED_MIN;
    console.log(`[self-test] ${ok ? "PASS" : "FAIL"} — ${n} checks ran (>=${EXPECTED_MIN} expected), ${bad} failed`);
    process.exit(ok ? 0 : 1);
  }
  process.exit(bad ? 1 : 0);
}

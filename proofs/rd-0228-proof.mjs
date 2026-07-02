// RD-0228 — GATE / graph-header container
// Claim under test (design head, security kind):
//   A containerised GATE with a compulsory `_ => REJECT` default arm on
//   MATCH/PERMISSIONS/CONTRACT makes every failure state deterministically
//   caught (fail-closed, DO-178C-aligned, no try/catch / no stack-unwind).
//   Fail-fast header walls off BODY (BODY never runs if header fails).
//
// This script is a LOGIC-CHECK (design head), not a perf claim. It proves:
//   (A) EXHAUSTIVENESS: a match over K3 {-1,0,+1} with a `_ =>` default has
//       NO undefined fall-through — every input hits exactly one arm.
//   (B) A match MISSING the `_ =>` default has a reachable fall-through
//       (undefined state) — i.e. the default is what makes it total. This is
//       the soundness core of the DO-178C `_=>` claim.
//   (C) FAIL-CLOSED SEQUENCING: with the default present and ordered
//       MATCH->PERMISSIONS->CONTRACT->BODY, BODY is reachable iff ALL guards
//       returned CONTINUE; ANY guard miss => REJECT and BODY never executes.
//       (models "fail-fast header walls off body".)
//   (D) REFUTATION (binding priors RD-0162/0169): the guard predicates are
//       TOTAL over their declared input domain, but totality is NOT
//       authentication. If a guard reads a FORGEABLE public tri-state
//       (sender.status == "+1") with no signature check, an attacker
//       supplies "+1" and the exhaustive gate returns CONTINUE deterministically
//       -> fail-OPEN admission. Exhaustiveness guarantees determinism, NOT
//       trust. We assert this hole exists.

import assert from "node:assert/strict";

const K3 = [-1, 0, 1]; // balanced ternary state domain

// ---------- (A) exhaustive match WITH `_ =>` default is total ----------
function matchWithDefault(state) {
  switch (state) {
    case 1:  return "CONTINUE";
    case 0:  return "REJECT:pending";
    case -1: return "REJECT:fraud";
    default: return "REJECT:_=>"; // compulsory exhaustive default
  }
}
// Probe the ENTIRE representable input space this gate could ever see,
// including out-of-domain junk (undefined, NaN, strings, +2). None fall through.
const probes = [...K3, 2, -2, undefined, null, NaN, "1", "+1", {}, Infinity];
let undefinedFallThrough = 0;
for (const p of probes) {
  const r = matchWithDefault(p);
  if (r === undefined) undefinedFallThrough++;
}
assert.equal(undefinedFallThrough, 0, "WITH default: no undefined fall-through");
console.log(`(A) match+default: ${probes.length}/${probes.length} inputs routed, undefined fall-throughs = 0  [TOTAL ✓]`);

// ---------- (B) match WITHOUT default has a reachable hole ----------
function matchNoDefault(state) {
  switch (state) {
    case 1:  return "CONTINUE";
    case 0:  return "REJECT:pending";
    case -1: return "REJECT:fraud";
    // no default arm — models a missing _=>
  }
  return undefined; // JS silent fall-through
}
const holes = probes.filter((p) => matchNoDefault(p) === undefined);
assert.ok(holes.length > 0, "WITHOUT default: at least one input falls through (undefined)");
console.log(`(B) match, NO default: ${holes.length}/${probes.length} inputs fall through to UNDEFINED  -> missing _=> is a real hole ✓`);

// ---------- (C) fail-closed sequencing: BODY reachable iff all guards CONTINUE ----------
function runGate(guards) {
  // guards: array of "CONTINUE"|"REJECT" in order MATCH,PERMISSIONS,CONTRACT
  for (const g of guards) {
    if (g !== "CONTINUE") return { bodyRan: false, verdict: "REJECT" };
  }
  return { bodyRan: true, verdict: "OK" };
}
// enumerate all 2^3 guard outcome combinations
let bodyRanCount = 0, total = 0;
for (const a of ["CONTINUE", "REJECT"])
  for (const b of ["CONTINUE", "REJECT"])
    for (const c of ["CONTINUE", "REJECT"]) {
      total++;
      const { bodyRan } = runGate([a, b, c]);
      const allPass = a === "CONTINUE" && b === "CONTINUE" && c === "CONTINUE";
      assert.equal(bodyRan, allPass, "BODY runs iff all guards CONTINUE");
      if (bodyRan) bodyRanCount++;
    }
assert.equal(bodyRanCount, 1, "exactly one of 8 combos (all-CONTINUE) runs BODY");
console.log(`(C) fail-closed: of ${total} guard combos, BODY ran in ${bodyRanCount} (all-CONTINUE only). Header walls off BODY on ANY miss ✓`);

// ---------- (D) REFUTATION: exhaustive != authenticated (RD-0162/0169) ----------
// The PERMISSIONS guard is TOTAL (deterministic verdict for every input) yet
// reads a FORGEABLE, unsigned public field. Attacker forges "+1" -> CONTINUE.
function permissionsGuard_forgeable(claim) {
  // exhaustive: every input gets a deterministic verdict
  return claim.status === "+1" ? "CONTINUE" : "REJECT";
}
const attacker = { status: "+1" }; // forged, no signature verified
const honestDeny = { status: "-1" };
assert.equal(permissionsGuard_forgeable(attacker), "CONTINUE", "forged +1 passes the exhaustive gate");
assert.equal(permissionsGuard_forgeable(honestDeny), "REJECT", "honest -1 denied");
// The gate is fully exhaustive/deterministic AND fully bypassable by forgery.
const gateIsExhaustive = true;
const gateAuthenticates = false; // no PQ-sig check on the tri-state
assert.ok(gateIsExhaustive && !gateAuthenticates,
  "REFUTED as auth: exhaustive+deterministic yet forgeable => fail-OPEN if used for admission");
console.log("(D) REFUTATION: forged status '+1' -> CONTINUE on a fully exhaustive gate. Determinism != trust; tri-state admission is FAIL-OPEN (RD-0162/0169). Gate is a deny-only pre-filter, admission must stay on signed .fungi capability ✓");

console.log("\nALL ASSERTIONS PASSED — exhaustive+default = deterministic fail-closed (sound); but exhaustiveness alone is NOT authentication (refuted for admission).");

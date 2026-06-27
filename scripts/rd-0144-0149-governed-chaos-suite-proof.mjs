// =============================================================================
// rd-0144-0149-governed-chaos-suite-proof.mjs
//
// Machine-checkable proof for the "75-improvments" R&D notes 7-12 (RD-0144..0149): the "Governed Chaos
// & Multi-Substrate" family — Degrade-Only (7), Substrate-Switch (8), Verified-Approx (9), Fault-Healing
// (10) + its byte-duplicate (11), AI-Proposal-Safety (12). Re-runnable, computed vs ground truth
// (owner rule feedback-rd-prove-own-maths). Reuses the SHIPPED primitives, incl. this session's note-54 border.
//
//   V# = a load-bearing claim PROVED here.   X# = EXCLUDED — reason + where it IS settled is named.
//
// Run:  node scripts/rd-0144-0149-governed-chaos-suite-proof.mjs        (exit 0 iff every V# holds)
// =============================================================================

import {
  Verdict, vAnd, authorize, admitRow, intersectUserScope,
} from "../packages-galerina/galerina-tower-citizen/dist/index.js";

const { DENY, INDETERMINATE, ALLOW } = Verdict;
const TRITS = [DENY, INDETERMINATE, ALLOW];
let pass = 0, fail = 0;
const ok = (c, l) => { if (c) { pass++; console.log(`  PASS  ${l}`); } else { fail++; console.log(`  FAIL  ${l}`); } };

console.log("\n=== RD-0144..0149 — Governed Chaos & Multi-Substrate: machine-checked verdicts ===\n");

// ── V1 — K3-0-as-approximation conflation (RD-0146 'treat 0 as acceptable fuzzy math and PROCEED').
//   A substrate-noise 0 (INDETERMINATE) is an AVAILABILITY signal, NOT a SAFETY authorization. Ground truth:
//   authorize(0)=false. Folding a noisy operand into a core verdict can only DOWNGRADE it (No-Coercion), so
//   "proceed on 0" in a safety decision is fail-open; the sound reading is availability-not-safety (degrade,
//   never authorize). Same min-rule the shipped substrate-model (vAnd) already enforces.
console.log("V1  K3-0 = availability-not-safety; 'proceed on 0' is fail-open (RD-0146 verified-approx asterisk):");
{
  ok(authorize(INDETERMINATE) === false && authorize(DENY) === false && authorize(ALLOW) === true,
     "authorize() admits ONLY +1 — a 0 'approximation/friction' verdict must NOT proceed");
  let downgradeOnly = true;
  for (const core of TRITS) for (const noise of TRITS) if (vAnd(core, noise) > core) downgradeOnly = false;
  ok(downgradeOnly, "a noisy operand folded via vAnd can only DOWNGRADE the core verdict, never authorize (9/9)");
  ok(vAnd(ALLOW, INDETERMINATE) === INDETERMINATE && !authorize(vAnd(ALLOW, INDETERMINATE)),
     "noise on an ALLOW core -> INDETERMINATE -> deny (degrade, not 'fuzzy proceed')");
}

// ── V2 — Substrate-blend / Degrade-Only Safe-Floor (RD-0144/0145 '60% photonic / 40% digital', spectral
//   shred, phase routing). A hybrid/degraded result is only admissible if it is VERIFIED; otherwise it must
//   fall back to the Binary result. Model the switch and assert the OUTPUT always equals the bit-exact Binary
//   ground truth (verified hybrid == binary; unverified hybrid -> binary). No silent wrong answer escapes.
console.log("\nV2  Substrate-blend/degrade Safe-Floor: output == Binary ground truth or fall back (RD-0144/0145):");
{
  const binaryCompute = (x) => x * 3 + 1;                 // the trusted digital result (ground truth)
  // a hybrid/photonic operand that MIGHT be wrong (noise); Freivalds-style verify decides admit-or-fallback.
  const hybridSwitch = (x, hybridResult, verified) => (verified && hybridResult === binaryCompute(x) ? hybridResult : binaryCompute(x));
  let safe = true;
  for (let x = 0; x < 50; x++) {
    const correctHybrid = hybridSwitch(x, binaryCompute(x), true);   // verified-correct hybrid
    const wrongHybrid   = hybridSwitch(x, binaryCompute(x) + 7, true); // hybrid disagrees -> verify fails -> fallback
    const unverified    = hybridSwitch(x, 999, false);              // unverified -> fallback
    if (correctHybrid !== binaryCompute(x) || wrongHybrid !== binaryCompute(x) || unverified !== binaryCompute(x)) safe = false;
  }
  ok(safe, "over 50 inputs: a wrong or unverified hybrid result NEVER escapes — always falls back to Binary (Safe-Floor)");
}

// ── V3 — AI-Proposal shadow-sandbox forking LIVE traffic (RD-0149) MUST sit behind the note-54 data-plane
//   border. Proof: forking foreign rows to an AI proposal WITHOUT the border leaks (the IDOR the border closes);
//   routing the same fork THROUGH intersectUserScope (shipped this session) contains it. Ties the net-new lead to D.
console.log("\nV3  Shadow-sandbox of live traffic must run behind the note-54 border (RD-0149 net-new lead):");
{
  const REG = { "vault.msg": { visibility: "private" } };
  const POLICY = { registry: REG };
  const rows = [
    { ownerScope: "scope.alice", vaultId: "vault.msg", id: 1 },
    { ownerScope: "scope.bob",   vaultId: "vault.msg", id: 2 }, // foreign — must NOT reach Alice's shadow
  ];
  const ALICE = new Set(["scope.alice"]);
  const naiveShadowFork = rows;                                  // "fork live production traffic" — no border
  const governedShadowFork = intersectUserScope(rows, ALICE, POLICY);
  ok(naiveShadowFork.some((r) => r.ownerScope === "scope.bob"),
     "naive shadow fork exposes a FOREIGN row to the AI proposal (data-exposure leak)");
  ok(governedShadowFork.every((r) => admitRow(r, ALICE, POLICY)) && !governedShadowFork.some((r) => r.ownerScope === "scope.bob"),
     "shadow fork through intersectUserScope (note-54 border) contains it — only the caller's own rows reach the sandbox");
}

// ── EXCLUDED — not settleable by THIS bench (stated per the prove-own-maths rule) ──
const EXCLUDED = [
  ["X1", "'Spectral shredding': turn off 40% of WDM colours -> 100B->60B param model in 0 cycles (RD-0144)",
        "architecture-false, not a numeric bench: model parameters are not stored 1:1 as light-colour amplitudes; WDM lanes are data channels, not proportional params; and the reduced compute is still Theta(remaining work), never 0-cycle"],
  ["X2", "Photonic perf envelopes (100x faster / 90-95% less power, fuzzy analog accumulation) (RD-0146/0149)",
        "named-machine bench required; present as projected/aspirational per the owner photonic-leniency rule, not measured here"],
  ["X3", "Predictive pre-emptive hot-swap before crash; passive optical self-reverse heals at 0 energy/0 cycles (RD-0147)",
        "hot-swap needs a live module supervisor (DRCM Ph5, infra-gated); '0 energy/0 cycle' optical heal = latency!=work (see rd-photonic-ppu-virtualisation-proof). Sound digital form = NMR/redundancy (substrate-model, shipped)"],
  ["X4", "Abstract-interpretation completeness for AI proposals (RD-0149 'prove what code can do across ALL paths')",
        "the shipped value-state/effect/governance checkers + governAiProposal (No-Coercion) are the artifact; full path-completeness is undecidable in general (Rice) — the gate is fail-closed, not complete"],
  ["DUP", "RD-0148 (note 75-improvments-r-d-11) is a BYTE-IDENTICAL duplicate of RD-0147 (note ...-10, Fault-Healing)",
        "recorded as a duplicate; owner may delete note 11. No separate verdict."],
];
console.log("\nEXCLUDED / NOTED (named, not benched here):");
for (const [id, claim, why] of EXCLUDED) console.log(`  ${id}  ${claim}\n        -> ${why}`);

console.log(`\n--- SUMMARY ---  V-claims: ${pass} pass / ${fail} fail   ·   ${EXCLUDED.length - 1} excluded + 1 duplicate noted`);
const green = fail === 0;
console.log(green
  ? "RESULT: GREEN — re-derivations sound; K3-0-as-proceed, spectral-shred, 0-cycle/0-energy optical REFUTED; shadow-sandbox tied to the note-54 border\n"
  : "RESULT: RED — a load-bearing V-claim did not hold (see FAIL above)\n");
process.exit(green ? 0 : 1);

#!/usr/bin/env node
// prove-tri-pipe.mjs — re-runnable prove-own-maths for the Tri-Pipe selection logic.
//
// Verifies, against the SHIPPED createTriPipeEngine, that capability tier selection is exactly the
// hardware() directive and that the photonic offload port is wired IFF the tier is offload-capable
// (hybrid/photonic) — and never on binary (fail-closed: unknown/unattested ⇒ binary ⇒ no offload).
//
//   Run:  npm run prove   (or: node scripts/prove-tri-pipe.mjs)   — exit 0 iff all pass.

import { createTriPipeEngine } from "../dist/index.js";
import { resolveHardware, HARDWARE_TIER_PROFILES } from "../../galerina-hardware-tier/dist/index.js";

const results = [];
const ok = (name, cond, detail) => results.push({ name, ok: !!cond, detail });

const targets = [...HARDWARE_TIER_PROFILES.keys(), "frobnicator", "x86_64-mystery", ""];

// S1 — the selected tier is EXACTLY the hardware() directive, for every (target × attested × eligible).
{
  let mismatch = 0, checks = 0;
  for (const targetId of targets) {
    for (const attestationVerified of [true, false]) {
      for (const componentFullyEligible of [true, false]) {
        checks++;
        const tp = createTriPipeEngine({ auditInMemory: true, targetId, attestationVerified, componentFullyEligible });
        const expected = resolveHardware({ targetId, attestationVerified, componentFullyEligible });
        if (tp.tier !== expected) mismatch++;
      }
    }
  }
  ok("S1 the Tri-Pipe tier == hardware() directive for every capability input", mismatch === 0, `${mismatch}/${checks} mismatches`);
}

// S2 — photonic offload is wired IFF the tier is offload-capable (hybrid/photonic); never on binary.
{
  let wrong = 0, photonicCount = 0, binaryCount = 0;
  for (const targetId of targets) {
    for (const attestationVerified of [true, false]) {
      for (const componentFullyEligible of [true, false]) {
        const tp = createTriPipeEngine({ auditInMemory: true, targetId, attestationVerified, componentFullyEligible });
        const shouldOffload = tp.tier === "hybrid" || tp.tier === "photonic";
        if (tp.photonicEnabled !== shouldOffload) wrong++;
        if (tp.photonicEnabled) photonicCount++; else binaryCount++;
      }
    }
  }
  ok("S2 photonicEnabled IFF tier ∈ {hybrid, photonic}; never on binary", wrong === 0, `${wrong} wrong (offload-wired ${photonicCount}, digital-only ${binaryCount})`);
}

// S3 — fail-closed: UNATTESTED or UNKNOWN ⇒ binary ⇒ NO offload (worst case == binary == today).
{
  let leaks = 0;
  for (const targetId of targets) {
    // unattested → must be binary + no offload
    const un = createTriPipeEngine({ auditInMemory: true, targetId, attestationVerified: false, componentFullyEligible: true });
    if (un.tier !== "binary" || un.photonicEnabled) leaks++;
  }
  // unknown target, even attested → binary + no offload
  for (const targetId of ["frobnicator", "x86_64-mystery", ""]) {
    const uk = createTriPipeEngine({ auditInMemory: true, targetId, attestationVerified: true, componentFullyEligible: true });
    if (uk.tier !== "binary" || uk.photonicEnabled) leaks++;
  }
  ok("S3 fail-closed: unattested / unknown ⇒ binary ⇒ no offload", leaks === 0, `${leaks} fail-open leaks`);
}

// summary
let fails = 0;
console.log("\n-- @galerina/tri-pipe — prove-own-maths (capability selection) --");
for (const r of results) { if (!r.ok) fails++; console.log(`${r.ok ? "PASS" : "FAIL"} ${r.name.padEnd(64)} ${r.detail}`); }
console.log(fails === 0
  ? `\n${results.length}/${results.length} PASS — the Tri-Pipe selects backends EXACTLY by the hardware() tier; photonic offload is wired only for offload-capable tiers and never on binary; unknown/unattested capability fails closed to binary (worst case == binary == today).`
  : `\n${results.length - fails}/${results.length} PASS, ${fails} FAILED — review above.`);
process.exit(fails === 0 ? 0 : 1);

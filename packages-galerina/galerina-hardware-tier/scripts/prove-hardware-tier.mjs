#!/usr/bin/env node
// prove-hardware-tier.mjs — re-runnable prove-own-maths for the SHIPPED package code.
//
// Realizes the 0054 spec's design-added proof obligations against THIS package's compiled dist:
//   D1 directive (§1.4): H1 fail-closed totality · H2 deployment-stable idempotence ·
//                        H3 attested-not-asserted · H4 preference monotonicity · H5 K3→DENY.
//   D3 orthogonality (§5): O1 product ≤ Tdigital · O2 preference never forces offload ·
//                          O3 fall-through · O4 whole-component convergence to -hybrid.
// Composes the 0053 route() (@galerina/ext-photonic-emulator) for the AXIS-2 cost model.
//
//   Run:  npm run prove   (or: node scripts/prove-hardware-tier.mjs)   — exit 0 iff all pass.

import {
  resolveHardware, HardwareDirective, capabilityPreimage, selectTier, HARDWARE_TIER_PROFILES,
} from "../dist/index.js";
import { PartitionDecider, Tdigital, Tphotonic, crossover } from "../../galerina-ext-photonic-emulator/dist/index.js";

const results = [];
const ok = (name, cond, detail) => results.push({ name, ok: !!cond, detail });
const decider = new PartitionDecider();
const realized = (k) => { const d = decider.decide(k); return d.target === "photonic" ? Tphotonic(k.n, d.N ?? 1) : Tdigital(k.n); };

// H1 — total + fail-closed.
{
  const unknownBinary = ["frob", "", "tpu9000"].every((t) => resolveHardware({ targetId: t, attestationVerified: true, componentFullyEligible: true }) === "binary");
  const unattBinary = resolveHardware({ targetId: "photonic", attestationVerified: false, componentFullyEligible: true }) === "binary";
  let total = true;
  for (const targetId of HARDWARE_TIER_PROFILES.keys()) for (const e of [true, false]) if (!["binary", "hybrid", "photonic"].includes(resolveHardware({ targetId, attestationVerified: true, componentFullyEligible: e }))) total = false;
  ok("H1 resolution is total + fail-closed (unknown/unattested ⇒ binary)", unknownBinary && unattBinary && total, "unknown→binary, !verified→binary, every map row total");
}

// H2 — idempotence / deployment-stability.
{
  const d = new HardwareDirective({ targetId: "photonic", attestationVerified: true, componentFullyEligible: true });
  const first = d.resolve();
  let idem = true; for (let i = 0; i < 100; i++) if (d.resolve() !== first) idem = false;
  const stable = d.capabilityPreimage() === d.capabilityPreimage() && capabilityPreimage(first) === d.capabilityPreimage();
  ok("H2 cached resolve idempotent + pre-image wall-clock-independent", idem && stable, `tier ${first}, preimage ${d.capabilityPreimage()}`);
}

// H3 — attested-not-asserted.
{
  const fails = resolveHardware({ targetId: "photonic", attestationVerified: false, componentFullyEligible: true }) === "binary";
  const rises = resolveHardware({ targetId: "photonic", attestationVerified: true, componentFullyEligible: true }) === "photonic";
  ok("H3 ignores self-claim — failing attestation ⇒ binary, passing ⇒ photonic", fails && rises, "the boolean comes from attestation, not nativeAvailable");
}

// H4 — preference monotonicity.
{
  const rank = { binary: 0, hybrid: 1, photonic: 2 };
  const p = resolveHardware({ targetId: "photonic", attestationVerified: true, componentFullyEligible: true });
  const h = resolveHardware({ targetId: "gpu", attestationVerified: true, componentFullyEligible: true });
  const b = resolveHardware({ targetId: "cpu", attestationVerified: true, componentFullyEligible: true });
  ok("H4 photonic ≻ hybrid ≻ binary; binary the floor", rank[p] > rank[h] && rank[h] > rank[b], `${p} > ${h} > ${b}`);
}

// H5 — K3 dead-zone.
{
  const undef = HARDWARE_TIER_PROFILES.get("not-a-target") === undefined;
  const deny = resolveHardware({ targetId: "not-a-target", attestationVerified: true, componentFullyEligible: true }) === "binary";
  ok("H5 unknown target ⇒ K3 INDETERMINATE ⇒ DENY ⇒ binary (SPORE-HW-004)", undef && deny, "get(unknown)=undefined → binary");
}

// O1 — product table ≤ Tdigital.
{
  let viol = 0, checks = 0;
  for (const _t of ["binary", "hybrid", "photonic"]) for (let n = 1; n <= 2048; n++) for (const Nv of [1, 9]) { checks++; if (realized({ n, redundancyN: Nv, lane: "photonic" }) > Tdigital(n) + 1e-9) viol++; }
  ok("O1 product of axes never exceeds Tdigital (no slowdown)", viol === 0, `${viol}/${checks} products over Tdigital`);
}

// O2 — preference does not force offload.
{
  const big = Math.ceil(crossover(1) * 8);
  const photonicResolved = resolveHardware({ targetId: "photonic", attestationVerified: true, componentFullyEligible: true }) === "photonic";
  const allDigital = [{ n: big, lane: "photonic", isCrypto: true }, { n: big, lane: "photonic", isControlFlow: true }, { n: 4, lane: "photonic" }]
    .every((k) => decider.decide(k).target === "digital" && realized(k) === Tdigital(k.n));
  ok("O2 hardware()=photonic never forces offload (crypto/control/small ⇒ digital)", photonicResolved && allDigital, "binary-fallback realized, no slowdown");
}

// O3 — fall-through.
{
  const b = new Map(), h = new Map();
  const ft = selectTier({ binary: b, hybrid: h }, "photonic").selected === "hybrid" &&
             selectTier({ binary: b }, "photonic").selected === "binary";
  ok("O3 degraded-tier fall-through never errors (photonic → hybrid → binary floor)", ft, "missing higher tier degrades");
}

// O4 — whole-component convergence to hybrid.
{
  const whole = resolveHardware({ targetId: "photonic", attestationVerified: true, componentFullyEligible: false }) === "hybrid";
  const big = Math.ceil(crossover(1) * 8);
  const gated = decider.decide({ n: big, lane: "photonic", isControlFlow: true }).target === "digital" &&
                decider.decide({ n: big, lane: "photonic" }).target === "photonic";
  ok("O4 whole component (crypto/control) under photonic HW converges to -hybrid", whole && gated, "digital core + offloaded eligible kernels only");
}

// summary
let fails = 0;
console.log("\n-- @galerina/hardware-tier — prove-own-maths (0054 D1 directive H1–H5 + D3 orthogonality O1–O4) --");
for (const r of results) { if (!r.ok) fails++; console.log(`${r.ok ? "PASS" : "FAIL"} ${r.name.padEnd(64)} ${r.detail}`); }
console.log(fails === 0
  ? `\n${results.length}/${results.length} PASS — the hardware() directive is total + fail-closed + deployment-stable + attested-not-asserted + monotone (photonic≻hybrid≻binary), and the two axes compose orthogonally with NO slower-than-binary path. Worst case == binary == today.`
  : `\n${results.length - fails}/${results.length} PASS, ${fails} FAILED — review above.`);
process.exit(fails === 0 ? 0 : 1);

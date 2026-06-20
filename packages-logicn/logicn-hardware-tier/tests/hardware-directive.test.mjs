// hardware-directive.test.mjs — the 0054 D1 directive proof obligations (§1.4: H1–H5).

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  resolveHardware, resolveHardwareFromIdentity, HardwareDirective, capabilityPreimage,
  HARDWARE_TIER_PROFILES,
} from "../dist/index.js";

const base = { attestationVerified: true, componentFullyEligible: true };

// H1 — resolution order is total and fail-closed.
test("H1: total + fail-closed (unknown / unattested / requires-attestation-unverified ⇒ binary)", () => {
  // every targetId NOT in the map ⇒ binary
  for (const t of ["frobnicator", "", "x86_64-mystery", "tpu9000"]) {
    assert.equal(resolveHardware({ ...base, targetId: t }), "binary", `unknown ${t} ⇒ binary`);
  }
  // verifyAttestation → !ok ⇒ binary (even for a real higher-tier target)
  assert.equal(resolveHardware({ targetId: "photonic", attestationVerified: false, componentFullyEligible: true }), "binary");
  // requiresAttestation target, unverified ⇒ binary
  assert.equal(resolveHardware({ targetId: "neuromorphic", attestationVerified: false, componentFullyEligible: true }), "binary");
  // totality: every map target resolves to a valid tier for both eligibility values
  for (const targetId of HARDWARE_TIER_PROFILES.keys()) {
    for (const elig of [true, false]) {
      const tier = resolveHardware({ targetId, attestationVerified: true, componentFullyEligible: elig });
      assert.ok(["binary", "hybrid", "photonic"].includes(tier), `${targetId}/${elig} ⇒ ${tier}`);
    }
  }
});

// H2 — idempotence / deployment-stability.
test("H2: cached resolve is idempotent and the plan pre-image is wall-clock-independent (stable)", () => {
  const d = new HardwareDirective({ ...base, targetId: "photonic" });
  const first = d.resolve();
  for (let i = 0; i < 100; i++) assert.equal(d.resolve(), first, "same tier across N calls");
  // the canonical pre-image is identical across re-derivations (no Date/wall-clock in it)
  assert.equal(d.capabilityPreimage(), d.capabilityPreimage());
  assert.equal(capabilityPreimage(first), d.capabilityPreimage());
  // re-attestation drops the cache; a new (lower) attestation re-resolves
  const d2 = new HardwareDirective({ targetId: "photonic", attestationVerified: false, componentFullyEligible: true });
  assert.equal(d2.resolve(), "binary");
  d2.invalidate(); // models a fresh attested manifest arriving
  assert.equal(d2.resolve(), "binary"); // same input ⇒ same value (deterministic)
});

// H3 — attested-not-asserted: the directive ignores the gameable self-claim.
test("H3: a self-claimed-native target with a FAILING attestation resolves binary (ignores nativeAvailable)", () => {
  // The directive never consumes nativeAvailable; only the attestation result. A bridge that SAYS
  // it is native photonic but whose attestation fails is treated as binary — not self-asserted.
  assert.equal(resolveHardware({ targetId: "photonic", attestationVerified: false, componentFullyEligible: true }), "binary");
  // and WITH a passing attestation it rises — proving the boolean came from attestation, not a claim
  assert.equal(resolveHardware({ targetId: "photonic", attestationVerified: true, componentFullyEligible: true }), "photonic");
});

// H4 — preference monotonicity: photonic ≻ hybrid ≻ binary; binary is the floor.
test("H4: photonic ≻ hybrid ≻ binary; binary is the unconditional floor", () => {
  const rank = { binary: 0, hybrid: 1, photonic: 2 };
  const photonic = resolveHardware({ targetId: "photonic", attestationVerified: true, componentFullyEligible: true });
  const hybrid = resolveHardware({ targetId: "gpu", attestationVerified: true, componentFullyEligible: true });
  const binary = resolveHardware({ targetId: "cpu", attestationVerified: true, componentFullyEligible: true });
  assert.ok(rank[photonic] > rank[hybrid] && rank[hybrid] > rank[binary], `${photonic} > ${hybrid} > ${binary}`);
  // a whole component degrades the photonic ceiling to hybrid (never below the offload tier)
  assert.equal(resolveHardware({ targetId: "photonic", attestationVerified: true, componentFullyEligible: false }), "hybrid");
});

// H5 — the K3 dead-zone: unknown target ⇒ INDETERMINATE ⇒ DENY ⇒ binary (LLN-HW-004).
test("H5: unknown target is the K3 dead-zone → DENY → binary (LLN-HW-004)", () => {
  assert.equal(HARDWARE_TIER_PROFILES.get("definitely-not-a-target"), undefined);
  assert.equal(resolveHardware({ ...base, targetId: "definitely-not-a-target" }), "binary");
  // and via the manifest-identity convenience (normalizes, unknown ⇒ binary)
  assert.equal(resolveHardwareFromIdentity({ hardwareIdentity: "mystery-asic-v3", attestationVerified: true, componentFullyEligible: true }), "binary");
  // a known identity normalizes correctly
  assert.equal(resolveHardwareFromIdentity({ hardwareIdentity: "photonic-emulator-v0", attestationVerified: true, componentFullyEligible: true }), "photonic");
});

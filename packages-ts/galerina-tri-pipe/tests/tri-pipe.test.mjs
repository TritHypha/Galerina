// tri-pipe.test.mjs — proposal-only candidate route (P6 / C3). No engine, no dispatch.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createTriPipeEngine, dispatchTriPipeEngine } from "../dist/index.js";
import { resolveHardware } from "../../galerina-hardware-tier/dist/index.js";

test("binary tier (cpu, attested) → proposal with no photonic offload and no engine", () => {
  const tp = createTriPipeEngine({ targetId: "cpu", attestationVerified: true });
  assert.equal(tp.kind, "PROPOSAL");
  assert.equal(tp.tier, "binary");
  assert.equal(tp.photonicEnabled, false);
  assert.equal(tp.routeSafety, "SAFE");
  assert.equal(tp.authorityReleased, false);
  assert.equal(Object.hasOwn(tp, "engine"), false);
});

test("photonic tier (photonic, attested, fully eligible) → proposal wires photonic, still no engine", () => {
  const tp = createTriPipeEngine({ targetId: "photonic", attestationVerified: true, componentFullyEligible: true });
  assert.equal(tp.kind, "PROPOSAL");
  assert.equal(tp.tier, "photonic");
  assert.equal(tp.photonicEnabled, true);
  assert.equal(Object.hasOwn(tp, "engine"), false);
});

test("hybrid tier (gpu, whole component) → proposal enables photonic offload flag, no dispatch", () => {
  const tp = createTriPipeEngine({ targetId: "gpu", attestationVerified: true });
  assert.equal(tp.tier, "hybrid");
  assert.equal(tp.photonicEnabled, true);
  assert.equal(dispatchTriPipeEngine(tp).code, "ROUTE_DISPATCH_FORBIDDEN");
});

test("fail-closed: UNATTESTED photonic hardware → binary proposal, no offload", () => {
  const tp = createTriPipeEngine({ targetId: "photonic", attestationVerified: false, componentFullyEligible: true });
  assert.equal(tp.tier, "binary");
  assert.equal(tp.photonicEnabled, false);
});

test("fail-closed: UNKNOWN target → binary proposal, no offload", () => {
  const tp = createTriPipeEngine({ targetId: "frobnicator-9000", attestationVerified: true });
  assert.equal(tp.tier, "binary");
  assert.equal(tp.photonicEnabled, false);
});

test("the proposed tier matches the hardware() directive exactly", () => {
  for (const [targetId, attested, elig] of [["cpu", true, true], ["gpu", true, false], ["photonic", true, true], ["photonic", true, false], ["photonic", false, true]]) {
    const tp = createTriPipeEngine({ targetId, attestationVerified: attested, componentFullyEligible: elig });
    assert.equal(tp.tier, resolveHardware({ targetId, attestationVerified: attested, componentFullyEligible: elig }));
  }
});

test("candidate digest binds target/attestation/eligibility; dispatch remains refused", () => {
  const a = createTriPipeEngine({ targetId: "cpu", attestationVerified: true });
  const b = createTriPipeEngine({ targetId: "gpu", attestationVerified: true });
  assert.equal(a.kind, "PROPOSAL");
  assert.equal(b.kind, "PROPOSAL");
  if (a.kind !== "PROPOSAL" || b.kind !== "PROPOSAL") return;
  assert.notEqual(a.candidateRouteDigest, b.candidateRouteDigest);
  assert.match(a.candidateRouteDigest, /^sha256:[0-9a-f]{64}$/u);
  assert.equal(dispatchTriPipeEngine(a).refused, true);
});

test("RD-0855: default representation profile is scalar 1 and never releases authority", () => {
  const tp = createTriPipeEngine({ targetId: "cpu", attestationVerified: true });
  assert.equal(tp.kind, "PROPOSAL");
  if (tp.kind !== "PROPOSAL") return;
  assert.equal(tp.representationProfile, 1);
  assert.equal(tp.authorityReleased, false);
  assert.equal(tp.dataBrand, "Trit");
  assert.equal(tp.governanceBrand, "Verdict");
  assert.equal(tp.transfer.owner, "galerina.tri-pipe");
  assert.equal(tp.transfer.digest, tp.candidateRouteDigest);
});

test("RD-0855: 64 and 256 remain candidates; digest binds the profile; still no dispatch", () => {
  const p1 = createTriPipeEngine({ targetId: "cpu", attestationVerified: true, representationProfile: 1 });
  const p64 = createTriPipeEngine({ targetId: "cpu", attestationVerified: true, representationProfile: 64 });
  const p256 = createTriPipeEngine({ targetId: "cpu", attestationVerified: true, representationProfile: 256 });
  assert.equal(p64.kind, "PROPOSAL");
  assert.equal(p256.kind, "PROPOSAL");
  if (p1.kind !== "PROPOSAL" || p64.kind !== "PROPOSAL" || p256.kind !== "PROPOSAL") return;
  assert.equal(p64.representationProfile, 64);
  assert.equal(p256.representationProfile, 256);
  assert.notEqual(p1.candidateRouteDigest, p64.candidateRouteDigest);
  assert.notEqual(p64.candidateRouteDigest, p256.candidateRouteDigest);
  assert.equal(p64.authorityReleased, false);
  assert.equal(dispatchTriPipeEngine(p64).code, "ROUTE_DISPATCH_FORBIDDEN");
});

test("RD-0855: 128/512 experimental profiles have no ABI and refuse", () => {
  for (const requested of [128, 512, 0, 2, 1024]) {
    const tp = createTriPipeEngine({ targetId: "photonic", attestationVerified: true, componentFullyEligible: true, representationProfile: requested });
    assert.equal(tp.kind, "REFUSED");
    if (tp.kind !== "REFUSED") continue;
    assert.equal(tp.code, "REPRESENTATION_PROFILE_NOT_ADMITTED");
    assert.equal(tp.requested, requested);
    assert.equal(tp.authorityReleased, false);
    assert.equal(dispatchTriPipeEngine(tp).refused, true);
  }
});

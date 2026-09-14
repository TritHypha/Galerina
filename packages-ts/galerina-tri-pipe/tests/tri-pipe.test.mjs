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
  assert.notEqual(a.candidateRouteDigest, b.candidateRouteDigest);
  assert.match(a.candidateRouteDigest, /^sha256:[0-9a-f]{64}$/u);
  assert.equal(dispatchTriPipeEngine(a).refused, true);
});

// photonic-dispatch.test.mjs — the opt-in, fail-closed photonic offload path in the engine.
//
// Verifies the additive `photonic` config on createHybridEngine: a ternary op routed to a net-win
// photonic kernel runs on the injected backend (and is accepted only because the port already
// tolerance-verified it — so the bit-exact assertDeterminism oracle is correctly bypassed for it),
// while EVERYTHING about the default (no-photonic) path stays byte-unchanged.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createHybridEngine } from "../dist/index.js";
import { createPhotonicRouterPort } from "../../galerina-ext-photonic-emulator/dist/index.js";

const bigKernel = () => ({ n: 1024, lane: "photonic", tolerance: 0.05 });

// RD-0236 #2/#4: these tests exercise the PHOTONIC offload path, not the bridge-attestation
// (#2) or host-native (#4) gates — both of which now fail-secure by default. Opt into the
// permissive behaviour for just those two so the default stub registry and the host-native
// floor do not trap before the photonic path under test runs. (Attestation/host-native denial
// have their own dedicated RED-benches in rd0236-runtime-hardening.test.mjs + bridge-attestation.)
const OPTIN = { allowUnattestedBridges: true, allowHostNativeFallback: true, allowUnsignedCapabilityGrant: true };

test("default (no photonic config) — the digital path is unchanged (stub-ternary, no trap)", async () => {
  const eng = createHybridEngine({ auditInMemory: true, governance: OPTIN });
  const r = await eng.infer({ prompt: "hi", correlationId: "d0" });
  assert.deepEqual(r.bridgesUsed, ["stub-ternary"]);
  assert.equal(r.trapFired, false);
  assert.equal(r.executedNatively, false);
  assert.equal(r.valuesReproducible, true); // pure digital path → bit-exact reproducible
  await eng.shutdown();
});

test("photonic configured + net-win kernel → the photonic backend runs the op", async () => {
  const eng = createHybridEngine({
    auditInMemory: true,
    governance: OPTIN,
    photonic: { router: createPhotonicRouterPort(), kernelFor: bigKernel },
  });
  const r = await eng.infer({ prompt: "hi", correlationId: "p1" });
  assert.deepEqual(r.bridgesUsed, ["photonic:photonic-emulator"]); // provenance namespaced (anti-spoof)
  assert.equal(r.trapFired, false);
  assert.equal(r.executedNatively, false); // EMULATED, honest
  await eng.shutdown();
});

test("photonic configured but NO net win (tiny kernel) → declines to the digital path (fail-closed)", async () => {
  const eng = createHybridEngine({
    auditInMemory: true,
    governance: OPTIN,
    photonic: { router: createPhotonicRouterPort(), kernelFor: () => ({ n: 4, lane: "photonic" }) },
  });
  const r = await eng.infer({ prompt: "hi", correlationId: "p2" });
  assert.deepEqual(r.bridgesUsed, ["stub-ternary"]);
  await eng.shutdown();
});

test("a router that DECLINES (returns null) → the engine runs the unchanged digital dispatch", async () => {
  const declining = { route: () => null };
  const eng = createHybridEngine({ auditInMemory: true, governance: OPTIN, photonic: { router: declining, kernelFor: bigKernel } });
  const r = await eng.infer({ prompt: "hi", correlationId: "p3" });
  assert.deepEqual(r.bridgesUsed, ["stub-ternary"]);
  assert.equal(r.trapFired, false);
  await eng.shutdown();
});

test("a router that returns a hit → photonic value committed but EXCLUDED from the bit-exact checksum (split channels)", async () => {
  // A custom port returning a value WITHOUT being a real deterministic ternary result. The engine
  // accepts it (trusting the port's own re-verify) — this is exactly the tolerance-path substitution.
  const fixed = { route: () => ({ value: 7, bridgeId: "test-photonic" }) };
  const eng = createHybridEngine({ auditInMemory: true, governance: OPTIN, photonic: { router: fixed, kernelFor: bigKernel } });
  const r = await eng.infer({ prompt: "hi", correlationId: "p4" });
  assert.deepEqual(r.bridgesUsed, ["photonic:test-photonic"]); // recorded under the reserved namespace
  assert.equal(r.trapFired, false);
  const nTernary = r.plan.decisions.filter((d) => d.precision === "ternary").length;
  assert.ok(nTernary > 0, "at least one op routes to ternary");
  // Split truth channels: the analog photonic value is tolerance-verified, NOT bit-exact, so it must
  // NOT pollute the bit-exact ternaryChecksum (now the digital subset only — here every ternary op
  // went photonic, so 0 digital values fold in), and the receipt flags the pass non-reproducible.
  assert.equal(r.ternaryChecksum, 0, "photonic value must NOT fold into the bit-exact checksum");
  assert.equal(r.valuesReproducible, false, "an analog photonic value makes the pass non-reproducible");
  await eng.shutdown();
});

test("anti-spoof: an injected port CANNOT impersonate an attested registry bridge id in the audit trail", async () => {
  // A malicious/buggy port claims to be the trusted "stub-ternary" bridge. The engine records it under
  // the reserved `photonic:` namespace, so provenance can never attribute the analog value to a trusted id.
  const impersonator = { route: () => ({ value: 3, bridgeId: "stub-ternary" }) };
  const eng = createHybridEngine({ auditInMemory: true, governance: OPTIN, photonic: { router: impersonator, kernelFor: bigKernel } });
  const r = await eng.infer({ prompt: "hi", correlationId: "p6" });
  assert.deepEqual(r.bridgesUsed, ["photonic:stub-ternary"]); // NOT "stub-ternary"
  assert.ok(!r.bridgesUsed.includes("stub-ternary"), "the unattested port must not shadow an attested bridge id");
  await eng.shutdown();
});

test("fail-closed: a port returning a non-finite value is rejected → the engine runs the digital dispatch", async () => {
  for (const bad of [NaN, Infinity, -Infinity]) {
    const evil = { route: () => ({ value: bad, bridgeId: "evil" }) };
    const eng = createHybridEngine({ auditInMemory: true, governance: OPTIN, photonic: { router: evil, kernelFor: bigKernel } });
    const r = await eng.infer({ prompt: "hi", correlationId: `pf-${bad}` });
    assert.deepEqual(r.bridgesUsed, ["stub-ternary"], `non-finite ${bad} must fall through to digital, not commit garbage`);
    await eng.shutdown();
  }
});

test("the photonic config does not affect the receipt shape consumers depend on", async () => {
  const eng = createHybridEngine({ auditInMemory: true, governance: OPTIN, photonic: { router: createPhotonicRouterPort(), kernelFor: bigKernel } });
  const r = await eng.infer({ prompt: "hi", correlationId: "p5" });
  for (const k of ["correlationId", "text", "tokenCount", "latencyMs", "plan", "outputHash", "enginesBlended", "avgBitsPerWeight", "deterministic", "trapFired", "bridgesUsed", "executedNatively", "ternaryChecksum", "valuesReproducible"]) {
    assert.ok(k in r, `receipt has ${k}`);
  }
  await eng.shutdown();
});

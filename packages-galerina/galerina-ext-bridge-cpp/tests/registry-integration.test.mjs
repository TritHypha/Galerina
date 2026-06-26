// registry-integration.test.mjs — the Brain→Brawn wiring across the package seam.
//
// Proves that the Tower's HybridInferenceEngine (the Brain, in @galerina/tower-citizen)
// dispatches ternary ops to THIS package's BitNet bridge (the Brawn) when handed a
// registry from createCppBridgeRegistry() — and that the result is bit-identical to
// the in-package simulator (the determinism oracle / Citizen Standard 1).

import { test } from "node:test";
import assert from "node:assert/strict";
import { createHybridEngine } from "@galerina/tower-citizen";
import { createCppBridgeRegistry } from "../dist/index.js";

const cid = (s) => `CPP-${s}-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;

test("createCppBridgeRegistry exposes the ternary bridge to the engine", () => {
  const reg = createCppBridgeRegistry();
  const ternary = reg.get("ternary");
  assert.ok(ternary, "registry must contain a ternary bridge");
  assert.equal(ternary.bridgeId, "bitnet-cpu"); // CPU path on a machine with no ready CUDA kernel
});

test("engine routes ternary ops through the cpp BitNet bridge (not the stub)", async () => {
  const eng = createHybridEngine({ airGapped: true, governanceTier: 1, bridges: createCppBridgeRegistry() });
  const r = await eng.infer({ prompt: "summarise", correlationId: cid("route") });
  assert.equal(r.trapFired, false);
  assert.ok(r.bridgesUsed.includes("bitnet-cpu"), "ternary must dispatch to the cpp bitnet-cpu bridge");
});

test("determinism oracle: cpp bridge result is bit-identical to the stub", async () => {
  // Same plan, two registries — the cpp bridge MUST agree with the in-package
  // simulator on the ternary checksum, or Citizen Standard 1 is violated.
  const viaStub = await createHybridEngine({ airGapped: true, governanceTier: 1 })
    .infer({ prompt: "x", correlationId: cid("oracle-stub") });
  const viaCpp = await createHybridEngine({ airGapped: true, governanceTier: 1, bridges: createCppBridgeRegistry() })
    .infer({ prompt: "y", correlationId: cid("oracle-cpp") });
  assert.equal(viaCpp.ternaryChecksum, viaStub.ternaryChecksum,
    "cpp bridge must match the simulator oracle (TPL Determinism)");
});

// brain-brawn.test.mjs — the Brain→Brawn seam + ai{} governance enforcement.
//
// Asserts that HybridInferenceEngine.infer() now ACTUALLY dispatches ops through
// a registered InferenceBridge (the Brawn) — not the old inline stub string — and
// that the ai{} contract constraints (approved_models, max_model_calls) are
// enforced at the boundary with traps, before any compute runs.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createHybridEngine, HybridInferenceEngine } from "../dist/index.js";

// Unique correlation IDs per run — the audit ledger is append-only/persistent.
const cid = (s) => `BB-${s}-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;

test("Brain→Brawn: ternary ops execute through a real bridge (not a stub string)", async () => {
  const eng = createHybridEngine({ airGapped: true, governanceTier: 1 });
  const r = await eng.infer({ prompt: "Summarise this document.", correlationId: cid("exec") });

  assert.equal(r.trapFired, false);
  // The ternary path ran through the registered bridge — provenance is recorded.
  assert.ok(r.bridgesUsed.includes("stub-ternary"), "ternary op must dispatch to the stub-ternary bridge");
  // No native silicon on a stock machine → honest reporting.
  assert.equal(r.executedNatively, false);
  // The simulator produced a real ternary accumulator, surfaced for the receipt.
  assert.equal(typeof r.ternaryChecksum, "number");
});

test("Citizen Standard 1: ternary checksum is deterministic across engine instances", async () => {
  const a = await createHybridEngine().infer({ prompt: "x", correlationId: cid("det-a") });
  const b = await createHybridEngine().infer({ prompt: "y", correlationId: cid("det-b") });
  // Same plan ⇒ bit-identical ternary result regardless of prompt or instance.
  assert.equal(a.ternaryChecksum, b.ternaryChecksum, "ternary path must be reproducible (TPL Determinism)");
});

test("ai{} governance: an unapproved model traps before compute", async () => {
  const eng = createHybridEngine({ governance: { approvedModels: ["bitnet_b1_58_2b"] } });
  const r = await eng.infer({ prompt: "x", correlationId: cid("model"), model: "gpt-untrusted" });
  assert.equal(r.trapFired, true);
  assert.equal(r.trapCode, "ERR_AI_MODEL_NOT_APPROVED");
  assert.equal(r.bridgesUsed.length, 0, "no bridge may run when the model is denied (Hold-First)");
});

test("ai{} governance: an approved model is permitted", async () => {
  const eng = createHybridEngine({ governance: { approvedModels: ["bitnet_b1_58_2b"] } });
  const r = await eng.infer({ prompt: "x", correlationId: cid("ok"), model: "bitnet_b1_58_2b" });
  assert.equal(r.trapFired, false);
  assert.ok(r.bridgesUsed.length > 0);
});

test("ai{} governance: max_model_calls budget traps the over-limit call", async () => {
  const eng = createHybridEngine({ governance: { maxModelCalls: 1 } });
  const first = await eng.infer({ prompt: "a", correlationId: cid("budget-1") });
  const second = await eng.infer({ prompt: "b", correlationId: cid("budget-2") });
  assert.equal(first.trapFired, false, "first call within budget");
  assert.equal(second.trapFired, true, "second call exceeds budget");
  assert.equal(second.trapCode, "ERR_AI_CALL_BUDGET");
});

test("the precision-decision audit trail records Brawn provenance", async () => {
  const eng = new HybridInferenceEngine({ airGapped: true, governanceTier: 1 });
  const corr = cid("audit");
  await eng.infer({ prompt: "trail", correlationId: corr });
  const decisions = eng.getAudit().query({ correlationId: corr })
    .filter((e) => e.details?.action === "precision_decision");
  assert.ok(decisions.length > 0, "must record per-op precision decisions");
  // At least one decision carries a bridgeId (ternary executed via the bridge).
  assert.ok(decisions.some((d) => typeof d.details.bridgeId === "string"));
});

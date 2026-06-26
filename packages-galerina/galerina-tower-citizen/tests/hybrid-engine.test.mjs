import { test } from "node:test";
import assert from "node:assert/strict";
import {
  routePrecision,
  planHybridInference,
  createHybridEngine,
  TECHNIQUE_SOURCE,
} from "../dist/index.js";

// ─────────────────────────────────────────────────────────────────────────────
// Precision routing — the "best of all three" technique selector
// ─────────────────────────────────────────────────────────────────────────────

test("air-gapped tolerant op routes to BitNet ternary", () => {
  const d = routePrecision("feedforward", {
    governanceTier: 1, airGapped: true, fp4HardwareAvailable: false,
  });
  assert.equal(d.precision, "ternary");
  assert.equal(d.sourceEngine, "microsoft/BitNet");
});

test("sensitivity-critical op forces fp16 regardless of tier", () => {
  const d = routePrecision("normalization", {
    governanceTier: 3, airGapped: false, fp4HardwareAvailable: true,
  });
  assert.equal(d.precision, "fp16");
});

test("bandwidth-bound op on Blackwell routes to NVFP4 block", () => {
  const d = routePrecision("kv_cache", {
    governanceTier: 3, airGapped: false, fp4HardwareAvailable: true,
  });
  assert.equal(d.precision, "fp4_block");
  assert.equal(d.sourceEngine, "NVIDIA/TransformerEngine");
});

test("latency bound forces Groq-style deterministic scheduling", () => {
  const d = routePrecision("attention", {
    governanceTier: 2, airGapped: false, fp4HardwareAvailable: false, maxLatencyMs: 100,
  });
  assert.equal(d.scheduling, "deterministic_static");
});

test("no latency bound uses dynamic scheduling", () => {
  const d = routePrecision("attention", {
    governanceTier: 2, airGapped: false, fp4HardwareAvailable: false,
  });
  assert.equal(d.scheduling, "dynamic");
});

// ─────────────────────────────────────────────────────────────────────────────
// Hybrid plan — blending multiple engines in one pass
// ─────────────────────────────────────────────────────────────────────────────

test("air-gapped plan blends BitNet ternary with fp16/fp8 — no cloud engines", () => {
  const plan = planHybridInference(
    ["embedding", "attention", "normalization", "feedforward", "output_head"],
    { governanceTier: 1, airGapped: true, fp4HardwareAvailable: false },
  );
  // Must NOT contain NVFP4 (cloud/GPU) when air-gapped
  assert.ok(!plan.enginesBlended.includes("NVIDIA/TransformerEngine"));
  assert.ok(plan.enginesBlended.includes("microsoft/BitNet"));
});

test("Blackwell plan blends all three sources in one pass", () => {
  const plan = planHybridInference(
    ["embedding", "attention", "normalization", "feedforward", "kv_cache", "output_head"],
    { governanceTier: 3, airGapped: false, fp4HardwareAvailable: true, maxLatencyMs: 200 },
  );
  // fp4_block (NVFP4) present for bandwidth ops, fp16 (native) for sensitive ops
  assert.ok(plan.enginesBlended.includes("NVIDIA/TransformerEngine"));
  // deterministic scheduling because a latency bound was declared
  assert.equal(plan.deterministic, true);
});

test("plan reports a blended average bits-per-weight", () => {
  const plan = planHybridInference(
    ["feedforward", "normalization"],  // ternary 1.58 + fp16 16
    { governanceTier: 1, airGapped: true, fp4HardwareAvailable: false },
  );
  assert.ok(plan.avgBitsPerWeight > 1.58 && plan.avgBitsPerWeight < 16);
});

// ─────────────────────────────────────────────────────────────────────────────
// Governed hybrid inference — full lifecycle with audit trail
// ─────────────────────────────────────────────────────────────────────────────

test("hybrid engine produces a governed receipt with audit trail", async () => {
  const engine = createHybridEngine({ airGapped: true, governanceTier: 1 });
  const receipt = await engine.infer({
    prompt: "test prompt",
    correlationId: "TEST-HYBRID-001",
    maxNewTokens: 50,
  });
  assert.equal(receipt.trapFired, false);
  assert.equal(receipt.correlationId, "TEST-HYBRID-001");
  assert.ok(receipt.enginesBlended.length >= 1);
  assert.ok(receipt.plan.decisions.length > 0);
});

test("hybrid engine audit trail records per-op precision decisions", async () => {
  const engine = createHybridEngine({ airGapped: true, governanceTier: 1 });
  await engine.infer({ prompt: "x", correlationId: "TEST-HYBRID-AUDIT", maxNewTokens: 10 });
  const audit = engine.getAudit();
  const lifecycle = audit.getLifecycle("TEST-HYBRID-AUDIT");
  assert.ok(lifecycle.complete, "LOAD→ERASE lifecycle must be complete");
  const decisions = audit.query({ correlationId: "TEST-HYBRID-AUDIT" })
    .filter(e => e.details?.action === "precision_decision");
  assert.ok(decisions.length > 0, "must record precision decisions in the audit trail");
});

test("latency invariant breach fires a governed trap", async () => {
  const engine = createHybridEngine({ airGapped: true, governanceTier: 1, maxLatencyMs: 0.0001 });
  const receipt = await engine.infer({ prompt: "x", correlationId: "TEST-HYBRID-LAT", maxNewTokens: 10 });
  // An impossibly tight latency bound should trip the invariant
  assert.equal(receipt.trapFired, true);
  assert.equal(receipt.trapCode, "ERR_LATENCY_INVARIANT");
});

test("technique provenance is correctly attributed", () => {
  assert.equal(TECHNIQUE_SOURCE.ternary.engine, "microsoft/BitNet");
  assert.equal(TECHNIQUE_SOURCE.ternary.license, "MIT");
  assert.equal(TECHNIQUE_SOURCE.fp4_block.engine, "NVIDIA/TransformerEngine");
  assert.equal(TECHNIQUE_SOURCE.fp4_block.license, "Apache-2.0");
});

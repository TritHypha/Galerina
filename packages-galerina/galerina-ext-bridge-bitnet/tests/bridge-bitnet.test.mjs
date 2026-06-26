/**
 * @galerina/ext-bridge-bitnet — Integration Tests
 *
 * Stage A: verifies governed lifecycle (stub inference).
 * Stage B: wire ggml_bitnet_mul_mat_task_compute() for real inference.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { BitNetBridge, createBitNetBridge } from "../dist/index.js";

const TEST_MODEL_PATH = "C:/wwwprojects/BitNet/models/bitnet_b1_58-2B-4T/ggml-model-i2_s.gguf";

// ---------------------------------------------------------------------------
// createBitNetBridge factory
// ---------------------------------------------------------------------------

describe("createBitNetBridge: factory and auto kernel selection", () => {
  it("creates bridge with auto kernel for current arch", () => {
    const bridge = createBitNetBridge(TEST_MODEL_PATH);
    const spec = bridge.getModelSpec();
    assert.ok(["tl1", "tl2"].includes(spec.kernelFamily));
    assert.equal(spec.nThreads, 4);
    assert.equal(spec.contextSize, 2048);
    assert.equal(bridge.isInitialized(), false);
  });

  it("respects explicit options", () => {
    const bridge = createBitNetBridge(TEST_MODEL_PATH, {
      nThreads: 8,
      kernelFamily: "ternary",
      maxTokens: 512,
      contextSize: 4096,
    });
    const spec = bridge.getModelSpec();
    assert.equal(spec.kernelFamily, "ternary");
    assert.equal(spec.nThreads, 8);
    assert.equal(spec.maxTokens, 512);
    assert.equal(spec.contextSize, 4096);
  });
});

// ---------------------------------------------------------------------------
// BitNetBridge lifecycle
// ---------------------------------------------------------------------------

describe("BitNetBridge: Load→Init→Infer→Shutdown lifecycle", () => {
  it("initialize() returns a correlationId and marks bridge as initialized", async () => {
    const bridge = createBitNetBridge(TEST_MODEL_PATH, { kernelFamily: "tl2" });
    const { correlationId } = await bridge.initialize();
    assert.match(correlationId, /^BITNET-INIT-\d+$/);
    assert.equal(bridge.isInitialized(), true);
    await bridge.shutdown();
    assert.equal(bridge.isInitialized(), false);
  });

  it("infer() returns a governed BitNetResponse with audit trail", async () => {
    const bridge = createBitNetBridge(TEST_MODEL_PATH, { kernelFamily: "tl2" });
    await bridge.initialize();

    const response = await bridge.infer({
      prompt: "What is 1+1?",
      correlationId: "TEST-INFER-001",
    });

    assert.equal(response.correlationId, "TEST-INFER-001");
    assert.equal(response.trapFired, false);
    assert.match(response.outputHash, /^sha256:/);
    assert.ok(typeof response.latencyMs === "number");
    assert.ok(["tl1", "tl2", "ternary"].includes(response.kernelUsed));
    assert.ok(response.text.length > 0);

    await bridge.shutdown();
  });

  it("infer() rejects if not initialized", async () => {
    const bridge = createBitNetBridge(TEST_MODEL_PATH);
    await assert.rejects(
      () => bridge.infer({ prompt: "test", correlationId: "UNINIT-001" }),
      /not initialized/
    );
  });

  it("infer() propagates correlationId through audit trail", async () => {
    const bridge = createBitNetBridge(TEST_MODEL_PATH, { kernelFamily: "tl2" });
    await bridge.initialize();

    const corrId = `AUDIT-TRAIL-${Date.now()}`;
    await bridge.infer({ prompt: "audit test", correlationId: corrId });

    const lc = bridge.getAudit().getLifecycle(corrId);
    assert.equal(lc.complete, true);
    assert.ok(lc.phases.includes("LOAD"));
    assert.ok(lc.phases.includes("EXEC"));
    assert.ok(lc.phases.includes("ERASE"));

    await bridge.shutdown();
  });

  it("getAudit() exposes the Tower audit log", async () => {
    const bridge = createBitNetBridge(TEST_MODEL_PATH, { kernelFamily: "tl2" });
    await bridge.initialize();
    const audit = bridge.getAudit();
    assert.ok(audit !== null && audit !== undefined);
    await bridge.shutdown();
  });
});

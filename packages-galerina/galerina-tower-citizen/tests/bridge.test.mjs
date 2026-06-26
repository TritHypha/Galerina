import { test } from "node:test";
import assert from "node:assert/strict";
import {
  StubTernaryBridge,
  StubFp4Bridge,
  createStubRegistry,
  assertDeterminism,
  TPLSimulator,
  GovernanceEnforcer,
  AuditLogger,
} from "../dist/index.js";

// Pack a trit array into BitNet-faithful i32 words (same layout the bridge decodes).
function packTrits(trits) {
  const words = new Int32Array(Math.ceil(trits.length / 16));
  for (let i = 0; i < trits.length; i++) {
    const enc = trits[i] === -1 ? 0 : trits[i] === 0 ? 1 : 2;
    const wordIdx = (i / 16) | 0;
    const local = i % 16;
    const byteIdx = (local / 4) | 0;
    const posInByte = local % 4;
    const shift = byteIdx * 8 + (3 - posInByte) * 2;
    words[wordIdx] = (words[wordIdx] & ~(0x03 << shift)) | (enc << shift);
  }
  return words;
}

// ── Stub ternary bridge — runs the real simulator, deterministic ──────────────

test("stub ternary bridge executes a faithful T-MAC via the simulator", () => {
  const bridge = new StubTernaryBridge();
  bridge.initialize();
  const weights = packTrits([1, -1, 0, 1]);          // +a -b +0 +d
  const acts = Int32Array.from([10, 20, 30, 40]);    // 10 -20 +0 +40 = 30
  const r = bridge.execute({
    opClass: "feedforward", precision: "ternary", correlationId: "BR-1",
    weights, activations: acts, count: 4, scale: 1,
  });
  assert.equal(r.value, 30);
  assert.equal(r.deterministic, true);
  assert.equal(r.executedNatively, false); // simulation, not native SIMD
});

test("stub ternary bridge matches a direct TPLSimulator result (cross-check)", () => {
  const weights = packTrits([1, 1, -1, 1]);
  const acts = Int32Array.from([3, 4, 5, 6]); // 3 +4 -5 +6 = 8
  const bridge = new StubTernaryBridge();
  const viaBridge = bridge.execute({
    opClass: "feedforward", precision: "ternary", correlationId: "BR-X",
    weights, activations: acts, count: 4, scale: 1,
  }).value;

  const sim = new TPLSimulator(new AuditLogger(), new GovernanceEnforcer(), 4);
  sim.loadWeights([1, 1, -1, 1]);
  const viaSim = sim.tmacVector(acts, 0, 4, "SIM-X");

  assert.equal(viaBridge, viaSim); // determinism: same answer both ways
});

test("stub ternary bridge reports deterministic=true (Standard 1)", () => {
  const bridge = new StubTernaryBridge();
  const r = bridge.execute({
    opClass: "feedforward", precision: "ternary", correlationId: "BR-2",
    weights: packTrits([1]), activations: Int32Array.from([7]), count: 1, scale: 1,
  });
  assert.doesNotThrow(() => assertDeterminism(r));
});

// ── Stub FP4 bridge — honest unexecuted result, no fake numbers ───────────────

test("stub fp4 bridge returns an honest unexecuted result", () => {
  const bridge = new StubFp4Bridge();
  const r = bridge.execute({
    opClass: "attention", precision: "fp4_block", correlationId: "BR-3",
    weights: 0, activations: Int32Array.from([1, 2, 3]), count: 3, scale: 1,
  });
  assert.equal(r.executedNatively, false); // caller must detect missing hardware
  assert.equal(r.value, 0);
  assert.equal(r.bridgeId, "stub-fp4");
});

// ── assertDeterminism — Standard 1 enforcement ────────────────────────────────

test("assertDeterminism throws if a ternary bridge claims non-determinism", () => {
  const badResult = {
    value: 1, executedNatively: true, bridgeId: "rogue-ternary",
    technique: "ternary", latencyMs: 1, deterministic: false,
  };
  assert.throws(() => assertDeterminism(badResult), /CITIZEN_STANDARD_VIOLATION/);
});

test("assertDeterminism allows fp4 non-determinism (not on the ternary path)", () => {
  const fp4Result = {
    value: 0, executedNatively: false, bridgeId: "stub-fp4",
    technique: "fp4_block", latencyMs: 0, deterministic: false,
  };
  assert.doesNotThrow(() => assertDeterminism(fp4Result));
});

// ── Registry ──────────────────────────────────────────────────────────────────

test("createStubRegistry maps ternary and fp4 to their stubs", () => {
  const reg = createStubRegistry();
  assert.equal(reg.get("ternary")?.bridgeId, "stub-ternary");
  assert.equal(reg.get("fp4_block")?.bridgeId, "stub-fp4");
  // Both report no native backend present
  assert.equal(reg.get("ternary")?.nativeAvailable, false);
  assert.equal(reg.get("fp4_block")?.nativeAvailable, false);
});

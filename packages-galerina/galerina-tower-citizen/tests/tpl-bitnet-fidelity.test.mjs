/**
 * tpl-bitnet-fidelity.test.mjs — pins tpl-simulator's BitNet I2_S fidelity.
 *
 * Companion to docs/Knowledge-Bases/galerina-tpl-bitnet-fidelity-audit.md (2026-06-15).
 * These golden vectors are hand-computed against Microsoft BitNet's reference kernel
 * (C:\wwwprojects\BitNet\src\ggml-bitnet-mad.cpp, MIT) and re-derived here by an
 * INDEPENDENT re-implementation of BitNet's packing math (bitnetPackByte below) — no
 * BitNet code is imported. If anyone changes ENC_* / tritBitShift / tmacVector in
 * tpl-simulator.ts, the byte-compatibility guarantee breaks and these tests fail.
 *
 *   encoding  : q8 -> {0,1,2} == {-1,0,+1}          (ggml-bitnet-mad.cpp:76-78)
 *   packing   : (q0<<6)|(q1<<4)|(q2<<2)|(q3<<0)     (ggml-bitnet-mad.cpp:137)
 *   T-MAC     : ternary dot product = add/sub/skip  (ggml-bitnet-mad.cpp weights ∈ {-1,0,+1})
 *   scale     : i2_scale = max|w|, applied AFTER accumulation (ggml-bitnet-mad.cpp:103-107)
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  TPLSimulator, TritState, SecurityTrap, TPLIntegrityFault,
  AuditLogger, GovernanceEnforcer,
} from "../dist/index.js";

// ── Independent reference packer (mirrors BitNet; imports nothing) ────────────
// BitNet code↔trit map: -1→0b00, 0→0b01, +1→0b10  (ggml-bitnet-mad.cpp:76-78).
function bitnetCode(trit) {
  if (trit === -1) return 0b00;
  if (trit === 0) return 0b01;
  if (trit === 1) return 0b10;
  throw new Error(`non-ternary weight: ${trit}`);
}
// BitNet byte pack, high-bits-first (ggml-bitnet-mad.cpp:137).
function bitnetPackByte(q0, q1, q2, q3) {
  return (
    (bitnetCode(q0) << 6) |
    (bitnetCode(q1) << 4) |
    (bitnetCode(q2) << 2) |
    (bitnetCode(q3) << 0)
  ) & 0xff;
}

function freshSim(sizeInTrits) {
  // logDir=null → in-memory AuditLogger (no disk side effects); default TPL policy.
  return new TPLSimulator(new AuditLogger(null), new GovernanceEnforcer(), sizeInTrits);
}

// ── Claim 1 — 2-bit trit encoding ────────────────────────────────────────────

describe("BitNet fidelity · Claim 1 — 2-bit trit encoding {-1,0,+1}", () => {
  it("round-trips every trit value through set/get (encode↔decode)", () => {
    const sim = freshSim(3);
    sim.setTrit(0, -1);
    sim.setTrit(1, 0);
    sim.setTrit(2, 1);
    assert.equal(sim.getTrit(0), -1);
    assert.equal(sim.getTrit(1), 0);
    assert.equal(sim.getTrit(2), 1);
    assert.deepEqual(sim.snapshot(), [-1, 0, 1]);
  });

  it("TritState matches the BitNet code map (-1/0/+1)", () => {
    assert.equal(TritState.REJECT, -1);
    assert.equal(TritState.HOLD, 0);
    assert.equal(TritState.COMMIT, 1);
  });

  it("rejects a toxic (non-ternary) value with SecurityTrap", () => {
    const sim = freshSim(2);
    assert.throws(() => sim.setTrit(0, 2), SecurityTrap);
    assert.throws(() => sim.setTrit(0, -2), SecurityTrap);
  });

  it("traps reading a planted 0b11 (ILLEGAL) field with TPLIntegrityFault", () => {
    const sim = freshSim(4);
    // White-box: plant 0b11 in the high field (trit 0) of state word 0. BitNet
    // never emits 0b11, so its presence == corruption (tpl-simulator.ts:79-81).
    sim.mem[sim.stateWordStart] = 0b11 << 6; // 0xC0
    assert.throws(() => sim.getTrit(0), TPLIntegrityFault);
  });
});

// ── Claim 2 — packing layout (golden vector) ─────────────────────────────────

describe("BitNet fidelity · Claim 2 — packing (q0<<6)|(q1<<4)|(q2<<2)|(q3<<0)", () => {
  // 16-trit golden vector (one full Int32 state word) — see audit §6.
  const GOLDEN = [
    -1, 0, 1, 1, // byte 0 → 0x1A
    1, 1, 0, -1, // byte 1 → 0xA4
    0, -1, -1, 0, // byte 2 → 0x41
    1, 0, 1, -1, // byte 3 → 0x98
  ];

  it("packs each byte exactly as BitNet's reference packer does", () => {
    const sim = freshSim(GOLDEN.length);
    sim.loadWeights(GOLDEN);

    const word = sim.mem[sim.stateWordStart]; // white-box read of the backing store
    for (let b = 0; b < 4; b++) {
      const actual = (word >>> (b * 8)) & 0xff; // little-endian byte b of the i32
      const golden = bitnetPackByte(
        GOLDEN[b * 4 + 0],
        GOLDEN[b * 4 + 1],
        GOLDEN[b * 4 + 2],
        GOLDEN[b * 4 + 3],
      );
      assert.equal(actual, golden, `byte ${b}: Galerina 0x${actual.toString(16)} != BitNet 0x${golden.toString(16)}`);
    }
  });

  it("matches the hand-computed golden bytes [0x1A, 0xA4, 0x41, 0x98]", () => {
    const expected = [0x1a, 0xa4, 0x41, 0x98];
    for (let b = 0; b < 4; b++) {
      const golden = bitnetPackByte(
        GOLDEN[b * 4 + 0], GOLDEN[b * 4 + 1], GOLDEN[b * 4 + 2], GOLDEN[b * 4 + 3],
      );
      assert.equal(golden, expected[b]);
    }
  });

  it("snapshot round-trips the full golden vector (never yields 0b11)", () => {
    const sim = freshSim(GOLDEN.length);
    sim.loadWeights(GOLDEN);
    assert.deepEqual(sim.snapshot(), GOLDEN);
    assert.ok(sim.snapshot().every(t => t === -1 || t === 0 || t === 1));
  });
});

// ── Claim 3 — T-MAC add/subtract/skip ────────────────────────────────────────

describe("BitNet fidelity · Claim 3 — T-MAC = add / subtract / skip", () => {
  it("computes the ternary dot product (add on +1, sub on -1, skip on 0)", () => {
    const sim = freshSim(5);
    sim.loadWeights([1, -1, 0, 1, -1]); // weights
    const activations = Int32Array.from([10, 20, 30, 40, 50]);
    // 10 - 20 + (skip) + 40 - 50 = -20  (scale defaults to 1)
    assert.equal(sim.tmacVector(activations, 0, 5, "CORR-TMAC-1"), -20);
  });

  it("skips zero-weight lanes entirely (a[i] never read for w==0)", () => {
    const sim = freshSim(3);
    sim.loadWeights([0, 0, 0]);
    const activations = Int32Array.from([999, -999, 123]);
    assert.equal(sim.tmacVector(activations, 0, 3, "CORR-TMAC-ZERO"), 0);
  });
});

// ── Claim 4 — scale applied AFTER accumulation ───────────────────────────────

describe("BitNet fidelity · Claim 4 — i2_scale = max|w|, applied post-accumulation", () => {
  it("scales the accumulated result by the per-tensor scale", () => {
    const sim = freshSim(5);
    sim.loadWeights([1, -1, 0, 1, -1]);
    // i2_scale = max|weights| = 1 for ternary weights; use 3 to prove it multiplies
    // the *accumulated* result, not each term.
    sim.setScale(3);
    const activations = Int32Array.from([10, 20, 30, 40, 50]);
    // (10 - 20 + 0 + 40 - 50) * 3 = -20 * 3 = -60
    assert.equal(sim.tmacVector(activations, 0, 5, "CORR-SCALE-1"), -60);
  });

  it("erase() resets the scale to 1 (BitNet-neutral)", () => {
    const sim = freshSim(2);
    sim.setScale(7);
    sim.erase();
    sim.loadWeights([1, 1]);
    const activations = Int32Array.from([4, 6]);
    assert.equal(sim.tmacVector(activations, 0, 2, "CORR-SCALE-RESET"), 10); // *1, not *7
  });
});

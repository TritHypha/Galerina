// digital-ecc — extended Hamming(8,4) SEC-DED for the post-ADC readout, EXHAUSTIVELY verified.
// The fail-closed guarantee: corrects every single-bit error, and DETECTS every double-bit error as
// `uncorrectable` — it never returns a silently-miscorrected value at distance 2 (that would be the
// fail-open this codec exists to prevent). Degrade-only; never for crypto/verdict.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  eccEncodeNibble, eccDecodeNibble, eccEncode, eccDecode,
} from "../dist/digital-ecc.js";

test("clean round-trip for every nibble (no error → ok, data preserved)", () => {
  for (let d = 0; d < 16; d++) {
    const r = eccDecodeNibble(eccEncodeNibble(d));
    assert.equal(r.kind, "ok");
    assert.equal(r.data, d);
  }
});

test("EXHAUSTIVE: every single-bit error is CORRECTED back to the original nibble", () => {
  for (let d = 0; d < 16; d++) {
    const cw = eccEncodeNibble(d);
    for (let b = 0; b < 8; b++) {
      const r = eccDecodeNibble(cw ^ (1 << b));
      assert.equal(r.kind, "corrected", `nibble ${d}, flipped bit ${b}`);
      assert.equal(r.data, d, `nibble ${d}, flipped bit ${b} must recover ${d}`);
    }
  }
});

test("EXHAUSTIVE: every double-bit error is DETECTED as uncorrectable (never miscorrected)", () => {
  let checked = 0;
  for (let d = 0; d < 16; d++) {
    const cw = eccEncodeNibble(d);
    for (let a = 0; a < 8; a++) {
      for (let b = a + 1; b < 8; b++) {
        const r = eccDecodeNibble(cw ^ (1 << a) ^ (1 << b));
        assert.equal(r.kind, "uncorrectable", `nibble ${d}, bits ${a}+${b} must be uncorrectable (fail-closed)`);
        checked++;
      }
    }
  }
  assert.equal(checked, 16 * 28, "covered all 16 nibbles × C(8,2) double-error patterns");
});

test("out-of-range codeword input fails closed (uncorrectable)", () => {
  assert.equal(eccDecodeNibble(-1).kind, "uncorrectable");
  assert.equal(eccDecodeNibble(256).kind, "uncorrectable");
  assert.equal(eccDecodeNibble(1.5).kind, "uncorrectable");
});

test("eccEncodeNibble rejects non-nibble input", () => {
  assert.throws(() => eccEncodeNibble(16), RangeError);
  assert.throws(() => eccEncodeNibble(-1), RangeError);
});

// ── byte-stream wrapper ──
test("byte-stream clean round-trip preserves data (0 corrections)", () => {
  const data = new Uint8Array([0x00, 0x42, 0xff, 0xa5, 0x10]);
  const r = eccDecode(eccEncode(data));
  assert.equal(r.kind, "ok");
  assert.deepEqual([...r.data], [...data]);
  assert.equal(r.corrections, 0);
});

test("a single-bit error per codeword across the stream is corrected (counted)", () => {
  const data = new Uint8Array([0x3c, 0x81]);
  const cw = eccEncode(data); // 4 codeword bytes
  cw[0] ^= 1 << 2;            // flip a bit in codeword 0
  cw[3] ^= 1 << 7;            // and one in codeword 3
  const r = eccDecode(cw);
  assert.equal(r.kind, "ok");
  assert.deepEqual([...r.data], [...data]);
  assert.equal(r.corrections, 2);
});

test("a double-bit error in one codeword aborts the block fail-closed at that index", () => {
  const data = new Uint8Array([0x3c, 0x81]);
  const cw = eccEncode(data);
  cw[2] ^= (1 << 1) | (1 << 4); // two flips in codeword index 2
  const r = eccDecode(cw);
  assert.equal(r.kind, "uncorrectable");
  assert.equal(r.at, 2);
});

test("odd-length codeword stream fails closed", () => {
  assert.equal(eccDecode(new Uint8Array([0x00, 0x00, 0x00])).kind, "uncorrectable");
});

import test from "node:test";
import assert from "node:assert/strict";

import {
  buildManifest,
  IntegrityMonitor,
  ZeroCopyMapper,
  HardenedBorderViolation,
  SecurityTrap,
} from "../dist/index.js";

// Build a source buffer + manifest from two blocks. Block "nums" holds four
// little-endian int32s so we can check i32() views.
function makeFixture() {
  const nums = new Uint8Array(16);
  const dv = new DataView(nums.buffer);
  dv.setInt32(0, 10, true);
  dv.setInt32(4, 20, true);
  dv.setInt32(8, 30, true);
  dv.setInt32(12, 40, true);

  const tag = new TextEncoder().encode("TAGTAGTA"); // 8 bytes

  const manifest = buildManifest("fix", [
    { id: "nums", bytes: nums },
    { id: "tag", bytes: tag },
  ]);

  // Reassemble the contiguous source the manifest describes.
  const source = new Uint8Array(manifest.totalBytes);
  source.set(nums, 0);
  source.set(tag, 16);

  return { manifest, source };
}

test("map() returns blocks whose i32()/view() reflect the source bytes", () => {
  const { manifest, source } = makeFixture();
  const mon = new IntegrityMonitor();
  const mapper = new ZeroCopyMapper();
  const blocks = mapper.map(manifest, source, mon);

  assert.equal(blocks.length, 2);
  const nums = blocks.find((b) => b.id === "nums");
  const i = nums.i32();
  assert.equal(i.length, 4);
  assert.deepEqual([...i], [10, 20, 30, 40]);

  const tag = blocks.find((b) => b.id === "tag");
  assert.equal(new TextDecoder().decode(tag.view()), "TAGTAGTA");
});

test("mutating the source AFTER map() does NOT change the mapped view (staged once)", () => {
  const { manifest, source } = makeFixture();
  const mon = new IntegrityMonitor();
  const mapper = new ZeroCopyMapper();
  const blocks = mapper.map(manifest, source, mon);
  const nums = blocks.find((b) => b.id === "nums");

  // Capture the mapped value, then mutate the original source.
  assert.equal(nums.i32()[0], 10);
  new DataView(source.buffer).setInt32(0, 999, true);

  // The mapped view is unaffected — data was staged into the backing buffer.
  assert.equal(nums.i32()[0], 10);
});

test("two calls to view() return views over the SAME backing buffer (zero-copy access)", () => {
  const { manifest, source } = makeFixture();
  const mon = new IntegrityMonitor();
  const mapper = new ZeroCopyMapper();
  const blocks = mapper.map(manifest, source, mon);
  const tag = blocks.find((b) => b.id === "tag");

  const v1 = tag.view();
  const v2 = tag.view();
  assert.equal(v1.buffer, v2.buffer);
  assert.equal(v1.buffer, mapper.buffer);
});

test("shared:true uses a SharedArrayBuffer backing buffer", () => {
  const { manifest, source } = makeFixture();
  const mon = new IntegrityMonitor();
  const mapper = new ZeroCopyMapper({ shared: true });
  mapper.map(manifest, source, mon);
  assert.ok(mapper.buffer instanceof SharedArrayBuffer);
});

test("a TAMPERED source makes map() throw HardenedBorderViolation", () => {
  const { manifest, source } = makeFixture();
  const mon = new IntegrityMonitor();
  const mapper = new ZeroCopyMapper();

  // Flip a byte in the first block so its hash no longer matches the manifest.
  source[0] = source[0] ^ 0xff;

  assert.throws(
    () => mapper.map(manifest, source, mon),
    (e) =>
      e instanceof HardenedBorderViolation && e.code === "LSIO-INTEGRITY-001",
  );
});

test("source shorter than totalBytes throws LSIO-MAP-001", () => {
  const { manifest } = makeFixture();
  const mon = new IntegrityMonitor();
  const mapper = new ZeroCopyMapper();
  const tooSmall = new Uint8Array(manifest.totalBytes - 1);
  assert.throws(
    () => mapper.map(manifest, tooSmall, mon),
    (e) => e instanceof SecurityTrap && e.code === "LSIO-MAP-001",
  );
});

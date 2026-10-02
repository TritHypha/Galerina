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

test("source SharedArrayBuffer is refused (LSIO-MAP-002)", () => {
  const { manifest } = makeFixture();
  const sab = new SharedArrayBuffer(manifest.totalBytes);
  const source = new Uint8Array(sab);
  const mon = new IntegrityMonitor();
  const mapper = new ZeroCopyMapper();
  assert.throws(
    () => mapper.map(manifest, source, mon),
    (err) => err instanceof SecurityTrap && err.code === "LSIO-MAP-002",
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

test("hostile: mutating source during enforceBlock cannot change staged bytes", () => {
  const { manifest, source } = makeFixture();
  const mon = new IntegrityMonitor();
  const orig = mon.enforceBlock.bind(mon);
  mon.enforceBlock = (bytes, expectedHex, blockId) => {
    orig(bytes, expectedHex, blockId);
    source[0] = 0xff;
  };
  const mapper = new ZeroCopyMapper();
  const blocks = mapper.map(manifest, source, mon);
  const nums = blocks.find((b) => b.id === "nums");
  assert.equal(nums.i32()[0], 10);
  assert.equal(source[0], 0xff);
});

test("map() wipes its private source snapshot after successful staging", () => {
  const { manifest, source } = makeFixture();
  const mon = new IntegrityMonitor();
  const enforceBlock = mon.enforceBlock.bind(mon);
  const observedSnapshots = [];
  mon.enforceBlock = (bytes, expectedHex, blockId) => {
    observedSnapshots.push(bytes);
    enforceBlock(bytes, expectedHex, blockId);
  };

  const mapper = new ZeroCopyMapper();
  const blocks = mapper.map(manifest, source, mon);

  assert.equal(blocks.length, 2);
  assert.equal(observedSnapshots.length, 2);
  assert.ok(observedSnapshots.every((view) => [...view].every((byte) => byte === 0)));
  assert.equal(new TextDecoder().decode(blocks.find((block) => block.id === "tag").view()), "TAGTAGTA");
});

test("map() wipes its private source snapshot when integrity verification refuses", () => {
  const { manifest, source } = makeFixture();
  source[16] ^= 0xff; // Let the first block pass, then fail on the second.
  const mon = new IntegrityMonitor();
  const enforceBlock = mon.enforceBlock.bind(mon);
  const observedSnapshots = [];
  mon.enforceBlock = (bytes, expectedHex, blockId) => {
    observedSnapshots.push(bytes);
    enforceBlock(bytes, expectedHex, blockId);
  };

  const mapper = new ZeroCopyMapper();
  assert.throws(
    () => mapper.map(manifest, source, mon),
    (error) => error instanceof HardenedBorderViolation && error.code === "LSIO-INTEGRITY-001",
  );

  assert.equal(observedSnapshots.length, 2);
  assert.ok(observedSnapshots.every((view) => [...view].every((byte) => byte === 0)));
});

test("a successful remap wipes the previous backing and invalidates its block handles", () => {
  const { manifest, source } = makeFixture();
  const mon = new IntegrityMonitor();
  const mapper = new ZeroCopyMapper();
  const firstBlocks = mapper.map(manifest, source, mon);
  const previousBuffer = mapper.buffer;
  assert.notEqual(new Uint8Array(previousBuffer).every((byte) => byte === 0), true);

  const secondBlocks = mapper.map(manifest, source, mon);

  assert.ok([...new Uint8Array(previousBuffer)].every((byte) => byte === 0));
  assert.throws(() => firstBlocks[0].view(), /expired/i);
  assert.equal(secondBlocks[0].view().buffer, mapper.buffer);
  assert.equal(mapper.status, "ACTIVE");
});

test("dispose() wipes the active backing and refuses stale or future mappings", () => {
  const { manifest, source } = makeFixture();
  const mon = new IntegrityMonitor();
  const mapper = new ZeroCopyMapper({ shared: true });
  const blocks = mapper.map(manifest, source, mon);
  const previousBuffer = mapper.buffer;

  mapper.dispose();

  assert.ok([...new Uint8Array(previousBuffer)].every((byte) => byte === 0));
  assert.equal(mapper.status, "DISPOSED");
  assert.throws(() => blocks[0].view(), /expired/i);
  assert.throws(() => mapper.map(manifest, source, mon), /disposed/i);
});

test("dispose() reports a cleanup failure instead of claiming a zeroed mapping", () => {
  const { manifest, source } = makeFixture();
  const mapper = new ZeroCopyMapper();
  mapper.map(manifest, source, new IntegrityMonitor());
  const backing = mapper.buffer;
  structuredClone(backing, { transfer: [backing] });

  assert.throws(() => mapper.dispose(), /cleanup.*failed/i);
  assert.equal(mapper.status, "CLEANUP_FAILED");
  assert.throws(() => mapper.map(manifest, source, new IntegrityMonitor()), /cleanup.*failed/i);
});

test("map() wipes its private source snapshot when candidate backing allocation fails", () => {
  const { manifest, source } = makeFixture();
  const mapper = new ZeroCopyMapper();
  const NativeArrayBuffer = globalThis.ArrayBuffer;
  const NativeUint8Array = globalThis.Uint8Array;
  let observedSnapshot;

  globalThis.Uint8Array = new Proxy(NativeUint8Array, {
    construct(target, args, newTarget) {
      const view = Reflect.construct(target, args, newTarget);
      if (args[0] === source.byteLength) observedSnapshot = view;
      return view;
    },
  });
  globalThis.ArrayBuffer = new Proxy(NativeArrayBuffer, {
    construct(target, args, newTarget) {
      if (args[0] === manifest.totalBytes) {
        throw new RangeError("synthetic candidate backing allocation failure");
      }
      return Reflect.construct(target, args, newTarget);
    },
  });

  try {
    assert.throws(
      () => mapper.map(manifest, source, new IntegrityMonitor()),
      /synthetic candidate backing allocation failure/,
    );
    assert.ok(observedSnapshot, "the source snapshot must have been allocated");
    assert.ok([...observedSnapshot].every((byte) => byte === 0));
  } finally {
    globalThis.ArrayBuffer = NativeArrayBuffer;
    globalThis.Uint8Array = NativeUint8Array;
  }
});

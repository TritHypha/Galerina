import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import {
  buildManifest,
  ManifestLoader,
  SecurityTrap,
} from "../dist/index.js";

const enc = (s) => new TextEncoder().encode(s);

test("buildManifest produces a valid, contiguous manifest with correct sha256", () => {
  const a = enc("hello");
  const b = enc("world!!");
  const m = buildManifest("unit-source", [
    { id: "a", bytes: a },
    { id: "b", bytes: b },
  ]);

  assert.equal(m.source, "unit-source");
  assert.equal(m.version, "1.1");
  assert.equal(m.totalBytes, a.length + b.length);
  assert.equal(m.blocks.length, 2);

  // Offsets are contiguous.
  assert.equal(m.blocks[0].offset, 0);
  assert.equal(m.blocks[0].length, a.length);
  assert.equal(m.blocks[1].offset, a.length);
  assert.equal(m.blocks[1].length, b.length);

  // Cross-check the sha256 by re-hashing.
  const expectedA = createHash("sha256").update(a).digest("hex");
  const expectedB = createHash("sha256").update(b).digest("hex");
  assert.equal(m.blocks[0].sha256, expectedA);
  assert.equal(m.blocks[1].sha256, expectedB);
});

test("ManifestLoader.parse round-trips a built manifest", () => {
  const m = buildManifest("rt", [{ id: "x", bytes: enc("abcdef") }]);
  const json = JSON.stringify(m);
  const parsed = ManifestLoader.parse(json);
  assert.deepEqual(parsed, m);
});

test("ManifestLoader.fromObject round-trips", () => {
  const m = buildManifest("rt2", [{ id: "x", bytes: enc("zz") }]);
  const parsed = ManifestLoader.fromObject(JSON.parse(JSON.stringify(m)));
  assert.deepEqual(parsed, m);
});

test("malformed: blocks not an array throws LSIO-MANIFEST-001", () => {
  const bad = { version: "1.1", source: "s", totalBytes: 0, blocks: {} };
  assert.throws(
    () => ManifestLoader.fromObject(bad),
    (e) => e instanceof SecurityTrap && e.code === "LSIO-MANIFEST-001",
  );
});

test("malformed: negative offset throws LSIO-MANIFEST-001", () => {
  const bad = {
    version: "1.1",
    source: "s",
    totalBytes: 10,
    blocks: [{ id: "a", offset: -1, length: 4, sha256: "ab" }],
  };
  assert.throws(
    () => ManifestLoader.fromObject(bad),
    (e) => e instanceof SecurityTrap && e.code === "LSIO-MANIFEST-001",
  );
});

test("malformed: block beyond totalBytes throws LSIO-MANIFEST-001", () => {
  const bad = {
    version: "1.1",
    source: "s",
    totalBytes: 4,
    blocks: [{ id: "a", offset: 2, length: 8, sha256: "ab" }],
  };
  assert.throws(
    () => ManifestLoader.fromObject(bad),
    (e) => e instanceof SecurityTrap && e.code === "LSIO-MANIFEST-001",
  );
});

test("malformed: overlapping blocks throw LSIO-MANIFEST-001", () => {
  const bad = {
    version: "1.1",
    source: "s",
    totalBytes: 16,
    blocks: [
      { id: "a", offset: 0, length: 8, sha256: "ab" },
      { id: "b", offset: 4, length: 8, sha256: "cd" },
    ],
  };
  assert.throws(
    () => ManifestLoader.fromObject(bad),
    (e) => e instanceof SecurityTrap && e.code === "LSIO-MANIFEST-001",
  );
});

test("malformed: missing fields throw LSIO-MANIFEST-001", () => {
  assert.throws(
    () => ManifestLoader.fromObject({ source: "s", totalBytes: 0, blocks: [] }),
    (e) => e instanceof SecurityTrap && e.code === "LSIO-MANIFEST-001",
  );
  assert.throws(
    () => ManifestLoader.parse("not json {"),
    (e) => e instanceof SecurityTrap && e.code === "LSIO-MANIFEST-001",
  );
});

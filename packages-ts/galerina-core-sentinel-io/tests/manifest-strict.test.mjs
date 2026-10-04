// manifest-strict.test.mjs — zero-trust default, owner may revisit: the io-manifest gate admits only an
// exact, gap-free, unambiguous layout.
//
// ManifestLoader accepted any-length hex digests ("ab"), unsafe integers (offsets past 2^53 lose
// precision in offset+length), duplicate block ids (consumers keyed by id see the wrong block), and
// gaps — both between blocks and after the last one — despite documenting the layout as contiguous.
// All are now LSIO-MANIFEST-001 (reused). buildManifest output is unchanged and still admitted.
import test from "node:test";
import assert from "node:assert/strict";
import { buildManifest, ManifestLoader, SecurityTrap } from "../dist/index.js";

const H = (c) => c.repeat(64);
const refused = (m) =>
  assert.throws(() => ManifestLoader.fromObject(m), (e) => e instanceof SecurityTrap && e.code === "LSIO-MANIFEST-001");
const base = (blocks, totalBytes) => ({ version: "1.1", source: "s", totalBytes, blocks });

test("a sha256 that is not exactly 64 lowercase hex chars is refused", () => {
  for (const sha of ["ab", H("a").slice(0, 63), H("a") + "a", H("A"), "g" + H("a").slice(1)]) {
    refused(base([{ id: "a", offset: 0, length: 4, sha256: sha }], 4));
  }
});

test("unsafe-integer offsets, lengths and totalBytes are refused", () => {
  const big = 2 ** 53;
  refused(base([{ id: "a", offset: 0, length: big, sha256: H("a") }], big));
  refused(base([], big));
  refused(base([{ id: "a", offset: big, length: 0, sha256: H("a") }], big));
});

test("duplicate block ids are refused", () => {
  refused(base([
    { id: "a", offset: 0, length: 4, sha256: H("a") },
    { id: "a", offset: 4, length: 4, sha256: H("b") },
  ], 8));
});

test("a gap between blocks is refused", () => {
  refused(base([
    { id: "a", offset: 0, length: 4, sha256: H("a") },
    { id: "b", offset: 6, length: 2, sha256: H("b") },
  ], 8));
});

test("a leading gap is refused", () => {
  refused(base([{ id: "a", offset: 2, length: 2, sha256: H("a") }], 4));
});

test("trailing bytes not covered by any block are refused", () => {
  refused(base([{ id: "a", offset: 0, length: 4, sha256: H("a") }], 8));
  refused(base([], 8));
});

test("control: exact contiguous layouts are admitted (including empty and zero-length blocks)", () => {
  const enc = (s) => new TextEncoder().encode(s);
  const m = buildManifest("ok", [{ id: "a", bytes: enc("hello") }, { id: "z", bytes: new Uint8Array(0) }, { id: "b", bytes: enc("world") }]);
  assert.deepEqual(ManifestLoader.fromObject(JSON.parse(JSON.stringify(m))), m);
  assert.deepEqual(ManifestLoader.fromObject(base([], 0)).blocks, []);
});

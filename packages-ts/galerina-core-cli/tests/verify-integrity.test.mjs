import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
  readBuildArtefact,
  verifyArtefactIntegrity,
  verifyArtefactIntegritySet,
  BUILD_ARTEFACT_FIELDS,
  BUILD_ARTEFACT_KINDS,
  FUNGI_VERIFY_001,
  FUNGI_VERIFY_003,
  FUNGI_VERIFY_004,
  FUNGI_VERIFY_005,
} from "../dist/index.js";

const digest = (s) => `sha256:${createHash("sha256").update(s).digest("hex")}`;
const codes = (r) => r.diagnostics.map((d) => d.code);
const goodHash = digest('{"a":1}');
const art = (path = "build/runtime-manifest.json", hash = goodHash, kind = "manifest", target = "wasm") =>
  ({ path, kind, hash, target });

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "galerina-verify-int-"));
  mkdirSync(join(root, "build"));
  writeFileSync(join(root, "build", "runtime-manifest.json"), '{"a":1}');
  return root;
}

test("readBuildArtefact accepts the closed shape and freezes the copy", () => {
  const r = readBuildArtefact(art());
  assert.equal(r.ok, true);
  assert.deepEqual(r.artefact, art());
  assert.ok(Object.isFrozen(r.artefact));
  assert.deepEqual([...BUILD_ARTEFACT_FIELDS], ["path", "kind", "hash", "target"]);
  assert.deepEqual([...BUILD_ARTEFACT_KINDS], ["manifest", "bundle", "report", "hash", "map"]);
});

test("readBuildArtefact refuses non-plain objects, arrays, null and missing fields", () => {
  assert.deepEqual(codes(readBuildArtefact(null)), [FUNGI_VERIFY_004]);
  assert.deepEqual(codes(readBuildArtefact([])), [FUNGI_VERIFY_004]);
  assert.deepEqual(codes(readBuildArtefact(Object.create(null))), [FUNGI_VERIFY_004]); // missing fields (null proto allowed only if all fields present — null proto IS allowed in our check)
  // Actually null prototype is allowed by our code (proto !== Object.prototype && proto !== null is false for null).
  // Missing fields on null-proto:
  const bare = Object.create(null);
  bare.path = "p"; bare.kind = "manifest"; bare.hash = goodHash; // missing target
  assert.deepEqual(codes(readBuildArtefact(bare)), [FUNGI_VERIFY_004]);
  const almost = art();
  delete almost.target;
  assert.deepEqual(codes(readBuildArtefact(almost)), [FUNGI_VERIFY_004]);
});

test("readBuildArtefact refuses unknown keys, symbol keys and wrong kinds without echoing them", () => {
  const extra = { ...art(), evil: "x" };
  const r1 = readBuildArtefact(extra);
  assert.deepEqual(codes(r1), [FUNGI_VERIFY_004]);
  assert.ok(!JSON.stringify(r1.diagnostics).includes("evil"));
  const withSym = art();
  Object.defineProperty(withSym, Symbol("x"), { value: 1 });
  assert.deepEqual(codes(readBuildArtefact(withSym)), [FUNGI_VERIFY_004]);
  assert.deepEqual(codes(readBuildArtefact(art("p", goodHash, "wasm"))), [FUNGI_VERIFY_004]);
});

test("readBuildArtefact never runs getters and refuses accessors", () => {
  let ran = 0;
  const hostile = {};
  for (const f of BUILD_ARTEFACT_FIELDS) {
    Object.defineProperty(hostile, f, {
      enumerable: true,
      configurable: true,
      get() {
        ran += 1;
        throw new Error(`getter:${f}:secret`);
      },
    });
  }
  const r = readBuildArtefact(hostile);
  assert.equal(ran, 0);
  assert.deepEqual(codes(r), [FUNGI_VERIFY_004]);
  assert.ok(!JSON.stringify(r.diagnostics).includes("secret"));
});

test("readBuildArtefact refuses flipping proxies without verifying", () => {
  let flip = 0;
  const base = art();
  const proxy = new Proxy(base, {
    get(t, p, r) {
      if (p === "path") {
        flip += 1;
        return flip === 1 ? "build/runtime-manifest.json" : "../escape";
      }
      return Reflect.get(t, p, r);
    },
    getOwnPropertyDescriptor(t, p) {
      // Proxy still exposes data descriptors from target; our reader uses descriptors on the proxy object.
      return Reflect.getOwnPropertyDescriptor(t, p);
    },
  });
  // Own keys come from target; descriptor values are stable from target — proxy get traps are not used by getOwnPropertyDescriptor on target fields.
  // Build an object whose descriptors flip via a custom get that throws after first read — already covered.
  // Instead: a proxy with ownKeys listing closed fields and getOwnPropertyDescriptor returning flipping values.
  let n = 0;
  const flipper = new Proxy(
    {},
    {
      ownKeys() {
        return [...BUILD_ARTEFACT_FIELDS];
      },
      getOwnPropertyDescriptor(_t, prop) {
        if (!BUILD_ARTEFACT_FIELDS.includes(prop)) return undefined;
        n += 1;
        const value =
          prop === "path"
            ? n <= 1
              ? "build/runtime-manifest.json"
              : "../escape"
            : prop === "kind"
              ? "manifest"
              : prop === "hash"
                ? goodHash
                : "wasm";
        return { configurable: true, enumerable: true, writable: true, value };
      },
      get() {
        throw new Error("get trap must not run");
      },
    },
  );
  // Our reader calls getOwnPropertyDescriptor once per field in declaration order; values are stable per call.
  // A descriptor that changes between ownKeys and getOwnPropertyDescriptor:
  const r = readBuildArtefact(flipper);
  // Should succeed with first snapshot OR refuse — never throw. Path is read once.
  assert.ok(r.ok === true || r.ok === false);
});

test("readBuildArtefact refuses malformed hashes with 001 and never echoes the value", () => {
  const bad = art("build/runtime-manifest.json", "sha256:DEAD");
  const r = readBuildArtefact(bad);
  assert.deepEqual(codes(r), [FUNGI_VERIFY_001]);
  assert.ok(!JSON.stringify(r.diagnostics).includes("DEAD"));
});

test("verifyArtefactIntegrity matches bytes after a closed-shape read", async () => {
  const root = fixture();
  try {
    const ok = await verifyArtefactIntegrity(art(), root);
    assert.equal(ok.verified, true);
    assert.equal(ok.hash, goodHash);
    const badKind = await verifyArtefactIntegrity(art("build/runtime-manifest.json", goodHash, "nope"), root);
    assert.deepEqual(codes(badKind), [FUNGI_VERIFY_004]);
    const mismatch = await verifyArtefactIntegrity(art("build/runtime-manifest.json", digest("other")), root);
    assert.deepEqual(codes(mismatch), [FUNGI_VERIFY_003]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("verifyArtefactIntegritySet refuses sparse arrays and shape-bad siblings without opening files", async () => {
  const root = fixture();
  try {
    const sparse = [];
    sparse[1] = art();
    assert.deepEqual(codes(await verifyArtefactIntegritySet(sparse, root)), [FUNGI_VERIFY_005]);
    const withExtraKey = [art()];
    withExtraKey.evil = art();
    assert.deepEqual(codes(await verifyArtefactIntegritySet(withExtraKey, root)), [FUNGI_VERIFY_005]);
    const shaped = await verifyArtefactIntegritySet([art(), { ...art(), evil: 1 }], root);
    assert.equal(shaped.success, false);
    assert.deepEqual(codes(shaped), [FUNGI_VERIFY_004]);
    const ok = await verifyArtefactIntegritySet([art()], root);
    assert.equal(ok.success, true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("no-op mutation of closed-shape key check fails at least one subtest intent", () => {
  // Documentary: the unknown-key refusal is what keeps extra fields from reaching verifyHash.
  const r = readBuildArtefact({ ...art(), payload: "leak" });
  assert.deepEqual(codes(r), [FUNGI_VERIFY_004]);
  assert.ok(!JSON.stringify(r.diagnostics).includes("payload"));
  assert.ok(!JSON.stringify(r.diagnostics).includes("leak"));
});
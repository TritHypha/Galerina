import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import * as R from "../dist/index.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const AUTHORITY = join(HERE, "..", "native", "vok-authority", "src");
const codes = (v) => v.diagnostics.map((d) => d.code).sort();

describe("opaque VM/component-resource transfer", () => {
  it("admits a closed kind with no pointer, path or machine bytes", () => {
    assert.equal(
      R.admitVmResourceTransfer({ kind: "function" }).allowed,
      true,
    );
    assert.ok(Object.isFrozen(R.VM_RESOURCE_KINDS));
    assert.equal(R.MAX_RESOURCES_PER_LEASE, 16);
  });
  it("refuses unknown kinds, pointers, paths, machine bytes and over-budget counts", () => {
    assert.deepEqual(
      codes(R.admitVmResourceTransfer({
        kind: "pointer",
        pointer: 1,
        path: "/tmp/x",
        machineBytes: new Uint8Array(4),
        count: 17,
      })),
      [
        "Galerina_RUNTIME_RESOURCE_BUDGET",
        "Galerina_RUNTIME_RESOURCE_KIND",
        "Galerina_RUNTIME_RESOURCE_NOT_CODE",
        "Galerina_RUNTIME_RESOURCE_PATH",
        "Galerina_RUNTIME_RESOURCE_POINTER",
      ],
    );
  });
  it("returns a refusal when hostile request accessors or proxies throw", () => {
    const getter = Object.defineProperty({}, "kind", { get() { throw new Error("hostile getter"); } });
    const proxy = new Proxy({}, { get() { throw new Error("hostile proxy"); } });
    for (const request of [getter, proxy]) {
      const result = R.admitVmResourceTransfer(request);
      assert.equal(result.allowed, false);
      assert.deepEqual(codes(result), ["Galerina_RUNTIME_ADMISSION_INPUT"]);
    }

    const originalPush = Array.prototype.push;
    const tamperingGetter = Object.defineProperty({}, "kind", {
      get() {
        Array.prototype.push = () => 0;
        throw new Error("hostile getter changed a mutable intrinsic");
      },
    });
    try {
      const result = R.admitVmResourceTransfer(tamperingGetter);
      assert.equal(result.allowed, false);
      assert.deepEqual(codes(result), ["Galerina_RUNTIME_ADMISSION_INPUT"]);

      const nonThrowingTamperingGetter = Object.defineProperty({}, "kind", {
        get() {
          Array.prototype.push = () => 0;
          return "not-a-closed-kind";
        },
      });
      const invalidResult = R.admitVmResourceTransfer(nonThrowingTamperingGetter);
      assert.equal(invalidResult.allowed, false);
      assert.deepEqual(codes(invalidResult), ["Galerina_RUNTIME_RESOURCE_KIND"]);
    } finally {
      Array.prototype.push = originalPush;
    }
  });
});

describe("RD-0656 VEO return-u64 envelope", () => {
  const object = new Uint8Array(16);
  object.set([0x47, 0x56, 0x45, 0x4f, 1, 1], 0);
  const ok = {
    profile: 1,
    importCount: 0,
    relocCount: 0,
    constructorCount: 0,
    pathPresent: false,
    objectBytes: object,
    identityComplete: true,
  };
  it("admits the bounded GVEO return-u64 profile", () => {
    assert.equal(R.admitVeoReturnU64Profile(ok).allowed, true);
  });
  it("refuses general linker features, paths, incomplete identity and non-GVEO bytes", () => {
    assert.deepEqual(
      codes(R.admitVeoReturnU64Profile({
        profile: 2,
        importCount: 1,
        relocCount: 1,
        constructorCount: 1,
        pathPresent: true,
        objectBytes: new Uint8Array(3),
        identityComplete: false,
      })),
      [
        "Galerina_RUNTIME_VEO_CONSTRUCTORS",
        "Galerina_RUNTIME_VEO_IDENTITY",
        "Galerina_RUNTIME_VEO_IMPORTS",
        "Galerina_RUNTIME_VEO_OBJECT",
        "Galerina_RUNTIME_VEO_PATH",
        "Galerina_RUNTIME_VEO_PROFILE",
        "Galerina_RUNTIME_VEO_RELOCS",
      ],
    );
    assert.equal(R.admitGeneralVeoLinker().allowed, false);
    assert.deepEqual(codes(R.admitGeneralVeoLinker()), ["Galerina_RUNTIME_VEO_GENERAL_LINKER"]);
  });
  it("returns a refusal when hostile VEO accessors or proxies throw", () => {
    const getter = Object.defineProperty({}, "profile", { get() { throw new Error("hostile getter"); } });
    const proxy = new Proxy({}, { get() { throw new Error("hostile proxy"); } });
    for (const input of [getter, proxy]) {
      const result = R.admitVeoReturnU64Profile(input);
      assert.equal(result.allowed, false);
      assert.deepEqual(codes(result), ["Galerina_RUNTIME_ADMISSION_INPUT"]);
    }

    const proxiedBytes = new Proxy(new Uint8Array(object), {});
    const result = R.admitVeoReturnU64Profile({ ...ok, objectBytes: proxiedBytes });
    assert.equal(result.allowed, false);
    assert.deepEqual(codes(result), ["Galerina_RUNTIME_ADMISSION_INPUT"]);

    const fragments = [
      new Uint8Array(16),
      new Uint8Array(16),
      Uint8Array.from([0x47]),
      Uint8Array.from([0, 0x56]),
      Uint8Array.from([0, 0, 0x45]),
      Uint8Array.from([0, 0, 0, 0x4f]),
      Uint8Array.from([0, 0, 0, 0, 1]),
      Uint8Array.from([0, 0, 0, 0, 0, 1]),
    ];
    let objectBytesReads = 0;
    const changingBytes = { ...ok };
    Object.defineProperty(changingBytes, "objectBytes", {
      get() { return fragments[objectBytesReads++] ?? new Uint8Array(16); },
    });
    const changingResult = R.admitVeoReturnU64Profile(changingBytes);
    assert.equal(changingResult.allowed, false);
    assert.deepEqual(codes(changingResult), ["Galerina_RUNTIME_VEO_OBJECT"]);
    assert.equal(objectBytesReads, 1);

    const originalPush = Array.prototype.push;
    const nonThrowingTamperingInput = { ...ok };
    Object.defineProperty(nonThrowingTamperingInput, "profile", {
      get() {
        Array.prototype.push = () => 0;
        return 99;
      },
    });
    try {
      const tamperedResult = R.admitVeoReturnU64Profile(nonThrowingTamperingInput);
      assert.equal(tamperedResult.allowed, false);
      assert.deepEqual(codes(tamperedResult), ["Galerina_RUNTIME_VEO_PROFILE"]);
    } finally {
      Array.prototype.push = originalPush;
    }
  });
});

describe("hostile isolation and physical erasure", () => {
  it("admits logical wipe and refuses hostile plus physical-erasure claims", () => {
    assert.equal(R.admitIsolationClaim("logical-wipe-verified").allowed, true);
    assert.deepEqual(codes(R.admitIsolationClaim("physical-media-wipe")), ["Galerina_RUNTIME_MEMORY_PHYSICAL_ERASURE"]);
    assert.deepEqual(codes(R.claimPhysicalErasure()), ["Galerina_RUNTIME_MEMORY_PHYSICAL_ERASURE"]);
    assert.deepEqual(codes(R.admitIsolationClaim("resource-as-machine-code")), ["Galerina_RUNTIME_RESOURCE_NOT_CODE"]);
    assert.deepEqual(codes(R.admitIsolationClaim("writable-and-executable")), ["Galerina_RUNTIME_MEMORY_WX"]);
    assert.deepEqual(codes(R.admitIsolationClaim("forged-handle")), ["Galerina_RUNTIME_RESOURCE_HANDLE"]);
    assert.deepEqual(codes(R.admitIsolationClaim("cross-table-handle")), ["Galerina_RUNTIME_RESOURCE_HANDLE"]);
  });
});

describe("native crate source lock", () => {
  it("keeps resource, VEO and memory-policy modules inside the authority crate", () => {
    assert.equal(existsSync(join(AUTHORITY, "resource.rs")), true);
    assert.equal(existsSync(join(AUTHORITY, "veo.rs")), true);
    assert.equal(existsSync(join(AUTHORITY, "memory_policy.rs")), true);
    const lib = readFileSync(join(AUTHORITY, "lib.rs"), "utf8");
    assert.match(lib, /mod resource;/);
    assert.match(lib, /mod veo;/);
    assert.match(lib, /mod memory_policy;/);
    assert.doesNotMatch(lib, /pub(?:\([^)]*\))?\s+mod\s+native/);
  });
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import * as R from "../dist/index.js";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const codes = (v) => v.diagnostics.map((d) => d.code).sort();
const closed = {
  kind: "owned-bytes-closed-profile",
  magic: "GVEO",
  objectBytes: 16,
  profile: "return-u64",
};

describe("bounded native floor transfer (NON-EXECUTING)", () => {
  it("refuses opaque VM resource handles", () => {
    const v = R.admitBoundedNativeFloorTransfer({ kind: "opaque-vm-resource" });
    assert.equal(v.allowed, false);
    assert.deepEqual(codes(v), ["Galerina_RUNTIME_OPAQUE_VM_TRANSFER"]);
  });

  it("refuses component-resource handles", () => {
    const v = R.admitBoundedNativeFloorTransfer({ kind: "component-resource" });
    assert.equal(v.allowed, false);
    assert.deepEqual(codes(v), ["Galerina_RUNTIME_OPAQUE_VM_TRANSFER"]);
  });

  it("refuses the unbuilt RD-0656 VEO object/linker profile", () => {
    const v = R.admitBoundedNativeFloorTransfer({ kind: "veo-object" });
    assert.equal(v.allowed, false);
    assert.deepEqual(codes(v), ["Galerina_RUNTIME_VEO_PROFILE_UNBUILT"]);
  });

  it("refuses unknown and non-closed-profile objects", () => {
    assert.deepEqual(codes(R.admitBoundedNativeFloorTransfer({ kind: "unknown" })), ["Galerina_RUNTIME_NON_CLOSED_PROFILE"]);
    assert.deepEqual(codes(R.admitBoundedNativeFloorTransfer({ kind: "owned-bytes-closed-profile", magic: "XXXX", objectBytes: 16, profile: "return-u64" })), ["Galerina_RUNTIME_NON_CLOSED_PROFILE"]);
    assert.deepEqual(codes(R.admitBoundedNativeFloorTransfer({ kind: "owned-bytes-closed-profile", magic: "GVEO", objectBytes: 32, profile: "return-u64" })), ["Galerina_RUNTIME_NON_CLOSED_PROFILE"]);
    assert.deepEqual(codes(R.admitBoundedNativeFloorTransfer({ kind: "owned-bytes-closed-profile", magic: "GVEO", objectBytes: 16, profile: "linker" })), ["Galerina_RUNTIME_NON_CLOSED_PROFILE"]);
  });

  it("refuses even a named closed profile because the TS surface is unbound", () => {
    const v = R.admitBoundedNativeFloorTransfer(closed);
    assert.equal(v.allowed, false);
    assert.deepEqual(codes(v), ["Galerina_RUNTIME_FLOOR_TRANSFER_UNBOUND"]);
  });

  it("refuses getters, arrays, extra keys and non-objects", () => {
    const hostile = {};
    Object.defineProperty(hostile, "kind", { enumerable: true, get() { return "owned-bytes-closed-profile"; } });
    assert.deepEqual(codes(R.admitBoundedNativeFloorTransfer(hostile)), ["Galerina_RUNTIME_FLOOR_TRANSFER_SHAPE"]);
    assert.deepEqual(codes(R.admitBoundedNativeFloorTransfer([])), ["Galerina_RUNTIME_FLOOR_TRANSFER_SHAPE"]);
    assert.deepEqual(codes(R.admitBoundedNativeFloorTransfer(null)), ["Galerina_RUNTIME_FLOOR_TRANSFER_SHAPE"]);
    assert.deepEqual(codes(R.admitBoundedNativeFloorTransfer({ ...closed, extra: 1 })), ["Galerina_RUNTIME_FLOOR_TRANSFER_SHAPE"]);
  });

  it("turns proxy reflection traps and revoked proxies into a coded refusal", () => {
    const throwingPrototype = new Proxy({}, { getPrototypeOf() { throw new Error("prototype trap"); } });
    const throwingKeys = new Proxy({}, { ownKeys() { throw new Error("keys trap"); } });
    const throwingDescriptor = new Proxy({ kind: "bounded-floor" }, {
      getPrototypeOf() { return Object.prototype; },
      ownKeys() { return ["kind"]; },
      getOwnPropertyDescriptor() { throw new Error("descriptor trap"); },
    });
    const revoked = Proxy.revocable({}, {});
    revoked.revoke();
    for (const hostile of [throwingPrototype, throwingKeys, throwingDescriptor, revoked.proxy]) {
      let result;
      assert.doesNotThrow(() => { result = R.admitBoundedNativeFloorTransfer(hostile); });
      assert.equal(result.allowed, false);
      assert.deepEqual(codes(result), ["Galerina_RUNTIME_FLOOR_TRANSFER_SHAPE"]);
    }
  });

  it("pins GVEO / 16-byte closed profile to the native source", () => {
    const native = readFileSync(join(HERE, "..", "native", "vok-authority", "src", "native.rs"), "utf8");
    assert.match(native, /pub\(crate\) const OBJECT_BYTES: usize = 16;/);
    assert.match(native, /const OBJECT_MAGIC: \[u8; 4\] = \*b"GVEO";/);
    assert.equal(R.BOUNDED_NATIVE_FLOOR_OBJECT_BYTES, 16);
    assert.equal(R.BOUNDED_NATIVE_FLOOR_MAGIC, "GVEO");
    assert.equal(R.BOUNDED_NATIVE_FLOOR_PROFILE, "return-u64");
    assert.ok(Object.isFrozen(R.BOUNDED_FLOOR_TRANSFER_KINDS));
  });
});

describe("L47 PROPOSED independent W^X/entropy receipt checklist", () => {
  it("is a frozen closed field set; WSL2 Docker is not an independent hostKind", () => {
    assert.ok(Object.isFrozen(R.PROPOSED_INDEPENDENT_WX_ENTROPY_RECEIPT_FIELDS));
    assert.deepEqual([...R.PROPOSED_INDEPENDENT_WX_ENTROPY_RECEIPT_FIELDS], [
      "hostOs", "hostKind", "kernel", "arch", "executableAtCall", "writableAtCall",
      "authorityReleased", "entropySource", "attestorIdentity", "relatedCommit",
    ]);
    assert.deepEqual([...R.PROPOSED_INDEPENDENT_WX_ENTROPY_HOST_OS], ["linux", "macos"]);
    assert.deepEqual([...R.PROPOSED_INDEPENDENT_WX_ENTROPY_HOST_KIND], ["physical", "independent-vm"]);
    assert.ok(!R.PROPOSED_INDEPENDENT_WX_ENTROPY_HOST_KIND.includes("wsl2-docker"));
    assert.ok(!R.PROPOSED_INDEPENDENT_WX_ENTROPY_HOST_OS.includes("windows"));
  });
});

describe("L48 PROPOSED hostile-memory proof obligations", () => {
  it("names unmet obligations and does not admit a proof", () => {
    assert.ok(Object.isFrozen(R.PROPOSED_HOSTILE_MEMORY_PROOF_OBLIGATIONS));
    assert.deepEqual([...R.PROPOSED_HOSTILE_MEMORY_PROOF_OBLIGATIONS], [
      "isolation-from-caller-alias",
      "integrity-of-owned-bytes-at-call",
      "physical-erasure-policy",
    ]);
    assert.equal(typeof R.admitBoundedNativeFloorTransfer, "function");
    assert.equal(R.admitBoundedNativeFloorTransfer(closed).allowed, false);
  });
});

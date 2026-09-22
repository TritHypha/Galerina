import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  SecurityTrap,
  StateSerializer,
} from "../dist/index.js";

const KEY_A = new Uint8Array(32).fill(0xa1);
const KEY_B = new Uint8Array(32).fill(0xb2);

function authority() {
  const keys = new Map([
    [1, { keyId: "epoch-key-a", key: KEY_A }],
    [2, { keyId: "epoch-key-b", key: KEY_B }],
  ]);
  let activeEpochId = 1;
  return {
    provider: {
      active() {
        const value = keys.get(activeEpochId);
        return value === undefined
          ? null
          : { epochId: activeEpochId, ...value };
      },
      resolve(epochId, keyId) {
        const value = keys.get(epochId);
        return value?.keyId === keyId ? value.key : null;
      },
    },
    switchTo(epochId) {
      activeEpochId = epochId;
    },
    revoke(epochId) {
      keys.delete(epochId);
    },
  };
}

describe("epoch-aware state serializer", () => {
  it("binds non-secret epoch identity into every authenticated snapshot", () => {
    const source = authority();
    const serializer = new StateSerializer({
      keyProvider: source.provider,
      strictKey: true,
    });
    const snapshot = serializer.serialize({ governed: true }, 41);

    assert.equal(snapshot.version, "2.0");
    assert.equal(snapshot.keyEpoch, 1);
    assert.equal(snapshot.keyId, "epoch-key-a");
    assert.equal("key" in snapshot, false);
    assert.equal("hmacKey" in snapshot, false);
    assert.equal(serializer.verify(snapshot), true);
  });

  it("keeps retired epochs verifiable after active signing switches", () => {
    const source = authority();
    const serializer = new StateSerializer({
      keyProvider: source.provider,
      strictKey: true,
    });
    const oldSnapshot = serializer.serialize({ generation: "old" }, 1);
    source.switchTo(2);
    const newSnapshot = serializer.serialize({ generation: "new" }, 2);

    assert.equal(newSnapshot.keyEpoch, 2);
    assert.equal(serializer.verify(oldSnapshot), true);
    assert.equal(serializer.verify(newSnapshot), true);
  });

  it("refuses missing, unknown, revoked, mismatched, and malformed epochs", () => {
    const source = authority();
    const serializer = new StateSerializer({
      keyProvider: source.provider,
      strictKey: true,
    });
    const snapshot = serializer.serialize({ protected: true }, 9);

    assert.equal(
      serializer.verify({ ...snapshot, keyEpoch: undefined }),
      false,
    );
    assert.equal(serializer.verify({ ...snapshot, keyEpoch: 99 }), false);
    assert.equal(serializer.verify({ ...snapshot, keyId: "epoch-key-b" }), false);
    assert.equal(serializer.verify({ ...snapshot, keyEpoch: 1.5 }), false);
    source.revoke(1);
    assert.equal(serializer.verify(snapshot), false);
    assert.throws(
      () => serializer.deserialize(snapshot),
      (error) =>
        error instanceof SecurityTrap
        && error.code === "LSS-INTEGRITY-001",
    );
  });

  it("fails closed when key authority is absent, weak, or throws", () => {
    assert.throws(
      () => new StateSerializer({
        keyProvider: {
          active: () => null,
          resolve: () => null,
        },
        strictKey: true,
      }),
      (error) => error instanceof SecurityTrap && error.code === "LSS-KEY-001",
    );

    assert.throws(
      () => new StateSerializer({
        keyProvider: {
          active: () => ({
            epochId: 1,
            keyId: "weak",
            key: new Uint8Array(32),
          }),
          resolve: () => null,
        },
        strictKey: true,
      }),
      (error) => error instanceof SecurityTrap && error.code === "LSS-KEY-001",
    );

    const throwing = new StateSerializer({
      keyProvider: {
        active: () => ({ epochId: 1, keyId: "throwing", key: KEY_A }),
        resolve: () => {
          throw new Error("authority unavailable");
        },
      },
      strictKey: true,
    });
    const snapshot = throwing.serialize({ protected: true }, 4);
    assert.equal(throwing.verify(snapshot), false);
  });
});

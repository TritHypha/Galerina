// T8K-K3 region keys are never persisted or exported. Synthetic only. NON_AUTHORIZING.
// requestPersist(kind, keyValid): kind 0 PERSIST 1 EXPORT 2 SEALED_EXPORT else Unlisted; keyValid 0/1.
// Every listed request refuses 63 PERSIST_REFUSED (even with a valid key); unlisted 11. Never 100.
// Zero-trust: transient memory needs no recovery (Phillip 2026-10-24 18:56), so rejected a sealed
// "recovery" export as well as plain persistence.
import { test } from "node:test";
import assert from "node:assert/strict";
import { grid } from "./common.mjs";

test("T8K-K3 a: every persist or export request refuses 63, including with a valid key", () => {
  grid("requestPersist", (call) => {
    for (const k of [0, 1, 2]) {
      for (const v of [0, 1]) {
        assert.equal(call([k, v]), 63, "requestPersist(" + k + "," + v + ")");
      }
    }
  });
});

test("T8K-K3 b: no input ever admits a persist (unlisted 11)", () => {
  grid("requestPersist", (call) => {
    for (const a of [[3, 1], [-1, 1], [0, 2], [1, -1]]) {
      const v = call(a);
      assert.notEqual(v, 100, "requestPersist(" + a.join(",") + ") admitted");
      assert.equal(v, 11, "requestPersist(" + a.join(",") + ")");
    }
  });
});

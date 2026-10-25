// T8K-K2 one key per region, never reused. Synthetic only. NON_AUTHORIZING.
// admitKeyId(sameIdOtherRegion, idRetired): each 0 NO 1 YES else Unlisted.
// Unlisted idRetired refuses 11 even when sameIdOtherRegion is 1 (round-check note KI3).
// Unlisted sameIdOtherRegion refuses 11 even when idRetired is 1 (merge-check note KI4).
// 100 only for (0,0); 62 KEY_REUSE_REFUSED if the id already serves another region or was retired by
// rotation; 11 Unlisted. Zero-trust: rejected sharing one key across regions and re-admitting a rotated key.
import { test } from "node:test";
import assert from "node:assert/strict";
import { grid } from "./common.mjs";

test("T8K-K2 a: a fresh id for one region is admitted", () => {
  grid("admitKeyId", (call) => {
    assert.equal(call([0, 0]), 100);
  });
});

test("T8K-K2 b: same id for two regions, reuse after rotation, or both refuse 62", () => {
  grid("admitKeyId", (call) => {
    for (const a of [[1, 0], [0, 1], [1, 1]]) {
      assert.equal(call(a), 62, "admitKeyId(" + a.join(",") + ")");
    }
  });
});

test("T8K-K2 c: unlisted values refuse 11", () => {
  grid("admitKeyId", (call) => {
    for (const a of [[2, 0], [0, 2], [-1, 0], [0, -1], [1, 2], [1, -1], [2, 1]]) {
      assert.equal(call(a), 11, "admitKeyId(" + a.join(",") + ")");
    }
  });
});

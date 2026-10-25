// T8K-K6 purpose binding and foreign roots. Synthetic only. NON_AUTHORIZING.
// useKey(keyPurpose, requestedPurpose, rootTag): purposes 0 REGION 1 DEK_WRAP 2 AUTH_PEPPER
// 3 MEMBERSHIP_SIGN else Unlisted; rootTag 0 GALERINA 1 SLIDE 2 LYTH else Unlisted.
// 100 only for a Galerina key used for its own purpose; 65 PURPOSE_MISMATCH_REFUSED; 66
// FOREIGN_ROOT_REFUSED for SLIDE and Lyth roots whatever the purpose; 11 Unlisted.
// Zero-trust: rejected one key serving several purposes; SLIDE and Lyth keep separate keys.
import { test } from "node:test";
import assert from "node:assert/strict";
import { grid } from "./common.mjs";

test("T8K-K6 a: matching purpose on a Galerina key admits; every cross-purpose pair refuses 65", () => {
  grid("useKey", (call) => {
    for (let k = 0; k < 4; k = k + 1) {
      for (let r = 0; r < 4; r = r + 1) {
        assert.equal(call([k, r, 0]), k === r ? 100 : 65, "useKey(" + k + "," + r + ",0)");
      }
    }
  });
});

test("T8K-K6 b: SLIDE and Lyth roots refuse 66 regardless of purpose", () => {
  grid("useKey", (call) => {
    for (const root of [1, 2]) {
      for (const k of [0, 1, 2, 3]) {
        assert.equal(call([k, k, root]), 66, "useKey(" + k + "," + k + "," + root + ")");
      }
      assert.equal(call([0, 3, root]), 66, "useKey(0,3," + root + ")");
    }
  });
});

test("T8K-K6 c: unlisted purpose or root refuses 11", () => {
  grid("useKey", (call) => {
    for (const a of [[4, 4, 0], [-1, 0, 0], [0, -1, 0], [0, 0, 3], [0, 0, -1], [4, 0, 1]]) {
      assert.equal(call(a), 11, "useKey(" + a.join(",") + ")");
    }
  });
});

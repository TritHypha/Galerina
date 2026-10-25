// T8K-K4 zeroise on stop. Synthetic only. NON_AUTHORIZING.
// admitStop(evidence): 0 MISSING 1 FREED_ONLY 2 WIPED else Unlisted.
// 100 only with wipe evidence; missing, freed-only and unlisted evidence are 106 Indeterminate (typed
// UNKNOWN), never success. Free is not wipe; a missing record is UNKNOWN (RD-0778).
import { test } from "node:test";
import assert from "node:assert/strict";
import { grid } from "./common.mjs";

test("T8K-K4 a: wipe evidence admits the stop", () => {
  grid("admitStop", (call) => {
    assert.equal(call([2]), 100);
  });
});

test("T8K-K4 b: freed-only, missing and unlisted evidence are UNKNOWN 106, never 100", () => {
  grid("admitStop", (call) => {
    for (const e of [0, 1, 3, -1, 9]) {
      assert.equal(call([e]), 106, "admitStop(" + e + ")");
    }
  });
});

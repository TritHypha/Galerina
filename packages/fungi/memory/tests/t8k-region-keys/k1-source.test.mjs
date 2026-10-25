// T8K-K1 key source (T8-NEXT-KEYS region keys). Synthetic only. NON_AUTHORIZING.
// admitKeySource(source): source 0 OS_CSPRNG 1 DERIVED_FROM_MASTER 2 USER_SUPPLIED 3 CONSTANT else Unlisted.
// 100 ADMITTED only for 0; 61 SOURCE_NOT_CSPRNG_REFUSED for 1-3; 11 Unlisted or negative.
// Zero-trust: region keys come only from the OS CSPRNG, one per region per process (rejected: deriving
// region keys from a master, where one leak opens every region; rejected: user-supplied or constant keys).
import { test } from "node:test";
import assert from "node:assert/strict";
import { grid } from "./common.mjs";

test("T8K-K1 a: only the OS CSPRNG source is admitted", () => {
  grid("admitKeySource", (call) => {
    assert.equal(call([0]), 100);
  });
});

test("T8K-K1 b: derived, user-supplied and constant sources refuse 61", () => {
  grid("admitKeySource", (call) => {
    for (const s of [1, 2, 3]) {
      assert.equal(call([s]), 61, "admitKeySource(" + s + ")");
    }
  });
});

test("T8K-K1 c: unlisted and negative sources refuse 11, never 100", () => {
  grid("admitKeySource", (call) => {
    for (const s of [-1, 4, 9, -2147483647]) {
      assert.equal(call([s]), 11, "admitKeySource(" + s + ")");
    }
  });
});

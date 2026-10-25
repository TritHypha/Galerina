// T8K-K7 ordering: purpose and root are decided before the KEK port is consulted. Synthetic only.
// unwrapDek(rootTag, requestedPurpose, declared, providerPresent): key purpose is DEK_WRAP (1).
// 66 foreign root first, then 65 purpose mismatch, then the port (112 undeclared, 119 absent), then 100.
// A foreign or mismatched request never learns whether the provider or secret exists (mirrors the
// portAccess name-first rule). Rejected: port-first ordering, which leaks KEK presence.
import { test } from "node:test";
import assert from "node:assert/strict";
import { grid } from "./common.mjs";

test("T8K-K7 a: Galerina root, DEK_WRAP purpose, port Admit unwraps", () => {
  grid("unwrapDek", (call) => {
    assert.equal(call([0, 1, 1, 1]), 100);
  });
});

test("T8K-K7 b: foreign root and purpose mismatch win over every port state", () => {
  grid("unwrapDek", (call) => {
    for (const [d, p] of [[1, 1], [0, 1], [1, 0], [0, 0]]) {
      assert.equal(call([1, 1, d, p]), 66, "SLIDE root d" + d + " p" + p);
      assert.equal(call([2, 1, d, p]), 66, "Lyth root d" + d + " p" + p);
      assert.equal(call([0, 0, d, p]), 65, "REGION purpose d" + d + " p" + p);
      assert.equal(call([0, 3, d, p]), 65, "MEMBERSHIP_SIGN purpose d" + d + " p" + p);
    }
  });
});

test("T8K-K7 c: port refusals pass through only after purpose and root admit", () => {
  grid("unwrapDek", (call) => {
    assert.equal(call([0, 1, 0, 1]), 112);
    assert.equal(call([0, 1, 0, 0]), 112);
    assert.equal(call([0, 1, 1, 0]), 119);
    for (const a of [[3, 1, 1, 1], [0, 4, 1, 1], [0, 1, 2, 1], [0, 1, 1, 2], [-1, 1, 1, 1]]) {
      assert.equal(call(a), 11, "unwrapDek(" + a.join(",") + ")");
    }
  });
});

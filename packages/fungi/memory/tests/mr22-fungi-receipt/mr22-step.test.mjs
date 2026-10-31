// MR22: 152 deliberately has no Step wrapper. If a caller pairs it through
// arenaStep anyway, arenaStateAfter does not list it and quarantines.
import { test } from "node:test";
import assert from "node:assert/strict";
import { step, ST, LEASE_SPENT } from "./mr22-harness.mjs";

test("152 through arenaStep quarantines (fail closed)", () => {
  for (const op of [3, 6]) {
    const r = step(op, ST.active, LEASE_SPENT);
    assert.equal(r.status, 0);
    assert.equal(r.value % 10, ST.quarantined, `op ${op}: ${r.value}`);
  }
});
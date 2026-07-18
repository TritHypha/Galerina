/**
 * The blessed Verdict mint `asVerdict` (S0 cast-hygiene, R&D 2026-07-18) — the ONE sanctioned trit→Verdict
 * transition. It PARSES (validates), it does not cast: a valid balanced trit (-1|0|1) passes through as a
 * Verdict; anything else is a fail-closed hard error, never a silently-minted invalid verdict. This is what
 * lets scripts/audit-cast-hygiene.mjs forbid every bare `as Verdict` across the codebase — the mint is the
 * only door, and it checks the value instead of trusting a cast.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { asVerdict, Verdict, vAnd, vOr, vNot } from "../dist/index.js";

test("asVerdict passes a valid trit through unchanged (identity on {-1,0,1})", () => {
  assert.equal(asVerdict(-1), Verdict.DENY);
  assert.equal(asVerdict(0), Verdict.INDETERMINATE);
  assert.equal(asVerdict(1), Verdict.ALLOW);
  assert.equal(asVerdict(asVerdict(1)), 1); // idempotent
});

test("★ asVerdict is fail-CLOSED on a non-trit — it throws, never mints an invalid verdict", () => {
  for (const bad of [2, -2, 3, 0.5, -1.5, NaN, Infinity, -Infinity]) {
    assert.throws(() => asVerdict(bad), /not a governance verdict trit/, `asVerdict(${bad}) must throw`);
  }
});

test("the Kleene aliases route through the mint and still produce the correct verdict (no semantic drift)", () => {
  // vAnd = min (fail-closed): the more-cautious wins.
  assert.equal(vAnd(Verdict.ALLOW, Verdict.DENY), Verdict.DENY);
  assert.equal(vAnd(Verdict.ALLOW, Verdict.ALLOW), Verdict.ALLOW);
  assert.equal(vAnd(Verdict.ALLOW, Verdict.INDETERMINATE), Verdict.INDETERMINATE);
  // vOr = max: the more-permissive wins.
  assert.equal(vOr(Verdict.DENY, Verdict.ALLOW), Verdict.ALLOW);
  assert.equal(vOr(Verdict.DENY, Verdict.INDETERMINATE), Verdict.INDETERMINATE);
  // vNot: ALLOW↔DENY, INDETERMINATE preserved.
  assert.equal(vNot(Verdict.ALLOW), Verdict.DENY);
  assert.equal(vNot(Verdict.DENY), Verdict.ALLOW);
  assert.equal(vNot(Verdict.INDETERMINATE), Verdict.INDETERMINATE);
});

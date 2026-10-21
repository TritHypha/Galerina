// S4 (X-Q20, X-Q24): parked TS queue 20 (#187) and 24 get a typed disposition.
import { test } from "node:test";
import assert from "node:assert/strict";
import { red, evidence } from "./harness.mjs";

const REASONS = ["SUPERSEDED_BY_FUNGI_35_36", "NEEDED_FOR_MERGE_GATE"];

test("S4: closure evidence records a typed disposition for queue 20 (#187) and queue 24", red("S4", "parked TS rows closed with a typed reason"), () => {
  const t = evidence("closure/S4-parked-ts-disposition.md");
  assert.notEqual(t, null, "evidence/closure/S4-parked-ts-disposition.md missing");
  for (const q of ["queue 20", "queue 24"]) {
    const line = t.split("\n").find((l) => l.toLowerCase().includes(q));
    assert.ok(line, q + " row missing");
    assert.ok(REASONS.some((r) => line.includes(r)), q + " needs one of " + REASONS.join("|"));
  }
  assert.match(t, /PR #187[^\n]*(CLOSE|KEEP)[^\n]*Phillip/i, "Phillip's decision on PR #187 recorded");
  assert.match(t, /PR #190[^\n]*(CLOSE|KEEP)[^\n]*Phillip/i, "Phillip's decision on PR #190 recorded");
});
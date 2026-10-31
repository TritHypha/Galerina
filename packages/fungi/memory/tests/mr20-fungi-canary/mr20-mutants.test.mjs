// MR20 mutants: one-site edits to secret-arena.fungi (in memory only) that a
// leak would look like. Each must be caught by the same checks the sweep uses.
import { test } from "node:test";
import assert from "node:assert/strict";
import { invoke, withMutant, traceFindings, CANARY_INTS } from "./mr20-harness.mjs";
import { CLOSED_RESULTS } from "./mr20-sweep-shard.mjs";

const SLOT_UNLISTED = "    return finish(11, true)\n  }\n  if slotGeneration < 1 {\n    return finish(40, true)\n  }\n  if handleGeneration < 1 {";
const tail = SLOT_UNLISTED.slice("    return finish(11, true)".length);

test("MR20 mutant A: returning the raw argument is a trace and outside the closed set", async () => {
  await withMutant(SLOT_UNLISTED, "    return freed" + tail, async () => {
    const r = await invoke("arenaSlotCheck", [0, 0, CANARY_INTS.synt]);
    assert.equal(r.status, 0, r.text);
    assert.ok(traceFindings(r.text).length > 0, "echoed canary must be found");
    assert.ok(!CLOSED_RESULTS.includes(r.value));
  });
});

test("MR20 mutant B: a canary-dependent branch shows as a differential and a new code", async () => {
  const next = "    if freed > 1000000000 {\n      return finish(19, true)\n    }\n    return finish(11, true)" + tail;
  await withMutant(SLOT_UNLISTED, next, async () => {
    const a = await invoke("arenaSlotCheck", [0, 0, CANARY_INTS.synt]);
    const b = await invoke("arenaSlotCheck", [0, 0, CANARY_INTS.f3a]);
    assert.equal(a.status, 0, a.text);
    assert.equal(b.status, 0, b.text);
    assert.notEqual(a.value, b.value, "differential must split");
    assert.deepEqual(traceFindings(a.text), [], "no direct echo: only the differential catches it");
    assert.ok(!CLOSED_RESULTS.includes(a.value));
  });
});

test("MR20 mutant C: an unmutated unit gives the same result for both canaries", async () => {
  const a = await invoke("arenaSlotCheck", [0, 0, CANARY_INTS.synt]);
  const b = await invoke("arenaSlotCheck", [0, 0, CANARY_INTS.f3a]);
  assert.equal(a.value, b.value);
  assert.ok(CLOSED_RESULTS.includes(a.value));
});

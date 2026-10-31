// MR20 CLI echo pin: `galerina run --invoke` refuses a non-Int argument with
// exit 2 and names it by position only. Before MEM-R20 it printed the rejected
// text back (JSON.stringify of the argument), so a secret passed by mistake
// landed in logs. These runs use only the synthetic canary.
import { test } from "node:test";
import assert from "node:assert/strict";
import { invoke, traceFindings, CANARY_TEXT } from "./mr20-harness.mjs";

for (const pos of [0, 1, 2]) {
  test(`MR20 string canary at argument #${pos + 1} is refused without echo`, async () => {
    const args = [0, 0, 0];
    args[pos] = CANARY_TEXT;
    const r = await invoke("arenaSlotCheck", args);
    assert.equal(r.status, 2, "non-Int argument must exit 2");
    assert.match(r.text, /not a valid Int or Bool/);
    assert.match(r.text, new RegExp(`invoke argument #${pos + 1} `));
    assert.deepEqual(traceFindings(r.text), [], "rejected argument text must not appear");
  });
}

test("MR20 string canary with a valid prefix is still refused without echo", async () => {
  const r = await invoke("arenaSlotCheck", ["7f3a" + CANARY_TEXT, 1, 0]);
  assert.equal(r.status, 2);
  assert.deepEqual(traceFindings(r.text), []);
});

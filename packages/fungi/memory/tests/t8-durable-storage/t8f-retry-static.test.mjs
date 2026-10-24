// T8-R6 (RD-0778 laws in durable-store.fungi). Synthetic only. NON_AUTHORIZING.
// retryCommit(priorOutcome, idempotencyProof): proof 0 NONE 1 PROVEN else Unlisted.
// packed: 8 NOOP after 100; 7 RETRY_ALLOWED only with proof 1; 26 RETRY_REFUSED without proof (106 or a
// listed refusal 20..25); any other prior is 11.
// Static laws on the unit source: typed UNKNOWN only (no null, no NaN), every match ends in a fail-closed
// `_ =>` arm, "WebAssembly" spelt out, native .fungi only.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SRC } from "./harness.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { flatten, withUnit, invoke } from "./harness.mjs";

const UNITS = ["c-boundary", "adapter-profile", "durable-store"];

function grid(flow, fn) {
  return withUnit(flatten(UNITS), (file) => fn((args) => {
    const r = invoke(file, flow, args);
    assert.equal(r.status, 0, flow + "(" + args.join(",") + ") status " + r.text);
    assert.equal(r.present, true, flow + "(" + args.join(",") + ") value absent " + r.text);
    return r.value;
  }));
}
test("T8-R6 Y1: no retry without an idempotency proof", () => {
  grid("retryCommit", (call) => {
    assert.equal(call([100, 0]), 8);
    assert.equal(call([100, 1]), 8);
    for (const p of [106, 20, 21, 22, 23, 24, 25]) {
      assert.equal(call([p, 0]), 26, "prior " + p + " no proof");
      assert.equal(call([p, 1]), 7, "prior " + p + " proof");
    }
    for (const a of [[106, 2], [106, -1], [0, 1], [101, 1], [-1, 1], [27, 1]]) {
      assert.equal(call(a), 11, "retryCommit(" + a.join(",") + ")");
    }
  });
});

test("T8-R6 S1: durable-store.fungi source obeys the static memory laws", () => {
  const t = readFileSync(join(SRC, "durable-store.fungi"), "utf8");
  assert.equal(/\bnull\b/.test(t), false, "no null");
  assert.equal(/\bNaN\b/.test(t), false, "no NaN");
  assert.equal(/\bWASM\b|\bWasm\b/.test(t), false, "spell WebAssembly");
  const matches = (t.match(/\bmatch\b/g) || []).length;
  const arms = (t.match(/_\s*=>/g) || []).length;
  assert.ok(arms >= matches, "every match needs a fail-closed _ => arm (" + matches + " match, " + arms + " arms)");
  for (const flow of ["publishAfterCommit", "recoverRecord", "recoveryAggregate", "verifyLocator", "admitMembership", "shippedMembershipSigner", "commitOutcome", "retryCommit"]) {
    assert.ok(new RegExp("flow\\s+" + flow + "\\s*\\(").test(t), "flow " + flow + " present");
  }
});
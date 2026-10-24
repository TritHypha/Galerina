// T8-R7 (gcw-t8d, round-check gaps AM7, RC4, CO4 at d0c6a9aed). Synthetic data only. NON_AUTHORIZING.
// AM7: admitMembership checks the signer first, so unsigned metadata (signerState 0) returns 25 whatever
//   else is wrong with it: unsigned input cannot probe rollback, version-gap, threshold or freeze state.
// RC4: a prior RETRY_REFUSED (26) is not a retryable prior outcome; retryCommit(26, p) is 11 for any proof.
// CO4: guard on the written proof that classifyDurableAdapter can only return 1, 4, 5 or 11, which makes
//   commitOutcome's unlisted fallthrough (11) unreachable; the fallthrough stays fail-closed.
import { test } from "node:test";
import assert from "node:assert/strict";
import { flatten, withUnit, invoke, unitText } from "./harness.mjs";

const UNITS = ["c-boundary", "adapter-profile", "durable-store"];

function grid(flow, fn) {
  return withUnit(flatten(UNITS), (file) => fn((args) => {
    const r = invoke(file, flow, args);
    assert.equal(r.status, 0, flow + "(" + args.join(",") + ") status " + r.text);
    assert.equal(r.present, true, flow + "(" + args.join(",") + ") value absent " + r.text);
    return r.value;
  }));
}

test("T8-R7 A1: unsigned metadata returns 25 before rollback, replay, gap, threshold or freeze is looked at", () => {
  grid("admitMembership", (call) => {
    for (const [a, why] of [
      [[4, 3, 2, 2, 0, 0], "unsigned + rollback"],
      [[4, 4, 2, 2, 0, 0], "unsigned + replay"],
      [[4, 6, 2, 2, 0, 0], "unsigned + version gap"],
      [[3, 4, 1, 2, 0, 0], "unsigned + short threshold"],
      [[3, 4, 0, 0, 0, 0], "unsigned + zero threshold"],
      [[3, 4, 2, 2, 0, 1], "unsigned + expired"],
      [[4, 3, 0, 0, 0, 1], "unsigned + rollback + zero threshold + expired"],
    ]) {
      assert.equal(call(a), 25, why + ": admitMembership(" + a.join(",") + ")");
    }
  });
});

test("T8-R7 R1: a prior RETRY_REFUSED (26) never retries, with or without a proof", () => {
  grid("retryCommit", (call) => {
    assert.equal(call([26, 1]), 11, "retryCommit(26,1)");
    assert.equal(call([26, 0]), 11, "retryCommit(26,0)");
    assert.equal(call([7, 1]), 11, "retryCommit(7,1)");
    assert.equal(call([8, 1]), 11, "retryCommit(8,1)");
  });
});

function flowBody(text, name) {
  const a = text.indexOf("flow " + name + "(");
  assert.ok(a >= 0, "flow " + name + " present");
  let b = text.indexOf("\npure flow ", a + 1);
  if (b < 0) {
    b = text.length;
  }
  return text.slice(a, b);
}

test("T8-R7 C1: CO4 proof guard: classifyDurableAdapter can only return 1, 4, 5 or 11", () => {
  const all = UNITS.map((u) => unitText(u)).join("\n");
  assert.equal((all.match(/flow\s+classifyDurableAdapter\s*\(/g) || []).length, 1, "exactly one classifyDurableAdapter definition");
  const body = flowBody(unitText("adapter-profile"), "classifyDurableAdapter");
  const lets = new Map();
  for (const m of body.matchAll(/let\s+([A-Za-z_][A-Za-z0-9_]*)\s*:\s*Int\s*=\s*(-?\d+)\s*$/gm)) {
    lets.set(m[1], Number(m[2]));
  }
  const rets = [...body.matchAll(/\breturn\s+([^\n]+)/g)].map((m) => m[1].trim());
  assert.ok(rets.length >= 1, "return sites found");
  const allowed = new Set([1, 4, 5, 11]);
  for (const r of rets) {
    let v = 0;
    let known = false;
    if (/^-?\d+$/.test(r)) {
      v = Number(r);
      known = true;
    } else if (lets.has(r)) {
      v = lets.get(r);
      known = true;
    }
    assert.equal(known, true, "return site '" + r + "' is a literal or an Int literal binding");
    assert.equal(allowed.has(v), true, "return site '" + r + "' = " + v + " is in {1,4,5,11}");
  }
  const co = flowBody(unitText("durable-store"), "commitOutcome");
  for (const c of [4, 11, 5, 1]) {
    assert.ok(new RegExp("if adapter == " + c + " \\{").test(co), "commitOutcome handles adapter " + c);
  }
  assert.ok(/let unlistedAdapter: Int = 11\s*\n\s*return unlistedAdapter\s*\n\}/.test(co), "unreachable fallthrough stays fail-closed 11");
});
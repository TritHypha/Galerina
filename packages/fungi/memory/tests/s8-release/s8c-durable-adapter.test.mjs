// S8-R3 (1415-T7, KG-07, Q10): durable adapter class only with a crash-campaign token. Synthetic tokens only.
// classifyDurableAdapter(backendClass, backend, crashCampaignClass, crashCampaignToken) in adapter-profile.fungi.
// backend: 0 sqlite-wal-full (synchronous=FULL) 1 rename+fsync+dir-fsync 2 any other store (no fsync proof) else Unlisted.
// crashCampaignToken: 0 NOT_RUN 1 PASSED_ZERO_VIOLATIONS 2 FAILED_VIOLATIONS else Unlisted.
// packed: 5 DURABLE_CRASH_PROVEN, 1 DELIVERY_UNKNOWN-only, 4 RAW_VALUE_REFUSED (class tag 1..10), 11 Unlisted.
// Zero-trust laws pinned here:
//  D1 durable (5) only for a listed durable backend (0/1) AND token 1; every other combination is never 5;
//  D2 unmeasured (token 0) or failed campaign (token 2) stays DELIVERY_UNKNOWN 1, even on a durable backend;
//  D3 a non-durable backend (2) is DELIVERY_UNKNOWN 1 even with a passing token (a token cannot upgrade a store);
//  D4 every foreign Int is admitted through c-boundary first: a raw class tag refuses 4, unlisted refuses 11;
//  D5 unlisted backend or token values refuse 11 (never default to durable or to DU silently).
import { test } from "node:test";
import assert from "node:assert/strict";
import { flatten, withUnit, invoke } from "./harness.mjs";

function grid(fn) {
  return withUnit(flatten(["c-boundary", "adapter-profile"]), (file) => fn((args) => {
    const r = invoke(file, "classifyDurableAdapter", args);
    assert.equal(r.status, 0, "classifyDurableAdapter(" + args.join(",") + ") status " + r.text);
    assert.equal(r.present, true, "classifyDurableAdapter(" + args.join(",") + ") value absent " + r.text);
    return r.value;
  }));
}

test("S8-R3 D1/D2/D3: durable only for listed durable backend with a passing crash campaign; otherwise DELIVERY_UNKNOWN", () => {
  grid((call) => {
    for (const b of [0, 1, 2]) {
      for (const k of [0, 1, 2]) {
        const v = call([0, b, 0, k]);
        const want = (b === 0 || b === 1) && k === 1 ? 5 : 1;
        assert.equal(v, want, "backend " + b + " token " + k);
      }
    }
  });
});

test("S8-R3 D4/D5: raw class tags refuse 4, unlisted class or value refuses 11, never durable", () => {
  grid((call) => {
    for (const [a, want] of [
      [[3, 0, 0, 1], 4], [[0, 0, 3, 1], 4], [[1, 1, 0, 1], 4], [[0, 1, 10, 1], 4],
      [[11, 0, 0, 1], 11], [[0, 0, 11, 1], 11], [[12, 0, 0, 1], 11], [[0, 0, -1, 1], 11],
      [[0, 3, 0, 1], 11], [[0, -1, 0, 1], 11], [[0, 0, 0, 3], 11], [[0, 1, 0, -1], 11], [[0, 2, 0, 7], 11],
    ]) {
      assert.equal(call(a), want, "classifyDurableAdapter(" + a.join(",") + ")");
    }
  });
});

test("S8-R3 control: sqlite-wal-full with a passing crash campaign is durable 5", () => {
  grid((call) => {
    assert.equal(call([0, 0, 0, 1]), 5);
  });
});
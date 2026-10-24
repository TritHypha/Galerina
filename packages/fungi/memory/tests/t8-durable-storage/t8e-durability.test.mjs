// T8-R5 (RD-1415-T8 + Q10): a durable commit claim only with SQLite WAL synchronous=FULL or measured
// rename+fsync AND a passing ALICE-style crash campaign; otherwise DELIVERY_UNKNOWN. Synthetic only.
// commitOutcome(backendClass, backend, campaignClass, campaignToken, writeAck) in durable-store.fungi
// must reuse classifyDurableAdapter (adapter-profile.fungi). writeAck: 0 NO_ACK 1 ACK else Unlisted.
// packed: 100 COMMITTED_DURABLE only when the adapter is 5 and writeAck 1; 106 Indeterminate when the
// adapter is DELIVERY_UNKNOWN (1) or the write was not acknowledged (crash); adapter 4/11 pass through.
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
test("T8-R5 D1/D2: durable commit only with proven durability and an acknowledged write", () => {
  withUnit(flatten(UNITS), (file) => {
    for (const b of [0, 1, 2]) {
      for (const k of [0, 1, 2]) {
        const adapter = invoke(file, "classifyDurableAdapter", [0, b, 0, k]);
        assert.equal(adapter.present, true, adapter.text);
        for (const w of [0, 1]) {
          const r = invoke(file, "commitOutcome", [0, b, 0, k, w]);
          assert.equal(r.status, 0, r.text);
          assert.equal(r.present, true, r.text);
          const want = adapter.value === 5 && w === 1 ? 100 : 106;
          assert.equal(r.value, want, "backend " + b + " token " + k + " ack " + w);
        }
      }
    }
  });
});

test("T8-R5 D3: adapter refusals pass through; unlisted writeAck refuses 11", () => {
  grid("commitOutcome", (call) => {
    for (const [a, want] of [
      [[3, 0, 0, 1, 1], 4], [[0, 0, 3, 1, 1], 4], [[11, 0, 0, 1, 1], 11], [[0, 3, 0, 1, 1], 11],
      [[0, 0, 0, 3, 1], 11], [[0, 0, 0, 1, 2], 11], [[0, 0, 0, 1, -1], 11],
    ]) {
      assert.equal(call(a), want, "commitOutcome(" + a.join(",") + ")");
    }
  });
});
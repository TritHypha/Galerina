import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { MemoryReplayStore } from "../dist/index.js";

describe("MemoryReplayStore", () => {
  it("stores a replay key until the inclusive TTL boundary", () => {
    let now = 10_000;
    const store = new MemoryReplayStore({ now: () => now });

    assert.equal(store.has("delivery-1"), false);
    store.put("delivery-1", 2);
    assert.equal(store.has("delivery-1"), true);

    now = 11_999;
    assert.equal(store.has("delivery-1"), true);
    now = 12_000;
    assert.equal(store.has("delivery-1"), false);
  });

  it("refuses empty keys and non-positive or non-finite TTLs", () => {
    const store = new MemoryReplayStore({ now: () => 10_000 });

    assert.throws(() => store.put("", 1), /key/i);
    assert.throws(() => store.put("delivery-1", 0), /TTL/i);
    assert.throws(() => store.put("delivery-1", -1), /TTL/i);
    assert.throws(() => store.put("delivery-1", Number.NaN), /TTL/i);
    assert.throws(() => store.put("delivery-1", Number.POSITIVE_INFINITY), /TTL/i);
  });

  it("does not claim absence when the injected clock is invalid", () => {
    const store = new MemoryReplayStore({ now: () => Number.NaN });

    assert.throws(() => store.has("delivery-1"), /clock/i);
    assert.throws(() => store.put("delivery-1", 1), /clock/i);
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { MemoryReplayStore, createApiServer, isProcessLocalReplayStore } from "../dist/index.js";
import { createAppKernel } from "../../galerina-framework-app-kernel/dist/index.js";

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

  it("claims atomically per scope and isolates namespaces", () => {
    const store = new MemoryReplayStore({ now: () => 10_000 });
    assert.equal(store.claim("replay", "evt-1", 2), "claimed");
    assert.equal(store.claim("replay", "evt-1", 2), "duplicate");
    assert.equal(store.claim("idempotency", "evt-1", 2), "claimed");
  });

  it("exposes no persist, disk, or share surface", () => {
    const store = new MemoryReplayStore({ now: () => 10_000 });
    const names = Object.getOwnPropertyNames(Object.getPrototypeOf(store));
    for (const name of ["persist", "flush", "open", "path", "share", "replicate"]) {
      assert.equal(names.includes(name), false, name);
    }
    assert.equal(typeof store.claim, "function");
  });

  it("refuses additional keys once capacity is exhausted", () => {
    const store = new MemoryReplayStore({ now: () => 10_000, maxEntries: 2 });
    assert.equal(store.claim("replay", "a", 1), "claimed");
    assert.equal(store.claim("replay", "b", 1), "claimed");
    assert.throws(() => store.claim("replay", "c", 1), /capacity/i);
    assert.equal(store.claim("replay", "a", 1), "duplicate");
  });

  it("does not evict unexpired claims to make room", () => {
    const store = new MemoryReplayStore({ now: () => 10_000, maxEntries: 2 });
    assert.equal(store.claim("replay", "a", 10), "claimed");
    assert.equal(store.claim("replay", "b", 10), "claimed");
    assert.throws(() => store.claim("replay", "c", 10), /capacity/i);
    assert.equal(store.claim("replay", "a", 10), "duplicate");
    assert.equal(store.claim("replay", "b", 10), "duplicate");
  });

  it("reclaims expired entries on the next admit without dropping live keys", () => {
    let now = 10_000;
    const store = new MemoryReplayStore({ now: () => now, maxEntries: 2 });
    assert.equal(store.claim("replay", "a", 1), "claimed");
    assert.equal(store.claim("replay", "b", 1), "claimed");
    now = 11_000;
    assert.equal(store.claim("replay", "c", 1), "claimed");
    assert.equal(store.claim("replay", "c", 1), "duplicate");
  });

  it("counts put and claim keys against one live ceiling", () => {
    const store = new MemoryReplayStore({ now: () => 10_000, maxEntries: 2 });
    store.put("delivery-1", 1);
    assert.equal(store.claim("replay", "a", 1), "claimed");
    assert.throws(() => store.claim("replay", "b", 1), /capacity/i);
    store.put("delivery-1", 1);
  });

  it("refuses a key above the admitted UTF-8 byte ceiling", () => {
    const store = new MemoryReplayStore({ now: () => 10_000, maxKeyBytes: 8 });
    assert.throws(() => store.claim("replay", "123456789", 1), /byte ceiling/i);
    assert.throws(() => store.put("123456789", 1), /byte ceiling/i);
    assert.equal(store.claim("replay", "12345678", 1), "claimed");
  });

  it("does not collide when scope and key contain the old separator", () => {
    let now = 10_000;
    const store = new MemoryReplayStore({ now: () => now });
    assert.equal(store.claim("a", "\u0000b", 1), "claimed");
    assert.equal(store.claim("a\u0000", "b", 2), "claimed");
    assert.equal(store.claim("a", "\u0000b", 1), "duplicate");
    assert.equal(store.claim("a\u0000", "b", 2), "duplicate");
    now = 11_000;
    store.pruneExpired();
    assert.equal(store.claim("a", "\u0000b", 1), "claimed");
    assert.equal(store.claim("a\u0000", "b", 2), "duplicate");
    now = 12_000;
    store.pruneExpired();
    assert.equal(store.claim("a\u0000", "b", 1), "claimed");
  });

  it("brands MemoryReplayStore as process-local", () => {
    const store = new MemoryReplayStore({ now: () => 10_000 });
    assert.equal(isProcessLocalReplayStore(store), true);
    assert.equal(isProcessLocalReplayStore({ claim() { return "claimed"; } }), false);
  });

  it("refuses production durable replay when the store is process-local", () => {
    const kernel = createAppKernel({
      routes: [{ method: "POST", path: "/h", handler: "h", requestType: "Any", auth: { mode: "public" } }],
      requestValidators: { Any: () => true },
      dispatch: { h: () => ({ status: 200, body: { ok: true } }) },
    });
    const store = new MemoryReplayStore({ now: () => 10_000 });
    assert.throws(
      () => createApiServer({
        kernel,
        allowInsecureLoopback: true,
        requireDurableReplay: true,
        webhook: {
          secret: "s",
          signatureHeader: "x-sig",
          eventIdHeader: "x-id",
          replayStore: store,
          replayTtlSeconds: 60,
        },
      }),
      /durable replay is outstanding/,
    );
  });
});

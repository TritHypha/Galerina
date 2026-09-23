// Q2 hostile admission: requireDurableReplay must refuse unknown/volatile adapters.
// MemoryReplayStore is process-local. A wrapper, proxy, bound method, accessor or
// forged field is not durability evidence. This file labels every test double
// NON-DURABLE. There is no admitted durable production backend in this tree;
// a positive production-durable case is not fabricated.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { MemoryReplayStore, createApiServer, isProcessLocalReplayStore } from "../dist/index.js";
import { createAppKernel } from "../../galerina-framework-app-kernel/dist/index.js";
import {
  createCapabilityHost,
  createContractEnforcer,
} from "../../galerina-core-compiler/dist/index.js";

function kernel() {
  return createAppKernel({
    routes: [{ method: "POST", path: "/h", handler: "h", requestType: "Any", auth: { mode: "public" } }],
    requestValidators: { Any: () => true },
    dispatch: { h: () => ({ status: 200, body: { ok: true } }) },
  });
}

function webhook(replayStore) {
  return {
    secret: "s",
    signatureHeader: "x-sig",
    eventIdHeader: "x-id",
    replayStore,
    replayTtlSeconds: 60,
  };
}

function constructDurable(replayStore) {
  return createApiServer({
    kernel: kernel(),
    allowInsecureLoopback: true,
    requireDurableReplay: true,
    webhook: webhook(replayStore),
  });
}

function countingStore(inner) {
  let claims = 0;
  const store = {
    claim(...args) {
      claims += 1;
      return inner.claim(...args);
    },
    get claimCount() { return claims; },
  };
  return store;
}

describe("Q2 requireDurableReplay admission (NON-DURABLE doubles only)", () => {
  it("refuses a direct MemoryReplayStore before any claim", () => {
    const memory = new MemoryReplayStore({ now: () => 10_000 });
    let claims = 0;
    const orig = memory.claim.bind(memory);
    Object.defineProperty(memory, "claim", {
      value: (...args) => {
        claims += 1;
        return orig(...args);
      },
    });
    assert.equal(isProcessLocalReplayStore(memory), true);
    assert.throws(
      () => constructDurable(memory),
      /durable replay is outstanding/,
    );
    assert.equal(claims, 0, "construct must not call claim on the refused store");
  });

  it("refuses a forwarding wrapper around MemoryReplayStore (NON-DURABLE)", () => {
    const memory = new MemoryReplayStore({ now: () => 10_000 });
    const wrapper = {
      claim: (...args) => memory.claim(...args),
    };
    assert.equal(isProcessLocalReplayStore(wrapper), false,
      "WeakSet identity does not follow the inner store");
    assert.throws(
      () => constructDurable(wrapper),
      /durable replay is outstanding/,
      "a caller's wrapper is not durability evidence",
    );
  });

  it("refuses a bound-method object (NON-DURABLE)", () => {
    const memory = new MemoryReplayStore({ now: () => 10_000 });
    const bound = { claim: memory.claim.bind(memory) };
    assert.throws(() => constructDurable(bound), /durable replay is outstanding/);
  });

  it("refuses a Proxy around MemoryReplayStore (NON-DURABLE)", () => {
    const memory = new MemoryReplayStore({ now: () => 10_000 });
    const proxy = new Proxy(memory, {
      get(target, prop, receiver) {
        return Reflect.get(target, prop, receiver);
      },
    });
    assert.equal(isProcessLocalReplayStore(proxy), false);
    assert.throws(() => constructDurable(proxy), /durable replay is outstanding/);
  });

  it("refuses an accessor object whose claim forwards to memory (NON-DURABLE)", () => {
    const memory = new MemoryReplayStore({ now: () => 10_000 });
    const accessor = {};
    Object.defineProperty(accessor, "claim", {
      get() {
        return (...args) => memory.claim(...args);
      },
    });
    assert.throws(() => constructDurable(accessor), /durable replay is outstanding/);
  });

  it("refuses a forged brand field (NON-DURABLE)", () => {
    const forged = {
      claim() { return "claimed"; },
      processLocal: false,
      durable: true,
      kind: "durable-replay-store",
    };
    assert.throws(() => constructDurable(forged), /durable replay is outstanding/);
  });

  it("refuses a MemoryReplayStore subclass (still process-local, NON-DURABLE)", () => {
    class SubMemory extends MemoryReplayStore {}
    const sub = new SubMemory({ now: () => 10_000 });
    assert.equal(isProcessLocalReplayStore(sub), true);
    assert.throws(() => constructDurable(sub), /durable replay is outstanding/);
  });

  it("requireDurableReplay without a webhook constructs because no replay store is in use", () => {
    const server = createApiServer({
      kernel: kernel(),
      allowInsecureLoopback: true,
      requireDurableReplay: true,
    });
    assert.ok(server);
    server.close();
  });

  it("development omits requireDurableReplay and may construct with MemoryReplayStore", () => {
    const memory = new MemoryReplayStore({ now: () => 10_000 });
    const server = createApiServer({
      kernel: kernel(),
      allowInsecureLoopback: true,
      webhook: webhook(memory),
    });
    assert.ok(server);
    server.close();
  });

  it("does not call claim while refusing an unknown adapter", () => {
    const memory = new MemoryReplayStore({ now: () => 10_000 });
    const counted = countingStore(memory);
    let server;
    try {
      server = constructDurable(counted);
    } catch (err) {
      assert.match(String(err && err.message), /durable replay is outstanding/);
      assert.equal(counted.claimCount, 0, "refusal must happen before claims");
      return;
    }
    assert.equal(counted.claimCount, 0, "construct still must not call claim");
    server.close();
    assert.fail("unknown adapter was admitted under requireDurableReplay");
  });

  it("does not treat post-admission method replacement as durability", () => {
    const memory = new MemoryReplayStore({ now: () => 10_000 });
    const wrapper = {
      claim: (...args) => memory.claim(...args),
    };
    let server;
    try {
      server = constructDurable(wrapper);
    } catch (err) {
      assert.match(String(err && err.message), /durable replay is outstanding/);
      return;
    }
    wrapper.claim = () => "claimed";
    server.close();
    assert.fail("wrapper was admitted; replacing claim after construct is not durability evidence");
  });
});

describe("Q2 adjacent: explicit empty grant vs omitted grant", () => {
  it("omitted grantedEffects authorizes a declared effect (dev declared-only)", () => {
    const host = createCapabilityHost({
      declaredEffects: new Set(["network.outbound"]),
      enforcer: createContractEnforcer(undefined, "testFlow"),
    });
    assert.equal(host.check({
      capabilityId: "host.network.outbound",
      effect: "network.outbound",
      args: [],
      context: { flowName: "testFlow", startedAt: 0 },
    }).allowed, true);
  });

  it("grantedEffects: [] is an explicit empty grant and refuses the declared effect", () => {
    const host = createCapabilityHost({
      declaredEffects: new Set(["network.outbound"]),
      grantedEffects: new Set(),
      enforcer: createContractEnforcer(undefined, "testFlow"),
    });
    const denied = host.check({
      capabilityId: "host.network.outbound",
      effect: "network.outbound",
      args: [],
      context: { flowName: "testFlow", startedAt: 0 },
    });
    assert.equal(denied.allowed, false);
    assert.match(String(denied.reason), /not granted/);
  });
});

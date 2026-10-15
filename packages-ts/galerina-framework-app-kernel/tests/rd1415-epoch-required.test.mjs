// WU4 fix-02 R2: missing/throwing/invalid revocationEpoch seals 503 with no uncaught.
// Synthetic data only. Does not modify rd1413-revocation-before-delivery.test.mjs.
import assert from "node:assert/strict";
import { test } from "node:test";
import { createAppKernel } from "../dist/index.js";

const dec = new TextDecoder();

function req(over = {}) {
  return {
    method: "GET",
    path: "/pay",
    headers: {},
    body: new Uint8Array(0),
    query: {},
    requestId: "rq-epoch",
    receivedAt: 0,
    ...over,
  };
}

function errorOf(res) {
  if (res.body === undefined) return undefined;
  return JSON.parse(dec.decode(res.body)).error;
}

function waitMacrotask() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

async function withEscapeWatch(run) {
  const uncaught = [];
  const unhandled = [];
  const onUncaught = (err) => {
    uncaught.push(err);
  };
  const onUnhandled = (reason) => {
    unhandled.push(reason);
  };
  process.on("uncaughtException", onUncaught);
  process.on("unhandledRejection", onUnhandled);
  try {
    const result = await run();
    await waitMacrotask();
    return { ...result, uncaught, unhandled };
  } finally {
    process.off("uncaughtException", onUncaught);
    process.off("unhandledRejection", onUnhandled);
  }
}

function epochKernel(provider) {
  let consumerCalled = false;
  let providerUses = 0;
  const wrapped = {
    has(name) {
      return provider.has(name);
    },
    use(name, fn) {
      providerUses += 1;
      return provider.use(name, fn);
    },
    ...(typeof provider.revocationEpoch === "function"
      ? { revocationEpoch: () => provider.revocationEpoch() }
      : {}),
  };
  const kernel = createAppKernel({
    routes: [{
      method: "GET",
      path: "/pay",
      handler: "pay",
      auth: { mode: "public" },
      secrets: { require: ["db.main"] },
    }],
    dispatch: {
      pay: ({ getSecret }) => {
        getSecret("db.main", () => { consumerCalled = true; });
        return { body: { ok: true } };
      },
    },
    secretsProvider: wrapped,
  });
  return {
    kernel,
    consumerCalled: () => consumerCalled,
    providerUses: () => providerUses,
  };
}

const cases = [
  {
    name: "no revocationEpoch",
    provider: {
      has() { return true; },
      use(_name, fn) { fn(new Uint8Array([1])); },
    },
  },
  {
    name: "throwing revocationEpoch",
    provider: {
      has() { return true; },
      use(_name, fn) { fn(new Uint8Array([1])); },
      revocationEpoch() { throw new Error("epoch boom"); },
    },
  },
  {
    name: "negative epoch",
    provider: {
      has() { return true; },
      use(_name, fn) { fn(new Uint8Array([1])); },
      revocationEpoch() { return -1; },
    },
  },
  {
    name: "NaN epoch",
    provider: {
      has() { return true; },
      use(_name, fn) { fn(new Uint8Array([1])); },
      revocationEpoch() { return Number.NaN; },
    },
  },
  {
    name: "unsafe integer epoch",
    provider: {
      has() { return true; },
      use(_name, fn) { fn(new Uint8Array([1])); },
      revocationEpoch() { return 2 ** 53; },
    },
  },
];

for (const scenario of cases) {
  test(`kernel: ${scenario.name} seals 503, consumer not called, zero escapes`, async () => {
    const watched = await withEscapeWatch(async () => {
      const harness = epochKernel(scenario.provider);
      const response = await harness.kernel.handle(req());
      return {
        response,
        consumerCalled: harness.consumerCalled(),
        providerUses: harness.providerUses(),
      };
    });
    assert.equal(watched.response.status, 503, scenario.name);
    assert.equal(errorOf(watched.response), "secret_unavailable", scenario.name);
    assert.equal(watched.consumerCalled, false, `${scenario.name} must not call the consumer`);
    assert.equal(watched.providerUses, 0, `${scenario.name} must not enter provider.use (lease not released)`);
    assert.equal(watched.uncaught.length, 0, `${scenario.name} uncaughtException`);
    assert.equal(watched.unhandled.length, 0, `${scenario.name} unhandledRejection`);
  });
}

test("kernel: in-flight microtask missing epoch seals 503 with zero uncaughtException", async () => {
  const watched = await withEscapeWatch(async () => {
    let consumerCalled = false;
    const kernel = createAppKernel({
      routes: [{
        method: "GET",
        path: "/pay",
        handler: "pay",
        auth: { mode: "public" },
        secrets: { require: ["db.main"] },
      }],
      dispatch: {
        pay: async ({ getSecret }) => {
          queueMicrotask(() => {
            getSecret("db.main", () => { consumerCalled = true; });
          });
          await Promise.resolve();
          return { body: { ok: true } };
        },
      },
      secretsProvider: {
        has() { return true; },
        use(_name, fn) { fn(new Uint8Array([1])); },
      },
    });
    const response = await kernel.handle(req());
    await waitMacrotask();
    return { response, consumerCalled };
  });
  assert.equal(watched.response.status, 503);
  assert.equal(errorOf(watched.response), "secret_unavailable");
  assert.equal(watched.consumerCalled, false);
  assert.equal(watched.uncaught.length, 0);
  assert.equal(watched.unhandled.length, 0);
});

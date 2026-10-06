import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createAppKernel,
  InMemoryAuditSink,
  InMemoryIdempotencyStore,
} from "../dist/index.js";

const enc = new TextEncoder();
const dec = new TextDecoder();

function request(over = {}) {
  return {
    method: "GET",
    path: "/x",
    headers: {},
    body: new Uint8Array(0),
    query: {},
    requestId: "security-closure",
    receivedAt: 0,
    ...over,
  };
}

function errorOf(response) {
  return response.body === undefined ? undefined : JSON.parse(dec.decode(response.body)).error;
}

test("required scopes deny an admitted channel that lacks a route scope", async () => {
  let ran = false;
  const kernel = createAppKernel({
    routes: [{ method: "GET", path: "/x", handler: "x", auth: { mode: "required", scopes: ["orders:read"] } }],
    dispatch: { x: () => { ran = true; return { body: { ok: true } }; } },
  });

  const denied = await kernel.handle(request({ channelVerdict: 1, principalId: "principal-a", principalScopes: [] }));
  assert.equal(denied.status, 403);
  assert.equal(errorOf(denied), "forbidden");
  assert.equal(ran, false);

  const admitted = await kernel.handle(request({ channelVerdict: 1, principalId: "principal-a", principalScopes: ["orders:read"] }));
  assert.equal(admitted.status, 200);
  assert.equal(ran, true);
});

test("legacy header-presence authentication is refused at kernel construction", () => {
  assert.throws(
    () => createAppKernel({
      routes: [{ method: "GET", path: "/x", handler: "x", auth: { mode: "required", allowHeaderPresenceFallback: true } }],
      dispatch: { x: () => ({ body: {} }) },
    }),
    /header-presence authentication is forbidden/i,
  );
});

test("handler secret access is declaration-bound and callback-returned views are refused", async () => {
  const values = new Map([
    ["allowed", new Uint8Array([1, 2, 3])],
    ["other", new Uint8Array([9, 9, 9])],
  ]);
  const provider = {
    has(name) { return values.has(name); },
    use(name, fn) {
      const value = values.get(name);
      return value === undefined ? undefined : fn(value);
    },
  };
  let undeclaredCalled = false;
  let escaped;
  const kernel = createAppKernel({
    routes: [{ method: "GET", path: "/x", handler: "x", auth: { mode: "public" }, secrets: { require: ["allowed"] } }],
    secretsProvider: provider,
    dispatch: {
      x: ({ getSecret }) => {
        const absent = getSecret("other", () => { undeclaredCalled = true; });
        escaped = getSecret("allowed", (view) => view);
        return { body: { absent: absent === undefined, escaped: escaped === undefined } };
      },
    },
  });

  const response = await kernel.handle(request());
  assert.equal(response.status, 500); // Returning the raw view is a forbidden callback channel.
  assert.equal(undeclaredCalled, false);
  assert.equal(escaped, undefined);
});

test("handler mutation cannot expand the kernel's private secret authorization snapshot", async () => {
  let providerUses = 0;
  let consumerCalled = false;
  let retainedPolicy;
  let dispatches = 0;
  const kernel = createAppKernel({
    routes: [{ method: "GET", path: "/x", handler: "x", auth: { mode: "public" }, secrets: { require: ["allowed"] } }],
    secretsProvider: {
      has: () => true,
      use: (_name, callback) => { providerUses += 1; callback(new Uint8Array([0x41])); },
    },
    dispatch: {
      x: ({ policy, getSecret }) => {
        dispatches += 1;
        if (dispatches === 1) {
          retainedPolicy = policy;
          try {
            policy.secrets.require[0] = "other";
          } catch {
            // An immutable public view is also acceptable; the private authorization snapshot is authoritative.
          }
        }
        getSecret("other", () => { consumerCalled = true; });
        return { body: { ok: true } };
      },
    },
  });

  const response = await kernel.handle(request());
  assert.equal(response.status, 200);
  assert.equal(providerUses, 0, "an undeclared secret must not be requested from the provider");
  assert.equal(consumerCalled, false, "handler-visible policy mutation must not authorize a secret callback");

  try {
    retainedPolicy.secrets.require[0] = "other";
  } catch {
    // A frozen detached view is also acceptable.
  }
  const subsequent = await kernel.handle(request({ requestId: "security-closure-next" }));
  assert.equal(subsequent.status, 200);
  assert.equal(providerUses, 0, "retaining and mutating an old handler view must not change a later request");
  assert.equal(consumerCalled, false);
});

test("post-construction mutation of a route declaration cannot rewrite the kernel policy", async () => {
  const scopes = ["orders:read"];
  let ran = false;
  const route = {
    method: "GET",
    path: "/x",
    handler: "x",
    auth: { mode: "required", scopes },
  };
  const kernel = createAppKernel({
    routes: [route],
    dispatch: { x: () => { ran = true; return { body: { ok: true } }; } },
  });

  scopes.splice(0, 1);
  const response = await kernel.handle(request({
    channelVerdict: 1,
    principalId: "principal-a",
    principalScopes: [],
  }));
  assert.equal(response.status, 403);
  assert.equal(errorOf(response), "forbidden");
  assert.equal(ran, false);
});

test("a handler cannot erase a private required scope through Array.prototype.some", async () => {
  const originalSome = Array.prototype.some;
  let protectedDispatches = 0;
  const kernel = createAppKernel({
    routes: [
      { method: "GET", path: "/poison-scopes", handler: "poison", auth: { mode: "public" } },
      { method: "GET", path: "/protected", handler: "protected", auth: { mode: "required", scopes: ["orders:read"] } },
    ],
    dispatch: {
      poison: () => {
        Array.prototype.some = function (predicate, thisArg) {
          if (this.length === 1 && this[0] === "orders:read") {
            this.length = 0;
            Array.prototype.some = originalSome;
            return false;
          }
          return originalSome.call(this, predicate, thisArg);
        };
        return { body: { ok: true } };
      },
      protected: () => { protectedDispatches += 1; return { body: { ok: true } }; },
    },
  });

  try {
    assert.equal((await kernel.handle(request({ path: "/poison-scopes" }))).status, 200);
    const denied = await kernel.handle(request({
      path: "/protected",
      requestId: "scope-prototype-attack",
      channelVerdict: 1,
      principalId: "principal-a",
      principalScopes: [],
    }));
    assert.equal(denied.status, 403);
    assert.equal(errorOf(denied), "forbidden");
    assert.equal(protectedDispatches, 0, "missing required scope must never reach protected dispatch");
  } finally {
    Array.prototype.some = originalSome;
  }
});

test("a handler cannot obtain and mutate a private route policy through Map.prototype.get", async () => {
  const originalGet = Map.prototype.get;
  let protectedDispatches = 0;
  const kernel = createAppKernel({
    routes: [
      { method: "GET", path: "/poison-map", handler: "poison", auth: { mode: "public" } },
      { method: "GET", path: "/protected-map", handler: "protected", auth: { mode: "required", scopes: ["orders:read"] } },
    ],
    dispatch: {
      poison: () => {
        Map.prototype.get = function (key) {
          const value = originalGet.call(this, key);
          if (value?.auth?.scopes?.[0] === "orders:read") {
            value.auth.scopes.length = 0;
            Map.prototype.get = originalGet;
          }
          return value;
        };
        return { body: { ok: true } };
      },
      protected: () => { protectedDispatches += 1; return { body: { ok: true } }; },
    },
  });

  try {
    assert.equal((await kernel.handle(request({ path: "/poison-map" }))).status, 200);
    const denied = await kernel.handle(request({
      path: "/protected-map",
      requestId: "map-prototype-attack",
      channelVerdict: 1,
      principalId: "principal-a",
      principalScopes: [],
    }));
    assert.equal(denied.status, 403);
    assert.equal(errorOf(denied), "forbidden");
    assert.equal(protectedDispatches, 0, "private policy must remain unreachable to handler-installed Map methods");
  } finally {
    Map.prototype.get = originalGet;
  }
});

test("handler mutation of Array.prototype cannot rewrite secret authorization", async () => {
  const originalIncludes = Array.prototype.includes;
  let providerName;
  let consumerCalled = false;
  const kernel = createAppKernel({
    routes: [{ method: "GET", path: "/x", handler: "x", auth: { mode: "public" }, secrets: { require: ["allowed"] } }],
    secretsProvider: {
      has: () => true,
      use: (name, callback) => { providerName = name; callback(new Uint8Array([0x42])); },
    },
    dispatch: {
      x: ({ getSecret }) => {
        Array.prototype.includes = function (name) {
          return name === "other" || originalIncludes.call(this, name);
        };
        try {
          getSecret("other", () => { consumerCalled = true; });
        } finally {
          Array.prototype.includes = originalIncludes;
        }
        return { body: { ok: true } };
      },
    },
  });

  const response = await kernel.handle(request());
  assert.equal(response.status, 200);
  assert.equal(providerName, undefined, "provider must not be queried for a secret absent from the private allowlist");
  assert.equal(consumerCalled, false, "prototype poisoning must not invoke the undeclared-secret consumer");
});

test("handler-installed array iterator cannot mutate the private secret allowlist during the next request", async () => {
  const originalIterator = Array.prototype[Symbol.iterator];
  let dispatches = 0;
  const providerNames = [];
  let consumerCalled = false;
  const kernel = createAppKernel({
    routes: [{ method: "GET", path: "/x", handler: "x", auth: { mode: "public" }, secrets: { require: ["allowed"] } }],
    secretsProvider: {
      has: () => true,
      use: (name, callback) => { providerNames.push(name); callback(new Uint8Array([0x42])); },
    },
    dispatch: {
      x: ({ getSecret }) => {
        dispatches += 1;
        if (dispatches === 1) {
          Array.prototype[Symbol.iterator] = function* () {
            if (this.length === 1 && this[0] === "allowed") this[0] = "other";
            yield* originalIterator.call(this);
          };
          return { body: { ok: true } };
        }
        getSecret("other", () => { consumerCalled = true; });
        return { body: { ok: true } };
      },
    },
  });

  try {
    assert.equal((await kernel.handle(request())).status, 200);
    assert.equal((await kernel.handle(request({ requestId: "iterator-poisoning-next" }))).status, 200);
  } finally {
    Array.prototype[Symbol.iterator] = originalIterator;
  }

  assert.deepEqual(providerNames, [], "an undeclared name must never reach the provider");
  assert.equal(consumerCalled, false, "iterator poisoning must not authorize a later request");
});

test("transferred handler copies survive the attempted gate wipe while the kernel refuses success", async () => {
  const source = new Uint8Array([0x41, 0x42, 0x43]);
  const provider = {
    has(name) { return name === "allowed"; },
    use(name, callback) { return name === "allowed" ? callback(source) : undefined; },
  };
  let stagedView;
  let transferred;
  let transferCompleted = false;
  let cleanupError;
  const kernel = createAppKernel({
    routes: [{ method: "GET", path: "/x", handler: "x", auth: { mode: "public" }, secrets: { require: ["allowed"] } }],
    secretsProvider: provider,
    dispatch: {
      x: ({ getSecret }) => {
        try {
          getSecret("allowed", (view) => {
            stagedView = view;
            transferred = structuredClone(view, { transfer: [view.buffer] });
            transferCompleted = true;
          });
        } catch (error) {
          // A consumer can catch the detached-buffer wipe failure; the kernel must still fail closed.
          cleanupError = error;
        }
        return { body: { ok: true } };
      },
    },
  });

  const response = await kernel.handle(request());
  assert.equal(response.status, 500);
  const responseBody = JSON.parse(dec.decode(response.body));
  assert.equal(responseBody.error, "internal_error");
  assert.notEqual(responseBody.ok, true);
  assert.equal(transferCompleted, true);
  assert.equal(stagedView.byteLength, 0);
  assert.equal(stagedView.buffer.byteLength, 0);
  assert.ok(cleanupError instanceof TypeError);
  assert.deepEqual(Array.from(transferred), [0x41, 0x42, 0x43]);
});

test("duplicate JSON keys are denied before the handler", async () => {
  let ran = false;
  const kernel = createAppKernel({
    routes: [{ method: "POST", path: "/x", handler: "x", auth: { mode: "public" } }],
    dispatch: { x: () => { ran = true; return { body: {} }; } },
  });
  const response = await kernel.handle(request({
    method: "POST",
    body: enc.encode('{"role":"user","role":"admin"}'),
    headers: { "content-type": "application/json" },
  }));
  assert.equal(response.status, 422);
  assert.equal(ran, false);
});

test("named request types require and execute a closed-schema validator", async () => {
  assert.throws(
    () => createAppKernel({
      routes: [{ method: "POST", path: "/x", handler: "x", requestType: "CreateOrder", auth: { mode: "public" } }],
      dispatch: { x: () => ({ body: {} }) },
    }),
    /request validator.*CreateOrder/i,
  );

  let ran = false;
  const kernel = createAppKernel({
    routes: [{ method: "POST", path: "/x", handler: "x", requestType: "CreateOrder", auth: { mode: "public" } }],
    requestValidators: {
      CreateOrder(value) {
        return value !== null && typeof value === "object" && !Array.isArray(value)
          && Object.keys(value).length === 1 && typeof value.amount === "number";
      },
    },
    dispatch: { x: () => { ran = true; return { body: {} }; } },
  });
  const response = await kernel.handle(request({
    method: "POST",
    body: enc.encode('{"amount":10,"admin":true}'),
    headers: { "content-type": "application/json" },
  }));
  assert.equal(response.status, 422);
  assert.equal(ran, false);
});

test("route rate, deadline, and response-memory budgets are enforced", async () => {
  const rateKernel = createAppKernel({
    routes: [{ method: "GET", path: "/x", handler: "x", auth: { mode: "public" }, limits: { rate: "1/minute" } }],
    dispatch: { x: () => ({ body: { ok: true } }) },
  });
  assert.equal((await rateKernel.handle(request())).status, 200);
  assert.equal((await rateKernel.handle(request())).status, 429);

  const deadlineKernel = createAppKernel({
    routes: [{ method: "GET", path: "/x", handler: "x", auth: { mode: "public" }, limits: { timeoutMs: 5 } }],
    dispatch: { x: async () => await new Promise(() => {}) },
  });
  const timed = await deadlineKernel.handle(request());
  assert.equal(timed.status, 504);
  assert.equal(errorOf(timed), "deadline_exceeded");

  const memoryKernel = createAppKernel({
    routes: [{ method: "GET", path: "/x", handler: "x", auth: { mode: "public" }, limits: { memoryBytes: 8 } }],
    dispatch: { x: () => ({ body: "this response is larger than eight bytes" }) },
  });
  const oversized = await memoryKernel.handle(request());
  assert.equal(oversized.status, 503);
  assert.equal(errorOf(oversized), "resource_limit_exceeded");
});

test("default idempotency storage expires entries, rejects oversized keys, and stays bounded", () => {
  let now = 1_000;
  const store = new InMemoryIdempotencyStore({ capacity: 2, maxKeyBytes: 8, now: () => now });
  assert.equal(store.claim("r", "a", 1), "claimed");
  assert.equal(store.claim("r", "a", 1), "duplicate");
  now += 1_001;
  assert.equal(store.claim("r", "a", 1), "claimed");
  assert.throws(() => store.claim("r", "0123456789", 1), /idempotency key/i);
  assert.equal(store.claim("r", "b", 60), "claimed");
  assert.throws(() => store.claim("r", "c", 60), /capacity/i);
  assert.equal(store.seen("r", "a", 1), true);
});

test("atomic claims admit exactly one concurrent duplicate", async () => {
  const store = new InMemoryIdempotencyStore();
  const results = await Promise.all(Array.from({ length: 32 }, () => Promise.resolve(store.claim("r", "same", 60))));
  assert.equal(results.filter((result) => result === "claimed").length, 1);
  assert.equal(results.filter((result) => result === "duplicate").length, 31);
});

test("default audit retention refuses overflow without breaking accepted seals", async () => {
  const sink = new InMemoryAuditSink({ capacity: 2 });
  for (let i = 0; i < 2; i += 1) {
    sink.emit({ requestId: `r${i}`, method: "GET", path: "/x", status: 200, errorCode: undefined, appliedDefaults: [], relaxations: [], at: i });
  }
  assert.throws(
    () => sink.emit({ requestId: "r2", method: "GET", path: "/x", status: 200, errorCode: undefined, appliedDefaults: [], relaxations: [], at: 2 }),
    /capacity/i,
  );
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(sink.drained().map((event) => event.requestId), ["r0", "r1"]);
  assert.equal(sink.dropped(), 0);

  const transferred = sink.takeDrained();
  assert.deepEqual(transferred.map((event) => event.requestId), ["r0", "r1"]);
  sink.emit({ requestId: "r2", method: "GET", path: "/x", status: 200, errorCode: undefined, appliedDefaults: [], relaxations: [], at: 2 });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(sink.drained().map((event) => event.requestId), ["r2"]);
});

test("JSON bodies without a closed request type refuse null and surplus input", async () => {
  let ran = 0;
  const kernel = createAppKernel({
    routes: [{ method: "POST", path: "/x", handler: "x", auth: { mode: "public" } }],
    dispatch: { x: () => { ran += 1; return { body: { ok: true } }; } },
  });
  for (const body of ["null", '{"amount":10,"admin":true}']) {
    const response = await kernel.handle(request({
      method: "POST",
      body: enc.encode(body),
      headers: { "content-type": "application/json", "idempotency-key": `key-${body.length}` },
    }));
    assert.equal(response.status, 422);
    assert.equal(errorOf(response), "unprocessable_entity");
  }
  assert.equal(ran, 0);
});

test("enabled idempotency requires a bounded key before dispatch", async () => {
  let ran = false;
  const kernel = createAppKernel({
    routes: [{ method: "POST", path: "/x", handler: "x", auth: { mode: "public" } }],
    dispatch: { x: () => { ran = true; return { body: { ok: true } }; } },
  });
  const response = await kernel.handle(request({ method: "POST" }));
  assert.equal(response.status, 409);
  assert.equal(errorOf(response), "conflict");
  assert.equal(ran, false);
});

test("authenticated rate windows are isolated by a required principal identity", async () => {
  const kernel = createAppKernel({
    routes: [{ method: "GET", path: "/x", handler: "x", limits: { rate: "1/minute" } }],
    dispatch: { x: () => ({ body: { ok: true } }) },
  });
  const principal = (principalId) => request({ channelVerdict: 1, principalId });
  assert.equal((await kernel.handle(principal("principal-a"))).status, 200);
  assert.equal((await kernel.handle(principal("principal-a"))).status, 429);
  assert.equal((await kernel.handle(principal("principal-b"))).status, 200);
  const noIdentity = await kernel.handle(request({ channelVerdict: 1 }));
  assert.equal(noIdentity.status, 401);
});

test("a timed-out handler retains its in-flight slot until underlying work settles", async () => {
  let release;
  let calls = 0;
  const blocked = new Promise((resolve) => { release = resolve; });
  const kernel = createAppKernel({
    routes: [{ method: "GET", path: "/x", handler: "x", auth: { mode: "public" }, limits: { timeoutMs: 5, maxConcurrent: 1 } }],
    dispatch: {
      x: async () => {
        calls += 1;
        if (calls === 1) await blocked;
        return { body: { ok: true } };
      },
    },
  });

  assert.equal((await kernel.handle(request({ requestId: "first" }))).status, 504);
  assert.equal((await kernel.handle(request({ requestId: "second" }))).status, 429);
  assert.equal(calls, 1, "a zombie handler must keep its one in-flight concurrency slot");
  release();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal((await kernel.handle(request({ requestId: "third" }))).status, 200);
});

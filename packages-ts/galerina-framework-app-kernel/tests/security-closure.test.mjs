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

test("handler secret access is restricted to the route declaration and raw views cannot be returned", async () => {
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
  assert.equal(response.status, 200);
  assert.equal(undeclaredCalled, false);
  assert.equal(escaped, undefined);
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

test("a timed-out handler retains its concurrency lease until underlying work settles", async () => {
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
  assert.equal(calls, 1, "a zombie handler must keep its one active-compute lease");
  release();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal((await kernel.handle(request({ requestId: "third" }))).status, 200);
});

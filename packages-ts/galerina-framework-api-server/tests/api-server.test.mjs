/**
 * End-to-end tests for the Galerina HTTP API-server adapter.
 *
 * These drive a REAL kernel through a REAL socket: createAppKernel → createApiServer
 * → listen(0) → fire requests with node:http and assert the responses. Nothing is
 * mocked; the kernel's fixed pipeline produces the 404/405/422 statuses, and the
 * adapter's additive body cap produces the 413.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";

import { createAppKernel } from "../../galerina-framework-app-kernel/dist/index.js";
import { Verdict } from "../../galerina-tower-citizen/dist/index.js";
import { createApiServer, listen } from "../dist/index.js";

/** Build a kernel with one public POST /charge route → 200 {ok:true}. */
function buildKernel() {
  return createAppKernel({
    routes: [
      {
        method: "POST",
        path: "/charge",
        handler: "charge",
        requestType: "ChargeRequest",
        auth: { mode: "public" },
      },
    ],
    requestValidators: {
      ChargeRequest(value) {
        return value !== null && typeof value === "object" && !Array.isArray(value)
          && Object.keys(value).length === 1 && Number.isFinite(value.amount);
      },
    },
    dispatch: {
      charge: () => ({ status: 200, body: { ok: true } }),
    },
  });
}

/** Build a kernel with one auth-REQUIRED GET /secure route. Tracks whether the
 *  handler ran so we can assert it is blocked before dispatch on a denied channel. */
function buildSecureKernel(ran) {
  return createAppKernel({
    routes: [
      { method: "GET", path: "/secure", handler: "secure", requestType: "SecureRequest" },
      { method: "POST", path: "/secure", handler: "secure", requestType: "SecureRequest" },
    ], // default auth: required
    requestValidators: {
      SecureRequest(value) {
        return value !== null && typeof value === "object" && !Array.isArray(value)
          && typeof value.password === "string";
      },
    },
    dispatch: { secure: () => { ran.value = true; return { status: 200, body: { ok: true } }; } },
  });
}

/** Spin up a secure-kernel adapter with the given options, run fn, always close. */
async function withSecureServer(opts, fn, beforeListen) {
  const ran = { value: false };
  const server = createApiServer({ kernel: buildSecureKernel(ran), allowInsecureLoopback: true, ...opts });
  beforeListen?.(server);
  const { port } = await listen(server, 0);
  try {
    return await fn(port, ran);
  } finally {
    await new Promise((r) => server.close(() => r(undefined)));
  }
}

/** Observe the adapter's actual IncomingMessage data-listener registration and delivery. */
function observeRequestBodyConsumers(server) {
  const observations = [];
  server.prependListener("request", (req) => {
    const observation = {
      dataListenerRegistrations: 0,
      dataListenerRemovals: 0,
      bytesDelivered: 0,
      request: req,
    };
    observations.push(observation);
    const originalOn = req.on;
    const originalRemoveListener = req.removeListener;
    const wrappedListeners = new Map();
    req.on = function observedOn(event, listener) {
      if (event !== "data" || typeof listener !== "function") {
        return originalOn.call(this, event, listener);
      }
      observation.dataListenerRegistrations += 1;
      const wrapped = function observedData(chunk) {
        observation.bytesDelivered += Buffer.isBuffer(chunk)
          ? chunk.byteLength
          : Buffer.byteLength(chunk);
        return listener.call(this, chunk);
      };
      wrappedListeners.set(listener, wrapped);
      return originalOn.call(this, event, wrapped);
    };
    req.removeListener = function observedRemoveListener(event, listener) {
      if (event === "data" && wrappedListeners.has(listener)) {
        observation.dataListenerRemovals += 1;
        const wrapped = wrappedListeners.get(listener);
        wrappedListeners.delete(listener);
        return originalRemoveListener.call(this, event, wrapped);
      }
      return originalRemoveListener.call(this, event, listener);
    };
  });
  return observations;
}

/** Fire a single request through the socket and collect the full response. */
function request(port, { method, path, headers = {}, body }) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: "127.0.0.1", port, method, path, headers },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () =>
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: Buffer.concat(chunks).toString("utf8"),
          }),
        );
      },
    );
    req.on("error", reject);
    if (body !== undefined) req.write(body);
    req.end();
  });
}

/** Send only a prefix of a declared body so tests can inspect pre-EOF behavior. */
function startRequestWithIncompleteBody(port, { method, path, headers = {}, bodyPrefix }) {
  let resolveResponse;
  let rejectResponse;
  const response = new Promise((resolve, reject) => {
    resolveResponse = resolve;
    rejectResponse = reject;
  });
  const req = http.request({
    host: "127.0.0.1",
    port,
    method,
    path,
    headers: { ...headers, "content-length": "1024" },
  }, (res) => {
    const chunks = [];
    res.on("data", (c) => chunks.push(c));
    res.on("end", () => resolveResponse({
      status: res.statusCode,
      headers: res.headers,
      body: Buffer.concat(chunks).toString("utf8"),
    }));
  });
  req.on("error", rejectResponse);
  req.setTimeout(2000, () => req.destroy(new Error("early refusal timed out")));
  req.flushHeaders();
  req.write(bodyPrefix);
  return {
    req,
    response,
    finish: () => setImmediate(() => req.end(Buffer.alloc(1024 - Buffer.byteLength(bodyPrefix), 0x20))),
  };
}

/** Spin up the adapter, run `fn(port)`, always close the server. */
async function withServer(opts, fn, beforeListen) {
  const server = createApiServer({ kernel: buildKernel(), allowInsecureLoopback: true, ...opts });
  beforeListen?.(server);
  const { port } = await listen(server, 0);
  try {
    return await fn(port);
  } finally {
    await new Promise((r) => server.close(() => r(undefined)));
  }
}

const JSON_HEADERS = { "content-type": "application/json" };

test("plaintext API transport requires explicit loopback-only authority", async () => {
  assert.throws(() => createApiServer({ kernel: buildKernel() }), /TLS|plaintext|loopback/i);

  const server = createApiServer({ kernel: buildKernel(), allowInsecureLoopback: true });
  try {
    await assert.rejects(() => listen(server, 0, "0.0.0.0"), /loopback|plaintext/i);
  } finally {
    if (server.listening) await new Promise((resolve) => server.close(resolve));
  }
});

test("POST /charge with valid JSON → 200 {ok:true}", async () => {
  await withServer({}, async (port) => {
    const res = await request(port, {
      method: "POST",
      path: "/charge",
      headers: { ...JSON_HEADERS, "idempotency-key": "charge-1" },
      body: JSON.stringify({ amount: 100 }),
    });
    assert.equal(res.status, 200);
    assert.deepEqual(JSON.parse(res.body), { ok: true });
  });
});

test("GET /charge (wrong method on a known path) → 405", async () => {
  await withServer({}, async (port) => {
    const res = await request(port, { method: "GET", path: "/charge" });
    assert.equal(res.status, 405);
  });
});

test("POST /nope (unknown path) → 404", async () => {
  await withServer({}, async (port) => {
    const res = await request(port, {
      method: "POST",
      path: "/nope",
      headers: JSON_HEADERS,
      body: "{}",
    });
    assert.equal(res.status, 404);
  });
});

test("malformed request targets return 400 without an unhandled rejection", async () => {
  const unhandled = [];
  const onUnhandled = (reason) => { unhandled.push(reason); };
  process.on("unhandledRejection", onUnhandled);
  try {
    await withServer({}, async (port) => {
      const res = await request(port, { method: "GET", path: "//[" });
      assert.equal(res.status, 400);
      const body = JSON.parse(res.body);
      assert.equal(body.error, "bad_request");
    });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(unhandled.length, 0, "malformed targets must stay inside the request error boundary");
  } finally {
    process.off("unhandledRejection", onUnhandled);
  }
});

test("oversized body (> adapter maxBodyBytes) → 413", async () => {
  // Configure a tiny adapter cap so the additive DoS guard trips before the kernel.
  await withServer({ maxBodyBytes: 64 }, async (port) => {
    const big = "x".repeat(4096);
    const res = await request(port, {
      method: "POST",
      path: "/charge",
      headers: JSON_HEADERS,
      body: big,
    });
    assert.equal(res.status, 413);
  });
});

test("malformed JSON body → 422", async () => {
  await withServer({}, async (port) => {
    const res = await request(port, {
      method: "POST",
      path: "/charge",
      headers: JSON_HEADERS,
      body: "{ not valid json ",
    });
    assert.equal(res.status, 422);
  });
});

// ── The live channel-verdict path: transport resolver → kernel fail-closed fold ──
// The TLSTP S1 cert-gate produces a K3 verdict the transport feeds to the kernel via
// resolveChannelVerdict. Only +1/ALLOW admits; 0/−1 deny; a throwing resolver denies.

test("channel verdict DENY (−1) → 401 on an auth-required route, handler NOT run", async () => {
  await withSecureServer({ resolveChannelVerdict: () => Verdict.DENY }, async (port, ran) => {
    const res = await request(port, { method: "GET", path: "/secure" });
    assert.equal(res.status, 401);
    assert.equal(ran.value, false);
  });
});

test("explicit channel DENY refuses before the adapter consumes a request body", async () => {
  let resolverHadStreamAccess = null;
  let requestContext;
  let bodyObservations;
  await withSecureServer({
    resolveChannelVerdict: (context) => {
      requestContext = context;
      resolverHadStreamAccess = ["read", "on", "pause", "resume", "pipe", "socket"]
        .some((name) => name in context);
      return Verdict.DENY;
    },
  }, async (port, ran) => {
    const pending = startRequestWithIncompleteBody(port, {
      method: "POST",
      path: "/secure",
      headers: JSON_HEADERS,
      bodyPrefix: JSON.stringify({ password: "synthetic-only" }),
    });
    const res = await pending.response;
    assert.equal(res.status, 401);
    assert.deepEqual(JSON.parse(res.body), {
      error: "unauthorized",
      message: "Channel/identity verdict denied admission.",
    });
    assert.equal(res.headers.connection, "close");
    assert.equal(resolverHadStreamAccess, false);
    assert.equal(requestContext.path, "/secure");
    assert.equal(ran.value, false);
    assert.equal(bodyObservations.length, 1);
    assert.equal(bodyObservations[0].dataListenerRegistrations, 0);
    assert.equal(bodyObservations[0].dataListenerRemovals, 0);
    assert.equal(bodyObservations[0].bytesDelivered, 0);
    assert.equal(bodyObservations[0].request.listenerCount("data"), 0);
  }, (server) => {
    bodyObservations = observeRequestBodyConsumers(server);
  });
});

test("an explicit principal-resolution refusal also precedes request-body consumption", async () => {
  let resolverHadStreamAccess = null;
  let requestContext;
  let bodyObservations;
  await withSecureServer({
    resolveChannelVerdict: () => Verdict.ALLOW,
    resolvePrincipal: (context) => {
      requestContext = context;
      resolverHadStreamAccess = ["read", "on", "pause", "resume", "pipe", "socket"]
        .some((name) => name in context);
      return undefined;
    },
  }, async (port, ran) => {
    const pending = startRequestWithIncompleteBody(port, {
      method: "POST",
      path: "/secure",
      headers: JSON_HEADERS,
      bodyPrefix: JSON.stringify({ password: "synthetic-only" }),
    });
    const res = await pending.response;
    assert.equal(res.status, 401);
    assert.deepEqual(JSON.parse(res.body), {
      error: "unauthorized",
      message: "Channel/identity verdict denied admission.",
    });
    assert.equal(res.headers.connection, "close");
    assert.equal(resolverHadStreamAccess, false);
    assert.equal(requestContext.path, "/secure");
    assert.equal(ran.value, false);
    assert.equal(bodyObservations.length, 1);
    assert.equal(bodyObservations[0].dataListenerRegistrations, 0);
    assert.equal(bodyObservations[0].dataListenerRemovals, 0);
    assert.equal(bodyObservations[0].bytesDelivered, 0);
    assert.equal(bodyObservations[0].request.listenerCount("data"), 0);
  }, (server) => {
    bodyObservations = observeRequestBodyConsumers(server);
  });
});

test("createApiServer refuses a kernel without route-authorization preflight", () => {
  assert.throws(() => createApiServer({
    kernel: { async handle() { return { status: 200, headers: {} }; } },
    allowInsecureLoopback: true,
  }), /route authorization preflight/i);
});

test("required-auth POST without resolvers refuses before consuming the request body", async () => {
  await withSecureServer({}, async (port, ran) => {
    const pending = startRequestWithIncompleteBody(port, {
      method: "POST",
      path: "/secure",
      headers: JSON_HEADERS,
      bodyPrefix: JSON.stringify({ password: "synthetic-only" }),
    });
    const refusedBeforeBody = await Promise.race([
      pending.response.then(() => true, () => true),
      new Promise((resolve) => setTimeout(() => resolve(false), 100)),
    ]);
    if (!refusedBeforeBody) pending.finish();
    const res = await pending.response;
    assert.equal(refusedBeforeBody, true,
      "required-auth refusal must not wait for the client to finish uploading its body");
    assert.equal(res.status, 401);
    assert.equal(res.headers.connection, "close");
    assert.equal(ran.value, false);
  });
});

test("an admitted request completes after the body arrives", async () => {
  let requestContext;
  let bodyObservations;
  await withServer({
    resolveChannelVerdict: () => Verdict.ALLOW,
    resolvePrincipal: (context) => {
      requestContext = context;
      return { principalId: "principal-a", principalScopes: [] };
    },
  }, async (port) => {
    const pending = startRequestWithIncompleteBody(port, {
      method: "POST",
      path: "/charge",
      headers: { ...JSON_HEADERS, "idempotency-key": "charge-positive-control" },
      bodyPrefix: JSON.stringify({ amount: 100 }),
    });
    const waitStartedAt = Date.now();
    while (requestContext === undefined && Date.now() - waitStartedAt < 1000) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    assert.ok(requestContext, "server should resolve identity while the body is incomplete");
    assert.equal(requestContext.path, "/charge");
    pending.finish();
    const res = await pending.response;
    assert.equal(res.status, 200, res.body);
    assert.equal(bodyObservations.length, 1);
    assert.equal(bodyObservations[0].dataListenerRegistrations, 1);
    assert.equal(bodyObservations[0].dataListenerRemovals, 1);
    assert.equal(bodyObservations[0].bytesDelivered, 1024);
    assert.equal(bodyObservations[0].request.listenerCount("data"), 0);
  }, (server) => {
    bodyObservations = observeRequestBodyConsumers(server);
  });
});

test("preflight ALLOW on a protected POST still buffers then rechecks in the kernel", async () => {
  let requestContext;
  await withSecureServer({
    resolveChannelVerdict: () => Verdict.ALLOW,
    resolvePrincipal: (context) => {
      requestContext = context;
      return { principalId: "principal-a", principalScopes: [] };
    },
  }, async (port, ran) => {
    const pending = startRequestWithIncompleteBody(port, {
      method: "POST",
      path: "/secure",
      headers: { ...JSON_HEADERS, "idempotency-key": "secure-positive-control" },
      bodyPrefix: JSON.stringify({ password: "synthetic-only" }),
    });
    const waitStartedAt = Date.now();
    while (requestContext === undefined && Date.now() - waitStartedAt < 1000) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    assert.ok(requestContext, "server should resolve identity while the body is incomplete");
    assert.equal(requestContext.path, "/secure");
    pending.finish();
    const res = await pending.response;
    assert.equal(res.status, 200, res.body);
    assert.equal(ran.value, true);
  });
});

test("authorization resolvers receive frozen request metadata without stream or socket access", async () => {
  const seen = [];
  await withSecureServer({
    resolveChannelVerdict(context, phase) {
      seen.push({ context, phase, resolver: "channel", receiver: this });
      return Verdict.ALLOW;
    },
    resolvePrincipal(context, phase) {
      seen.push({ context, phase, resolver: "principal" });
      return { principalId: "principal-a", principalScopes: [] };
    },
  }, async (port, ran) => {
    const res = await request(port, {
      method: "POST",
      path: "/secure",
      headers: { ...JSON_HEADERS, "idempotency-key": "metadata-resolver-test" },
      body: JSON.stringify({ password: "synthetic-only" }),
    });
    assert.equal(res.status, 200, res.body);
    assert.equal(ran.value, true);
  });

  assert.equal(seen.length, 4);
  assert.deepEqual(seen.map(({ resolver, phase }) => `${resolver}:${phase}`), [
    "channel:preflight", "principal:preflight", "channel:dispatch", "principal:dispatch",
  ]);
  for (const { context } of seen) {
    assert.equal(Object.isFrozen(context), true);
    assert.equal(context.method, "POST");
    assert.equal(context.path, "/secure");
    assert.equal(typeof context.headers["content-type"], "string");
    assert.equal(Object.isFrozen(context.headers), true);
    for (const forbidden of ["read", "on", "pause", "resume", "pipe", "socket", "rawHeaders"]) {
      assert.equal(forbidden in context, false, `resolver context must not expose ${forbidden}`);
    }
  }
  assert.equal(seen.every(({ context }) => context === seen[0].context), true,
    "preflight and dispatch must share the same immutable request snapshot");
  assert.equal(seen.filter(({ resolver }) => resolver === "channel")
    .every(({ receiver }) => receiver === undefined), true,
  "channel resolver must not receive the privileged server options as its this receiver");
});

test("resolver and kernel observe the same frozen, null-prototype query snapshot", async () => {
  const poisonKey = "rd1413InheritedQueryProbe";
  let requestContext;
  let kernelRequest;
  const ran = { value: false };
  const coreKernel = buildSecureKernel(ran);
  const kernel = {
    preflightAuthorization: (request) => coreKernel.preflightAuthorization(request),
    async handle(request) {
      kernelRequest = request;
      return coreKernel.handle(request);
    },
  };
  const server = createApiServer({
    kernel,
    allowInsecureLoopback: true,
    resolveChannelVerdict(context, phase) {
      requestContext = context;
      if (phase === "preflight") {
        Object.defineProperty(Object.prototype, poisonKey, {
          configurable: true,
          value: "inherited-poison",
        });
      }
      return Verdict.ALLOW;
    },
    resolvePrincipal: () => ({ principalId: "principal-a", principalScopes: [] }),
  });
  const { port } = await listen(server, 0);
  try {
    const res = await request(port, {
      method: "POST",
      path: "/secure?known=present",
      headers: { ...JSON_HEADERS, "idempotency-key": "query-snapshot-test" },
      body: JSON.stringify({ password: "synthetic-only" }),
    });
    assert.equal(res.status, 200, res.body);
    assert.equal(ran.value, true);
    assert.equal(Object.getPrototypeOf(requestContext), null);
    assert.equal(Object.getPrototypeOf(requestContext.query), null);
    assert.equal(Object.isFrozen(requestContext.query), true);
    assert.equal(requestContext[poisonKey], undefined);
    assert.equal(requestContext.query[poisonKey], undefined);
    assert.equal(kernelRequest.query, requestContext.query);
    assert.equal(Object.getPrototypeOf(kernelRequest.query), null);
    assert.equal(kernelRequest.query[poisonKey], undefined);
    assert.deepEqual({ ...kernelRequest.query }, { known: "present" });
  } finally {
    delete Object.prototype[poisonKey];
    await new Promise((resolve) => server.close(() => resolve(undefined)));
  }
});

test("authorization is re-resolved after body buffering before protected dispatch", async () => {
  let currentChannelVerdict = Verdict.ALLOW;
  let incomingRequest;
  const phases = [];
  await withSecureServer({
    resolveChannelVerdict(_context, phase) {
      phases.push(phase);
      return currentChannelVerdict;
    },
    resolvePrincipal(context) {
      incomingRequest = context;
      return { principalId: "principal-a", principalScopes: [] };
    },
  }, async (port, ran) => {
    const pending = startRequestWithIncompleteBody(port, {
      method: "POST",
      path: "/secure",
      headers: { ...JSON_HEADERS, "idempotency-key": "revalidate-after-body" },
      bodyPrefix: JSON.stringify({ password: "synthetic-only" }),
    });
    const waitStartedAt = Date.now();
    while ((incomingRequest === undefined || phases.length === 0) && Date.now() - waitStartedAt < 1000) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    assert.ok(incomingRequest, "preflight should resolve while the body is incomplete");
    await new Promise((resolve) => setImmediate(resolve));
    currentChannelVerdict = Verdict.DENY;
    pending.finish();
    const res = await pending.response;
    assert.equal(res.status, 401);
    assert.equal(ran.value, false);
  });

  assert.equal(incomingRequest.path, "/secure");
  assert.deepEqual(phases, ["preflight", "dispatch"]);
});

test("route method is snapshotted before body buffering and reused for dispatch", async () => {
  let requestContext;
  let mutationWasRefused = false;
  const seen = [];
  const coreKernel = createAppKernel({
    routes: [
      { method: "GET", path: "/mutable-method", handler: "protected" },
      {
        method: "POST", path: "/mutable-method", handler: "public",
        requestType: "Input", auth: { mode: "public" },
      },
    ],
    requestValidators: {
      Input(value) {
        return value !== null && typeof value === "object" && !Array.isArray(value)
          && typeof value.password === "string";
      },
    },
    dispatch: {
      protected: () => ({ status: 200, body: { route: "protected" } }),
      public: () => ({ status: 200, body: { route: "public" } }),
    },
  });
  const kernel = {
    preflightAuthorization: (request) => coreKernel.preflightAuthorization(request),
    async handle(request) {
      seen.push({ method: request.method, bodyLength: request.body.byteLength });
      return coreKernel.handle(request);
    },
  };
  const server = createApiServer({
    kernel,
    allowInsecureLoopback: true,
    resolveChannelVerdict(context) {
      requestContext = context;
      if (context.method === "POST") {
        mutationWasRefused = Reflect.set(context, "method", "GET") === false;
      }
      return undefined;
    },
  });
  const { port } = await listen(server, 0);
  try {
    const pending = startRequestWithIncompleteBody(port, {
      method: "POST",
      path: "/mutable-method",
      headers: { ...JSON_HEADERS, "idempotency-key": "stable-method-test" },
      bodyPrefix: JSON.stringify({ password: "synthetic-only" }),
    });
    const waitStartedAt = Date.now();
    while (requestContext === undefined && Date.now() - waitStartedAt < 1000) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    assert.ok(requestContext, "body buffering follows the POST route preflight");
    pending.finish();
    const res = await pending.response;
    assert.equal(res.status, 200, res.body);
    assert.deepEqual(seen, [{ method: "POST", bodyLength: 1024 }]);
    assert.equal(res.body, JSON.stringify({ route: "public" }));
    assert.equal(mutationWasRefused, true);
  } finally {
    await new Promise((resolve) => server.close(() => resolve(undefined)));
  }
});

test("channel verdict INDETERMINATE (0) → 401 (fail-closed), handler NOT run", async () => {
  await withSecureServer({ resolveChannelVerdict: () => Verdict.INDETERMINATE }, async (port, ran) => {
    const res = await request(port, { method: "GET", path: "/secure" });
    assert.equal(res.status, 401);
    assert.equal(ran.value, false);
  });
});

test("channel verdict ALLOW (+1) without a principal identity → 401", async () => {
  await withSecureServer({ resolveChannelVerdict: () => Verdict.ALLOW }, async (port, ran) => {
    const res = await request(port, { method: "GET", path: "/secure" });
    assert.equal(res.status, 401);
    assert.equal(ran.value, false);
  });
});

test("channel ALLOW plus exact trusted principal evidence admits", async () => {
  await withSecureServer({
    resolveChannelVerdict: () => Verdict.ALLOW,
    resolvePrincipal: () => ({ principalId: "principal-a", principalScopes: [] }),
  }, async (port, ran) => {
    const res = await request(port, { method: "GET", path: "/secure" });
    assert.equal(res.status, 200);
    assert.equal(ran.value, true);
    assert.deepEqual(JSON.parse(res.body), { ok: true });
  });
});

test("principal resolver accessors are refused without execution", async () => {
  let getterCalls = 0;
  const hostile = {};
  Object.defineProperty(hostile, "principalId", {
    enumerable: true,
    get() { getterCalls += 1; return "attacker"; },
  });
  await withSecureServer({
    resolveChannelVerdict: () => Verdict.ALLOW,
    resolvePrincipal: () => hostile,
  }, async (port, ran) => {
    const res = await request(port, { method: "GET", path: "/secure" });
    assert.equal(res.status, 401);
    assert.equal(ran.value, false);
    assert.equal(getterCalls, 0);
  });
});

test("a THROWING channel-verdict resolver → 401 (fail-closed to DENY), handler NOT run", async () => {
  await withSecureServer({
    resolveChannelVerdict: () => { throw new Error("peer-cert extraction failed"); },
  }, async (port, ran) => {
    const res = await request(port, { method: "GET", path: "/secure" });
    assert.equal(res.status, 401);
    assert.equal(ran.value, false);
  });
});

test("no resolver configured → unchanged header path (no auth header → 401)", async () => {
  await withSecureServer({}, async (port, ran) => {
    const res = await request(port, { method: "GET", path: "/secure" });
    assert.equal(res.status, 401); // kernel's own auth path: missing Authorization → 401
    assert.equal(ran.value, false);
  });
});

test("resolver returns undefined + header present → 401 (tightened: header presence is not authentication)", async () => {
  await withSecureServer({ resolveChannelVerdict: () => undefined }, async (port, ran) => {
    const res = await request(port, {
      method: "GET",
      path: "/secure",
      headers: { authorization: "Bearer tok" },
    });
    // Tightened default (owner 2026-06-23): with no channel verdict supplied, a required-auth route
    // does NOT admit on mere Authorization-header presence — the channel/identity verdict is the auth
    // signal. (A route may opt back into the legacy presence-only behaviour via allowHeaderPresenceFallback.)
    assert.equal(res.status, 401);
    assert.equal(ran.value, false);
  });
});

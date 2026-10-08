import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { createAppKernel } from "../dist/index.js";

const decoder = new TextDecoder();

function request() {
  return {
    method: "GET",
    path: "/sync-deadline",
    headers: {},
    body: new Uint8Array(0),
    query: {},
    requestId: "rd1414-sync-deadline",
    receivedAt: 0,
  };
}

function blockFor(milliseconds) {
  const startedAt = performance.now();
  while (performance.now() - startedAt < milliseconds) {
    // Deliberately occupy this JavaScript thread to characterize a non-cooperative handler.
  }
}

function secretKernel(dispatch, provider) {
  return createAppKernel({
    routes: [{
      method: "GET",
      path: "/sync-deadline",
      handler: "readSecret",
      auth: { mode: "public" },
      secrets: { require: ["test.secret"] },
      limits: { timeoutMs: 5 },
    }],
    dispatch: { readSecret: dispatch },
    secretsProvider: provider,
  });
}

test("a synchronous handler that returns after its deadline is refused", async () => {
  const kernel = createAppKernel({
    routes: [{
      method: "GET",
      path: "/sync-deadline",
      handler: "block",
      auth: { mode: "public" },
      limits: { timeoutMs: 5 },
    }],
    dispatch: { block: () => { blockFor(30); return { body: { ok: true } }; } },
  });

  const response = await kernel.handle(request());
  assert.equal(response.status, 504);
  assert.equal(JSON.parse(decoder.decode(response.body)).error, "deadline_exceeded");
});

test("a handler cannot replace AbortController.abort and strand timeout settlement", async () => {
  const child = spawnSync(process.execPath, ["--input-type=module", "-e", `
    import { createAppKernel } from "./dist/index.js";
    const originalAbort = AbortController.prototype.abort;
    const request = { method: "GET", path: "/sync-deadline", headers: {}, body: new Uint8Array(0), query: {}, requestId: "abort-poison", receivedAt: 0 };
    const kernel = createAppKernel({
      routes: [{ method: "GET", path: "/sync-deadline", handler: "replaceAbortAndNeverSettle", auth: { mode: "public" }, limits: { timeoutMs: 5 } }],
      dispatch: { replaceAbortAndNeverSettle: () => { AbortController.prototype.abort = function () { throw new Error("poisoned abort"); }; return new Promise(() => undefined); } },
    });
    const response = await Promise.race([kernel.handle(request), new Promise((resolve) => setTimeout(() => resolve(undefined), 50))]);
    AbortController.prototype.abort = originalAbort;
    process.stdout.write(JSON.stringify(response === undefined ? null : { status: response.status, error: JSON.parse(new TextDecoder().decode(response.body)).error }));
  `], { cwd: fileURLToPath(new URL("../", import.meta.url)), encoding: "utf8", timeout: 2_000 });

  assert.equal(child.error, undefined);
  assert.equal(child.status, 0, `isolated poison probe must exit normally: ${child.stderr}`);
  assert.deepEqual(JSON.parse(child.stdout), { status: 504, error: "deadline_exceeded" });
});

test("response serialization that crosses the deadline cannot publish success", async () => {
  let capturedGetSecret;
  let providerUses = 0;
  let consumerCalled = false;
  const kernel = secretKernel(({ getSecret }) => {
    capturedGetSecret = getSecret;
    return {
      body: {
        toJSON() {
          capturedGetSecret("test.secret", () => { consumerCalled = true; });
          blockFor(30);
          return { ok: true };
        },
      },
    };
  }, {
    has: () => true,
    use: (_name, callback) => {
      providerUses += 1;
      callback(new Uint8Array([0x5a]));
    },
  });

  const response = await kernel.handle(request());
  assert.equal(response.status, 504);
  assert.equal(JSON.parse(decoder.decode(response.body)).error, "deadline_exceeded");
  assert.equal(providerUses, 0);
  assert.equal(consumerCalled, false);
});

test("response serialization failure after the deadline remains a timeout refusal", async () => {
  const kernel = createAppKernel({
    routes: [{
      method: "GET",
      path: "/sync-deadline",
      handler: "serializeLateThenThrow",
      auth: { mode: "public" },
      limits: { timeoutMs: 5 },
    }],
    dispatch: {
      serializeLateThenThrow: () => ({
        body: {
          toJSON() {
            blockFor(30);
            throw new Error("serialization failed after deadline");
          },
        },
      }),
    },
  });

  const response = await kernel.handle(request());
  assert.equal(response.status, 504);
  assert.equal(JSON.parse(decoder.decode(response.body)).error, "deadline_exceeded");
});

test("response size uses the typed-array intrinsic without invoking an own byteLength getter", async () => {
  const body = new Uint8Array([0x41]);
  let getterCalled = false;
  Object.defineProperty(body, "byteLength", {
    configurable: true,
    get() {
      getterCalled = true;
      blockFor(30);
      return 1;
    },
  });
  const kernel = createAppKernel({
    routes: [{
      method: "GET",
      path: "/sync-deadline",
      handler: "returnTypedArray",
      auth: { mode: "public" },
      // This test is about the intrinsic byteLength read, not timer scheduling under suite load.
      limits: { timeoutMs: 250 },
    }],
    dispatch: { returnTypedArray: () => ({ body }) },
  });

  const response = await kernel.handle(request());
  assert.equal(response.status, 200);
  assert.equal(getterCalled, false);
});

test("an own typed-array byteLength getter cannot conceal an over-budget response", async () => {
  const body = new Uint8Array(16);
  Object.defineProperty(body, "byteLength", {
    configurable: true,
    get: () => 1,
  });
  const kernel = createAppKernel({
    routes: [{
      method: "GET",
      path: "/sync-deadline",
      handler: "returnOversizedTypedArray",
      auth: { mode: "public" },
      limits: { timeoutMs: 1_000, memoryBytes: 4 },
    }],
    dispatch: { returnOversizedTypedArray: () => ({ body }) },
  });

  const response = await kernel.handle(request());
  assert.equal(response.status, 503);
  assert.equal(JSON.parse(decoder.decode(response.body)).error, "resource_limit_exceeded");
});

test("deadline refusal takes precedence when a blocking body getter also exceeds the response budget", async () => {
  const result = {};
  Object.defineProperty(result, "body", {
    get() {
      blockFor(30);
      return new Uint8Array(16);
    },
  });
  const kernel = createAppKernel({
    routes: [{
      method: "GET",
      path: "/sync-deadline",
      handler: "slowOversizedBody",
      auth: { mode: "public" },
      limits: { timeoutMs: 5, memoryBytes: 4 },
    }],
    dispatch: { slowOversizedBody: () => result },
  });

  const response = await kernel.handle(request());
  assert.equal(response.status, 504);
  assert.equal(JSON.parse(decoder.decode(response.body)).error, "deadline_exceeded");
});

test("deadline arbitration ignores a handler-installed AbortSignal aborted getter", async () => {
  let signal;
  let getterCalls = 0;
  let consumerCalls = 0;
  const kernel = secretKernel(({ getSecret: acquire, deadlineSignal }) => {
    signal = deadlineSignal;
    acquire("test.secret", () => { consumerCalls += 1; });
    return { body: { ok: true } };
  }, {
    has: () => true,
    use: (_name, callback) => {
      callback(new Uint8Array([0x41, 0x42]));
      Object.defineProperty(signal, "aborted", {
        configurable: true,
        get() {
          getterCalls += 1;
          return false;
        },
      });
    },
  });

  const response = await kernel.handle(request());
  assert.equal(response.status, 200);
  assert.equal(getterCalls, 0, "deadline decision must use kernel-private state, not handler-controlled signal properties");
  assert.equal(consumerCalls, 1);
});

test("a handler cannot replace Reflect.apply to bypass intrinsic response sizing", async () => {
  const body = new Uint8Array(16);
  Object.defineProperty(body, "byteLength", {
    configurable: true,
    get: () => 1,
  });
  const originalApply = Reflect.apply;
  let response;
  try {
    const kernel = createAppKernel({
      routes: [{
        method: "GET",
        path: "/sync-deadline",
        handler: "poisonReflectApply",
        auth: { mode: "public" },
        limits: { timeoutMs: 1_000, memoryBytes: 4 },
      }],
      dispatch: {
        poisonReflectApply: () => {
          Reflect.apply = () => 1;
          return { body };
        },
      },
    });
    response = await kernel.handle(request());
  } finally {
    Reflect.apply = originalApply;
  }

  assert.equal(response.status, 503);
  assert.equal(JSON.parse(decoder.decode(response.body)).error, "resource_limit_exceeded");
});

test("response encoding enforces the private route budget despite handler mutation", async () => {
  const kernel = createAppKernel({
    routes: [{
      method: "GET",
      path: "/sync-deadline",
      handler: "mutateBudgetDuringEncoding",
      auth: { mode: "public" },
      limits: { timeoutMs: 1_000, memoryBytes: 4 },
    }],
    dispatch: {
      mutateBudgetDuringEncoding: ({ policy }) => ({
        get body() {
          policy.limits.memoryBytes = Number.POSITIVE_INFINITY;
          return new Uint8Array(16);
        },
      }),
    },
  });

  const response = await kernel.handle(request());
  assert.equal(response.status, 503);
  assert.equal(JSON.parse(decoder.decode(response.body)).error, "resource_limit_exceeded");
});

test("published typed-array bytes are stable against handler microtasks", async () => {
  const buffer = new ArrayBuffer(1, { maxByteLength: 16 });
  const body = new Uint8Array(buffer);
  body[0] = 0x41;
  const kernel = createAppKernel({
    routes: [{
      method: "GET",
      path: "/sync-deadline",
      handler: "queueBodyMutation",
      auth: { mode: "public" },
      limits: { timeoutMs: 1_000, memoryBytes: 4 },
    }],
    dispatch: {
      queueBodyMutation: () => ({
        get body() {
          queueMicrotask(() => {
            body[0] = 0x42;
            buffer.resize(16);
          });
          return body;
        },
      }),
    },
  });

  const response = await kernel.handle(request());
  assert.equal(response.status, 200);
  assert.equal(response.body.byteLength, 1);
  assert.equal(response.body[0], 0x41);
});

test("serialization cannot replace the monotonic clock used for deadline arbitration", async () => {
  const descriptor = Object.getOwnPropertyDescriptor(performance, "now");
  const kernel = createAppKernel({
    routes: [{
      method: "GET",
      path: "/sync-deadline",
      handler: "replaceClockDuringSerialization",
      auth: { mode: "public" },
      limits: { timeoutMs: 5 },
    }],
    dispatch: {
      replaceClockDuringSerialization: () => ({
        body: {
          toJSON() {
            blockFor(30);
            performance.now = () => 0;
            return { ok: true };
          },
        },
      }),
    },
  });

  try {
    const response = await kernel.handle(request());
    assert.equal(response.status, 504);
    assert.equal(JSON.parse(decoder.decode(response.body)).error, "deadline_exceeded");
  } finally {
    if (descriptor === undefined) delete performance.now;
    else Object.defineProperty(performance, "now", descriptor);
  }
});

test("public handle re-arbitrates after the internal pipeline await", async () => {
  const kernel = createAppKernel({
    routes: [{
      method: "GET",
      path: "/sync-deadline",
      handler: "queuePublicReturnDelay",
      auth: { mode: "public" },
      limits: { timeoutMs: 5 },
    }],
    dispatch: {
      queuePublicReturnDelay: () => ({
        get body() {
          queueMicrotask(() => blockFor(30));
          return new Uint8Array([0x41]);
        },
      }),
    },
  });

  const response = await kernel.handle(request());
  assert.equal(response.status, 504);
  assert.equal(JSON.parse(decoder.decode(response.body)).error, "deadline_exceeded");
});

test("handler-installed audit getters are not invoked after the publication deadline check", async () => {
  let getterCalls = 0;
  const kernel = createAppKernel({
    routes: [{
      method: "GET",
      path: "/sync-deadline",
      handler: "replaceAuditRequestId",
      auth: { mode: "public" },
      limits: { timeoutMs: 10 },
    }],
    dispatch: {
      replaceAuditRequestId: ({ request: req }) => {
        Object.defineProperty(req, "requestId", {
          configurable: true,
          get() {
            getterCalls += 1;
            blockFor(40);
            return "handler-controlled-request-id";
          },
        });
        return { body: { ok: true } };
      },
    },
  });

  const response = await kernel.handle(request());
  assert.equal(response.status, 200);
  assert.equal(getterCalls, 0, "audit metadata must use a pre-dispatch snapshot");
});

test("audit timestamps do not execute a handler-replaced Date.now callback", async () => {
  const originalNow = Date.now;
  let poisonedCalls = 0;
  const kernel = createAppKernel({
    routes: [{
      method: "GET",
      path: "/sync-deadline",
      handler: "replaceDateNow",
      auth: { mode: "public" },
      limits: { timeoutMs: 1_000 },
    }],
    dispatch: {
      replaceDateNow: () => {
        Date.now = () => {
          poisonedCalls += 1;
          blockFor(40);
          return originalNow();
        };
        return { body: { ok: true } };
      },
    },
  });

  try {
    const response = await kernel.handle(request());
    assert.equal(response.status, 200);
    assert.equal(poisonedCalls, 0, "audit construction must call the captured clock, not handler code");
  } finally {
    Date.now = originalNow;
  }
});

test("a synchronous handler cannot acquire a secret after its deadline", async () => {
  let providerUses = 0;
  let signal;
  const kernel = secretKernel(({ getSecret, deadlineSignal }) => {
    signal = deadlineSignal;
    blockFor(30);
    getSecret("test.secret", () => undefined);
    return { body: { ok: true } };
  }, {
    has: () => true,
    use: (_name, callback) => {
      providerUses += 1;
      callback(new Uint8Array([0x5a]));
    },
  });

  const response = await kernel.handle(request());
  assert.equal(response.status, 504);
  assert.equal(JSON.parse(decoder.decode(response.body)).error, "deadline_exceeded");
  assert.equal(signal.aborted, true);
  assert.equal(providerUses, 0);
});

test("a provider that crosses the deadline cannot deliver plaintext to the consumer", async () => {
  let providerUses = 0;
  let consumerCalled = false;
  const providerBytes = new Uint8Array([0x5a]);
  const kernel = secretKernel(({ getSecret }) => {
    getSecret("test.secret", (view) => {
      consumerCalled = true;
      assert.deepEqual([...view], [0x5a]);
    });
    return { body: { ok: true } };
  }, {
    has: () => true,
    use: (_name, callback) => {
      providerUses += 1;
      blockFor(30);
      callback(providerBytes);
    },
  });

  const response = await kernel.handle(request());
  assert.equal(response.status, 504);
  assert.equal(JSON.parse(decoder.decode(response.body)).error, "deadline_exceeded");
  assert.equal(providerUses, 1, "the provider was entered before the synchronous deadline overrun");
  assert.equal(consumerCalled, false, "no consumer receives bytes after the deadline has expired");
  assert.deepEqual([...providerBytes], [0x5a], "cleanup does not mutate provider-owned bytes");
});

test("a provider that blocks after staging cannot deliver plaintext past the deadline", async () => {
  let consumerCalled = false;
  const providerBytes = new Uint8Array([0x6b]);
  const kernel = secretKernel(({ getSecret }) => {
    getSecret("test.secret", () => { consumerCalled = true; });
    return { body: { ok: true } };
  }, {
    has: () => true,
    use: (_name, callback) => {
      callback(providerBytes);
      blockFor(30);
    },
  });

  const response = await kernel.handle(request());
  assert.equal(response.status, 504);
  assert.equal(JSON.parse(decoder.decode(response.body)).error, "deadline_exceeded");
  assert.equal(consumerCalled, false, "the staged bytes remain withheld until provider completion and deadline arbitration");
  assert.deepEqual([...providerBytes], [0x6b]);
});

test("a late synchronous throw after deadline releases its in-flight slot", async () => {
  let calls = 0;
  const kernel = createAppKernel({
    routes: [{
      method: "GET",
      path: "/sync-deadline",
      handler: "blockThenThrow",
      auth: { mode: "public" },
      limits: { timeoutMs: 5, maxConcurrent: 1 },
    }],
    dispatch: {
      blockThenThrow: () => {
        calls += 1;
        if (calls === 1) {
          blockFor(30);
          throw new Error("late synchronous failure");
        }
        return { body: { ok: true } };
      },
    },
  });

  const timedOut = await kernel.handle(request());
  assert.equal(timedOut.status, 504);
  const recovered = await kernel.handle(request());
  assert.equal(recovered.status, 200);
  assert.equal(calls, 2, "the next request must reach dispatch after synchronous throw cleanup");
});

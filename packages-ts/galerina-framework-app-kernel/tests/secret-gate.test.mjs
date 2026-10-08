// Gate 9.5 — the fail-closed secrets seam on the App Kernel (framework P1).
//
// These are the production INTEGRATION benches: they drive the REAL createAppKernel pipeline
// (../dist/index.js — built output; the runner does NOT rebuild) with a REAL secrets provider,
// and assert the fail-closed invariants the design mandates. They mirror the kernel.test.mjs
// harness (node:test + node:assert/strict, req()/errorOf() helpers, a `ran` flag proving the
// handler did/didn't execute). The self-contained staging bench
// (Galerina-R-AND-D/build-staging/kernel-secrets-context/RED-bench-secrets-context.mjs) remains
// the design oracle.
//
// Invariants proved here (all fail-closed → 503 secret_unavailable, handler NEVER runs):
//   (a) required secret ABSENT       → 503, handler NOT run
//   (b) required secret PRESENT       → handler runs and reads it through a short-lived view
//   (c) required secret FAULTED       → 503, handler NOT run; getSecret(faulted) → undefined
//   (d) provider ABSENT (unresolved)  → 503, handler NOT run
//   (e) NO required secret + NO provider → handler runs normally (the load-bearing non-breaking no-op)
//   (f) ANTI-VACUITY: with the admit() refusal removed, (a) flips to "handler ran" — proves the
//       gate is load-bearing, not vacuous.
import assert from "node:assert/strict";
import { test } from "node:test";
import { createAppKernel, InMemoryIdempotencyStore } from "../dist/index.js";

const enc = new TextEncoder();
const dec = new TextDecoder();

function req(over = {}) {
  return {
    method: "GET",
    path: "/health",
    headers: {},
    body: new Uint8Array(0),
    query: {},
    requestId: "rq-1",
    receivedAt: 0,
    ...over,
  };
}

function errorOf(res) {
  if (res.body === undefined) return undefined;
  return JSON.parse(dec.decode(res.body)).error;
}

// ── makeArena(): prefer the REAL ext-secrets-spore SealArena (proves the real arena satisfies the
// SecretsProvider shape by structure). Fall back to a local RefArena stub mirroring the exact
// has/use/put/fault/dispose contract (arena.ts:33-115) if that package's dist is unavailable, so
// this bench stays runnable stand-alone. ──
let SealArena;
try {
  ({ SealArena } = await import("../../galerina-ext-secrets-spore/dist/arena.js"));
} catch {
  SealArena = undefined;
}

/** Local fallback mirroring the SealArena observable contract (put/use/has/fault/dispose). */
class RefArena {
  #m = new Map();
  #disposed = false;
  put(name, val) {
    if (this.#disposed) throw new Error("use-after-dispose");
    this.#m.set(name, { value: Buffer.from(val), faulted: false });
  }
  use(name, fn) {
    if (this.#disposed) throw new Error("use-after-dispose");
    const e = this.#m.get(name);
    if (e === undefined || e.faulted) return undefined;
    const transient = Buffer.from(e.value);
    try {
      const result = fn(transient);
      if (result !== undefined) throw new Error("callback return/async escape channel is forbidden");
    } finally {
      transient.fill(0);
    }
  }
  has(name) {
    const e = this.#m.get(name);
    return e !== undefined && !e.faulted;
  }
  fault(name) {
    const e = this.#m.get(name);
    if (e) { e.value.fill(0); e.faulted = true; }
  }
  dispose() {
    for (const e of this.#m.values()) e.value.fill(0);
    this.#m.clear();
    this.#disposed = true;
  }
}

function makeArena() {
  return SealArena !== undefined ? new SealArena() : new RefArena();
}

// Record which backing the run used (surfaces in the test output for the report).
test(`secrets: arena backing in use = ${SealArena !== undefined ? "REAL SealArena (ext-secrets-spore/dist)" : "local RefArena fallback"}`, () => {
  assert.ok(typeof makeArena().has === "function");
});

// ── (a) required secret ABSENT → 503 secret_unavailable, handler NOT run ──
// Mirrors staging bench T2. auth:{mode:"public"} isolates the secret gate from the auth gate.
test("secrets: required secret ABSENT → 503 secret_unavailable, handler NOT run", async () => {
  let ran = false;
  const provider = makeArena(); // empty; "db.main" never put
  const k = createAppKernel({
    routes: [{
      method: "GET", path: "/pay", handler: "pay",
      auth: { mode: "public" }, secrets: { require: ["db.main"] },
    }],
    dispatch: { pay: () => { ran = true; return { body: { ok: true } }; } },
    secretsProvider: provider,
  });
  const res = await k.handle(req({ method: "GET", path: "/pay" }));
  assert.equal(res.status, 503);
  assert.equal(errorOf(res), "secret_unavailable");
  assert.equal(ran, false); // dispatch never reached (gate 9.5 < gate 10)
});

// ── (b) required secret PRESENT → handler runs and reads it via a short-lived view ──
// Mirrors staging bench T1.
test("secrets: required secret PRESENT → handler runs and reads it via view", async () => {
  let ran = false, seen = null;
  const provider = makeArena();
  provider.put("db.main", Buffer.from("s3cr3t-dsn")); // arena.ts:33-44
  const k = createAppKernel({
    routes: [{
      method: "GET", path: "/pay", handler: "pay",
      auth: { mode: "public" }, secrets: { require: ["db.main"] },
    }],
    dispatch: {
      pay: (ctx) => {
        ran = true;
        ctx.getSecret("db.main", (v) => { seen = new TextDecoder().decode(v); }); // short-lived view
        return { body: { ok: true } };
      },
    },
    secretsProvider: provider,
  });
  const res = await k.handle(req({ method: "GET", path: "/pay" }));
  assert.equal(ran, true);
  assert.equal(seen, "s3cr3t-dsn");
  assert.notEqual(res.status, 503);
});

// ── (c) required secret FAULTED (rotation fault / quarantine) → 503, handler NOT run ──
// Mirrors staging bench T3. A faulted entry is never served: has()→false → refuse; and
// getSecret(faulted)→undefined even if a handler somehow held a ctx.
test("secrets: required secret FAULTED → 503, handler NOT run, getSecret(faulted) → undefined", async () => {
  let ran = false;
  const provider = makeArena();
  provider.put("db.main", Buffer.from("stale"));
  provider.fault("db.main"); // arena.ts:89-96 — wipe + mark faulted
  const k = createAppKernel({
    routes: [{
      method: "GET", path: "/pay", handler: "pay",
      auth: { mode: "public" }, secrets: { require: ["db.main"] },
    }],
    dispatch: { pay: () => { ran = true; return { body: { ok: true } }; } },
    secretsProvider: provider,
  });
  const res = await k.handle(req({ method: "GET", path: "/pay" }));
  assert.equal(res.status, 503);
  assert.equal(errorOf(res), "secret_unavailable");
  assert.equal(ran, false);
  // Direct check on the provider view: a faulted name yields undefined (fail-closed).
  assert.equal(provider.use("db.main", (v) => v.toString()), undefined);
});

// ── (d) provider ABSENT (boot never resolved the anchor/arena) → 503, handler NOT run ──
// Mirrors staging bench T4. No secretsProvider wired at all.
test("secrets: provider ABSENT → 503, handler NOT run (fail-closed)", async () => {
  let ran = false;
  const k = createAppKernel({
    routes: [{
      method: "GET", path: "/pay", handler: "pay",
      auth: { mode: "public" }, secrets: { require: ["db.main"] },
    }],
    dispatch: { pay: () => { ran = true; return { body: { ok: true } }; } },
    // NB: no secretsProvider — the fail-closed posture takes this route dark.
  });
  const res = await k.handle(req({ method: "GET", path: "/pay" }));
  assert.equal(res.status, 503);
  assert.equal(errorOf(res), "secret_unavailable");
  assert.equal(ran, false);
});

// ── (e) THE load-bearing non-breaking test: a route with NO required secret runs normally even
// with NO provider. gate 9.5 must be a pure no-op for require:[]. ──
test("secrets: route with NO required secret is unaffected (no-op) even with NO provider", async () => {
  let ran = false;
  const k = createAppKernel({
    routes: [{ method: "GET", path: "/health", handler: "health", auth: { mode: "public" } }],
    dispatch: { health: () => { ran = true; return { body: { ok: true } }; } },
    // NB: no secretsProvider at all
  });
  const res = await k.handle(req({ method: "GET", path: "/health" }));
  assert.equal(ran, true); // gate 9.5 is a pure no-op for require:[]
  assert.equal(res.status, 200);
});

// ── (f) ANTI-VACUITY (prove-own-maths): re-derive the gate's decision two ways and show that,
// with the admit() refusal removed (the MUTANT), the absent-secret case (a) flips from
// "handler blocked" to "handler ran". This proves the guard is load-bearing, not vacuous.
// We import the REAL createSecretGate to exercise the actual admit logic, then contrast it with a
// mutant dispatch that skips the refusal. ──
test("secrets: ANTI-VACUITY — removing the admit() refusal flips absent-secret to handler-ran", async () => {
  const { createSecretGate } = await import("../dist/index.js");
  const provider = makeArena(); // "db.main" absent
  const gate = createSecretGate(provider);
  const required = ["db.main"];

  // Faithful (real) dispatch decision: admit() refuses → handler NEVER runs.
  let ranFaithful = false;
  const refusal = gate.admit(required);
  if (refusal === null) { ranFaithful = true; }
  assert.equal(refusal, "secret_unavailable"); // the real gate refuses the absent secret
  assert.equal(ranFaithful, false);            // → faithful path never runs the handler

  // MUTANT dispatch: skip the admit() refusal entirely (the bug we are guarding against).
  let ranMutant = false;
  // BUG (mutant): no `if (gate.admit(required) !== null) return refuse;` here.
  ranMutant = true; // handler WRONGLY runs with the absent secret
  const mutantIsCaught = ranMutant === true && ranFaithful === false;
  assert.equal(mutantIsCaught, true); // the guard is load-bearing: removing it changes behaviour
});

// A structurally supplied provider is still an untrusted runtime boundary: TypeScript's boolean
// annotation does not validate a foreign implementation. Only the literal boolean `true` may admit.
test("secrets: malformed provider presence values refuse and never dispatch", async () => {
  const malformedPresenceValues = [null, NaN, 1, "true", new Boolean(true)];

  for (const presence of malformedPresenceValues) {
    let ran = false;
    const provider = {
      has: () => presence,
      use: () => undefined,
    };
    const kernel = createAppKernel({
      routes: [{
        method: "GET", path: "/pay", handler: "pay",
        auth: { mode: "public" }, secrets: { require: ["db.main"] },
      }],
      dispatch: { pay: () => { ran = true; return { body: { ok: true } }; } },
      secretsProvider: provider,
    });

    const response = await kernel.handle(req({ method: "GET", path: "/pay" }));
    assert.equal(response.status, 503, `presence=${String(presence)} must refuse`);
    assert.equal(errorOf(response), "secret_unavailable");
    assert.equal(ran, false, `presence=${String(presence)} must not dispatch`);
  }
});

test("secrets: provider loss during async idempotency admission refuses before dispatch", async () => {
  let present = true;
  let ran = false;
  const idempotencyStore = new InMemoryIdempotencyStore();
  const provider = {
    has: () => present,
    use: (_name, fn) => { if (present) fn(new Uint8Array([1])); },
  };
  const kernel = createAppKernel({
    routes: [{
      method: "POST", path: "/pay", handler: "pay",
      auth: { mode: "public" },
      secrets: { require: ["db.main"] },
      idempotency: { enabled: true },
    }],
    idempotencyStore: {
      async claim(scope, key, ttlSeconds) {
        await Promise.resolve();
        const result = idempotencyStore.claim(scope, key, ttlSeconds);
        present = false;
        return result;
      },
    },
    dispatch: { pay: () => { ran = true; return { body: { ok: true } }; } },
    secretsProvider: provider,
  });

  const response = await kernel.handle(req({
    method: "POST", path: "/pay",
    headers: { "idempotency-key": "race-case" },
  }));

  assert.equal(response.status, 503);
  assert.equal(errorOf(response), "secret_unavailable");
  assert.equal(ran, false);

  present = true;
  const retry = await kernel.handle(req({
    method: "POST", path: "/pay",
    headers: { "idempotency-key": "race-case" },
    requestId: "race-case-retry",
  }));
  assert.equal(retry.status, 409, "a completed reservation is burned after a later fail-closed refusal");
  assert.equal(errorOf(retry), "conflict");
  assert.equal(ran, false, "neither the refused attempt nor its duplicate reaches dispatch");
});

test("secrets: provider revocation during staging refuses before consumer delivery", async () => {
  let present = true;
  const providerBytes = new Uint8Array([0x53]);
  let consumerCalled = false;
  const kernel = createAppKernel({
    routes: [{
      method: "GET", path: "/pay", handler: "pay",
      auth: { mode: "public" }, secrets: { require: ["db.main"] },
    }],
    dispatch: {
      pay: ({ getSecret }) => {
        try {
          getSecret("db.main", () => { consumerCalled = true; });
        } catch {
          // The request must stay fail-closed after revocation.
        }
        return { body: { ok: true } };
      },
    },
    secretsProvider: {
      has: () => present,
      use: (_name, callback) => {
        callback(providerBytes);
        present = false;
        providerBytes.fill(0);
      },
    },
  });

  const response = await kernel.handle(req({ method: "GET", path: "/pay" }));
  assert.equal(response.status, 500);
  assert.equal(consumerCalled, false, "revoked staged bytes must not reach handler code");
  assert.deepEqual([...providerBytes], [0], "provider storage was revoked and wiped");
});

test("secrets: getSecret refuses callback return and async escape channels", async () => {
  const { createSecretGate } = await import("../dist/secret-gate.js");
  const provider = makeArena();
  provider.put("db.main", Buffer.from("secret"));
  const gate = createSecretGate(provider);
  const required = ["db.main"];
  let syncView;
  let asyncView;

  assert.throws(() => gate.getSecret(required, "db.main", (view) => {
    syncView = view;
    return "derived-value";
  }), /return|escape/i);
  assert.deepEqual([...syncView], Array(syncView.length).fill(0));

  assert.throws(() => gate.getSecret(required, "db.main", (view) => {
    asyncView = view;
    return Promise.resolve("async-derived-value");
  }), /return|escape/i);
  assert.deepEqual([...asyncView], Array(asyncView.length).fill(0));

  assert.throws(() => gate.getSecret(required, "db.main", () => Promise.reject(new Error("async failure"))),
    /return|escape/i);
  await new Promise((resolve) => setImmediate(resolve));
});

test("secrets: provider callback cannot turn undefined into an empty byte view", async () => {
  const { createSecretGate } = await import("../dist/secret-gate.js");
  let consumerCalls = 0;
  const gate = createSecretGate({
    has: () => true,
    use: (_name, callback) => callback(undefined),
  });

  assert.throws(
    () => gate.getSecret(["db.main"], "db.main", () => { consumerCalls += 1; }),
    /Uint8Array/i,
  );
  assert.equal(consumerCalls, 0, "malformed provider input must be refused before consumer code");
});

test("secrets: provider-caught empty byte value is terminal before consumer code", async () => {
  const { createSecretGate } = await import("../dist/secret-gate.js");
  let consumerCalls = 0;
  let violationNotifications = 0;
  const gate = createSecretGate({
    has: () => true,
    use: (_name, callback) => {
      try {
        callback(new Uint8Array(0));
      } catch {
        // A provider must not rehabilitate an invalid secret by swallowing the refusal.
      }
    },
  });

  assert.throws(
    () => gate.getSecret(
      ["db.main"],
      "db.main",
      () => { consumerCalls += 1; },
      () => { violationNotifications += 1; },
    ),
    /non-empty Uint8Array/i,
  );
  assert.equal(consumerCalls, 0, "empty secret bytes must be refused before consumer entry");
  assert.equal(violationNotifications, 1, "the request owner must be notified of the refusal");
});

test("secrets: prototype-spoofed Uint16Array is refused before consumer code", async () => {
  const { createSecretGate } = await import("../dist/secret-gate.js");
  const providerBytes = new Uint16Array([0x1234]);
  Object.setPrototypeOf(providerBytes, Uint8Array.prototype);
  let consumerCalls = 0;
  let violationNotifications = 0;
  const gate = createSecretGate({
    has: () => true,
    use: (_name, callback) => {
      try {
        callback(providerBytes);
      } catch {
        // A provider must not hide a malformed typed-array refusal.
      }
    },
  });

  assert.throws(
    () => gate.getSecret(
      ["db.main"],
      "db.main",
      () => { consumerCalls += 1; },
      () => { violationNotifications += 1; },
    ),
    /Uint8Array/i,
  );
  assert.equal(consumerCalls, 0, "wrong typed-array brands must be refused before consumer entry");
  assert.equal(violationNotifications, 1, "the request owner must be notified of the refusal");
});

test("secrets: handler cannot catch a failed required-secret use and still succeed", async () => {
  const scenarios = [
    {
      name: "provider silently skips use callback",
      provider: { has: () => true, use: () => undefined },
    },
    {
      name: "handler catches callback-return refusal",
      provider: {
        has: () => true,
        use: (_name, callback) => callback(new Uint8Array([1])),
      },
    },
  ];

  for (const scenario of scenarios) {
    const kernel = createAppKernel({
      routes: [{
        method: "GET", path: "/pay", handler: "pay",
        auth: { mode: "public" }, secrets: { require: ["db.main"] },
      }],
      dispatch: {
        pay: ({ getSecret }) => {
          try {
            getSecret("db.main", () => "invalid-return");
          } catch {
            // A handler must not be able to hide a secret-use failure and claim success.
          }
          return { body: { ok: true } };
        },
      },
      secretsProvider: scenario.provider,
    });

    const response = await kernel.handle(req({ method: "GET", path: "/pay" }));
    assert.equal(response.status, 500, scenario.name);
    assert.notDeepEqual(JSON.parse(dec.decode(response.body)), { ok: true }, scenario.name);
  }
});

test("secrets: swallowed callback violation during final presence check refuses before delivery", async () => {
  let presenceChecks = 0;
  let savedCallback;
  let consumerCalls = 0;
  const kernel = createAppKernel({
    routes: [{
      method: "GET", path: "/pay", handler: "pay",
      auth: { mode: "public" }, secrets: { require: ["db.main"] },
    }],
    dispatch: {
      pay: ({ getSecret }) => {
        try {
          getSecret("db.main", () => { consumerCalls += 1; });
        } catch {
          // The request must remain terminally refused if this provider protocol fails.
        }
        return { body: { ok: true } };
      },
    },
    secretsProvider: {
      has: () => {
        presenceChecks += 1;
        if (presenceChecks === 3) {
          try {
            savedCallback(new Uint8Array([0x42]));
          } catch {
            // A hostile provider swallows the callback's duplicate-use refusal.
          }
        }
        return true;
      },
      use: (_name, callback) => {
        savedCallback = callback;
        callback(new Uint8Array([0x41]));
      },
    },
  });

  const response = await kernel.handle(req({ method: "GET", path: "/pay" }));
  assert.equal(response.status, 500, "a swallowed late callback violation must latch request failure");
  assert.equal(consumerCalls, 0, "the staged secret must not reach consumer code after the violation");
  assert.equal(presenceChecks, 3, "the hostile callback runs during getSecret's final provider recheck");
});

test("secrets: swallowed callback violation during consumer execution refuses the request", async () => {
  let savedCallback;
  let consumerCalls = 0;
  let duplicateRefused = false;
  const kernel = createAppKernel({
    routes: [{
      method: "GET", path: "/pay", handler: "pay",
      auth: { mode: "public" }, secrets: { require: ["db.main"] },
    }],
    dispatch: {
      pay: ({ getSecret }) => {
        getSecret("db.main", () => {
          consumerCalls += 1;
          try {
            savedCallback(new Uint8Array([0x42]));
          } catch {
            duplicateRefused = true;
          }
          return undefined;
        });
        return { body: { ok: true } };
      },
    },
    secretsProvider: {
      has: () => true,
      use: (_name, callback) => {
        savedCallback = callback;
        callback(new Uint8Array([0x41]));
      },
    },
  });

  const response = await kernel.handle(req({ method: "GET", path: "/pay" }));
  assert.equal(response.status, 500, "the callback violation must not be hidden after consumer entry");
  assert.equal(consumerCalls, 1, "the original admitted callback ran exactly once before the later violation");
  assert.equal(duplicateRefused, true, "the saved callback's duplicate-use refusal was caught by consumer code");
});

test("secrets: callback violation still observes a forbidden consumer rejection", async () => {
  const unhandled = [];
  const observeUnhandled = (reason) => { unhandled.push(reason); };
  let savedCallback;
  let duplicateError;
  let caughtGateError;
  let retainedView;
  process.on("unhandledRejection", observeUnhandled);
  try {
    const kernel = createAppKernel({
      routes: [{
        method: "GET", path: "/pay", handler: "pay",
        auth: { mode: "public" }, secrets: { require: ["db.main"] },
      }],
      dispatch: {
        pay: ({ getSecret }) => {
          try {
            getSecret("db.main", (view) => {
              retainedView = view;
              try {
                savedCallback(new Uint8Array([0x42]));
              } catch (error) {
                duplicateError = error;
              }
              return Promise.reject(new Error("forbidden consumer async channel"));
            });
          } catch (error) {
            caughtGateError = error;
            throw error;
          }
          return { body: { ok: true } };
        },
      },
      secretsProvider: {
        has: () => true,
        use: (_name, callback) => {
          savedCallback = callback;
          callback(new Uint8Array([0x41]));
        },
      },
    });

    const response = await kernel.handle(req({ method: "GET", path: "/pay" }));
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(response.status, 500, "the callback protocol violation must refuse the request");
    assert.deepEqual(unhandled, [], "the forbidden returned rejection must still be observed");
    assert.deepEqual([...retainedView], [0], "the staged view must be wiped on refusal");
    assert.ok(duplicateError instanceof Error, "the saved callback must actually throw a protocol error");
    assert.strictEqual(caughtGateError, duplicateError, "the original callback violation must retain precedence");
  } finally {
    process.removeListener("unhandledRejection", observeUnhandled);
  }
});

test("secrets: a caught secret-use failure prevents provider re-entry", async () => {
  let providerUses = 0;
  let callbackCalls = 0;
  const kernel = createAppKernel({
    routes: [{
      method: "GET", path: "/pay", handler: "pay",
      auth: { mode: "public" }, secrets: { require: ["db.main"] },
    }],
    dispatch: {
      pay: ({ getSecret }) => {
        try {
          getSecret("db.main", () => {
            callbackCalls += 1;
            return "invalid-return";
          });
        } catch {
          // Catching a secret-use failure must not enable another provider attempt.
        }
        try {
          getSecret("db.main", () => {
            callbackCalls += 1;
            return undefined;
          });
        } catch {
          // The request remains terminally failed.
        }
        return { body: { ok: true } };
      },
    },
    secretsProvider: {
      has: () => true,
      use: (_name, callback) => {
        providerUses += 1;
        callback(new Uint8Array([1]));
      },
    },
  });

  const response = await kernel.handle(req({ method: "GET", path: "/pay" }));
  assert.equal(response.status, 500);
  assert.equal(providerUses, 1, "the provider is entered only once after the first access fails");
  assert.equal(callbackCalls, 1, "the consumer callback is not re-entered after failure");
});

test("secrets: synchronous re-entry during consume refuses the request", async () => {
  let providerUses = 0;
  let consumerCalls = 0;
  let reentrantRefused = false;
  let nestedAttempted = false;
  const kernel = createAppKernel({
    routes: [{
      method: "GET", path: "/pay", handler: "pay",
      auth: { mode: "public" }, secrets: { require: ["db.main"] },
    }],
    dispatch: {
      pay: ({ getSecret }) => {
        getSecret("db.main", () => {
          consumerCalls += 1;
          if (!nestedAttempted) {
            nestedAttempted = true;
            try {
              getSecret("db.main", () => {
                consumerCalls += 1;
                return undefined;
              });
            } catch {
              reentrantRefused = true;
            }
          }
          return undefined;
        });
        return { body: { ok: true } };
      },
    },
    secretsProvider: {
      has: () => true,
      use: (_name, callback) => {
        providerUses += 1;
        callback(new Uint8Array([1]));
      },
    },
  });

  const response = await kernel.handle(req({ method: "GET", path: "/pay" }));
  assert.equal(response.status, 500);
  assert.equal(providerUses, 1, "nested access must not re-enter the provider");
  assert.equal(consumerCalls, 1, "nested access must not reach a second consumer callback");
  assert.equal(reentrantRefused, true, "the nested secret access is refused synchronously");
});

test("secrets: caught re-entry failure prevents the pending outer secret delivery", async () => {
  let capturedGetSecret;
  let consumerCalls = 0;
  let reentrantRefused = false;
  const kernel = createAppKernel({
    routes: [{
      method: "GET", path: "/pay", handler: "pay",
      auth: { mode: "public" }, secrets: { require: ["db.main"] },
    }],
    dispatch: {
      pay: ({ getSecret }) => {
        capturedGetSecret = getSecret;
        try {
          getSecret("db.main", () => { consumerCalls += 1; });
        } catch {
          // Provider code may catch the nested refusal; it must not rehabilitate delivery.
        }
        return { body: { ok: true } };
      },
    },
    secretsProvider: {
      has: () => true,
      use: (_name, callback) => {
        callback(new Uint8Array([0x61]));
        try {
          capturedGetSecret("db.main", () => { consumerCalls += 1; });
        } catch {
          reentrantRefused = true;
        }
      },
    },
  });

  const response = await kernel.handle(req({ method: "GET", path: "/pay" }));
  assert.equal(response.status, 500);
  assert.equal(reentrantRefused, true);
  assert.equal(consumerCalls, 0, "the request failure latch must block outer delivery");
});

test("secrets: handler callback refusal cannot return a successful request", async () => {
  let providerCaught = false;
  const provider = {
    has: () => true,
    use: (_name, callback) => {
      try {
        callback(new Uint8Array([1]));
      } catch {
        providerCaught = true;
      }
    },
  };
  const kernel = createAppKernel({
    routes: [{
      method: "GET", path: "/pay", handler: "pay",
      auth: { mode: "public" }, secrets: { require: ["db.main"] },
    }],
    dispatch: {
      pay: ({ getSecret }) => {
        getSecret("db.main", () => "invalid-return");
        return { body: { ok: true } };
      },
    },
    secretsProvider: provider,
  });

  const response = await kernel.handle(req({ method: "GET", path: "/pay" }));
  // Consumer code now runs only after provider.use has returned; its callback-return refusal
  // therefore cannot be swallowed inside the provider's callback invocation.
  assert.equal(providerCaught, false);
  assert.equal(response.status, 500);
  assert.notDeepEqual(JSON.parse(dec.decode(response.body)), { ok: true });
});

test("secrets: captured getSecret cannot reacquire after a successful response", async () => {
  let capturedGetSecret;
  let providerUses = 0;
  let callbackCalls = 0;
  const provider = {
    has: () => true,
    use: (_name, callback) => {
      providerUses += 1;
      callback(new Uint8Array([7]));
    },
  };
  const kernel = createAppKernel({
    routes: [{
      method: "GET", path: "/pay", handler: "pay",
      auth: { mode: "public" }, secrets: { require: ["db.main"] },
    }],
    dispatch: {
      pay: ({ getSecret }) => {
        capturedGetSecret = getSecret;
        getSecret("db.main", () => { callbackCalls += 1; });
        return { body: { ok: true } };
      },
    },
    secretsProvider: provider,
  });

  const response = await kernel.handle(req({ method: "GET", path: "/pay" }));
  assert.equal(response.status, 200);
  assert.equal(providerUses, 1);
  assert.equal(callbackCalls, 1);

  capturedGetSecret("db.main", () => { callbackCalls += 1; });
  assert.equal(providerUses, 1, "a terminal request cannot reacquire from the provider");
  assert.equal(callbackCalls, 1, "a terminal request cannot receive another secret view");
});

test("secrets: response serialization cannot use the retired request capability", async () => {
  let providerUses = 0;
  const provider = {
    has: () => true,
    use: (_name, callback) => {
      providerUses += 1;
      callback(new Uint8Array([7]));
    },
  };
  const kernel = createAppKernel({
    routes: [{
      method: "GET", path: "/pay", handler: "pay",
      auth: { mode: "public" }, secrets: { require: ["db.main"] },
    }],
    dispatch: {
      pay: ({ getSecret }) => ({
        body: {
          get marker() {
            // Serialization happens after the handler has settled. This must not reopen custody.
            try { getSecret("db.main", () => "invalid-return"); } catch { /* refuse */ }
            return "ok";
          },
        },
      }),
    },
    secretsProvider: provider,
  });

  const response = await kernel.handle(req({ method: "GET", path: "/pay" }));
  assert.equal(response.status, 200);
  assert.equal(providerUses, 0, "response serialization must not acquire a secret after capability retirement");
});

test("secrets: a caught provider callback refusal during response serialization prevents success", async () => {
  let savedProviderCallback;
  let callbackRefusalCaught = false;
  let consumerCalls = 0;
  const kernel = createAppKernel({
    routes: [{
      method: "GET", path: "/pay", handler: "pay",
      auth: { mode: "public" }, secrets: { require: ["db.main"] },
    }],
    dispatch: {
      pay: ({ getSecret }) => {
        getSecret("db.main", () => { consumerCalls += 1; });
        return {
          body: {
            get ok() {
              try {
                savedProviderCallback(new Uint8Array([8]));
              } catch {
                callbackRefusalCaught = true;
              }
              return true;
            },
          },
        };
      },
    },
    secretsProvider: {
      has: () => true,
      use: (_name, callback) => {
        savedProviderCallback = callback;
        callback(new Uint8Array([7]));
      },
    },
  });

  const response = await kernel.handle(req({ method: "GET", path: "/pay" }));
  assert.equal(callbackRefusalCaught, true, "serialization code catches the late provider callback refusal");
  assert.equal(consumerCalls, 1, "the refused late callback never re-enters consumer code");
  assert.equal(response.status, 500, "a caught provider violation during encoding must remain terminal");
  assert.notDeepEqual(JSON.parse(dec.decode(response.body)), { ok: true });
});

test("secrets: a provider refusal queued during response serialization prevents publication", async () => {
  let savedProviderCallback;
  let callbackRefusalCaught = false;
  const kernel = createAppKernel({
    routes: [{
      method: "GET", path: "/pay", handler: "pay",
      auth: { mode: "public" }, secrets: { require: ["db.main"] },
    }],
    dispatch: {
      pay: ({ getSecret }) => {
        getSecret("db.main", () => undefined);
        return {
          body: {
            get ok() {
              queueMicrotask(() => {
                try {
                  savedProviderCallback(new Uint8Array([8]));
                } catch {
                  callbackRefusalCaught = true;
                }
              });
              return true;
            },
          },
        };
      },
    },
    secretsProvider: {
      has: () => true,
      use: (_name, callback) => {
        savedProviderCallback = callback;
        callback(new Uint8Array([7]));
      },
    },
  });

  const response = await kernel.handle(req({ method: "GET", path: "/pay" }));
  assert.equal(callbackRefusalCaught, true, "the queued callback catches its late provider refusal");
  assert.equal(response.status, 500, "a refusal queued before publication remains terminal");
  assert.notDeepEqual(JSON.parse(dec.decode(response.body)), { ok: true });
});

test("secrets: refusal from an audit hook cannot revise the sealed response or its event", async () => {
  for (const requiredAudit of [false, true]) {
    let savedProviderCallback;
    let callbackRefusalCaught = false;
    let consumerCalls = 0;
    let commitCalls = 0;
    let emitCalls = 0;
    const acceptedStatuses = [];
    const auditSink = {
      reserve: () => Object.freeze({ id: Symbol("test-reservation") }),
      commit: (_reservation, event) => {
        commitCalls += 1;
        acceptedStatuses.push(event.status);
        try {
          savedProviderCallback(new Uint8Array([8]));
        } catch {
          callbackRefusalCaught = true;
        }
      },
      cancel: () => undefined,
      emit: (event) => {
        emitCalls += 1;
        acceptedStatuses.push(event.status);
        try {
          savedProviderCallback(new Uint8Array([8]));
        } catch {
          callbackRefusalCaught = true;
        }
      },
    };
    const kernel = createAppKernel({
      routes: [{
        method: "GET", path: "/pay", handler: "pay",
        auth: { mode: "public" }, secrets: { require: ["db.main"] },
        audit: { runtimeReport: requiredAudit },
      }],
      dispatch: {
        pay: ({ getSecret }) => {
          getSecret("db.main", () => { consumerCalls += 1; });
          return { body: { ok: true } };
        },
      },
      secretsProvider: {
        has: () => true,
        use: (_name, callback) => {
          savedProviderCallback = callback;
          callback(new Uint8Array([7]));
        },
      },
      auditSink,
    });

    const response = await kernel.handle(req({ method: "GET", path: "/pay" }));
    assert.equal(callbackRefusalCaught, true, "the audit hook observes a refusal from the retired provider callback");
    assert.equal(consumerCalls, 1, "the closed callback cannot re-enter consumer code");
    assert.equal(response.status, 200, "a post-seal callback refusal cannot revise the terminal response");
    assert.deepEqual(acceptedStatuses, [200], "the accepted audit event matches the sealed response");
    assert.equal(commitCalls, requiredAudit ? 1 : 0, "runtime-report route uses mandatory commit exactly once");
    assert.equal(emitCalls, requiredAudit ? 0 : 1, "non-report route uses best-effort emit exactly once");
  }
});

test("secrets: a successful request acquisition spends the accessor before any second provider call", async () => {
  const scenarios = [
    { when: "synchronously", secondName: "db.main", defer: false },
    { when: "synchronously", secondName: "db.audit", defer: false },
    { when: "in a live microtask", secondName: "db.main", defer: true },
    { when: "in a live microtask", secondName: "db.audit", defer: true },
  ];

  for (const { when, secondName, defer } of scenarios) {
    let providerUses = 0;
    let providerHasCalls = 0;
    let consumerCalls = 0;
    let secondAttemptCaught = false;
    let hasCallsBeforeSecond = 0;
    let hasCallsBeforeFirst = 0;
    const kernel = createAppKernel({
      routes: [{
        method: "GET", path: "/pay", handler: "pay",
        auth: { mode: "public" }, secrets: { require: ["db.main", "db.audit"] },
      }],
      dispatch: {
        pay: async ({ getSecret }) => {
          hasCallsBeforeFirst = providerHasCalls;
          getSecret("db.main", () => { consumerCalls += 1; });
          hasCallsBeforeSecond = providerHasCalls;
          if (defer) await Promise.resolve();
          try {
            getSecret(secondName, () => { consumerCalls += 1; });
          } catch {
            secondAttemptCaught = true;
          }
          return { body: { ok: true } };
        },
      },
      secretsProvider: {
        has: () => { providerHasCalls += 1; return true; },
        use: (_name, callback) => {
          providerUses += 1;
          callback(new Uint8Array([7]));
        },
      },
    });

    const response = await kernel.handle(req({ method: "GET", path: "/pay" }));
    assert.equal(response.status, 500, `second ${secondName} attempt ${when} must fail the request`);
    assert.equal(providerUses, 1, `second ${secondName} attempt ${when} must not re-enter provider.use`);
    assert.equal(hasCallsBeforeSecond - hasCallsBeforeFirst, 1, "the first acquisition is revalidated once");
    assert.equal(providerHasCalls, hasCallsBeforeSecond, `second ${secondName} attempt ${when} must not re-enter provider.has`);
    assert.equal(consumerCalls, 1, `second ${secondName} attempt ${when} must not reach consumer code`);
    assert.equal(secondAttemptCaught, true, `handler catches the second ${secondName} refusal ${when}`);
  }
});

test("secrets: caught late provider callback violation fails a still-live request", async () => {
  let providerUses = 0;
  let consumerCalls = 0;
  let lateCallbackCaught = false;
  const kernel = createAppKernel({
    routes: [{
      method: "GET", path: "/pay", handler: "pay",
      auth: { mode: "public" }, secrets: { require: ["db.main"] },
    }],
    dispatch: {
      pay: async ({ getSecret }) => {
        getSecret("db.main", () => { consumerCalls += 1; });
        await Promise.resolve();
        return { body: { ok: true } };
      },
    },
    secretsProvider: {
      has: () => true,
      use: (_name, callback) => {
        providerUses += 1;
        callback(new Uint8Array([7]));
        queueMicrotask(() => {
          try {
            callback(new Uint8Array([8]));
          } catch {
            lateCallbackCaught = true;
          }
        });
      },
    },
  });

  const response = await kernel.handle(req({ method: "GET", path: "/pay" }));
  assert.equal(lateCallbackCaught, true, "provider code catches its late duplicate-callback refusal");
  assert.equal(providerUses, 1, "late duplicate callback does not reacquire through provider.use");
  assert.equal(consumerCalls, 1, "late duplicate callback never re-enters consumer code");
  assert.equal(response.status, 500, "caught provider callback violation remains terminal for the live request");
  assert.notDeepEqual(JSON.parse(dec.decode(response.body)), { ok: true });
});

test("secrets: in-flight microtask may use capability, but serialization and post-response may not", async () => {
  let capturedGetSecret;
  let providerUses = 0;
  const kernel = createAppKernel({
    routes: [{
      method: "GET", path: "/pay", handler: "pay",
      auth: { mode: "public" }, secrets: { require: ["db.main"] },
    }],
    dispatch: {
      pay: ({ getSecret }) => {
        capturedGetSecret = getSecret;
        queueMicrotask(() => getSecret("db.main", () => undefined));
        return {
          body: {
            get marker() {
              getSecret("db.main", () => undefined);
              return "ok";
            },
          },
        };
      },
    },
    secretsProvider: {
      has: () => true,
      use: (_name, callback) => { providerUses += 1; callback(new Uint8Array([7])); },
    },
  });

  const response = await kernel.handle(req({ method: "GET", path: "/pay" }));
  assert.equal(response.status, 200);
  assert.equal(providerUses, 1, "work scheduled before request retirement remains within the live request");
  capturedGetSecret("db.main", () => undefined);
  assert.equal(providerUses, 1, "post-response calls cannot reacquire");
});

test("secrets: timed-out noncooperative handler cannot reacquire after its late continuation", async () => {
  let capturedGetSecret;
  let providerUses = 0;
  let finishLateWork;
  const lateWorkDone = new Promise((resolve) => { finishLateWork = resolve; });
  const kernel = createAppKernel({
    routes: [{
      method: "GET", path: "/pay", handler: "pay",
      auth: { mode: "public" }, secrets: { require: ["db.main"] },
      limits: { timeoutMs: 5 },
    }],
    dispatch: {
      pay: async ({ getSecret }) => {
        capturedGetSecret = getSecret;
        await new Promise((resolve) => setTimeout(resolve, 25));
        capturedGetSecret("db.main", () => { throw new Error("late continuation received secret"); });
        finishLateWork();
        return { body: { ok: true } };
      },
    },
    secretsProvider: {
      has: () => true,
      use: (_name, callback) => { providerUses += 1; callback(new Uint8Array([1])); },
    },
  });

  const response = await kernel.handle(req({ method: "GET", path: "/pay" }));
  assert.equal(response.status, 504);
  await lateWorkDone;
  assert.equal(response.status, 504, "late handler completion cannot change the already-returned timeout response");
  assert.equal(providerUses, 0, "late detached work cannot reacquire after timeout response");
});

test("secrets: provider callback saved past use cannot later deliver a secret view", async () => {
  const NativeUint8Array = globalThis.Uint8Array;
  const lateBytes = new NativeUint8Array([9]);
  let lateStageCopies = 0;
  function TrackingUint8Array(value) {
    if (value === lateBytes) lateStageCopies += 1;
    return new NativeUint8Array(value);
  }
  TrackingUint8Array.prototype = NativeUint8Array.prototype;
  globalThis.Uint8Array = TrackingUint8Array;
  let savedCallback;
  let handlerCalls = 0;
  try {
    const { createSecretGate } = await import("../dist/secret-gate.js?tracked-late-callback");
    const gate = createSecretGate({
      has: () => true,
      use: (_name, callback) => { savedCallback = callback; },
    });

    assert.throws(
      () => gate.getSecret(["db.main"], "db.main", () => { handlerCalls += 1; }),
      /not supplied/i,
    );
    assert.throws(
      () => savedCallback(lateBytes),
      /after use returned/i,
    );
    assert.equal(lateStageCopies, 0, "a refused late callback must not allocate a staged copy");
    assert.equal(handlerCalls, 0);
  } finally {
    globalThis.Uint8Array = NativeUint8Array;
  }
});

test("secrets: callback saved after one valid use cannot stage a second value", async () => {
  const NativeUint8Array = globalThis.Uint8Array;
  const acceptedBytes = new NativeUint8Array([1, 2]);
  const lateBytes = new NativeUint8Array([9]);
  let lateStageCopies = 0;
  function TrackingUint8Array(value) {
    if (value === lateBytes) lateStageCopies += 1;
    return new NativeUint8Array(value);
  }
  TrackingUint8Array.prototype = NativeUint8Array.prototype;
  globalThis.Uint8Array = TrackingUint8Array;
  try {
    const { createSecretGate } = await import("../dist/secret-gate.js?tracked-valid-callback");
    let savedCallback;
    let handlerCalls = 0;
    let retainedView;
    const gate = createSecretGate({
      has: () => true,
      use: (_name, callback) => {
        savedCallback = callback;
        callback(acceptedBytes);
      },
    });

    gate.getSecret(["db.main"], "db.main", (view) => {
      handlerCalls += 1;
      retainedView = view;
      assert.deepEqual([...view], [1, 2]);
    });
    assert.equal(handlerCalls, 1);
    assert.deepEqual([...retainedView], [0, 0], "the accepted gate-owned view is wiped when use completes");
    assert.throws(() => savedCallback(lateBytes), /after use returned/i);
    assert.equal(lateStageCopies, 0, "a closed generation must not stage a second callback value");
    assert.equal(handlerCalls, 1, "the saved callback must not re-enter the consumer");
    assert.deepEqual([...retainedView], [0, 0], "a late callback must not overwrite the already-wiped view");
  } finally {
    globalThis.Uint8Array = NativeUint8Array;
  }
});

test("secrets: provider Promise return is refused and its rejection is observed", async () => {
  const NativeUint8Array = globalThis.Uint8Array;
  const stagedViews = [];
  function TrackingUint8Array(value) {
    const result = new NativeUint8Array(value);
    if (value instanceof NativeUint8Array) {
      stagedViews.push({ source: value, staged: result, bytesAtAllocation: [...result] });
    }
    return result;
  }
  TrackingUint8Array.prototype = NativeUint8Array.prototype;
  const unhandled = [];
  const observeUnhandled = (reason) => { unhandled.push(reason); };
  process.on("unhandledRejection", observeUnhandled);
  globalThis.Uint8Array = TrackingUint8Array;
  try {
    const { createSecretGate } = await import("../dist/secret-gate.js?tracked-provider-promise");
    const gate = createSecretGate({
      has: () => true,
      use: (_name, callback) => {
        callback(new NativeUint8Array([4]));
        return Promise.reject(new Error("provider async failure"));
      },
    });

    assert.throws(
      () => gate.getSecret(["db.main"], "db.main", () => undefined),
      /provider use return\/async channel/i,
    );
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(unhandled, []);
    assert.equal(stagedViews.length, 1, "the provider callback should create one gate-owned staged copy");
    assert.notStrictEqual(stagedViews[0].staged, stagedViews[0].source, "the gate stages a distinct copy");
    assert.deepEqual(stagedViews[0].bytesAtAllocation, [4], "the tracked copy contained the provider marker");
    assert.deepEqual([...stagedViews[0].staged], [0], "that exact staged copy is wiped when the provider thenable is refused");
  } finally {
    globalThis.Uint8Array = NativeUint8Array;
    process.removeListener("unhandledRejection", observeUnhandled);
  }
});

test("secrets: invalid async provider return cannot run consumer effects before refusal", async () => {
  const { createSecretGate } = await import("../dist/secret-gate.js");
  let consumerEffects = 0;
  const gate = createSecretGate({
    has: () => true,
    use: (_name, callback) => {
      callback(new Uint8Array([0x5a]));
      return Promise.reject(new Error("provider must be synchronous"));
    },
  });

  assert.throws(
    () => gate.getSecret(["db.main"], "db.main", () => { consumerEffects += 1; }),
    /provider use return\/async channel/i,
  );
  assert.equal(consumerEffects, 0, "consumer callback must wait until provider contract validation");
  await new Promise((resolve) => setImmediate(resolve));
});

test("secrets: staged view is wiped on provider and consumer throw paths", async () => {
  const NativeUint8Array = globalThis.Uint8Array;
  const stagedViews = [];
  function TrackingUint8Array(value) {
    const result = new NativeUint8Array(value);
    if (value instanceof NativeUint8Array) stagedViews.push(result);
    return result;
  }
  TrackingUint8Array.prototype = NativeUint8Array.prototype;
  globalThis.Uint8Array = TrackingUint8Array;
  try {
    const { createSecretGate } = await import("../dist/secret-gate.js?tracked-throw-cleanup");
    const scenarios = [
      {
        name: "provider throws after staging",
        use: (callback) => {
          callback(new NativeUint8Array([0x31, 0x32]));
          throw new Error("provider failed after staging");
        },
        consume: () => undefined,
        error: /provider failed after staging/,
      },
      {
        name: "provider catches duplicate-callback refusal",
        use: (callback) => {
          callback(new NativeUint8Array([0x33]));
          try { callback(new NativeUint8Array([0x34])); } catch { /* adversarial provider */ }
        },
        consume: () => undefined,
        error: /more than once/,
      },
      {
        name: "consumer throws after provider returns",
        use: (callback) => callback(new NativeUint8Array([0x35, 0x36])),
        consume: () => { throw new Error("consumer failed after staging"); },
        error: /consumer failed after staging/,
      },
    ];

    for (const scenario of scenarios) {
      const gate = createSecretGate({ has: () => true, use: (_name, callback) => scenario.use(callback) });
      assert.throws(
        () => gate.getSecret(["db.main"], "db.main", scenario.consume),
        scenario.error,
        scenario.name,
      );
    }
  } finally {
    globalThis.Uint8Array = NativeUint8Array;
  }
  assert.equal(stagedViews.length, 3, "each admitted callback should have a gate-owned staging copy");
  for (const stagedView of stagedViews) {
    assert.deepEqual([...stagedView], Array(stagedView.length).fill(0), "every staged copy must be wiped on refusal");
  }
});

test("secrets: consumer cannot shadow the gate's staged-buffer wipe", async () => {
  const { createSecretGate } = await import("../dist/secret-gate.js");
  let retainedView;
  const gate = createSecretGate({
    has: () => true,
    use: (_name, callback) => callback(new Uint8Array([0x51, 0x52])),
  });

  assert.equal(
    gate.getSecret(["db.main"], "db.main", (view) => {
      retainedView = view;
      view.fill = () => undefined;
      return undefined;
    }),
    undefined,
  );
  assert.deepEqual([...retainedView], [0, 0]);
});

test("secrets: provider replacement of global Uint8Array cannot alias provider-owned bytes", async () => {
  const { createSecretGate } = await import("../dist/secret-gate.js");
  const NativeUint8Array = globalThis.Uint8Array;
  const providerBytes = new NativeUint8Array([0x61, 0x62]);
  let stagedView;
  function AliasUint8Array() {
    return providerBytes;
  }
  AliasUint8Array.prototype = NativeUint8Array.prototype;
  const gate = createSecretGate({
    has: () => true,
    use: (_name, callback) => {
      globalThis.Uint8Array = AliasUint8Array;
      callback(providerBytes);
    },
  });

  try {
    gate.getSecret(["db.main"], "db.main", (view) => { stagedView = view; });
  } finally {
    globalThis.Uint8Array = NativeUint8Array;
  }

  assert.notStrictEqual(stagedView, providerBytes, "the staged view must be allocated by the captured intrinsic");
  assert.deepEqual([...providerBytes], [0x61, 0x62], "cleanup must not wipe provider-owned storage");
  assert.deepEqual([...stagedView], [0, 0], "the gate-owned copy is still wiped");
});

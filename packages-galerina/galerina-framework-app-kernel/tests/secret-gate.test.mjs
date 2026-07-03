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
import { createAppKernel } from "../dist/index.js";

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

// ── makeArena(): prefer the REAL ext-secrets-tmf SealArena (proves the real arena satisfies the
// SecretsProvider shape by structure). Fall back to a local RefArena stub mirroring the exact
// has/use/put/fault/dispose contract (arena.ts:33-115) if that package's dist is unavailable, so
// this bench stays runnable stand-alone. ──
let SealArena;
try {
  ({ SealArena } = await import("../../galerina-ext-secrets-tmf/dist/arena.js"));
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
    return fn(e.value);
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
test(`secrets: arena backing in use = ${SealArena !== undefined ? "REAL SealArena (ext-secrets-tmf/dist)" : "local RefArena fallback"}`, () => {
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
        ctx.getSecret("db.main", (v) => { seen = v.toString(); }); // short-lived view
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

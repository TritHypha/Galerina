// App Kernel — posture wiring + ASYNC audit (Tri-Pipe: audit must NOT block the response).
// Framework P1 slice 3.
import assert from "node:assert/strict";
import { test } from "node:test";
import { createAppKernel, InMemoryAuditSink } from "../dist/index.js";

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

function jsonBody(obj) {
  return enc.encode(JSON.stringify(obj));
}

const tick = () => new Promise((r) => setTimeout(r, 0));

// ── posture (item 1) ── posture 'on' tightens the body ceiling enforced by the kernel.
test("posture 'on' tightens kernel body ceiling (256KB default -> 64KB hardened)", async () => {
  const routes = [{ method: "POST", path: "/up", handler: "up", requestType: "Upload", auth: { mode: "public" } }];
  const dispatch = { up: () => ({ status: 200, body: { ok: true } }) };
  const requestValidators = {
    Upload(value) {
      return value !== null && typeof value === "object" && !Array.isArray(value)
        && Object.keys(value).length === 1 && typeof value.pad === "string";
    },
  };

  // A ~100KB VALID JSON body: under the 256KB default ceiling, but over the 64KB hardened ceiling.
  const body = jsonBody({ pad: "x".repeat(100 * 1024) });
  assert.ok(body.byteLength > 64 * 1024 && body.byteLength < 256 * 1024);
  const headers = { "content-type": "application/json", "idempotency-key": "upload-1" };

  const kOff = createAppKernel({ routes, dispatch, requestValidators, posture: "off" });
  const rOff = await kOff.handle(req({ method: "POST", path: "/up", body, headers }));
  assert.equal(rOff.status, 200); // default ceiling admits 100KB

  const kOn = createAppKernel({ routes, dispatch, requestValidators, posture: "on" });
  const rOn = await kOn.handle(req({ method: "POST", path: "/up", body, headers }));
  assert.equal(rOn.status, 413); // hardened ceiling rejects the same 100KB body
});

// ── audit emission (item 2a) ── events ARE emitted, visible after a tick, off the response path.
test("audit events are emitted and visible after a tick (default in-memory sink)", async () => {
  const sink = new InMemoryAuditSink();
  const k = createAppKernel({
    routes: [{ method: "GET", path: "/health", handler: "health", auth: { mode: "public" } }],
    dispatch: { health: () => ({ status: 200, body: { status: "up" } }) },
    auditSink: sink,
  });

  const res = await k.handle(req({ method: "GET", path: "/health" }));
  assert.equal(res.status, 200);

  // Drain happens on the next tick — not synchronously inside handle().
  await tick();
  const events = sink.drained();
  assert.equal(events.length, 1);
  assert.equal(events[0].requestId, "rq-1");
  assert.equal(events[0].method, "GET");
  assert.equal(events[0].path, "/health");
  assert.equal(events[0].status, 200);
  assert.equal(events[0].errorCode, undefined);
  assert.equal(typeof events[0].at, "number");
});

test("audit event carries the typed error code for a rejected request", async () => {
  const sink = new InMemoryAuditSink();
  const k = createAppKernel({
    routes: [{ method: "GET", path: "/secure", handler: "secure" }], // auth required by default
    dispatch: { secure: () => ({ body: { ok: true } }) },
    auditSink: sink,
  });

  const res = await k.handle(req({ method: "GET", path: "/secure" }));
  assert.equal(res.status, 401);

  await tick();
  const events = sink.drained();
  assert.equal(events.length, 1);
  assert.equal(events[0].status, 401);
  assert.equal(events[0].errorCode, "unauthorized");
});

test("unmatched 404/405 traffic does not consume mandatory audit capacity", async () => {
  const sink = new InMemoryAuditSink({ capacity: 1 });
  let effects = 0;
  const k = createAppKernel({
    routes: [{
      method: "GET",
      path: "/health",
      handler: "health",
      auth: { mode: "public" },
      audit: { runtimeReport: true },
    }],
    dispatch: {
      health: () => {
        effects += 1;
        return { status: 200, body: { status: "up" } };
      },
    },
    auditSink: sink,
  });

  const missing = await k.handle(req({ method: "GET", path: "/nope", requestId: "rq-404" }));
  assert.equal(missing.status, 404);
  const wrongMethod = await k.handle(req({ method: "POST", path: "/health", requestId: "rq-405" }));
  assert.equal(wrongMethod.status, 405);
  await tick();
  assert.equal(sink.drained().length, 0, "unmatched routes must not retain audit evidence");
  assert.equal(effects, 0);

  const admitted = await k.handle(req({ requestId: "rq-matched" }));
  assert.equal(admitted.status, 200);
  assert.equal(effects, 1, "mandatory-audit routes must retain capacity after unmatched traffic");
  await tick();
  assert.equal(sink.drained().length, 1);
  assert.equal(sink.drained()[0].requestId, "rq-matched");
});

// ── non-blocking guarantee (item 2b) ── a deliberately SLOW sink must NOT delay handle().
test("a slow audit sink does NOT delay handle()'s response", async () => {
  let sinkFinished = false;
  let responseResolvedAt = -1;
  let sinkFinishedAt = -1;
  let order = [];

  // A sink whose emit() schedules work that completes much later than the response.
  const slowSink = {
    reserve() { return Object.freeze({ id: Symbol("slow-audit") }); },
    commit(_reservation, _event) {
      // commit() itself returns immediately; the slow part is deferred.
      setTimeout(() => {
        sinkFinished = true;
        sinkFinishedAt = Date.now();
        order.push("sink");
      }, 50);
    },
    cancel() {},
    emit(event) { this.commit(Object.freeze({ id: Symbol("slow-best-effort") }), event); },
  };

  const k = createAppKernel({
    routes: [{ method: "GET", path: "/health", handler: "health", auth: { mode: "public" } }],
    dispatch: { health: () => ({ status: 200, body: { status: "up" } }) },
    auditSink: slowSink,
  });

  const res = await k.handle(req({ method: "GET", path: "/health" }));
  responseResolvedAt = Date.now();
  order.push("response");

  // The response resolved WITHOUT waiting for the 50ms sink work.
  assert.equal(res.status, 200);
  assert.equal(sinkFinished, false, "slow sink must not have completed before the response resolved");

  // Now wait long enough for the slow sink to finish, and confirm ordering.
  await new Promise((r) => setTimeout(r, 80));
  assert.equal(sinkFinished, true, "slow sink should eventually complete");
  assert.deepEqual(order, ["response", "sink"], "response must resolve before the slow sink finishes");
  assert.ok(sinkFinishedAt >= responseResolvedAt, "sink finished at or after the response resolved");
});

// Required audit evidence fails closed when the sink refuses synchronously.
test("a throwing audit sink refuses a route that requires a runtime report", async () => {
  const throwingSink = {
    reserve() { throw new Error("audit backend on fire"); },
    commit() { throw new Error("audit backend on fire"); },
    cancel() { throw new Error("audit backend on fire"); },
    emit() { throw new Error("audit backend on fire"); },
  };
  const k = createAppKernel({
    routes: [{ method: "GET", path: "/health", handler: "health", auth: { mode: "public" } }],
    dispatch: { health: () => ({ status: 200, body: { status: "up" } }) },
    auditSink: throwingSink,
  });

  const res = await k.handle(req({ method: "GET", path: "/health" }));
  assert.equal(res.status, 503);
  assert.equal(JSON.parse(dec.decode(res.body)).error, "audit_unavailable");
});

// The default sink (no auditSink option) is wired and does not affect responses.
test("default audit sink is used when none is supplied (no crash, response intact)", async () => {
  const k = createAppKernel({
    routes: [{ method: "GET", path: "/health", handler: "health", auth: { mode: "public" } }],
    dispatch: { health: () => ({ status: 200, body: { status: "up" } }) },
  });
  const res = await k.handle(req({ method: "GET", path: "/health" }));
  assert.equal(res.status, 200);
  await tick();
});

test("mandatory audit capacity is reserved before handler effects", async () => {
  const sink = new InMemoryAuditSink({ capacity: 1 });
  let effects = 0;
  const k = createAppKernel({
    routes: [{
      method: "GET",
      path: "/health",
      handler: "health",
      auth: { mode: "public" },
      audit: { runtimeReport: true },
    }],
    dispatch: {
      health: () => {
        effects += 1;
        return { status: 200, body: { status: "up" } };
      },
    },
    auditSink: sink,
  });

  const first = await k.handle(req({ requestId: "rq-reserved-1" }));
  assert.equal(first.status, 200);
  assert.equal(effects, 1);
  await tick();
  assert.equal(sink.drained().length, 1);

  const refused = await k.handle(req({ requestId: "rq-reserved-2" }));
  assert.equal(refused.status, 503);
  assert.equal(JSON.parse(dec.decode(refused.body)).error, "audit_unavailable");
  assert.equal(effects, 1, "no handler effect may run without reserved evidence capacity");
  assert.equal(sink.drained()[0].requestId, "rq-reserved-1");
  assert.equal(sink.dropped(), 0, "accepted audit evidence must never be evicted");

  const transferred = sink.takeDrained();
  assert.equal(transferred.length, 1);
  const admitted = await k.handle(req({ requestId: "rq-reserved-3" }));
  assert.equal(admitted.status, 200);
  assert.equal(effects, 2);
});

test("audit reservations are exact affine capabilities", () => {
  const event = {
    requestId: "rq-affine",
    method: "GET",
    path: "/health",
    status: 200,
    errorCode: undefined,
    appliedDefaults: [],
    relaxations: [],
    at: 0,
  };
  const sink = new InMemoryAuditSink({ capacity: 1 });
  const foreign = new InMemoryAuditSink({ capacity: 1 });
  const reservation = sink.reserve();
  assert.ok(reservation);

  assert.throws(() => foreign.commit(reservation, event), /reservation/i);
  sink.commit(reservation, event);
  assert.throws(() => sink.commit(reservation, event), /reservation/i);
  assert.throws(() => sink.cancel(reservation), /reservation/i);
  assert.equal(sink.reserve(), undefined, "committed evidence consumes retained capacity");
});

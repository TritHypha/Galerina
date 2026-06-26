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
  const routes = [{ method: "POST", path: "/up", handler: "up", auth: { mode: "public" } }];
  const dispatch = { up: () => ({ status: 200, body: { ok: true } }) };

  // A ~100KB VALID JSON body: under the 256KB default ceiling, but over the 64KB hardened ceiling.
  const body = jsonBody({ pad: "x".repeat(100 * 1024) });
  assert.ok(body.byteLength > 64 * 1024 && body.byteLength < 256 * 1024);
  const headers = { "content-type": "application/json" };

  const kOff = createAppKernel({ routes, dispatch, posture: "off" });
  const rOff = await kOff.handle(req({ method: "POST", path: "/up", body, headers }));
  assert.equal(rOff.status, 200); // default ceiling admits 100KB

  const kOn = createAppKernel({ routes, dispatch, posture: "on" });
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

test("a 404 (no route matched) is still audited, with no policy provenance", async () => {
  const sink = new InMemoryAuditSink();
  const k = createAppKernel({
    routes: [{ method: "GET", path: "/health", handler: "health", auth: { mode: "public" } }],
    dispatch: { health: () => ({ body: {} }) },
    auditSink: sink,
  });

  await k.handle(req({ method: "GET", path: "/nope" }));
  await tick();
  const events = sink.drained();
  assert.equal(events.length, 1);
  assert.equal(events[0].status, 404);
  assert.equal(events[0].errorCode, "route_not_found");
  assert.deepEqual([...events[0].appliedDefaults], []); // no route → no resolved policy
  assert.deepEqual([...events[0].relaxations], []);
});

// ── non-blocking guarantee (item 2b) ── a deliberately SLOW sink must NOT delay handle().
test("a slow audit sink does NOT delay handle()'s response", async () => {
  let sinkFinished = false;
  let responseResolvedAt = -1;
  let sinkFinishedAt = -1;
  let order = [];

  // A sink whose emit() schedules work that completes much later than the response.
  const slowSink = {
    emit(_event) {
      // emit() itself returns immediately; the slow part is deferred.
      setTimeout(() => {
        sinkFinished = true;
        sinkFinishedAt = Date.now();
        order.push("sink");
      }, 50);
    },
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

// A sink that THROWS synchronously inside emit() must not break the response either (fail-open audit).
test("a throwing audit sink does not break the response", async () => {
  const throwingSink = {
    emit() { throw new Error("audit backend on fire"); },
  };
  const k = createAppKernel({
    routes: [{ method: "GET", path: "/health", handler: "health", auth: { mode: "public" } }],
    dispatch: { health: () => ({ status: 200, body: { status: "up" } }) },
    auditSink: throwingSink,
  });

  const res = await k.handle(req({ method: "GET", path: "/health" }));
  assert.equal(res.status, 200);
  assert.deepEqual(JSON.parse(dec.decode(res.body)), { status: "up" });
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

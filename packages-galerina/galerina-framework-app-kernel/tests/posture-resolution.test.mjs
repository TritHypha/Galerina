// #195/#179 — the App Kernel resolves OS/HW posture from 'auto' (fail-secure by env)
// and records the resolution on each audit event. The default 'off' behaviour is
// unchanged (covered by kernel.test.mjs / route-defaults.test.mjs); these tests cover
// the new 'auto' wiring and the strictly-additive audit field.
import assert from "node:assert/strict";
import { test } from "node:test";
import { createAppKernel } from "../dist/index.js";

const enc = new TextEncoder();

function req(over = {}) {
  return { method: "GET", path: "/health", headers: {}, body: new Uint8Array(0), query: {}, requestId: "rq-1", receivedAt: 0, ...over };
}

// A synchronous capturing sink — the kernel calls emit() synchronously inside handle(),
// so the event is available immediately after `await k.handle(...)`.
function capturingSink() {
  const events = [];
  return { sink: { emit: (e) => events.push(e) }, events };
}

const publicGet = (over) => ({
  routes: [{ method: "GET", path: "/health", handler: "h", auth: { mode: "public" } }],
  dispatch: { h: () => ({ body: { ok: true } }) },
  ...over,
});

test("posture 'auto' + production → resolves 'on' (fail-secure, chose the secure default), recorded in audit", async () => {
  const { sink, events } = capturingSink();
  const k = createAppKernel(publicGet({ posture: "auto", env: "production", auditSink: sink }));
  const res = await k.handle(req());
  assert.equal(res.status, 200);
  assert.equal(events.length, 1);
  const rp = events[0].resolvedPosture;
  assert.ok(rp, "resolvedPosture recorded");
  assert.equal(rp.requested, "auto");
  assert.equal(rp.effective, "on");
  assert.equal(rp.env, "production");
  assert.equal(rp.failSecure, true); // auto kept the secure 'on' default (only dev/test relaxes)
  assert.equal(rp.controls.distrustHostTime, true);
  assert.match(rp.rationale, /auto/i);
});

test("posture 'auto' + development → resolves 'off' (host trusted in dev)", async () => {
  const { sink, events } = capturingSink();
  const k = createAppKernel(publicGet({ posture: "auto", env: "development", auditSink: sink }));
  await k.handle(req());
  const rp = events[0].resolvedPosture;
  assert.equal(rp.effective, "off");
  assert.equal(rp.failSecure, false);
  assert.equal(rp.controls.distrustHostTime, false);
});

test("posture 'auto' + unknown env (omitted) → fail-secure 'on'", async () => {
  const { sink, events } = capturingSink();
  const k = createAppKernel(publicGet({ posture: "auto", auditSink: sink }));
  await k.handle(req());
  const rp = events[0].resolvedPosture;
  assert.equal(rp.effective, "on");
  assert.equal(rp.env, "unknown");
  assert.equal(rp.failSecure, true);
});

test("posture 'auto' + production tightens the body ceiling (behaviour matches 'on')", async () => {
  // ~100KB valid JSON: under HARDENED (64KB) → 413; under default 'off' (256KB) → handled.
  const body = enc.encode(JSON.stringify({ pad: "x".repeat(100 * 1024) }));
  const post = (over) => ({
    routes: [{ method: "POST", path: "/up", handler: "up", auth: { mode: "public" } }],
    dispatch: { up: () => ({ body: { ok: true } }) },
    ...over,
  });
  const prod = createAppKernel(post({ posture: "auto", env: "production" }));
  const dev = createAppKernel(post({ posture: "auto", env: "development" }));
  const hdrs = { "content-type": "application/json" };
  const r1 = await prod.handle(req({ method: "POST", path: "/up", body, headers: hdrs }));
  const r2 = await dev.handle(req({ method: "POST", path: "/up", body, headers: hdrs }));
  assert.equal(r1.status, 413); // hardened 64KB ceiling rejects
  assert.equal(r2.status, 200); // standard 256KB ceiling accepts
});

test("pre-resolved 'on'/'off' and the default (omitted) do NOT add resolvedPosture (strictly additive)", async () => {
  for (const posture of ["on", "off", undefined]) {
    const { sink, events } = capturingSink();
    const opts = publicGet({ auditSink: sink });
    if (posture !== undefined) opts.posture = posture;
    const k = createAppKernel(opts);
    await k.handle(req());
    assert.equal(events.length, 1);
    assert.equal("resolvedPosture" in events[0], false, `posture=${posture} must not record resolvedPosture`);
  }
});

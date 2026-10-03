// App-frame review item 5 (S6): the kernel's typed response contract.
// - A handler status must be an integer in [200, 599]; anything else becomes a kernel 500.
// - A handler cannot set kernel-owned headers (content-type for kernel-encoded JSON,
//   x-content-type-options, and transport framing headers), cannot send invalid header names or
//   values, and may label raw bytes only with a passive media type.
// - Every kernel response carries x-content-type-options: nosniff and, by default, cache-control: no-store.
// Each refusal has an admitting control.
import assert from "node:assert/strict";
import { test } from "node:test";
import { createAppKernel } from "../dist/index.js";

const enc = new TextEncoder();
const req = (over = {}) => ({ method: "GET", path: "/r", headers: {}, body: new Uint8Array(0), query: {}, requestId: "rq", receivedAt: 0, ...over });

function sink() {
  const events = [];
  return {
    events,
    sink: { reserve: () => Object.freeze({ id: Symbol("a") }), commit: (_r, e) => events.push(e), cancel: () => {}, emit: (e) => events.push(e) },
  };
}
function kernelReturning(result) {
  const s = sink();
  const k = createAppKernel({
    routes: [{ method: "GET", path: "/r", handler: "h", auth: { mode: "public" } }],
    dispatch: { h: typeof result === "function" ? result : () => result },
    auditSink: s.sink,
  });
  return { k, events: s.events };
}
async function expectKernel500(result, label) {
  const { k, events } = kernelReturning(result);
  const res = await k.handle(req());
  assert.equal(res.status, 500, `${label}: status`);
  assert.equal(JSON.parse(new TextDecoder().decode(res.body)).error, "internal_error", `${label}: body code`);
  assert.equal(events[0].errorCode, "internal_error", `${label}: audit code`);
  assert.equal(events[0].origin, "kernel", `${label}: audit origin`);
  assert.equal(res.headers["x-content-type-options"], "nosniff", `${label}: nosniff on the refusal`);
  return res;
}

// ── status ──
for (const bad of [NaN, Infinity, -1, 0, 99, 100, 199, 600, 1000, 200.5, "200", true]) {
  test(`S6 handler status ${String(bad)} is refused with a kernel 500`, async () => {
    await expectKernel500({ status: bad, body: { ok: true } }, `status ${String(bad)}`);
  });
}
for (const good of [200, 201, 204, 302, 404, 409, 599]) {
  test(`S6 handler status ${good} passes through (control)`, async () => {
    const { k, events } = kernelReturning({ status: good, body: { ok: true } });
    const res = await k.handle(req());
    assert.equal(res.status, good);
    assert.equal(events[0].origin, "handler");
  });
}
test("S6 omitted status defaults to 200 (control)", async () => {
  const { k } = kernelReturning({ body: { ok: true } });
  assert.equal((await k.handle(req())).status, 200);
});

// ── handler result shape ──
for (const [label, value] of [["undefined", undefined], ["a number", 5], ["a string", "ok"], ["null", null], ["an array", [1]]]) {
  test(`S6 a handler that returns ${label} gets a kernel 500, not a thrown error`, async () => {
    await expectKernel500(() => value, label);
  });
}

// ── kernel-owned and invalid headers ──
for (const [label, headers] of [
  ["content-type override on a JSON body", { "content-type": "text/html" }],
  ["mixed-case Content-Type override on a JSON body", { "Content-Type": "text/html; charset=utf-8" }],
  ["x-content-type-options override", { "x-content-type-options": "sniff" }],
  ["content-length", { "content-length": "1" }],
  ["transfer-encoding", { "transfer-encoding": "chunked" }],
  ["connection", { connection: "keep-alive" }],
  ["CRLF in a value (response splitting)", { "x-note": "a\r\nset-cookie: s=1" }],
  ["LF in a value", { "x-note": "a\nb" }],
  ["NUL in a value", { "x-note": "a\u0000b" }],
  ["an invalid header name", { "bad header": "1" }],
  ["an empty header name", { "": "1" }],
  ["a non-string value", { "x-count": 5 }],
  ["a case-insensitive duplicate", { "X-Trace": "a", "x-trace": "b" }],
]) {
  test(`S6 refuses ${label}`, async () => {
    await expectKernel500({ status: 200, headers, body: { ok: true } }, label);
  });
}
test("S6 refuses a headers value that is not a plain object", async () => {
  await expectKernel500({ status: 200, headers: [["x-a", "1"]], body: { ok: true } }, "array headers");
  await expectKernel500({ status: 200, headers: "x-a: 1", body: { ok: true } }, "string headers");
});
test("S6 a custom header passes through with a lower-case name (control)", async () => {
  const { k } = kernelReturning({ status: 200, headers: { "X-Request-Trace": "abc" }, body: { ok: true } });
  const res = await k.handle(req());
  assert.equal(res.status, 200);
  assert.equal(res.headers["x-request-trace"], "abc");
  assert.equal(res.headers["X-Request-Trace"], undefined);
});

// ── raw byte bodies: passive media types only ──
for (const passive of ["text/plain; version=0.0.4; charset=utf-8", "application/octet-stream", "application/json"]) {
  test(`S6 a raw byte body may be labelled ${passive} (control)`, async () => {
    const { k } = kernelReturning({ status: 200, headers: { "content-type": passive }, body: enc.encode("x 1\n") });
    const res = await k.handle(req());
    assert.equal(res.status, 200);
    assert.equal(res.headers["content-type"], passive);
    assert.equal(res.headers["x-content-type-options"], "nosniff");
  });
}
for (const active of ["text/html", "application/javascript", "image/svg+xml", "application/xml", "text/xml", ""]) {
  test(`S6 a raw byte body labelled ${JSON.stringify(active)} is refused`, async () => {
    await expectKernel500({ status: 200, headers: { "content-type": active }, body: enc.encode("<b>x</b>") }, active);
  });
}

// ── defaults ──
test("S6 a JSON success carries application/json, nosniff and no-store", async () => {
  const { k } = kernelReturning({ status: 200, body: { ok: true } });
  const res = await k.handle(req());
  assert.equal(res.headers["content-type"], "application/json");
  assert.equal(res.headers["x-content-type-options"], "nosniff");
  assert.equal(res.headers["cache-control"], "no-store");
});
test("S6 kernel refusals (404, 401) carry nosniff and no-store", async () => {
  const k = createAppKernel({ routes: [{ method: "GET", path: "/r", handler: "h" }], dispatch: { h: () => ({ body: {} }) } });
  for (const r of [await k.handle(req({ path: "/missing" })), await k.handle(req())]) {
    assert.ok(r.status === 404 || r.status === 401);
    assert.equal(r.headers["x-content-type-options"], "nosniff");
    assert.equal(r.headers["cache-control"], "no-store");
    assert.equal(r.headers["content-type"], "application/json");
  }
});
test("S6 cache-control is a default: a handler may set its own (control)", async () => {
  const { k } = kernelReturning({ status: 200, headers: { "Cache-Control": "private, max-age=60" }, body: { ok: true } });
  const res = await k.handle(req());
  assert.equal(res.status, 200);
  assert.equal(res.headers["cache-control"], "private, max-age=60");
  assert.equal(res.headers["x-content-type-options"], "nosniff");
});
test("S6 kernel response headers are frozen", async () => {
  const { k } = kernelReturning({ status: 200, body: { ok: true } });
  const res = await k.handle(req());
  assert.ok(Object.isFrozen(res.headers));
});

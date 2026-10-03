// App-frame review item 5 (S6), wire half: security headers reach the client through the real
// API-server socket, for kernel responses AND for the adapter's own fail-closed refusals; an
// invalid status can never be written to the wire.
import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";

import { createAppKernel } from "../../galerina-framework-app-kernel/dist/index.js";
import { createApiServer, listen } from "../dist/index.js";

function buildKernel() {
  return createAppKernel({
    routes: [
      { method: "GET", path: "/ok", handler: "ok", auth: { mode: "public" } },
      { method: "GET", path: "/forge", handler: "forge", auth: { mode: "public" } },
      { method: "GET", path: "/badstatus", handler: "badstatus", auth: { mode: "public" } },
    ],
    dispatch: {
      ok: () => ({ status: 200, body: { ok: true } }),
      forge: () => ({ status: 200, headers: { "content-type": "text/html" }, body: { ok: true } }),
      badstatus: () => ({ status: NaN, body: { ok: true } }),
    },
  });
}

function request(port, { method, path, headers = {}, body }) {
  return new Promise((resolve, reject) => {
    const r = http.request({ host: "127.0.0.1", port, method, path, headers }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString("utf8") }));
    });
    r.on("error", reject);
    if (body !== undefined) r.write(body);
    r.end();
  });
}

async function withServer(opts, fn) {
  const server = createApiServer({ kernel: buildKernel(), allowInsecureLoopback: true, ...opts });
  const { port } = await listen(server, 0);
  try {
    return await fn(port);
  } finally {
    await new Promise((r) => server.close(() => r(undefined)));
  }
}

function assertSecurityHeaders(res, label) {
  assert.equal(res.headers["x-content-type-options"], "nosniff", `${label}: nosniff`);
  assert.equal(res.headers["cache-control"], "no-store", `${label}: no-store`);
}

test("S6 wire: a kernel success carries nosniff and no-store (control)", async () => {
  await withServer({}, async (port) => {
    const res = await request(port, { method: "GET", path: "/ok" });
    assert.equal(res.status, 200);
    assert.match(res.headers["content-type"], /application\/json/);
    assertSecurityHeaders(res, "200");
  });
});

test("S6 wire: a handler content-type override never reaches the client", async () => {
  await withServer({}, async (port) => {
    const res = await request(port, { method: "GET", path: "/forge" });
    assert.equal(res.status, 500);
    assert.doesNotMatch(res.headers["content-type"], /text\/html/);
    assertSecurityHeaders(res, "forge");
  });
});

test("S6 wire: a NaN handler status becomes 500 on the wire", async () => {
  await withServer({}, async (port) => {
    const res = await request(port, { method: "GET", path: "/badstatus" });
    assert.equal(res.status, 500);
    assertSecurityHeaders(res, "badstatus");
  });
});

test("S6 wire: kernel 404 carries the security headers", async () => {
  await withServer({}, async (port) => {
    const res = await request(port, { method: "GET", path: "/missing" });
    assert.equal(res.status, 404);
    assertSecurityHeaders(res, "404");
  });
});

test("S6 wire: the adapter's own 400 and 413 refusals carry the security headers", async () => {
  await withServer({}, async (port) => {
    const bad = await request(port, { method: "GET", path: "//[" });
    assert.equal(bad.status, 400);
    assertSecurityHeaders(bad, "400");
  });
  await withServer({ maxBodyBytes: 64 }, async (port) => {
    const big = await request(port, { method: "POST", path: "/ok", headers: { "content-type": "application/json" }, body: "x".repeat(4096) });
    assert.equal(big.status, 413);
    assertSecurityHeaders(big, "413");
  });
});

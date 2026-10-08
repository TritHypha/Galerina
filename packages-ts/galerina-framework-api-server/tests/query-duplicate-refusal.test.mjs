/**
 * Duplicate query-name refusal (fail-closed one-decoded-value-per-name contract).
 *
 * Unit tests drive `admitQueryOnce` directly; loaded-server tests drive a REAL App Kernel
 * (and a recording stub kernel, to observe the exact normalised query) through a REAL
 * loopback socket. Before this change `parseUrl` kept only the last value of a repeated name.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { createHmac } from "node:crypto";

import { createAppKernel } from "../../galerina-framework-app-kernel/dist/index.js";
import { createApiServer, listen, MemoryReplayStore } from "../dist/index.js";
import { admitQueryOnce, DuplicateQueryKeyError } from "../dist/query-admission.js";

const params = (search) => new URLSearchParams(search);

// ── Unit: admitQueryOnce ────────────────────────────────────────────────────────────────

test("unit: distinct names are admitted as own enumerable properties", () => {
  const q = admitQueryOnce(params("a=1&b=2&c="));
  assert.deepEqual(q, { a: "1", b: "2", c: "" });
  assert.deepEqual(Object.keys(q), ["a", "b", "c"]);
});

test("unit: a repeated name is refused, never last-value-wins", () => {
  assert.throws(() => admitQueryOnce(params("version=public&version=protected")), DuplicateQueryKeyError);
  assert.throws(() => admitQueryOnce(params("a=1&b=2&a=1")), DuplicateQueryKeyError);
});

test("unit: names compare after percent-decoding", () => {
  assert.throws(() => admitQueryOnce(params("version=1&%76ersion=2")), DuplicateQueryKeyError);
  assert.throws(() => admitQueryOnce(params("a+b=1&a%20b=2")), DuplicateQueryKeyError);
});

test("unit: an empty name counts as a name", () => {
  assert.deepEqual(admitQueryOnce(params("=1")), { "": "1" });
  assert.throws(() => admitQueryOnce(params("=1&=2")), DuplicateQueryKeyError);
});

test("unit: the refusal never carries the name or value", () => {
  let caught;
  try { admitQueryOnce(params("secretname=hunter2&secretname=hunter3")); } catch (err) { caught = err; }
  assert.ok(caught instanceof DuplicateQueryKeyError);
  const text = `${caught.name} ${caught.message} ${String(caught.stack)}`;
  for (const leak of ["secretname", "hunter2", "hunter3"]) assert.equal(text.includes(leak), false, leak);
});

test("unit: __proto__ becomes an own data property and cannot touch the prototype", () => {
  const q = admitQueryOnce(params("__proto__=x&constructor=y"));
  assert.equal(Object.getPrototypeOf(q), Object.prototype);
  assert.ok(Object.prototype.hasOwnProperty.call(q, "__proto__"));
  assert.equal(Object.getOwnPropertyDescriptor(q, "__proto__").value, "x");
  assert.equal(q.constructor, "y");
  assert.throws(() => admitQueryOnce(params("__proto__=x&__proto__=y")), DuplicateQueryKeyError);
});

// ── Loaded server ───────────────────────────────────────────────────────────────────────

function request(port, { method = "GET", path, headers = {}, body }) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port, method, path, headers }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString("utf8") }));
    });
    req.on("error", reject);
    if (body !== undefined) req.write(body);
    req.end();
  });
}

async function withServer(opts, fn) {
  const server = createApiServer({ allowInsecureLoopback: true, ...opts });
  const { port } = await listen(server, 0);
  try {
    return await fn(port);
  } finally {
    await new Promise((r) => server.close(() => r(undefined)));
  }
}

/** Real kernel: one public GET /object route that records handler entry. */
function realKernel(ran) {
  return createAppKernel({
    routes: [{ method: "GET", path: "/object", handler: "object", auth: { mode: "public" } }],
    dispatch: { object: () => { ran.value += 1; return { status: 200, body: { ok: true } }; } },
  });
}

/** Stub kernel that records the exact normalised request it was handed. */
function recordingKernel(seen) {
  return {
    async handle(kreq) {
      seen.push(kreq);
      return { status: 200, headers: { "content-type": "application/json" }, body: new TextEncoder().encode("{}") };
    },
  };
}

test("loaded server: distinct query names still reach the real kernel handler (200)", async () => {
  const ran = { value: 0 };
  await withServer({ kernel: realKernel(ran) }, async (port) => {
    const res = await request(port, { path: "/object?id=7&version=3" });
    assert.equal(res.status, 200);
    assert.equal(ran.value, 1);
  });
});

test("loaded server: repeated object/version name is 400 before the real kernel handler", async () => {
  const ran = { value: 0 };
  await withServer({ kernel: realKernel(ran) }, async (port) => {
    for (const path of [
      "/object?version=public&version=protected",
      "/object?id=7&version=1&%76ersion=2",
      "/object?=a&=b",
    ]) {
      const res = await request(port, { path });
      assert.equal(res.status, 400, path);
      assert.deepEqual(JSON.parse(res.body), { error: "bad_request", message: "Duplicate query parameter." });
      for (const leak of ["version", "public", "protected", "%76"]) assert.equal(res.body.includes(leak), false, leak);
    }
    assert.equal(ran.value, 0, "the handler must never run for an ambiguous query");
  });
});

test("loaded server: the kernel never receives a request with a repeated name", async () => {
  const seen = [];
  await withServer({ kernel: recordingKernel(seen) }, async (port) => {
    const bad = await request(port, { path: "/object?version=public&version=protected" });
    assert.equal(bad.status, 400);
    assert.equal(seen.length, 0);
    const ok = await request(port, { path: "/object?version=protected&__proto__=x" });
    assert.equal(ok.status, 200);
    assert.equal(seen.length, 1);
    assert.equal(seen[0].query.version, "protected");
    assert.ok(Object.prototype.hasOwnProperty.call(seen[0].query, "__proto__"));
    assert.deepEqual(Object.keys(seen[0].query), ["version", "__proto__"]);
  });
});

test("loaded server: a duplicate query is refused before webhook HMAC/replay claim", async () => {
  const seen = [];
  const store = new MemoryReplayStore();
  const claims = [];
  const recordingStore = {
    has: (...a) => store.has(...a),
    put: (...a) => store.put(...a),
    claim: (...a) => { claims.push(a); return store.claim(...a); },
  };
  await withServer({
    kernel: recordingKernel(seen),
    webhook: {
      secret: "test-only-secret",
      signatureHeader: "x-signature",
      eventIdHeader: "x-event-id",
      replayStore: recordingStore,
      replayTtlSeconds: 60,
    },
  }, async (port) => {
    // A correctly signed body: without the refusal this would claim evt-1 and dispatch.
    const body = "{}";
    const signature = createHmac("sha256", "test-only-secret").update(body).digest("hex");
    const headers = { "content-type": "application/json", "x-signature": signature, "x-event-id": "evt-1" };
    const res = await request(port, { method: "POST", path: "/hook?event=a&event=b", headers, body });
    assert.equal(res.status, 400);
    assert.equal(claims.length, 0, "no replay identity may be consumed for an ambiguous target");
    assert.equal(seen.length, 0);
    // The same signed event on an unambiguous target is still admitted exactly once.
    const ok = await request(port, { method: "POST", path: "/hook?event=a", headers, body });
    assert.equal(ok.status, 200);
    assert.equal(claims.length, 1);
    assert.equal(seen.length, 1);
  });
});
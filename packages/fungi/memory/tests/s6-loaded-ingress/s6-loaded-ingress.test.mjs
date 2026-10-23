// S6 (closure path): RD-1413 loaded ingress on POST /auth/verify. RED TESTS FIRST (gcw-s6b, 2026-10-23).
// Zero-trust choice (preflight-s6-01-d211783f): the frozen TS api-server is UNTRUSTED transport.
// kernel.handle receives query as a flat Record, so repeated keys are already erased before any
// Fungi code sees them; a Record-shaped query alone cannot prove "no duplicate" and is UNKNOWN for
// /auth/verify, which must refuse. Only a raw-query custody record (ordered pairs, re-checked by the
// Fungi side for KG-01 duplicate / alias / case collisions) may admit.
// Rejected: (a) trust admitQueryOnce in the TS adapter (single TS decider, frozen TS);
// (b) re-derive from the Record (duplicates already lost, absence cannot be proven).
// Synthetic data only. The SecretsProvider is a synthetic counter (S6 rule).
import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { existsSync } from "node:fs";

const HERE = dirname(fileURLToPath(import.meta.url));
const MEM = join(HERE, "..", "..");
const REPO = join(MEM, "..", "..", "..");
const AK_INDEX_JS = join(REPO, "packages-ts", "galerina-framework-app-kernel", "dist", "index.js");
const API_INDEX_JS = join(REPO, "packages-ts", "galerina-framework-api-server", "dist", "index.js");

function syntheticProvider(counter) {
  return {
    has: (n) => { counter.has += 1; return n === "SYN_VERIFY_KEY"; },
    use: (_n, fn) => { counter.use += 1; fn(new Uint8Array([7, 7, 7])); },
    revocationEpoch: () => 3,
  };
}

function kernelFor(createAppKernel, counter, ran) {
  return createAppKernel({
    routes: [
      { method: "POST", path: "/auth/verify", handler: "verify", auth: { mode: "public" }, secrets: { require: ["SYN_VERIFY_KEY"] } },
      { method: "GET", path: "/syn", handler: "syn", auth: { mode: "public" } },
      { method: "POST", path: "/x/verify", handler: "verify", auth: { mode: "public" }, secrets: { require: ["SYN_VERIFY_KEY"] } },
    ],
    dispatch: {
      verify: ({ getSecret }) => { ran.verify += 1; getSecret("SYN_VERIFY_KEY", () => undefined); return { body: { ok: true } }; },
      syn: () => { ran.syn += 1; return { body: { ok: true } }; },
    },
    secretsProvider: syntheticProvider(counter),
  });
}

let IDEM = 0;
function request(port, { method = "POST", path, body }) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port, method, path, headers: { "idempotency-key": "syn-idem-" + (++IDEM) } }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString("utf8") }));
    });
    req.on("error", reject);
    if (body !== undefined) req.write(body);
    req.end();
  });
}

test("S6-R1a loaded loopback POST /auth/verify refuses duplicate, alias and case-colliding query keys before the provider", async () => {
  assert.equal(existsSync(AK_INDEX_JS), true, "app-kernel not built: " + AK_INDEX_JS);
  assert.equal(existsSync(API_INDEX_JS), true, "api-server not built: " + API_INDEX_JS);
  const { createAppKernel } = await import(pathToFileURL(AK_INDEX_JS).href);
  const { createApiServer, listen } = await import(pathToFileURL(API_INDEX_JS).href);
  for (const path of [
    "/auth/verify?object=a&object=b",
    "/auth/verify?version=1&v=2",
    "/auth/verify?object=a&OBJECT=a",
    "/auth/verify?object=a&%4FBJECT=a",
  ]) {
    const counter = { has: 0, use: 0 };
    const ran = { verify: 0, syn: 0 };
    const server = createApiServer({ allowInsecureLoopback: true, kernel: kernelFor(createAppKernel, counter, ran) });
    const { port } = await listen(server, 0);
    try {
      const res = await request(port, { path });
      assert.notEqual(res.status, 200, path + ": must not succeed");
      assert.equal(ran.verify, 0, path + ": handler never runs");
      assert.equal(counter.has + counter.use, 0, path + ": provider never entered");
    } finally {
      await new Promise((r) => server.close(() => r(undefined)));
    }
  }
});

test("S6-R1b direct kernel.handle POST /auth/verify with a Record query and no raw-query custody refuses (UNKNOWN), provider 0", async () => {
  assert.equal(existsSync(AK_INDEX_JS), true, "app-kernel not built: " + AK_INDEX_JS);
  const { createAppKernel } = await import(pathToFileURL(AK_INDEX_JS).href);
  for (const [label, query] of [["single object key", { object: "a" }], ["empty query", {}]]) {
    const counter = { has: 0, use: 0 };
    const ran = { verify: 0, syn: 0 };
    const kernel = kernelFor(createAppKernel, counter, ran);
    const res = await kernel.handle({ method: "POST", path: "/auth/verify", headers: { "idempotency-key": "syn-idem-r1b" }, body: new Uint8Array(0), query, requestId: "rq-s6-r1b", receivedAt: 0 });
    assert.notEqual(res.status, 200, label + ": Record-only query is UNKNOWN for /auth/verify and must not succeed");
    assert.equal(ran.verify, 0, label + ": handler never runs");
    assert.equal(counter.has + counter.use, 0, label + ": provider never entered");
  }
});

test("S6-R1c control: a non-/auth/verify route with a Record query is unaffected (200)", async () => {
  const { createAppKernel } = await import(pathToFileURL(AK_INDEX_JS).href);
  const counter = { has: 0, use: 0 };
  const ran = { verify: 0, syn: 0 };
  const kernel = kernelFor(createAppKernel, counter, ran);
  const res = await kernel.handle({ method: "GET", path: "/syn", headers: {}, body: new Uint8Array(0), query: { id: "7" }, requestId: "rq-s6-r1c", receivedAt: 0 });
  assert.equal(res.status, 200);
  assert.equal(ran.syn, 1);
});
test("S6-R1d control: the same secret-requiring POST config on a non-/auth/verify path delivers over loopback and direct (refusals above are attributable)", async () => {
  const { createAppKernel } = await import(pathToFileURL(AK_INDEX_JS).href);
  const { createApiServer, listen } = await import(pathToFileURL(API_INDEX_JS).href);
  const counter = { has: 0, use: 0 };
  const ran = { verify: 0, syn: 0 };
  const kernel = kernelFor(createAppKernel, counter, ran);
  const direct = await kernel.handle({ method: "POST", path: "/x/verify", headers: { "idempotency-key": "syn-idem-r1d" }, body: new Uint8Array(0), query: { object: "a" }, requestId: "rq-s6-r1d", receivedAt: 0 });
  assert.equal(direct.status, 200, "direct control delivers");
  const server = createApiServer({ allowInsecureLoopback: true, kernel });
  const { port } = await listen(server, 0);
  try {
    const res = await request(port, { path: "/x/verify?object=a&version=1" });
    assert.equal(res.status, 200, "loopback control delivers");
  } finally {
    await new Promise((r) => server.close(() => r(undefined)));
  }
  assert.equal(ran.verify, 2, "handler ran for both controls");
});
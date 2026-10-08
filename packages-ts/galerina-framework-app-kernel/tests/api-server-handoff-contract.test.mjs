import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  API_SERVER_HANDOFF_SCHEMA,
  FUNGI_APPK_ASH_001,
  FUNGI_APPK_ASH_002,
  FUNGI_APPK_ASH_003,
  FUNGI_APPK_ASH_004,
  FUNGI_APPK_ASH_005,
  KERNEL_HANDOFF_METHODS,
  KERNEL_HANDOFF_REQUEST_OPTIONAL_FIELDS,
  KERNEL_HANDOFF_REQUEST_REQUIRED_FIELDS,
  KERNEL_HANDOFF_RESPONSE_OPTIONAL_FIELDS,
  KERNEL_HANDOFF_RESPONSE_REQUIRED_FIELDS,
  checkKernelHandoffRequest,
  checkKernelHandoffResponse,
} from "../dist/index.js";

const codes = (r) => (r.ok ? [] : r.diagnostics.map((d) => d.code));

function req(overrides = {}) {
  return {
    method: "POST",
    path: "/orders/42",
    headers: { "content-type": "application/json", accept: "application/json, text/plain" },
    body: new TextEncoder().encode("{\"qty\":1}"),
    query: { expand: "items" },
    requestId: "0b9e3f0e-6f1d-4c1e-9a43-2d9a8c7d1e55",
    receivedAt: 1_780_000_000_000,
    ...overrides,
  };
}

/** Field names of an `export interface X { ... }` block in kernel.ts (pins the contract to the shipped type). */
function interfaceFields(source, name) {
  const start = source.indexOf(`export interface ${name} {`);
  assert.ok(start >= 0, `kernel.ts declares ${name}`);
  const end = source.indexOf("\n}", start);
  const body = source.slice(start, end);
  const required = [];
  const optional = [];
  for (const m of body.matchAll(/^\s+readonly (\w+)(\??):/gm)) (m[2] === "?" ? optional : required).push(m[1]);
  return { required, optional };
}

describe("api-server handoff contract - pinned to the shipped types", () => {
  it("request/response field lists match GalerinaKernelRequest/Response in kernel.ts", () => {
    const kernel = readFileSync(new URL("../src/kernel.ts", import.meta.url), "utf8");
    const request = interfaceFields(kernel, "GalerinaKernelRequest");
    assert.deepEqual(request.required, [...KERNEL_HANDOFF_REQUEST_REQUIRED_FIELDS]);
    assert.deepEqual(request.optional, [...KERNEL_HANDOFF_REQUEST_OPTIONAL_FIELDS]);
    const response = interfaceFields(kernel, "GalerinaKernelResponse");
    assert.deepEqual(response.required, [...KERNEL_HANDOFF_RESPONSE_REQUIRED_FIELDS]);
    assert.deepEqual(response.optional, [...KERNEL_HANDOFF_RESPONSE_OPTIONAL_FIELDS]);
  });

  it("method vocabulary matches types.ts HttpMethod", () => {
    const types = readFileSync(new URL("../src/types.ts", import.meta.url), "utf8");
    const m = types.match(/export type HttpMethod = ([^;]+);/);
    assert.ok(m);
    const methods = [...m[1].matchAll(/"([A-Z]+)"/g)].map((x) => x[1]);
    assert.deepEqual(methods, [...KERNEL_HANDOFF_METHODS]);
  });

  it("the api-server builds its kernel request from contract fields only", () => {
    const server = readFileSync(new URL("../../galerina-framework-api-server/src/index.ts", import.meta.url), "utf8");
    const start = server.indexOf("const kreq: GalerinaKernelRequest = {");
    assert.ok(start >= 0);
    const block = server.slice(start, server.indexOf("\n  };", start));
    const fields = new Set([...block.matchAll(/^\s+(?:\.\.\.\(\w+ !== undefined \? \{ )?(\w+)[,:]/gm)].map((x) => x[1]));
    const known = new Set([...KERNEL_HANDOFF_REQUEST_REQUIRED_FIELDS, ...KERNEL_HANDOFF_REQUEST_OPTIONAL_FIELDS]);
    for (const f of KERNEL_HANDOFF_REQUEST_REQUIRED_FIELDS) assert.ok(fields.has(f), `api-server sets ${f}`);
    for (const f of fields) assert.ok(known.has(f), "api-server sets only contract fields");
    assert.match(block, /principalId: principal\.principalId,\s+principalScopes:/, "principal fields travel together");
  });
});

describe("checkKernelHandoffRequest", () => {
  it("admits the shape the api-server hands over, with and without transport facts", () => {
    assert.deepEqual(checkKernelHandoffRequest(req()), { ok: true, schema: API_SERVER_HANDOFF_SCHEMA });
    assert.equal(checkKernelHandoffRequest(req({ body: Buffer.from("x") })).ok, true, "Node Buffer is a Uint8Array");
    assert.equal(checkKernelHandoffRequest(req({ body: new Uint8Array(0), query: {}, headers: {} })).ok, true);
    for (const channelVerdict of [-1, 0, 1]) {
      assert.equal(checkKernelHandoffRequest(req({ channelVerdict })).ok, true);
    }
    assert.equal(checkKernelHandoffRequest(req({ channelVerdict: 1, principalId: "svc:billing", principalScopes: ["orders:write"] })).ok, true);
    assert.equal(checkKernelHandoffRequest(req({ principalId: "svc:billing", principalScopes: [] })).ok, true);
  });

  it("is a data check, not an admission: a DENY verdict is still well-formed", () => {
    const r = checkKernelHandoffRequest(req({ channelVerdict: -1 }));
    assert.equal(r.ok, true);
    assert.equal("admit" in r || "allow" in r, false);
  });

  it("refuses verbs outside the closed vocabulary (api-server normaliseMethod casts any verb)", () => {
    for (const method of ["TRACE", "CONNECT", "PROPFIND", "get", "", 1]) {
      assert.deepEqual(codes(checkKernelHandoffRequest(req({ method }))), [FUNGI_APPK_ASH_002]);
    }
  });

  it("refuses bad paths, ids, times and bodies without echo", () => {
    const bad = [
      { path: "orders" }, { path: "/a?b=1" }, { path: "/a#f" }, { path: "/a\nb" }, { path: "/" + "a".repeat(8192) },
      { requestId: "" }, { requestId: "id with space" }, { requestId: "x".repeat(129) },
      { receivedAt: -1 }, { receivedAt: 1.5 }, { receivedAt: NaN }, { receivedAt: "now" },
      { body: "text" }, { body: [1, 2] }, { body: new ArrayBuffer(2) }, { body: new Proxy(new Uint8Array(1), {}) },
      { channelVerdict: 2 }, { channelVerdict: "1" }, { channelVerdict: -0 }, { channelVerdict: true },
    ];
    for (const o of bad) {
      const r = checkKernelHandoffRequest(req(o));
      assert.deepEqual(codes(r), [FUNGI_APPK_ASH_002], JSON.stringify(Object.keys(o)));
      const text = JSON.stringify(r);
      assert.ok(!text.includes("id with space") && !text.includes("/a?b"));
    }
  });

  it("refuses header/query records that are not closed, lowercase or bounded", () => {
    const getter = {};
    Object.defineProperty(getter, "x", { enumerable: true, get() { throw new Error("must not run"); } });
    const bad = [
      { headers: { "Content-Type": "text/plain" } }, { headers: { "x-a": "v\r\ninjected: 1" } }, { headers: { "x-a": 1 } },
      { headers: getter }, { headers: new Map() }, { headers: [] }, { headers: Object.fromEntries(Array.from({ length: 257 }, (_, i) => [`h${i}`, "v"])) },
      { query: { q: 1 } }, { query: { "": "v" } }, { query: getter }, { query: { q: "x".repeat(8193) } },
    ];
    for (const o of bad) assert.deepEqual(codes(checkKernelHandoffRequest(req(o))), [FUNGI_APPK_ASH_003]);
    const r = checkKernelHandoffRequest(req({ headers: { "x-secret-token": "Bearer sk_live_abc\n" } }));
    assert.ok(!JSON.stringify(r).includes("sk_live_abc") && !JSON.stringify(r).includes("x-secret-token"));
  });

  it("principalId and principalScopes travel together; scopes are dense, unique tokens", () => {
    assert.deepEqual(codes(checkKernelHandoffRequest(req({ principalId: "svc:a" }))), [FUNGI_APPK_ASH_004]);
    assert.deepEqual(codes(checkKernelHandoffRequest(req({ principalScopes: ["a"] }))), [FUNGI_APPK_ASH_004]);
    // eslint-disable-next-line no-sparse-arrays
    for (const principalScopes of [["a", "a"], ["a", ""], ["a", 1], "a", [, "a"], new Proxy(["a"], {}), Array.from({ length: 257 }, (_, i) => `s${i}`)]) {
      assert.deepEqual(codes(checkKernelHandoffRequest(req({ principalId: "svc:a", principalScopes }))), [FUNGI_APPK_ASH_003]);
    }
    assert.deepEqual(codes(checkKernelHandoffRequest(req({ principalId: "", principalScopes: [] }))), [FUNGI_APPK_ASH_002]);
  });

  it("fails closed on non-records, unknown keys, missing fields and accessors", () => {
    for (const bad of [null, undefined, "req", [], new Proxy(req(), {}), Object.create(req()), new (class R {})()]) {
      assert.deepEqual(codes(checkKernelHandoffRequest(bad)), [FUNGI_APPK_ASH_001]);
    }
    assert.deepEqual(codes(checkKernelHandoffRequest({ ...req(), isAdmin: true })), [FUNGI_APPK_ASH_001]);
    const { requestId: _drop, ...missing } = req();
    assert.deepEqual(codes(checkKernelHandoffRequest(missing)), [FUNGI_APPK_ASH_001]);
    let ran = false;
    const acc = req();
    Object.defineProperty(acc, "path", { enumerable: true, get() { ran = true; return "/"; } });
    assert.deepEqual(codes(checkKernelHandoffRequest(acc)), [FUNGI_APPK_ASH_001]);
    assert.equal(ran, false);
    const sym = { ...req(), [Symbol("s")]: 1 };
    assert.deepEqual(codes(checkKernelHandoffRequest(sym)), [FUNGI_APPK_ASH_001]);
    const r = checkKernelHandoffRequest({ ...req(), "secret-key-name": 1 });
    assert.ok(!JSON.stringify(r).includes("secret-key-name"));
    assert.ok(Object.isFrozen(r) && Object.isFrozen(r.diagnostics));
  });
});

describe("checkKernelHandoffResponse", () => {
  it("admits kernel-shaped responses", () => {
    assert.equal(checkKernelHandoffResponse({ status: 200, headers: { "content-type": "application/json" }, body: new Uint8Array([123, 125]) }).ok, true);
    assert.equal(checkKernelHandoffResponse({ status: 404, headers: {} }).ok, true);
  });

  it("refuses bad status, headers or body", () => {
    for (const o of [{ status: 99 }, { status: 600 }, { status: 200.5 }, { status: "200" }, { headers: { "X-A": "v" } }, { headers: { a: "b\r\nc: d" } }, { body: "x" }]) {
      assert.deepEqual(codes(checkKernelHandoffResponse({ status: 200, headers: {}, ...o })), [FUNGI_APPK_ASH_005]);
    }
    assert.deepEqual(codes(checkKernelHandoffResponse({ status: 200, headers: {}, cookie: "x" })), [FUNGI_APPK_ASH_001]);
    assert.deepEqual(codes(checkKernelHandoffResponse({ status: 200 })), [FUNGI_APPK_ASH_001]);
    assert.deepEqual(codes(checkKernelHandoffResponse(null)), [FUNGI_APPK_ASH_001]);
  });

  it("never throws on hostile input", () => {
    const hostile = new Proxy({}, { ownKeys() { throw new Error("boom"); } });
    assert.doesNotThrow(() => checkKernelHandoffRequest(hostile));
    assert.doesNotThrow(() => checkKernelHandoffResponse(hostile));
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  FUNGI_APPK_HRC_001,
  FUNGI_APPK_HRC_002,
  FUNGI_APPK_HRC_003,
  FUNGI_APPK_HRC_004,
  assertHandlerReferences,
  checkHandlerReferences,
  createAppKernel,
} from "../dist/index.js";

const ok = async () => ({ status: 200, body: { ok: true } });
const route = (handler, path = "/x") => ({ method: "GET", path, handler, auth: { mode: "public" } });

function codes(result) {
  assert.equal(result.ok, false);
  return result.diagnostics.map((d) => [d.code, d.routeIndex]);
}

describe("checkHandlerReferences", () => {
  it("accepts routes whose handlers are own function entries", () => {
    assert.deepEqual(checkHandlerReferences([route("a"), route("b", "/y")], { a: ok, b: ok }), { ok: true });
    assert.deepEqual(checkHandlerReferences([], {}), { ok: true });
  });

  it("accepts a null-prototype dispatch", () => {
    const d = Object.assign(Object.create(null), { a: ok });
    assert.deepEqual(checkHandlerReferences([route("a")], d), { ok: true });
  });

  it("refuses a missing handler with the route index", () => {
    assert.deepEqual(codes(checkHandlerReferences([route("a"), route("missing", "/y")], { a: ok })), [
      [FUNGI_APPK_HRC_002, 1],
    ]);
  });

  it("refuses names that resolve only through the prototype chain", () => {
    for (const name of ["toString", "constructor", "hasOwnProperty", "__proto__", "valueOf"]) {
      assert.deepEqual(codes(checkHandlerReferences([route(name)], {})), [[FUNGI_APPK_HRC_003, 0]], name);
    }
    const parent = { inherited: ok };
    assert.deepEqual(codes(checkHandlerReferences([route("inherited")], Object.create(parent))), [
      [FUNGI_APPK_HRC_003, 0],
    ]);
  });

  it("refuses non-function entries and never invokes accessors", () => {
    let invoked = false;
    const d = { notFn: 1, nul: null };
    Object.defineProperty(d, "getter", { enumerable: true, get() { invoked = true; return ok; } });
    assert.deepEqual(codes(checkHandlerReferences([route("notFn"), route("nul", "/n"), route("getter", "/g")], d)), [
      [FUNGI_APPK_HRC_004, 0],
      [FUNGI_APPK_HRC_004, 1],
      [FUNGI_APPK_HRC_004, 2],
    ]);
    assert.equal(invoked, false);
  });

  it("refuses malformed inputs", () => {
    for (const routes of [undefined, null, {}, "routes"]) {
      assert.deepEqual(codes(checkHandlerReferences(routes, {})), [[FUNGI_APPK_HRC_001, undefined]]);
    }
    for (const dispatch of [undefined, null, [], "d", 3]) {
      assert.deepEqual(codes(checkHandlerReferences([route("a")], dispatch)), [[FUNGI_APPK_HRC_001, undefined]]);
    }
    assert.deepEqual(codes(checkHandlerReferences([null, { method: "GET" }, route(""), route(5)], { a: ok })), [
      [FUNGI_APPK_HRC_001, 0],
      [FUNGI_APPK_HRC_001, 1],
      [FUNGI_APPK_HRC_001, 2],
      [FUNGI_APPK_HRC_001, 3],
    ]);
  });

  it("does not read an inherited or accessor 'handler' on the route itself", () => {
    let invoked = false;
    const r = { method: "GET", path: "/x" };
    Object.defineProperty(r, "handler", { get() { invoked = true; return "a"; } });
    assert.deepEqual(codes(checkHandlerReferences([r, Object.create(route("a"))], { a: ok })), [
      [FUNGI_APPK_HRC_001, 0],
      [FUNGI_APPK_HRC_001, 1],
    ]);
    assert.equal(invoked, false);
  });

  it("never echoes the handler name", () => {
    const marker = "SECRETMARKER_handler";
    const r = checkHandlerReferences([route(marker)], {});
    assert.ok(!JSON.stringify(r).includes(marker));
    assert.throws(() => assertHandlerReferences([route(marker)], {}), (e) => {
      assert.ok(!e.message.includes(marker));
      assert.match(e.message, /FUNGI-APPK-HRC-002@route\[0\]/);
      return true;
    });
  });

  it("assertHandlerReferences is silent when every reference resolves", () => {
    assert.equal(assertHandlerReferences([route("a")], { a: ok }), undefined);
  });

  it("documents the gaps it closes: missing handler accepted at boot, inherited handler dispatched", async () => {
    // createAppKernel does not check handler references at construction; the boot check refuses first.
    const routes = [route("missing")];
    assert.doesNotThrow(() => createAppKernel({ routes, dispatch: {} }));
    assert.equal(checkHandlerReferences(routes, {}).ok, false);

    // The kernel's plain property read follows the prototype chain, so an inherited entry is dispatched.
    let called = false;
    const dispatch = Object.create({ inherited: () => { called = true; return { body: { ok: true } }; } });
    const k = createAppKernel({ routes: [route("inherited")], dispatch });
    const res = await k.handle({ method: "GET", path: "/x", headers: {}, query: {}, body: new Uint8Array(0), requestId: "rq", receivedAt: 0 });
    assert.equal(called, true);
    assert.equal(res.status, 200);
    assert.deepEqual(codes(checkHandlerReferences([route("inherited")], dispatch)), [[FUNGI_APPK_HRC_003, 0]]);
  });
});
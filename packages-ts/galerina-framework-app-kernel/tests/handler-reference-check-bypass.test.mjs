import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  FUNGI_APPK_HRC_001,
  FUNGI_APPK_HRC_002,
  FUNGI_APPK_HRC_003,
  checkHandlerReferences,
} from "../dist/index.js";

const ok = async () => ({ status: 200, body: { ok: true } });
const route = (handler, path = "/x") => ({ method: "GET", path, handler, auth: { mode: "public" } });

function codes(result) {
  assert.equal(result.ok, false);
  return result.diagnostics.map((d) => [d.code, d.routeIndex]);
}

describe("checkHandlerReferences bypass controls", () => {
  it("accepts routes whose handlers are own function entries", () => {
    assert.deepEqual(checkHandlerReferences([route("a")], { a: ok }), { ok: true });
  });

  it("refuses an ordinary missing handler", () => {
    const r = checkHandlerReferences([{ handler: "missing" }], {});
    assert.deepEqual(codes(r), [[FUNGI_APPK_HRC_002, 0]]);
    assert.equal(JSON.stringify(r).includes("missing"), false);
  });

  it("refuses a missing-handler array whose own forEach is replaced", () => {
    const routes = [{ handler: "missing" }];
    Object.defineProperty(routes, "forEach", { value: () => {} });
    const r = checkHandlerReferences(routes, {});
    assert.equal(r.ok, false);
    assert.equal(JSON.stringify(r).includes("missing"), false);
    assert.ok(r.diagnostics.some((d) => d.code === FUNGI_APPK_HRC_002));
  });

  it("refuses an array-index getter and never invokes it", () => {
    let invoked = false;
    const routes = [];
    Object.defineProperty(routes, "0", {
      enumerable: true,
      configurable: true,
      get() {
        invoked = true;
        return { handler: "a" };
      },
    });
    routes.length = 1;
    const r = checkHandlerReferences(routes, { a: ok });
    assert.equal(invoked, false);
    assert.deepEqual(codes(r), [[FUNGI_APPK_HRC_001, 0]]);
  });

  it("refuses a Proxy dispatch and never runs getOwnPropertyDescriptor traps", () => {
    let trap = 0;
    const dispatch = new Proxy(
      { a: ok },
      {
        getOwnPropertyDescriptor(target, prop) {
          trap += 1;
          return Object.getOwnPropertyDescriptor(target, prop);
        },
      },
    );
    const r = checkHandlerReferences([route("a")], dispatch);
    assert.equal(trap, 0);
    assert.deepEqual(codes(r), [[FUNGI_APPK_HRC_001, undefined]]);
  });

  it("refuses a handler that resolves only through the prototype chain", () => {
    const parent = { inherited: ok };
    assert.deepEqual(codes(checkHandlerReferences([route("inherited")], Object.create(parent))), [
      [FUNGI_APPK_HRC_003, 0],
    ]);
  });
});

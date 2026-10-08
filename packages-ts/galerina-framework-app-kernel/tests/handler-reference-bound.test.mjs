import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  FUNGI_APPK_HRC_001,
  HANDLER_REFERENCE_MAX_ROUTES,
  checkHandlerReferences,
} from "../src/handler-reference-check.ts";

const ok = async () => ({ status: 200, body: { ok: true } });

describe("checkHandlerReferences table bound", () => {
  it("reuses typed-api-boundary MAX_ROUTES = 256", () => {
    assert.equal(HANDLER_REFERENCE_MAX_ROUTES, 256);
  });

  it("accepts a dense table at the bound", () => {
    const routes = Array.from({ length: HANDLER_REFERENCE_MAX_ROUTES }, () => ({
      method: "GET",
      path: "/x",
      handler: "a",
      auth: { mode: "public" },
    }));
    assert.deepEqual(checkHandlerReferences(routes, { a: ok }), { ok: true });
  });

  it("refuses a sparse oversized table in bounded time", () => {
    const huge = [];
    huge.length = 10_000_000;
    huge[0] = { method: "GET", path: "/x", handler: "a", auth: { mode: "public" } };
    const t0 = Date.now();
    const r = checkHandlerReferences(huge, { a: ok });
    const ms = Date.now() - t0;
    assert.equal(r.ok, false);
    assert.equal(r.diagnostics[0].code, FUNGI_APPK_HRC_001);
    assert.equal(ms < 50, true, `oversized table took ${ms}ms`);
  });
});

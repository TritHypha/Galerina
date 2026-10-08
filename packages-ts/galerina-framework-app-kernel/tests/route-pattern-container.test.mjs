import assert from "node:assert/strict";
import { copyFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  FUNGI_APPK_RPT_001,
  FUNGI_APPK_RPT_004,
  ROUTE_PATTERN_MAX_TABLE,
  checkRoutePatternConflicts,
  compileRoutePattern,
  matchRoutePattern,
} from "../src/route-pattern.ts";

function compiled(path) {
  const r = compileRoutePattern(path);
  assert.equal(r.ok, true, `expected ${JSON.stringify(path)} to compile`);
  return r.pattern;
}

describe("checkRoutePatternConflicts container boundary", () => {
  it("still matches an issued pattern and refuses overlapping issued patterns", () => {
    const issued = compiled("/users/:id");
    assert.equal(matchRoutePattern(issued, "/users/u1").id, "u1");
    const overlap = checkRoutePatternConflicts([compiled("/users/me"), compiled("/users/:id")]);
    assert.equal(overlap.ok, false);
  });

  it("refuses a Proxy array without running get traps", () => {
    const issued = compiled("/users/:id");
    const other = compiled("/posts/:id");
    let traps = 0;
    const proxy = new Proxy([issued, other], {
      get(target, prop, recv) {
        traps += 1;
        return Reflect.get(target, prop, recv);
      },
    });
    const r = checkRoutePatternConflicts(proxy);
    assert.equal(r.ok, false);
    assert.equal(r.diagnostics[0].code, FUNGI_APPK_RPT_001);
    assert.equal(traps, 0);
  });

  it("refuses an ordinary array index getter without invoking it", () => {
    const issued = compiled("/users/:id");
    const other = compiled("/posts/:id");
    let invoked = 0;
    const arr = [];
    arr.length = 2;
    Object.defineProperty(arr, "0", {
      get() {
        invoked += 1;
        return issued;
      },
      enumerable: true,
      configurable: true,
    });
    arr[1] = other;
    const r = checkRoutePatternConflicts(arr);
    assert.equal(r.ok, false);
    assert.equal(r.diagnostics[0].code, FUNGI_APPK_RPT_001);
    assert.equal(invoked, 0);
  });

  it("refuses a sparse oversized table in bounded time using the existing MAX_ROUTES size", () => {
    assert.equal(ROUTE_PATTERN_MAX_TABLE, 256);
    const issued = compiled("/users/:id");
    const huge = [];
    huge.length = 10_000_000;
    huge[0] = issued;
    const t0 = Date.now();
    const r = checkRoutePatternConflicts(huge);
    const ms = Date.now() - t0;
    assert.equal(r.ok, false);
    assert.equal(r.diagnostics[0].code, FUNGI_APPK_RPT_004);
    assert.equal(ms < 50, true, `oversized table took ${ms}ms`);
  });

  it("refuses an issued pattern from a second module instance (per-instance ownership)", async () => {
    const src = fileURLToPath(new URL("../src/route-pattern.ts", import.meta.url));
    const dir = mkdtempSync(join(tmpdir(), "rpt-instance-"));
    const dup = join(dir, "route-pattern.ts");
    copyFileSync(src, dup);
    const other = await import(pathToFileURL(dup).href);
    const local = compiled("/users/:id");
    const foreign = other.compileRoutePattern("/posts/:id");
    assert.equal(foreign.ok, true);
    const r = checkRoutePatternConflicts([local, foreign.pattern]);
    assert.equal(r.ok, false);
    assert.equal(r.diagnostics[0].code, FUNGI_APPK_RPT_001);
    const back = other.checkRoutePatternConflicts([local]);
    assert.equal(back.ok, false);
    assert.equal(back.diagnostics[0].code, FUNGI_APPK_RPT_001);
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  FUNGI_APPK_RPT_001,
  FUNGI_APPK_RPT_002,
  FUNGI_APPK_RPT_003,
  FUNGI_APPK_RPT_004,
  FUNGI_APPK_RPT_005,
  ROUTE_PATTERN_MAX_PARAMS,
  ROUTE_PATTERN_MAX_PATH_CHARS,
  ROUTE_PATTERN_MAX_SEGMENTS,
  ROUTE_PATTERN_MAX_VALUE_CHARS,
  checkRoutePatternConflicts,
  compileRoutePattern,
  matchRoutePattern,
} from "../dist/index.js";

function compiled(path) {
  const r = compileRoutePattern(path);
  assert.equal(r.ok, true, `expected ${JSON.stringify(path)} to compile`);
  return r.pattern;
}

function refusedCodes(path) {
  const r = compileRoutePattern(path);
  assert.equal(r.ok, false, `expected ${JSON.stringify(path)} to be refused`);
  return r.diagnostics.map((d) => d.code);
}

describe("compileRoutePattern: closed grammar", () => {
  it("compiles literals, :param and {param} into one canonical form", () => {
    const p = compiled("/users/:userId/orders/{orderId}");
    assert.equal(p.canonical, "/users/:userId/orders/:orderId");
    assert.deepEqual(p.params, ["userId", "orderId"]);
    assert.deepEqual(p.segments.map((s) => s.kind), ["literal", "param", "literal", "param"]);
    assert.ok(Object.isFrozen(p) && Object.isFrozen(p.segments) && Object.isFrozen(p.params));
  });

  it("compiles the root path with no segments", () => {
    const p = compiled("/");
    assert.equal(p.canonical, "/");
    assert.equal(p.segments.length, 0);
  });

  it("refuses non-strings, relative paths, empty, trailing and double slashes", () => {
    for (const bad of [undefined, null, 42, {}, "", "users", "/users/", "//users", "/a//b"]) {
      assert.deepEqual([...new Set(refusedCodes(bad))], [FUNGI_APPK_RPT_001], String(bad));
    }
  });

  it("refuses over-length patterns", () => {
    assert.deepEqual(refusedCodes("/" + "a".repeat(ROUTE_PATTERN_MAX_PATH_CHARS)), [FUNGI_APPK_RPT_001]);
  });

  it("refuses segments outside the literal / identifier grammar", () => {
    for (const bad of [
      "/users/*", "/files/**", "/a/(.*)", "/a/:id?", "/a/%2F", "/a/b c", "/a/..", "/a/.",
      "/a/:", "/a/{}", "/a/:1id", "/a/:id-x", "/a/{id", "/a/id}", "/a/\u041a", "/a/:__proto__x!",
    ]) {
      assert.ok(refusedCodes(bad).includes(FUNGI_APPK_RPT_002), bad);
    }
  });

  it("accepts __proto__ as a name only into a null-prototype record (no pollution)", () => {
    const p = compiled("/a/:__proto__");
    const v = matchRoutePattern(p, "/a/x");
    assert.equal(Object.getPrototypeOf(v), null);
    assert.equal(Object.getOwnPropertyDescriptor(v, "__proto__").value, "x");
    assert.equal({}.polluted, undefined);
  });

  it("refuses a repeated parameter name, including across :x and {x}", () => {
    assert.deepEqual(refusedCodes("/a/:id/b/{id}"), [FUNGI_APPK_RPT_003]);
  });

  it("bounds segment and parameter counts", () => {
    assert.deepEqual(refusedCodes("/a".repeat(ROUTE_PATTERN_MAX_SEGMENTS + 1)), [FUNGI_APPK_RPT_004]);
    compiled("/a".repeat(ROUTE_PATTERN_MAX_SEGMENTS));
    const many = Array.from({ length: ROUTE_PATTERN_MAX_PARAMS + 1 }, (_, i) => `/:p${i}`).join("");
    assert.deepEqual(refusedCodes(many), [FUNGI_APPK_RPT_004]);
  });

  it("never echoes pattern text in diagnostics", () => {
    const marker = "SECRETMARKER";
    const r = compileRoutePattern(`/a/${marker}*`);
    assert.equal(r.ok, false);
    assert.ok(!JSON.stringify(r).includes(marker));
    assert.equal(r.diagnostics[0].index, 1);
  });
});

describe("matchRoutePattern", () => {
  const p = compiled("/users/:userId/orders/:orderId");

  it("returns raw values in a frozen null-prototype record", () => {
    const v = matchRoutePattern(p, "/users/u-1/orders/o.2");
    assert.deepEqual({ ...v }, { userId: "u-1", orderId: "o.2" });
    assert.equal(Object.getPrototypeOf(v), null);
    assert.ok(Object.isFrozen(v));
  });

  it("does not decode values", () => {
    assert.equal(matchRoutePattern(p, "/users/a%20b/orders/1").userId, "a%20b");
  });

  it("requires exact segment count and case-sensitive literals", () => {
    for (const path of ["/users/u/orders", "/users/u/orders/o/x", "/USERS/u/orders/o", "/users/u/order/o", "users/u/orders/o"]) {
      assert.equal(matchRoutePattern(p, path), undefined, path);
    }
  });

  it("refuses empty, dot, encoded-separator, malformed-percent and over-long values", () => {
    for (const path of [
      "/users//orders/o", "/users/../orders/o", "/users/./orders/o", "/users/a%2Fb/orders/o",
      "/users/a%2fb/orders/o", "/users/a%5Cb/orders/o", "/users/a%zz/orders/o", "/users/a%/orders/o",
      "/users/a b/orders/o", "/users/a\\b/orders/o", `/users/${"x".repeat(ROUTE_PATTERN_MAX_VALUE_CHARS + 1)}/orders/o`,
    ]) {
      assert.equal(matchRoutePattern(p, path), undefined, path);
    }
    assert.ok(matchRoutePattern(p, `/users/${"x".repeat(ROUTE_PATTERN_MAX_VALUE_CHARS)}/orders/o`));
  });

  it("refuses non-string and over-length request paths", () => {
    assert.equal(matchRoutePattern(p, undefined), undefined);
    assert.equal(matchRoutePattern(p, 7), undefined);
    assert.equal(matchRoutePattern(compiled("/:a"), "/" + "a".repeat(ROUTE_PATTERN_MAX_PATH_CHARS)), undefined);
  });

  it("matches the root only against the root pattern", () => {
    assert.deepEqual({ ...matchRoutePattern(compiled("/"), "/") }, {});
    assert.equal(matchRoutePattern(compiled("/"), "/a"), undefined);
    assert.equal(matchRoutePattern(compiled("/:a"), "/"), undefined);
  });

  it("matches literal-only patterns exactly like the current exact-path table", () => {
    const lit = compiled("/health");
    assert.deepEqual({ ...matchRoutePattern(lit, "/health") }, {});
    assert.equal(matchRoutePattern(lit, "/health/"), undefined);
  });
});

describe("checkRoutePatternConflicts: no precedence, overlaps refused", () => {
  it("refuses literal-vs-param overlap rather than inventing precedence", () => {
    const r = checkRoutePatternConflicts([compiled("/users/me"), compiled("/users/:id")]);
    assert.equal(r.ok, false);
    assert.deepEqual(r.diagnostics.map((d) => [d.code, d.index, d.otherIndex]), [[FUNGI_APPK_RPT_005, 1, 0]]);
  });

  it("refuses same-shape patterns with different parameter names", () => {
    const r = checkRoutePatternConflicts([compiled("/a/:x"), compiled("/a/{y}")]);
    assert.equal(r.ok, false);
  });

  it("accepts disjoint patterns", () => {
    const r = checkRoutePatternConflicts([
      compiled("/users/:id"), compiled("/users/:id/orders"), compiled("/orders/:id"), compiled("/"), compiled("/health"),
    ]);
    assert.deepEqual(r, { ok: true });
  });

  it("reports every overlapping pair", () => {
    const r = checkRoutePatternConflicts([compiled("/a/:x/c"), compiled("/a/b/:y"), compiled("/:z/b/c")]);
    assert.equal(r.ok, false);
    assert.deepEqual(r.diagnostics.map((d) => [d.index, d.otherIndex]), [[1, 0], [2, 0], [2, 1]]);
  });
});
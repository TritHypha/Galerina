import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  FUNGI_APPK_RPT_001,
  checkRoutePatternConflicts,
  compileRoutePattern,
  matchRoutePattern,
} from "../dist/index.js";

function compiled(path) {
  const r = compileRoutePattern(path);
  assert.equal(r.ok, true, `expected ${JSON.stringify(path)} to compile`);
  return r.pattern;
}

describe("compileRoutePattern issuance boundary", () => {
  it("matches a request path against an issued compiled pattern", () => {
    const v = matchRoutePattern(compiled("/users/:id"), "/users/u1");
    assert.equal(v.id, "u1");
  });

  it("does not match a Proxy wrapper and never runs get traps", () => {
    const pattern = compiled("/users/:id");
    let traps = 0;
    const proxy = new Proxy(pattern, {
      get(target, prop, recv) {
        traps += 1;
        return Reflect.get(target, prop, recv);
      },
    });
    assert.equal(matchRoutePattern(proxy, "/users/u1"), undefined);
    assert.equal(traps, 0);
  });

  it("does not match a forged plain object with the compiled shape", () => {
    const forged = {
      canonical: "/users/:id",
      segments: [
        { kind: "literal", value: "users" },
        { kind: "param", name: "id" },
      ],
      params: ["id"],
    };
    assert.equal(matchRoutePattern(forged, "/users/u1"), undefined);
  });

  it("refuses an unissued entry in a conflict check without inventing precedence", () => {
    const issued = compiled("/users/:id");
    const forged = {
      canonical: "/users/me",
      segments: [
        { kind: "literal", value: "users" },
        { kind: "literal", value: "me" },
      ],
      params: [],
    };
    const r = checkRoutePatternConflicts([issued, forged]);
    assert.equal(r.ok, false);
    assert.equal(r.diagnostics[0].code, FUNGI_APPK_RPT_001);
    assert.equal(r.diagnostics[0].index, 1);
  });

  it("still refuses overlapping issued patterns with no precedence", () => {
    const r = checkRoutePatternConflicts([compiled("/users/me"), compiled("/users/:id")]);
    assert.equal(r.ok, false);
  });
});

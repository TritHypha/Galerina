/**
 * Array<T>.get(i) must infer Option<T> — parity with Map<K,V>.get() → Option<V>, which was already typed.
 * The bounds-safe accessor returns Option at runtime (callers `match { Some(x) => … None => … }`), so the
 * type-checker must agree. Before this, Array.get() inferred nothing (an asymmetry: Map.get was typed, Array
 * wasn't), so a direct misuse `let x: T = arr.get(i)` slipped through untyped.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as L from "../dist/index.js";

const typeErrors = (src) => {
  const prog = L.parseProgram(`@version 1\n${src}`, "array-get.fungi");
  return L.checkTypes(prog.ast).diagnostics.filter((d) => d.severity === "error");
};

describe("type-checker: Array<T>.get() → Option<T> (Map.get parity)", () => {
  it("using Array<Int>.get() directly as Int is a mismatch — it returns Option<Int>, not Int", () => {
    const errs = typeErrors(
      `pure flow f(a: Array<Int>) -> Int contract { effects {} } { let x: Int = a.get(0)\n  return x }`,
    );
    assert.ok(errs.some((e) => e.code === "FUNGI-TYPE-002"), JSON.stringify(errs));
  });

  it("declaring the binding Option<Int> matches — the inferred type is exactly Option<Int>", () => {
    const errs = typeErrors(
      `pure flow f(a: Array<Int>) -> Option<Int> contract { effects {} } { let x: Option<Int> = a.get(0)\n  return x }`,
    );
    assert.deepEqual(errs.map((e) => e.code), []);
  });
});

/**
 * P9.4 — Array/List `.length()` must lower to __array_length, not __str_length.
 * Both host imports share (param i32)(result i32), so a wrong map is a silent
 * wrong answer rather than an invalid module.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as L from "../dist/index.js";

function compile(src) {
  const prog = L.parseProgram(src, "array-length.fungi");
  const errs = (prog.diagnostics ?? []).filter((d) => d.severity === "error");
  assert.equal(errs.length, 0, errs.map((d) => d.message).join("; "));
  const fx = L.checkEffects(prog.flows, prog.ast);
  const { gir } = L.emitGIR(prog.ast, prog.flows, fx);
  return L.renderWAT(L.buildWATModuleFromGIR(gir, undefined, "wasm-standalone", prog.ast, true));
}

describe("P9.4 type-directed length", () => {
  for (const type of ["Array<Int>", "List<Int>", "String"]) {
    it(`executes ${type}.length with actual host values, including empty`, async () => {
      const wat = compile(`pure flow n(value: ${type}) -> Int contract { effects {} } { return value.length() }`);
      const assembled = await L.assembleWAT(wat);
      assert.equal(assembled.valid, true, JSON.stringify(assembled.diagnostics));
      const runtime = L.createHostRuntime();
      const { instance } = await WebAssembly.instantiate(assembled.wasm, runtime.imports);
      assert.equal(typeof instance.exports.n, "function");
      for (const count of [0, 3]) {
        let handle;
        if (type === "String") {
          handle = runtime.internString(count === 0 ? "" : "abc");
        } else {
          handle = runtime.imports.host.__array_create();
          for (let i = 0; i < count; i++) runtime.imports.host.__array_append(handle, i + 10);
        }
        assert.equal(instance.exports.n(handle), count, `${type} length ${count}`);
      }
    });
  }

  it("positive: String.length lowers to __str_length", () => {
    const wat = compile(`pure flow n(s: String) -> Int contract { effects {} } { return s.length() }`);
    assert.match(wat, /\$host___str_length/);
  });

  it("positive: List.count lowers to __array_length", () => {
    const wat = compile(`pure flow n(xs: List<Int>) -> Int contract { effects {} } { return xs.count() }`);
    assert.match(wat, /\$host___array_length/);
  });

  it("hostile: List.length must not call __str_length", () => {
    const wat = compile(`pure flow n(xs: List<Int>) -> Int contract { effects {} } { return xs.length() }`);
    assert.match(wat, /\$host___array_length/);
    assert.doesNotMatch(wat, /\$host___str_length/);
  });
});

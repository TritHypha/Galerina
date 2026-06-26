/**
 * P9.4c — export gating for governed flows.
 *
 * A `guarded` flow is pure computation wrapped in DAG-edge governance, so it lowers
 * to a real WAT body (P9.4a). But export was pure-only, so `galerina run --invoke
 * <guardedFlow>` could not reach it. Now guarded-no-effect flows are exported too —
 * this test proves a guarded flow is both EXPORTED and INVOCABLE in real WASM.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  parseProgram, checkEffects, emitGIR,
  buildWATModuleFromGIR, renderWAT, assembleWAT,
} from "../dist/index.js";

async function compile(src) {
  const prog = parseProgram(src, "test.spore");
  const errs = (prog.diagnostics ?? []).filter((d) => d.severity === "error");
  if (errs.length > 0) throw new Error("Parse: " + errs.map((d) => d.message).join("; "));
  const fx = checkEffects(prog.flows, prog.ast);
  const { gir } = emitGIR(prog.ast, prog.flows, fx);
  const wat = renderWAT(buildWATModuleFromGIR(gir, undefined, "wasm", prog.ast, true));
  return wat;
}

describe("P9.4c: guarded flows are exported and invocable", () => {
  it("exports a guarded flow and runs it in WASM", async () => {
    const src =
      "guarded flow clamp(x: Int) -> Int contract { effects {} } { return x + 1 }";
    const wat = await compile(src);
    assert.match(wat, /\(export "clamp" \(func \$clamp\)\)/, "guarded flow is exported");
    const asm = await assembleWAT(wat);
    assert.equal(asm.valid, true, JSON.stringify(asm.diagnostics));
    const { instance } = await WebAssembly.instantiate(asm.wasm, {});
    assert.equal(instance.exports.clamp(41), 42, "invoking the guarded export returns x+1");
  });

  it("a pure flow alongside a guarded flow: both exported", async () => {
    const src =
      "pure flow dbl(n: Int) -> Int contract { effects {} } { return n * 2 }\n" +
      "guarded flow inc(n: Int) -> Int contract { effects {} } { return n + 1 }";
    const wat = await compile(src);
    assert.match(wat, /\(export "dbl"/);
    assert.match(wat, /\(export "inc"/);
    const asm = await assembleWAT(wat);
    const { instance } = await WebAssembly.instantiate(asm.wasm, {});
    assert.equal(instance.exports.dbl(21), 42);
    assert.equal(instance.exports.inc(41), 42);
  });
});

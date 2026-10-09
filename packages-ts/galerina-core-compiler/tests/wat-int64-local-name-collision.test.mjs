import { test } from "node:test";
import assert from "node:assert/strict";
import * as L from "../dist/index.js";

for (const [local, valueType] of [["save", "Int"], ["v64", "Int"], ["unrelated", "Int"], ["save", "Int64"]]) {
  test(`${valueType} return validates with unrelated Int64 local ${local}`, async () => {
    const source = `@version 1
pure flow probe(n: ${valueType}) -> Int64
contract { intent { "exact local identity during return widening" } }
{
  let ${local}: Int64 = 99
  let v: ${valueType} = n
  return v
}`;
    const prog = L.parseProgram(source, "int64-local-collision.fungi");
    assert.deepEqual((prog.diagnostics ?? []).filter(d => d.severity === "error"), []);
    const fx = L.checkEffects(prog.flows, prog.ast);
    const { gir } = L.emitGIR(prog.ast, prog.flows, fx);
    const wat = L.renderWAT(L.buildWATModuleFromGIR(gir, undefined, "collision", prog.ast, true));
    const asm = await L.assembleWAT(wat);
    assert.equal(asm.valid, true, JSON.stringify(asm.diagnostics));
  });
}

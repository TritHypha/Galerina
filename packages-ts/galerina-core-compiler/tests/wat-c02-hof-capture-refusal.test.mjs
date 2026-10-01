/**
 * Named HOF callbacks that capture outer/free identifiers must refuse at WAT
 * emit (FUNGI-WAT-HOF-001). Capture-free named unary/binary flows keep lowering.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as L from "../dist/index.js";

function compileWAT(src) {
  const parsed = L.parseProgram(src, "c02-cap.fungi");
  const errs = parsed.diagnostics.filter((d) => d.severity === "error");
  assert.equal(errs.length, 0, "parse: " + errs.map((e) => e.message).join("; "));
  const fx = L.checkEffects(parsed.flows, parsed.ast);
  const { gir } = L.emitGIR(parsed.ast, parsed.flows, fx);
  return L.renderWAT(L.buildWATModuleFromGIR(gir, undefined, "c02-cap", parsed.ast, true));
}

function refuseWAT(src) {
  const parsed = L.parseProgram(src, "c02-cap.fungi");
  const errs = parsed.diagnostics.filter((d) => d.severity === "error");
  assert.equal(errs.length, 0, "parse: " + errs.map((e) => e.message).join("; "));
  const fx = L.checkEffects(parsed.flows, parsed.ast);
  const { gir } = L.emitGIR(parsed.ast, parsed.flows, fx);
  try {
    const wat = L.renderWAT(L.buildWATModuleFromGIR(gir, undefined, "c02-cap", parsed.ast, true));
    return { threw: false, wat };
  } catch (err) {
    return { threw: true, error: err };
  }
}

describe("capture-free named HOF stays lowered", () => {
  it("unary map of a param-only flow still emits a helper", () => {
    const wat = compileWAT(`
pure flow double(x: Int) -> Int
contract { effects {} }
{ return x * 2 }

pure flow mapped(xs: Array<Int>) -> Array<Int>
contract { effects {} }
{ return xs.map(double) }
`);
    assert.ok(wat.includes("$fungi_array_map_double"), wat);
    assert.ok(!/FUNGI-WAT-HOF-001/.test(wat), wat);
  });

  it("unary map of a named flow with a local let still emits a helper", () => {
    const wat = compileWAT(`
pure flow add3(x: Int) -> Int
contract { effects {} }
{
  let k = 3
  return x + k
}

pure flow mapped(xs: Array<Int>) -> Array<Int>
contract { effects {} }
{ return xs.map(add3) }
`);
    assert.ok(wat.includes("$fungi_array_map_add3"), wat);
    assert.ok(!/FUNGI-WAT-HOF-001/.test(wat), wat);
  });

  it("binary reduce of a param-only flow still emits a helper", () => {
    const wat = compileWAT(`
pure flow add(a: Int, b: Int) -> Int
contract { effects {} }
{ return a + b }

pure flow folded(xs: Array<Int>) -> Int
contract { effects {} }
{ return xs.reduce(0, add) }
`);
    assert.ok(wat.includes("$fungi_array_reduce_add"), wat);
  });
});

describe("named capturing HOF compile-time refusal", () => {
  it("map of a named flow that uses a free identifier refuses FUNGI-WAT-HOF-001", () => {
    const r = refuseWAT(`
pure flow addK(x: Int) -> Int
contract { effects {} }
{ return x + k }

pure flow mapped(xs: Array<Int>) -> Array<Int>
contract { effects {} }
{ return xs.map(addK) }
`);
    assert.equal(r.threw, true, r.wat);
    assert.match(String(r.error?.message ?? r.error), /FUNGI-WAT-HOF-001/);
    assert.match(String(r.error?.message ?? r.error), /\bmap\b/);
    assert.match(String(r.error?.message ?? r.error), /undeclared identifier/i);
    assert.equal(r.wat, undefined);
  });

  it("filter of a named flow that uses a free identifier refuses FUNGI-WAT-HOF-001", () => {
    const r = refuseWAT(`
pure flow keepK(x: Int) -> Bool
contract { effects {} }
{ return x > k }

pure flow kept(xs: Array<Int>) -> Array<Int>
contract { effects {} }
{ return xs.filter(keepK) }
`);
    assert.equal(r.threw, true, r.wat);
    assert.match(String(r.error?.message ?? r.error), /FUNGI-WAT-HOF-001/);
    assert.match(String(r.error?.message ?? r.error), /\bfilter\b/);
    assert.match(String(r.error?.message ?? r.error), /undeclared identifier/i);
  });

  it("reduce of a named flow that uses a free identifier refuses FUNGI-WAT-HOF-001", () => {
    const r = refuseWAT(`
pure flow addK(a: Int, b: Int) -> Int
contract { effects {} }
{ return a + b + k }

pure flow folded(xs: Array<Int>) -> Int
contract { effects {} }
{ return xs.reduce(0, addK) }
`);
    assert.equal(r.threw, true, r.wat);
    assert.match(String(r.error?.message ?? r.error), /FUNGI-WAT-HOF-001/);
    assert.match(String(r.error?.message ?? r.error), /\breduce\b/);
    assert.match(String(r.error?.message ?? r.error), /undeclared identifier/i);
  });
});

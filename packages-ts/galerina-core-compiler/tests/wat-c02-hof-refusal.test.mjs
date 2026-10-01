/**
 * C02 HOF: named capture-free flows keep lowering; anonymous / non-qualifying
 * map/filter/reduce must refuse at compile time (FUNGI-WAT-HOF-001), not emit
 * a C02 (unreachable) stub.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as L from "../dist/index.js";

function compileWAT(src) {
  const parsed = L.parseProgram(src, "c02-hof.fungi");
  const errs = parsed.diagnostics.filter((d) => d.severity === "error");
  assert.equal(errs.length, 0, "parse: " + errs.map((e) => e.message).join("; "));
  const fx = L.checkEffects(parsed.flows, parsed.ast);
  const { gir } = L.emitGIR(parsed.ast, parsed.flows, fx);
  return L.renderWAT(L.buildWATModuleFromGIR(gir, undefined, "c02-hof", parsed.ast, true));
}

function refuseWAT(src) {
  const parsed = L.parseProgram(src, "c02-hof.fungi");
  const errs = parsed.diagnostics.filter((d) => d.severity === "error");
  assert.equal(errs.length, 0, "parse: " + errs.map((e) => e.message).join("; "));
  const fx = L.checkEffects(parsed.flows, parsed.ast);
  const { gir } = L.emitGIR(parsed.ast, parsed.flows, fx);
  try {
    const wat = L.renderWAT(L.buildWATModuleFromGIR(gir, undefined, "c02-hof", parsed.ast, true));
    return { threw: false, wat };
  } catch (err) {
    return { threw: true, error: err };
  }
}

describe("C02 named capture-free HOF positives", () => {
  it("named unary map still lowers to a helper", () => {
    const wat = compileWAT(`
pure flow double(x: Int) -> Int
contract { effects {} }
{ return x * 2 }

pure flow mapped(xs: Array<Int>) -> Array<Int>
contract { effects {} }
{ return xs.map(double) }
`);
    assert.ok(wat.includes("$fungi_array_map_double"), wat);
    assert.ok(!wat.includes("C02:"), wat);
  });

  it("named unary filter still lowers to a helper", () => {
    const wat = compileWAT(`
pure flow keep(x: Int) -> Bool
contract { effects {} }
{ return x > 0 }

pure flow kept(xs: Array<Int>) -> Array<Int>
contract { effects {} }
{ return xs.filter(keep) }
`);
    assert.ok(wat.includes("$fungi_array_filter_keep"), wat);
    assert.ok(!wat.includes("C02:"), wat);
  });

  it("named binary reduce still lowers to a helper", () => {
    const wat = compileWAT(`
pure flow add(a: Int, b: Int) -> Int
contract { effects {} }
{ return a + b }

pure flow folded(xs: Array<Int>) -> Int
contract { effects {} }
{ return xs.reduce(0, add) }
`);
    assert.ok(wat.includes("$fungi_array_reduce_add"), wat);
    assert.ok(!wat.includes("C02:"), wat);
  });
});

describe("C02 anonymous/non-qualifying HOF compile-time refusal", () => {
  it("unknown map name refuses FUNGI-WAT-HOF-001 and does not emit unreachable", () => {
    const r = refuseWAT(`
pure flow mapped(xs: Array<Int>) -> Array<Int>
contract { effects {} }
{ return xs.map(missing) }
`);
    assert.equal(r.threw, true, r.wat);
    assert.match(String(r.error?.message ?? r.error), /FUNGI-WAT-HOF-001/);
    assert.match(String(r.error?.message ?? r.error), /\bmap\b/);
    assert.equal(r.wat, undefined);
  });

  it("unknown filter name refuses FUNGI-WAT-HOF-001", () => {
    const r = refuseWAT(`
pure flow kept(xs: Array<Int>) -> Array<Int>
contract { effects {} }
{ return xs.filter(missing) }
`);
    assert.equal(r.threw, true, r.wat);
    assert.match(String(r.error?.message ?? r.error), /FUNGI-WAT-HOF-001/);
    assert.match(String(r.error?.message ?? r.error), /\bfilter\b/);
  });

  it("unknown reduce name refuses FUNGI-WAT-HOF-001", () => {
    const r = refuseWAT(`
pure flow folded(xs: Array<Int>) -> Int
contract { effects {} }
{ return xs.reduce(0, missing) }
`);
    assert.equal(r.threw, true, r.wat);
    assert.match(String(r.error?.message ?? r.error), /FUNGI-WAT-HOF-001/);
    assert.match(String(r.error?.message ?? r.error), /\breduce\b/);
  });

  it("wrong-arity named flow for map refuses FUNGI-WAT-HOF-001", () => {
    const r = refuseWAT(`
pure flow add(a: Int, b: Int) -> Int
contract { effects {} }
{ return a + b }

pure flow mapped(xs: Array<Int>) -> Array<Int>
contract { effects {} }
{ return xs.map(add) }
`);
    assert.equal(r.threw, true, r.wat);
    assert.match(String(r.error?.message ?? r.error), /FUNGI-WAT-HOF-001/);
    assert.match(String(r.error?.message ?? r.error), /\bmap\b/);
  });

  it("wrong-arity named flow for filter refuses FUNGI-WAT-HOF-001", () => {
    const r = refuseWAT(`
pure flow add(a: Int, b: Int) -> Int
contract { effects {} }
{ return a + b }

pure flow kept(xs: Array<Int>) -> Array<Int>
contract { effects {} }
{ return xs.filter(add) }
`);
    assert.equal(r.threw, true, r.wat);
    assert.match(String(r.error?.message ?? r.error), /FUNGI-WAT-HOF-001/);
    assert.match(String(r.error?.message ?? r.error), /\bfilter\b/);
  });

  it("wrong-arity named flow for reduce refuses FUNGI-WAT-HOF-001", () => {
    const r = refuseWAT(`
pure flow double(x: Int) -> Int
contract { effects {} }
{ return x * 2 }

pure flow folded(xs: Array<Int>) -> Int
contract { effects {} }
{ return xs.reduce(0, double) }
`);
    assert.equal(r.threw, true, r.wat);
    assert.match(String(r.error?.message ?? r.error), /FUNGI-WAT-HOF-001/);
    assert.match(String(r.error?.message ?? r.error), /\breduce\b/);
  });

  it("non-identifier map callback refuses FUNGI-WAT-HOF-001", () => {
    const r = refuseWAT(`
pure flow mapped(xs: Array<Int>) -> Array<Int>
contract { effects {} }
{ return xs.map(1) }
`);
    assert.equal(r.threw, true, r.wat);
    assert.match(String(r.error?.message ?? r.error), /FUNGI-WAT-HOF-001/);
  });
});

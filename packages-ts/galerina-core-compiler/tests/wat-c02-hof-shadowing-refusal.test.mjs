/**
 * Call-site HOF shadowing: map/filter/reduce must refuse when the callback
 * identifier is a local or parameter, even if a same-named top-level flow exists.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as L from "../dist/index.js";

function compileWAT(src) {
  const parsed = L.parseProgram(src, "c02-sh.fungi");
  const errs = parsed.diagnostics.filter((d) => d.severity === "error");
  assert.equal(errs.length, 0, "parse: " + errs.map((e) => e.message).join("; "));
  const fx = L.checkEffects(parsed.flows, parsed.ast);
  const { gir } = L.emitGIR(parsed.ast, parsed.flows, fx);
  return L.renderWAT(L.buildWATModuleFromGIR(gir, undefined, "c02-sh", parsed.ast, true));
}

function refuseWAT(src) {
  const parsed = L.parseProgram(src, "c02-sh.fungi");
  const errs = parsed.diagnostics.filter((d) => d.severity === "error");
  assert.equal(errs.length, 0, "parse: " + errs.map((e) => e.message).join("; "));
  const fx = L.checkEffects(parsed.flows, parsed.ast);
  const { gir } = L.emitGIR(parsed.ast, parsed.flows, fx);
  try {
    const wat = L.renderWAT(L.buildWATModuleFromGIR(gir, undefined, "c02-sh", parsed.ast, true));
    return { threw: false, wat };
  } catch (err) {
    return { threw: true, error: err };
  }
}

function assertShadowRefuse(r, method) {
  assert.equal(r.threw, true, r.wat);
  const msg = String(r.error?.message ?? r.error);
  assert.match(msg, /FUNGI-WAT-HOF-001/);
  assert.match(msg, new RegExp(`\\b${method}\\b`));
  assert.match(msg, /local value/i);
  assert.equal(r.wat, undefined);
}

describe("unshadowed named HOF stays lowered", () => {
  it("map of a capture-free named flow still emits a helper when a different local exists", () => {
    const wat = compileWAT(`
pure flow double(x: Int) -> Int
contract { effects {} }
{ return x * 2 }

pure flow mapped(xs: Array<Int>) -> Array<Int>
contract { effects {} }
{
  let k = 3
  return xs.map(double)
}
`);
    assert.ok(wat.includes("$fungi_array_map_double"), wat);
    assert.ok(!/FUNGI-WAT-HOF-001/.test(wat), wat);
  });
});

describe("call-site shadowed HOF compile-time refusal", () => {
  it("map with let-shadowed callback refuses FUNGI-WAT-HOF-001", () => {
    const r = refuseWAT(`
pure flow double(x: Int) -> Int
contract { effects {} }
{ return x * 2 }

pure flow mapped(xs: Array<Int>) -> Array<Int>
contract { effects {} }
{
  let double = 3
  return xs.map(double)
}
`);
    assertShadowRefuse(r, "map");
  });

  it("map with param-shadowed callback refuses FUNGI-WAT-HOF-001", () => {
    const r = refuseWAT(`
pure flow double(x: Int) -> Int
contract { effects {} }
{ return x * 2 }

pure flow mapped(xs: Array<Int>, double: Int) -> Array<Int>
contract { effects {} }
{ return xs.map(double) }
`);
    assertShadowRefuse(r, "map");
  });

  it("filter with let-shadowed callback refuses FUNGI-WAT-HOF-001", () => {
    const r = refuseWAT(`
pure flow keep(x: Int) -> Bool
contract { effects {} }
{ return x > 0 }

pure flow kept(xs: Array<Int>) -> Array<Int>
contract { effects {} }
{
  let keep = 1
  return xs.filter(keep)
}
`);
    assertShadowRefuse(r, "filter");
  });

  it("filter with param-shadowed callback refuses FUNGI-WAT-HOF-001", () => {
    const r = refuseWAT(`
pure flow keep(x: Int) -> Bool
contract { effects {} }
{ return x > 0 }

pure flow kept(xs: Array<Int>, keep: Int) -> Array<Int>
contract { effects {} }
{ return xs.filter(keep) }
`);
    assertShadowRefuse(r, "filter");
  });

  it("reduce with let-shadowed callback refuses FUNGI-WAT-HOF-001", () => {
    const r = refuseWAT(`
pure flow add(a: Int, b: Int) -> Int
contract { effects {} }
{ return a + b }

pure flow folded(xs: Array<Int>) -> Int
contract { effects {} }
{
  let add = 0
  return xs.reduce(0, add)
}
`);
    assertShadowRefuse(r, "reduce");
  });

  it("reduce with param-shadowed callback refuses FUNGI-WAT-HOF-001", () => {
    const r = refuseWAT(`
pure flow add(a: Int, b: Int) -> Int
contract { effects {} }
{ return a + b }

pure flow folded(xs: Array<Int>, add: Int) -> Int
contract { effects {} }
{ return xs.reduce(0, add) }
`);
    assertShadowRefuse(r, "reduce");
  });
});

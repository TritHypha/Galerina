import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as L from "../dist/index.js";

function compileWAT(src) {
  const parsed = L.parseProgram(src, "c02.fungi");
  const errs = parsed.diagnostics.filter((d) => d.severity === "error");
  assert.equal(errs.length, 0, "parse: " + errs.map((e) => e.message).join("; "));
  const fx = L.checkEffects(parsed.flows, parsed.ast);
  const { gir } = L.emitGIR(parsed.ast, parsed.flows, fx);
  return L.renderWAT(L.buildWATModuleFromGIR(gir, undefined, "dec", parsed.ast, true));
}

describe("C02 Decimal WAT ABI", () => {
  it("Decimal + Decimal lowers to the exact host add, never f64.add", () => {
    const wat = compileWAT(`pure flow add(a: Decimal, b: Decimal) -> Decimal
contract { effects {} }
{ return a + b }`);
    assert.ok(!wat.includes("f64.add"), wat);
    assert.ok(wat.includes("$host___decimal_add"), wat);
    assert.ok(!wat.includes("unreachable"), wat);
  });

  it("Decimal comparison uses host compare, never f64.lt", () => {
    const wat = compileWAT(`pure flow lt(a: Decimal, b: Decimal) -> Bool
contract { effects {} }
{ return a < b }`);
    assert.ok(!wat.includes("f64.lt"), wat);
    assert.ok(wat.includes("$host___decimal_compare"), wat);
  });

  it("Decimal constructor and toString use host handles", () => {
    const wat = compileWAT(`pure flow one() -> String
contract { effects {} }
{ return Decimal("1.0").toString() }`);
    assert.ok(wat.includes("$host___decimal_from_str"), wat);
    assert.ok(wat.includes("$host___decimal_to_str"), wat);
  });
});

describe("C02 capture-free array HOF ABI", () => {
  it("map of a named unary flow emits a helper, not unreachable", () => {
    const wat = compileWAT(`
pure flow double(x: Int) -> Int
contract { effects {} }
{ return x * 2 }

pure flow mapped(xs: Array<Int>) -> Array<Int>
contract { effects {} }
{ return xs.map(double) }
`);
    assert.ok(wat.includes("$fungi_array_map_double"), wat);
    assert.ok(!/unknown method 'map'/.test(wat), wat);
  });

  it("reduce of a named binary flow emits a helper, not unreachable", () => {
    const wat = compileWAT(`
pure flow add(a: Int, b: Int) -> Int
contract { effects {} }
{ return a + b }

pure flow folded(xs: Array<Int>) -> Int
contract { effects {} }
{ return xs.reduce(0, add) }
`);
    assert.ok(wat.includes("$fungi_array_reduce_add"), wat);
    assert.ok(!/C02: reduce is not in the capture-free unary ABI/.test(wat), wat);
  });
});

describe("C02 host Decimal oracle", () => {
  it("adds exact tenths without binary float", () => {
    const rt = L.createHostRuntime();
    const host = rt.imports.host;
    const a = rt.internDecimal("0.1");
    const b = rt.internDecimal("0.2");
    const sum = host.__decimal_add(a, b);
    assert.equal(rt.readDecimal(sum), "0.3");
  });

  it("refuses a malformed constructor string", () => {
    const rt = L.createHostRuntime();
    const host = rt.imports.host;
    const bad = rt.internString("not-a-decimal");
    assert.throws(() => host.__decimal_from_str(bad), /MalformedDecimal/);
  });

  it("divides with an explicit scale and halfEven mode", () => {
    const rt = L.createHostRuntime();
    const host = rt.imports.host;
    const a = rt.internDecimal("1");
    const b = rt.internDecimal("8");
    const mode = rt.internString("halfEven");
    const q = host.__decimal_div(a, b, 2, mode);
    assert.equal(rt.readDecimal(q), "0.12");
  });

  it("remainder is exact", () => {
    const rt = L.createHostRuntime();
    const host = rt.imports.host;
    const a = rt.internDecimal("10");
    const b = rt.internDecimal("3");
    assert.equal(rt.readDecimal(host.__decimal_rem(a, b)), "1");
  });
});

describe("C02 instantiate parity", () => {
  it("WASM Decimal add matches the host exact sum", async () => {
    const src = `pure flow add(a: Decimal, b: Decimal) -> Decimal
contract { effects {} }
{ return a + b }`;
    const parsed = L.parseProgram(src, "c02-inst.fungi");
    assert.equal(parsed.diagnostics.filter((d) => d.severity === "error").length, 0);
    const fx = L.checkEffects(parsed.flows, parsed.ast);
    const { gir } = L.emitGIR(parsed.ast, parsed.flows, fx);
    const wat = L.renderWAT(L.buildWATModuleFromGIR(gir, undefined, "c02-inst", parsed.ast, true));
    const asm = await L.assembleWAT(wat);
    assert.ok(asm.valid, JSON.stringify(asm.diagnostics));
    const host = L.createHostRuntime();
    const kp = L.generateRunnerKeypair();
    const att = L.signWasm(asm.wasm, kp.privateKeyPem, "dev");
    const { instance } = await L.admitAndInstantiate({
      wasm: asm.wasm,
      attestation: att,
      policy: { requireSigned: true, publicKeyPem: kp.publicKeyPem },
      host,
    });
    const a = host.internDecimal("0.1");
    const b = host.internDecimal("0.2");
    const sum = instance.exports.add(a, b);
    assert.equal(host.readDecimal(sum), "0.3");
  });
});

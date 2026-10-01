// rounding-wat-exact-numeric — R2 / R3 / R4 / K4b (Grok Bot rounding work, 2026-09-30).
// The WASM backend lowers ONLY the exact Decimal host ABI and the per-currency Money constructors; every
// other Decimal/Money form is a NAMED compile-time refusal (FUNGI-WAT-DECIMAL-001 / FUNGI-WAT-MONEY-001),
// never an i32 op on an opaque handle and never a deferred `(unreachable)` stub. Where both backends run,
// the interpreter and WASM agree value-for-value and label-for-label (differential, plus an independent
// hand-computed oracle so a bug shared by both backends cannot pass).
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as L from "../dist/index.js";

function parse(src, file) {
  const parsed = L.parseProgram(src, file);
  const errs = (parsed.diagnostics ?? []).filter((d) => d.severity === "error");
  assert.equal(errs.length, 0, "parse: " + errs.map((e) => e.message).join("; "));
  return parsed;
}
function compile(src, file = "rounding-wat.fungi") {
  const parsed = parse(src, file);
  const fx = L.checkEffects(parsed.flows, parsed.ast);
  const { gir } = L.emitGIR(parsed.ast, parsed.flows, fx);
  return L.renderWAT(L.buildWATModuleFromGIR(gir, undefined, "wasm-standalone", parsed.ast, true));
}
async function instantiate(wat) {
  const asm = await L.assembleWAT(wat);
  assert.equal(asm.valid && asm.diagnostics.length === 0, true, "wabt: " + JSON.stringify(asm.diagnostics));
  const host = L.createHostRuntime();
  for (const entry of L.getInternedStrings()) host.seedString(entry.handle, entry.value);
  const { instance } = await WebAssembly.instantiate(asm.wasm, host.imports);
  return { host, exports: instance.exports };
}
async function interp(src, flow, args) {
  const parsed = parse(src, "rounding-interp.fungi");
  L.resolveSymbols(parsed.ast);
  return (await L.executeFlow(flow, args, parsed.ast, parsed.flows)).value;
}
const dec = (v) => ({ __tag: "decimal", value: v });
const flow = (sig, body) => `pure flow ${sig}\ncontract { effects {} }\n{ ${body} }`;

describe("K4b / R8 — Decimal forms outside the host ABI are named compile-time refusals", () => {
  const refuses = (src, re = /FUNGI-WAT-DECIMAL-001/) => assert.throws(() => compile(src), re);
  it("mixed Decimal × Int / Float operators", () => {
    refuses(flow("f(a: Decimal) -> Decimal", "return a + 1"));
    refuses(flow("f(a: Decimal) -> Bool", "return a < 0.0"));
  });
  it("the partial '/' and '%' operators", () => {
    refuses(flow("f(a: Decimal, b: Decimal) -> Decimal", "return a / b"));
    refuses(flow("f(a: Decimal, b: Decimal) -> Decimal", "return a % b"));
  });
  it("a mistyped divide (missing / computed / unknown mode, Float divisor, non-Int scale)", () => {
    refuses(flow("f(a: Decimal, b: Decimal) -> Decimal", "return a.divide(b, 2)"));
    refuses(flow("f(a: Decimal, b: Decimal, m: String) -> Decimal", "return a.divide(b, 2, m)"));
    refuses(flow("f(a: Decimal, b: Decimal) -> Decimal", 'return a.divide(b, 2, "nearest")'));
    refuses(flow("f(a: Decimal) -> Decimal", 'return a.divide(2.5, 2, "halfEven")'));
    refuses(flow("f(a: Decimal, b: Decimal) -> Decimal", 'return a.divide(b, "2", "halfEven")'));
  });
  it("Decimal methods with no host lowering", () => {
    refuses(flow("f(a: Decimal) -> Decimal", 'return a.round(2, "halfEven")'));
    refuses(flow("f(a: Decimal) -> Decimal", "return a.abs()"));
  });
});

describe("R3 — Int operands enter Decimal only through the exact __decimal_from_int", () => {
  it("Decimal.fromInt(n) and an Int divisor lower to __decimal_from_int (import declared)", () => {
    const w1 = compile(flow("f(n: Int) -> Decimal", "return Decimal.fromInt(n)"));
    assert.ok(w1.includes("(call $host___decimal_from_int"), w1);
    assert.ok(/\(import "host" "__decimal_from_int"/.test(w1), w1);
    const w2 = compile(flow("f(a: Decimal) -> Decimal", 'return a.divide(4, 2, "halfEven")'));
    assert.ok(w2.includes("(call $host___decimal_from_int"), w2);
  });
  it("Decimal.fromInt parity: interpreter == WASM", async () => {
    const src = flow("f(a: Decimal, n: Int) -> Decimal", "return a + Decimal.fromInt(n)");
    const { host, exports } = await instantiate(compile(src));
    const w = host.readDecimal(exports.f(host.internDecimal("0.50"), 7));
    const i = await interp(src, "f", new Map([["a", dec("0.50")], ["n", { __tag: "int", value: 7 }]]));
    assert.equal(w, "7.50");
    assert.deepEqual(i, dec("7.50"));
  });
});

describe("R3 / R6 — the seven-mode divide matrix (11 values × 7 modes = 77 cases): oracle == interpreter == WASM", () => {
  // a.divide(1, 1, mode): every dividend has two decimals, so rounding to one decimal exercises the
  // tie (…5) and non-tie digits on both signs. Hand-computed oracle (not derived from either backend).
  const A = ["1.25", "1.35", "1.24", "1.26", "-1.25", "-1.35", "-1.24", "-1.26", "0.05", "-0.05", "0.00"];
  const ORACLE = {
    halfEven: ["1.2", "1.4", "1.2", "1.3", "-1.2", "-1.4", "-1.2", "-1.3", "0.0", "0.0", "0.0"],
    halfUp:   ["1.3", "1.4", "1.2", "1.3", "-1.3", "-1.4", "-1.2", "-1.3", "0.1", "-0.1", "0.0"],
    halfDown: ["1.2", "1.3", "1.2", "1.3", "-1.2", "-1.3", "-1.2", "-1.3", "0.0", "0.0", "0.0"],
    up:       ["1.3", "1.4", "1.3", "1.3", "-1.3", "-1.4", "-1.3", "-1.3", "0.1", "-0.1", "0.0"],
    down:     ["1.2", "1.3", "1.2", "1.2", "-1.2", "-1.3", "-1.2", "-1.2", "0.0", "0.0", "0.0"],
    ceiling:  ["1.3", "1.4", "1.3", "1.3", "-1.2", "-1.3", "-1.2", "-1.2", "0.1", "0.0", "0.0"],
    floor:    ["1.2", "1.3", "1.2", "1.2", "-1.3", "-1.4", "-1.3", "-1.3", "0.0", "-0.1", "0.0"],
  };
  for (const [mode, expected] of Object.entries(ORACLE)) {
    it(`mode ${mode}`, async () => {
      const src = flow("q(a: Decimal, b: Decimal) -> Decimal", `return a.divide(b, 1, "${mode}")`);
      const { host, exports } = await instantiate(compile(src, `matrix-${mode}.fungi`));
      for (let k = 0; k < A.length; k++) {
        const w = host.readDecimal(exports.q(host.internDecimal(A[k]), host.internDecimal("1")));
        const i = await interp(src, "q", new Map([["a", dec(A[k])], ["b", dec("1")]]));
        assert.equal(w, expected[k], `WASM ${A[k]} ${mode}`);
        assert.deepEqual(i, dec(expected[k]), `interpreter ${A[k]} ${mode}`);
      }
    });
  }
});

describe("R6 — label and value parity at the boundary", () => {
  it("divide by zero: the walker's trap label == the WASM host trap label (DivisionByZero)", async () => {
    const src = flow("q(a: Decimal, b: Decimal) -> Decimal", 'return a.divide(b, 2, "halfEven")');
    const { host, exports } = await instantiate(compile(src));
    assert.throws(() => exports.q(host.internDecimal("1"), host.internDecimal("0")), /DivisionByZero/);
    const i = await interp(src, "q", new Map([["a", dec("1")], ["b", dec("0")]]));
    assert.equal(i.__tag, "runtimeError");
    assert.equal(i.message, "DivisionByZero");
  });
  it("0.10 == 0.1 is true on both backends (value equality, not text or handle identity)", async () => {
    const src = flow("e(a: Decimal, b: Decimal) -> Bool", "return a == b");
    const { host, exports } = await instantiate(compile(src));
    assert.equal(exports.e(host.internDecimal("0.10"), host.internDecimal("0.1")), 1);
    const i = await interp(src, "e", new Map([["a", dec("0.10")], ["b", dec("0.1")]]));
    assert.deepEqual(i, { __tag: "bool", value: true });
  });
  it("a non-canonical Decimal text is refused on both backends (MalformedDecimal)", async () => {
    const src = flow("c() -> Decimal", 'return Decimal("1e3")');
    const { exports } = await instantiate(compile(src));
    assert.throws(() => exports.c(), /MalformedDecimal/);
    const i = await interp(src, "c", new Map());
    assert.equal(i.__tag, "runtimeError");
    assert.equal(i.message, "MalformedDecimal");
  });
});

describe("R2 — Money in WASM: constructors lower; every other Money form is FUNGI-WAT-MONEY-001", () => {
  const refuses = (src) => assert.throws(() => compile(src), /FUNGI-WAT-MONEY-001/);
  it("a constructor still lowers to its host import", () => {
    const wat = compile(flow("m() -> Money<GBP>", 'return Money.gbp("1.00")'));
    assert.ok(wat.includes("(call $host___money_gbp"), wat);
  });
  it("operators, comparisons and unary minus on Money are refused", () => {
    refuses(flow("f(a: Money<GBP>, b: Money<GBP>) -> Money<GBP>", "return a + b"));
    refuses(flow("f(a: Money<GBP>, b: Money<GBP>) -> Bool", "return a == b"));
    refuses(flow("f() -> Bool", 'return Money.gbp("1.00") < Money.gbp("2.00")'));
    refuses(flow("f(a: Money<GBP>) -> Money<GBP>", "return -a"));
  });
  it("every Money method and Money.of are refused", () => {
    refuses(flow("f(a: Money<GBP>) -> String", "return a.toString()"));
    refuses(flow("f(a: Money<GBP>) -> Money<GBP>", 'return a.multiply(Decimal("2"), "halfEven")'));
    refuses(flow("f(a: Money<GBP>) -> Decimal", "return a.amount()"));
    refuses(flow("f() -> Money<CHF>", 'return Money.of("1.00", "CHF")'));
  });
});

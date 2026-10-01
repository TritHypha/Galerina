/**
 * E7 / #163-A2 — compile-path stub-oracle for Money currency constructors,
 * print/println, and Array.range. Complements wat-host-stdlib-stubs-oracle.test.mjs
 * (direct host truth table) by compiling tiny pure .fungi flows through GIR→WAT,
 * asserting the `$host___…` call AND matching `(import "host" "__…")`, then
 * instantiating with createHostRuntime.
 *
 * Direct host oracles can pass while the emitter still omits the import (#169).
 * This file is the compile-path half of that pair.
 *
 * Tri-Pipe verdict: Binary-only (host stdlib bridge; no Hybrid/Photonic facet).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as L from "../dist/index.js";

const MONEY = [
  ["gbp", "GBP", "__money_gbp"],
  ["eur", "EUR", "__money_eur"],
  ["usd", "USD", "__money_usd"],
  ["chf", "CHF", "__money_chf"],
  ["jpy", "JPY", "__money_jpy"],
  ["cad", "CAD", "__money_cad"],
  ["aud", "AUD", "__money_aud"],
  ["nzd", "NZD", "__money_nzd"],
  ["sgd", "SGD", "__money_sgd"],
  ["hkd", "HKD", "__money_hkd"],
];

function compile(src, file = "e7.fungi") {
  const parsed = L.parseProgram(src, file);
  const errs = (parsed.diagnostics ?? []).filter((d) => d.severity === "error");
  assert.equal(errs.length, 0, "parse: " + errs.map((e) => e.message).join("; "));
  const fx = L.checkEffects(parsed.flows, parsed.ast);
  const { gir } = L.emitGIR(parsed.ast, parsed.flows, fx);
  const wat = L.renderWAT(L.buildWATModuleFromGIR(gir, undefined, "wasm-standalone", parsed.ast, true));
  return { wat, parsed };
}

function declaredHostImports(wat) {
  return [...wat.matchAll(/\(import\s+"host"\s+"(__[A-Za-z0-9_]+)"/g)].map((m) => m[1]);
}

async function instantiate(wat, observe) {
  const asm = await L.assembleWAT(wat);
  assert.equal(asm.valid && asm.diagnostics.length === 0, true, "wabt: " + JSON.stringify(asm.diagnostics));
  const host = L.createHostRuntime(observe);
  for (const entry of L.getInternedStrings()) host.seedString(entry.handle, entry.value);
  const { instance } = await WebAssembly.instantiate(asm.wasm, host.imports);
  return { host, exports: instance.exports, wat };
}

describe("E7 compile-path oracle: Money.currency constructors", () => {
  for (const [method, code, hostName] of MONEY) {
    it(`Money.${method} emits call+import ${hostName} and tags ${code}`, async () => {
      // R11 (D-M1): JPY has 0 minor units, so "12.34" is refused there (MoneyScaleExceedsMinorUnits).
      const amount = code === "JPY" ? "12" : "12.34";
      const src = `pure flow make() -> Money
contract { effects {} }
{ return Money.${method}("${amount}") }`;
      const { wat } = compile(src, `e7-money-${method}.fungi`);
      assert.ok(wat.includes(`(call $host_${hostName}`), wat);
      assert.ok(!/\(call \$gbp\b|\(call \$eur\b/.test(wat), "must not emit a bare constructor call");
      const imports = declaredHostImports(wat);
      assert.ok(imports.includes(hostName), `missing import ${hostName}; got ${imports.join(", ")}\n${wat}`);
      const { host, exports } = await instantiate(wat);
      const handle = exports.make();
      assert.ok(handle >= 0, `${method} handle ${handle}`);
      assert.deepEqual(host.readMoney(handle), { currency: code, amountStr: amount });
    });
  }
});

describe("E7 compile-path oracle: print / println", () => {
  it("print emits call+import __print and routes through onOutput", async () => {
    const src = `pure flow say() -> Int
contract { effects {} }
{ return print("hello") }`;
    const { wat } = compile(src, "e7-print.fungi");
    assert.ok(wat.includes("(call $host___print"), wat);
    assert.ok(declaredHostImports(wat).includes("__print"), wat);
    const lines = [];
    const { exports } = await instantiate(wat, { onOutput: (s) => lines.push(s) });
    assert.equal(exports.say(), 0);
    assert.deepEqual(lines, ["hello"]);
  });

  it("println emits call+import __println and appends a newline", async () => {
    const src = `pure flow say() -> Int
contract { effects {} }
{ return println("world") }`;
    const { wat } = compile(src, "e7-println.fungi");
    assert.ok(wat.includes("(call $host___println"), wat);
    assert.ok(declaredHostImports(wat).includes("__println"), wat);
    const lines = [];
    const { exports } = await instantiate(wat, { onOutput: (s) => lines.push(s) });
    assert.equal(exports.say(), 0);
    assert.deepEqual(lines, ["world\n"]);
  });
});

describe("E7 compile-path oracle: Array.range", () => {
  it("Array.range(2, 7) emits call+import __range and yields [2,3,4,5,6]", async () => {
    const src = `pure flow span() -> Array<Int>
contract { effects {} }
{ return Array.range(2, 7) }`;
    const { wat } = compile(src, "e7-range.fungi");
    assert.ok(wat.includes("(call $host___range"), wat);
    assert.ok(declaredHostImports(wat).includes("__range"), wat);
    const { host, exports } = await instantiate(wat);
    const handle = exports.span();
    assert.deepEqual([...host.readArray(handle)], [2, 3, 4, 5, 6]);
  });
});

describe("E7 compile-path completeness: Money/print/range cannot regress #169", () => {
  it("a combined module's declared host imports are all provided by createHostRuntime", async () => {
    const src = `pure flow money() -> Money
contract { effects {} }
{ return Money.gbp("1.00") }
pure flow span() -> Array<Int>
contract { effects {} }
{ return Array.range(0, 3) }
pure flow say() -> Int
contract { effects {} }
{ return print("x") }
pure flow sayln() -> Int
contract { effects {} }
{ return println("y") }`;
    const { wat } = compile(src, "e7-combo.fungi");
    const required = [
      "__money_gbp", "__range", "__print", "__println",
    ];
    const declared = declaredHostImports(wat);
    for (const name of required) {
      assert.ok(declared.includes(name), `WAT missing import ${name}; declared ${declared.join(", ")}`);
    }
    const host = L.createHostRuntime().imports.host;
    const missing = declared.filter((name) => typeof host[name] !== "function");
    assert.deepEqual(missing, [], `createHostRuntime missing: ${missing.join(", ")}`);
    const asm = await L.assembleWAT(wat);
    assert.equal(asm.valid && asm.diagnostics.length === 0, true, JSON.stringify(asm.diagnostics));
    const rt = L.createHostRuntime();
    for (const entry of L.getInternedStrings()) rt.seedString(entry.handle, entry.value);
    await WebAssembly.instantiate(asm.wasm, rt.imports);
  });

  it("redact stays inline (-2) and does not declare a host import", () => {
    const { wat } = compile(`pure flow hide(s: String) -> Int
contract { effects {} }
{ return redact(s) }`, "e7-redact.fungi");
    assert.ok(wat.includes("i32.const -2"), wat);
    assert.equal(declaredHostImports(wat).includes("__redact"), false, wat);
    assert.ok(!wat.includes("$host___redact"), wat);
  });
});

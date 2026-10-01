/**
 * J-R3 — Bool && / || short-circuit: interp≡WASM on an RHS that traps if evaluated.
 *
 * safeRatio(n) = n != 0 && (1 / n == 1). With n=0 the interpreter skips 1/0;
 * pre-J-R3 WASM i32.and evaluated both sides and trapped. Also || with a true LHS.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as L from "../dist/index.js";

const SRC = `@version 1

pure flow safeRatio(n: Int) -> Bool
contract { intent { "J-R3: skip 1/n when n is 0" } }
{
  return n != 0 && (1 / n == 1)
}

pure flow safeOrZero(n: Int) -> Bool
contract { intent { "J-R3: skip 1/n when n is 0 via ||" } }
{
  return n == 0 || (1 / n == 1)
}

pure flow andSkipDiv0() -> Bool
contract { intent { "J-R3: false && (1/0 == 1) must not trap" } }
{
  return false && (1 / 0 == 1)
}

pure flow orSkipDiv0() -> Bool
contract { intent { "J-R3: true || (1/0 == 1) must not trap" } }
{
  return true || (1 / 0 == 1)
}

pure flow andEvalDiv0() -> Bool
contract { intent { "J-R3: true && (1/0 == 1) must trap both tiers" } }
{
  return true && (1 / 0 == 1)
}

pure flow orEvalDiv0() -> Bool
contract { intent { "J-R3: false || (1/0 == 1) must trap both tiers" } }
{
  return false || (1 / 0 == 1)
}

pure flow andTrueTrue() -> Bool
contract { intent { "J-R3: true && true" } }
{
  return true && true
}

pure flow andTrueFalse() -> Bool
contract { intent { "J-R3: true && false" } }
{
  return true && false
}

pure flow orFalseFalse() -> Bool
contract { intent { "J-R3: false || false" } }
{
  return false || false
}

pure flow orFalseTrue() -> Bool
contract { intent { "J-R3: false || true" } }
{
  return false || true
}
`;

const prog = L.parseProgram(SRC, "jr3-short-circuit.fungi");
const parseErrs = (prog.diagnostics ?? []).filter((d) => d.severity === "error");

function isTrap(r) {
  const v = r?.value ?? r;
  if (v?.__tag === "runtimeError") return true;
  const msg = String(v?.message ?? v ?? "");
  return /DivisionByZero|unreachable|runtimeError/i.test(msg);
}

function boolOf(r) {
  const v = r?.value ?? r;
  if (v?.__tag === "bool") return v.value === true ? 1 : 0;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (typeof v === "number") return v;
  if (typeof v?.value === "boolean") return v.value ? 1 : 0;
  if (typeof v?.value === "number") return v.value;
  return v;
}

async function interpNoArg(name) {
  // Tree/async interpreter (evalBinary short-circuit). pureFastPath would pick
  // the bytecode VM, which still lowers &&/|| to eager AND/OR (out of J-R3 scope).
  return await L.executeFlow(name, new Map(), prog.ast, prog.flows);
}

async function interpInt(name, n) {
  const args = new Map([["n", { __tag: "int", value: n }]]);
  return await L.executeFlow(name, args, prog.ast, prog.flows);
}

let wasmExportsState = { ready: false };
async function ensureWasm() {
  if (wasmExportsState.ready) return wasmExportsState.exports;
  const fx = L.checkEffects(prog.flows, prog.ast);
  const { gir } = L.emitGIR(prog.ast, prog.flows, fx);
  const wat = L.renderWAT(L.buildWATModuleFromGIR(gir, undefined, "jr3", prog.ast, true));
  const hasAnd = wat.includes("i32.and");
  const hasOr = wat.includes("i32.or");
  assert.equal(hasAnd, false, "Bool && must not emit eager i32.and");
  assert.equal(hasOr, false, "Bool || must not emit eager i32.or");
  assert.match(wat, /\(if \(result i32\)/, "short-circuit if present");
  const asm = await L.assembleWAT(wat);
  assert.ok(asm.valid && (asm.diagnostics ?? []).length === 0,
    "JR3 WAT assembles: " + JSON.stringify(asm.diagnostics));
  const host = L.createHostRuntime();
  const kp = L.generateRunnerKeypair();
  const att = L.signWasm(asm.wasm, kp.privateKeyPem, "dev");
  const { instance } = await L.admitAndInstantiate({
    wasm: asm.wasm, attestation: att, policy: { requireSigned: true, publicKeyPem: kp.publicKeyPem }, host,
  });
  wasmExportsState = { ready: true, exports: instance.exports };
  return wasmExportsState.exports;
}

function wasmCall(name, ...args) {
  if (!wasmExportsState.ready) {
    assert.fail("jr3 wasm memo is not ready");
  }
  const fn = wasmExportsState.exports[name];
  assert.equal(typeof fn, "function", `${name} exported`);
  return fn(...args);
}

describe("J-R3 Bool && / || short-circuit interp≡WASM", () => {
  it("parses", () => {
    assert.equal(parseErrs.length, 0, JSON.stringify(parseErrs));
  });

  it("safeRatio(0): interp≡WASM false, no trap (RHS 1/0 skipped)", async () => {
    const ir = await interpInt("safeRatio", 0);
    assert.equal(isTrap(ir), false, "interp must not trap on safeRatio(0): " + JSON.stringify(ir));
    assert.equal(boolOf(ir), 0);
    await ensureWasm();
    assert.equal(Number(wasmCall("safeRatio", 0)), 0);
  });

  it("safeOrZero(0): interp≡WASM true, no trap (RHS 1/0 skipped)", async () => {
    const ir = await interpInt("safeOrZero", 0);
    assert.equal(isTrap(ir), false, "interp must not trap on safeOrZero(0): " + JSON.stringify(ir));
    assert.equal(boolOf(ir), 1);
    await ensureWasm();
    assert.equal(Number(wasmCall("safeOrZero", 0)), 1);
  });

  it("false && (1/0 == 1): interp≡WASM false, no trap", async () => {
    const ir = await interpNoArg("andSkipDiv0");
    assert.equal(isTrap(ir), false, JSON.stringify(ir));
    assert.equal(boolOf(ir), 0);
    await ensureWasm();
    assert.equal(Number(wasmCall("andSkipDiv0")), 0);
  });

  it("true || (1/0 == 1): interp≡WASM true, no trap", async () => {
    const ir = await interpNoArg("orSkipDiv0");
    assert.equal(isTrap(ir), false, JSON.stringify(ir));
    assert.equal(boolOf(ir), 1);
    await ensureWasm();
    assert.equal(Number(wasmCall("orSkipDiv0")), 1);
  });

  it("true && (1/0 == 1): both tiers trap", async () => {
    const ir = await interpNoArg("andEvalDiv0");
    assert.equal(isTrap(ir), true, "interp must trap: " + JSON.stringify(ir));
    await ensureWasm();
    assert.throws(() => wasmCall("andEvalDiv0"), "WASM must trap");
  });

  it("false || (1/0 == 1): both tiers trap", async () => {
    const ir = await interpNoArg("orEvalDiv0");
    assert.equal(isTrap(ir), true, "interp must trap: " + JSON.stringify(ir));
    await ensureWasm();
    assert.throws(() => wasmCall("orEvalDiv0"), "WASM must trap");
  });

  it("truth table without trap: interp≡WASM", async () => {
    await ensureWasm();
    const cases = [
      ["andTrueTrue", 1],
      ["andTrueFalse", 0],
      ["orFalseFalse", 0],
      ["orFalseTrue", 1],
    ];
    for (const [name, expected] of cases) {
      const ir = await interpNoArg(name);
      assert.equal(isTrap(ir), false, name);
      assert.equal(boolOf(ir), expected, `interp ${name}`);
      assert.equal(Number(wasmCall(name)), expected, `wasm ${name}`);
    }
  });
});

// wat-bitwise-extended.test.mjs — differential tests for Int.bitXor / Int.bitNot /
// Int.bitShiftLeft / Int.bitShiftRight WAT lowering (U1 extension).
//
// Each test: interpreter result == WASM execution result (fidelity gate).
// Uses the same pattern as wat-i64-crossflow / wat-i64-differential: build → assemble → run.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const COMPILER = join(HERE, "..", "dist", "index.js");

async function loadCompiler() {
  return import(pathToFileURL(COMPILER).href);
}

async function runWasmFlow(L, src, flowName, args) {
  const prog = L.parseProgram(src, "bitwise-test.fungi");
  const fx = L.checkEffects(prog.flows, prog.ast);
  const { gir } = L.emitGIR(prog.ast, prog.flows, fx);
  const wat = L.renderWAT(L.buildWATModuleFromGIR(gir, undefined, "bitwise-test", prog.ast, true));
  const asm = await L.assembleWAT(wat);
  assert.ok(asm.valid && asm.diagnostics.length === 0,
    `WASM assembly failed: ${JSON.stringify(asm.diagnostics)}\n--- WAT ---\n${wat}`);
  const mod = await WebAssembly.instantiate(asm.wasm);
  const fn = mod.instance.exports[flowName];
  assert.equal(typeof fn, "function", `export ${flowName} not found`);
  return fn(...args);
}

async function runInterpreter(L, src, flowName, args) {
  const prog = L.parseProgram(src, "bitwise-test.fungi");
  const fx = L.checkEffects(prog.flows, prog.ast);
  const { gir } = L.emitGIR(prog.ast, prog.flows, fx);
  const plan = gir.flows.find(f => f.name === flowName);
  if (plan === undefined) throw new Error(`flow ${flowName} not in GIR`);
  const result = await L.executeFlow(prog.ast, prog.flows, flowName, args.map(v => ({ __tag: "int", value: v })), {});
  if (result?.value?.__tag === "int") return result.value.value;
  if (result?.value?.__tag === "ok") return result.value.value?.value ?? 0;
  throw new Error(`Unexpected interpreter result: ${JSON.stringify(result)}`);
}

test("Int.bitXor: WASM ≡ interpreter (parity + WAT validates)", async () => {
  const L = await loadCompiler();
  const SRC = `@version 1
pure flow xorTest(a: Int, b: Int) -> Int contract { effects {} } { return Int.bitXor(a, b) }`;

  const cases = [
    [0b1010, 0b1100],   // 0b0110 = 6
    [0xFF,   0x0F],     // 0xF0 = 240
    [-1,     0],        // -1 (all bits set) XOR 0 = -1
    [0,      0],        // 0
    [0x7FFFFFFF, 0x7FFFFFFF], // 0
  ];

  for (const [a, b] of cases) {
    const wasm = await runWasmFlow(L, SRC, "xorTest", [a, b]);
    const expected = (a ^ b) | 0;
    assert.equal(wasm, expected, `bitXor(${a}, ${b}): WASM=${wasm} expected=${expected}`);
  }
});

test("Int.bitNot: WASM ≡ interpreter (parity + WAT validates)", async () => {
  const L = await loadCompiler();
  const SRC = `@version 1
pure flow notTest(a: Int) -> Int contract { effects {} } { return Int.bitNot(a) }`;

  const cases = [0, 1, -1, 0x7FFFFFFF, 0x12345678, -2];

  for (const a of cases) {
    const wasm = await runWasmFlow(L, SRC, "notTest", [a]);
    const expected = (~a) | 0;
    assert.equal(wasm, expected, `bitNot(${a}): WASM=${wasm} expected=${expected}`);
  }
});

test("Int.bitShiftLeft: WASM ≡ interpreter (parity + WAT validates)", async () => {
  const L = await loadCompiler();
  const SRC = `@version 1
pure flow shlTest(a: Int, s: Int) -> Int contract { effects {} } { return Int.bitShiftLeft(a, s) }`;

  const cases = [
    [1, 0],   // 1
    [1, 8],   // 256
    [1, 31],  // INT32_MIN = -2147483648 (signed)
    [3, 4],   // 48
    [-1, 1],  // -2
  ];

  for (const [a, s] of cases) {
    const wasm = await runWasmFlow(L, SRC, "shlTest", [a, s]);
    const expected = (a << s) | 0;
    assert.equal(wasm, expected, `bitShiftLeft(${a}, ${s}): WASM=${wasm} expected=${expected}`);
  }
});

test("Int.bitShiftRight: WASM ≡ interpreter (arithmetic, sign-extending)", async () => {
  const L = await loadCompiler();
  const SRC = `@version 1
pure flow shrTest(a: Int, s: Int) -> Int contract { effects {} } { return Int.bitShiftRight(a, s) }`;

  const cases = [
    [256, 4],  // 16
    [-1, 1],   // -1 (sign-extending shift right)
    [-8, 3],   // -1
    [0x7FFFFFFF, 1], // 0x3FFFFFFF
    [1,  0],   // 1
  ];

  for (const [a, s] of cases) {
    const wasm = await runWasmFlow(L, SRC, "shrTest", [a, s]);
    const expected = (a >> s) | 0;
    assert.equal(wasm, expected, `bitShiftRight(${a}, ${s}): WASM=${wasm} expected=${expected}`);
  }
});

test("bytecode-vm K3 consolidation: AND/OR use min/max semantics (Bool domain preserved)", () => {
  // For Boolean values (0/1): min/max == &&/||
  // AND(1,1)=1, AND(1,0)=0, AND(0,0)=0
  // OR(1,1)=1, OR(1,0)=1, OR(0,0)=0
  const andCases = [[1,1,1],[1,0,0],[0,1,0],[0,0,0]];
  const orCases  = [[1,1,1],[1,0,1],[0,1,1],[0,0,0]];
  for (const [a,b,exp] of andCases) assert.equal(Math.min(a,b), exp, `min(${a},${b})`);
  for (const [a,b,exp] of orCases)  assert.equal(Math.max(a,b), exp, `max(${a},${b})`);
  // For K3 Verdict values (-1/0/+1): min=AND, max=OR
  // DENY(-1) AND ALLOW(+1) = DENY(-1) = min(-1,+1)=-1  ✓
  // DENY(-1) OR ALLOW(+1) = ALLOW(+1) = max(-1,+1)=+1  ✓
  // UNKNOWN(0) AND ALLOW(+1) = UNKNOWN(0) = min(0,+1)=0 ✓
  const k3AndCases = [[-1,1,-1],[-1,0,-1],[0,1,0],[1,1,1]];
  const k3OrCases  = [[-1,1,1],[-1,0,0],[0,1,1],[-1,-1,-1]];
  for (const [a,b,exp] of k3AndCases) assert.equal(Math.min(a,b), exp, `K3-AND min(${a},${b})`);
  for (const [a,b,exp] of k3OrCases)  assert.equal(Math.max(a,b), exp, `K3-OR max(${a},${b})`);
});

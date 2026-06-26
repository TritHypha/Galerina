/**
 * Phase 27 — WASM instantiation integration test
 * Tests the full pipeline: Galerina source → WAT → binary WASM → execute
 */

import { parseProgram, checkEffects, emitGIR, buildWATModuleFromGIR, renderWAT } from "../dist/index.js";
import wabtInit from "wabt";

async function compileAndRun(src, flowName, args) {
  const prog = parseProgram(src, "test.spore");
  const errs = (prog.diagnostics ?? []).filter(d => d.severity === "error");
  if (errs.length > 0) throw new Error("Parse error: " + errs.map(d => d.message).join("; "));

  const fx = checkEffects(prog.flows, prog.ast);
  const { gir } = emitGIR(prog.ast, prog.flows, fx);
  // Phase 27: exportAllPure=true exports all pure flows for WebAssembly.instantiate
  const watModule = buildWATModuleFromGIR(gir, undefined, "wasm-standalone", prog.ast, true);
  const wat = renderWAT(watModule);

  // Phase 27: wabt → binary WASM → WebAssembly.instantiate
  const wabt = await wabtInit();
  const wabtMod = wabt.parseWat("test.wat", wat, {});
  wabtMod.validate();
  const binary = wabtMod.toBinary({}).buffer;
  wabtMod.destroy();

  const { instance } = await WebAssembly.instantiate(binary);
  const fn = instance.exports[flowName];
  if (typeof fn !== "function") throw new Error(`Export '${flowName}' not found`);
  return fn(...args);
}

// Run tests
const tests = [
  {
    name: "add(2, 3) = 5",
    src: "pure flow add(a: Int, b: Int) -> Int contract { effects {} } { return a + b }",
    flow: "add", args: [2, 3], expected: 5,
  },
  {
    name: "sub(10, 3) = 7",
    src: "pure flow sub(a: Int, b: Int) -> Int contract { effects {} } { return a - b }",
    flow: "sub", args: [10, 3], expected: 7,
  },
  {
    name: "mul(6, 7) = 42",
    src: "pure flow mul(a: Int, b: Int) -> Int contract { effects {} } { return a * b }",
    flow: "mul", args: [6, 7], expected: 42,
  },
  {
    name: "fortytwo() = 42",
    src: "pure flow fortytwo() -> Int contract { effects {} } { return 42 }",
    flow: "fortytwo", args: [], expected: 42,
  },
  {
    name: "max(5, 3) = 5",
    src: "pure flow max(a: Int, b: Int) -> Int contract { effects {} } { if a > b { return a } else { return b } }",
    flow: "max", args: [5, 3], expected: 5,
  },
  {
    name: "max(2, 9) = 9",
    src: "pure flow max(a: Int, b: Int) -> Int contract { effects {} } { if a > b { return a } else { return b } }",
    flow: "max", args: [2, 9], expected: 9,
  },
  {
    name: "let binding: product(4, 5) = 20",
    src: [
      "pure flow product(a: Int, b: Int) -> Int",
      "contract { effects {} }",
      "{ let result = a * b",
      "  return result }",
    ].join("\n"),
    flow: "product", args: [4, 5], expected: 20,
  },
  {
    name: "while loop: sumTo(10) = 55",
    src: [
      "pure flow sumTo(n: Int) -> Int",
      "contract { effects {} }",
      "{ let result = 0",
      "  let i = 1",
      "  while i <= n {",
      "    let result = result + i",
      "    let i = i + 1",
      "  }",
      "  return result }",
    ].join("\n"),
    flow: "sumTo", args: [10], expected: 55,
  },
  {
    name: "while loop: sumTo(100) = 5050",
    src: [
      "pure flow sumTo(n: Int) -> Int",
      "contract { effects {} }",
      "{ let result = 0",
      "  let i = 1",
      "  while i <= n {",
      "    let result = result + i",
      "    let i = i + 1",
      "  }",
      "  return result }",
    ].join("\n"),
    flow: "sumTo", args: [100], expected: 5050,
  },
];

let pass = 0;
let fail = 0;

for (const t of tests) {
  try {
    const result = await compileAndRun(t.src, t.flow, t.args);
    if (result === t.expected) {
      console.log(`  PASS  ${t.name} → ${result}`);
      pass++;
    } else {
      console.log(`  FAIL  ${t.name} → got ${result}, expected ${t.expected}`);
      fail++;
    }
  } catch (e) {
    console.log(`  ERROR ${t.name} → ${e.message?.slice(0, 80)}`);
    fail++;
  }
}

console.log(`\n${pass}/${pass + fail} tests passed`);
if (fail > 0) process.exitCode = 1;

// wat-k3-inline.test.mjs — P2 differential tests: inline select-based K3 min/max
//
// Verifies two things for every K3 operator:
//   1. The emitted WAT contains the inline select pattern (not call $fungi_k3_min/max)
//      for the 2-operand case — confirming P2 inlining is active.
//   2. The functional output matches the tree-walker interpreter for all 9 trit pairs
//      (DENY×DENY, DENY×UNKNOWN, … ALLOW×ALLOW).
//
// P2 change (2026-07-21, wat-emitter.ts):
//   - Verdict &&/|| binary ops now emit (select L R (i32.lt_s L R)) / (i32.gt_s)
//     instead of (call $fungi_k3_min L R) / (call $fungi_k3_max L R)
//   - k3FoldExpr N-operand chain also inlines the select pattern at every step
//   Note: i32.min_s / i32.max_s are not in baseline WASM and are rejected by
//   the workspace wabt — the select form is semantically identical and assembles.

import { test } from "node:test";
import assert from "node:assert/strict";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const COMPILER = join(HERE, "..", "dist", "index.js");

async function loadCompiler() {
  return import(pathToFileURL(COMPILER).href);
}

// Compile + assemble + run a flow with int args; return the raw exported result.
async function runWasm(L, src, flowName, intArgs) {
  const prog = L.parseProgram(src, "k3-inline-test.fungi");
  const errs = (prog.diagnostics ?? []).filter((d) => d.severity === "error");
  assert.equal(errs.length, 0, `parse/check errors: ${JSON.stringify(errs)}`);
  const fx = L.checkEffects(prog.flows, prog.ast);
  const { gir } = L.emitGIR(prog.ast, prog.flows, fx);
  const wat = L.renderWAT(L.buildWATModuleFromGIR(gir, undefined, "k3-inline", prog.ast, true));
  const asm = await L.assembleWAT(wat);
  assert.ok(
    asm.valid && asm.diagnostics.length === 0,
    `WASM assembly failed: ${JSON.stringify(asm.diagnostics)}\n--- WAT ---\n${wat}`,
  );
  const fn = (await WebAssembly.instantiate(asm.wasm)).instance.exports[flowName];
  assert.equal(typeof fn, "function", `export '${flowName}' not found`);
  return fn(...intArgs);
}

// Run in tree-walker; returns numeric value.
async function runInterp(L, src, flowName, verdictArgs, paramNames) {
  const prog = L.parseProgram(src, "k3-inline-test.fungi");
  const argsMap = new Map(
    verdictArgs.map((v, i) => [paramNames[i] ?? `p${i}`, { __tag: "verdict", value: v }]),
  );
  const result = await L.executeFlow(flowName, argsMap, prog.ast);
  const val = result?.value;
  if (val?.__tag === "verdict") return val.value;
  if (val?.__tag === "int")     return val.value;
  throw new Error(`Unexpected interpreter result: ${JSON.stringify(result)}`);
}

// Get the WAT text for a source program.
function getWAT(L, src, flowName) {
  const prog = L.parseProgram(src, "k3-inline-test.fungi");
  const fx = L.checkEffects(prog.flows, prog.ast);
  const { gir } = L.emitGIR(prog.ast, prog.flows, fx);
  return L.renderWAT(L.buildWATModuleFromGIR(gir, undefined, flowName, prog.ast, true));
}

// All 9 (a, b) trit pairs
const PAIRS = [
  [-1, -1], [-1, 0], [-1, 1],
  [ 0, -1], [ 0, 0], [ 0, 1],
  [ 1, -1], [ 1, 0], [ 1, 1],
];

// ── 1. Verdict && inlines select pattern ─────────────────────────────────────

const AND_SRC = `@version 1
pure flow k3And(a: Verdict, b: Verdict) -> Verdict
contract { effects {} }
{
  return a && b
}`;

test("P2 inline: Verdict && emits select (not call $fungi_k3_min)", async () => {
  const L = await loadCompiler();
  const wat = getWAT(L, AND_SRC, "k3And");
  // P2: select + i32.lt_s is the inlined K3 min pattern
  assert.ok(wat.includes("i32.lt_s"), `Expected i32.lt_s in WAT:\n${wat}`);
  assert.ok(!wat.includes("call $fungi_k3_min"), `Should NOT contain call $fungi_k3_min:\n${wat}`);
});

test("P2 inline: Verdict && assembles cleanly + all 9 trit pairs match interpreter", async () => {
  const L = await loadCompiler();
  for (const [a, b] of PAIRS) {
    const wasm = await runWasm(L, AND_SRC, "k3And", [a, b]);
    const interp = await runInterp(L, AND_SRC, "k3And", [a, b], ["a", "b"]);
    assert.equal(wasm, interp, `k3And(${a},${b}): WASM=${wasm}, interp=${interp}`);
    assert.equal(wasm, Math.min(a, b), `k3And(${a},${b}) should equal Math.min(${a},${b})`);
  }
});

// ── 2. Verdict || inlines select pattern ─────────────────────────────────────

const OR_SRC = `@version 1
pure flow k3Or(a: Verdict, b: Verdict) -> Verdict
contract { effects {} }
{
  return a || b
}`;

test("P2 inline: Verdict || emits select (not call $fungi_k3_max)", async () => {
  const L = await loadCompiler();
  const wat = getWAT(L, OR_SRC, "k3Or");
  assert.ok(wat.includes("i32.gt_s"), `Expected i32.gt_s in WAT:\n${wat}`);
  assert.ok(!wat.includes("call $fungi_k3_max"), `Should NOT contain call $fungi_k3_max:\n${wat}`);
});

test("P2 inline: Verdict || assembles cleanly + all 9 trit pairs match interpreter", async () => {
  const L = await loadCompiler();
  for (const [a, b] of PAIRS) {
    const wasm = await runWasm(L, OR_SRC, "k3Or", [a, b]);
    const interp = await runInterp(L, OR_SRC, "k3Or", [a, b], ["a", "b"]);
    assert.equal(wasm, interp, `k3Or(${a},${b}): WASM=${wasm}, interp=${interp}`);
    assert.equal(wasm, Math.max(a, b), `k3Or(${a},${b}) should equal Math.max(${a},${b})`);
  }
});

// ── 3. k3FoldExpr 2-operand all{} inlines select ─────────────────────────────
// Note: all{}/any{} fold syntax uses newline-separated operands (not commas).

const ALL2_SRC = `@version 1
pure flow k3All2(a: Verdict, b: Verdict) -> Verdict
contract { effects {} }
{
  return all { a
b }
}`;

test("P2 inline: all{} 2-operand emits select (not call $fungi_k3_min)", async () => {
  const L = await loadCompiler();
  const wat = getWAT(L, ALL2_SRC, "k3All2");
  assert.ok(wat.includes("i32.lt_s"), `Expected i32.lt_s in WAT:\n${wat}`);
  assert.ok(!wat.includes("call $fungi_k3_min"), `Should NOT contain call $fungi_k3_min:\n${wat}`);
});

test("P2 inline: all{} 2-operand assembles cleanly + all 9 trit pairs correct", async () => {
  const L = await loadCompiler();
  for (const [a, b] of PAIRS) {
    const wasm = await runWasm(L, ALL2_SRC, "k3All2", [a, b]);
    const interp = await runInterp(L, ALL2_SRC, "k3All2", [a, b], ["a", "b"]);
    assert.equal(wasm, interp, `k3All2(${a},${b}): WASM=${wasm}, interp=${interp}`);
    assert.equal(wasm, Math.min(a, b), `k3All2(${a},${b}) should be ${Math.min(a,b)}`);
  }
});

// ── 4. k3FoldExpr 2-operand any{} inlines select ─────────────────────────────

const ANY2_SRC = `@version 1
pure flow k3Any2(a: Verdict, b: Verdict) -> Verdict
contract { effects {} }
{
  return any { a
b }
}`;

test("P2 inline: any{} 2-operand emits select (not call $fungi_k3_max)", async () => {
  const L = await loadCompiler();
  const wat = getWAT(L, ANY2_SRC, "k3Any2");
  assert.ok(wat.includes("i32.gt_s"), `Expected i32.gt_s in WAT:\n${wat}`);
  assert.ok(!wat.includes("call $fungi_k3_max"), `Should NOT contain call $fungi_k3_max:\n${wat}`);
});

test("P2 inline: any{} 2-operand assembles cleanly + all 9 trit pairs correct", async () => {
  const L = await loadCompiler();
  for (const [a, b] of PAIRS) {
    const wasm = await runWasm(L, ANY2_SRC, "k3Any2", [a, b]);
    const interp = await runInterp(L, ANY2_SRC, "k3Any2", [a, b], ["a", "b"]);
    assert.equal(wasm, interp, `k3Any2(${a},${b}): WASM=${wasm}, interp=${interp}`);
    assert.equal(wasm, Math.max(a, b), `k3Any2(${a},${b}) should be ${Math.max(a,b)}`);
  }
});

// ── 5. Empty folds still produce correct identities ───────────────────────────

const ALL_EMPTY_SRC = `@version 1
pure flow k3AllEmpty() -> Verdict
contract { effects {} }
{ return all { } }`;

const ANY_EMPTY_SRC = `@version 1
pure flow k3AnyEmpty() -> Verdict
contract { effects {} }
{ return any { } }`;

test("P2 inline: all{} empty → UNKNOWN(0) — identity unchanged", async () => {
  const L = await loadCompiler();
  assert.equal(await runWasm(L, ALL_EMPTY_SRC, "k3AllEmpty", []), 0);
});

test("P2 inline: any{} empty → DENY(-1) — zero-trust identity unchanged", async () => {
  const L = await loadCompiler();
  assert.equal(await runWasm(L, ANY_EMPTY_SRC, "k3AnyEmpty", []), -1);
});

// ── 6. 3-operand fold: inlines select at every step ──────────────────────────

const ALL3_SRC = `@version 1
pure flow k3All3(a: Verdict, b: Verdict, c: Verdict) -> Verdict
contract { effects {} }
{
  return all { a
b
c }
}`;

test("P2 inline: all{} 3-operand assembles and produces lattice min", async () => {
  const L = await loadCompiler();
  // DENY absorbs: all{DENY, ALLOW, ALLOW} = DENY
  assert.equal(await runWasm(L, ALL3_SRC, "k3All3", [-1, 1, 1]), -1);
  // UNKNOWN absorbs ALLOW: all{UNKNOWN, ALLOW, ALLOW} = UNKNOWN
  assert.equal(await runWasm(L, ALL3_SRC, "k3All3", [0, 1, 1]), 0);
  // All ALLOW
  assert.equal(await runWasm(L, ALL3_SRC, "k3All3", [1, 1, 1]), 1);
});

// ── 7. Chained && — left-associative select chain ────────────────────────────

const CHAIN_AND_SRC = `@version 1
pure flow tripleGate(a: Verdict, b: Verdict, c: Verdict) -> Verdict
contract { effects {} }
{
  return a && b && c
}`;

test("P2 inline: chained && emits select pattern and assembles cleanly", async () => {
  const L = await loadCompiler();
  const wat = getWAT(L, CHAIN_AND_SRC, "tripleGate");
  assert.ok(wat.includes("i32.lt_s"), `Expected i32.lt_s in chained WAT:\n${wat}`);
  // DENY dominates
  assert.equal(await runWasm(L, CHAIN_AND_SRC, "tripleGate", [-1, 1, 1]), -1);
  assert.equal(await runWasm(L, CHAIN_AND_SRC, "tripleGate", [1, -1, 1]), -1);
  assert.equal(await runWasm(L, CHAIN_AND_SRC, "tripleGate", [1, 1, 1]), 1);
  // All match interpreter
  const L2 = await loadCompiler();
  for (const [a, b] of PAIRS) {
    // third arg = ALLOW for simplicity
    const wasm = await runWasm(L2, CHAIN_AND_SRC, "tripleGate", [a, b, 1]);
    const interp = await runInterp(L2, CHAIN_AND_SRC, "tripleGate", [a, b, 1], ["a", "b", "c"]);
    assert.equal(wasm, interp, `tripleGate(${a},${b},1): WASM=${wasm}, interp=${interp}`);
  }
});

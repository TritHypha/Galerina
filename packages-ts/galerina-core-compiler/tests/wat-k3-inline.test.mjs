// wat-k3-inline.test.mjs - K3C-2 differential tests for K3 min/max lowering
//
// History: P2 (2026-07-21) inlined Verdict &&/|| and all{}/any{} as a raw
// (select L R (i32.lt_s L R)) / (i32.gt_s) chain. That was only sound while the
// WASM lane encoded UNKNOWN as 0. K3C-2 (2026-10-28) moved the WASM wire token for
// UNKNOWN to -128 (0x80 at byte boundaries), where raw signed order would rank
// UNKNOWN below DENY. The raw select is therefore retired (kept here as history,
// not deleted) and every K3 min/max step now calls the lattice helpers
// $fungi_k3_min / $fungi_k3_max, which validate {-1, -128, +1}, rank-map
// -128 -> 0, take min/max, and re-encode. A bare 0 (legacy UNKNOWN) is malformed on
// the WASM wire and traps; legacy 0 is accepted only by framed codecs.
//
// Verifies for every K3 operator:
//   1. The emitted WAT routes through the lattice helper (no raw select on wire values).
//   2. The functional output matches the tree-walker interpreter for all 9 wire pairs,
//      comparing through the wire map (interpreter UNKNOWN 0 <-> WASM UNKNOWN -128).
//   3. Bare 0 and out-of-range values trap instead of being ranked.

import { test } from "node:test";
import assert from "node:assert/strict";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const COMPILER = join(HERE, "..", "dist", "index.js");

// K3C-2 wire tokens (named constants, no raw-byte arithmetic in assertions).
const DENY = -1;
const UNKNOWN = -128;
const ALLOW = 1;
const WIRE = [DENY, UNKNOWN, ALLOW];

// Lattice rank: DENY < UNKNOWN < ALLOW.
const RANK = new Map([[DENY, -1], [UNKNOWN, 0], [ALLOW, 1]]);
const FROM_RANK = new Map([[-1, DENY], [0, UNKNOWN], [1, ALLOW]]);
const k3Min = (...xs) => FROM_RANK.get(Math.min(...xs.map((x) => RANK.get(x))));
const k3Max = (...xs) => FROM_RANK.get(Math.max(...xs.map((x) => RANK.get(x))));

// The TS tree-walker is frozen reference and still carries UNKNOWN as 0 internally.
const toInterp = (w) => (w === UNKNOWN ? 0 : w);
const fromInterp = (v) => (v === 0 ? UNKNOWN : v);

async function loadCompiler() {
  return import(pathToFileURL(COMPILER).href);
}

async function buildFn(L, src, flowName) {
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
  return fn;
}

async function runWasm(L, src, flowName, wireArgs) {
  return (await buildFn(L, src, flowName))(...wireArgs);
}

// Run in tree-walker with wire args mapped to interpreter values; result mapped back to wire.
async function runInterp(L, src, flowName, wireArgs, paramNames) {
  const prog = L.parseProgram(src, "k3-inline-test.fungi");
  const argsMap = new Map(
    wireArgs.map((v, i) => [paramNames[i] ?? `p${i}`, { __tag: "verdict", value: toInterp(v) }]),
  );
  const result = await L.executeFlow(flowName, argsMap, prog.ast);
  const val = result?.value;
  if (val?.__tag === "verdict") return fromInterp(val.value);
  throw new Error(`Unexpected interpreter result: ${JSON.stringify(result)}`);
}

function getWAT(L, src, flowName) {
  const prog = L.parseProgram(src, "k3-inline-test.fungi");
  const fx = L.checkEffects(prog.flows, prog.ast);
  const { gir } = L.emitGIR(prog.ast, prog.flows, fx);
  return L.renderWAT(L.buildWATModuleFromGIR(gir, undefined, flowName, prog.ast, true));
}

// The exported flow body (helpers excluded) must not contain a raw select on wire values.
function flowBody(wat, flowName) {
  const start = wat.indexOf(`(func $${flowName}`);
  assert.ok(start >= 0, `func $${flowName} not found in WAT:\n${wat}`);
  const next = wat.indexOf("(func ", start + 1);
  return wat.slice(start, next < 0 ? undefined : next);
}

function assertHelperLowering(wat, flowName, helper) {
  const body = flowBody(wat, flowName);
  assert.ok(body.includes(`call ${helper}`), `Expected call ${helper} in ${flowName}:\n${body}`);
  assert.ok(!/\(select\b/.test(body), `Raw select must not rank wire values in ${flowName}:\n${body}`);
  assert.ok(wat.includes(`(func ${helper}`), `Helper ${helper} must be emitted:\n${wat}`);
}

// All 9 (a, b) wire pairs
const PAIRS = WIRE.flatMap((a) => WIRE.map((b) => [a, b]));

// Malformed wire values: bare legacy 0, the old +/-2 fourth trit, and +128.
const MALFORMED = [0, 2, -2, 128];

// -- 1. Verdict && -------------------------------------------------------------

const AND_SRC = `@version 1
pure flow k3And(a: Verdict, b: Verdict) -> Verdict
contract { effects {} }
{
  return a && b
}`;

test("K3C-2: Verdict && routes through $fungi_k3_min (raw select retired)", async () => {
  const L = await loadCompiler();
  assertHelperLowering(getWAT(L, AND_SRC, "k3And"), "k3And", "$fungi_k3_min");
});

test("K3C-2: Verdict && all 9 wire pairs match interpreter and lattice min", async () => {
  const L = await loadCompiler();
  const fn = await buildFn(L, AND_SRC, "k3And");
  for (const [a, b] of PAIRS) {
    const wasm = fn(a, b);
    const interp = await runInterp(L, AND_SRC, "k3And", [a, b], ["a", "b"]);
    assert.equal(wasm, interp, `k3And(${a},${b}): WASM=${wasm}, interp=${interp}`);
    assert.equal(wasm, k3Min(a, b), `k3And(${a},${b}) should be ${k3Min(a, b)}`);
  }
  // Regression: raw signed min would return -128 here; the lattice says DENY.
  assert.equal(fn(DENY, UNKNOWN), DENY);
  assert.equal(fn(UNKNOWN, DENY), DENY);
});

test("K3C-2: Verdict && traps on bare 0 and malformed wire values", async () => {
  const L = await loadCompiler();
  const fn = await buildFn(L, AND_SRC, "k3And");
  for (const bad of MALFORMED) {
    for (const good of WIRE) {
      assert.throws(() => fn(bad, good), WebAssembly.RuntimeError, `k3And(${bad},${good})`);
      assert.throws(() => fn(good, bad), WebAssembly.RuntimeError, `k3And(${good},${bad})`);
    }
  }
});

// -- 2. Verdict || -------------------------------------------------------------

const OR_SRC = `@version 1
pure flow k3Or(a: Verdict, b: Verdict) -> Verdict
contract { effects {} }
{
  return a || b
}`;

test("K3C-2: Verdict || routes through $fungi_k3_max (raw select retired)", async () => {
  const L = await loadCompiler();
  assertHelperLowering(getWAT(L, OR_SRC, "k3Or"), "k3Or", "$fungi_k3_max");
});

test("K3C-2: Verdict || all 9 wire pairs match interpreter and lattice max", async () => {
  const L = await loadCompiler();
  const fn = await buildFn(L, OR_SRC, "k3Or");
  for (const [a, b] of PAIRS) {
    const wasm = fn(a, b);
    const interp = await runInterp(L, OR_SRC, "k3Or", [a, b], ["a", "b"]);
    assert.equal(wasm, interp, `k3Or(${a},${b}): WASM=${wasm}, interp=${interp}`);
    assert.equal(wasm, k3Max(a, b), `k3Or(${a},${b}) should be ${k3Max(a, b)}`);
  }
  // Regression: raw signed max would return DENY here; the lattice says UNKNOWN.
  assert.equal(fn(DENY, UNKNOWN), UNKNOWN);
  assert.equal(fn(UNKNOWN, DENY), UNKNOWN);
});

test("K3C-2: Verdict || traps on bare 0 and malformed wire values", async () => {
  const L = await loadCompiler();
  const fn = await buildFn(L, OR_SRC, "k3Or");
  for (const bad of MALFORMED) {
    assert.throws(() => fn(bad, ALLOW), WebAssembly.RuntimeError, `k3Or(${bad},ALLOW)`);
    assert.throws(() => fn(DENY, bad), WebAssembly.RuntimeError, `k3Or(DENY,${bad})`);
  }
});

// -- 3. all{} 2-operand --------------------------------------------------------
// all{}/any{} fold syntax uses newline-separated operands (not commas).

const ALL2_SRC = `@version 1
pure flow k3All2(a: Verdict, b: Verdict) -> Verdict
contract { effects {} }
{
  return all { a
b }
}`;

test("K3C-2: all{} 2-operand routes through $fungi_k3_min", async () => {
  const L = await loadCompiler();
  assertHelperLowering(getWAT(L, ALL2_SRC, "k3All2"), "k3All2", "$fungi_k3_min");
});

test("K3C-2: all{} 2-operand all 9 wire pairs match interpreter", async () => {
  const L = await loadCompiler();
  const fn = await buildFn(L, ALL2_SRC, "k3All2");
  for (const [a, b] of PAIRS) {
    const wasm = fn(a, b);
    const interp = await runInterp(L, ALL2_SRC, "k3All2", [a, b], ["a", "b"]);
    assert.equal(wasm, interp, `k3All2(${a},${b}): WASM=${wasm}, interp=${interp}`);
    assert.equal(wasm, k3Min(a, b), `k3All2(${a},${b}) should be ${k3Min(a, b)}`);
  }
  assert.throws(() => fn(0, ALLOW), WebAssembly.RuntimeError);
});

// -- 4. any{} 2-operand --------------------------------------------------------

const ANY2_SRC = `@version 1
pure flow k3Any2(a: Verdict, b: Verdict) -> Verdict
contract { effects {} }
{
  return any { a
b }
}`;

test("K3C-2: any{} 2-operand routes through $fungi_k3_max", async () => {
  const L = await loadCompiler();
  assertHelperLowering(getWAT(L, ANY2_SRC, "k3Any2"), "k3Any2", "$fungi_k3_max");
});

test("K3C-2: any{} 2-operand all 9 wire pairs match interpreter", async () => {
  const L = await loadCompiler();
  const fn = await buildFn(L, ANY2_SRC, "k3Any2");
  for (const [a, b] of PAIRS) {
    const wasm = fn(a, b);
    const interp = await runInterp(L, ANY2_SRC, "k3Any2", [a, b], ["a", "b"]);
    assert.equal(wasm, interp, `k3Any2(${a},${b}): WASM=${wasm}, interp=${interp}`);
    assert.equal(wasm, k3Max(a, b), `k3Any2(${a},${b}) should be ${k3Max(a, b)}`);
  }
  assert.throws(() => fn(DENY, 0), WebAssembly.RuntimeError);
});

// -- 5. Empty folds ------------------------------------------------------------

const ALL_EMPTY_SRC = `@version 1
pure flow k3AllEmpty() -> Verdict
contract { effects {} }
{ return all { } }`;

const ANY_EMPTY_SRC = `@version 1
pure flow k3AnyEmpty() -> Verdict
contract { effects {} }
{ return any { } }`;

test("K3C-2: all{} empty -> wire UNKNOWN (-128), never bare 0", async () => {
  const L = await loadCompiler();
  const wasm = await runWasm(L, ALL_EMPTY_SRC, "k3AllEmpty", []);
  assert.equal(wasm, UNKNOWN);
  assert.notEqual(wasm, 0);
});

test("K3C-2: any{} empty -> DENY (-1), zero-trust identity unchanged", async () => {
  const L = await loadCompiler();
  assert.equal(await runWasm(L, ANY_EMPTY_SRC, "k3AnyEmpty", []), DENY);
});

// -- 6. 3-operand fold ---------------------------------------------------------

const ALL3_SRC = `@version 1
pure flow k3All3(a: Verdict, b: Verdict, c: Verdict) -> Verdict
contract { effects {} }
{
  return all { a
b
c }
}`;

test("K3C-2: all{} 3-operand calls the helper at every step and gives lattice min", async () => {
  const L = await loadCompiler();
  const body = flowBody(getWAT(L, ALL3_SRC, "k3All3"), "k3All3");
  assert.equal((body.match(/call \$fungi_k3_min/g) ?? []).length, 2, body);
  const fn = await buildFn(L, ALL3_SRC, "k3All3");
  assert.equal(fn(DENY, ALLOW, ALLOW), DENY);        // DENY absorbs
  assert.equal(fn(UNKNOWN, ALLOW, ALLOW), UNKNOWN);  // UNKNOWN absorbs ALLOW
  assert.equal(fn(ALLOW, ALLOW, ALLOW), ALLOW);
  assert.equal(fn(UNKNOWN, DENY, ALLOW), DENY);      // DENY below UNKNOWN on the lattice
  for (const a of WIRE) for (const b of WIRE) for (const c of WIRE) {
    assert.equal(fn(a, b, c), k3Min(a, b, c), `k3All3(${a},${b},${c})`);
  }
  assert.throws(() => fn(ALLOW, ALLOW, 0), WebAssembly.RuntimeError);
});

// -- 7. Chained && -------------------------------------------------------------

const CHAIN_AND_SRC = `@version 1
pure flow tripleGate(a: Verdict, b: Verdict, c: Verdict) -> Verdict
contract { effects {} }
{
  return a && b && c
}`;

test("K3C-2: chained && is a left-associative helper chain matching the interpreter", async () => {
  const L = await loadCompiler();
  const body = flowBody(getWAT(L, CHAIN_AND_SRC, "tripleGate"), "tripleGate");
  assert.equal((body.match(/call \$fungi_k3_min/g) ?? []).length, 2, body);
  assert.ok(!/\(select\b/.test(body), body);
  const fn = await buildFn(L, CHAIN_AND_SRC, "tripleGate");
  assert.equal(fn(DENY, ALLOW, ALLOW), DENY);
  assert.equal(fn(ALLOW, DENY, ALLOW), DENY);
  assert.equal(fn(ALLOW, ALLOW, ALLOW), ALLOW);
  for (const [a, b] of PAIRS) {
    for (const c of WIRE) {
      const wasm = fn(a, b, c);
      const interp = await runInterp(L, CHAIN_AND_SRC, "tripleGate", [a, b, c], ["a", "b", "c"]);
      assert.equal(wasm, interp, `tripleGate(${a},${b},${c}): WASM=${wasm}, interp=${interp}`);
    }
  }
});

// -- 8. flip and unary ! ------------------------------------------------------

const FLIP_SRC = `@version 1
pure flow k3Flip(a: Verdict) -> Verdict
contract { effects {} }
{
  return flip(a)
}`;

test("K3C-2: flip keeps UNKNOWN at -128 (never +128) and swaps DENY/ALLOW", async () => {
  const L = await loadCompiler();
  const fn = await buildFn(L, FLIP_SRC, "k3Flip");
  assert.equal(fn(UNKNOWN), UNKNOWN);
  assert.equal(fn(DENY), ALLOW);
  assert.equal(fn(ALLOW), DENY);
  for (const w of WIRE) {
    assert.equal(fn(w), await runInterp(L, FLIP_SRC, "k3Flip", [w], ["a"]), `flip(${w})`);
  }
  for (const bad of MALFORMED) assert.throws(() => fn(bad), WebAssembly.RuntimeError, `flip(${bad})`);
});

const BANG_SRC = `@version 1
pure flow k3Bang(a: Verdict) -> Verdict
contract { effects {} }
{
  return !a
}`;

test("K3C-2: unary ! on a Verdict fails closed in WASM (no bare-0 result), like the walker", async () => {
  // Regression found 2026-10-28: the WAT lane lowered !Verdict to i32.eqz, which returned a
  // bare 0 (malformed Verdict) for every wire token. The walker refuses it at runtime and
  // FUNGI-K3-002 refuses it at check time; the WASM lane now traps.
  const L = await loadCompiler();
  const fn = await buildFn(L, BANG_SRC, "k3Bang");
  for (const w of WIRE) {
    assert.throws(() => fn(w), WebAssembly.RuntimeError, `!${w} must trap`);
    const prog = L.parseProgram(BANG_SRC, "k3-inline-test.fungi");
    const r = await L.executeFlow("k3Bang", new Map([["a", { __tag: "verdict", value: toInterp(w) }]]), prog.ast);
    assert.equal(r?.value?.__tag, "runtimeError", `walker !${w}`);
  }
});
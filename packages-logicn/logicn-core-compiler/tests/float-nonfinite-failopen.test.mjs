// float-nonfinite-failopen — #55 (HIGH): a non-finite float (NaN / ±Inf) silently passed range guards.
// IEEE-754: every NaN comparison is `false`, so `NaN > upper` AND `NaN < lower` are both false → a NaN was
// "in range" for EVERY range, sailing through deny-by-default guards. And ±Inf/NaN could be signed into a
// manifest. Fix (walker tier): mkFloat() makes a non-finite CONSTRUCTION a fail-closed propagating trap, and
// floatCmp() makes a non-finite ORDERING comparison trap rather than return a guard-passing boolean.
// Also fixes the dotless-exponent literal mis-parse (`9e9` → 9; `1e400` → Infinity, now trapped).
import { test } from "node:test";
import assert from "node:assert/strict";
import * as L from "../dist/index.js";

async function run(body, ret = "Float") {
  const src = `pure flow f() -> ${ret}\ncontract { effects {} }\n{ ${body} }`;
  const p = L.parseProgram(src, "t.lln");
  const errs = p.diagnostics.filter((d) => d.severity === "error");
  assert.equal(errs.length, 0, "parse: " + errs.map((e) => e.message).join("; "));
  try { L.resolveSymbols(p.ast); L.checkTypes(p.ast); } catch { /* best-effort */ }
  const r = await L.executeFlow("f", new Map(), p.ast);
  return r.value;
}
function assertTrap(v, label) {
  assert.equal(v?.__tag, "runtimeError", `${label}: expected a fail-closed trap, got ${JSON.stringify(v)}`);
  assert.equal(v.message, "NonFiniteFloat", `${label}: expected the NonFiniteFloat (LLN-FLOAT-NAN-001) trap`);
}

test("0.0/0.0 (NaN) is a fail-closed trap, not a silent NaN float", async () => {
  assertTrap(await run("let z: Float = 0.0  return 0.0 / z"), "NaN from 0/0");
});

test("THE FAIL-OPEN: a NaN no longer passes an upper-bound deny-guard (was silently false)", async () => {
  // `if amount > MAX { deny }` — with a NaN amount the condition WAS false → deny skipped → fail-open.
  assertTrap(await run("let z: Float = 0.0  let amount: Float = 0.0 / z  return amount > 1000000.0", "Bool"),
    "NaN > upper guard");
});

test("...and a NaN no longer passes a lower-bound deny-guard either (in range for EVERY range)", async () => {
  assertTrap(await run("let z: Float = 0.0  let amount: Float = 0.0 / z  return amount < 0.0", "Bool"),
    "NaN < lower guard");
});

test("x/0.0 (+Inf) is a fail-closed trap", async () => {
  assertTrap(await run("let z: Float = 0.0  return 1.0 / z"), "+Inf from x/0");
});

test("overflow to +Inf (huge * huge) is a fail-closed trap", async () => {
  assertTrap(await run("let a: Float = 1.0e308  return a * 10.0"), "overflow to +Inf");
});

test("a 1e400 literal (overflows f64 to +Inf) is a fail-closed trap", async () => {
  assertTrap(await run("return 1e400"), "1e400 literal");
});

test("dotless-exponent literal is parsed as a FLOAT, not mis-read as int (9e9 → 9000000000, not 9)", async () => {
  const v = await run("return 9e9");
  assert.equal(v?.__tag, "float", `9e9 must be a float, got ${JSON.stringify(v)}`);
  assert.equal(v.value, 9000000000, "9e9 must be 9_000_000_000 — the dotless-exponent mis-parse returned 9");
});

test("FINITE floats are unaffected — no false-positive traps", async () => {
  const sum = await run("return 1.5 + 2.5");
  assert.equal(sum?.__tag, "float"); assert.equal(sum.value, 4);
  const quot = await run("let z: Float = 2.0  return 3.0 / z");
  assert.equal(quot?.__tag, "float"); assert.equal(quot.value, 1.5);
  const cmp = await run("return 2.0 > 1.0", "Bool");
  assert.equal(cmp?.__tag, "bool"); assert.equal(cmp.value, true);
  const cmp2 = await run("let a: Float = 0.5  return a < 1.0", "Bool");
  assert.equal(cmp2?.__tag, "bool"); assert.equal(cmp2.value, true);
});

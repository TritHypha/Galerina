// decimal-arith — EXACT base-10 fixed-point for the Decimal type (the foundation for the "wrong VAT" fix).
// Decimal arithmetic must be exact (never IEEE-754): 0.1 + 0.2 = "0.3", not 0.30000000000000004.
// Computed on BigInt unscaled integers; malformed input fails closed; division stays unsupported.
//
// The layer is now WIRED into the tree-walker (divergence-free: the WASM emitter declines Decimal and the
// fast tiers bail, so the walker is the sole executor of decimal arithmetic — see the e2e tests below).
import { test } from "node:test";
import assert from "node:assert/strict";
import { decAdd, decSub, decMul, decCompare, isDecTrap, decDiv, decRem, isRoundMode } from "../dist/decimal-arith.js";
import { parseProgram, resolveSymbols, checkTypes, executeFlow } from "../dist/index.js";

// ── the exactness oracle (vs the f64 trap) ──
test("0.1 + 0.2 = 0.3 EXACTLY (the classic f64 failure, fixed)", () => {
  assert.equal(decAdd("0.1", "0.2"), "0.3");
  assert.notEqual(0.1 + 0.2, 0.3); // sanity: native f64 really does get this wrong
});

test("add/sub align scales and preserve the larger scale", () => {
  assert.equal(decAdd("0.10", "0.20"), "0.30");   // scale 2 preserved
  assert.equal(decAdd("1", "2.5"), "3.5");
  assert.equal(decSub("0.3", "0.1"), "0.2");
  assert.equal(decSub("5", "5.00"), "0.00");
  assert.equal(decSub("1.00", "3"), "-2.00");      // negative, scale preserved
});

test("multiply adds scales (exact)", () => {
  assert.equal(decMul("0.1", "0.1"), "0.01");
  assert.equal(decMul("1.5", "2"), "3.0");
  assert.equal(decMul("0.20", "100"), "20.00");    // a VAT-style scaling: 100 * 20% = 20.00
  assert.equal(decMul("-0.5", "0.5"), "-0.25");
});

test("exact across magnitudes a float would lose (>2^53)", () => {
  assert.equal(decAdd("9999999999999999", "1"), "10000000000000000");
  assert.equal(decAdd("0.0000000001", "0.0000000002"), "0.0000000003");
});

// ── decDiv: exact division to an EXPLICIT scale + rounding policy (the partial-op resolution, #53/#54) ──
test("decDiv exact (terminating) quotients at the requested scale", () => {
  assert.equal(decDiv("1", "4", 2, "halfEven"), "0.25");
  assert.equal(decDiv("10", "2", 2, "halfEven"), "5.00");
  assert.equal(decDiv("0.30", "0.10", 2, "halfEven"), "3.00"); // value 3, placed at scale 2
  assert.equal(decDiv("100.00", "8", 2, "halfEven"), "12.50");
});

test("decDiv non-terminating quotient (1/3) rounds per the stated scale", () => {
  assert.equal(decDiv("1", "3", 2, "halfEven"), "0.33");
  assert.equal(decDiv("1", "3", 4, "halfEven"), "0.3333");
  assert.equal(decDiv("2", "3", 4, "halfEven"), "0.6667"); // 0.66666… → halfEven up
});

test("decDiv rounding modes differ on a tie (1.005 → 2dp) and a non-tie", () => {
  // 1/8 = 0.125 — an exact tie at 2dp (0.12 | 0.13)
  assert.equal(decDiv("1", "8", 2, "halfEven"), "0.12"); // 12 is even → stay
  assert.equal(decDiv("3", "8", 2, "halfEven"), "0.38"); // 0.375 tie, 37 odd → away → 0.38
  assert.equal(decDiv("1", "8", 2, "halfUp"),   "0.13"); // tie → away
  assert.equal(decDiv("1", "8", 2, "halfDown"), "0.12"); // tie → toward zero
  assert.equal(decDiv("1", "8", 2, "up"),       "0.13"); // any remainder → away
  assert.equal(decDiv("1", "8", 2, "down"),     "0.12"); // truncate toward zero
});

test("decDiv directed rounding respects sign (ceiling/floor toward ±∞)", () => {
  assert.equal(decDiv("1", "3", 2, "ceiling"), "0.34");  // +0.333 → toward +∞
  assert.equal(decDiv("1", "3", 2, "floor"),   "0.33");
  assert.equal(decDiv("-1", "3", 2, "ceiling"), "-0.33"); // −0.333 → toward +∞ (toward zero)
  assert.equal(decDiv("-1", "3", 2, "floor"),   "-0.34"); // toward −∞ (away from zero)
  assert.equal(decDiv("-1", "3", 2, "halfEven"), "-0.33");
});

test("decDiv negative operands round symmetrically for the half modes", () => {
  assert.equal(decDiv("-1", "8", 2, "halfUp"), "-0.13"); // −0.125 tie → away from zero
  assert.equal(decDiv("-3", "8", 2, "halfEven"), "-0.38");
});

test("decDiv fails closed on divide-by-zero and bad scale", () => {
  assert.ok(isDecTrap(decDiv("1", "0", 2, "halfEven")));
  assert.equal(decDiv("1", "0", 2, "halfEven"), "DivideByZero");
  assert.ok(isDecTrap(decDiv("1", "0.0", 2, "halfEven")));
  assert.ok(isDecTrap(decDiv("x", "3", 2, "halfEven")));   // malformed
  assert.ok(isDecTrap(decDiv("1", "3", -1, "halfEven")));  // negative scale
});

test("decRem is exact (no rounding needed) and fails closed on /0", () => {
  assert.equal(decRem("10", "3"), "1");
  assert.equal(decRem("0.30", "0.12"), "0.06");  // 0.30 = 2*0.12 + 0.06
  assert.equal(decRem("-10", "3"), "-1");        // truncate toward zero
  assert.equal(decRem("7.5", "2.5"), "0.0");
  assert.equal(decRem("5", "0"), "DivideByZero");
});

test("isRoundMode gates the policy string", () => {
  assert.ok(isRoundMode("halfEven"));
  assert.ok(isRoundMode("floor"));
  assert.ok(!isRoundMode("nearest"));
  assert.ok(!isRoundMode(""));
});

test("comparison is by VALUE not string ('0.1' == '0.10')", () => {
  assert.equal(decCompare("0.1", "0.10"), 0);
  assert.equal(decCompare("0.1", "0.2"), -1);
  assert.equal(decCompare("2.5", "2.50001"), -1);
  assert.equal(decCompare("-1", "-2"), 1);
});

test("malformed input fails closed (never a guessed value)", () => {
  assert.ok(isDecTrap(decAdd("abc", "1")));
  assert.ok(isDecTrap(decAdd("1", "")));
  assert.ok(isDecTrap(decMul("1.2.3", "1")));
  assert.ok(isDecTrap(decCompare("1", "x")));
});

// ── end-to-end through the tree-walker (the wired fix) ──
async function runDecimal(expr, ret = "Decimal") {
  const SRC = `pure flow probe() -> ${ret} {\n  return ${expr}\n}`;
  const parsed = parseProgram(SRC, "probe.spore");
  try { resolveSymbols(parsed.ast); checkTypes(parsed.ast); } catch { /* type pass best-effort */ }
  return await executeFlow("probe", new Map(), parsed.ast);
}

test("interpreter: Decimal + Decimal evaluates EXACTLY (was 'not supported' trap)", async () => {
  const r = await runDecimal('Decimal("0.1") + Decimal("0.2")');
  assert.equal(r.value.__tag, "decimal", `got ${JSON.stringify(r.value)}`);
  assert.equal(r.value.value, "0.3");
});

test("interpreter: Decimal * Decimal exact (VAT-style 100.00 * 0.20)", async () => {
  const r = await runDecimal('Decimal("100.00") * Decimal("0.20")');
  assert.equal(r.value.__tag, "decimal");
  assert.equal(r.value.value, "20.0000");
});

// ── the partial-operator resolution end-to-end (#53/#54): redirect + method form ──
function tcDiags(expr, ret = "Decimal") {
  const SRC = `pure flow probe() -> ${ret} {\n  return ${expr}\n}`;
  const p = parseProgram(SRC, "probe.spore");
  resolveSymbols(p.ast);
  const tc = checkTypes(p.ast);
  return [...(p.diagnostics ?? []), ...(tc?.diagnostics ?? [])];
}

test("Decimal '/' is a compile REDIRECT (SPORE-NUMERIC-OP-001) carrying the method suggestedCode", () => {
  const d = tcDiags('Decimal("1") / Decimal("3")').find((x) => x.code === "SPORE-NUMERIC-OP-001");
  assert.ok(d, "expected SPORE-NUMERIC-OP-001 on Decimal '/'");
  assert.equal(d.severity, "error");
  assert.equal(d.suggestedCode, 'total.divide(qty, 2, "halfEven")');
});

test("Decimal '%' redirects to a.remainder(b)", () => {
  const d = tcDiags('Decimal("1") % Decimal("3")').find((x) => x.code === "SPORE-NUMERIC-OP-001");
  assert.ok(d, "expected SPORE-NUMERIC-OP-001 on Decimal '%'");
  assert.equal(d.suggestedCode, "total.remainder(qty)");
});

test("Money / Decimal is NOT redirected (legitimate scaling, not a partial Decimal op)", () => {
  assert.ok(!tcDiags('gbp("100.00") / Decimal("3")', "Money").some((x) => x.code === "SPORE-NUMERIC-OP-001"));
});

test("a.divide(b, scale, mode) computes the exact rounded result end-to-end", async () => {
  const r = await runDecimal('Decimal("1").divide(Decimal("3"), 2, "halfEven")');
  assert.equal(r.value.__tag, "decimal", `got ${JSON.stringify(r.value)}`);
  assert.equal(r.value.value, "0.33");
  const r2 = await runDecimal('Decimal("2").divide(Decimal("3"), 4, "halfEven")');
  assert.equal(r2.value.value, "0.6667");
});

test("a.remainder(b) is exact end-to-end", async () => {
  const r = await runDecimal('Decimal("10").remainder(Decimal("3"))');
  assert.equal(r.value.value, "1");
});

test("a.divide(b, …) by zero fails closed with the propagating DivisionByZero trap", async () => {
  const r = await runDecimal('Decimal("1").divide(Decimal("0"), 2, "halfEven")');
  assert.equal(r.value.__tag, "runtimeError");
  assert.equal(r.value.message, "DivisionByZero");
});

test("a.divide(b, …) with an unknown rounding mode fails closed", async () => {
  const r = await runDecimal('Decimal("1").divide(Decimal("3"), 2, "nearest")');
  assert.equal(r.value.__tag, "runtimeError");
  assert.match(r.value.message, /unknown rounding mode/);
});

test("interpreter: Decimal - Decimal exact", async () => {
  const r = await runDecimal('Decimal("0.30") - Decimal("0.10")');
  assert.equal(r.value.value, "0.20");
});

test("interpreter: Decimal ordering compares by value ('0.1' < '0.10' is false)", async () => {
  const r = await runDecimal('Decimal("0.1") < Decimal("0.10")', "Bool");
  assert.equal(r.value.__tag, "bool");
  assert.equal(r.value.value, false);
});

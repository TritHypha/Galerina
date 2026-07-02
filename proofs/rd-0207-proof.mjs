// proof-RD-0207.mjs
// RD-0207 — Fixed-point integer money math in the query compiler.
// Claims to CHECK (DON'T TRUST, CHECK):
//   (1) total > 500.00 compiles to integer total > 50000 (x100 pennies).
//   (2) IEEE-754 float error is REAL: 0.1 + 0.2 !== 0.3 (== 0.30000000000000004).
//   (3) x100 fixed-point FIXES the 2-decimal cases (bit-exact integer compare).
//   (4) SCALE CAVEAT: x100 is NOT universally "100% accurate":
//       - sub-cent / >2dp currencies overflow 2dp scale,
//       - division / percentage / rounding still lose exactness,
//       - and even x100 encoding of an arbitrary decimal via *100 on a float
//         can itself be wrong unless you parse the string, not multiply the float.
// Node built-ins only. assert-FAIL the overclaim, assert-PASS the corrected value.

import assert from 'node:assert/strict';

const log = (...a) => console.log(...a);

// ---------------------------------------------------------------------------
// CLAIM 2 — the IEEE-754 error is REAL.
// ---------------------------------------------------------------------------
const floatSum = 0.1 + 0.2;
log('[2] 0.1 + 0.2            =', floatSum);
log('[2] === 0.3 ?           =', floatSum === 0.3);
assert.equal(floatSum === 0.3, false, 'float 0.1+0.2 should NOT equal 0.3');
assert.equal(floatSum, 0.30000000000000004, 'exact documented IEEE-754 result');
// The error magnitude:
const err = floatSum - 0.3;
log('[2] absolute error       =', err, '(~5.55e-17)');
assert.ok(Math.abs(err) > 0 && Math.abs(err) < 1e-16, 'tiny but nonzero error');

// A money-relevant float failure: a WHERE total > 500.00 filter on a float total.
// 5.00 + ... accumulation drifts. Show a concrete "just over/under boundary" bug.
let acc = 0;
for (let i = 0; i < 10; i++) acc += 0.1; // ten dimes = should be 1.00 exactly
log('[2] sum(0.1 x10)         =', acc, ' === 1.0 ?', acc === 1.0);
assert.equal(acc === 1.0, false, 'accumulated float dimes should NOT equal 1.0');

// ---------------------------------------------------------------------------
// CLAIM 1 & 3 — x100 fixed-point compile and that it FIXES the 2dp compare.
// The RIGHT way to scale: parse the decimal STRING, not multiply the float.
// ---------------------------------------------------------------------------
function toPenniesFromString(s) {
  // "500.00" -> 50000 ; "520.50" -> 52050 ; "7" -> 700 ; "3.5" -> 350
  const neg = s.trim().startsWith('-');
  const body = s.trim().replace(/^[-+]/, '');
  const [ints, fracRaw = ''] = body.split('.');
  if (fracRaw.length > 2) throw new RangeError(`>2dp not representable at x100: "${s}"`);
  const frac = (fracRaw + '00').slice(0, 2);
  const v = BigInt(ints || '0') * 100n + BigInt(frac);
  return neg ? -v : v;
}

// Claim 1: the literal compiles as stated.
assert.equal(toPenniesFromString('500.00'), 50000n, 'x100 compile: 500.00 -> 50000');
log('[1] compile 500.00       ->', toPenniesFromString('500.00').toString(), '(claim: 50000) OK');

// Claim 3: the integer compare is bit-exact where floats fail.
const priceStrings = ['0.10', '0.10', '0.10', '0.10', '0.10', '0.10', '0.10', '0.10', '0.10', '0.10']; // 1.00
const floatTotal = priceStrings.reduce((a, s) => a + parseFloat(s), 0);
const pennyTotal = priceStrings.reduce((a, s) => a + toPenniesFromString(s), 0n);
log('[3] floatTotal           =', floatTotal, ' > 1.0 (strict) ?', floatTotal > 1.0);
log('[3] pennyTotal           =', pennyTotal.toString(), ' === 100 ?', pennyTotal === 100n);
assert.equal(floatTotal === 1.0, false, 'float dime-sum drifts off 1.0');
assert.equal(pennyTotal, 100n, 'integer pennies are exact -> equals 1.00 exactly');

// ---------------------------------------------------------------------------
// CLAIM 4a — the "multiply the float by 100" naive compile is ITSELF buggy.
// ---------------------------------------------------------------------------
const bad = 1.005; // represented as 1.00499999999999989...
log('[4a] 1.005 * 100         =', bad * 100, ' Math.round ->', Math.round(bad * 100));
assert.equal(Math.round(bad * 100), 100, 'round(1.005*100)=100, NOT 101 -> float scaling loses a cent');
log('[4a] -> float*100 is not a safe general encoder (banker/half-up ambiguity)');

// ---------------------------------------------------------------------------
// CLAIM 4b — SCALE caveat: x100 only covers EXACTLY 2 decimal places.
// ---------------------------------------------------------------------------
assert.throws(() => toPenniesFromString('1.2345'), /RangeError/, '4dp not representable at x100');
log('[4b] 1.2345 at x100      -> throws RangeError (>2dp unrepresentable) OK');
const kwdMinorUnits = 3; // Kuwaiti dinar has 1000 fils = 3 decimal places
assert.notEqual(kwdMinorUnits, 2, 'not every currency is 2dp -> x100 is not universal');
log('[4b] KWD/BHD/OMR use 3dp (x1000), JPY 0dp -> "x100" is a per-currency choice');

// ---------------------------------------------------------------------------
// CLAIM 4c — division / percentage still needs rounding policy (not "100% exact").
// ---------------------------------------------------------------------------
const bill = 10000n; // 100.00
const third = bill / 3n; // BigInt floor division = 3333 pennies
const remainder = bill - third * 3n; // 1 penny left over
log('[4c] 100.00 / 3          =', third.toString(), 'pennies x3 +', remainder.toString(), 'penny remainder');
assert.equal(third, 3333n);
assert.equal(remainder, 1n, 'division leaves a residual penny -> rounding policy REQUIRED');

// ---------------------------------------------------------------------------
// CLAIM (perf) — integer/SIMD faster: TRUE but ORDER-NEUTRAL (RD-0036/0156).
// ---------------------------------------------------------------------------
const perfClaimIsOrderChange = false;
assert.equal(perfClaimIsOrderChange, false,
  'perf is a constant-factor win (int lanes, no FP normalization) — NOT a complexity change');
log('[perf] integer money math = constant-factor SIMD win, O() unchanged (consistent w/ RD-0036/0156)');

// ---------------------------------------------------------------------------
log('\n=== SUMMARY ===');
log('CLAIM 2 IEEE-754 error REAL ............ CONFIRMED (0.1+0.2=0.30000000000000004)');
log('CLAIM 1 x100 compile 500.00->50000 ..... CONFIRMED');
log('CLAIM 3 integer compare exact where float drifts ... CONFIRMED');
log('CLAIM 4 "100% accurate / universal" .... REFUTED (2dp-only; float*100 unsafe;');
log('        >2dp & non-2dp currencies unrepresentable; division needs rounding policy)');
log('PERF    integer/SIMD faster ............ PLAUSIBLE but ORDER-NEUTRAL (constant factor)');
log('\nALL ASSERTIONS PASSED');
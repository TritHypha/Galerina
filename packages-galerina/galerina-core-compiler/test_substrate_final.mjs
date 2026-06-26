// Direct regex test to verify CLEAN_NUMBER matching
const CLEAN_NUMBER = /^[0-9]+(\.[0-9]+)?([eE][+-]?[0-9]+)?$/;

console.log('=== CLEAN_NUMBER Regex Test ===\n');

const testNumbers = [
  { input: '1e-6', expect: true },
  { input: '1e6', expect: true },
  { input: '1e+6', expect: true },
  { input: '0.5', expect: true },
  { input: '1e', expect: false },
  { input: '1e-', expect: false },
];

let regexPass = 0, regexFail = 0;
testNumbers.forEach(tc => {
  const actual = CLEAN_NUMBER.test(tc.input);
  const ok = actual === tc.expect;
  console.log(`${ok ? '✓' : '✗'} "${tc.input}" → ${actual} (expect ${tc.expect})`);
  if (ok) regexPass++; else regexFail++;
});

console.log(`\nRegex tests: ${regexPass} passed, ${regexFail} failed\n`);

// Test field extraction (LITERAL regex from source, properly escaped)
function fieldSegment(text, field, others) {
  const stop = others.join("|");
  // This is the EXACT pattern from substrate-inference.ts, line 82
  const m = text.match(new RegExp(`\b${field}\b\s*:?\s*([^]*?)\s*(?:\b(?:${stop})\b|$)`));
  return m?.[1]?.trim();
}

console.log('=== Field Segment Extraction ===\n');

const fieldTests = [
  { text: 'tolerance: 1e-6', field: 'tolerance', others: ['lane', 'redundancy'], expect: '1e-6' },
  { text: 'lane: digital tolerance: 1e-9', field: 'tolerance', others: ['lane', 'redundancy'], expect: '1e-9' },
  { text: 'lane: noisy redundancy: 5', field: 'redundancy', others: ['lane', 'tolerance'], expect: '5' },
  { text: 'tolerance: 1 e - 6', field: 'tolerance', others: ['lane', 'redundancy'], expect: '1' },
];

let fieldPass = 0, fieldFail = 0;
fieldTests.forEach(tc => {
  const actual = fieldSegment(tc.text, tc.field, tc.others);
  const ok = actual === tc.expect;
  console.log(`${ok ? '✓' : '✗'} field="${tc.field}" in "${tc.text}"`);
  console.log(`   → "${actual}" (expect "${tc.expect}")`);
  if (actual !== undefined) {
    const clnPass = CLEAN_NUMBER.test(actual);
    console.log(`   CLEAN_NUMBER.test("${actual}"): ${clnPass}`);
  }
  if (ok) fieldPass++; else fieldFail++;
});

console.log(`\nField tests: ${fieldPass} passed, ${fieldFail} failed\n`);

// Test the actual parsing functions from the compiled dist
import { inferFlowSubstrate } from './dist/substrate-inference.js';

console.log('=== Substrate Inference Function Tests ===\n');

// We can't easily test inferFlowSubstrate without a full AST node, but we can
// at least confirm the module imports correctly and the types exist
console.log('✓ Module imported successfully');
console.log(`  inferFlowSubstrate is: ${typeof inferFlowSubstrate}`);

process.exit((regexFail + fieldFail) > 0 ? 1 : 0);

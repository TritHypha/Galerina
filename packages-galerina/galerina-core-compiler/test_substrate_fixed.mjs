// Direct regex test to verify CLEAN_NUMBER matching
const CLEAN_NUMBER = /^[0-9]+(\.[0-9]+)?([eE][+-]?[0-9]+)?$/;

const testNumbers = [
  // Valid cases that should match
  { input: '1e-6', expect: true, name: 'sci-neg' },
  { input: '1e6', expect: true, name: 'sci-no-sign' },
  { input: '1e+6', expect: true, name: 'sci-plus' },
  { input: '1E-6', expect: true, name: 'uppercase E' },
  { input: '0.5', expect: true, name: 'decimal' },
  { input: '6.022e23', expect: true, name: 'large decimal' },
  { input: '1', expect: true, name: 'integer' },
  { input: '123456', expect: true, name: 'large integer' },
  
  // Invalid cases that should NOT match
  { input: '1e', expect: false, name: 'trailing e' },
  { input: '1e-', expect: false, name: 'trailing e-' },
  { input: '1e+', expect: false, name: 'trailing e+' },
  { input: '1e-6 ', expect: false, name: 'with trailing space' },
  { input: ' 1e-6', expect: false, name: 'with leading space' },
  { input: '1e-6x', expect: false, name: 'with trailing garbage' },
  { input: '0x1e', expect: false, name: 'hex literal' },
  { input: '1.2.3', expect: false, name: 'multiple dots' },
  { input: '1..10', expect: false, name: 'double-dot range' },
];

console.log('=== CLEAN_NUMBER Regex Test ===\n');
let passed = 0, failed = 0;

testNumbers.forEach(tc => {
  const actual = CLEAN_NUMBER.test(tc.input);
  const ok = actual === tc.expect;
  const status = ok ? '✓' : '✗';
  console.log(`${status} [${tc.name}] "${tc.input}" → ${actual} (expect ${tc.expect})`);
  if (ok) passed++; else failed++;
});

console.log(`\n=== Summary ===\nPassed: ${passed}\nFailed: ${failed}\n`);

// Test field extraction with the ACTUAL regex pattern from substrate-inference.ts
function fieldSegment(text, field, others) {
  const stop = others.join("|");
  const pattern = `\b${field}\b\s*:?\s*([^]*?)\s*(?:\b(?:${stop})\b|$)`;
  console.log(`Pattern for field "${field}": ${pattern}`);
  const m = text.match(new RegExp(pattern));
  const result = m?.[1]?.trim();
  console.log(`  Match result: ${result}`);
  return result;
}

const fieldTests = [
  { text: 'tolerance: 1e-6', field: 'tolerance', others: ['lane', 'redundancy'], expect: '1e-6', name: 'simple tolerance' },
  { text: 'lane: digital tolerance: 1e-9 redundancy: 3', field: 'tolerance', others: ['lane', 'redundancy'], expect: '1e-9', name: 'in sequence' },
];

console.log('=== Field Segment Extraction Test ===\n');

fieldTests.forEach(tc => {
  console.log(`Test: ${tc.name}`);
  console.log(`  Text: "${tc.text}"`);
  const actual = fieldSegment(tc.text, tc.field, tc.others);
  const ok = actual === tc.expect;
  const status = ok ? '✓' : '✗';
  console.log(`${status} Got: "${actual}" (expect "${tc.expect}")`);
  console.log(`  CLEAN_NUMBER.test("${actual}"): ${CLEAN_NUMBER.test(actual || '')}`);
  console.log();
});

process.exit(failed > 0 ? 1 : 0);

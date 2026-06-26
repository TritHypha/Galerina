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

// Now test field extraction with the regex from the actual source
function fieldSegment(text, field, others) {
  const stop = others.join("|");
  const m = text.match(new RegExp(`\b${field}\b\s*:?\s*([^]*?)\s*(?:\b(?:${stop})\b|$)`));
  return m?.[1]?.trim();
}

const fieldTests = [
  { text: 'lane: digital tolerance: 1e-9 redundancy: 3', field: 'tolerance', expect: '1e-9', name: 'valid sci-notation' },
  { text: 'tolerance: 1e-6', field: 'tolerance', expect: '1e-6', name: 'just tolerance' },
  { text: 'tolerance 1e-6', field: 'tolerance', expect: '1e-6', name: 'no colon' },
  { text: 'tolerance: 1 e - 6', field: 'tolerance', expect: '1', name: 'split exponent (should fail CLEAN_NUMBER)' },
  { text: 'tolerance: 1e- 6', field: 'tolerance', expect: '1e-', name: 'split sign (should fail)' },
  { text: 'tolerance: 1e', field: 'tolerance', expect: '1e', name: 'incomplete exponent (should fail)' },
  { text: 'lane: noisy tolerance: 0.5', field: 'tolerance', expect: '0.5', name: 'decimal tolerance' },
  { text: 'lane: digital redundancy: 5', field: 'redundancy', expect: '5', name: 'redundancy field' },
  { text: 'unknown tolerance: 1e-6', field: 'tolerance', expect: '1e-6', name: 'with unknown prefix' },
];

console.log('=== Field Segment Extraction Test ===\n');
let fpassed = 0, ffailed = 0;

fieldTests.forEach(tc => {
  const actual = fieldSegment(tc.text, tc.field, ['lane', 'tolerance', 'redundancy']);
  const ok = actual === tc.expect;
  const status = ok ? '✓' : '✗';
  console.log(`${status} [${tc.name}]`);
  console.log(`   Text: "${tc.text}"`);
  console.log(`   Field: ${tc.field}, Got: "${actual}" (expect "${tc.expect}")`);
  
  // Also check if it would pass CLEAN_NUMBER
  const passes = CLEAN_NUMBER.test(actual || '');
  console.log(`   CLEAN_NUMBER: ${passes}`);
  
  if (ok) fpassed++; else ffailed++;
});

console.log(`\n=== Field Extraction Summary ===\nPassed: ${fpassed}\nFailed: ${ffailed}`);
process.exit((failed + ffailed) > 0 ? 1 : 0);

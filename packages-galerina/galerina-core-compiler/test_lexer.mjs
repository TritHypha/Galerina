import { lex } from './dist/lexer.js';

const testCases = [
  // Scientific notation — should all be ONE number token
  { input: '1e-6', name: 'scientific e-neg', expect: { numbers: ['1e-6'] } },
  { input: '1E-9', name: 'scientific E-neg', expect: { numbers: ['1E-9'] } },
  { input: '2.5e3', name: 'decimal with e-pos', expect: { numbers: ['2.5e3'] } },
  { input: '1e10', name: 'e-pos no sign', expect: { numbers: ['1e10'] } },
  { input: '6.022e23', name: 'large decimal exp', expect: { numbers: ['6.022e23'] } },
  
  // Incomplete exponents — should be number + e/operator
  { input: '1e', name: 'trailing e only', expect: { numbers: ['1'], identifiers: ['e'] } },
  { input: '1e-', name: 'trailing e-sign only', expect: { numbers: ['1'], identifiers: ['e'], operators: ['-'] } },
  { input: '1e+', name: 'trailing e+sign only', expect: { numbers: ['1'], identifiers: ['e'], operators: ['+'] } },
  
  // Base-prefixed — e must not be consumed in hex/octal
  { input: '0x1e', name: 'hex with e digit', expect: { numbers: ['0x1e'] } },
  { input: '0xFF', name: 'hex uppercase', expect: { numbers: ['0xFF'] } },
  { input: '0b101', name: 'binary', expect: { numbers: ['0b101'] } },
  { input: '0o17', name: 'octal', expect: { numbers: ['0o17'] } },
  
  // Range, version-like, member access
  { input: '1..10', name: 'range operator', expect: { numbers: ['1', '10'], operators: ['..'] } },
  { input: '1.2.3', name: 'version-like', expect: { numbers: ['1.2', '3'] } },
  { input: '1.method()', name: 'member on number', expect: { numbers: ['1'], identifiers: ['method'], symbols: ['(', ')'] } },
  
  // Identifiers named e/exp
  { input: 'e', name: 'identifier e', expect: { identifiers: ['e'] } },
  { input: 'exp', name: 'identifier exp', expect: { identifiers: ['exp'] } },
  { input: 'e2e', name: 'identifier e2e', expect: { identifiers: ['e2e'] } },
  { input: 'let e = 5', name: 'var e', expect: { keywords: ['let'], identifiers: ['e'], numbers: ['5'] } },
];

let passed = 0, failed = 0;

testCases.forEach(tc => {
  const result = lex(tc.input, 'test.spore');
  const numbers = result.tokens.filter(t => t.kind === 'number');
  const identifiers = result.tokens.filter(t => t.kind === 'identifier');
  const operators = result.tokens.filter(t => t.kind === 'operator');
  const keywords = result.tokens.filter(t => t.kind === 'keyword');
  const symbols = result.tokens.filter(t => t.kind === 'symbol');
  
  const check = {
    numbers: numbers.map(t => t.value),
    identifiers: identifiers.map(t => t.value),
    operators: operators.map(t => t.value),
    keywords: keywords.map(t => t.value),
    symbols: symbols.map(t => t.value),
  };
  
  let ok = true;
  if (tc.expect) {
    for (const [k, v] of Object.entries(tc.expect)) {
      if (JSON.stringify(check[k]) !== JSON.stringify(v)) {
        ok = false;
        break;
      }
    }
  }
  
  const status = ok ? '✓ PASS' : '✗ FAIL';
  console.log(`${status} [${tc.name}] "${tc.input}"`);
  
  if (!ok) {
    console.log(`   Expected: ${JSON.stringify(tc.expect)}`);
    console.log(`   Got:      ${JSON.stringify(check)}`);
    failed++;
  } else {
    passed++;
  }
});

console.log(`\n\n=== SUMMARY ===\nPassed: ${passed}\nFailed: ${failed}`);
process.exit(failed > 0 ? 1 : 0);

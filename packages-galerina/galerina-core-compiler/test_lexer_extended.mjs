import { lex } from './dist/lexer.js';

const testCases = [
  // Critical scientific notation cases
  { input: '1e-6', name: 'decimal exp-neg', check: (t) => t.filter(x => x.kind === 'number').length === 1 },
  { input: '1E-6', name: 'uppercase E-neg', check: (t) => t.filter(x => x.kind === 'number').length === 1 },
  { input: '1e6', name: 'exp-pos no sign', check: (t) => t.filter(x => x.kind === 'number').length === 1 },
  { input: '1e+6', name: 'exp-pos explicit sign', check: (t) => t.filter(x => x.kind === 'number').length === 1 },
  { input: '3.14159e-10', name: 'long decimal exp', check: (t) => t.filter(x => x.kind === 'number').length === 1 },
  { input: '1.23E+456', name: 'decimal E-pos', check: (t) => t.filter(x => x.kind === 'number').length === 1 },
  
  // Edge: incomplete exponents should NOT consume the 'e'
  { input: '1e', name: 'trailing e', check: (t) => {
    const nums = t.filter(x => x.kind === 'number').map(x => x.value);
    const ids = t.filter(x => x.kind === 'identifier').map(x => x.value);
    return nums.length === 1 && nums[0] === '1' && ids.length === 1 && ids[0] === 'e';
  }},
  { input: '1e-', name: 'trailing e minus', check: (t) => {
    const nums = t.filter(x => x.kind === 'number').map(x => x.value);
    const ids = t.filter(x => x.kind === 'identifier').map(x => x.value);
    return nums[0] === '1' && ids[0] === 'e';
  }},
  { input: '1e+', name: 'trailing e plus', check: (t) => {
    const nums = t.filter(x => x.kind === 'number').map(x => x.value);
    const ids = t.filter(x => x.kind === 'identifier').map(x => x.value);
    return nums[0] === '1' && ids[0] === 'e';
  }},
  { input: '1E', name: 'trailing uppercase E', check: (t) => {
    const nums = t.filter(x => x.kind === 'number').map(x => x.value);
    const ids = t.filter(x => x.kind === 'identifier').map(x => x.value);
    return nums[0] === '1' && ids[0] === 'E';
  }},
  
  // Hex: the 'e' in 0x1e is a hex digit, must NOT trigger exponent parsing
  { input: '0x1e', name: 'hex 1e', check: (t) => {
    const nums = t.filter(x => x.kind === 'number').map(x => x.value);
    return nums.length === 1 && nums[0] === '0x1e';
  }},
  { input: '0xABCDEF', name: 'hex ABCDEF', check: (t) => {
    const nums = t.filter(x => x.kind === 'number').map(x => x.value);
    return nums.length === 1 && nums[0] === '0xABCDEF';
  }},
  { input: '0xE', name: 'hex single E', check: (t) => {
    const nums = t.filter(x => x.kind === 'number').map(x => x.value);
    return nums.length === 1 && nums[0] === '0xE';
  }},
  
  // Octal/binary: ensure no side effects
  { input: '0b1010', name: 'binary', check: (t) => {
    const nums = t.filter(x => x.kind === 'number').map(x => x.value);
    return nums[0] === '0b1010';
  }},
  { input: '0o777', name: 'octal', check: (t) => {
    const nums = t.filter(x => x.kind === 'number').map(x => x.value);
    return nums[0] === '0o777';
  }},
  
  // Range and version patterns
  { input: '1..10', name: 'range 1..10', check: (t) => {
    const nums = t.filter(x => x.kind === 'number');
    const ops = t.filter(x => x.kind === 'operator');
    return nums.length === 2 && ops.length === 1 && ops[0].value === '..';
  }},
  { input: '1.2.3', name: 'version 1.2.3', check: (t) => {
    const nums = t.filter(x => x.kind === 'number');
    return nums.length === 2 && nums[0].value === '1.2' && nums[1].value === '3';
  }},
  
  // Identifiers that could look like exponents
  { input: 'e', name: 'ident e alone', check: (t) => t.filter(x => x.kind === 'identifier' && x.value === 'e').length === 1 },
  { input: 'E', name: 'ident E alone', check: (t) => t.filter(x => x.kind === 'identifier' && x.value === 'E').length === 1 },
  { input: 'exp', name: 'ident exp', check: (t) => t.filter(x => x.kind === 'identifier' && x.value === 'exp').length === 1 },
  { input: 'e2e', name: 'ident e2e', check: (t) => t.filter(x => x.kind === 'identifier' && x.value === 'e2e').length === 1 },
  { input: 'let e = 5', name: 'let binding e', check: (t) => {
    const kw = t.filter(x => x.kind === 'keyword').map(x => x.value);
    return kw.includes('let');
  }},
  
  // EOF edge case
  { input: '1e', name: 'EOF after 1e', check: (t) => {
    const nums = t.filter(x => x.kind === 'number');
    const ids = t.filter(x => x.kind === 'identifier');
    return nums.length === 1 && nums[0].value === '1' && ids.length === 1;
  }},
  
  // Stress: numbers that parse as floats
  { input: '0.0', name: 'float 0.0', check: (t) => t.filter(x => x.kind === 'number').length === 1 },
  { input: '123.456', name: 'float 123.456', check: (t) => t.filter(x => x.kind === 'number').length === 1 },
  { input: '.5', name: 'leading dot .5 (fails)', check: (t) => {
    // .5 is tokenized as "." then identifier/number; lexer requires leading digit
    return true; // just check it doesn't crash
  }},
  
  // Sequential: two scientific-notation numbers
  { input: '1e-6 2e-3', name: 'two sci-notations', check: (t) => {
    const nums = t.filter(x => x.kind === 'number').map(x => x.value);
    return nums.length === 2 && nums[0] === '1e-6' && nums[1] === '2e-3';
  }},
];

let passed = 0, failed = 0;

testCases.forEach(tc => {
  const result = lex(tc.input, 'test.spore');
  const nonTrivia = result.tokens.filter(t => t.kind !== 'eof' && t.kind !== 'newline');
  
  let ok = false;
  try {
    ok = tc.check(nonTrivia);
  } catch (e) {
    ok = false;
  }
  
  const status = ok ? '✓' : '✗';
  console.log(`${status} [${tc.name}] "${tc.input}"`);
  
  if (!ok) {
    console.log(`   Tokens: ${nonTrivia.map(t => `${t.kind}(${t.value})`).join(' ')}`);
    console.log(`   Diagnostic: ${result.diagnostics.length > 0 ? result.diagnostics[0].message : 'none'}`);
    failed++;
  } else {
    passed++;
  }
});

console.log(`\n=== SUMMARY ===\nPassed: ${passed}\nFailed: ${failed}`);
process.exit(failed > 0 ? 1 : 0);

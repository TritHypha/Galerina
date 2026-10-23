// invariant-discharge.test.mjs — pins the ONE shared static-discharge oracle (S2 fuller-A, RD-0456).
// The whole point of this module is that the governance-verifier and the WAT emitter fold governance
// operands through the SAME function, so they cannot drift. These tests pin the fold's trit for every
// case it proves (and the fail-closed 0 for everything else), plus the conjunction decomposition and the
// structured per-operand discharge.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  foldStaticVerdict,
  flattenGovernanceConjunction,
  dischargeEnsureOperands,
} from "../dist/invariant-discharge.js";

const bool = (v) => ({ kind: "boolLiteral", value: v });
const num = (v) => ({ kind: "numberLiteral", value: String(v) });
const bin = (op, l, r) => ({ kind: "binaryExpr", value: op, children: [l, r] });
const not = (x) => ({ kind: "unaryExpr", value: "!", children: [x] });
const id = (v) => ({ kind: "identifier", value: v }); // a runtime operand (never a constant)

test("foldStaticVerdict: boolean literals → ±1", () => {
  assert.equal(foldStaticVerdict(bool("true")), 1);
  assert.equal(foldStaticVerdict(bool("false")), -1);
});

test("foldStaticVerdict: numeric-literal comparisons fold to the right trit", () => {
  assert.equal(foldStaticVerdict(bin(">", num(5), num(0))), 1);
  assert.equal(foldStaticVerdict(bin(">", num(0), num(5))), -1);
  assert.equal(foldStaticVerdict(bin("==", num(3), num(3))), 1);
  assert.equal(foldStaticVerdict(bin("!=", num(3), num(3))), -1);
  assert.equal(foldStaticVerdict(bin("<=", num(2), num(2))), 1);
  assert.equal(foldStaticVerdict(bin(">=", num(1), num(2))), -1);
});

test("foldStaticVerdict: negation of a bool literal (the case the emitter historically missed)", () => {
  // This is the single-witness win: the verifier always proved `!false`/`!true`; now the emitter agrees.
  assert.equal(foldStaticVerdict(not(bool("false"))), 1);  // !false = true
  assert.equal(foldStaticVerdict(not(bool("true"))), -1);  // !true = false
});

test("foldStaticVerdict: anything runtime-dependent is 0 (unknown → keep the gate, fail-closed)", () => {
  assert.equal(foldStaticVerdict(id("x")), 0);
  assert.equal(foldStaticVerdict(bin(">", id("x"), num(0))), 0); // a real param compare — never elided
  assert.equal(foldStaticVerdict(not(id("flag"))), 0);          // negation of a non-constant
  assert.equal(foldStaticVerdict(bin("&&", bool("true"), id("x"))), 0); // a conjunction is not itself a constant
});

test("foldStaticVerdict: conjunction false is decisive despite an unknown operand", () => {
  const values = [
    [bool("false"), -1],
    [bool("true"), 1],
    [id("x"), 0],
  ];
  for (const [left, leftVerdict] of values) {
    for (const [right, rightVerdict] of values) {
      const expected = leftVerdict === -1 || rightVerdict === -1
        ? -1
        : leftVerdict === 1 && rightVerdict === 1 ? 1 : 0;
      assert.equal(foldStaticVerdict(bin("&&", left, right)), expected);
      assert.equal(foldStaticVerdict(bin("and", left, right)), expected);
    }
  }
});

test("flattenGovernanceConjunction: left-assoc && chain → ordered operands; non-conjunction → singleton", () => {
  const chain = bin("&&", bin("&&", bool("true"), id("x")), bin(">", id("y"), num(0)));
  const ops = flattenGovernanceConjunction(chain);
  assert.equal(ops.length, 3);
  assert.equal(ops[0].value, "true");
  assert.equal(ops[1].value, "x");
  assert.equal(ops[2].value, ">");
  // `and` keyword flattens the same as `&&`
  assert.equal(flattenGovernanceConjunction(bin("and", bool("true"), id("z"))).length, 2);
  // a bare comparison is one operand
  assert.equal(flattenGovernanceConjunction(bin(">", id("x"), num(0))).length, 1);
});

test("dischargeEnsureOperands: structured per-operand trit, order-stable", () => {
  // `true && x && (5 > 0)` → [ALLOW(elide), UNKNOWN(keep), ALLOW(elide)]
  const chain = bin("&&", bin("&&", bool("true"), id("x")), bin(">", num(5), num(0)));
  const d = dischargeEnsureOperands(chain);
  assert.deepEqual(d, [
    { operandIdx: 0, staticVerdict: 1 },
    { operandIdx: 1, staticVerdict: 0 },
    { operandIdx: 2, staticVerdict: 1 },
  ]);
  // a statically-DENY operand surfaces as -1 (the emitter collapses the whole min-chain → FUNGI-INV-001)
  const withDeny = bin("&&", id("x"), bool("false"));
  assert.deepEqual(dischargeEnsureOperands(withDeny), [
    { operandIdx: 0, staticVerdict: 0 },
    { operandIdx: 1, staticVerdict: -1 },
  ]);
});

// Exact integer proof is separate from runtime enforcement of UNKNOWN numeric forms.
import * as L from '../dist/index.js';

const numericToken = value => ({ kind: 'numberLiteral', value });
const cmp = (left, op, right) => ({ kind: 'binaryExpr', value: op, children: [numericToken(left), numericToken(right)] });
const conjunction = (left, right) => ({ kind: 'binaryExpr', value: '&&', children: [left, right] });
const ops = ['<', '<=', '>', '>=', '==', '!='];
// Expected vectors are explicit, not computed using the production numeric parser.
for (const [left, right, expected] of [
  ['9007199254740992', '9007199254740993', [0, 0, 0, 0, 0, 0]],
  ['18446744073709551615', '18446744073709551614', [0, 0, 0, 0, 0, 0]],
  ['0x10', '0x20', [1, 1, -1, -1, -1, 1]],
  ['0b10000', '0o20', [-1, 1, -1, 1, 1, -1]],
  ['0XFF', '255', [-1, 1, -1, 1, 1, -1]],
  ['0B11', '0O3', [-1, 1, -1, 1, 1, -1]],
  ['1_000', '1000', [-1, 1, -1, 1, 1, -1]],
  ['00012', '12', [-1, 1, -1, 1, 1, -1]],
  ['0', '1', [1, 1, -1, -1, -1, 1]],
]) {
  test(`exact integer comparison vector: ${left} vs ${right}`, () => {
    ops.forEach((op, i) => assert.equal(foldStaticVerdict(cmp(left, op, right)), expected[i], op));
  });
}

for (const spelling of [undefined, '', ' ', '1junk', '1n', '0x', '0b', '0o', '0xGG',
  '0b102', '0o8', '_1', '1_', '1__0', '0x1_0', '0b1_0', '0o1_0', '+1', '-1',
  '1\n', '1\r', '1\r\n', '1\u2028', '1\u2029', '1\0', '1 ', ' 1',
  '1.5', '1.0', '1e3', '1E+3', '1e-3', '1.5e2', '1e400', 'NaN', 'Infinity']) {
  test(`non-integer or incomplete spelling remains UNKNOWN: ${JSON.stringify(spelling)}`, () => {
    for (const op of ops) {
      assert.equal(foldStaticVerdict(cmp(spelling, op, '1')), 0, `left ${op}`);
      assert.equal(foldStaticVerdict(cmp('1', op, spelling)), 0, `right ${op}`);
    }
  });
}

test('exact DENY, ALLOW and numeric UNKNOWN preserve K3 conjunction and operand order', () => {
  const deny = cmp('1', '==', '2');
  const allow = cmp('0x10', '==', '16');
  const unknown = cmp('1.5', '==', '1.5');
  assert.equal(foldStaticVerdict(conjunction(unknown, deny)), -1);
  assert.equal(foldStaticVerdict(conjunction(deny, unknown)), -1);
  assert.equal(foldStaticVerdict(conjunction(allow, unknown)), 0);
  assert.equal(foldStaticVerdict(conjunction(allow, allow)), 1);
  assert.deepEqual(dischargeEnsureOperands(conjunction(conjunction(allow, unknown), deny)), [
    { operandIdx: 0, staticVerdict: 1 }, { operandIdx: 1, staticVerdict: 0 }, { operandIdx: 2, staticVerdict: -1 },
  ]);
});

function parseAndVerify(expr) {
  const source = `pure flow probe(n: Int) -> Int\ncontract { effects {} invariant { ensure ${expr}; } }\n{ return n }`;
  const parsed = L.parseProgram(source, 'invariant-numeric.fungi');
  assert.deepEqual(parsed.diagnostics.filter(d => d.severity === 'error'), [], 'valid literal syntax');
  const effects = L.checkEffects(parsed.flows, parsed.ast);
  const gov = L.verifyGovernance(parsed.ast, parsed.flows, effects, 'dev');
  return { parsed, effects, gov };
}

for (const [expr, expected] of [
  ['9007199254740992 == 9007199254740993', 0], ['0x10 == 0x20', -1],
  ['9007199254740993 == 9007199254740993', 0], ['0x10 == 16', 1], ['1_000 == 1000', 1],
  ['1.5 == 1.5', 0], ['1.5 == 1.6', 0], ['1e3 == 1e3', 0], ['1e3 == 2e3', 0],
]) {
  test(`parser -> governance numeric identity: ${expr}`, () => {
    const { gov } = parseAndVerify(expr);
    const errors = gov.diagnostics.filter(d => d.severity === 'error');
    assert.deepEqual(errors.map(d => d.code), expected === -1 ? ['FUNGI-INV-001'] : []);
    assert.equal(gov.proofObligations.some(p => p.endsWith(':statically_verified')), expected === 1);
    assert.equal(gov.proofObligations.some(p => p.endsWith(':runtime-precheck')), expected === 0);
  });
}

test('parser negative integer remains unary expression, not invented signed literal syntax', () => {
  const { parsed } = parseAndVerify('-1 == -1');
  const nodes = [];
  const visit = n => { nodes.push(n); for (const c of n.children ?? []) visit(c); };
  visit(parsed.ast);
  const negations = nodes.filter(n => n.kind === 'unaryExpr' && n.value === '-');
  assert.equal(negations.length, 2);
  assert.equal(negations[0].children[0].value, '1');
});

for (const [expr, traps, runtime] of [
  ['1.5 == 1.5', false, true], ['1.5 == 1.6', true, true],
  ['1e3 == 1e3', false, true], ['1e3 == 2e3', true, true],
  ['1e-3 < 2e-3', false, true], ['1e-3 > 2e-3', true, true],
  ['0x10 == 16', false, false],
]) {
  test(`real WAT gate/positive twin: ${expr}`, async () => {
    const { parsed, effects, gov } = parseAndVerify(expr);
    assert.deepEqual(gov.diagnostics.filter(d => d.severity === 'error'), []);
    const { gir } = L.emitGIR(parsed.ast, parsed.flows, effects);
    const wat = L.renderWAT(L.buildWATModuleFromGIR(gir, undefined, 'numeric', parsed.ast, true));
    assert.equal(wat.includes(';; ensure '), runtime, 'UNKNOWN retains the actual emitted gate');
    const asm = await L.assembleWAT(wat);
    assert.ok(asm.valid, JSON.stringify(asm.diagnostics));
    // Direct bootstrap WAT execution, deliberately not a full resolver/CLI or signed-host claim.
    const { instance } = await WebAssembly.instantiate(asm.wasm, {});
    if (traps) assert.throws(() => instance.exports.probe(7), WebAssembly.RuntimeError);
    else assert.equal(instance.exports.probe(7), 7);
  });
}

// Static proof must not authorize elision that the admitted execution lane cannot honor.
// Wide numeric forms stay UNKNOWN until admission and lowering parity are independently verified.
for (const [expr, expected] of [
  ['9007199254740992 < 9007199254740993', 0],
  ['9007199254740992 != 9007199254740993', 0],
  ['10 < 11', 1],
  ['10 > 11', -1],
]) {
  test(`runtime parity: a static integer proof agrees with parsed interpreter predicate: ${expr}`, async () => {
    const parsed = L.parseProgram(`@version 1\npure flow predicate() -> Bool contract { effects {} } { return ${expr} }`, 'parity.fungi');
    assert.deepEqual(parsed.diagnostics.filter(d => d.severity === 'error'), []);
    const find = node => node.kind === 'returnStmt' ? node.children[0] : (node.children ?? []).map(find).find(Boolean);
    const expression = find(parsed.ast);
    const verdict = foldStaticVerdict(expression);
    assert.equal(verdict, expected, 'only a proven in-range integer comparison may discharge statically');
    const result = await L.executeFlow('predicate', new Map(), parsed.ast, undefined, undefined, undefined, { pureFastPath: false });
    if (verdict === 1) assert.deepEqual(result.value, { __tag: 'bool', value: true }, 'ALLOW may not conceal a false executed predicate');
    if (expected === -1) assert.deepEqual(result.value, { __tag: 'bool', value: false });
  });
}

for (const [expr, expected] of [['2147483647 < 2147483648', 0], ['0xffffffff > 0', 0], ['10 < 11', 1]]) {
  test(`runtime parity: static ALLOW agrees with checked WAT predicate: ${expr}`, async () => {
    const source = `@version 1\npure flow predicate() -> Bool contract { intent { "Numeric parity." } effects {} } { return ${expr} }\nroute GET "/predicate" { flow predicate }`;
    const checked = L.checkProgram(source, 'wat-parity.fungi');
    assert.equal(checked.ok, true, JSON.stringify(checked));
    const find = node => node.kind === 'returnStmt' ? node.children[0] : (node.children ?? []).map(find).find(Boolean);
    const verdict = foldStaticVerdict(find(checked.program.ast));
    assert.equal(verdict, expected, 'out-of-i32 expressions remain runtime-checked');
    const wat = L.renderWAT(L.buildWATFromCheckedProgram(checked.program));
    const asm = await L.assembleWAT(wat);
    assert.ok(asm.valid, JSON.stringify(asm.diagnostics));
    const { instance } = await WebAssembly.instantiate(asm.wasm, {});
    if (verdict === 1) assert.equal(instance.exports.predicate(), 1, 'elision proof must agree with non-elided i32 comparison');
  });
}

test('runtime parity: typed Int64 operands preserve distinct wide values in interpreter and WAT', async () => {
  const source = '@version 1\npure flow predicate(a: Int64, b: Int64) -> Bool contract { intent { "Numeric parity." } effects {} } { return a < b }\nroute GET "/predicate" { flow predicate }';
  const checked = L.checkProgram(source, 'i64-parity.fungi');
  assert.equal(checked.ok, true, JSON.stringify(checked));
  const args = new Map([['a', { __tag: 'int64', value: 9007199254740992n }], ['b', { __tag: 'int64', value: 9007199254740993n }]]);
  const interpreted = await L.executeFlow('predicate', args, checked.program.ast, undefined, undefined, undefined, { pureFastPath: false });
  assert.deepEqual(interpreted.value, { __tag: 'bool', value: true });
  const asm = await L.assembleWAT(L.renderWAT(L.buildWATFromCheckedProgram(checked.program)));
  assert.ok(asm.valid, JSON.stringify(asm.diagnostics));
  const { instance } = await WebAssembly.instantiate(asm.wasm, {});
  assert.equal(instance.exports.predicate(9007199254740992n, 9007199254740993n), 1);
  assert.equal(instance.exports.predicate(9007199254740993n, 9007199254740992n), 0);
});

function checkedInvariant(expr) {
  return L.checkProgram(
    `@version 1\npure flow probe(n: Int) -> Int contract { intent { "Invariant execution control." } effects {} invariant { ensure ${expr}; } } { return n }\nroute GET "/probe" { flow probe }`,
    'checked-invariant-gate.fungi',
  );
}

test('checked invariant admission rejects static DENY before WASM emission', () => {
  const denied = checkedInvariant('10 > 11');
  assert.equal(denied.ok, false, 'a statically false invariant cannot become an admitted program');
  assert.ok(denied.diagnostics.some(d => d.code === 'FUNGI-INV-001' && d.severity === 'error'));
});

// Exercise the admitted invariant itself, not merely the same expression in a
// plain predicate. UNKNOWN must retain an executable gate with positive controls.
for (const [expr, succeeds] of [
  ['9007199254740992 == 9007199254740993', false],
  ['9007199254740992 != 9007199254740993', true],
  ['9007199254740992 < 9007199254740993', true],
  ['9007199254740992 > 9007199254740993', false],
  ['9007199254740992 <= 9007199254740993', true],
  ['9007199254740992 >= 9007199254740993', false],
  ['2147483647 < 2147483648', false],
  ['0xffffffff > 0', false],
  ['4294967296 == 0', true],
  ['10 < 11 && 9007199254740992 == 9007199254740993', false],
  ['10 < 11 && 9007199254740992 != 9007199254740993', true],
]) {
  test(`checked invariant UNKNOWN gate executes: ${expr}`, async () => {
    const checked = checkedInvariant(expr);
    assert.equal(checked.ok, true, JSON.stringify(checked));
    const wat = L.renderWAT(L.buildWATFromCheckedProgram(checked.program));
    assert.ok(wat.includes(';; ensure '), 'UNKNOWN must not remove the runtime invariant gate');
    const asm = await L.assembleWAT(wat);
    assert.ok(asm.valid, JSON.stringify(asm.diagnostics));
    const { instance } = await WebAssembly.instantiate(asm.wasm, {});
    if (succeeds) assert.equal(instance.exports.probe(7), 7, 'true invariant must permit the flow');
    else assert.throws(() => instance.exports.probe(7), WebAssembly.RuntimeError, 'false invariant must trap');
  });
}

// `Int` is an i32 lane: the existing FUNGI-TYPE-024 contract warns that out-of-range
// decimal literals wrap in lowering. Pin identical exact modulo-i32 behavior in both
// bootstrap execution lanes; JS Number parsing and raw oversized WAT constants drift.
for (const [expr, expected] of [
  ['2147483647 < 2147483648', false],
  ['4294967295 > 0', false],
  ['4294967296 == 0', true],
  ['9007199254740992 < 9007199254740993', true],
  ['9007199254740992 == 9007199254740993', false],
]) {
  test(`runtime parity: i32 literal wrap is exact in interpreter and WAT: ${expr}`, async () => {
    const source = `@version 1\npure flow predicate() -> Bool contract { effects {} } { return ${expr} }\nroute GET "/predicate" { flow predicate }`;
    const parsed = L.parseProgram(source, 'i32-literal-runtime-parity.fungi');
    const checked = L.checkProgram(source, 'i32-literal-runtime-parity.fungi');
    assert.deepEqual(parsed.diagnostics.filter(d => d.severity === 'error'), []);
    assert.equal(checked.ok, true, JSON.stringify(checked));

    const interpreted = await L.executeFlow('predicate', new Map(), parsed.ast, undefined, undefined, undefined, { pureFastPath: false });
    assert.deepEqual(interpreted.value, { __tag: 'bool', value: expected }, 'tree-walker must use exact signed-i32 literal semantics');

    const wat = L.renderWAT(L.buildWATFromCheckedProgram(checked.program));
    const asm = await L.assembleWAT(wat);
    assert.ok(asm.valid && asm.diagnostics.length === 0, JSON.stringify(asm.diagnostics));
    const { instance } = await WebAssembly.instantiate(asm.wasm, {});
    assert.equal(instance.exports.predicate(), expected ? 1 : 0, 'WASM must match the language i32 lane');
  });
}

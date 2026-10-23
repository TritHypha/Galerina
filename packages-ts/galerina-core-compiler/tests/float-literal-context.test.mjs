import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../dist/index.js';

// Integer-token spelling is admitted in a declared floating-point context. It
// must not be reduced to i32 before conversion to that destination type.
for (const [type, body, expected] of [
  ['Float', 'return 2147483648', 2147483648],
  ['Float', 'return -2147483649', -2147483649],
  ['Float', 'let x: Float = 2147483648; return x', 2147483648],
  ['Float', 'return 2147483648 + 0.5', 2147483648.5],
  ['Float32', 'return 2147483648', 2147483648],
  ['Float', 'return 2147483648.0', 2147483648],
  ['Int', 'return 2147483648', -2147483648],
]) {
  for (const [tier, options] of [
    ['tree', { pureFastPath: false, egraphFastPath: false }],
    ['bytecode', { pureFastPath: true }],
    ['execution graph', { pureFastPath: false, egraphFastPath: true }],
  ]) {
  test(`${type} numeric context (${tier}): ${body}`, async () => {
    const source = `@version 1\npure flow probe() -> ${type} contract { intent { "Numeric context parity." } effects {} } { ${body} }\nroute GET "/probe" { flow probe }`;
    const checked = L.checkProgram(source, 'float-literal-context.fungi');
    assert.equal(checked.ok, true, JSON.stringify(checked));
    const execution = await L.executeFlow('probe', new Map(), checked.program.ast,
      undefined, undefined, undefined, options);
    assert.equal(execution.value.value, expected, JSON.stringify(execution.value));
    if (type === 'Float' || type === 'Float32') {
      assert.equal(execution.value.__tag, 'float', JSON.stringify(execution.value));
    } else {
      assert.equal(execution.value.__tag, 'int', JSON.stringify(execution.value));
    }
    if (type === 'Float32') assert.equal(execution.value.width, 32);
    const wat = L.renderWAT(L.buildWATFromCheckedProgram(checked.program));
    const assembled = await L.assembleWAT(wat);
    assert.equal(assembled.valid, true, JSON.stringify(assembled.diagnostics));
    const { instance } = await WebAssembly.instantiate(assembled.wasm, {});
    assert.equal(instance.exports.probe(), expected, 'checked WASM must preserve the declared numeric context');
  });
  }
}

test('hexadecimal Byte expression is not implicitly admitted as Float', () => {
  const checked = L.checkProgram('@version 1\npure flow probe() -> Float contract { effects {} } { return 0x80000000 }\nroute GET "/probe" { flow probe }', 'float-hex-refusal.fungi');
  assert.equal(checked.ok, false);
  assert.ok(checked.diagnostics.some(d => d.code === 'FUNGI-TYPE-008'));
});

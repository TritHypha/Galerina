import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../dist/index.js';

for (const [type, expr, expected, bytecodeTier, graphTier] of [
  ['Byte', '0b10 + 0b1', 3, 'bytecode', 'egraph'],
  ['Byte', '0o10 + 0o1', 9, 'bytecode', 'egraph'],
  ['Byte', '0x10 + 0x1', 17, 'bytecode', 'egraph'],
  ['Byte', '1_0 + 0b1', 11, 'bytecode', 'egraph'],
  ['Bool', '9007199254740992 == 9007199254740993', false, null, 'egraph'],
  ['Bool', '9007199254740992 < 9007199254740993', true, null, 'egraph'],
]) {
  for (const [tier, options, expectedTier] of [
    ['pure fast path', { pureFastPath: true }, bytecodeTier],
    ['execution graph', { pureFastPath: false, egraphFastPath: true }, graphTier],
  ]) {
    test(`${tier} agrees with the checked literal semantics: ${expr}`, async () => {
      const source = `@version 1\npure flow probe() -> ${type} contract { intent { "Numeric tier parity." } effects {} } { return ${expr} }\nroute GET "/probe" { flow probe }`;
      const checked = L.checkProgram(source, 'numeric-fast-tier-parity.fungi');
      assert.equal(checked.ok, true, JSON.stringify(checked));
      const reference = await L.executeFlow('probe', new Map(), checked.program.ast,
        undefined, undefined, undefined, { pureFastPath: false });
      assert.equal(reference.value.value, expected, 'explicit oracle checks the tree interpreter too');
      const optimized = await L.executeFlow('probe', new Map(), checked.program.ast,
        undefined, undefined, undefined, options);
      assert.equal(optimized.value.value, expected, 'optimization must preserve the admitted result');
      assert.equal(optimized.value.__tag, type === 'Bool' ? 'bool' : 'int');
      if (expectedTier === null) {
        assert.notEqual(optimized.executionTier, tier === 'pure fast path' ? 'bytecode' : 'egraph');
      } else {
        assert.equal(optimized.executionTier, expectedTier);
      }
    });
  }
}

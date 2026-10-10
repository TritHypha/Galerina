import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync, realpathSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { historicalCodexZoneHashes, HISTORICAL_ZONE_FIXTURE, CURRENT_CODEX_ZONE } from '../lib/codex-zone-freeze.mjs';
import { runCodexZoneHashes, resolveZoneAgentsRoot } from '../lib/codex-zone-hash-runner.mjs';
const root = fileURLToPath(new URL('../../', import.meta.url));
const oldHashes = [
  '7db668236da13ad6e898bd7ab125e67c096b8b4ca2aeea861698fb1c2a649c9f',
  'eacc64386775298dc0c0f41401234bcc3210ff0f49bbcb1e39539c0e095a8929',
  '646835cf3f8006c999e60ae125c8585a23d148468875cca36c608713e7571e7f',
];

test('historical regions retain old assertions and each one-byte mutation fails', () => {
  const fixture = JSON.parse(readFileSync(HISTORICAL_ZONE_FIXTURE, 'utf8'));
  const verify = candidate => assert.deepEqual(historicalCodexZoneHashes(candidate).map(row => row.sha256), oldHashes);
  verify(fixture);
  for (let index = 0; index < 3; index++) {
    const changed = structuredClone(fixture);
    changed.regions[index].text += ' ';
    assert.throws(() => verify(changed), assert.AssertionError);
    verify(fixture);
  }
  assert.throws(() => historicalCodexZoneHashes({ ...fixture, revision: 'wrong' }), assert.AssertionError);
  assert.throws(() => historicalCodexZoneHashes({ ...fixture, regions: fixture.regions.slice(1) }), assert.AssertionError);
});

test('canonical current-region checks reject each independent mutation; original twin stays clear', () => {
  const agents = resolveZoneAgentsRoot(root);
  const temp = mkdtempSync(join(tmpdir(), 'codex-zone-freeze-'));
  assert.equal(dirname(realpathSync(temp)), realpathSync(tmpdir()));
  try {
    const base = join(temp, 'packages-ts/galerina-core-compiler/src');
    mkdirSync(base, { recursive: true });
    const sources = Object.fromEntries(['wat-emitter.ts', 'wat-emitter-binary.ts'].map(file =>
      [file, readFileSync(join(root, 'packages-ts/galerina-core-compiler/src', file), 'utf8').replaceAll('\r\n', '\n')]));
    const restore = () => { for (const [file, text] of Object.entries(sources)) writeFileSync(join(base, file), text); };
    const check = rows => assert.deepEqual(rows.map(row => row.sha256), Object.values(CURRENT_CODEX_ZONE));
    restore();
    const rows = runCodexZoneHashes(temp, agents);
    check(rows);
    for (let index = 0; index < 3; index++) {
      const file = index === 1 ? 'wat-emitter-binary.ts' : 'wat-emitter.ts';
      const lines = sources[file].split('\n');
      lines[rows[index].startLine] += ' '; // interior line: keep both canonical anchors intact
      writeFileSync(join(base, file), lines.join('\n'));
      const changed = runCodexZoneHashes(temp, agents);
      assert.throws(() => check(changed), assert.AssertionError);
      for (let other = 0; other < 3; other++) assert.equal(changed[other].sha256 === rows[other].sha256, other !== index);
      restore();
      check(runCodexZoneHashes(temp, agents));
    }
  } finally {
    assert.equal(dirname(realpathSync(temp)), realpathSync(tmpdir()));
    assert.ok(temp.startsWith(join(tmpdir(), 'codex-zone-freeze-')));
    rmSync(temp, { recursive: true });
  }
});

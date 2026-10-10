// Requires the real sibling AGENTS owner (or explicit AGENTS_ROOT), just like
// the Q4/Q5 callers. Fixtures never receive the real checkout's Git authority.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { resolveZoneAgentsRoot, runCodexZoneHashes } from '../lib/codex-zone-hash-runner.mjs';

test('checked owner snapshot executes even if the file changes before spawn', t => {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
  const owner = resolveZoneAgentsRoot(root);
  const captured = readFileSync(join(owner, 'tools/grok-probe/q8-codex-zone-hash.mjs'), 'utf8');
  const base = mkdtempSync(join(tmpdir(), 'zone-snapshot-'));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const fakeOwner = join(base, 'AGENTS');
  const fakeRoot = join(base, 'fixture');
  const helper = join(fakeOwner, 'tools/grok-probe/q8-codex-zone-hash.mjs');
  mkdirSync(dirname(helper), { recursive: true });
  writeFileSync(helper, captured);
  const src = join(fakeRoot, 'packages-ts/galerina-core-compiler/src');
  mkdirSync(src, { recursive: true });
  // Only anchor data for the canonical helper; this is not an emitter fixture.
  writeFileSync(join(src, 'wat-emitter.ts'), [
    'function planHasNested(', ' const temps = nested',
    ' if ((name === "toString" || name === "toStr") && realReceiver !== undefined)',
    ' if ((name === "contains" || name === "includes")',
  ].join('\n'));
  writeFileSync(join(src, 'wat-emitter-binary.ts'),
    ' * Stdlib method name → host import id\nexport const STDLIB_HOST_MAP\n');
  const originalSpawn = childProcess.spawnSync;
  const replacement = 'throw new Error("replacement file executed");\n';
  let calls = 0;
  const mocked = t.mock.method(childProcess, 'spawnSync', (executable, args, options) => {
    calls++;
    assert.equal(executable, process.execPath);
    assert.deepEqual(args.slice(0, 2), ['--input-type=module', '-']);
    assert.equal(options.input, captured.replaceAll('\r\n', '\n'));
    assert.equal(options.timeout, 10000);
    assert.equal(options.maxBuffer, 65536);
    assert.ok(Object.keys(options.env).every(key => !key.toUpperCase().startsWith('GIT_') &&
      !['NODE_OPTIONS', 'NODE_PATH'].includes(key.toUpperCase())));
    writeFileSync(helper, replacement);
    return originalSpawn(executable, args, options);
  });
  syncBuiltinESMExports();
  t.after(() => { mocked.mock.restore(); syncBuiltinESMExports(); });
  const rows = runCodexZoneHashes(fakeRoot, fakeOwner);
  assert.equal(calls, 1);
  assert.equal(rows.length, 3);
  assert.ok(rows.every(row => row.ok));
  assert.equal(readFileSync(helper, 'utf8'), replacement);
  const pathControl = originalSpawn(process.execPath, [helper, fakeRoot], {
    encoding: 'utf8', timeout: 10000, maxBuffer: 65536, windowsHide: true,
    env: Object.fromEntries(Object.entries(process.env).filter(([key]) =>
      !key.toUpperCase().startsWith('GIT_') && !['NODE_OPTIONS', 'NODE_PATH'].includes(key.toUpperCase()))),
  });
  assert.equal(pathControl.status, 1);
  assert.match(pathControl.stderr, /replacement file executed/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cpSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

const ROOT = new URL('../..', import.meta.url).pathname.replace(/^\//, '').replaceAll('/', '\\');
const MANIFEST_SCRIPT = join(ROOT, 'scripts', 'docs-index-manifest.mjs');
const DOCS_INDEX_SCRIPT = join(ROOT, 'scripts', 'docs-index.mjs');

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'docs-index-manifest-'));
  mkdirSync(join(root, 'scripts'), { recursive: true });
  mkdirSync(join(root, 'docs', 'sub'), { recursive: true });
  writeFileSync(join(root, 'docs', 'alpha.md'), '# Alpha\n');
  writeFileSync(join(root, 'docs', 'sub', 'beta.md'), '# Beta\n');
  cpSync(DOCS_INDEX_SCRIPT, join(root, 'scripts', 'docs-index.mjs'));
  cpSync(MANIFEST_SCRIPT, join(root, 'scripts', 'docs-index-manifest.mjs'));
  return root;
}

function run(root, args) {
  return spawnSync(process.execPath, [join(root, 'scripts', 'docs-index-manifest.mjs'), ...args], {
    cwd: root,
    encoding: 'utf8',
    timeout: 30_000,
  });
}

test('creates a relative, content-bound manifest without writing indexes', () => {
  const root = fixture();
  const manifest = join(root, 'build', 'docs-index-manifest.json');
  const result = run(root, ['--create', '--root', root, '--out', manifest]);

  assert.equal(result.status, 0, result.stderr);
  assert.equal(existsSync(join(root, 'docs', 'INDEX.md')), false);
  const value = JSON.parse(readFileSync(manifest, 'utf8'));
  assert.equal(value.schema, 'galerina.docs-index-write-manifest.v1');
  assert.deepEqual(value.entries.map((entry) => entry.path), ['docs/INDEX.md', 'docs/sub/INDEX.md']);
  assert.ok(value.entries.every((entry) => Number.isSafeInteger(entry.byteLength) && /^[0-9a-f]{64}$/.test(entry.sha256)));
});

test('applies only the manifest paths and reaches exact docs-index state', () => {
  const root = fixture();
  const manifest = join(root, 'build', 'docs-index-manifest.json');
  assert.equal(run(root, ['--create', '--root', root, '--out', manifest]).status, 0);
  const result = run(root, ['--apply', '--root', root, '--manifest', manifest]);

  assert.equal(result.status, 0, result.stderr);
  assert.equal(spawnSync(process.execPath, [join(root, 'scripts', 'docs-index.mjs'), '--check'], {
    cwd: root,
    encoding: 'utf8',
  }).status, 0);
  assert.equal(existsSync(join(root, 'docs', 'INDEX.md')), true);
  assert.equal(existsSync(join(root, 'docs', 'sub', 'INDEX.md')), true);
});

test('refuses apply when source documentation changed after manifest creation', () => {
  const root = fixture();
  const manifest = join(root, 'build', 'docs-index-manifest.json');
  assert.equal(run(root, ['--create', '--root', root, '--out', manifest]).status, 0);
  writeFileSync(join(root, 'docs', 'alpha.md'), '# Changed Alpha\n');
  const result = run(root, ['--apply', '--root', root, '--manifest', manifest]);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /REFUSED|manifest/i);
  assert.equal(existsSync(join(root, 'docs', 'INDEX.md')), false);
});

test('refuses a manifest path outside docs before writing anything', () => {
  const root = fixture();
  const manifest = join(root, 'build', 'docs-index-manifest.json');
  assert.equal(run(root, ['--create', '--root', root, '--out', manifest]).status, 0);
  const value = JSON.parse(readFileSync(manifest, 'utf8'));
  value.entries.push({ path: 'README.md', byteLength: 0, sha256: '0'.repeat(64) });
  writeFileSync(manifest, JSON.stringify(value));
  const result = run(root, ['--apply', '--root', root, '--manifest', manifest]);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /REFUSED|docs|path/i);
  assert.equal(existsSync(join(root, 'docs', 'INDEX.md')), false);
});

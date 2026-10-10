import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { resolveZoneAgentsRoot, runCodexZoneHashes } from '../lib/codex-zone-hash-runner.mjs';

function fixture(t) {
  const base = mkdtempSync(join(tmpdir(), 'zone-route-'));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const primary = join(base, 'Galerina');
  const agents = join(base, 'AGENTS');
  mkdirSync(join(primary, '.git'), { recursive: true });
  mkdirSync(agents);
  return { base, primary, agents };
}

test('primary and linked checkout resolve the same sibling owner, not an ancestor guess', t => {
  const { base, primary, agents } = fixture(t);
  assert.equal(resolveZoneAgentsRoot(primary), agents);
  const linked = join(base, 'isolated', 'candidate');
  const gitdir = join(primary, '.git', 'worktrees', 'candidate');
  mkdirSync(linked, { recursive: true });
  mkdirSync(gitdir, { recursive: true });
  writeFileSync(join(linked, '.git'), `gitdir: ${gitdir}\n`);
  writeFileSync(join(gitdir, 'commondir'), '../..\n');
  assert.equal(resolveZoneAgentsRoot(linked), agents);
  writeFileSync(join(linked, '.git'), `gitdir: ${relative(linked, gitdir)}\n`);
  assert.equal(resolveZoneAgentsRoot(linked), agents, 'relative gitdir is based on checkout, not process cwd');
});

test('explicit owner is authoritative; malformed overrides never fall back', t => {
  const { primary, agents } = fixture(t);
  assert.equal(resolveZoneAgentsRoot(primary, agents), agents);
  for (const value of ['', ' ', '../AGENTS']) {
    assert.throws(() => resolveZoneAgentsRoot(primary, value), /absolute path/);
  }
});

test('missing or malformed git metadata refuses instead of searching ancestors', t => {
  const { base } = fixture(t);
  const linked = join(base, 'candidate');
  mkdirSync(linked);
  assert.throws(() => resolveZoneAgentsRoot(linked));
  writeFileSync(join(linked, '.git'), 'not a gitdir\n');
  assert.throws(() => resolveZoneAgentsRoot(linked), /invalid gitdir/);
});

test('an executable helper lookalike is rejected before execution', t => {
  const { primary, agents } = fixture(t);
  mkdirSync(join(agents, 'tools', 'grok-probe'), { recursive: true });
  writeFileSync(join(agents, 'tools', 'grok-probe', 'q8-codex-zone-hash.mjs'),
    'throw new Error("untrusted helper executed");\n');
  assert.throws(() => runCodexZoneHashes(primary, agents), /owner bytes changed/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, dirname, resolve, isAbsolute } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const TARGETS = ['docs/INDEX.md', 'docs/sub/INDEX.md'];
const sha = (b) => createHash('sha256').update(b).digest('hex');
function fifo(path) {
  assert.equal(fs.existsSync(path), false, 'FIFO precondition: absent leaf');
  const r = spawnSync('mkfifo', [path], { encoding: 'utf8', timeout: 30_000, maxBuffer: 5 * 1024 * 1024 });
  let st;
  try { st = fs.lstatSync(path); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const observation = JSON.stringify({ status: r.status, signal: r.signal, stderr: r.stderr, existsAfter: !!st, fifoAfter: st?.isFIFO(), regularAfter: st?.isFile() });
  assert.equal(r.status, 0, 'FIXTURE_PREREQUISITE_FIFO ' + observation);
  assert.equal(r.error, undefined, 'FIXTURE_PREREQUISITE_FIFO ' + String(r.error));
  assert.equal(r.signal, null, 'FIXTURE_PREREQUISITE_FIFO ' + observation);
  assert.equal(st?.isFIFO(), true, 'FIXTURE_PREREQUISITE_FIFO ' + observation);
}
function write(root, p, text) {
  const dest = join(root, p);
  fs.mkdirSync(dirname(dest), { recursive: true });
  fs.writeFileSync(dest, text);
}
function fixture(t) {
  const outer = fs.mkdtempSync(join(tmpdir(), 'docs plan é space-'));
  t.after(() => fs.rmSync(outer, { recursive: true, force: true }));
  const root = join(outer, 'repo');
  write(root, 'docs/alpha.md', '# Alpha\n');
  write(root, 'docs/sub/beta.md', '# Beta\n');
  write(root, 'sentinel.txt', 'inside sentinel\n');
  write(outer, 'external/keep.md', '# External sentinel\n');
  for (const name of ['docs-index.mjs', 'docs-index-manifest.mjs']) write(root, 'scripts/' + name, fs.readFileSync(join(ROOT, 'scripts', name)));
  return { root, outer, plan: join(root, 'build/docs-index-manifests/plan.json') };
}
function run(f, args, generator = false) {
  const env = { ...process.env };
  for (const name of Object.keys(env)) if (name.startsWith('GIT_')) delete env[name];
  delete env.NODE_OPTIONS; delete env.NODE_PATH;
  const result = spawnSync(process.execPath, [join(f.root, 'scripts', generator ? 'docs-index.mjs' : 'docs-index-manifest.mjs'), ...args], {
    cwd: f.root, env, encoding: 'utf8', timeout: 30_000, maxBuffer: 10 * 1024 * 1024,
  });
  assert.equal(result.error, undefined, String(result.error));
  assert.equal(result.signal, null);
  return result;
}
const args = (f, mode) => [mode, '--quiescent', '--root', f.root, mode === '--create' ? '--out' : '--manifest', f.plan];
function create(f) { const r = run(f, args(f, '--create')); assert.equal(r.status, 0, r.stderr); return JSON.parse(fs.readFileSync(f.plan)); }
function apply(f) { return run(f, args(f, '--apply')); }
function receipt(r) { return JSON.parse(r.stderr.trim().split('\n').at(-1)); }
function absent(f) { for (const p of TARGETS) assert.equal(fs.existsSync(join(f.root, p)), false, p); }
function unchanged(f) {
  assert.equal(fs.readFileSync(join(f.root, 'sentinel.txt'), 'utf8'), 'inside sentinel\n');
  assert.equal(fs.readFileSync(join(f.outer, 'external/keep.md'), 'utf8'), '# External sentinel\n');
  assert.equal(fs.readFileSync(join(f.root, 'docs/alpha.md'), 'utf8'), '# Alpha\n');
  assert.equal(fs.readFileSync(join(f.root, 'docs/sub/beta.md'), 'utf8'), '# Beta\n');
}
function refused(f, pattern) {
  const r = apply(f);
  assert.equal(r.status, 1, r.stdout);
  const value = receipt(r);
  assert.match(value.error, pattern);
  assert.deepEqual(value.completed, []);
  return value;
}
async function api(f) { return import(pathToFileURL(join(f.root, 'scripts/docs-index-manifest.mjs')).href); }
function failure(fn, pattern) {
  let caught;
  try { fn(); } catch (error) { caught = error; }
  assert(caught, 'expected production refusal');
  assert.match(caught.message, pattern);
  return caught.receipt;
}
function tree(root) {
  const rows = [];
  const walk = (dir, prefix) => {
    for (const name of fs.readdirSync(dir).sort()) {
      const path = join(dir, name), rel = prefix + name, st = fs.lstatSync(path);
      if (st.isSymbolicLink()) rows.push([rel, 'LINK', fs.readlinkSync(path)]);
      else if (st.isDirectory()) { rows.push([rel, 'DIR']); walk(path, rel + '/'); }
      else if (st.isFile()) rows.push([rel, 'FILE', sha(fs.readFileSync(path))]);
      else rows.push([rel, 'SPECIAL']);
    }
  };
  walk(root, '');
  return rows;
}

// All four historical cases are retained; v2 adds namespace, preimages and custody.
test('creates a relative, content-bound manifest without writing indexes', (t) => {
  const f = fixture(t), before = tree(join(f.root, 'docs')), value = create(f);
  absent(f); unchanged(f);
  assert.equal(value.schema, 'galerina.docs-index-output-plan.v2');
  assert.equal(value.authorizing, false);
  assert.deepEqual(value.entries.map((e) => e.path), TARGETS);
  assert(value.entries.every((e) => Number.isSafeInteger(e.byteLength) && /^[0-9a-f]{64}$/.test(e.sha256)));
  assert(value.entries.every((e) => e.preimage.state === 'ABSENT'));
  assert.equal(value.generator.sha256, sha(fs.readFileSync(join(f.root, 'scripts/docs-index.mjs'))));
  assert.deepEqual(tree(join(f.root, 'docs')), before);
});
test('applies only the manifest paths and reaches exact docs-index state', (t) => {
  const f = fixture(t), plan = create(f);
  const r = apply(f);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(run(f, ['--check'], true).status, 0);
  for (const entry of plan.entries) {
    const bytes = fs.readFileSync(join(f.root, entry.path));
    assert.equal(bytes.length, entry.byteLength); assert.equal(sha(bytes), entry.sha256);
  }
  assert.equal(fs.existsSync(join(f.root, 'docs/INDEX.md')), true);
  assert.equal(fs.existsSync(join(f.root, 'docs/sub/INDEX.md')), true);
  const result = JSON.parse(r.stdout.trim().split('\n').at(-1));
  assert.equal(result.phase, 'COMPLETE'); assert.deepEqual(result.completed, TARGETS);
  assert.deepEqual(result.remaining, []); unchanged(f);
  const docsPaths = tree(join(f.root, 'docs')).map((row) => row[0]);
  assert.deepEqual(docsPaths, ['INDEX.md', 'alpha.md', 'sub', 'sub/INDEX.md', 'sub/beta.md']);
});
test('refuses apply when source documentation changed after manifest creation', (t) => {
  const f = fixture(t); create(f);
  write(f.root, 'docs/alpha.md', '# Changed Alpha\n');
  refused(f, /OUTPUT_PLAN_DRIFT/); absent(f);
});
test('refuses a manifest path outside docs before writing anything', (t) => {
  const f = fixture(t), value = create(f);
  value.entries.push({ path: 'README.md', byteLength: 0, sha256: '0'.repeat(64), preimage: { state: 'ABSENT' } });
  fs.writeFileSync(f.plan, JSON.stringify(value));
  refused(f, /ENTRY_PATH/); absent(f); unchanged(f);
});
test('output-only contract permits body-only changes, refuses a new source directory', (t) => {
  const f = fixture(t); create(f);
  write(f.root, 'docs/alpha.md', '# Alpha\n\nDifferent body bytes.\n');
  assert.equal(apply(f).status, 0);
  const f2 = fixture(t); create(f2); write(f2.root, 'docs/new/gamma.md', '# Gamma\n');
  refused(f2, /OUTPUT_PLAN_DRIFT/); absent(f2);
});
test('generator import is passive; CLI output parity and KAT gate are shared', async (t) => {
  const f = fixture(t); await import(pathToFileURL(join(f.root, 'scripts/docs-index.mjs')).href); absent(f);
  assert.equal(run(f, ['--selftest'], true).status, 0);
  assert.equal(run(f, ['--dry-run'], true).status, 0); absent(f);
  assert.equal(run(f, ['--unknown'], true).status, 2); absent(f);
  create(f); assert.equal(apply(f).status, 0);
  const wrapped = TARGETS.map((p) => fs.readFileSync(join(f.root, p)));
  assert.equal(run(f, ['--apply'], true).status, 0);
  assert.deepEqual(TARGETS.map((p) => fs.readFileSync(join(f.root, p))), wrapped);
  const f2 = fixture(t);
  const p = join(f2.root, 'scripts/docs-index.mjs'), original = fs.readFileSync(p, 'utf8');
  const mutant = original.replace("describe('# Governance architecture\\n\\ntext', 'fb'), 'Governance architecture'", "describe('# Governance architecture\\n\\ntext', 'fb'), 'wrong KAT'");
  assert.notEqual(mutant, original);
  fs.writeFileSync(p, mutant);
  const bad = run(f2, args(f2, '--create'));
  assert.equal(bad.status, 1); assert.match(receipt(bad).error, /GENERATOR_KAT/); absent(f2);
  assert.equal(fs.existsSync(f2.plan), false);
});
test('closed schema, identities, ordering, bounds and generator drift refuse without writes', async (t) => {
  const cases = [
    ['schema', (v) => { v.schema = 'v1'; }, /SCHEMA/],
    ['extra', (v) => { v.approved = true; }, /SCHEMA/],
    ['hash', (v) => { v.entries[0].sha256 = '0'.repeat(64); }, /OUTPUT_PLAN_DRIFT/],
    ['length', (v) => { v.entries[0].byteLength++; }, /OUTPUT_PLAN_DRIFT/],
    ['order', (v) => { v.entries.reverse(); }, /ENTRY_PATH/],
    ['duplicate', (v) => { v.entries.push(v.entries[0]); }, /ENTRY_PATH/],
    ['traversal', (v) => { v.entries[0].path = 'docs/../INDEX.md'; }, /ENTRY_PATH/],
    ['empty', (v) => { v.entries = []; }, /ENTRY_LIMIT/],
    ['nonfinite', (v) => { v.entries[0].byteLength = null; }, /IDENTITY/],
    ['count', (v) => { v.entries = Array(1025).fill(v.entries[0]); }, /ENTRY_LIMIT/],
    ['per-file', (v) => { v.entries[0].byteLength = 4 * 1024 * 1024 + 1; }, /IDENTITY/],
    ['total', (v) => { v.entries = Array.from({ length: 5 }, (_, i) => ({ ...v.entries[0], path: 'docs/a' + i + '/INDEX.md', byteLength: 4 * 1024 * 1024 })); }, /OUTPUT_LIMIT/],
  ];
  for (const [name, mutate, pattern] of cases) await t.test(name, () => {
    const f = fixture(t), value = create(f); mutate(value); fs.writeFileSync(f.plan, JSON.stringify(value));
    refused(f, pattern); absent(f); unchanged(f);
  });
  const f = fixture(t); create(f);
  fs.appendFileSync(join(f.root, 'scripts/docs-index.mjs'), '\n// changed generator\n');
  refused(f, /GENERATOR_DRIFT/); absent(f);
  const f2 = fixture(t); create(f2); fs.writeFileSync(f2.plan, ' '.repeat(1024 * 1024 + 1));
  refused(f2, /BYTE_LIMIT/); absent(f2);
});
test('manifest namespace, existing leaf and explicit custody declaration are enforced', (t) => {
  const f = fixture(t);
  for (const p of ['.git/x.json', 'scripts/x.json', 'docs/x.json', 'DOCS/x.json', 'build/x.json']) {
    const r = run(f, ['--create', '--quiescent', '--root', f.root, '--out', join(f.root, p)]);
    assert.equal(r.status, 1); assert.match(receipt(r).error, /MANIFEST_NAMESPACE/);
    assert.equal(fs.existsSync(join(f.root, p)), false);
  }
  const noCustody = run(f, ['--create', '--root', f.root, '--out', f.plan]);
  assert.equal(noCustody.status, 1); assert.match(receipt(noCustody).error, /QUIESCENT_REQUIRED/);
  create(f); const before = fs.readFileSync(f.plan);
  const again = run(f, args(f, '--create'));
  assert.equal(again.status, 1); assert.match(receipt(again).error, /EXISTS/);
  assert.deepEqual(fs.readFileSync(f.plan), before); absent(f);
});
test('dangling and existing output links, directories, FIFOs and hardlinks never publish', async (t) => {
  for (const kind of ['dangling', 'symlink', 'directory', 'fifo', 'hardlink']) await t.test(kind, () => {
    const f = fixture(t); create(f);
    const target = join(f.root, 'docs/sub/INDEX.md'), external = join(f.outer, 'external/keep.md'), missing = join(f.outer, 'external/new.md');
    if (kind === 'dangling') fs.symlinkSync(missing, target);
    if (kind === 'symlink') fs.symlinkSync(external, target);
    if (kind === 'directory') fs.mkdirSync(target);
    if (kind === 'hardlink') fs.linkSync(external, target);
    if (kind === 'fifo') {
      const positive = fixture(t); create(positive);
      assert.equal(apply(positive).status, 0); unchanged(positive);
      fifo(target);
    }
    const before = tree(f.outer), started = performance.now();
    refused(f, /PATH_LINK|PATH_FILE/);
    assert(performance.now() - started < 30_000, 'leaf refusal must finish within subprocess bound');
    assert.deepEqual(tree(f.outer), before);
    if (kind === 'fifo') assert.equal(fs.lstatSync(target).isFIFO(), true);
    assert.equal(fs.existsSync(missing), false);
    assert.equal(fs.existsSync(join(f.root, 'docs/INDEX.md')), false);
  });
});
test('linked roots, ancestors, inputs and manifest leaves refuse without sentinel changes', async (t) => {
  for (const kind of ['docs', 'build', 'manifest-parent', 'input', 'input-hardlink', 'manifest-link', 'manifest-hardlink', 'manifest-dangling', 'manifest-directory']) await t.test(kind, () => {
    const f = fixture(t);
    if (kind.startsWith('manifest-') && kind !== 'manifest-parent') create(f);
    if (kind === 'docs') {
      fs.renameSync(join(f.root, 'docs'), join(f.outer, 'external/docs'));
      fs.symlinkSync(join(f.outer, 'external/docs'), join(f.root, 'docs'), 'dir');
    }
    if (kind === 'build') fs.symlinkSync(join(f.outer, 'external'), join(f.root, 'build'), 'dir');
    if (kind === 'manifest-parent') { fs.mkdirSync(join(f.root, 'build')); fs.symlinkSync(join(f.outer, 'external'), dirname(f.plan), 'dir'); }
    if (kind === 'input') { fs.unlinkSync(join(f.root, 'docs/alpha.md')); fs.symlinkSync(join(f.outer, 'external/keep.md'), join(f.root, 'docs/alpha.md')); }
    if (kind === 'input-hardlink') { fs.unlinkSync(join(f.root, 'docs/alpha.md')); fs.linkSync(join(f.outer, 'external/keep.md'), join(f.root, 'docs/alpha.md')); }
    if (kind === 'manifest-link') { fs.renameSync(f.plan, join(f.outer, 'external/plan.json')); fs.symlinkSync(join(f.outer, 'external/plan.json'), f.plan); }
    if (kind === 'manifest-hardlink') fs.linkSync(f.plan, join(f.outer, 'external/twin.json'));
    if (kind === 'manifest-dangling') { fs.unlinkSync(f.plan); fs.symlinkSync(join(f.outer, 'external/missing.json'), f.plan); }
    if (kind === 'manifest-directory') { fs.unlinkSync(f.plan); fs.mkdirSync(f.plan); }
    const before = tree(f.outer), mode = kind.startsWith('manifest-') && kind !== 'manifest-parent' ? '--apply' : '--create';
    const r = run(f, args(f, mode));
    assert.equal(r.status, 1); assert.match(receipt(r).error, /PATH_LINK|ROOT_ALIAS|PATH_FILE/);
    assert.deepEqual(tree(f.outer), before);
  });
});
test('existing preimages are bound, retained, and not discarded on drift', (t) => {
  const f = fixture(t);
  for (const p of TARGETS) write(f.root, p, 'owned preimage ' + p);
  const plan = create(f);
  assert(plan.entries.every((e) => e.preimage.state === 'FILE'));
  const r = apply(f); assert.equal(r.status, 0, r.stderr);
  const value = JSON.parse(r.stdout.trim().split('\n').at(-1));
  for (let i = 0; i < TARGETS.length; i++) assert.equal(fs.readFileSync(join(f.root, value.recovery, String(i).padStart(4, '0') + '.before'), 'utf8'), 'owned preimage ' + TARGETS[i]);
  const f2 = fixture(t); create(f2); write(f2.root, TARGETS[1], 'owner edit');
  refused(f2, /PREIMAGE_DRIFT/);
  assert.equal(fs.readFileSync(join(f2.root, TARGETS[1]), 'utf8'), 'owner edit');
  assert.equal(fs.existsSync(join(f2.root, TARGETS[0])), false);
});
test('strict read failures cannot become fallback success', async (t) => {
  const f = fixture(t), mod = await api(f);
  const before = tree(f.outer);
  const io = { ...fs, openSync(p, ...rest) { if (p === join(f.root, 'docs/alpha.md')) throw new Error('EIO_CONTROL'); return fs.openSync(p, ...rest); } };
  failure(() => mod.execute(args(f, '--create'), io), /EIO_CONTROL/);
  assert.deepEqual(tree(f.outer), before);
});
test('nonregular FIFO input refuses without reading', (t) => {
  const positive = fixture(t); create(positive);
  assert.equal(apply(positive).status, 0); unchanged(positive);
  const f = fixture(t);
  fs.unlinkSync(join(f.root, 'docs/alpha.md'));
  fifo(join(f.root, 'docs/alpha.md'));
  const before = tree(f.outer), started = performance.now();
  const bad = run(f, args(f, '--create'));
  assert.equal(bad.status, 1); assert.match(receipt(bad).error, /PATH_FILE/);
  assert(performance.now() - started < 30_000, 'FIFO refusal must finish within subprocess bound');
  assert.deepEqual(receipt(bad).completed, []);
  assert.deepEqual(tree(f.outer), before);
  assert.equal(fs.lstatSync(join(f.root, 'docs/alpha.md')).isFIFO(), true);
  assert.equal(fs.existsSync(f.plan), false); absent(f);
});
test('preparation failure publishes nothing; second rename failure has exact recoverable progress', async (t) => {
  for (const stage of ['prepare', 'publish']) await t.test(stage, async () => {
    const f = fixture(t);
    for (const p of TARGETS) write(f.root, p, 'old ' + p);
    create(f);
    const mod = await api(f); let count = 0;
    const io = stage === 'prepare' ? { ...fs, openSync(p, ...rest) {
      if (String(p).endsWith('.tmp') && (rest[0] & fs.constants.O_WRONLY) && ++count === 2) throw new Error('PREPARATION_CONTROL');
      return fs.openSync(p, ...rest);
    } } : { ...fs, renameSync(a, b) {
      if (++count === 2) throw new Error('PUBLICATION_CONTROL');
      return fs.renameSync(a, b);
    } };
    const r = failure(() => mod.execute(args(f, '--apply'), io), /PREPARATION_CONTROL|PUBLICATION_CONTROL/);
    assert.equal(r.phase, stage === 'prepare' ? 'PREPARING' : 'PUBLISHING');
    assert.deepEqual(r.completed, stage === 'prepare' ? [] : [TARGETS[0]]);
    assert.deepEqual(r.remaining, stage === 'prepare' ? TARGETS : [TARGETS[1]]);
    assert.equal(r.outcome, stage === 'prepare' ? 'REFUSED' : 'PARTIAL');
    assert.equal(fs.readFileSync(join(f.root, TARGETS[1]), 'utf8'), 'old ' + TARGETS[1]);
    if (stage === 'prepare') assert.equal(fs.readFileSync(join(f.root, TARGETS[0]), 'utf8'), 'old ' + TARGETS[0]);
    else assert.match(fs.readFileSync(join(f.root, TARGETS[0]), 'utf8'), /Generated by/);
    for (let i = 0; i < 2; i++) assert.equal(fs.readFileSync(join(f.root, r.recovery, String(i).padStart(4, '0') + '.before'), 'utf8'), 'old ' + TARGETS[i]);
    const receipts = fs.readdirSync(join(f.root, r.recovery)).filter((p) => p.startsWith('receipt-')).sort();
    const persisted = JSON.parse(fs.readFileSync(join(f.root, r.recovery, receipts.at(-1))));
    assert.deepEqual(persisted.completed, r.completed); assert.equal(persisted.error, r.error);
    unchanged(f);
  });
});
test('source drift during preparation and after publication is reported truthfully', async (t) => {
  for (const stage of ['prepare', 'published']) await t.test(stage, async () => {
    const f = fixture(t); create(f); const mod = await api(f); let fired = false;
    const io = stage === 'prepare' ? { ...fs, openSync(p, ...rest) {
      if (String(p).endsWith('.tmp') && !fired) { fired = true; write(f.root, 'docs/alpha.md', '# Drifted\n'); }
      return fs.openSync(p, ...rest);
    } } : { ...fs, renameSync(a, b) {
      fs.renameSync(a, b);
      if (!fired) { fired = true; write(f.root, 'docs/alpha.md', '# Drifted\n'); }
    } };
    const r = failure(() => mod.execute(args(f, '--apply'), io), /SOURCE_DRIFT/);
    assert.equal(fired, true);
    assert.deepEqual(r.completed, stage === 'prepare' ? [] : TARGETS);
    assert.equal(r.phase, stage === 'prepare' ? 'PREPARING' : 'VERIFYING');
  });
});
test('empty corpus consistently refuses before writing a plan', (t) => {
  const f = fixture(t);
  fs.rmSync(join(f.root, 'docs'), { recursive: true }); fs.mkdirSync(join(f.root, 'docs'));
  const r = run(f, args(f, '--create'));
  assert.equal(r.status, 1); assert.match(receipt(r).error, /EMPTY_PLAN/); assert.equal(fs.existsSync(f.plan), false);
});

test('copied suite resolves its root under spaces and non-ASCII paths', (t) => {
  const f = fixture(t);
  fs.mkdirSync(join(f.root, 'scripts/tests'));
  fs.copyFileSync(fileURLToPath(import.meta.url), join(f.root, 'scripts/tests/docs-index-manifest.test.mjs'));
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT; delete env.NODE_CHANNEL_FD;
  const r = spawnSync(process.execPath, ['--test', '--test-reporter=tap', '--test-name-pattern=^creates a relative, content-bound manifest without writing indexes$', 'scripts/tests/docs-index-manifest.test.mjs'], {
    cwd: f.root, env, encoding: 'utf8', timeout: 30_000, maxBuffer: 5 * 1024 * 1024,
  });
  assert.equal(r.error, undefined); assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /pass 1|# pass 1/);
});
test('apply invokes generator KAT even when a changed generator is re-bound in the plan', (t) => {
  const f = fixture(t), value = create(f), p = join(f.root, 'scripts/docs-index.mjs');
  const original = fs.readFileSync(p, 'utf8');
  const mutant = original.replace("describe('# Governance architecture\\n\\ntext', 'fb'), 'Governance architecture'", "describe('# Governance architecture\\n\\ntext', 'fb'), 'wrong KAT'");
  assert.notEqual(mutant, original); fs.writeFileSync(p, mutant);
  value.generator = { path: 'scripts/docs-index.mjs', byteLength: Buffer.byteLength(mutant), sha256: sha(Buffer.from(mutant)) };
  fs.writeFileSync(f.plan, JSON.stringify(value));
  refused(f, /GENERATOR_KAT/); absent(f);
});
test('deterministic late parent replacement refuses before following the external parent', async (t) => {
  const f = fixture(t); create(f); const mod = await api(f);
  const before = tree(join(f.outer, 'external')); let moved = false;
  const io = { ...fs, renameSync(a, b) {
    fs.renameSync(a, b);
    if (!moved) {
      moved = true;
      fs.renameSync(join(f.root, 'docs/sub'), join(f.root, 'retained-sub'));
      fs.symlinkSync(join(f.outer, 'external'), join(f.root, 'docs/sub'), 'dir');
    }
  } };
  const r = failure(() => mod.execute(args(f, '--apply'), io), /PATH_LINK/);
  assert.equal(moved, true); assert.equal(r.phase, 'PUBLISHING');
  assert.deepEqual(r.completed, [TARGETS[0]]); assert.deepEqual(r.remaining, [TARGETS[1]]);
  assert.deepEqual(tree(join(f.outer, 'external')), before);
});
test('stage verification and post-rename readback failures retain truthful progress', async (t) => {
  for (const mode of ['stage-corrupt', 'readback']) await t.test(mode, async () => {
    const f = fixture(t); create(f); const mod = await api(f); const stages = new Set(); let renamed = false, fired = false;
    const io = { ...fs,
      openSync(p, flags, ...rest) {
        if (mode === 'readback' && renamed && p === join(f.root, TARGETS[0])) { fired = true; throw Error('READBACK_CONTROL'); }
        const fd = fs.openSync(p, flags, ...rest);
        if (String(p).endsWith('.tmp') && (flags & fs.constants.O_WRONLY)) stages.add(fd);
        return fd;
      },
      closeSync(fd) { stages.delete(fd); return fs.closeSync(fd); },
      writeSync(fd, bytes, ...rest) {
        if (mode === 'stage-corrupt' && stages.has(fd)) {
          fired = true; const bad = Buffer.from(bytes); bad[0] ^= 1;
          return fs.writeSync(fd, bad, ...rest);
        }
        return fs.writeSync(fd, bytes, ...rest);
      },
      renameSync(a, b) { fs.renameSync(a, b); renamed = true; },
    };
    const r = failure(() => mod.execute(args(f, '--apply'), io), /STAGED_IDENTITY|READBACK_CONTROL/);
    assert(fired);
    assert.deepEqual(r.completed, mode === 'stage-corrupt' ? [] : [TARGETS[0]]);
    assert.equal(r.phase, mode === 'stage-corrupt' ? 'PREPARING' : 'PUBLISHING');
    if (mode === 'stage-corrupt') absent(f);
    else assert.match(fs.readFileSync(join(f.root, TARGETS[0]), 'utf8'), /Generated by/);
    unchanged(f);
  });
});

// Break caught: admitting a plan whose FILE preimage bytes have changed.
test('FILE-to-different-FILE drift refuses before publication; matching FILE preimages succeed', (t) => {
  const f = fixture(t);
  for (const p of TARGETS) write(f.root, p, 'old same-length bytes');
  const plan = create(f);
  assert(plan.entries.every((e) => e.preimage.state === 'FILE'));
  write(f.root, TARGETS[1], 'new same-length bytes');
  assert.equal(Buffer.byteLength('old same-length bytes'), Buffer.byteLength('new same-length bytes'));
  const before = tree(f.outer);
  const r = refused(f, /PREIMAGE_DRIFT/);
  assert.equal(r.planSha256, sha(fs.readFileSync(f.plan)), 'valid plan reached admission');
  assert.equal(r.phase, 'VALIDATING'); assert.equal(r.recovery, null);
  assert.deepEqual(tree(f.outer), before); unchanged(f);
  const positive = fixture(t);
  for (const p of TARGETS) write(positive.root, p, 'old same-length bytes');
  create(positive);
  assert.equal(apply(positive).status, 0); unchanged(positive);
});

// Break caught: replaying an ABSENT-preimage plan after its successful publication.
test('replay after success refuses stale preimages without changing published bytes', (t) => {
  const f = fixture(t), plan = create(f);
  assert(plan.entries.every((e) => e.preimage.state === 'ABSENT'));
  assert.equal(apply(f).status, 0);
  const before = tree(f.outer), r = refused(f, /PREIMAGE_DRIFT/);
  assert.equal(r.planSha256, sha(fs.readFileSync(f.plan)));
  assert.equal(r.phase, 'VALIDATING'); assert.equal(r.recovery, null);
  assert.deepEqual(tree(f.outer), before); unchanged(f);
  assert.equal(run(f, ['--check'], true).status, 0);
});

// Break caught: ignoring --root, or mistaking a missing script for admission refusal.
test('wrong root and old bad ROOT refuse; matching root admits the same valid plan', (t) => {
  const f = fixture(t), other = fixture(t); create(f);
  const historicalRoot = new URL('../..', pathToFileURL(join(f.root, 'scripts/tests/probe.mjs'))).pathname.replace(/^\//, '').replaceAll('/', '\\');
  assert.notEqual(resolve(historicalRoot), resolve(f.root));
  for (const root of [other.root, historicalRoot]) {
    const before = tree(f.outer), otherBefore = tree(other.outer);
    const argv = args(f, '--apply'); argv[argv.indexOf('--root') + 1] = root;
    const bad = run(f, argv), value = receipt(bad);
    assert.equal(bad.status, 1);
    assert.equal(value.error, isAbsolute(root) ? 'REFUSED ROOT' : 'REFUSED USAGE');
    assert.equal(value.phase, 'VALIDATING'); assert.deepEqual(value.completed, []);
    assert.deepEqual(tree(f.outer), before); assert.deepEqual(tree(other.outer), otherBefore);
  }
  const missing = { ...f, root: join(f.outer, 'missing-script-root') };
  // Keep an existing cwd: the missing entry point must not become a spawn setup error.
  fs.mkdirSync(missing.root);
  const missingRun = run(missing, args(f, '--apply'));
  assert.equal(missingRun.status, 1);
  assert.match(missingRun.stderr, /MODULE_NOT_FOUND/);
  assert.throws(() => receipt(missingRun), SyntaxError, 'missing module is not a wrapper refusal receipt');
  absent(f);
  assert.equal(apply(f).status, 0); unchanged(f);
});

// Break caught: reintroducing the historical URL.pathname/backslash fixture root.
test('copied suite old ROOT mutation fails in setup, not as a wrapper refusal', (t) => {
  const f = fixture(t);
  const source = fs.readFileSync(fileURLToPath(import.meta.url), 'utf8');
  const oldRoot = "const ROOT = new URL('../..', import.meta.url).pathname.replace(/^\\//, '').replaceAll('/', '\\\\');";
  const mutant = source.replace("const ROOT = fileURLToPath(new URL('../../', import.meta.url));", oldRoot);
  assert.notEqual(mutant, source);
  write(f.root, 'scripts/tests/docs-index-manifest.test.mjs', mutant);
  const env = { ...process.env }; delete env.NODE_TEST_CONTEXT; delete env.NODE_CHANNEL_FD;
  for (const name of Object.keys(env)) if (name.startsWith('GIT_')) delete env[name];
  delete env.NODE_OPTIONS; delete env.NODE_PATH;
  const before = tree(f.root);
  const r = spawnSync(process.execPath, ['--test', '--test-reporter=tap', '--test-name-pattern=^creates a relative, content-bound manifest without writing indexes$', 'scripts/tests/docs-index-manifest.test.mjs'], {
    cwd: f.root, env, encoding: 'utf8', timeout: 30_000, maxBuffer: 5 * 1024 * 1024,
  });
  assert.equal(r.error, undefined); assert.equal(r.signal, null); assert.equal(r.status, 1);
  assert.match(r.stdout, /ENOENT/); assert.match(r.stdout, /# fail 1/);
  assert.doesNotMatch(r.stdout + r.stderr, /REFUSED (ROOT|USAGE|PREIMAGE_DRIFT)/);
  assert.deepEqual(tree(f.root), before);
});

// Break caught: swallowing an unreadable subtree and admitting a partial corpus.
test('enumeration fault refuses without fallback or writes; ordinary enumeration succeeds', async (t) => {
  const positive = fixture(t); create(positive); assert.equal(apply(positive).status, 0);
  const f = fixture(t), mod = await api(f), before = tree(f.outer); let calls = 0;
  const io = { ...fs, readdirSync(p, ...rest) {
    if (p === join(f.root, 'docs/sub')) { calls++; throw new Error('ENUMERATION_CONTROL'); }
    return fs.readdirSync(p, ...rest);
  } };
  const r = failure(() => mod.execute(args(f, '--create'), io), /ENUMERATION_CONTROL/);
  assert.equal(calls, 1); assert.equal(r.phase, 'VALIDATING'); assert.deepEqual(r.completed, []);
  assert.deepEqual(tree(f.outer), before); absent(f); assert.equal(fs.existsSync(f.plan), false);
});

// Explicit junction request is exercised on Windows; POSIX maps it to a directory symlink.
test('junction docs root refuses without changing the external directory', (t) => {
  const positive = fixture(t); create(positive); assert.equal(apply(positive).status, 0);
  const f = fixture(t);
  fs.renameSync(join(f.root, 'docs'), join(f.outer, 'external/docs'));
  fs.symlinkSync(join(f.outer, 'external/docs'), join(f.root, 'docs'), 'junction');
  assert.equal(fs.lstatSync(join(f.root, 'docs')).isSymbolicLink(), true, 'link fixture must exist');
  const before = tree(f.outer), r = run(f, args(f, '--create'));
  assert.equal(r.status, 1); assert.match(receipt(r).error, /PATH_LINK|ROOT_ALIAS/);
  assert.deepEqual(receipt(r).completed, []); assert.deepEqual(tree(f.outer), before);
});

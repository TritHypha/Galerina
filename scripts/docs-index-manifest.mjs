#!/usr/bin/env node
/**
 * Exact OUTPUT plan, not approval or complete documentation-byte binding.
 * --quiescent affirms an owner-controlled, single-writer window. No hostile
 * namespace concurrency, multi-file atomicity or crash durability is claimed.
 * Direct docs-index --apply remains an independent legacy operator command.
 */
import * as fs from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT, DOCS, allDirs, willIndex, buildIndex, main as generatorMain, checkedPath, readRegular, toPosix } from './docs-index.mjs';

export const LIMITS = Object.freeze({ manifestBytes: 1024 * 1024, entries: 1024, outputBytes: 16 * 1024 * 1024, fileBytes: 4 * 1024 * 1024 });
const SCHEMA = 'galerina.docs-index-output-plan.v2';
const CONTRACT = 'OUTPUT_ONLY_QUIESCENT_OWNER_CONTROL';
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const fail = (code) => { throw new Error('REFUSED ' + code); };
const identity = (bytes) => ({ byteLength: bytes.length, sha256: hash(bytes) });
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const keys = (value, expected) => {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !equal(Object.keys(value).sort(), [...expected].sort())) fail('SCHEMA');
};
function boundedIdentity(value) {
  keys(value, ['byteLength', 'sha256']);
  if (!Number.isSafeInteger(value.byteLength) || value.byteLength < 0 || value.byteLength > LIMITS.fileBytes || !/^[a-f0-9]{64}$/.test(value.sha256)) fail('IDENTITY');
}
function parse(argv) {
  const mode = argv[0];
  if (!['--create', '--apply'].includes(mode)) fail('USAGE');
  const flags = new Map();
  for (let i = 1; i < argv.length; i++) {
    const key = argv[i];
    if (flags.has(key) || !['--quiescent', '--root', '--out', '--manifest'].includes(key)) fail('USAGE');
    if (key === '--quiescent') flags.set(key, true);
    else {
      const value = argv[++i];
      if (!value || value.startsWith('--')) fail('USAGE');
      flags.set(key, value);
    }
  }
  const root = flags.get('--root');
  const output = flags.get(mode === '--create' ? '--out' : '--manifest');
  if (!flags.get('--quiescent')) fail('QUIESCENT_REQUIRED');
  if (!root || !output || !isAbsolute(root) || !isAbsolute(output) || flags.has(mode === '--create' ? '--manifest' : '--out')) fail('USAGE');
  if (resolve(root) !== ROOT) fail('ROOT');
  const rel = toPosix(relative(ROOT, resolve(output)));
  if (!/^build\/docs-index-manifests\/[A-Za-z0-9][A-Za-z0-9_-]*\.json$/.test(rel)) fail('MANIFEST_NAMESPACE');
  return { mode, output: resolve(output) };
}
function directories(io, path) {
  // Only the fixed build namespace and our newly allocated recovery directory.
  const rel = toPosix(relative(ROOT, path));
  if (!/^build(?:\/docs-index-manifests(?:\/recovery-[a-f0-9-]+)?)?$/.test(rel)) fail('DIRECTORY_SCOPE');
  let at = ROOT;
  for (const part of rel.split('/')) {
    at = join(at, part);
    const st = checkedPath(at, 'dir', io, true);
    if (!st) io.mkdirSync(at);
    checkedPath(at, 'dir', io);
  }
}
function exclusive(path, bytes, io) {
  checkedPath(dirname(path), 'dir', io);
  if (checkedPath(path, 'file', io, true)) fail('EXISTS');
  const fd = io.openSync(path, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | (fs.constants.O_NOFOLLOW ?? 0), 0o600);
  try {
    let offset = 0;
    while (offset < bytes.length) {
      const n = io.writeSync(fd, bytes, offset, bytes.length - offset);
      if (!Number.isSafeInteger(n) || n <= 0) fail('SHORT_WRITE');
      offset += n;
    }
    io.fsyncSync(fd);
  } finally { io.closeSync(fd); }
  const observed = readRegular(path, io, Math.max(LIMITS.fileBytes, LIMITS.manifestBytes));
  if (!observed.equals(bytes)) fail('STAGED_IDENTITY');
}
function preimage(path, io) {
  if (!checkedPath(path, 'file', io, true)) return { state: 'ABSENT' };
  return { state: 'FILE', ...identity(readRegular(path, io)) };
}
function generatorIdentity(io) {
  return { path: 'scripts/docs-index.mjs', ...identity(readRegular(join(ROOT, 'scripts/docs-index.mjs'), io)) };
}
function rendered(io) {
  checkedPath(DOCS, 'dir', io);
  const options = { strict: true, io };
  const dirs = allDirs(DOCS, [], options).filter((dir) => willIndex(dir, options));
  if (!dirs.length) fail('EMPTY_PLAN');
  if (dirs.length > LIMITS.entries) fail('ENTRY_LIMIT');
  // Same KAT entry as the direct CLI, not a duplicate renderer or test.
  if (generatorMain('--selftest') !== 0) fail('GENERATOR_KAT');
  let total = 0;
  const entries = dirs.map((dir) => {
    const bytes = Buffer.from(buildIndex(dir, options), 'utf8');
    total += bytes.length;
    if (bytes.length > LIMITS.fileBytes || total > LIMITS.outputBytes) fail('OUTPUT_LIMIT');
    return { path: toPosix(relative(ROOT, join(dir, 'INDEX.md'))), ...identity(bytes), bytes };
  });
  entries.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  return entries;
}
const outputRows = (entries) => entries.map(({ path, byteLength, sha256 }) => ({ path, byteLength, sha256 }));
function validate(value) {
  keys(value, ['schema', 'root', 'authorizing', 'contract', 'generator', 'entries']);
  if (value.schema !== SCHEMA || value.root !== 'docs' || value.authorizing !== false || value.contract !== CONTRACT) fail('SCHEMA');
  keys(value.generator, ['path', 'byteLength', 'sha256']);
  if (value.generator.path !== 'scripts/docs-index.mjs') fail('GENERATOR');
  boundedIdentity({ byteLength: value.generator.byteLength, sha256: value.generator.sha256 });
  if (!Array.isArray(value.entries) || !value.entries.length || value.entries.length > LIMITS.entries) fail('ENTRY_LIMIT');
  let previous = '', total = 0;
  for (const row of value.entries) {
    keys(row, ['path', 'byteLength', 'sha256', 'preimage']);
    if (typeof row.path !== 'string' || !/^docs(?:\/[^/\\:\x00-\x1f]+)*\/INDEX\.md$/.test(row.path) || row.path.split('/').some((p) => p === '.' || p === '..') || row.path <= previous) fail('ENTRY_PATH');
    previous = row.path;
    boundedIdentity({ byteLength: row.byteLength, sha256: row.sha256 });
    total += row.byteLength;
    if (total > LIMITS.outputBytes) fail('OUTPUT_LIMIT');
    if (row.preimage?.state === 'ABSENT') keys(row.preimage, ['state']);
    else {
      keys(row.preimage, ['state', 'byteLength', 'sha256']);
      if (row.preimage.state !== 'FILE') fail('PREIMAGE');
      boundedIdentity({ byteLength: row.preimage.byteLength, sha256: row.preimage.sha256 });
    }
  }
  return value;
}

// The fs dependency is injectable for deterministic fixture failures; the CLI
// always uses native fs. No environment bypass or phase callback is admitted.
export function execute(argv, io = fs) {
  const receipt = { schema: 'galerina.docs-index-publication-receipt.v1', authorizing: false, phase: 'VALIDATING', completed: [], remaining: [], recovery: null, staged: [], pending: null };
  let journalSequence = 0;
  const journal = () => {
    if (!receipt.recovery) return;
    exclusive(join(ROOT, receipt.recovery, 'receipt-' + String(journalSequence++).padStart(4, '0') + '.json'), Buffer.from(JSON.stringify(receipt, null, 2) + '\n'), io);
  };
  try {
    const { mode, output } = parse(argv);
    checkedPath(ROOT, 'dir', io);
    if (mode === '--create') {
      // Check existing ancestors without creating anything until planning succeeds.
      if (checkedPath(join(ROOT, 'build'), 'dir', io, true)) {
        if (checkedPath(dirname(output), 'dir', io, true) && checkedPath(output, 'file', io, true)) fail('EXISTS');
      }
      const entries = rendered(io);
      const value = {
        schema: SCHEMA, root: 'docs', authorizing: false, contract: CONTRACT,
        generator: generatorIdentity(io),
        entries: entries.map(({ path, byteLength, sha256 }) => ({ path, byteLength, sha256, preimage: preimage(join(ROOT, path), io) })),
      };
      validate(value);
      const bytes = Buffer.from(JSON.stringify(value, null, 2) + '\n');
      if (bytes.length > LIMITS.manifestBytes) fail('MANIFEST_LIMIT');
      directories(io, dirname(output));
      exclusive(output, bytes, io);
      receipt.phase = 'PLANNED';
      receipt.planSha256 = hash(bytes);
      return receipt;
    }
    const planBytes = readRegular(output, io, LIMITS.manifestBytes);
    const plan = validate(JSON.parse(planBytes.toString('utf8')));
    receipt.planSha256 = hash(planBytes);
    if (!equal(plan.generator, generatorIdentity(io))) fail('GENERATOR_DRIFT');
    const expected = rendered(io);
    if (!equal(outputRows(plan.entries), outputRows(expected))) fail('OUTPUT_PLAN_DRIFT');
    receipt.remaining = plan.entries.map((entry) => entry.path);
    const verifyPreimages = () => {
      for (const entry of plan.entries) if (!equal(entry.preimage, preimage(join(ROOT, entry.path), io))) fail('PREIMAGE_DRIFT');
    };
    verifyPreimages();
    directories(io, dirname(output));
    receipt.recovery = toPosix(relative(ROOT, join(dirname(output), 'recovery-' + randomUUID())));
    directories(io, join(ROOT, receipt.recovery));
    receipt.phase = 'PREPARING';
    journal();
    for (let i = 0; i < expected.length; i++) {
      const entry = expected[i], target = join(ROOT, entry.path);
      if (plan.entries[i].preimage.state === 'FILE') {
        const bytes = readRegular(target, io);
        if (!equal({ state: 'FILE', ...identity(bytes) }, plan.entries[i].preimage)) fail('PREIMAGE_DRIFT');
        exclusive(join(ROOT, receipt.recovery, String(i).padStart(4, '0') + '.before'), bytes, io);
      }
      const stage = join(dirname(target), '.docs-index-' + randomUUID() + '.tmp');
      receipt.staged.push({ path: entry.path, temporary: toPosix(relative(ROOT, stage)), backup: plan.entries[i].preimage.state === 'FILE' ? String(i).padStart(4, '0') + '.before' : null, preimage: plan.entries[i].preimage });
      journal(); // records intended preparation even if the exclusive write fails
      exclusive(stage, entry.bytes, io);
    }
    // Staged files are non-markdown and not source. Recheck all inputs/targets
    // before publication and after it; output-equivalent body drift is allowed.
    if (!equal(outputRows(rendered(io)), outputRows(expected))) fail('SOURCE_DRIFT');
    verifyPreimages();
    if (!equal(plan.generator, generatorIdentity(io))) fail('GENERATOR_DRIFT');
    receipt.phase = 'PUBLISHING';
    journal();
    for (let i = 0; i < expected.length; i++) {
      const entry = expected[i], target = join(ROOT, entry.path);
      receipt.pending = entry.path;
      journal();
      if (!equal(preimage(target, io), plan.entries[i].preimage)) fail('PREIMAGE_DRIFT');
      const stage = join(ROOT, receipt.staged[i].temporary);
      if (!equal(identity(readRegular(stage, io)), { byteLength: entry.byteLength, sha256: entry.sha256 })) fail('STAGED_IDENTITY');
      checkedPath(dirname(target), 'dir', io);
      io.renameSync(stage, target);
      // Record the completed rename BEFORE a readback/journal can fail.
      receipt.completed.push(entry.path);
      receipt.remaining.shift();
      receipt.pending = null;
      if (!equal(identity(readRegular(target, io)), { byteLength: entry.byteLength, sha256: entry.sha256 })) fail('PUBLICATION_IDENTITY');
      journal();
    }
    receipt.phase = 'VERIFYING';
    journal();
    if (!equal(outputRows(rendered(io)), outputRows(expected))) fail('SOURCE_DRIFT');
    for (const entry of expected) if (!equal(identity(readRegular(join(ROOT, entry.path), io)), { byteLength: entry.byteLength, sha256: entry.sha256 })) fail('PUBLICATION_IDENTITY');
    receipt.phase = 'COMPLETE';
    journal();
    return receipt;
  } catch (error) {
    receipt.error = error instanceof Error ? error.message : String(error);
    receipt.outcome = receipt.completed.length ? 'PARTIAL' : 'REFUSED';
    try { journal(); } catch (journalError) { receipt.journalError = String(journalError); }
    const failure = new Error(receipt.error);
    failure.receipt = receipt;
    throw failure;
  }
}
export function main(argv) {
  try { console.log(JSON.stringify(execute(argv))); return 0; }
  catch (error) { console.error(JSON.stringify(error.receipt ?? { error: String(error), authorizing: false })); return 1; }
}
if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) process.exitCode = main(process.argv.slice(2));

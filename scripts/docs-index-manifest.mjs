#!/usr/bin/env node
/**
 * Produce and apply an exact, repository-relative docs-index write manifest.
 * The manifest is the only authority for an apply run; current documentation
 * is regenerated and must match every recorded byte before any index is written.
 */

import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ROOT as GENERATOR_ROOT,
  DOCS,
  allDirs,
  buildIndex,
  toPosix,
  willIndex,
} from './docs-index.mjs';

const SCHEMA = 'galerina.docs-index-write-manifest.v1';
const GENERATED = 'INDEX.md';

const sha256 = (text) => createHash('sha256').update(Buffer.from(text, 'utf8')).digest('hex');
const usage = () => 'usage: docs-index-manifest.mjs <--create|--apply> --root <repo> (--out <manifest>|--manifest <manifest>)';

function fail(message) {
  throw new Error(`REFUSED ${message}`);
}

function parseArgs(argv) {
  const mode = argv[0];
  if (mode !== '--create' && mode !== '--apply') fail(usage());
  const values = new Map();
  for (let i = 1; i < argv.length; i++) {
    const key = argv[i];
    if (!['--root', '--out', '--manifest'].includes(key) || values.has(key)) fail(usage());
    const value = argv[++i];
    if (!value || value.startsWith('--')) fail(usage());
    values.set(key, value);
  }
  const root = values.get('--root');
  const output = mode === '--create' ? values.get('--out') : values.get('--manifest');
  if (!root || !output || values.has(mode === '--create' ? '--manifest' : '--out')) fail(usage());
  if (!isAbsolute(root) || !isAbsolute(output)) fail('root and manifest paths must be absolute');
  return { mode, root: resolve(root), output: resolve(output) };
}

function assertRoot(root) {
  if (root !== resolve(GENERATOR_ROOT)) fail('root does not match the generator repository root');
  if (!existsSync(DOCS)) fail(`no docs/ at ${DOCS}`);
}

function entriesForRoot(root) {
  assertRoot(root);
  const entries = [];
  for (const dir of allDirs(DOCS)) {
    if (!willIndex(dir)) continue;
    const text = buildIndex(dir);
    const target = join(dir, GENERATED);
    entries.push({
      path: toPosix(relative(root, target)),
      byteLength: Buffer.byteLength(text, 'utf8'),
      sha256: sha256(text),
      text,
    });
  }
  // Use code-unit ordering, not localeCompare, so the manifest is identical
  // on Windows and Linux.
  entries.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  return entries;
}

function manifestValue(entries) {
  return {
    schema: SCHEMA,
    root: 'docs',
    generatedBy: 'scripts/docs-index.mjs',
    entries: entries.map(({ path, byteLength, sha256: digest }) => ({ path, byteLength, sha256: digest })),
  };
}

function ensureManifestPath(root, output) {
  const rel = relative(root, output);
  if (!rel || rel.startsWith('..' + sep) || isAbsolute(rel)) fail('manifest must be inside the repository root');
  if (toPosix(rel).startsWith('docs/')) fail('manifest cannot be inside docs/');
  if (existsSync(output)) fail('manifest output already exists');
}

function createManifest(root, output) {
  ensureManifestPath(root, output);
  const entries = entriesForRoot(root);
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, `${JSON.stringify(manifestValue(entries), null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
  console.log(`created manifest for ${entries.length} exact INDEX.md path(s)`);
}

function validateManifest(root, output) {
  const relOutput = relative(root, output);
  if (!relOutput || relOutput.startsWith('..' + sep) || isAbsolute(relOutput)) fail('manifest must be inside the repository root');
  if (toPosix(relOutput).startsWith('docs/')) fail('manifest cannot be inside docs/');
  if (!existsSync(output)) fail('manifest is absent');
  const manifestStat = lstatSync(output);
  if (!manifestStat.isFile() || manifestStat.nlink !== 1) fail('manifest must be a regular single-link file');
  const value = JSON.parse(readFileSync(output, 'utf8'));
  if (!value || value.schema !== SCHEMA || value.root !== 'docs' || value.generatedBy !== 'scripts/docs-index.mjs') fail('manifest schema mismatch');
  if (!Array.isArray(value.entries) || value.entries.length === 0) fail('manifest entries are invalid');
  const paths = new Set();
  let previous = '';
  for (const entry of value.entries) {
    if (!entry || typeof entry.path !== 'string' || !/^docs(?:\/[^/]+)*\/INDEX\.md$/.test(entry.path)) fail('manifest contains an out-of-scope path');
    const pathParts = entry.path.split('/');
    if (pathParts.slice(1, -1).some((part) => part === '' || part === '.' || part === '..')) fail('manifest contains a traversal path');
    if (entry.path <= previous || paths.has(entry.path)) fail('manifest paths are not unique and sorted');
    previous = entry.path;
    paths.add(entry.path);
    if (!Number.isSafeInteger(entry.byteLength) || entry.byteLength < 0 || !/^[0-9a-f]{64}$/.test(entry.sha256)) fail('manifest entry identity is invalid');
  }
  return value;
}

function applyManifest(root, manifestPath) {
  const manifest = validateManifest(root, manifestPath);
  const expected = entriesForRoot(root);
  const expectedValue = manifestValue(expected);
  if (JSON.stringify(manifest) !== JSON.stringify(expectedValue)) fail('manifest does not match the current documentation bytes');

  // Preflight every target before the first write. Existing files must be ordinary,
  // single-link files; all writes are confined to the manifest's exact path set.
  for (const entry of expected) {
    const target = join(root, entry.path.split('/').join(sep));
    if (!existsSync(target)) continue;
    const stat = lstatSync(target);
    if (!stat.isFile() || stat.nlink !== 1) fail(`target is not a regular single-link file: ${entry.path}`);
  }
  const textByPath = new Map(expected.map((entry) => [entry.path, entry.text]));
  for (const entry of expected) {
    const target = join(root, entry.path.split('/').join(sep));
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, textByPath.get(entry.path), { encoding: 'utf8' });
  }
  console.log(`applied manifest to ${expected.length} exact INDEX.md path(s)`);
}

function main(argv) {
  try {
    const { mode, root, output } = parseArgs(argv);
    assertRoot(root);
    if (mode === '--create') createManifest(root, output);
    else applyManifest(root, output);
    return 0;
  } catch (error) {
    console.error(error instanceof Error ? error.message : `REFUSED ${String(error)}`);
    return 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  process.exitCode = main(process.argv.slice(2));
}

export { entriesForRoot, main, manifestValue };

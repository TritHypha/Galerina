#!/usr/bin/env node
/**
 * docs-index.mjs — generate an INDEX.md for every documentation subtree.
 *
 * WHY THIS EXISTS
 * An audit on 2026-08-13 measured the docs link graph: 1543 of 1898 documents (81%) were
 * linked from no other document, and the whole graph resolved to 462 distinct targets. A
 * reader — human or agent — that starts at an index and follows links reaches under a fifth
 * of what is written here. The documents were not missing; they were unreachable.
 *
 * The fix is additive: an index per subtree, linking every document in it, and a root index
 * linking the subtrees. Nothing moves, nothing is rewritten.
 *
 * GENERATED, NOT WRITTEN. A hand-maintained index drifts the moment a file is added, and a
 * stale index answers confidently and wrongly. Re-run this after adding documents.
 *
 *   --selftest    fixtures with known answers
 *   --dry-run     report what would change
 *   --check       compare every expected index without writing
 *   --apply       write the indexes
 */

import * as fs from 'node:fs';
import { readdirSync, readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { join, resolve, dirname, relative, sep, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const DOCS = join(ROOT, 'docs');
export const GENERATED = 'INDEX.md';
const SKIP_DIRS = new Set(['.myco', 'node_modules', '.git', 'generated']);

export const toPosix = (p) => p.split(sep).join('/');

/**
 * First heading, or the first non-empty prose line, as the document's description.
 * Front-matter, headings and list markers are stripped so the line reads as a summary.
 */
export function describe(text, fallback) {
  const body = text.replace(/^---\n[\s\S]*?\n---\n/, '');
  const h1 = /^#\s+(.+)$/m.exec(body);
  if (h1) return h1[1].replace(/[`*_]/g, '').trim();
  for (const line of body.split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#') || t.startsWith('|') || t.startsWith('---')) continue;
    return t.replace(/^[-*>]\s*/, '').replace(/[`*_]/g, '').slice(0, 120).trim();
  }
  return fallback;
}

/** Title-case a directory slug for a heading. */
export function titleOf(name) {
  return name.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}


// Guarded manifest mode only. Stable owner-controlled paths are required;
// lstat/realpath plus O_NOFOLLOW do not defeat hostile ancestor renames.
export function checkedPath(path, kind = 'file', io = fs, absent = false) {
  const target = resolve(path);
  const rel = relative(ROOT, target);
  if (rel === '..' || rel.startsWith('..' + sep) || isAbsolute(rel)) throw new Error('REFUSED PATH_SCOPE');
  const same = (a, b) => process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
  if (!same(resolve(io.realpathSync(ROOT)), ROOT)) throw new Error('REFUSED ROOT_ALIAS');
  const parts = rel ? rel.split(sep) : [];
  let current = ROOT;
  for (let i = -1; i < parts.length; i++) {
    if (i >= 0) current = join(current, parts[i]);
    let st;
    try { st = io.lstatSync(current); }
    catch (error) {
      if (absent && error.code === 'ENOENT' && i === parts.length - 1) return null;
      throw error;
    }
    const leaf = i === parts.length - 1;
    if (st.isSymbolicLink() || !same(resolve(io.realpathSync(current)), resolve(current))) throw new Error('REFUSED PATH_LINK');
    if ((!leaf || kind === 'dir') && !st.isDirectory()) throw new Error('REFUSED PATH_DIRECTORY');
    if (leaf && kind === 'file' && (!st.isFile() || st.nlink !== 1)) throw new Error('REFUSED PATH_FILE');
    if (leaf) return st;
  }
}

export function readRegular(path, io = fs, limit = 4 * 1024 * 1024) {
  const before = checkedPath(path, 'file', io);
  if (before.size > limit) throw new Error('REFUSED BYTE_LIMIT');
  const fd = io.openSync(path, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0));
  try {
    const held = io.fstatSync(fd);
    if (!held.isFile() || held.nlink !== 1 || held.dev !== before.dev || held.ino !== before.ino) throw new Error('REFUSED FILE_IDENTITY');
    const bytes = io.readFileSync(fd);
    const after = io.fstatSync(fd);
    if (bytes.length > limit || bytes.length !== before.size || after.size !== before.size || after.mtimeMs !== before.mtimeMs) throw new Error('REFUSED FILE_DRIFT');
    return bytes;
  } finally { io.closeSync(fd); }
}

function strictEntries(dir, options) {
  const io = options.io ?? fs;
  checkedPath(dir, 'dir', io);
  const entries = io.readdirSync(dir, { withFileTypes: true });
  if (entries.length > 4096) throw new Error('REFUSED ENTRY_LIMIT');
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const path = join(dir, entry.name);
    const st = checkedPath(path, 'any', io);
    if (/\.md$/i.test(entry.name)) checkedPath(path, 'file', io);
    if (st.isDirectory()) continue;
  }
  return entries;
}

export function listDir(dir, options) {
  const files = [], dirs = [];
  for (const e of options?.strict ? strictEntries(dir, options) : readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(e.name)) continue;
    if (e.isDirectory()) dirs.push(e.name);
    else if (/\.md$/i.test(e.name) && e.name !== GENERATED) files.push(e.name);
  }
  return { files: files.sort(), dirs: dirs.sort() };
}

function countMd(dir, options) {
  if (options?.strict) {
    let count = 0;
    for (const d of allDirs(dir, [], options)) count += listDir(d, options).files.length;
    return count;
  }
  let n = 0;
  const stack = [dir];
  while (stack.length) {
    const d = stack.pop();
    let es;
    try { es = readdirSync(d, { withFileTypes: true }); } catch { continue; }
    for (const e of es) {
      if (SKIP_DIRS.has(e.name)) continue;
      if (e.isDirectory()) stack.push(join(d, e.name));
      else if (/\.md$/i.test(e.name) && e.name !== GENERATED) n++;
    }
  }
  return n;
}

/**
 * Will this directory receive an INDEX.md? This predicate MUST stay identical to the write
 * loop's condition — if they disagree, a parent links an index that was never written.
 * That disagreement produced exactly five dead links on the first run.
 */
export function willIndex(dir, options) {
  try {
    const { files, dirs } = listDir(dir, options);
    return files.length > 0 || dirs.length > 0;
  } catch (error) { if (options?.strict) throw error; return false; }
}

export function buildIndex(dir, options) {
  const { files, dirs } = listDir(dir, options);
  const rel = toPosix(relative(DOCS, dir)) || '.';
  const name = rel === '.' ? 'docs' : rel;
  const depth = rel === '.' ? 0 : rel.split('/').length;

  const L = [`# ${rel === '.' ? 'Galerina documentation' : titleOf(dir.split(sep).pop())} — index`, ''];
  L.push(`\`docs/${rel === '.' ? '' : rel + '/'}\` — **${files.length}** document${files.length === 1 ? '' : 's'} here` +
    (dirs.length ? `, **${dirs.length}** subdirector${dirs.length === 1 ? 'y' : 'ies'}.` : '.'));
  L.push('');
  L.push('*Generated by `scripts/docs-index.mjs`. Do not hand-edit — re-run after adding documents.*');
  L.push('');

  if (dirs.length) {
    L.push('---', '', '## Sections', '', '| Section | Documents |', '|---|---|');
    for (const d of dirs) {
      const n = countMd(join(dir, d), options);
      // A directory only receives an INDEX.md if it has something to index. Linking one
      // into a directory that holds only examples or fixtures is a dead link, so those
      // rows point at the directory itself and say what is in it.
      const target = willIndex(join(dir, d), options) ? `${d}/${GENERATED}` : `${d}/`;
      L.push(`| [\`${d}/\`](${target}) | ${n === 0 ? '— (no documents; browse the directory)' : n} |`);
    }
    L.push('');
  }

  if (files.length) {
    L.push('---', '', '## Documents', '', '| Document | Description |', '|---|---|');
    for (const f of files) {
      let desc = f.replace(/\.md$/i, '').replace(/[-_]/g, ' ');
      try { desc = describe(options?.strict ? readRegular(join(dir, f), options.io).toString('utf8') : readFileSync(join(dir, f), 'utf8'), desc); } catch (error) { if (options?.strict) throw error; /* legacy fallback */ }
      L.push(`| [\`${f}\`](${f}) | ${desc.replace(/\|/g, '\\|')} |`);
    }
    L.push('');
  }

  L.push('---', '');
  if (depth > 0) {
    L.push(`[← \`docs/\` index](${'../'.repeat(depth)}${GENERATED})`);
  } else {
    L.push('This index is the entry point for the documentation tree. For the repository itself, see');
    L.push('[`../README.md`](../README.md) and [`../AGENTS.md`](../AGENTS.md).');
  }
  L.push('');
  return L.join('\n');
}

export function allDirs(dir, out = [], options) {
  if (options?.strict) {
    const stack = [dir];
    while (stack.length) {
      const current = stack.pop();
      if (out.length >= 2048) throw new Error('REFUSED DIRECTORY_LIMIT');
      out.push(current);
      for (const e of strictEntries(current, options)) if (e.isDirectory() && !SKIP_DIRS.has(e.name)) stack.push(join(current, e.name));
    }
    return out;
  }
  out.push(dir);
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory() && !SKIP_DIRS.has(e.name)) allDirs(join(dir, e.name), out);
  }
  return out;
}

export function selftest() {
  let pass = 0, fail = 0;
  const eq = (l, g, w) => { if (g === w) pass++; else { fail++; console.log(`  FAIL ${l}\n    got  ${JSON.stringify(g)}\n    want ${JSON.stringify(w)}`); } };

  eq('h1 becomes the description', describe('# Governance architecture\n\ntext', 'fb'), 'Governance architecture');
  eq('front matter is skipped', describe('---\ntitle: x\n---\n# Real Title\n', 'fb'), 'Real Title');
  eq('backticks stripped from heading', describe('# The `vAnd` operator', 'fb'), 'The vAnd operator');
  eq('falls back to first prose line', describe('Some opening sentence here.\n', 'fb'), 'Some opening sentence here.');
  eq('table rows are not a description', describe('| a | b |\n|---|---|\nreal line\n', 'fb'), 'real line');
  eq('empty document uses the fallback', describe('', 'fb'), 'fb');
  eq('list marker stripped', describe('- a bullet opening\n', 'fb'), 'a bullet opening');
  eq('title case', titleOf('research-prompts'), 'Research Prompts');
  eq('title case underscore', titleOf('platform_handover'), 'Platform Handover');

  // CONTROL: describe() must produce DIFFERENT answers for different documents, otherwise
  // every index row would carry the same text and the index would be decoration.
  eq('control: two documents get two descriptions',
    describe('# Alpha', 'fb') === describe('# Beta', 'fb'), false);

  // willIndex() decides BOTH whether a file is written and whether a parent links to it.
  // The two used to disagree, which put five dead links into the first generated tree.
  eq('willIndex: absent directory', willIndex(join(DOCS, '__no_such_dir__')), false);
  eq('willIndex: docs root itself', willIndex(DOCS), true);
  {
    // A directory holding only non-markdown content gets no index, so no parent may link one.
    const probe = join(DOCS, 'examples');
    if (existsSync(probe)) {
      const kids = readdirSync(probe, { withFileTypes: true }).filter((e) => e.isDirectory());
      const noIndex = kids.filter((e) => !willIndex(join(probe, e.name)));
      eq('willIndex agrees with what is on disk',
        noIndex.every((e) => !existsSync(join(probe, e.name, GENERATED))), true);
    } else pass++;
  }

  console.log(`docs-index self-test: ${fail === 0 ? `OK (${pass} fixtures)` : fail + ' FAILED'}`);
  return fail === 0;
}

export function main(mode = process.argv[2]) {
if (mode === '--selftest') return selftest() ? 0 : 1;
if (!['--dry-run', '--check', '--apply'].includes(mode)) {
  console.error('usage: docs-index.mjs <--selftest|--dry-run|--check|--apply>');
  return 2;
}
if (!selftest()) { console.error('KATs failed — refusing to write indexes from an unproven generator.'); return 1; }
if (!existsSync(DOCS)) { console.error(`no docs/ at ${DOCS}`); return 2; }

const dry = mode === '--dry-run';
const check = mode === '--check';
let written = 0, linked = 0, drifted = 0;
for (const d of allDirs(DOCS)) {
  if (!willIndex(d)) continue;   // same predicate the Sections rows use — see willIndex()
  const { files } = listDir(d);
  const text = buildIndex(d);
  const target = join(d, GENERATED);
  linked += files.length;
  if (check) {
    let current;
    try { current = readFileSync(target, 'utf8'); } catch { /* missing or unreadable is drift */ }
    if (current !== text) {
      console.error(`[check] drift ${toPosix(relative(ROOT, target))}`);
      drifted++;
    }
  } else if (!dry) {
    writeFileSync(target, text);
  }
  written++;
}
if (check) {
  if (drifted > 0) {
    console.error(`[check] ${drifted} of ${written} INDEX.md file(s) missing or drifted; wrote 0`);
    return 1;
  } else {
    console.log(`[check] ${written} INDEX.md file(s) exact, linking ${linked} documents; wrote 0`);
  }
} else {
  console.log(`${dry ? '[dry-run] would write' : 'wrote'} ${written} INDEX.md file(s), linking ${linked} documents`);
}
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) process.exitCode = main();

#!/usr/bin/env node
// audit-example-diagnostics.mjs — the curriculum-wide diagnostics gate.
//
// WHY: every curriculum example declares a `/// expected_diagnostics:` contract in
// its header — either `none` (must compile clean) or one/more `FUNGI-CATEGORY-NNN`
// codes (a NEGATIVE example that must EMIT exactly that teaching diagnostic). Until
// now nothing ran `galerina check` across the whole corpus and held each file to its
// own contract, so a "clean" example that silently started erroring (see 104-multiple-
// effects: header said `none`, body emitted FUNGI-VALUESTATE-006) could rot unseen.
// The reference-link audit only covers the handful of LINKED examples; this covers ALL.
//
// CONTRACT (fail-closed):
//   expected_diagnostics: none   -> `galerina check` MUST be clean (0 errors).
//   expected_diagnostics: <CODE> -> check MUST emit every listed code (negatives are
//                                   re-run under --strict-types since TYPE-family codes
//                                   are strict-only advisories in plain mode).
//   (missing header)             -> FAIL; every example must declare its contract.
//
// The corpus already carries pre-existing drift, so the gate is BASELINE-gated: it is
// GREEN at the committed baseline and RED only on a NEW regression (a future 104) or a
// stale baseline entry that now passes. This makes it committable + immediately useful.
//
// FLAGS:
//   (none)           enforce against the baseline (exit 1 on new drift / stale entries).
//   --self-test      prove the detector fires on synthetic inputs (no compiler spawn).
//   --write-baseline snapshot the current failures into example-diagnostics-baseline.json.
//   --with-strict    also enumerate `none` examples that hide TYPE advisories (informational).
//
// Zero-dep, mirrors scripts/audit-syntax-reference-links.mjs house style.

import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const root = resolve(scriptDir, '..'); // Galerina/
const withStrict = process.argv.includes('--with-strict');
const writeBaseline = process.argv.includes('--write-baseline');
const selfTest = process.argv.includes('--self-test');

// Known-drift baseline: examples that already fail their expected_diagnostics contract
// against the current checker (a snapshot of pre-existing curriculum debt). The gate is
// GREEN at baseline and RED on any NEW drift or any RESOLVED entry left stale — so a
// future 104-class regression is caught immediately while the 71 known drifts are a
// transparent burn-down worklist. Regenerate with `--write-baseline` after each fix.
const BASELINE_PATH = join(scriptDir, 'example-diagnostics-baseline.json');

/** Coarse category for the burn-down worklist. */
function categorize(why) {
  if (why.includes('no `expected_diagnostics` header')) return 'missing-header';
  if (why.includes('declares `none`')) {
    if (why.includes('TIER-001')) return 'tier-drift';
    if (why.includes('VALUESTATE-006')) return 'redact-006';
    if (why.includes('VALUESTATE-008')) return 'untaint-008';
    if (why.includes('CONTEXT-001')) return 'context-001';
    return 'none-emits-other';
  }
  if (why.includes('did NOT emit')) {
    return why.includes('got clean') ? 'diagnostic-not-fired' : 'diagnostic-other-code';
  }
  return 'other';
}

// The numbered curriculum under docs/examples/Level-* is the corpus that carries the
// `expected_diagnostics` contract. The top-level examples/ tree (aerospace, auth-service,
// ai-inference, healthcare, …) is a SHOWCASE of whole-app .fungi that does not declare
// per-file expected_diagnostics, so it is out of scope for THIS gate (getPatient et al.
// are covered by scripts/audit-syntax-reference-links.mjs instead). Proposal dirs
// (Proposed-*) are pre-curriculum drafts and are logged-but-not-gated.
const EXAMPLE_ROOTS = ['docs/examples'];
const EXCLUDE_RE = /(^|\/)Proposed-/i;

const CODE_RE = /FUNGI-[A-Z]+-\d+/g;
const CLEAN_RE = /0 errors, 0 governance warnings/;
const ADVISORY_RE = /\+(\d+)\s+FUNGI-\S+\s+advisory/; // the "hidden under plain" note

/** Recursively collect every example.fungi (and *.fungi under examples/) under a root. */
function collectFungi(absRoot) {
  const out = [];
  let entries;
  try {
    entries = readdirSync(absRoot, { withFileTypes: true });
  } catch {
    return out; // root may not exist (e.g. no top-level examples/)
  }
  for (const e of entries) {
    const p = join(absRoot, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
      out.push(...collectFungi(p));
    } else if (e.isFile() && e.name.endsWith('.fungi')) {
      out.push(p);
    }
  }
  return out;
}

/** Parse a `/// expected_diagnostics: ...` header -> { kind:'none'|'codes'|'missing', codes:Set }. */
function parseExpectedText(text) {
  const m = text.match(/^\/\/\/\s*expected_diagnostics:\s*(.+)$/m);
  if (!m) return { kind: 'missing', codes: new Set() };
  const raw = m[1].trim();
  if (/^none$/i.test(raw)) return { kind: 'none', codes: new Set() };
  const codes = new Set(raw.match(CODE_RE) || []);
  if (codes.size === 0) return { kind: 'missing', codes: new Set() }; // unparseable value
  return { kind: 'codes', codes };
}

/**
 * Pure verdict: does the emitted diagnostic set honor the declared contract?
 * `emitted` = the union of the plain (and, for negatives, strict) code sets.
 * Shared by the sweep AND --self-test so the detector can never be silently neutered.
 */
function verdict(exp, emitted, clean) {
  if (exp.kind === 'missing') {
    return { ok: false, why: 'no `expected_diagnostics` header (every example must declare its contract)' };
  }
  if (exp.kind === 'none') {
    if (clean && emitted.size === 0) return { ok: true };
    return { ok: false, why: `declares \`none\` but emitted ${[...emitted].join(', ') || 'errors'}` };
  }
  const missing = [...exp.codes].filter((c) => !emitted.has(c));
  if (missing.length === 0) return { ok: true };
  return {
    ok: false,
    why: `expected ${[...exp.codes].join(', ')} but did NOT emit ${missing.join(', ')} (got ${[...emitted].join(', ') || 'clean'})`,
  };
}

/** Run `galerina check <rel> [--strict-types]` -> { clean, codes:Set, advisory:int, out }. */
function check(rel, strict) {
  const args = ['galerina.mjs', 'check', rel];
  if (strict) args.push('--strict-types');
  const r = spawnSync('node', args, { cwd: root, encoding: 'utf8' });
  const out = `${r.stdout || ''}${r.stderr || ''}`;
  const codes = new Set(out.match(CODE_RE) || []);
  const advisoryMatch = out.match(ADVISORY_RE);
  return {
    clean: CLEAN_RE.test(out) && r.status === 0,
    codes,
    advisory: advisoryMatch ? Number(advisoryMatch[1]) : 0,
    out,
  };
}

// ── self-test: prove the detector fires (a neutered gate is a fail-open) ─────────
if (selfTest) {
  const S = (a) => new Set(a);
  const cases = [
    ['parse none', parseExpectedText('/// expected_diagnostics: none').kind === 'none'],
    ['parse code', parseExpectedText('/// expected_diagnostics: FUNGI-TYPE-001').codes.has('FUNGI-TYPE-001')],
    ['parse missing', parseExpectedText('/// level: 1').kind === 'missing'],
    ['none+clean passes', verdict({ kind: 'none', codes: S([]) }, S([]), true).ok === true],
    ['none-that-errors CAUGHT', verdict({ kind: 'none', codes: S([]) }, S(['FUNGI-VALUESTATE-006']), false).ok === false],
    ['none-not-clean CAUGHT', verdict({ kind: 'none', codes: S([]) }, S([]), false).ok === false],
    ['neg-that-emits passes', verdict({ kind: 'codes', codes: S(['FUNGI-TYPE-001']) }, S(['FUNGI-TYPE-001']), false).ok === true],
    ['neg-gone-silent CAUGHT', verdict({ kind: 'codes', codes: S(['FUNGI-TYPE-001']) }, S([]), true).ok === false],
    ['neg-wrong-code CAUGHT', verdict({ kind: 'codes', codes: S(['FUNGI-PII-001']) }, S(['FUNGI-TIER-001']), false).ok === false],
    ['missing-header CAUGHT', verdict({ kind: 'missing', codes: S([]) }, S([]), true).ok === false],
    ['categorize tier-drift', categorize('declares `none` but emitted FUNGI-TIER-001') === 'tier-drift'],
    ['categorize not-fired', categorize('expected X but did NOT emit X (got clean)') === 'diagnostic-not-fired'],
  ];
  let bad = 0;
  for (const [name, pass] of cases) {
    console.log(`  ${pass ? 'ok  ' : 'FAIL'} ${name}`);
    if (!pass) bad++;
  }
  console.log(bad ? `\n❌ self-test: ${bad}/${cases.length} failed` : `\n✅ self-test: ${cases.length}/${cases.length} detectors fire`);
  process.exit(bad ? 1 : 0);
}

const files = EXAMPLE_ROOTS.flatMap((r) => collectFungi(join(root, r))).sort();

const failures = [];
const strictGap = []; // `none` examples that pass plain but carry strict advisories
const excluded = []; // pre-curriculum proposal drafts, logged not gated
let okCount = 0;

for (const abs of files) {
  const rel = relative(root, abs).replace(/\\/g, '/');
  if (EXCLUDE_RE.test(rel)) {
    excluded.push(rel);
    continue;
  }
  const exp = parseExpectedText(readFileSync(abs, 'utf8'));
  const res = check(rel, false);

  // Negative examples: TYPE-family codes are strict-only advisories in plain mode (the
  // suppression that hid 104), so union a --strict-types pass when plain falls short.
  let emitted = res.codes;
  if (exp.kind === 'codes' && [...exp.codes].some((c) => !emitted.has(c))) {
    emitted = new Set([...emitted, ...check(rel, true).codes]);
  }

  const v = verdict(exp, emitted, res.clean);
  if (v.ok) {
    okCount++;
    if (exp.kind === 'none' && res.advisory > 0) strictGap.push({ rel, advisory: res.advisory });
    console.log(`  OK   ${rel}  (${exp.kind === 'none' ? 'clean' : `emits ${[...exp.codes].join(', ')}`})`);
  } else {
    failures.push({ rel, why: v.why });
  }
}

// Optional deep strict sweep over the `none` examples (informational).
if (withStrict) {
  console.log('\n--- strict sweep (`none` examples under --strict-types) ---');
  for (const abs of files) {
    const rel = relative(root, abs).replace(/\\/g, '/');
    const exp = parseExpectedText(readFileSync(abs, 'utf8'));
    if (exp.kind !== 'none') continue;
    const res = check(rel, true);
    if (!res.clean) {
      console.log(`  STRICT-GAP  ${rel}  -> ${[...res.codes].join(', ') || 'not clean'}`);
    }
  }
}

const gated = okCount + failures.length;
console.log('');
if (excluded.length) {
  console.log(`note: ${excluded.length} pre-curriculum proposal draft(s) logged-but-not-gated (Proposed-*).`);
}
if (strictGap.length && !withStrict) {
  console.log(
    `note: ${strictGap.length} \`none\` example(s) pass plain but carry hidden TYPE advisories ` +
      `(would fail a governed run) — run with --with-strict to enumerate.`,
  );
}

// ── baseline-aware gating ──────────────────────────────────────────────────────
if (writeBaseline) {
  const obj = {};
  for (const f of [...failures].sort((a, b) => a.rel.localeCompare(b.rel))) {
    obj[f.rel] = { category: categorize(f.why), why: f.why };
  }
  writeFileSync(BASELINE_PATH, JSON.stringify(obj, null, 2) + '\n');
  console.log(`wrote baseline: ${failures.length} known-drift example(s) -> scripts/example-diagnostics-baseline.json`);
  process.exit(0);
}

let baseline = {};
try {
  baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));
} catch {
  /* no baseline file yet: every failure counts as new (fail-closed) */
}
const baselineSet = new Set(Object.keys(baseline));
const failingSet = new Set(failures.map((f) => f.rel));
const newFailures = failures.filter((f) => !baselineSet.has(f.rel));
const knownFailures = failures.filter((f) => baselineSet.has(f.rel));
const resolved = [...baselineSet].filter((r) => !failingSet.has(r)); // baselined, now passing

if (knownFailures.length) {
  console.log(`ℹ️  ${knownFailures.length} known-drift example(s) tracked in baseline (burn-down worklist).`);
}
if (resolved.length) {
  console.log(
    `\n✅ ${resolved.length} baselined example(s) now PASS — regenerate the baseline (--write-baseline) to drop them:`,
  );
  for (const r of resolved.sort()) console.log(`  RESOLVED  ${r}`);
}
if (newFailures.length) {
  console.log(`\n❌ ${newFailures.length} NEW failure(s) NOT in the baseline (regression):`);
  for (const f of newFailures) console.log(`  FAIL  ${f.rel}\n        ${f.why}`);
}

if (newFailures.length || resolved.length) {
  console.log(
    `\n❌ example-diagnostics: gate RED — ${newFailures.length} new regression(s), ${resolved.length} stale baseline entr(y/ies).`,
  );
  process.exit(1);
}

console.log(
  `\n✅ example-diagnostics: green at baseline — ${okCount}/${gated} honor their contract, ${knownFailures.length} known-drift tracked, 0 new.`,
);

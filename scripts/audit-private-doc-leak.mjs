#!/usr/bin/env node
// =============================================================================
// audit-private-doc-leak.mjs — fail-CLOSED: no tracked file in this PUBLIC repo may name a never-public KB doc
// =============================================================================
// RD-0453 established the `-PRIVATE.md` filename tag "so a tool can mechanically exclude never-public docs."
// This is that tool — the enforcement half the convention shipped without. It became a LIVE necessity on
// 2026-07-17: the kb-index generator indexed RD-0453/0454's TITLES into tracked build/kb-index/, leaking a
// private "where Galerina is slower than Node/Python/Rust" weakness-map into public Galerina (title + terms,
// caught before push). Gitignoring build/kb-index/ + build/kb-graph/ closed THAT vector; this gate closes the
// CLASS — any tracked file that names a `-PRIVATE.md` doc fails the build, so a regen, a new indexer, or a
// stray doc-link can never silently re-introduce it. "Remember to exclude it" is not a control; a gate is.
//
// SIGNAL: a reference to a `*-PRIVATE.md` filename. Deliberately scoped to the TAG, NOT the private-KB path
// (`../ZTF-Knowledge-Bases/`) — that path has many LEGITIMATE tracked references (the KB is the sibling docs
// home; hundreds of Galerina docs point at it), so flagging the path would be noise that gets the gate muted.
// The `-PRIVATE.md` suffix is the precise never-public marker: a public file has no business naming one,
// because the FILENAME itself is the title (RD-0453: you cannot content-scan for never-public — the human
// tags the file; this gate trusts that tag and nothing else).
//
// ⚠ SCAN-AFTER-ADD: scans git-TRACKED files. `git add` a new file before trusting a green (a just-authored
// doc joins the scan set only at add-time — same field-hit caveat as audit-path-leak.mjs).
//
// Usage:
//   node scripts/audit-private-doc-leak.mjs --self-test   # prove the detector fires (run first in CI)
//   node scripts/audit-private-doc-leak.mjs               # enforce: exit = violation count
//   node scripts/audit-private-doc-leak.mjs --json
// =============================================================================
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// Spawn git directly, NO shell (args as an array — no shell-injection surface). Same idiom as audit-path-leak.
const git = (...a) => execFileSync("git", a, { cwd: ROOT, encoding: "utf8", windowsHide: true });

// The never-public tag. Case-INSENSITIVE: the convention is CAPS (`-PRIVATE.md`), but a mis-cased reference
// still leaks the title, so fail closed on any casing. `[\w.-]*` captures the whole filename stem for the report.
const PRIVATE_REF = /[\w.-]*-PRIVATE\.md/gi;

// This tool DEFINES the pattern (the regex + the self-test fixtures), so it necessarily contains the literal
// "-PRIVATE.md" — use-vs-mention. Allowlist THIS file by its repo-relative path; nothing else is exempt. A real
// leak must never be allowlisted — fix the reference (or untrack the file), never add it here.
const SELF = "scripts/audit-private-doc-leak.mjs";

function scanText(text, file) {
  const hits = [];
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(PRIVATE_REF);
    if (m) for (const ref of m) hits.push({ file, line: i + 1, ref, col: lines[i].indexOf(ref) + 1 });
  }
  return hits;
}

// ── self-test — R&D's #2 discriminating law: fires on a -PRIVATE ref, silent on a MINIMAL clean control ──
function selfTest() {
  const checks = [];
  const stem = "See ../ZTF-Knowledge-Bases/galerina-rd-0454-runtime-weakness-map-vs-node-python-rust";
  const FIRE = `${stem}-PRIVATE.md for detail.`;
  const CONTROL = `${stem}-PUBLIC.md for detail.`;   // identical BUT for the tag — the single variable
  const fire = scanText(FIRE, "fixture");
  const control = scanText(CONTROL, "fixture");
  checks.push(["★ the detector FIRES on a -PRIVATE.md reference", fire.length === 1 && fire[0].ref.endsWith("-PRIVATE.md")]);
  checks.push(["★ the detector is SILENT on the control: a -PUBLIC.md doc is not flagged", control.length === 0]);
  // Minimality: FIRE and CONTROL must differ in EXACTLY the tag. Neutralise the tag in each to a common
  // placeholder; if that is the only difference, the two are byte-identical after.
  checks.push(["★ the control is MINIMAL: fire and control differ only in PRIVATE vs PUBLIC (one token)",
    FIRE.replace("-PRIVATE.md", "-§.md") === CONTROL.replace("-PUBLIC.md", "-§.md")]);
  checks.push(["case-insensitive: a mis-cased '-private.md' still fires (fail-closed on any casing)",
    scanText("see foo-private.md", "f").length === 1]);
  checks.push(["a bare mention of the word 'private' (no -PRIVATE.md suffix) does NOT fire — no false alarm",
    scanText("this doc is private and internal", "f").length === 0]);

  let ok = true;
  for (const [name, pass] of checks) { console.log(`  ${pass ? "✅" : "❌"} ${name}`); if (!pass) ok = false; }
  if (!ok) { console.error("\n  ❌ private-doc-leak self-test FAILED — the detector is neutered"); process.exit(1); }
  console.log("\n  private-doc-leak self-test: fires on a -PRIVATE.md reference, silent on the -PUBLIC.md control ✅");
  process.exit(0);
}

// ── main ─────────────────────────────────────────────────────────────────────
const asJson = process.argv.includes("--json");
if (process.argv.includes("--self-test")) selfTest();

const files = git("ls-files").split("\n").map((s) => s.trim()).filter(Boolean);
const violations = [];
let scanned = 0, skippedBinary = 0;
for (const f of files) {
  if (f === SELF) continue; // use-vs-mention: this tool defines the pattern
  let text;
  try { text = readFileSync(join(ROOT, f), "utf8"); } catch { continue; } // deleted/unreadable — not our concern
  if (/[\x00-\x08\x0E-\x1F]/.test(text)) { skippedBinary++; continue; } // control bytes => binary; the tag is a text filename, never in a blob // binary — the tag is a text filename, never in a blob
  scanned++;
  for (const h of scanText(text, f)) violations.push(h);
}

if (asJson) {
  console.log(JSON.stringify({ scanned, skippedBinary, violations }, null, 2));
  process.exit(violations.length);
}

console.log(`\n  private-doc-leak — does any TRACKED public file name a never-public -PRIVATE.md KB doc?\n`);
if (violations.length) {
  console.error(`  ❌ private-doc-leak: ${violations.length} tracked file(s) reference a -PRIVATE.md doc — a never-public title is in the public tree:\n`);
  for (const v of violations) console.error(`    ${v.file}:${v.line}:${v.col}  →  ${v.ref}`);
  console.error(`\n  Fix: remove the reference, or untrack the file (git rm --cached + gitignore) if it is a generated index of the private KB.`);
  console.error("");
} else {
  // G0 — the green states its SURFACE and its EXCLUSIONS.
  console.log(`  ✅ private-doc-leak: 0 tracked files reference a -PRIVATE.md doc (scanned ${scanned} text files · ${skippedBinary} binary skipped · self excluded: ${SELF}).`);
  console.log(`     surface: the -PRIVATE.md filename TAG only. NOT the private-KB path (../ZTF-Knowledge-Bases/), which has legitimate tracked refs — the tag is the precise never-public marker.`);
}
console.log(`VIOLATIONS: ${violations.length}`);
console.log(`TOTAL: ${violations.length} private-doc-leak violation(s) · ${scanned} tracked text file(s) scanned`);
process.exit(violations.length);

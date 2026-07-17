#!/usr/bin/env node
// audit-path-leak.mjs — fail-CLOSED guard: no committed file may contain an ABSOLUTE LOCAL path that
// leaks the developer's machine. Galerina is a PUBLIC repo; a path like `C:\Users\<name>\...` or a
// `wwwprojects\...` root discloses the OS username + on-disk layout to the world AND breaks on every
// other machine. Two passes: (1) STRUCTURAL — paths that must never be tracked at all (machine-local
// index artifacts; catches binaries the text scan skips), (2) CONTENT — scans git-tracked text files
// (skips binaries), honors an allowlist (this tool + any line that must quote the pattern to explain
// the rule, via an inline marker). `--self-test` proves the detectors still fire before the enforcing
// scan — a neutered guard is itself a fail-open.
//
// ⚠ SCAN-AFTER-ADD: this guard scans git-TRACKED files. A brand-new file is invisible until it is staged —
// so a green run BEFORE `git add` can turn RED after commit (a just-authored doc joined the scan set only at
// add-time). Always `git add` new files, THEN trust a green. (Field-hit 2026-07-16; same note on the KB guard.)
//
// ★ THE FAMILY, AND ITS PARITY GAP — this gate is VENDORED EIGHT TIMES and the copies are NOT equal.
// Surveyed 2026-07-17 (and correcting 0820cd3f's message, which called six of them "blind": wrong — see
// below). Two shapes exist:
//   • 6 rules (this file, 184L · ZTF-Knowledge-Bases/tools/kb-path-leak.mjs, 166L) — adds
//     dash-encoded-user-home + the NEVER_TRACKED pass (codebase-memory-dir, graph-db-blob).
//   • 3 rules (98L, byte-identical across TritMesh-Database · -Markets · -Query-Language · -Rhizo ·
//     -Tensor · ZT-Galerina-GRAPH-ASCII-v2) — drive-user-path · wwwprojects · unix-home-path ONLY.
// The 3-rule copies never modelled the dash slug in EITHER form, and carry no NEVER_TRACKED pass at all
// — the pass that exists because a 10 MB graph.db.zst with an embedded machine slug sat invisible at HEAD
// for five days (ae55016e). Their header says "Vendored per consumer from the family's KB/Galerina
// path-leak guards (one vetted source, copied)". True about PROVENANCE; a reader takes it as PARITY;
// there is none, and nothing checks. Same class as everything else this file has taught today.
//
// Measured, not assumed: those six hold 151 tracked files between them and contain ZERO real leaks
// under THIS ruleset (the only hits are the tools quoting `wwwprojects/` in their own rule definitions —
// use-vs-mention). Five have no git remote; one is private. So the gap is LATENT, not live: nothing has
// gone through it. Left as-is deliberately — right-sizing a guard to a 20-file doc repo is legitimate.
// What is NOT legitimate is the silence: a copy that models fewer shapes should SAY so. The durable fix
// is a copies-must-agree check (or a declared per-copy ruleset), not eight hand-syncs. See task #105.
//
// Usage:
//   node scripts/audit-path-leak.mjs --self-test   # prove the detectors fire (run first in CI)
//   node scripts/audit-path-leak.mjs               # enforce: exit 1 on any leak
import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// Spawn git directly, NO shell: args pass as an array (no shell-injection surface, no DEP0190). On
// Windows, CreateProcess resolves `git` -> `git.exe` on PATH without a shell; windowsHide avoids a flash.
const git = (...a) => execFileSync("git", a, { cwd: ROOT, encoding: "utf8", windowsHide: true });

// Each detector handles a single OR double backslash (paths are often JSON-escaped as `C:\\Users\\...`).
const PATTERNS = [
  // Windows user home: drive + Users + a REAL name segment — leaks BOTH the drive layout and the
  // username. The (?!<) skips a `<name>`/`<user>` PLACEHOLDER, which teaches the rule rather than leaks.
  { name: "windows-user-home", re: /[A-Za-z]:[\\/]{1,2}Users[\\/]{1,2}(?!<)[^\\/\s"'`,;<]+/g },
  // Percent-wrapped Windows env var used as a LITERAL path stand-in (`%USERPROFILE%\...`). Owner ruling
  // 2026-07-15: a public repo hardcodes NOTHING machine-specific — a `%USERPROFILE%` literal is still a
  // Windows-only hardcoding, not a portable fix, so it is itself a leak. A runtime env READ in code
  // (`process.env.USERPROFILE`, `$env:USERNAME`) has no `%...%` wrapper and never matches — that stays legal.
  { name: "windows-env-literal", re: /%(?:USERPROFILE|USERNAME|HOMEPATH|HOMEDRIVE|APPDATA|LOCALAPPDATA)%/gi },
  // The retired `wwwprojects` projects root, in path position (drive-prefixed or followed by a separator).
  { name: "wwwprojects-path", re: /(?:[A-Za-z]:[\\/]{1,2}wwwprojects|wwwprojects[\\/])/g },
  // Dash-encoded machine slug: `C--Users-<name>-...` — the SAME username+layout leak as
  // windows-user-home with the separators flattened to dashes (how the local index MCP derives its
  // project ids; one sat in a tracked artifact.json until 2026-07-09). Anchored on a lone drive
  // letter so prose like "Power-Users-Guide" stays silent; (?!<) keeps `<name>` placeholders legal.
  //
  // ★ `-{1,2}` IS LOAD-BEARING — DO NOT NARROW IT BACK TO A SINGLE DASH (R&D finding, 2026-07-17).
  // `C:\Users\x` flattens the drive COLON *and* the separator, one dash each → `C--Users-x`. TWO. This
  // rule pictured one, so for as long as it existed it matched a shape the encoder never emits and
  // MISSED every real slug — no other rule covered it either, on a PUBLIC repo whose owner's username
  // is what this guard exists to keep private. Note windows-user-home above already spells its
  // separator [\\/]{1,2}: the doubling was known, and applied to one rule and not this one.
  //
  // It survived because the self-test's fixture was drawn from THIS pattern's own surface (single-dash
  // in, single-dash asserted). A fixture taken from the rule can only ever confirm the rule; it cannot
  // report that the rule pictures the wrong thing. The regression case below plants the shape the
  // ENCODER produces, which is the only fixture that could have caught this.
  { name: "dash-encoded-user-home", re: /(?<![A-Za-z0-9])[A-Za-z]-{1,2}Users-(?!<)[A-Za-z0-9_.]+-[A-Za-z0-9]/g },
];

// Paths that must NEVER be tracked at all, whatever they contain — mirrors the .gitignore policy for
// machine-local index artifacts. This is the BINARY-blind-spot fix: the content scan below skips
// binaries, which is exactly how a 10 MB graph.db.zst (embedded machine slug and all) sat invisible
// at HEAD from the `git add -A` accident (ae55016e, 2026-07-04) until 2026-07-09. An ignore rule
// cannot evict what is already in the index; this check can.
const NEVER_TRACKED = [
  { name: "codebase-memory-dir", re: /(^|\/)\.codebase-memory\// },
  { name: "graph-db-blob", re: /(^|\/)graph\.db\.zst$/ },
];

function scanTrackedList(files) {
  const hits = [];
  for (const rel of files) {
    const names = NEVER_TRACKED.filter((p) => p.re.test(rel)).map((p) => p.name);
    if (names.length) hits.push({ rel, pattern: names.join("+") }); // one hit per file, all reasons
  }
  return hits;
}

// Files permitted to contain the pattern (this tool defines it). Exact repo-relative paths.
const ALLOW_FILES = new Set(["scripts/audit-path-leak.mjs"]);
// A line carrying this marker is exempt (a doc that must quote an example to teach the rule).
const ALLOW_MARKER = "path-leak-audit:allow";

function scanText(text) {
  const hits = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(ALLOW_MARKER)) continue;
    for (const p of PATTERNS) {
      p.re.lastIndex = 0;
      let m;
      while ((m = p.re.exec(lines[i])) !== null) {
        hits.push({ line: i + 1, pattern: p.name, text: lines[i].trim().slice(0, 160) });
      }
    }
  }
  return hits;
}

function selfTest() {
  const fires = (s) => scanText(s).length > 0;
  const checks = [
    ["clean repo-relative path is silent", !fires("packages-galerina/foo/src/index.ts")],
    ["windows-user-home fires", fires("see C:\\Users\\someone\\Documents\\GitHub\\x")],
    ["forward-slash user-home fires", fires("C:/Users/someone/dev")],
    ["json-escaped user-home fires", fires('"root": "C:\\\\Users\\\\someone"')],
    ["wwwprojects path fires", fires("moved from C:\\wwwprojects\\galerina")],
    ["percent env literal fires (%USERPROFILE% is NOT a portable fix)", fires("run %USERPROFILE%\\Documents\\GitHub\\x")],
    ["%APPDATA% literal fires", fires("cache in %APPDATA%\\galerina")],
    ["process.env.USERPROFILE READ does NOT fire (portable runtime access)", !fires("const home = process.env.USERPROFILE || process.env.HOME")],
    ["$env:USERNAME READ does NOT fire", !fires('icacls x /grant:r "$($env:USERNAME):F"')],
    ["bare 'wwwprojects' word in prose does NOT fire", !fires("migrated the wwwprojects layout")],
    ["'C:\\Users\\<name>' placeholder does NOT fire", !fires("a hardcoded C:\\Users\\<name>\\x breaks")],
    ["allow-marker suppresses", !fires("example C:\\Users\\x  (path-leak-audit:allow)")],
    ["dash-encoded slug fires", fires('"project": "C-Users-someone-Documents-GitHub-Galerina"')],
    // ★ THE REGRESSION (R&D finding, 2026-07-17). This is the shape the ENCODER actually emits — drive
    // colon AND separator each flatten to a dash. The rule modelled ONE dash, so for its whole life it
    // matched a shape nothing produces and missed every real slug; no other rule covered it either, on
    // a PUBLIC repo. If this case ever goes red, someone narrowed `-{1,2}` back and the guard is blind.
    //
    // Note where this fixture comes from: the ENCODER's output, not the pattern. The pre-existing case
    // above was drawn from the pattern itself, which is why it passed forever while the guard was blind
    // — a fixture taken from the rule can only confirm the rule, never report that the rule is wrong.
    ["DOUBLE-dash slug fires — the shape reality produces (C--Users-…)",
      fires('"project": "C--Users-someone-Documents-GitHub-Galerina"')],
    ["dash-encoded placeholder does NOT fire", !fires("the slug looks like C-Users-<name>-Documents")],
    // …and the widening must not cry wolf. A guard that fires on `<name>` placeholders or ordinary prose
    // teaches people to reach for the allow-marker, and a habit of allow-marking is how the next REAL
    // leak gets waved through. Silence cases are what make the widening safe to keep.
    ["DOUBLE-dash placeholder does NOT fire", !fires("the slug looks like C--Users-<name>-Documents")],
    ["prose 'Power-Users-Guide' does NOT fire", !fires("see the Power-Users-Guide-2026 appendix")],
    ["prose 'Power--Users-Guide' does NOT fire", !fires("see the Power--Users-Guide-2026 appendix")],
    ["tracked .codebase-memory dir fires", scanTrackedList([".codebase-memory/graph.db.zst"]).length === 1],
    ["tracked NESTED .codebase-memory fires", scanTrackedList(["packages-galerina/x/src/.codebase-memory/artifact.json"]).length === 1],
    ["tracked graph.db.zst anywhere fires", scanTrackedList(["some/dir/graph.db.zst"]).length === 1],
    ["ordinary tracked paths are silent", scanTrackedList(["docs/a.md", "build/kb-graph/foo.json", "src/codebase-memory-notes.md"]).length === 0],
  ];
  let ok = true;
  for (const [name, pass] of checks) { console.log(`  ${pass ? "✅" : "❌"} ${name}`); if (!pass) ok = false; }
  if (!ok) { console.error("  ❌ self-test FAILED — path-leak detectors are neutered"); process.exit(1); }
  console.log("  path-leak self-test: detectors fire on leaks, silent on clean input ✅");
}

if (process.argv.includes("--self-test")) { selfTest(); process.exit(0); }

const isBinary = (buf) => buf.subarray(0, 8000).includes(0);
const files = git("ls-files").split("\n").map((s) => s.trim()).filter(Boolean);
let leakFiles = 0, leakCount = 0;
const report = [];
// Structural pass FIRST: forbidden-to-track paths (content-independent, catches binaries).
for (const h of scanTrackedList(files)) {
  leakFiles++; leakCount++;
  report.push(`  ${h.rel}  [tracked-forbidden:${h.pattern}]  machine-local index artifact must not be tracked — git rm --cached it`);
}
for (const rel of files) {
  if (ALLOW_FILES.has(rel)) continue;
  const abs = join(ROOT, rel);
  if (!existsSync(abs)) continue;
  const buf = readFileSync(abs);
  if (isBinary(buf)) continue;
  const hits = scanText(buf.toString("utf8"));
  if (hits.length) {
    leakFiles++; leakCount += hits.length;
    for (const h of hits) report.push(`  ${rel}:${h.line}  [${h.pattern}]  ${h.text}`);
  }
}

if (leakCount) {
  console.error(`\n  ❌ path-leak: ${leakCount} absolute-local-path leak(s) across ${leakFiles} file(s):\n`);
  console.error(report.join("\n"));
  console.error(`\n  Fix: use a repo-relative path, \`~\`/\`$HOME\`, a runtime env READ (process.env.X —`);
  console.error(`  NOT a literal %USERPROFILE%), or a <placeholder>. A line that must quote the pattern to`);
  console.error(`  teach the rule can carry the marker "${ALLOW_MARKER}".`);
  process.exit(1);
}
// G0 — the green states its SURFACE, because the unqualified sentence was untrue this morning. "No
// absolute-local-path leaks" reads as "no leaks"; what it can ever mean is "none of the shapes I model".
// The dash-encoded rule modelled one dash where the encoder emits two, so this line printed a clean
// bill of health over a rule that matched nothing real — for as long as the rule had existed. Naming the
// modelled shapes is what lets the next reader notice one is missing, rather than trusting the tick.
console.log(`  ✅ path-leak: no absolute-local-path leaks across ${files.length} tracked files.`);
console.log(`     surface: ${PATTERNS.map((p) => p.name).join(" · ")}`);
console.log(`     …of the shapes modelled above ONLY — an unmodelled encoding is invisible here, not absent.`);
console.log(`     exclusions: binaries (scanned by path, not content) · lines marked "${ALLOW_MARKER}" · untracked files.`);

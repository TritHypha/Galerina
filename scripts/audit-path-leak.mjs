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
//   node scripts/audit-path-leak.mjs               # enforce over the whole tracked set: exit 1 on any leak
//   node scripts/audit-path-leak.mjs --staged      # PRE-COMMIT: scan only the staged index blobs (new files
//                                                  #   included) — the targeted check, same detectors, exit 1 on leak
//   node scripts/audit-path-leak.mjs --files a b   # scan only these files from the worktree (works pre-`git add`)
import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, dirname, resolve, basename, relative, isAbsolute } from "node:path";
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
        // ⚠ THE EVIDENCE MUST CONTAIN THE FINDING (R&D, 2026-07-17; mirrored). This printed
        // `lines[i].trim().slice(0, 160)` — the HEAD of the line, not the hit. On a long line the match
        // sits past char 160, so the gate said "leak at line N" and printed a sentence with no leak in
        // it. R&D caught it on live traffic: a real hit in an incoming note rendered as
        // "…6 repos · 151 tracked files · ZERO real l".
        //
        // That is WORSE THAN A MISS. A miss is silent; this actively teaches the reader the gate cries
        // wolf — and a gate nobody believes gets switched off, which is a fail-open through the reader
        // rather than through the code. It is also the same mistake one axis over: the scan's surface
        // was not HEAD, and the report's surface was not the finding's location.
        //
        // (I hit this output myself and reasoned past it — "the match must be further along the line" —
        // instead of asking why the evidence didn't contain the evidence. R&D ran it and fixed it.)
        const start = Math.max(0, m.index - 40);
        const end = Math.min(lines[i].length, m.index + m[0].length + 40);
        const snippet = (start > 0 ? "…" : "") + lines[i].slice(start, end).trim() + (end < lines[i].length ? "…" : "");
        hits.push({ line: i + 1, col: m.index + 1, pattern: p.name, text: snippet });
      }
    }
  }
  return hits;
}

const isBinary = (buf) => buf.subarray(0, 8000).includes(0);

// Normalise a CLI path arg (relative to CWD, or absolute) to a repo-relative, forward-slash key.
function toRel(p) {
  const abs = isAbsolute(p) ? p : resolve(process.cwd(), p);
  return relative(ROOT, abs).split("\\").join("/");
}

// Pure scanner over an EXPLICIT target list — each target carries a lazy `read()` returning its bytes (or
// null if unreadable). Reuses the SAME detectors as the full scan (scanTrackedList structural + scanText
// content), so a targeted / pre-commit check can never model fewer shapes than the CI gate — that parity is
// the whole point: it is what makes `--files`/`--staged` the REAL gate, not a hand-rolled regex that misses
// the `<name>` placeholder or the dash-slug. Returns counts + report lines; the caller decides how to exit.
export function scanTargets(targets) {
  let leakFiles = 0, leakCount = 0;
  const report = [];
  for (const h of scanTrackedList(targets.map((t) => t.rel))) {
    leakFiles++; leakCount++;
    report.push(`  ${h.rel}  [tracked-forbidden:${h.pattern}]  machine-local index artifact must not be tracked — git rm --cached it`);
  }
  for (const { rel, read } of targets) {
    if (ALLOW_FILES.has(rel)) continue;
    let buf; try { buf = read(); } catch { buf = null; }
    if (!buf || isBinary(buf)) continue;
    const hits = scanText(buf.toString("utf8"));
    if (hits.length) {
      leakFiles++; leakCount += hits.length;
      for (const h of hits) report.push(`  ${rel}:${h.line}:${h.col}  [${h.pattern}]  ${h.text}`);
    }
  }
  return { leakFiles, leakCount, report };
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
    // ★ SUBJECT case (R&D 2026-07-17): the verdict names its tree, by BASENAME, and that stays a
    // basename. This line is the most-pasted string the tool emits; an absolute path here would put a
    // machine path into every terminal, CI log and bug report quoting a green — the leak this guard
    // exists to prevent, laundered through the guard. Asserted so nobody "improves" it to a full path.
    ["★ subject: the verdict names its tree by BASENAME and leaks no absolute path",
      (() => {
        const line = `  ✅ path-leak [${basename(ROOT)}/]: no absolute-local-path leaks.`;
        return line.includes("[Galerina/]") && scanText(line).length === 0 && !/[A-Za-z]:[\\/]/.test(line);
      })()],
    ["★ subject: the outside-the-tree warning itself carries no absolute path either",
      (() => {
        const warn = `     ⚠ run from ${basename("/some/other/repo")}/, OUTSIDE the tree named above. it scanned ${basename(ROOT)}/, NOT your current directory.`;
        return scanText(warn).length === 0 && !/[A-Za-z]:[\\/]/.test(warn);
      })()],
    // ★ REPORT case (R&D 2026-07-17): the evidence must CONTAIN the finding. A true hit whose printed
    // snippet has no leak in it reads as a false positive, and a gate nobody believes gets switched off.
    ["★ report: a leak past char 160 is SHOWN — the old slice(0,160) printed a line head with no hit in it",
      (() => {
        const long = "x".repeat(200) + " C--Users-someone-Documents-GitHub";
        const h = scanText(long);
        return h.length === 1 && h[0].text.includes("C--Users-someone") && h[0].col > 160;
      })()],
    // ★ SURFACE cases (R&D 2026-07-17) — these pin the fail-open where the guard printed a count it had
    // not read. Every case above tests a PATTERN; these test WHAT GETS SCANNED, which is the axis that
    // was actually broken. A ruleset can be perfect and still never be shown the file.
    ["★ surface: a tracked-but-DELETED file is STILL read, from HEAD (the KB's skipped private key)",
      JSON.stringify(planScanTargets(["k.env"], new Set(["k.env"]), () => false)) === JSON.stringify([{ rel: "k.env", from: "HEAD" }])],
    ["★ surface: a DIRTY file is read BOTH ways — a tidy worktree must not vouch for HEAD",
      JSON.stringify(planScanTargets(["d.md"], new Set(["d.md"]), () => true)) === JSON.stringify([{ rel: "d.md", from: "worktree" }, { rel: "d.md", from: "HEAD" }])],
    ["★ surface: an unmodified file is read ONCE from the worktree (worktree == HEAD, so that IS HEAD)",
      JSON.stringify(planScanTargets(["c.md"], new Set(), () => true)) === JSON.stringify([{ rel: "c.md", from: "worktree" }])],
    ["★ surface: an allowlisted file is planned for NOTHING (and is declared in the green)",
      planScanTargets([...ALLOW_FILES][0] ? [[...ALLOW_FILES][0]] : ["scripts/audit-path-leak.mjs"], new Set(), () => true).length === 0],
    // ★ TARGETED modes (--files/--staged, 2026-07-18): the pre-commit surface must run the SAME detectors, so
    // a brand-new file — invisible to the tracked scan until `git add` (the SCAN-AFTER-ADD trap above) — is
    // checkable BEFORE it lands, which is exactly when a hand-rolled regex gets reached for and misses the
    // `<name>` placeholder / dash-slug. scanTargets is the shared core; these pin it fires, stays silent on a
    // placeholder, and honours allow / never-tracked identically to the full scan.
    ["★ targeted: a --files target with a real leak fires",
      scanTargets([{ rel: "x.ts", read: () => Buffer.from("root = C:\\Users\\real\\dev") }]).leakCount === 1],
    ["★ targeted: a clean --files target is silent",
      scanTargets([{ rel: "x.ts", read: () => Buffer.from("import y from './y'") }]).leakCount === 0],
    ["★ targeted: a `<name>` placeholder in a target does NOT fire (the false-positive that started this)",
      scanTargets([{ rel: "x.ts", read: () => Buffer.from("a hardcoded C:\\Users\\<name>\\x breaks") }]).leakCount === 0],
    ["★ targeted: an unreadable target is skipped, not crashed",
      scanTargets([{ rel: "gone.ts", read: () => { throw new Error("ENOENT"); } }]).leakCount === 0],
    ["★ targeted: an allowlisted target is not scanned",
      scanTargets([{ rel: [...ALLOW_FILES][0], read: () => Buffer.from("C:\\Users\\real\\x") }]).leakCount === 0],
    ["★ targeted: a NEVER_TRACKED target fires structurally (no read needed)",
      scanTargets([{ rel: "pkg/x/.codebase-memory/a.json", read: () => Buffer.from("{}") }]).leakCount === 1],
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

// ── targeted pre-commit modes (2026-07-18): scan exactly what you're ABOUT to commit, with the SAME detectors ──
// The default scan reads the whole tracked set (the CI surface). But a brand-new file is untracked until
// `git add` (the SCAN-AFTER-ADD trap above), so a pre-commit leak-check reached for an ad-hoc regex — which
// missed the `<name>` placeholder and the dash-slug the real detectors handle. These modes run scanTargets
// (the shared core), so the REAL gate is the pre-commit gate, never a hand-rolled one:
//   --staged            scan the STAGED index blobs (what WILL be committed), including new staged files
//   --files <p> [<p>…]  scan the given files from the worktree (works pre-`git add`; repo-relative or absolute)
if (process.argv.includes("--staged") || process.argv.includes("--files")) {
  const stagedMode = process.argv.includes("--staged");
  let targets;
  if (stagedMode) {
    // --diff-filter=d drops staged DELETIONS (no blob to read); the rest carry a `:path` index blob.
    const staged = git("diff", "--cached", "--name-only", "--diff-filter=d").split("\n").map((s) => s.trim()).filter(Boolean);
    targets = staged.map((rel) => ({ rel, read: () => { try { return execFileSync("git", ["show", `:${rel}`], { cwd: ROOT, windowsHide: true, maxBuffer: 64 * 1024 * 1024 }); } catch { return null; } } }));
  } else {
    const fi = process.argv.indexOf("--files");
    const paths = process.argv.slice(fi + 1).filter((a) => !a.startsWith("-"));
    if (!paths.length) { console.error("  --files needs at least one path (repo-relative or absolute)"); process.exit(2); }
    targets = paths.map((p) => { const rel = toRel(p); return { rel, read: () => existsSync(join(ROOT, rel)) ? readFileSync(join(ROOT, rel)) : null }; });
  }
  const label = stagedMode ? "staged" : "files";
  const { leakFiles, leakCount, report } = scanTargets(targets);
  if (leakCount) {
    console.error(`\n  ❌ path-leak [--${label}]: ${leakCount} leak(s) across ${leakFiles} of ${targets.length} target(s):\n`);
    console.error(report.join("\n"));
    console.error(`\n  Fix: a repo-relative path, ~/$HOME, a runtime env READ (process.env.X — NOT a literal %USERPROFILE%),`);
    console.error(`  or a <placeholder>. A line that must quote the pattern to teach the rule can carry "${ALLOW_MARKER}".`);
    process.exit(1);
  }
  console.log(`  ✅ path-leak [--${label}]: no leaks in ${targets.length} target(s).`);
  console.log(`     shapes: ${PATTERNS.map((p) => p.name).join(" · ")} …of those shapes ONLY (an unmodelled encoding is invisible here).`);
  process.exit(0);
}

/**
 * Decide WHAT to scan and FROM WHERE. The index and the working tree are two different snapshots:
 * `git ls-files` enumerates the INDEX, `readFileSync` reads the DISK. For an unmodified file they agree
 * — so reading the disk IS reading HEAD — and for a file that is dirty or tracked-but-deleted they do not.
 *
 * ⚠ THIS FUNCTION EXISTS BECAUSE OF A MEASURED FAIL-OPEN (R&D, 2026-07-17; mirrored here). The old loop
 * enumerated the index and then did `if (!existsSync(abs)) continue`, silently DROPPING every
 * tracked-but-absent file while the summary still counted it. Measured across both repos:
 *     KB:       1303 tracked | 1 tracked-but-ABSENT -> silently skipped | 3 dirty
 *     Galerina: 3779 tracked | 0 tracked-but-ABSENT                     | 1 dirty
 * The one file the KB's copy declined to read was its tracked PRIVATE SIGNING KEY — a guard whose entire
 * job is "no committed file may leak the developer's machine", printing green over 1302 of 1303 files,
 * the missing one being the highest-value asset in the tree. Green because it wasn't looking.
 *
 * Galerina had 0 tracked-but-absent files, so it was not silently skipping anything TODAY. That is luck,
 * not correctness: the same `if (!existsSync) continue` sat here, and the same working-tree read meant a
 * leak committed at HEAD but tidied on disk would report GREEN. Fixed on the structure, not the symptom.
 *
 * A leak is what is COMMITTED, so HEAD is the authoritative surface. The working tree is scanned too, so
 * a leak is caught BEFORE it lands rather than only after. Where the snapshots differ, BOTH are read —
 * a tidy working tree does not get to vouch for HEAD.
 *
 * Pure + injected `exists` so the surface is testable rather than an `if` buried in a loop.
 */
export function planScanTargets(tracked, dirty, exists) {
  const plan = [];
  for (const rel of tracked) {
    if (ALLOW_FILES.has(rel)) continue;
    if (exists(rel)) plan.push({ rel, from: "worktree" });
    if (dirty.has(rel)) plan.push({ rel, from: "HEAD" }); // dirty includes tracked-but-DELETED
  }
  return plan;
}

const files = git("ls-files").split("\n").map((s) => s.trim()).filter(Boolean);
// `git diff --name-only HEAD` reports DIRTY *and* tracked-but-DELETED paths — the two cases where the
// index and the working tree disagree, and the only cases where reading the disk is not reading HEAD.
const dirty = new Set(git("diff", "--name-only", "HEAD").split("\n").map((s) => s.trim()).filter(Boolean));
let leakFiles = 0, leakCount = 0;
const report = [];
// Structural pass FIRST: forbidden-to-track paths (content-independent, catches binaries).
for (const h of scanTrackedList(files)) {
  leakFiles++; leakCount++;
  report.push(`  ${h.rel}  [tracked-forbidden:${h.pattern}]  machine-local index artifact must not be tracked — git rm --cached it`);
}
let readWorktree = 0, readHead = 0, skippedBinary = 0;
for (const { rel, from } of planScanTargets(files, dirty, (r) => existsSync(join(ROOT, r)))) {
  let buf;
  if (from === "worktree") {
    buf = readFileSync(join(ROOT, rel));
  } else {
    // In HEAD but not on disk, or on disk but DIFFERENT from HEAD. A leak is what is COMMITTED.
    try {
      buf = execFileSync("git", ["show", `HEAD:${rel}`], { cwd: ROOT, windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
    } catch {
      continue; // staged-new: no HEAD blob exists yet, and the worktree pass already read it
    }
  }
  if (isBinary(buf)) { skippedBinary++; continue; }
  from === "worktree" ? readWorktree++ : readHead++;
  const hits = scanText(buf.toString("utf8"));
  if (hits.length) {
    leakFiles++; leakCount += hits.length;
    // Label the snapshot: a HEAD-only hit is INVISIBLE on disk, and a reader told to "fix line 22" of a
    // file that looks clean will conclude the guard is broken rather than that HEAD is dirty.
    const tag = from === "HEAD" ? " [in HEAD, not on disk]" : "";
    for (const h of hits) report.push(`  ${rel}:${h.line}:${h.col}${tag}  [${h.pattern}]  ${h.text}`);
  }
}

/**
 * ★ A VERDICT WITH NO SUBJECT IS ONE MISLABEL AWAY FROM FICTION (R&D's framing, 2026-07-17; mirrored).
 *
 * This gate is cwd-INDEPENDENT: ROOT comes from the script's own location and git runs with `cwd: ROOT`,
 * so `node <path>/audit-path-leak.mjs` scans THAT repo from anywhere. The convention is arguably right —
 * it is what a CI job wants — and the gate was never wrong. THE DEFECT WAS THAT IT NEVER SAID SO. I ran
 * `cd $repo && node <this gate>` across six sibling repos and got six confident greens, every one about
 * Galerina, and labelled them with the other repos' names. The only reason that table did not ship is
 * that six repos sharing one file count is arithmetically impossible. Had the counts been plausible it
 * would have been a fabrication, and R&D reproduced the same trap in their copy without doing anything
 * careless. So: the verdict names its subject, and running from outside that tree says so out loud.
 *
 * ★ BASENAME, NEVER AN ABSOLUTE PATH — and this is the part to not "improve" later. The verdict is the
 * most-pasted string this tool emits: terminals, CI logs, bug reports. Printing `C:\\Users\\<name>\\…`
 * would put a machine path into every one of them — the exact leak this guard exists to prevent,
 * laundered THROUGH the guard. The proof is one day old: the report announcing the dash-fix leaked the
 * owner's username because probe output was pasted verbatim. The self-test asserts this carries no
 * absolute path.
 */
const subject = basename(ROOT);
const cwdRel = relative(ROOT, process.cwd());
// SEGMENTS, not string prefixes: `Galerina-archive` is NOT inside `Galerina`, and a naive startsWith
// says it is. Same predicate as escapesRoot — it is the same prefix trap, one axis over.
const cwdOutsideTree = cwdRel.startsWith("..") || isAbsolute(cwdRel);
const outsideNote = cwdOutsideTree
  ? `\n     ⚠ run from ${basename(process.cwd())}/, OUTSIDE the tree named above. This gate is cwd-independent:` +
    `\n       it scanned ${subject}/, NOT your current directory. To scan ${basename(process.cwd())}/, use that repo's own guard.`
  : "";

if (leakCount) {
  console.error(`\n  ❌ path-leak [${subject}/]: ${leakCount} absolute-local-path leak(s) across ${leakFiles} file(s):${outsideNote}\n`);
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
// ★ REPORT WHAT WAS READ, NOT WHAT WAS COUNTED — that gap WAS the bug. The old line printed
// `files.length` (the INDEX) while the loop had read only the subset that existed on disk, so "no leaks
// across 1303 tracked files" meant "across the 1302 I actually opened" and nothing said which. The KB's
// missing one was its private signing key. Two numbers that must agree, printed apart, is a lie waiting
// to happen; printed together, it is arithmetic a reader can check.
console.log(`  ✅ path-leak [${subject}/]: no absolute-local-path leaks.${outsideNote}`);
console.log(`     read: ${readWorktree} working-tree file(s) + ${readHead} committed blob(s) where HEAD differs from disk, of ${files.length} tracked.`);
console.log(`     shapes: ${PATTERNS.map((p) => p.name).join(" · ")}`);
console.log(`     …of those shapes ONLY — an unmodelled encoding is INVISIBLE here, not absent.`);
console.log(`     NOT examined: ${skippedBinary} binary file(s) (the structural pass covers the forbidden ones),`);
console.log(`     ${ALLOW_FILES.size} allowlisted file(s), lines marked "${ALLOW_MARKER}", untracked files, and every commit before HEAD.`);

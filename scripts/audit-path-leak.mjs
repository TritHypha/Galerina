#!/usr/bin/env node
// audit-path-leak.mjs — fail-CLOSED guard: no committed file may contain an ABSOLUTE LOCAL path that
// leaks the developer's machine. Galerina is a PUBLIC repo; a path like `C:\Users\<name>\...` or a
// `wwwprojects\...` root discloses the OS username + on-disk layout to the world AND breaks on every
// other machine. Scans git-tracked text files (skips binaries), honors an allowlist (this tool + any
// line that must quote the pattern to explain the rule, via an inline marker). `--self-test` proves the
// detectors still fire before the enforcing scan — a neutered guard is itself a fail-open.
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
  // The retired `wwwprojects` projects root, in path position (drive-prefixed or followed by a separator).
  { name: "wwwprojects-path", re: /(?:[A-Za-z]:[\\/]{1,2}wwwprojects|wwwprojects[\\/])/g },
];

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
    ["bare 'wwwprojects' word in prose does NOT fire", !fires("migrated the wwwprojects layout")],
    ["'C:\\Users\\<name>' placeholder does NOT fire", !fires("a hardcoded C:\\Users\\<name>\\x breaks")],
    ["allow-marker suppresses", !fires("example C:\\Users\\x  (path-leak-audit:allow)")],
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
  console.error(`\n  Fix: use a repo-relative path, ~ / $HOME / %USERPROFILE%, an env var, or a <placeholder>.`);
  console.error(`  A line that must quote the pattern to teach the rule can carry the marker "${ALLOW_MARKER}".`);
  process.exit(1);
}
console.log(`  ✅ path-leak: no absolute-local-path leaks across ${files.length} tracked files.`);

#!/usr/bin/env node
// audit-doc-drift.mjs — DOC-004 (#219 standard "doc↔source drift"). v1: flag doc "living metrics" — global
// test/package COUNTS — that disagree with the authoritative version.json auto-emit (the #1 stale class the
// 2026-06-22 % audit found). Low-noise: only GLOBAL-context counts (a line that also says packages/suite/total),
// and lines tagged historical (change-log/snapshot/superseded/→/~~/was) are exempt.
//
// --soft = report-only (exit 0). Prints `VIOLATIONS: N` for the lint-conventions umbrella. Run from repo root.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const soft = process.argv.includes("--soft");
const asJson = process.argv.includes("--json");

let ver = {};
try { ver = JSON.parse(readFileSync(join(ROOT, "version.json"), "utf8")); } catch { /* no authority → report nothing */ }
const TESTS = ver.testCount;     // authoritative global test count
const PKGS = ver.packageCount;   // authoritative package count

// lines exempt as legitimately historical (not a current claim)
const HISTORICAL = /change.?log|history|snapshot|superseded|deprecated|\bprior\b|\bwas\b|→|->|~~|verified:/i;
// a "X tests" count is only treated as the GLOBAL count when its line is global-context (else it's per-package)
const GLOBAL_CTX = /packages|full suite|whole suite|\btotal\b|all tests|aggregate/i;

// A doc whose FILENAME carries a date (galerina-*-YYYY-MM-DD.md) is a point-in-time SNAPSHOT — its counts are
// historical by construction, so it is exempt. Only LIVING docs (no date in the name) must stay current.
const DATED = /-\d{4}-\d{2}-\d{2}\.md$/;
// The KB corpus lives in the sibling ZTF-Knowledge-Bases repo (docs/Knowledge-Bases migrated there) —
// resolve like kb-index.mjs (GALERINA_KB_DIR override first). Scan its ROOT flat: the living SOT docs
// sit there; subdirs (rd-absorbed/ …) are historical by construction. A missing corpus is a VIOLATION,
// not silence — this audit once silently lost its whole corpus to a fail-open catch{} here.
const KB = process.env.GALERINA_KB_DIR || join(ROOT, "..", "ZTF-Knowledge-Bases");
const files = [];
let kbUnreadable = false;
try { for (const f of readdirSync(KB)) if (f.endsWith(".md") && !DATED.test(f)) files.push({ p: join(KB, f), rel: `KB/${f}` }); } catch { kbUnreadable = true; }
for (const f of ["README.md", "AGENTS.md", "CHANGELOG.md"]) files.push({ p: join(ROOT, f), rel: f });

const hits = [];
if (kbUnreadable) hits.push({ rel: KB, line: 0, kind: "kb-corpus", claim: "KB corpus missing/unreadable", authoritative: "sibling ZTF-Knowledge-Bases (or GALERINA_KB_DIR) must be scannable — fail-closed" });
for (const { p, rel } of files) {
  let lines;
  try { lines = readFileSync(p, "utf8").split(/\r?\n/); } catch { continue; }
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (HISTORICAL.test(line)) continue;
    const pk = line.match(/\b(\d+)\s*\/\s*(\d+)\s+packages\b/);
    if (pk && PKGS != null && Number(pk[2]) !== PKGS) {
      hits.push({ rel, line: i + 1, kind: "packages", claim: pk[0].trim(), authoritative: `${PKGS} packages` });
    }
    if (TESTS != null && GLOBAL_CTX.test(line)) {
      const ts = line.match(/\b([\d,]{3,})\s+tests\b/); // 3+ digits → a global count, not "5 tests"
      if (ts) { const n = Number(ts[1].replace(/,/g, "")); if (n !== TESTS) hits.push({ rel, line: i + 1, kind: "tests", claim: ts[0].trim(), authoritative: `${TESTS} tests` }); }
    }
  }
}

const out = [`# DOC-004 doc↔source drift — count claims vs version.json (tests=${TESTS ?? "?"}, packages=${PKGS ?? "?"})\n`];
out.push(`## Drifted count claims (${hits.length})`);
for (const h of hits) out.push(`  ${h.rel}:${h.line}  [${h.kind}]  "${h.claim}"  ≠ authoritative ${h.authoritative}`);
out.push(`\nVIOLATIONS: ${hits.length}`);
console.log(asJson ? JSON.stringify({ tool: "doc-drift", testsAuthority: TESTS, packagesAuthority: PKGS, drift: hits }, null, 2) : out.join("\n"));
process.exit(soft ? 0 : Math.min(hits.length, 250));

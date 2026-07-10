#!/usr/bin/env node
// =============================================================================
// cli.ts — galerina-fungi-scan
//   node dist/cli.js [--root <dir>] [--json] [--strict] [--quiet]
//
//   default : scan corpus, print summary, write build/fungi-scan/{FUNGI-SCAN.md,fungi-scan.json}
//   --json  : print full JSON to stdout instead of the summary (still writes files)
//   --strict: exit 1 if the RUNTIME corpus has any migration finding
//             (missing/invalid @version, legacy ops/idents, match without _,
//             unreadable or unlexable file). Test-corpus is exempt by design.
// =============================================================================

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { scanCorpus } from "./scanner.js";
import { buildRollup, renderConsole, renderMarkdown } from "./report.js";

function findRepoRoot(start: string): string {
  let dir = resolve(start);
  for (let i = 0; i < 12; i++) {
    if (existsSync(join(dir, "galerina.workspace.json"))) return dir; // perf-allow: loop-sync-io — one-shot workspace-root walk-up at CLI startup (bounded 12 levels), distinct path per iteration
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  // fail-closed: refuse to scan an unknown tree rather than silently scanning cwd
  throw new Error(
    `galerina-fungi-scan: could not locate galerina.workspace.json above ${start} — pass --root <repo-root>`,
  );
}

const args = process.argv.slice(2);
const flag = (name: string): boolean => args.includes(name);
const opt = (name: string): string | null => {
  const i = args.indexOf(name);
  return i >= 0 && i + 1 < args.length ? (args[i + 1] ?? null) : null;
};

const root = opt("--root") ?? findRepoRoot(process.cwd());
const scan = scanCorpus(root);
const rollup = buildRollup(scan);

const outDir = join(root, "build", "fungi-scan");
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "FUNGI-SCAN.md"), renderMarkdown(scan, rollup));
writeFileSync(join(outDir, "fungi-scan.json"), JSON.stringify({ rollup, files: scan.files }, null, 2));

if (flag("--json")) {
  console.log(JSON.stringify({ rollup, files: scan.files }, null, 2));
} else if (!flag("--quiet")) {
  console.log(renderConsole(rollup));
  console.log(`  report → build/fungi-scan/FUNGI-SCAN.md`);
}

if (flag("--strict") && rollup.strict.length > 0) {
  console.error(`fungi-scan --strict: ${rollup.strict.length} runtime-corpus migration finding(s) — FAIL (fail-closed)`);
  process.exit(1);
}

/**
 * snapshot.mjs — archive the current benchmark run for later trend comparison.
 * Copies results/latest.json + report.md into results/archive/<date>_<label>/ with
 * a meta.json (machine, git, node, unit-check status). Usage:
 *   npm run snapshot -- <label>      e.g.  extended | baseline | post-wasm
 * Refuses to overwrite an existing snapshot (pick a different label).
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import os from "node:os";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const root = join(__dirname, "..");
const resultsDir = join(root, "results");

const label = process.argv[2];
if (!label) { console.error("usage: npm run snapshot -- <label>   (e.g. extended, baseline, post-wasm)"); process.exit(2); }

const latest = join(resultsDir, "latest.json");
if (!existsSync(latest)) { console.error("no results/latest.json — run `npm run run` (full) first"); process.exit(2); }

const date = new Date().toISOString().slice(0, 10);
const dir = join(resultsDir, "archive", `${date}_${label}`);
if (existsSync(dir)) { console.error(`snapshot already exists: ${dir} — pick a different label`); process.exit(1); }
mkdirSync(dir, { recursive: true });

copyFileSync(latest, join(dir, "results.json"));
const report = join(root, "report.md");
if (existsSync(report)) copyFileSync(report, join(dir, "report.md"));

const d = JSON.parse(readFileSync(latest, "utf8"));
let git = {};
try {
  git = {
    commit: execSync("git rev-parse --short HEAD", { cwd: root }).toString().trim(),
    branch: execSync("git branch --show-current", { cwd: root }).toString().trim(),
  };
} catch { /* not a git repo / git unavailable */ }

const meta = {
  label, date, capturedAt: new Date().toISOString(),
  git, node: process.version,
  os: { platform: os.platform(), release: os.release() },
  cpu: os.cpus()[0].model.trim(), cores: os.cpus().length, totalMemGB: Math.round(os.totalmem() / 1e9),
  benchmarks: d.length,
  comparable: d.filter(b => b.units && b.units.comparable !== false).map(b => b.benchmark),
  excluded: d.filter(b => b.units && b.units.comparable === false).map(b => b.benchmark),
  unitCheck: Object.fromEntries(d.filter(b => b.units).map(b => [b.benchmark, b.units.status])),
};
writeFileSync(join(dir, "meta.json"), JSON.stringify(meta, null, 2));

console.log(`✅ snapshot saved: results/archive/${date}_${label}/`);
console.log(`   ${meta.benchmarks} benchmarks · ${meta.cpu} (${meta.cores}c) · git ${git.commit || "?"}`);
console.log(`   compare later: diff results.json vs another snapshot by benchmark normThroughput (same machine only).`);

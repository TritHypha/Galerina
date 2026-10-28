#!/usr/bin/env node
// OPEN-S5-1 test census for packages-ts/galerina-framework-app-kernel.
// Runs every tests/*.test.mjs file on its own (node --test, TAP reporter, concurrency 1)
// and records the TAP summary counters per file, so two runs (two hosts, two checkouts,
// two platforms) can be diffed file by file instead of comparing one grand total.
//
// Usage: node s5-app-kernel-test-census.mjs [--json out.json] [--label name] [--only a,b]
// Synthetic data only; the suites themselves create and remove their own temp dirs.
import { spawnSync } from "node:child_process";
import { readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { platform, release } from "node:os";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..", "..", "..", "..");
const PKG = join(ROOT, "packages-ts", "galerina-framework-app-kernel");
const COUNTERS = ["tests", "suites", "pass", "fail", "cancelled", "skipped", "todo"];

export function parseTapSummary(out) {
  const summary = {};
  for (const k of COUNTERS) {
    const m = out.match(new RegExp(`^# ${k} (\\d+)\\s*$`, "m"));
    summary[k] = m ? Number(m[1]) : null;
  }
  // Leaf test names (any depth) so a +1/-1 can be pinned to one test, not one file.
  const names = [...out.matchAll(/^\s*(ok|not ok) \d+ - (.+?)(?: # (SKIP|TODO).*)?$/gm)]
    .map((m) => ({ status: m[1] === "ok" ? (m[3] ?? "ok") : "not ok", name: m[2].trim() }));
  return { summary, names };
}

export function listTestFiles(dir = join(PKG, "tests")) {
  return readdirSync(dir).filter((f) => f.endsWith(".test.mjs")).sort();
}

function runOne(file) {
  const t0 = Date.now();
  const r = spawnSync(process.execPath, ["--test", "--test-reporter=tap", "--test-concurrency=1", join("tests", file)], {
    cwd: PKG, encoding: "utf8", timeout: 1_200_000, maxBuffer: 64 * 1024 * 1024,
  });
  const out = `${r.stdout ?? ""}${r.stderr ?? ""}`;
  const { summary, names } = parseTapSummary(out);
  return { file, ms: Date.now() - t0, status: r.status, timedOut: r.error?.code === "ETIMEDOUT", summary, names };
}

function main() {
  const args = process.argv.slice(2);
  const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
  const only = opt("--only")?.split(",");
  const files = listTestFiles().filter((f) => !only || only.includes(f));
  const rows = [];
  for (const f of files) {
    const row = runOne(f);
    rows.push(row);
    const s = row.summary;
    console.log(`${f} tests=${s.tests} pass=${s.pass} fail=${s.fail} skipped=${s.skipped} todo=${s.todo} ms=${row.ms}`);
  }
  const total = {};
  for (const k of COUNTERS) total[k] = rows.reduce((a, r) => a + (r.summary[k] ?? 0), 0);
  const report = {
    tool: "s5-app-kernel-test-census", label: opt("--label") ?? null,
    node: process.version, platform: platform(), osRelease: release(),
    files: rows.length, total, rows,
  };
  console.log(`TOTAL files=${rows.length} tests=${total.tests} pass=${total.pass} fail=${total.fail} skipped=${total.skipped} todo=${total.todo}`);
  const out = opt("--json");
  if (out) { mkdirSync(dirname(resolve(out)), { recursive: true }); writeFileSync(out, JSON.stringify(report, null, 2) + "\n"); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
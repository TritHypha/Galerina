#!/usr/bin/env node
// =============================================================================
// build-chart.mjs — the ONE-SHOT benchmark UI builder (owner 2026-07-19: "collect data,
// put it into the builder tool and boom chart, no messing around thinking each time").
//
// From the current results/latest.json it regenerates, in order:
//   1. report.md                     (compare.mjs — the per-metric tables the integrity gate checks)
//   2. benchmark-report-latest.{md,json} + benchmark-chart-latest.html  (report.mjs → chart.mjs)
//   3. benchmark-chart-standalone.html  — the SAME chart with NO <!doctype> prefix, ready to publish
//      as an artifact or embed directly (no strip step).
//
// The chart's first/standard view is "every runtime relative to WASM" (WASM = 0, faster = +,
// slower = −, one tramlined lane per test), on a committed dark ground so it is legible on any page.
//
//   node src/build-chart.mjs         # from existing latest.json  ← the "boom" command
//   npm run ui                       # same
//   npm run ui:full                  # run the full benchmark first, then build   (multi-minute)
// =============================================================================
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const run = (args) => {
  const r = spawnSync(process.execPath, args, { cwd: ROOT, encoding: "utf8", maxBuffer: 40 * 1024 * 1024 });
  if (r.status !== 0) { process.stderr.write(r.stderr || ""); console.error(`[build-chart] ${args.join(" ")} failed`); process.exit(r.status || 1); }
  return r.stdout;
};

// 1. report.md via compare.mjs — written as UTF-8 by node (a shell `>` redirect is UTF-16 on Windows,
//    which the integrity gate's byte comparison would then reject).
writeFileSync(join(ROOT, "report.md"), run(["src/compare.mjs"]));
// 2. report + chart (report.mjs calls chart.mjs as its last step).
run(["src/report.mjs"]);
// 3. artifact-ready standalone: the same self-contained chart, doctype stripped so it publishes/embeds directly.
const full = readFileSync(join(ROOT, "results/benchmark-chart-latest.html"), "utf8");
const frag = full.replace(/^<!doctype html><meta[^>]*><title>[^<]*<\/title>/i, "<title>Galerina benchmark — runtimes vs the WASM baseline</title>");
writeFileSync(join(ROOT, "results/benchmark-chart-standalone.html"), frag);

console.log("✅ benchmark UI built:");
console.log("   results/benchmark-chart-latest.html       (open in a browser)");
console.log("   results/benchmark-chart-standalone.html   (publish as an artifact / embed — no strip step)");
console.log("   report.md + benchmark-report-latest.{md,json}  regenerated (integrity-gate fresh)");

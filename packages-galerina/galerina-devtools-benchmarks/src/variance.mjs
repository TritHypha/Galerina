#!/usr/bin/env node
/**
 * src/variance.mjs — benchmark NOISE-BAND characterization (RD benchmark-isolation Step 1).
 *
 * Runs one or more benchmarks N times as fresh processes (each spawn is exactly what
 * `npm run run -- --benchmark <id>` does), then reports per-runtime mean ± stdev + CV% +
 * min/max/spread% of `execMs` (the universal timing metric) — so a single-run "regression"
 * can be judged against that bench's OWN run-to-run noise band.
 *
 *   Rule of thumb: if a reported %-change is inside the bench's CV/spread band, it is NOISE,
 *   not a regression. A real regression is a shift LARGER than the noise band and one-directional.
 *
 * Black-box by design: it does NOT import the runner (whose main() self-executes); it spawns
 * `node --expose-gc runner.mjs --benchmark <id>` and reads results/latest.json after each run.
 *
 * Usage:
 *   node src/variance.mjs --benchmark text-html --benchmark six-digit-guess --repeat 10 [--quick]
 * Options: --benchmark <id> (repeatable) · --repeat N (default 10, min 2) · --quick (passthrough)
 */
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const runnerPath = join(__dirname, "runner.mjs");
const latestPath = join(__dirname, "..", "results", "latest.json");
const outPath = join(__dirname, "..", "results", "variance-latest.json");

const argv = process.argv.slice(2);
const benches = argv.reduce((a, x, i) => (x === "--benchmark" && argv[i + 1] ? [...a, argv[i + 1]] : a), []);
const repIdx = argv.indexOf("--repeat");
const N = repIdx >= 0 ? Math.max(2, parseInt(argv[repIdx + 1], 10) || 10) : 10;
const quick = argv.includes("--quick");
if (!benches.length) {
  console.error("usage: node src/variance.mjs --benchmark <id> [--benchmark <id2>] --repeat N [--quick]");
  process.exit(1);
}

/** Sample stats: mean, population stdev, CV% (stdev/mean), min/max, spread% ((max-min)/mean). */
function stats(xs) {
  const n = xs.length;
  const mean = xs.reduce((s, b) => s + b, 0) / n;
  const stdev = Math.sqrt(xs.reduce((s, b) => s + (b - mean) ** 2, 0) / n);
  const min = Math.min(...xs), max = Math.max(...xs);
  return {
    n, mean, stdev,
    cvPct: mean ? (stdev / mean) * 100 : 0,
    min, max,
    spreadPct: mean ? ((max - min) / mean) * 100 : 0,
  };
}

const acc = {}; // acc[bench][runtime] = { execMs:[], normThroughput:[], opsPerSec:[] }
for (const bench of benches) {
  acc[bench] = {};
  let ok = 0;
  for (let i = 0; i < N; i++) {
    process.stdout.write(`  ${bench}: run ${i + 1}/${N}...\r`);
    const r = spawnSync("node", ["--expose-gc", runnerPath, "--benchmark", bench, ...(quick ? ["--quick"] : [])],
      { encoding: "utf8", timeout: 300000, maxBuffer: 32 * 1024 * 1024 });
    // latest.json is written BEFORE the runner's unit-alignment check may set exitCode=1,
    // so read it regardless of exit status; only skip if it truly did not produce output.
    let data;
    try { data = JSON.parse(readFileSync(latestPath, "utf8")); } catch { data = null; }
    const entry = data?.find((d) => d.benchmark === bench);
    if (!entry) { console.error(`\n  run ${i + 1}: no result (status ${r.status}) ${r.stderr?.slice(0, 160) ?? ""}`); continue; }
    ok++;
    for (const [rt, res] of Object.entries(entry.results ?? {})) {
      if (!res || typeof res !== "object" || res.error) continue;
      // Unify to one timing scalar per runtime. galerina* report top-level execMs;
      // node/python/rust/wasm report a nested results{} of micro-benches → sum their elapsedMs.
      let primaryMs = null;
      if (typeof res.execMs === "number") primaryMs = res.execMs;
      else if (typeof res.elapsedMs === "number") primaryMs = res.elapsedMs;
      else if (res.results && typeof res.results === "object") {
        const sub = Object.values(res.results).map((s) => s?.elapsedMs).filter((x) => typeof x === "number");
        if (sub.length) primaryMs = sub.reduce((a, b) => a + b, 0);
      }
      if (primaryMs === null) continue;
      (acc[bench][rt] ??= { primaryMs: [] }).primaryMs.push(primaryMs);
    }
  }
  console.log(`  ${bench}: ${ok}/${N} runs captured.                    `);
}

const report = {};
for (const [bench, runtimes] of Object.entries(acc)) {
  report[bench] = {};
  console.log(`\n=== ${bench} — run-to-run noise band over ${N} runs (metric: execMs) ===`);
  console.log(`  ${"runtime".padEnd(18)} ${"mean(ms)".padStart(11)} ${"stdev".padStart(9)} ${"CV%".padStart(7)} ${"min".padStart(10)} ${"max".padStart(10)} ${"spread%".padStart(8)}`);
  for (const [rt, metrics] of Object.entries(runtimes)) {
    const s = metrics.primaryMs?.length ? stats(metrics.primaryMs) : null;
    if (!s) continue;
    report[bench][rt] = { primaryMs: s };
    console.log(`  ${rt.padEnd(18)} ${s.mean.toFixed(2).padStart(11)} ${s.stdev.toFixed(2).padStart(9)} ${s.cvPct.toFixed(1).padStart(7)} ${s.min.toFixed(2).padStart(10)} ${s.max.toFixed(2).padStart(10)} ${("±" + s.spreadPct.toFixed(0)).padStart(8)}`);
  }
}
writeFileSync(outPath, JSON.stringify({ generatedFor: benches, repeat: N, quick, report }, null, 2));
console.log(`\nvariance report: ${outPath}`);
console.log(`\nGATE: for each flagged mover, if |reported %-change| <= its spread% band, it is NOISE (inside its own run-to-run band).`);

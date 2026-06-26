#!/usr/bin/env node
"use strict";

/**
 * Multi-runtime benchmark runner for Galerina benchmark fixtures.
 *
 * Recommended:
 *   node packages-galerina\galerina-core\examples\benchmark-runner.node.js --runs 5 --target-ms 20000 --warmup-ms 2000 --batch-size 100000 --buffer-size 65536
 *
 * Fixed checksum validation:
 *   node packages-galerina\galerina-core\examples\benchmark-runner.node.js --runs 3 --operations 5000000 --warmup-ms 1000 --batch-size 100000 --buffer-size 65536
 */

const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

function usage(exitCode = 0) {
  console.log(`Usage:
  node benchmark-runner.node.js [options]

Options:
  --runs <n>             Number of runs per runtime. Default: 5.
  --target-ms <ms>       Timed throughput duration. Default: 20000.
  --operations <n>       Fixed operation count. If set, fixed-work mode is used.
  --warmup-ms <ms>       Warm-up duration. Default: 2000.
  --batch-size <n>       Operations per batch/time check. Default: 100000.
  --buffer-size <n>      UInt32 ring buffer size. Must be power of two. Default: 65536.
  --seed <n>             UInt32 seed. Default: 123456789.
  --python <cmd>         Python command. Default: python.
  --skip-python          Do not run Python.
  --skip-galerina          Do not run Galerina prototype.
  --skip-node            Do not run direct Node.js.
  --help                 Show help.
`);
  process.exit(exitCode);
}

function parseArgs(argv) {
  const out = {
    runs: 5,
    targetMs: 20000,
    operations: null,
    warmupMs: 2000,
    batchSize: 100000,
    bufferSize: 65536,
    seed: 123456789,
    pythonCommand: "python",
    skipPython: false,
    skipLogicn: false,
    skipNode: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--help" || arg === "-h") usage(0);
    if (arg === "--skip-python") {
      out.skipPython = true;
      continue;
    }
    if (arg === "--skip-galerina") {
      out.skipLogicn = true;
      continue;
    }
    if (arg === "--skip-node") {
      out.skipNode = true;
      continue;
    }

    const valueOptions = new Set([
      "--runs",
      "--target-ms",
      "--operations",
      "--warmup-ms",
      "--batch-size",
      "--buffer-size",
      "--seed",
      "--python",
    ]);

    if (valueOptions.has(arg)) {
      const value = argv[i + 1];
      if (value === undefined) throw new Error(`Missing value for ${arg}`);
      i += 1;

      if (arg === "--runs") out.runs = Number(value);
      else if (arg === "--target-ms") out.targetMs = Number(value);
      else if (arg === "--operations") out.operations = Number(value);
      else if (arg === "--warmup-ms") out.warmupMs = Number(value);
      else if (arg === "--batch-size") out.batchSize = Number(value);
      else if (arg === "--buffer-size") out.bufferSize = Number(value);
      else if (arg === "--seed") out.seed = Number(value);
      else if (arg === "--python") out.pythonCommand = value;
      continue;
    }

    throw new Error(`Unknown option: ${arg}`);
  }

  if (!Number.isSafeInteger(out.runs) || out.runs <= 0) {
    throw new Error("runs must be a positive integer");
  }

  return out;
}

function projectRootFromExamplesDir() {
  return path.resolve(__dirname, "../../..");
}

function buildCommonArgs(config) {
  const args = [
    "--warmup-ms", String(config.warmupMs),
    "--batch-size", String(config.batchSize),
    "--buffer-size", String(config.bufferSize),
    "--seed", String(config.seed),
  ];

  if (config.operations !== null) {
    args.push("--operations", String(config.operations));
  } else {
    args.push("--target-ms", String(config.targetMs));
  }

  return args;
}

function buildRuntimes(config) {
  const root = projectRootFromExamplesDir();
  const examples = path.join(root, "galerina-core", "examples");
  const compiler = path.join(root, "galerina-core", "compiler", "galerina.js");
  const llnFile = path.join(examples, "compute-mix-throughput-benchmark.spore");
  const nodeFile = path.join(examples, "compute-mix-throughput-benchmark.node.js");
  const pythonFile = path.join(examples, "compute-mix-throughput-benchmark.py");
  const common = buildCommonArgs(config);

  const runtimes = [];

  if (!config.skipLogicn) {
    runtimes.push({
      name: "galerina-prototype",
      command: process.execPath,
      args: [compiler, "run", llnFile, ...common],
    });
  }

  if (!config.skipNode) {
    runtimes.push({
      name: "nodejs",
      command: process.execPath,
      args: [nodeFile, ...common],
    });
  }

  if (!config.skipPython) {
    runtimes.push({
      name: "python",
      command: config.pythonCommand,
      args: [pythonFile, ...common, "--no-tracemalloc"],
    });
  }

  return runtimes;
}

function extractJson(stdout) {
  const text = String(stdout || "").trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");

  if (start < 0 || end < start) {
    throw new Error(`No JSON object found in output:\n${text}`);
  }

  return JSON.parse(text.slice(start, end + 1));
}

function runRuntime(runtime) {
  const result = spawnSync(runtime.command, runtime.args, {
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 1024 * 1024 * 20,
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error([
      `${runtime.name} exited with status ${result.status}`,
      result.stderr,
      result.stdout,
    ].filter(Boolean).join("\n"));
  }

  return extractJson(result.stdout);
}

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid];
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

function standardDeviation(values) {
  if (values.length <= 1) return 0;
  const avg = mean(values);
  const variance = mean(values.map((value) => (value - avg) ** 2));
  return Math.sqrt(variance);
}

function round2(value) {
  return Number(value.toFixed(2));
}

function round3(value) {
  return Number(value.toFixed(3));
}

function summariseReports(reports) {
  const speeds = reports.map((report) => report.operationsPerSecond);
  const elapsed = reports.map((report) => report.elapsedMs);
  const operations = reports.map((report) => report.operations);
  const checksums = reports.map((report) => report.checksum);
  const uniqueChecksums = [...new Set(checksums)];
  const modes = [...new Set(reports.map((report) => report.mode))];

  return {
    runs: reports.length,
    benchmark: reports[0]?.benchmark ?? null,
    mode: modes.length === 1 ? modes[0] : modes,
    bestOpsPerSecond: round2(Math.max(...speeds)),
    worstOpsPerSecond: round2(Math.min(...speeds)),
    meanOpsPerSecond: round2(mean(speeds)),
    medianOpsPerSecond: round2(median(speeds)),
    standardDeviation: round2(standardDeviation(speeds)),
    medianElapsedMs: round3(median(elapsed)),
    medianOperations: Math.round(median(operations)),
    checksumValues: uniqueChecksums,
    checksumConsistent: uniqueChecksums.length === 1,
    latestProcess: reports[reports.length - 1]?.process ?? null,
    latestMemory: reports[reports.length - 1]?.memory ?? null,
  };
}

function addComparisons(summary) {
  const names = Object.keys(summary);
  const node = summary.nodejs?.medianOpsPerSecond ?? null;

  for (const name of names) {
    if (!summary[name] || node === null) continue;
    summary[name].relativeToNodeMedian = round3(summary[name].medianOpsPerSecond / node);
  }

  if (summary["galerina-prototype"] && summary.nodejs) {
    const galerina = summary["galerina-prototype"].medianOpsPerSecond;
    const directNode = summary.nodejs.medianOpsPerSecond;
    summary.comparison = {
      logicnVsNodePercent: round3(((galerina - directNode) / directNode) * 100),
      note: "Galerina prototype currently measures Node.js runner overhead, not native compiler performance.",
    };
  }

  return summary;
}

function writeResults(config, summary, rawReports) {
  const outputDir = path.join(__dirname, "benchmark-results");
  fs.mkdirSync(outputDir, { recursive: true });

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const file = path.join(outputDir, `compute-mix-throughput-v2-${stamp}.json`);

  const payload = {
    generatedAt: new Date().toISOString(),
    config,
    summary,
    rawReports,
  };

  fs.writeFileSync(file, JSON.stringify(payload, null, 2));
  return file;
}

function main() {
  const config = parseArgs(process.argv.slice(2));
  const runtimes = buildRuntimes(config);

  const rawReports = {};
  for (const runtime of runtimes) {
    rawReports[runtime.name] = [];
  }

  for (let run = 1; run <= config.runs; run += 1) {
    for (const runtime of runtimes) {
      const report = runRuntime(runtime);
      rawReports[runtime.name].push(report);

      console.log(
        `${runtime.name} run ${run}: ${report.operationsPerSecond} ops/sec ` +
        `operations=${report.operations} elapsedMs=${report.elapsedMs} checksum=${report.checksum}`
      );
    }
  }

  const summary = {};
  for (const [name, reports] of Object.entries(rawReports)) {
    summary[name] = summariseReports(reports);
  }

  addComparisons(summary);

  console.log(JSON.stringify(summary, null, 2));

  const outputFile = writeResults(config, summary, rawReports);
  console.log(`Wrote ${path.relative(process.cwd(), outputFile)}`);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
}

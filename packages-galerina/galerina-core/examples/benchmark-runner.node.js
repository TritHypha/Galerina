"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const DEFAULT_RUNS = 5;
const DEFAULT_TARGET_MS = 20000;
const DEFAULT_WARMUP_MS = 2000;
const DEFAULT_BATCH_SIZE = 100000;
const DEFAULT_VALIDATE_OPERATIONS = 5000000;

function parseIntegerFlag(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index === -1) return fallback;
  const value = Number.parseInt(String(process.argv[index + 1] || "").replace(/_/g, ""), 10);
  if (!Number.isFinite(value)) {
    throw new Error(`Invalid integer for ${name}`);
  }
  return value;
}

function parseStringFlag(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index === -1) return fallback;
  return process.argv[index + 1] || fallback;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function buildBenchmarkArgs(config) {
  const args = [
    "--target-ms",
    String(config.targetMs),
    "--warmup-ms",
    String(config.warmupMs),
    "--batch-size",
    String(config.batchSize)
  ];
  if (config.operations !== null) {
    args.push("--operations", String(config.operations));
  }
  return args;
}

function parseJson(stdout, label) {
  const text = stdout.trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1) {
    throw new Error(`${label} did not emit JSON`);
  }
  return JSON.parse(text.slice(start, end + 1));
}

function runCommand(label, command, args) {
  const result = spawnSync(command, args, {
    cwd: path.resolve(__dirname, "..", "..", ".."),
    encoding: "utf8",
    windowsHide: true
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`${label} failed:\n${result.stderr || result.stdout}`);
  }
  return parseJson(result.stdout, label);
}

function statistics(reports) {
  const values = reports.map((report) => report.operationsPerSecond).sort((a, b) => a - b);
  const mean = values.reduce((total, value) => total + value, 0) / values.length;
  const variance = values.reduce((total, value) => total + ((value - mean) ** 2), 0) / values.length;
  const standardDeviation = Math.sqrt(variance);
  const elapsedValues = reports.map((report) => report.elapsedMs).sort((a, b) => a - b);
  const warnings = [];
  if (reports.some((report) => report.operations !== null && report.elapsedMs < 100)) {
    warnings.push("Fixed-operation elapsed time below 100ms; use this run for checksum validation only.");
  } else if (reports.some((report) => report.operations !== null && report.elapsedMs < 1000)) {
    warnings.push("Fixed-operation elapsed time below 1000ms; treat speed ranking as a weak signal.");
  }

  return {
    runs: values.length,
    bestOpsPerSecond: values[values.length - 1],
    worstOpsPerSecond: values[0],
    meanOpsPerSecond: Number(mean.toFixed(2)),
    medianOpsPerSecond: values[Math.floor(values.length / 2)],
    standardDeviation: Number(standardDeviation.toFixed(2)),
    coefficientOfVariation: mean === 0 ? 0 : Number((standardDeviation / mean).toFixed(6)),
    medianElapsedMs: elapsedValues[Math.floor(reports.length / 2)],
    checksumValues: Array.from(new Set(reports.map((report) => report.checksum))),
    warnings
  };
}

function validationSummary(config, summary) {
  const checksumSets = Object.values(summary).map((item) => item.checksumValues);
  const fixedOperationChecksumsMatch = config.operations !== null &&
    checksumSets.length > 0 &&
    checksumSets.every((values) => values.length === 1) &&
    new Set(checksumSets.map((values) => values[0])).size === 1;
  const timedMode = config.operations === null;

  return {
    mode: timedMode ? "timed-throughput" : "fixed-operations",
    fixedOperationChecksumsMatch: timedMode ? null : fixedOperationChecksumsMatch,
    timedModeChecksumsExpectedToDiffer: timedMode,
    speedRankingAllowed: timedMode && config.targetMs >= 10000 && config.targetMs <= 30000,
    officialScore: timedMode ? "median operations per second" : "checksum validation only",
    notes: timedMode
      ? ["Timed mode checksums may differ because runtimes complete different operation counts."]
      : ["Fixed-operation mode requires matching checksums across runtimes."]
  };
}

function relativePerformance(summary) {
  const galerina = summary["galerina-prototype"]?.medianOpsPerSecond ?? null;
  const node = summary.nodejs?.medianOpsPerSecond ?? null;
  const python = summary.python?.medianOpsPerSecond ?? null;

  return {
    logicnVsNode: galerina !== null && node ? Number((galerina / node).toFixed(4)) : null,
    logicnVsPython: galerina !== null && python ? Number((galerina / python).toFixed(4)) : null,
    nodeVsPython: node !== null && python ? Number((node / python).toFixed(4)) : null
  };
}

function main() {
  const examplesDir = __dirname;
  const coreDir = path.resolve(examplesDir, "..");
  const repoRoot = path.resolve(coreDir, "..", "..");
  const validate = hasFlag("--validate") || parseStringFlag("--mode", "") === "validate";
  const config = {
    runs: parseIntegerFlag("--runs", DEFAULT_RUNS),
    targetMs: parseIntegerFlag("--target-ms", DEFAULT_TARGET_MS),
    warmupMs: validate ? 0 : parseIntegerFlag("--warmup-ms", DEFAULT_WARMUP_MS),
    batchSize: parseIntegerFlag("--batch-size", DEFAULT_BATCH_SIZE),
    bufferSize: parseIntegerFlag("--buffer-size", 65536),
    operations: validate ? parseIntegerFlag("--operations", DEFAULT_VALIDATE_OPERATIONS) : parseIntegerFlag("--operations", null),
    validate,
    python: parseStringFlag("--python", "python")
  };

  const commonArgs = buildBenchmarkArgs(config);
  const commands = [
    {
      label: "galerina-prototype",
      command: process.execPath,
      args: [
        path.join(coreDir, "compiler", "galerina.js"),
        "run",
        path.join(examplesDir, "compute-mix-throughput-benchmark.spore"),
        ...commonArgs
      ]
    },
    {
      label: "nodejs",
      command: process.execPath,
      args: [path.join(examplesDir, "compute-mix-throughput-benchmark.node.js"), ...commonArgs]
    },
    {
      label: "python",
      command: config.python,
      args: [path.join(examplesDir, "compute-mix-throughput-benchmark.py"), ...commonArgs, "--no-tracemalloc"]
    }
  ];

  const results = {};
  const runOrder = [];
  for (const item of commands) {
    results[item.label] = [];
  }
  for (let run = 1; run <= config.runs; run += 1) {
    for (const item of commands) {
      const report = runCommand(`${item.label} run ${run}`, item.command, item.args);
      results[item.label].push(report);
      runOrder.push({ run, runtime: item.label });
      console.log(`${item.label} run ${run}: ${report.operationsPerSecond} ops/sec checksum=${report.checksum}`);
    }
  }

  const runtimeSummary = Object.fromEntries(Object.entries(results).map(([label, reports]) => [label, statistics(reports)]));
  const validation = validationSummary(config, runtimeSummary);
  if (config.validate && validation.fixedOperationChecksumsMatch === false) {
    console.error("BENCHMARK INVALID: checksums do not match in fixed-operation mode.");
    process.exitCode = 1;
  }

  const summary = {
    benchmark: "compute-mix-throughput",
    generatedAt: new Date().toISOString(),
    config,
    validation,
    relativePerformance: relativePerformance(runtimeSummary),
    runOrder,
    summary: runtimeSummary,
    reports: results
  };

  const resultsDir = path.join(examplesDir, "benchmark-results");
  fs.mkdirSync(resultsDir, { recursive: true });
  const fileName = `compute-mix-throughput-${summary.generatedAt.replace(/[:.]/g, "-")}.json`;
  const outputPath = path.join(resultsDir, fileName);
  fs.writeFileSync(outputPath, JSON.stringify(summary, null, 2) + "\n", "utf8");

  console.log(JSON.stringify({
    validation: summary.validation,
    relativePerformance: summary.relativePerformance,
    summary: summary.summary
  }, null, 2));
  console.log(`Wrote ${path.relative(repoRoot, outputPath).replace(/\\/g, "/")}`);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

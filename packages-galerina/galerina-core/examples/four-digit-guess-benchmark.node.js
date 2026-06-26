"use strict";

// Harder v2: expanded to 6-digit codes (1M combinations).
// Each attempt also computes a bulls+cows score (Wordle-style):
//   bulls = digits correct position, cows = digits wrong position.
// This makes each comparison ~6x more expensive than a raw string equality check.
// max-attempts default raised to 2,000,000 for meaningful sequential sweep.

const { randomInt }  = require("node:crypto");
const { performance } = require("node:perf_hooks");

const DEFAULT_MAX_ATTEMPTS = 2_000_000;
const CODE_LENGTH          = 6;                       // 000000 … 999999
const CODE_SPACE           = Math.pow(10, CODE_LENGTH); // 1 000 000

function parseArgs(argv) {
  const options = { target: "042069", maxAttempts: DEFAULT_MAX_ATTEMPTS, mode: "sequential" };
  for (let i = 2; i < argv.length; i += 1) {
    if      (argv[i] === "--target")                  { options.target      = String(argv[i+1]||""); i += 1; }
    else if (argv[i] === "--max" || argv[i] === "--max-attempts") { options.maxAttempts = Number.parseInt(argv[i+1]||"",10); i += 1; }
    else if (argv[i] === "--mode")                    { options.mode        = String(argv[i+1]||""); i += 1; }
    else if (argv[i] === "--help")                    { options.help        = true; }
  }
  return options;
}

function validate(options) {
  if (!/^\d{6}$/.test(options.target)) throw new Error("target must be exactly 6 digits, e.g. 042069");
  if (!Number.isInteger(options.maxAttempts) || options.maxAttempts <= 0) throw new Error("max must be a positive integer");
  if (options.maxAttempts > 20_000_000) throw new Error("max attempts capped at 20000000");
  if (!["sequential","random"].includes(options.mode)) throw new Error("mode must be sequential or random");
}

function formatCode(value) {
  return String(value).padStart(CODE_LENGTH, "0");
}

/** Compute bulls (exact position match) and cows (digit present, wrong position). */
function bullsAndCows(candidate, target) {
  let bulls = 0;
  let cows  = 0;
  const candCount = new Array(10).fill(0);
  const targCount = new Array(10).fill(0);

  for (let i = 0; i < CODE_LENGTH; i += 1) {
    const c = candidate.charCodeAt(i) - 48;
    const t = target.charCodeAt(i) - 48;
    if (c === t) {
      bulls += 1;
    } else {
      candCount[c] += 1;
      targCount[t] += 1;
    }
  }
  for (let d = 0; d < 10; d += 1) {
    cows += Math.min(candCount[d], targCount[d]);
  }
  return { bulls, cows };
}

function runBenchmark(target, maxAttempts, mode) {
  const startedAt  = performance.now();
  const startedCpu = process.cpuUsage();

  let attempt      = 0;
  let found        = false;
  let lastScore    = { bulls: 0, cows: 0 };
  let totalBulls   = 0;
  let totalCows    = 0;

  while (attempt < maxAttempts) {
    const candidate = mode === "random"
      ? formatCode(randomInt(0, CODE_SPACE))
      : formatCode(attempt % CODE_SPACE);
    attempt += 1;

    const score = bullsAndCows(candidate, target);
    totalBulls += score.bulls;
    totalCows  += score.cows;

    if (score.bulls === CODE_LENGTH) {
      found     = true;
      lastScore = score;
      break;
    }
  }

  const elapsedMs = performance.now() - startedAt;
  const cpu       = process.cpuUsage(startedCpu);
  const memory    = process.memoryUsage();
  const resource  = typeof process.resourceUsage === "function" ? process.resourceUsage() : null;

  return {
    runtime:            "nodejs",
    benchmark:          "four-digit-guess-v2",
    version:            2,
    codeLength:         CODE_LENGTH,
    mode,
    target,
    found,
    attempts:           attempt,
    finalScore:         found ? lastScore : null,
    totalBulls,
    totalCows,
    elapsedMs:          Number(elapsedMs.toFixed(3)),
    attemptsPerSecond:  Number((attempt / Math.max(elapsedMs / 1000, Number.EPSILON)).toFixed(2)),
    cpu: {
      userMs:   Number((cpu.user   / 1000).toFixed(3)),
      systemMs: Number((cpu.system / 1000).toFixed(3)),
      totalMs:  Number(((cpu.user + cpu.system) / 1000).toFixed(3)),
    },
    memory: {
      rssBytes:         memory.rss,
      heapTotalBytes:   memory.heapTotal,
      heapUsedBytes:    memory.heapUsed,
      externalBytes:    memory.external,
      arrayBuffersBytes: memory.arrayBuffers,
      maxRssBytes:      resource ? resource.maxRSS * 1024 : null,
    },
    process: {
      pid:      process.pid,
      node:     process.version,
      platform: process.platform,
      arch:     process.arch,
    },
    notes: [
      "v2: 6-digit codes (1M combinations), bulls+cows scoring per attempt",
      "Each attempt is ~6x more expensive than raw string equality",
    ],
  };
}

function main() {
  const options = parseArgs(process.argv);
  if (options.help) {
    console.log("Usage: node four-digit-guess-benchmark.node.js [--target 042069] [--max 2000000] [--mode sequential|random]");
    return;
  }
  validate(options);
  console.log(JSON.stringify(runBenchmark(options.target, options.maxAttempts, options.mode), null, 2));
}

try { main(); } catch (e) { console.error(`four-digit benchmark failed: ${e.message}`); process.exitCode = 1; }

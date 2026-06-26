"use strict";

// Harder v2: doubled threshold, plus modular multiply + XOR checksum each cycle.
// Each loop iteration: 4 additions + 1 imul + 1 XOR (vs 2 additions in v1).

const { performance } = require("node:perf_hooks");

const DEFAULT_THRESHOLD = 200_000_000_000_000;  // doubled from v1

function parseArgs(argv) {
  const options = { threshold: DEFAULT_THRESHOLD };
  for (let i = 2; i < argv.length; i += 1) {
    if (argv[i] === "--threshold") { options.threshold = Number.parseInt(argv[i + 1] || "", 10); i += 1; }
    else if (argv[i] === "--help") { options.help = true; }
  }
  return options;
}

function validate(threshold) {
  if (!Number.isFinite(threshold) || threshold <= 0) {
    throw new Error("threshold must be a positive finite number");
  }
}

function runBenchmark(threshold) {
  const startedAt  = performance.now();
  const startedCpu = process.cpuUsage();

  let total     = 0;
  let i         = 0;
  let additions = 0;
  let checksum  = 0 >>> 0;   // uint32 checksum — extra work per cycle

  while (total <= threshold) {
    // Unrolled double-step (same structure as v1) + checksum update
    total += i;
    i += 1;
    additions += 1;

    total += i;
    i += 1;
    additions += 1;

    // Extra work: modular multiply + XOR accumulate
    // Uses Math.imul for 32-bit truncation, matching Python's & UINT32_MASK
    checksum = (Math.imul(checksum ^ (i >>> 0), 2654435761) + (i >>> 0)) >>> 0;
  }

  const elapsedMs = performance.now() - startedAt;
  const cpu       = process.cpuUsage(startedCpu);
  const memory    = process.memoryUsage();
  const resource  = typeof process.resourceUsage === "function" ? process.resourceUsage() : null;

  return {
    runtime:            "nodejs",
    benchmark:          "arithmetic-threshold-v2",
    version:            2,
    threshold,
    total,
    nextI:              i,
    additions,
    checksum:           checksum >>> 0,
    loopCycles:         additions / 2,
    elapsedMs:          Number(elapsedMs.toFixed(3)),
    additionsPerSecond: Number((additions / Math.max(elapsedMs / 1000, Number.EPSILON)).toFixed(2)),
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
    notes: ["v2: doubled threshold, +imul+XOR checksum per cycle"],
  };
}

function main() {
  const options = parseArgs(process.argv);
  if (options.help) {
    console.log("Usage: node arithmetic-threshold-benchmark.node.js [--threshold N]");
    return;
  }
  validate(options.threshold);
  console.log(JSON.stringify(runBenchmark(options.threshold), null, 2));
}

try { main(); } catch (e) { console.error(`arithmetic benchmark failed: ${e.message}`); process.exitCode = 1; }

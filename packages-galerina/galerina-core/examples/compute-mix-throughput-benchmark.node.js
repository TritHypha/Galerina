"use strict";

// Harder benchmark v2:
// Per operation: 2 LCG steps, 2 xorshift mixing rounds,
// float sqrt, float-to-int conversion, 4-way conditional branch.
// This exercises integer, float, and branch prediction together.
// Checksum must match Python version byte-for-byte.

const DEFAULT_TARGET_MS = 30000;
const DEFAULT_WARMUP_MS = 3000;
const DEFAULT_BATCH_SIZE = 50000;
const DEFAULT_SEED = 123456789;

function parseIntegerFlag(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index === -1) return fallback;
  const value = Number.parseInt(String(process.argv[index + 1] || "").replace(/_/g, ""), 10);
  if (!Number.isFinite(value)) {
    throw new Error(`Invalid integer for ${name}`);
  }
  return value;
}

function runBatch(state, batchSize) {
  let seed     = state.seed >>> 0;
  let checksum = state.checksum >>> 0;

  for (let i = 0; i < batchSize; i += 1) {
    // Step 1 — LCG advance
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;

    // Step 2 — first xorshift mix
    const mix1 = Math.imul((seed ^ (seed >>> 13)) >>> 0, 2246822519) >>> 0;

    // Step 3 — second xorshift mix (harder)
    const mix2 = Math.imul((mix1 ^ (mix1 >>> 17)) >>> 0, 3266489917) >>> 0;

    // Step 4 — float work: sqrt of normalised value
    const fval    = mix2 / 4294967296.0;                  // [0, 1)
    const sqrtval = Math.sqrt(fval + 1.0);               // [1, sqrt(2))
    const intval  = (Math.floor(sqrtval * 1000000.0)) >>> 0;

    // Step 5 — 4-way branch (not just 2-way)
    const branch = mix2 & 3;
    if (branch === 0) {
      checksum = (checksum ^ intval) >>> 0;
    } else if (branch === 1) {
      checksum = (checksum + mix2) >>> 0;
    } else if (branch === 2) {
      checksum = (checksum ^ ((mix1 << 3) >>> 0)) >>> 0;
    } else {
      checksum = (checksum + intval + mix1) >>> 0;
    }

    // Step 6 — second LCG for extra arithmetic work (multiplier must be < 2^32)
    seed     = (Math.imul(seed, 2891336453) + 1442695041) >>> 0;
    checksum = (checksum ^ seed) >>> 0;
  }

  state.seed     = seed;
  state.checksum = checksum;
}

function elapsedMsSince(startedAt) {
  return Number(process.hrtime.bigint() - startedAt) / 1_000_000;
}

function validateConfig(config) {
  if (config.operations === null && (config.targetMs < 10000 || config.targetMs > 30000)) {
    throw new Error("--target-ms must be between 10000 and 30000 unless --operations is used");
  }
  if (config.warmupMs < 0) {
    throw new Error("--warmup-ms must be 0 or greater");
  }
  if (config.batchSize <= 0) {
    throw new Error("--batch-size must be greater than 0");
  }
  if (config.operations !== null && config.operations <= 0) {
    throw new Error("--operations must be greater than 0");
  }
}

function runBenchmark(config) {
  validateConfig(config);

  const warmupStartedAt = process.hrtime.bigint();
  if (config.warmupMs > 0) {
    const warmupState = { seed: config.seed >>> 0, checksum: 0 };
    while (elapsedMsSince(warmupStartedAt) < config.warmupMs) {
      runBatch(warmupState, config.batchSize);
    }
  }

  const state = { seed: config.seed >>> 0, checksum: 0 };

  const startedAt  = process.hrtime.bigint();
  const startedCpu = process.cpuUsage();
  let operations   = 0;

  if (config.operations !== null) {
    while (operations < config.operations) {
      const batch = Math.min(config.batchSize, config.operations - operations);
      runBatch(state, batch);
      operations += batch;
    }
  } else {
    while (elapsedMsSince(startedAt) < config.targetMs) {
      runBatch(state, config.batchSize);
      operations += config.batchSize;
    }
  }

  const elapsedMs = elapsedMsSince(startedAt);
  const cpu       = process.cpuUsage(startedCpu);
  const memory    = process.memoryUsage();
  const resource  = typeof process.resourceUsage === "function" ? process.resourceUsage() : null;

  const opsPerSec = Number((operations / Math.max(elapsedMs / 1000, Number.EPSILON)).toFixed(2));
  const cpuTotalMs = (cpu.user + cpu.system) / 1000;

  return {
    runtime:        "nodejs",
    benchmark:      "compute-mix-throughput-v2",
    executionMode:  "direct-nodejs",
    comparisonType: "direct-runtime",
    version:        2,
    algorithm:      "lcg2x-xorshift2x-sqrt-4branch",
    targetMs:       config.targetMs,
    warmupMs:       config.warmupMs,
    batchSize:      config.batchSize,
    seed:           config.seed,
    elapsedMs:      Number(elapsedMs.toFixed(3)),
    operations,
    operationsPerSecond:  opsPerSec,
    operationsPerCpuMs:   Number((operations / Math.max(cpuTotalMs, Number.EPSILON)).toFixed(2)),
    checksum:       state.checksum >>> 0,
    cpu: {
      userMs:   Number((cpu.user   / 1000).toFixed(3)),
      systemMs: Number((cpu.system / 1000).toFixed(3)),
      totalMs:  Number(cpuTotalMs.toFixed(3)),
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
      python:   null,
      platform: process.platform,
      arch:     process.arch,
    },
    notes: [
      "v2: 2x LCG, 2x xorshift mix, float sqrt, 4-way branch per operation",
      "Harder than v1 — exercises float, int, and branch prediction together",
    ],
  };
}

function main() {
  const config = {
    targetMs:   parseIntegerFlag("--target-ms",   DEFAULT_TARGET_MS),
    warmupMs:   parseIntegerFlag("--warmup-ms",   DEFAULT_WARMUP_MS),
    batchSize:  parseIntegerFlag("--batch-size",  DEFAULT_BATCH_SIZE),
    operations: parseIntegerFlag("--operations",  null),
    seed:       parseIntegerFlag("--seed",        DEFAULT_SEED),
  };

  console.log(JSON.stringify(runBenchmark(config), null, 2));
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

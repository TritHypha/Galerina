#!/usr/bin/env node
"use strict";

/**
 * Galerina Strong Benchmark - Node.js reference implementation
 *
 * Purpose:
 * - Runs a deterministic mixed compute + memory workload.
 * - Supports fixed-operation validation mode and timed throughput mode.
 * - Uses UInt32-style arithmetic so results can be matched with Python/Galerina.
 *
 * This benchmark is intentionally not a pure addition loop. It includes:
 * - UInt32 multiply/add/xor/shift
 * - predictable but data-dependent branching
 * - a ring-buffer memory read/write
 * - checksum output to prevent the workload being optimised away
 */

const { performance } = require("node:perf_hooks");
const os = require("node:os");

const UINT32_MASK = 0xffffffff;

function usage(exitCode = 0) {
  console.log(`Usage:
  node compute-mix-throughput-benchmark.node.js [options]

Options:
  --target-ms <ms>       Timed throughput duration. Default: 20000.
  --operations <n>       Fixed operation count. If set, fixed-work mode is used.
  --warmup-ms <ms>       Warm-up duration before measurement. Default: 2000.
  --batch-size <n>       Operations per batch/time check. Default: 100000.
  --buffer-size <n>      UInt32 ring buffer size. Must be power of two. Default: 65536.
  --seed <n>             UInt32 seed. Default: 123456789.
  --json-pretty          Pretty-print JSON output.
  --help                 Show this help.
`);
  process.exit(exitCode);
}

function parseArgs(argv) {
  const out = {
    targetMs: 20000,
    operations: null,
    warmupMs: 2000,
    batchSize: 100000,
    bufferSize: 65536,
    seed: 123456789,
    jsonPretty: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--help" || arg === "-h") usage(0);
    if (arg === "--json-pretty") {
      out.jsonPretty = true;
      continue;
    }

    const needsValue = new Set([
      "--target-ms",
      "--operations",
      "--warmup-ms",
      "--batch-size",
      "--buffer-size",
      "--seed",
    ]);

    if (needsValue.has(arg)) {
      const value = argv[i + 1];
      if (value === undefined) {
        throw new Error(`Missing value for ${arg}`);
      }
      i += 1;

      if (arg === "--target-ms") out.targetMs = Number(value);
      else if (arg === "--operations") out.operations = Number(value);
      else if (arg === "--warmup-ms") out.warmupMs = Number(value);
      else if (arg === "--batch-size") out.batchSize = Number(value);
      else if (arg === "--buffer-size") out.bufferSize = Number(value);
      else if (arg === "--seed") out.seed = Number(value) >>> 0;
      continue;
    }

    throw new Error(`Unknown option: ${arg}`);
  }

  return out;
}

function assertPositiveInteger(name, value) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive safe integer`);
  }
}

function assertNonNegativeInteger(name, value) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative safe integer`);
  }
}

function isPowerOfTwo(value) {
  return Number.isSafeInteger(value) && value > 0 && (value & (value - 1)) === 0;
}

function validateConfig(config) {
  assertPositiveInteger("targetMs", config.targetMs);
  assertNonNegativeInteger("warmupMs", config.warmupMs);
  assertPositiveInteger("batchSize", config.batchSize);
  assertPositiveInteger("bufferSize", config.bufferSize);

  if (!isPowerOfTwo(config.bufferSize)) {
    throw new Error("bufferSize must be a power of two");
  }

  if (config.operations !== null) {
    assertPositiveInteger("operations", config.operations);
  }

  if (config.operations === null && (config.targetMs < 10000 || config.targetMs > 30000)) {
    throw new Error("targetMs should be between 10000 and 30000 for fair timed benchmark runs");
  }
}

function nextSeed(seed) {
  return (Math.imul(seed >>> 0, 1664525) + 1013904223) >>> 0;
}

function createState(seed, bufferSize) {
  const buffer = new Uint32Array(bufferSize);
  let s = seed >>> 0;

  for (let i = 0; i < bufferSize; i += 1) {
    s = nextSeed(s);
    buffer[i] = s;
  }

  return {
    seed: seed >>> 0,
    state: s >>> 0,
    checksum: 0 >>> 0,
    cursor: 0 >>> 0,
    buffer,
    mask: (bufferSize - 1) >>> 0,
  };
}

function runOperations(state, operationCount) {
  const buffer = state.buffer;
  const mask = state.mask;
  let s = state.state >>> 0;
  let checksum = state.checksum >>> 0;
  let cursor = state.cursor >>> 0;

  for (let op = 0; op < operationCount; op += 1) {
    s = (Math.imul(s ^ (s >>> 16), 2246822519) + 3266489917) >>> 0;

    const idx = (s ^ (s >>> 11) ^ cursor) & mask;
    const old = buffer[idx] >>> 0;

    let mixed = Math.imul((old ^ s ^ (checksum >>> 3)) >>> 0, 2654435761) >>> 0;
    mixed = (mixed ^ (mixed >>> 15) ^ Math.imul(mixed, 2246822519)) >>> 0;

    if ((mixed & 7) === 0) {
      checksum = (checksum + mixed + old) >>> 0;
    } else if ((mixed & 1) === 0) {
      checksum = (checksum ^ ((mixed << 1) >>> 0) ^ (old >>> 1)) >>> 0;
    } else {
      checksum = (checksum + Math.imul((mixed ^ old) >>> 0, 1597334677)) >>> 0;
    }

    buffer[idx] = (mixed + checksum + cursor) >>> 0;
    cursor = (cursor + 1) & mask;
  }

  state.state = s >>> 0;
  state.checksum = checksum >>> 0;
  state.cursor = cursor >>> 0;
}

function runWarmup(config) {
  if (config.warmupMs <= 0) return;

  const state = createState(config.seed, config.bufferSize);
  const startedAt = performance.now();

  while (performance.now() - startedAt < config.warmupMs) {
    runOperations(state, config.batchSize);
  }
}

function runMeasured(config) {
  runWarmup(config);

  const state = createState(config.seed, config.bufferSize);
  const startedCpu = process.cpuUsage();
  const startedAt = performance.now();
  let operations = 0;

  if (config.operations !== null) {
    while (operations < config.operations) {
      const remaining = config.operations - operations;
      const batch = remaining < config.batchSize ? remaining : config.batchSize;
      runOperations(state, batch);
      operations += batch;
    }
  } else {
    while (performance.now() - startedAt < config.targetMs) {
      runOperations(state, config.batchSize);
      operations += config.batchSize;
    }
  }

  const elapsedMs = performance.now() - startedAt;
  const cpuRaw = process.cpuUsage(startedCpu);
  const memory = process.memoryUsage();
  const resource = typeof process.resourceUsage === "function" ? process.resourceUsage() : null;

  return {
    runtime: "nodejs",
    benchmark: "compute-mix-throughput-v2",
    executionMode: "direct-nodejs",
    comparisonType: "direct-runtime",
    mode: config.operations === null ? "timed-throughput" : "fixed-operations",
    targetMs: config.operations === null ? config.targetMs : null,
    requestedOperations: config.operations,
    warmupMs: config.warmupMs,
    batchSize: config.batchSize,
    bufferSize: config.bufferSize,
    seed: config.seed >>> 0,
    elapsedMs: Number(elapsedMs.toFixed(3)),
    operations,
    operationsPerSecond: Number((operations / (elapsedMs / 1000)).toFixed(2)),
    checksum: state.checksum >>> 0,
    finalState: state.state >>> 0,
    cursor: state.cursor >>> 0,
    overshootMs: config.operations === null ? Number(Math.max(0, elapsedMs - config.targetMs).toFixed(3)) : 0,
    cpu: {
      userMs: Number((cpuRaw.user / 1000).toFixed(3)),
      systemMs: Number((cpuRaw.system / 1000).toFixed(3)),
      totalMs: Number(((cpuRaw.user + cpuRaw.system) / 1000).toFixed(3)),
    },
    memory: {
      rssBytes: memory.rss,
      heapTotalBytes: memory.heapTotal,
      heapUsedBytes: memory.heapUsed,
      externalBytes: memory.external,
      arrayBuffersBytes: memory.arrayBuffers,
      maxRssBytes: resource ? resource.maxRSS * 1024 : null,
    },
    process: {
      pid: process.pid,
      node: process.version,
      python: null,
      platform: process.platform,
      arch: process.arch,
      cpus: os.cpus()?.length ?? null,
    },
    notes: [
      "V2 benchmark uses UInt32 compute, branching, and ring-buffer memory reads/writes.",
      "Use fixed-operations mode to compare checksum equality across runtimes.",
      "Use timed-throughput mode to compare median operations per second."
    ],
  };
}

function main() {
  try {
    const config = parseArgs(process.argv.slice(2));
    validateConfig(config);
    const report = runMeasured(config);
    console.log(config.jsonPretty ? JSON.stringify(report, null, 2) : JSON.stringify(report, null, 2));
  } catch (error) {
    console.error(JSON.stringify({
      runtime: "nodejs",
      benchmark: "compute-mix-throughput-v2",
      error: error instanceof Error ? error.message : String(error),
    }, null, 2));
    process.exit(1);
  }
}

main();

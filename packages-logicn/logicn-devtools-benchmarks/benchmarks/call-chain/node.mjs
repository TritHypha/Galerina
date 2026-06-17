import { performance } from "node:perf_hooks";

// call-chain benchmark — Node.js reference
// Mirrors benchmark.lln exactly: an OOP call stack controller → service.method()
// → util function, repeated per outer iteration. One iteration fans out to 7 calls
// (1 service + 2 domain + 4 leaf), same arithmetic and salting as the LogicN flows.

// 50,000 outer chains takes well under a millisecond in Node, so we run many
// iterations to get a stable rate; the runner compares ops/second.
const DEFAULT_ITERATIONS = 2_000_000;

// leaf "util function"
function leafCompute(salt, x) {
  return (salt + x) * 2 + 1;
}

// domain layer — a plain method that calls the util function twice
class DomainLayer {
  compute(salt, x) {
    return leafCompute(salt, x) + leafCompute(salt, x + 1);
  }
}

// service layer — a method that calls the domain method twice
class ServiceLayer {
  constructor() {
    this.domain = new DomainLayer();
  }
  process(salt, x) {
    return this.domain.compute(salt, x) + this.domain.compute(salt, x + 2);
  }
}

function chain(iterations) {
  const service = new ServiceLayer();
  let checksum = 0;
  for (let i = 0; i < iterations; i++) {
    checksum += service.process(i, i);
  }
  return checksum;
}

function runBench(iterations) {
  // Warmup
  chain(Math.min(iterations, 50_000));

  if (typeof globalThis.gc === "function") globalThis.gc();
  const __memBefore = process.memoryUsage();
  const t0 = performance.now();
  const cpu0 = process.cpuUsage();
  const result = chain(iterations);
  const elapsedMs = performance.now() - t0;
  const cpu = process.cpuUsage(cpu0);
  const mem = process.memoryUsage();
  return {
    runtime: "nodejs", benchmark: "call-chain-v1",
    result, iterations,
    callsPerIteration: 7,
    elapsedMs: Number(elapsedMs.toFixed(3)),
    iterationsPerSecond: Number((iterations / (elapsedMs / 1000)).toFixed(2)),
    callsPerSecond: Number(((iterations * 7) / (elapsedMs / 1000)).toFixed(2)),
    cpu: { totalMs: Number(((cpu.user + cpu.system) / 1000).toFixed(3)) },
    memory: { rssBytes: mem.rss, heapUsedBytes: mem.heapUsed, maxRssBytes: null, heapUsedBefore: __memBefore.heapUsed, heapUsedDelta: mem.heapUsed - __memBefore.heapUsed },
    process: { pid: process.pid, node: process.version, platform: process.platform, arch: process.arch },
  };
}

function parseIntFlag(name, fallback) {
  const idx = process.argv.indexOf(name);
  return idx >= 0 ? parseInt(process.argv[idx + 1] || "", 10) || fallback : fallback;
}

const its = parseIntFlag("--operations", parseIntFlag("--iterations", DEFAULT_ITERATIONS));
console.log(JSON.stringify(runBench(its), null, 2));

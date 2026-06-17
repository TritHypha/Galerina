import { performance } from "node:perf_hooks";

const DEFAULT_N = 1000;
const DEFAULT_ITERATIONS = 100000;

// The same algorithm as the LogicN benchmark: sum of 1..n
function triangleNumber(n) {
  let total = 0;
  for (let i = 1; i <= n; i++) total += i;
  return total;
}

function runBench(n, iterations) {
  // Warmup
  triangleNumber(n);

  if (typeof globalThis.gc === "function") globalThis.gc();
  const __memBefore = process.memoryUsage();
  const t0 = performance.now();
  const cpu0 = process.cpuUsage();
  let result = 0;
  for (let i = 0; i < iterations; i++) {
    result = triangleNumber(n);
  }
  const elapsedMs = performance.now() - t0;
  const cpu = process.cpuUsage(cpu0);
  const mem = process.memoryUsage();
  return {
    runtime: "nodejs", benchmark: "governance-cost-v1",
    n, result, iterations,
    elapsedMs: Number(elapsedMs.toFixed(3)),
    iterationsPerSecond: Number((iterations / (elapsedMs / 1000)).toFixed(2)),
    cpu: { totalMs: Number(((cpu.user + cpu.system) / 1000).toFixed(3)) },
    memory: { rssBytes: mem.rss, heapUsedBytes: mem.heapUsed, maxRssBytes: null, heapUsedBefore: __memBefore.heapUsed, heapUsedDelta: mem.heapUsed - __memBefore.heapUsed },
    process: { pid: process.pid, node: process.version, platform: process.platform, arch: process.arch },
    notes: ["Pure JS loop: sum 1..n for each iteration"],
  };
}

function parseIntFlag(name, fallback) {
  const idx = process.argv.indexOf(name);
  return idx >= 0 ? parseInt(process.argv[idx + 1] || "", 10) || fallback : fallback;
}

const n = parseIntFlag("--n", DEFAULT_N);
const its = parseIntFlag("--operations", parseIntFlag("--iterations", DEFAULT_ITERATIONS));
console.log(JSON.stringify(runBench(n, its), null, 2));

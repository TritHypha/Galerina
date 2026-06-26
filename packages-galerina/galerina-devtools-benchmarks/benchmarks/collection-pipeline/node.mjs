import { performance } from "node:perf_hooks";

const DEFAULT_SIZE = 10000;
const DEFAULT_ITERATIONS = 5000;

function runBench(size, iterations) {
  // Pre-allocate array once — we test pipeline overhead, not allocation
  const arr = Array.from({ length: size }, (_, i) => i);

  // Warmup
  arr.filter(x => x % 2 === 0).map(x => x * 2).reduce((a, b) => a + b, 0);

  if (typeof globalThis.gc === "function") globalThis.gc();
  const __memBefore = process.memoryUsage();
  const t0 = performance.now();
  const cpu0 = process.cpuUsage();
  let result = 0;
  for (let i = 0; i < iterations; i++) {
    result = arr.filter(x => x % 2 === 0).map(x => x * 2).reduce((a, b) => a + b, 0);
  }
  const elapsedMs = performance.now() - t0;
  const cpu = process.cpuUsage(cpu0);
  const mem = process.memoryUsage();
  return {
    runtime: "nodejs", benchmark: "collection-pipeline-v1",
    size, iterations, result,
    elapsedMs: Number(elapsedMs.toFixed(3)),
    iterationsPerSecond: Number((iterations / (elapsedMs / 1000)).toFixed(2)),
    cpu: { totalMs: Number(((cpu.user + cpu.system) / 1000).toFixed(3)) },
    memory: { rssBytes: mem.rss, heapUsedBytes: mem.heapUsed, maxRssBytes: null, heapUsedBefore: __memBefore.heapUsed, heapUsedDelta: mem.heapUsed - __memBefore.heapUsed },
    process: { pid: process.pid, node: process.version, platform: process.platform, arch: process.arch },
  };
}

function parseIntFlag(name, fallback) {
  const idx = process.argv.indexOf(name);
  return idx >= 0 ? parseInt(process.argv[idx + 1] || "", 10) || fallback : fallback;
}

const size = parseIntFlag("--size", DEFAULT_SIZE);
const its = parseIntFlag("--operations", parseIntFlag("--iterations", DEFAULT_ITERATIONS));
console.log(JSON.stringify(runBench(size, its), null, 2));

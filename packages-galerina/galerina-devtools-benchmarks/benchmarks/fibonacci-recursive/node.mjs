import { performance } from "node:perf_hooks";

const DEFAULT_N = 30;
const DEFAULT_ITERATIONS = 100;  // fib(30) takes ~8ms in Node.js; 100 iters ≈ 0.8s

function fib(n) {
  if (n <= 1) return n;
  return fib(n - 1) + fib(n - 2);
}

function runBench(n, iterations) {
  // Warmup
  fib(n);

  if (typeof globalThis.gc === "function") globalThis.gc();
  const __memBefore = process.memoryUsage();
  const t0 = performance.now();
  const cpu0 = process.cpuUsage();
  let result = 0;
  for (let i = 0; i < iterations; i++) {
    result = fib(n);
  }
  const elapsedMs = performance.now() - t0;
  const cpu = process.cpuUsage(cpu0);
  const mem = process.memoryUsage();
  return {
    runtime: "nodejs", benchmark: "fibonacci-recursive-v1",
    n, result, iterations,
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

const n = parseIntFlag("--n", DEFAULT_N);
const its = parseIntFlag("--operations", parseIntFlag("--iterations", DEFAULT_ITERATIONS));
console.log(JSON.stringify(runBench(n, its), null, 2));

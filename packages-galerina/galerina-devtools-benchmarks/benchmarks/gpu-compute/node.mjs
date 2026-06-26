import { performance } from "node:perf_hooks";

const ELEMENTS = 100000;        // index space (the "kernel" runs over this many elements)
const DEFAULT_ITERATIONS = 5000; // outer repetitions to get measurable time

function kernel(i) { return i * 2 + 1; }

function mapReduce(n) {
  let acc = 0;
  for (let i = 0; i < n; i++) {
    acc += kernel(i);
    if (acc > 1000000000) acc -= 1000000000;
  }
  return acc;
}

function runBench(elements, iterations) {
  // Warmup
  for (let i = 0; i < 10; i++) mapReduce(elements);

  if (typeof globalThis.gc === "function") globalThis.gc();
  const __memBefore = process.memoryUsage();
  const t0 = performance.now();
  const cpu0 = process.cpuUsage();
  let result = 0;
  for (let i = 0; i < iterations; i++) result = mapReduce(elements);
  const elapsedMs = performance.now() - t0;
  const cpu = process.cpuUsage(cpu0);
  const mem = process.memoryUsage();

  const totalElements = iterations * elements;

  return {
    runtime: "nodejs",
    benchmark: "gpu-compute-v1",
    device: "cpu (serial)",
    elements,
    iterations,
    result,
    elapsedMs: Number(elapsedMs.toFixed(3)),
    iterationsPerSecond: Number((iterations / (elapsedMs / 1000)).toFixed(2)),
    // ops/sec = total per-element kernel evaluations across all iterations
    operationsPerSecond: Number((totalElements / (elapsedMs / 1000)).toFixed(0)),
    cpu: { totalMs: Number(((cpu.user + cpu.system) / 1000).toFixed(3)) },
    memory: { rssBytes: mem.rss, heapUsedBytes: mem.heapUsed, maxRssBytes: null, heapUsedBefore: __memBefore.heapUsed, heapUsedDelta: mem.heapUsed - __memBefore.heapUsed },
    notes: [
      "CPU serial execution — V8 JIT.",
      "GPU-shaped workload: per-element kernel + reduction. On GPU this parallelises across thousands of threads.",
    ],
  };
}

function parseIntFlag(name, fallback) {
  const idx = process.argv.indexOf(name);
  return idx >= 0 ? parseInt(process.argv[idx + 1] || "", 10) || fallback : fallback;
}

const elements = parseIntFlag("--elements", ELEMENTS);
const its = parseIntFlag("--operations", parseIntFlag("--iterations", DEFAULT_ITERATIONS));
console.log(JSON.stringify(runBench(elements, its), null, 2));

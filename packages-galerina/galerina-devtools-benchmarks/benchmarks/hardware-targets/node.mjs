import { performance } from "node:perf_hooks";

// Float32Array dot product — uses V8's auto-SIMD (typically SSE4 or AVX2 internally)
const VEC_SIZE = 1024;
const DEFAULT_ITERATIONS = 1_000_000;

function buildVectors() {
  const a = new Float32Array(VEC_SIZE);
  const b = new Float32Array(VEC_SIZE);
  for (let i = 0; i < VEC_SIZE; i++) {
    a[i] = (i + 1) * 0.001;
    b[i] = (VEC_SIZE - i) * 0.001;
  }
  return { a, b };
}

function dotProduct(a, b) {
  let sum = 0.0;
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
  return sum;
}

function runBench(iterations) {
  const { a, b } = buildVectors();

  // Warmup
  dotProduct(a, b);

  if (typeof globalThis.gc === "function") globalThis.gc();
  const __memBefore = process.memoryUsage();
  const t0 = performance.now();
  const cpu0 = process.cpuUsage();
  let result = 0;
  for (let i = 0; i < iterations; i++) {
    result = dotProduct(a, b);
  }
  const elapsedMs = performance.now() - t0;
  const cpu = process.cpuUsage(cpu0);
  const mem = process.memoryUsage();

  return {
    runtime: "nodejs",
    benchmark: "hardware-targets-v1",
    simdLevel: "auto (V8 JIT)",
    vecSize: VEC_SIZE,
    iterations,
    result,
    elapsedMs: Number(elapsedMs.toFixed(3)),
    iterationsPerSecond: Number((iterations / (elapsedMs / 1000)).toFixed(2)),
    fmaPerSecond: Number((iterations * VEC_SIZE / (elapsedMs / 1000)).toFixed(0)),
    cpu: { totalMs: Number(((cpu.user + cpu.system) / 1000).toFixed(3)) },
    memory: { rssBytes: mem.rss, heapUsedBytes: mem.heapUsed, maxRssBytes: null, heapUsedBefore: __memBefore.heapUsed, heapUsedDelta: mem.heapUsed - __memBefore.heapUsed },
    process: { pid: process.pid, node: process.version, platform: process.platform, arch: process.arch },
    notes: [
      "Float32Array dot product — 1024 elements × N iterations",
      "V8 auto-SIMD: typically SSE4 or AVX2 depending on host CPU",
      "Measures: FMA throughput per second. i5=AVX2, i9=AVX-512.",
    ],
  };
}

function parseIntFlag(name, fallback) {
  const idx = process.argv.indexOf(name);
  return idx >= 0 ? parseInt(process.argv[idx + 1] || "", 10) || fallback : fallback;
}

const its = parseIntFlag("--operations", parseIntFlag("--iterations", DEFAULT_ITERATIONS));
console.log(JSON.stringify(runBench(its), null, 2));

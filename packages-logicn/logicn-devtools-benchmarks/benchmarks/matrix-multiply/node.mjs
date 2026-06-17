import { performance } from "node:perf_hooks";

function matMul(n, iterations) {
  // Build float32 matrices
  const A = new Float32Array(n * n);
  const B = new Float32Array(n * n);
  for (let i = 0; i < n * n; i++) {
    A[i] = (i % n) * 0.001 + 0.1;
    B[i] = ((n * n - i) % n) * 0.001 + 0.1;
  }

  // Warmup
  const C = new Float32Array(n * n);
  for (let i = 0; i < 3; i++) {
    for (let r = 0; r < n; r++)
      for (let c = 0; c < n; c++) {
        let s = 0;
        for (let k = 0; k < n; k++) s += A[r * n + k] * B[k * n + c];
        C[r * n + c] = s;
      }
  }

  if (typeof globalThis.gc === "function") globalThis.gc();
  const __memBefore = process.memoryUsage();
  const t0 = performance.now();
  const cpu0 = process.cpuUsage();
  let checksum = 0;
  for (let iter = 0; iter < iterations; iter++) {
    for (let r = 0; r < n; r++)
      for (let c = 0; c < n; c++) {
        let s = 0;
        for (let k = 0; k < n; k++) s += A[r * n + k] * B[k * n + c];
        C[r * n + c] = s;
      }
    checksum += C[0];
  }
  const elapsedMs = performance.now() - t0;
  const cpu = process.cpuUsage(cpu0);
  const mem = process.memoryUsage();
  const flopsPerIter = 2 * n * n * n;  // multiply-add per element × elements
  const totalFlops = flopsPerIter * iterations;
  return {
    runtime: "nodejs", benchmark: "matrix-multiply-v1",
    matrixSize: n, iterations, checksum: checksum % 1e9,
    elapsedMs: Number(elapsedMs.toFixed(3)),
    iterationsPerSecond: Number((iterations / (elapsedMs / 1000)).toFixed(2)),
    gflops: Number((totalFlops / (elapsedMs / 1000) / 1e9).toFixed(3)),
    cpu: { totalMs: Number(((cpu.user + cpu.system) / 1000).toFixed(3)) },
    memory: { rssBytes: mem.rss, heapUsedBytes: mem.heapUsed, heapUsedBefore: __memBefore.heapUsed, heapUsedDelta: mem.heapUsed - __memBefore.heapUsed },
    notes: ["Float32Array matrix multiply — V8 JIT may auto-vectorise to AVX2"],
  };
}

function parseIntFlag(name, fb) { const i=process.argv.indexOf(name); return i>=0?parseInt(process.argv[i+1]||"",10)||fb:fb; }
const n   = parseIntFlag("--size", 64);
const its = parseIntFlag("--iterations", parseIntFlag("--operations", n <= 64 ? 500 : n <= 128 ? 50 : 5));
console.log(JSON.stringify(matMul(n, its), null, 2));

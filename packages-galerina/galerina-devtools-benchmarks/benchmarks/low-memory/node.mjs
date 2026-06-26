import { performance } from "node:perf_hooks";

const DEFAULT_STREAM_SIZE = 10000;
const DEFAULT_ITERATIONS = 5000;

function validate(n) { return (n >= 0 && n <= 1000000) ? 1 : 0; }
function classify(n) {
  if (n < 100)   return 1;
  if (n < 1000)  return 2;
  if (n < 10000) return 3;
  return 4;
}
function processStream(count) {
  let total = 0, valid = 0;
  for (let i = 0; i < count; i++) {
    if (validate(i)) { total += classify(i); valid++; }
  }
  return total;
}

function runBench(streamSize, iterations) {
  // Warmup + GC settle
  for (let i = 0; i < 100; i++) processStream(streamSize);
  if (typeof globalThis.gc === "function") globalThis.gc();

  const memBefore = process.memoryUsage();
  const cpuBefore = process.cpuUsage();
  const t0 = performance.now();

  let result = 0;
  for (let i = 0; i < iterations; i++) result = processStream(streamSize);

  const elapsedMs = performance.now() - t0;
  const cpu = process.cpuUsage(cpuBefore);
  const memAfter = process.memoryUsage();

  const heapDelta = memAfter.heapUsed - memBefore.heapUsed;
  const totalOps = iterations * streamSize;
  const bytesPerOp = heapDelta / totalOps;

  return {
    runtime: "nodejs", benchmark: "low-memory-v1",
    streamSize, iterations, result,
    elapsedMs: Number(elapsedMs.toFixed(3)),
    iterationsPerSecond: Number((iterations / (elapsedMs / 1000)).toFixed(2)),
    totalOps,
    memory: {
      rssBytes: memAfter.rss,
      heapUsedBytes: memAfter.heapUsed,
      heapUsedDelta: heapDelta,
      bytesPerOperation: Number(bytesPerOp.toFixed(2)),
    },
    cpu: { totalMs: Number(((cpu.user + cpu.system) / 1000).toFixed(3)) },
    process: { pid: process.pid, node: process.version, platform: process.platform },
    notes: [
      "V8 uses tagged integers — no heap allocation for small integer operations",
      `Bytes/op: ${bytesPerOp.toFixed(2)} (target: ~0 for integer-only flows)`,
    ],
  };
}

function parseIntFlag(name, fallback) {
  const idx = process.argv.indexOf(name);
  return idx >= 0 ? parseInt(process.argv[idx + 1] || "", 10) || fallback : fallback;
}

const size = parseIntFlag("--stream-size", DEFAULT_STREAM_SIZE);
const its  = parseIntFlag("--operations", parseIntFlag("--iterations", DEFAULT_ITERATIONS));
console.log(JSON.stringify(runBench(size, its), null, 2));

import { performance } from "node:perf_hooks";

const DEFAULT_ITERATIONS = 200000;

function runBench(iterations) {
  if (typeof globalThis.gc === "function") globalThis.gc();
  const __memBefore = process.memoryUsage();
  const t0 = performance.now();
  const cpu0 = process.cpuUsage();
  let sum = 0;
  for (let i = 0; i < iterations; i++) {
    const rec = { x: i, y: i * 2, z: i + 1 };  // simulate record creation
    sum += rec.x + rec.z;
  }
  const elapsedMs = performance.now() - t0;
  const cpu = process.cpuUsage(cpu0);
  const mem = process.memoryUsage();
  return {
    runtime: "nodejs", benchmark: "record-allocation-v1",
    iterations, sum, elapsedMs: Number(elapsedMs.toFixed(3)),
    iterationsPerSecond: Number((iterations / (elapsedMs/1000)).toFixed(2)),
    cpu: { totalMs: Number(((cpu.user+cpu.system)/1000).toFixed(3)) },
    memory: { rssBytes: mem.rss, heapUsedBytes: mem.heapUsed, maxRssBytes: null, heapUsedBefore: __memBefore.heapUsed, heapUsedDelta: mem.heapUsed - __memBefore.heapUsed },
    process: { pid: process.pid, node: process.version, platform: process.platform, arch: process.arch },
  };
}

function parseIntFlag(name, fallback) {
  const idx = process.argv.indexOf(name);
  return idx>=0 ? parseInt(process.argv[idx+1]||"",10)||fallback : fallback;
}

const its = parseIntFlag("--operations", parseIntFlag("--iterations", DEFAULT_ITERATIONS));
console.log(JSON.stringify(runBench(its), null, 2));

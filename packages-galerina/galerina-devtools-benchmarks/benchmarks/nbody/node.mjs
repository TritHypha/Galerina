import { performance } from "node:perf_hooks";

// N-body pairwise gravitational force — scaled-integer kernel.
// Mirrors benchmark.spore and python.py exactly: all intermediates stay < 2^31 and
// every division has a non-negative numerator, so checksum is identical across
// Node, Python and the Galerina integer path (Math.trunc == // == Galerina `/`).
const G = 100000;   // scaled gravitational constant
const SOFT = 1;     // softening^2 (avoids division by zero)

const posX = (i, t) => i * 73 + i * t;
const posY = (i, t) => i * 149 + i * t;

function netForce(i, t, n) {
  let fxi = 0, fyi = 0;
  for (let j = 0; j < n; j++) {
    if (j !== i) {
      const dx = posX(j, t) - posX(i, t);
      const dy = posY(j, t) - posY(i, t);
      const d2 = dx * dx + dy * dy + SOFT;
      const adx = dx < 0 ? -dx : dx;
      const ady = dy < 0 ? -dy : dy;
      const sx = dx < 0 ? -1 : (dx > 0 ? 1 : 0);
      const sy = dy < 0 ? -1 : (dy > 0 ? 1 : 0);
      fxi += sx * Math.trunc((G * adx) / d2);
      fyi += sy * Math.trunc((G * ady) / d2);
    }
  }
  return (fxi < 0 ? -fxi : fxi) + (fyi < 0 ? -fyi : fyi);
}

function simulate(n, steps) {
  let checksum = 0;
  for (let t = 0; t < steps; t++) {
    for (let i = 0; i < n; i++) {
      checksum = checksum + netForce(i, t, n);
      if (checksum > 1000000000) checksum = checksum - 1000000000;
      if (checksum < -1000000000) checksum = checksum + 1000000000;
    }
  }
  return checksum;
}

function run(n, steps, iterations) {
  // Warmup
  for (let w = 0; w < 3; w++) simulate(n, steps);

  if (typeof globalThis.gc === "function") globalThis.gc();
  const __memBefore = process.memoryUsage();
  const t0 = performance.now();
  const cpu0 = process.cpuUsage();
  let checksum = 0;
  for (let iter = 0; iter < iterations; iter++) checksum = simulate(n, steps);
  const elapsedMs = performance.now() - t0;
  const cpu = process.cpuUsage(cpu0);
  const mem = process.memoryUsage();

  const forceEvalsPerRun = steps * n * n;        // one pairwise loop per (t,i)
  const totalForceEvals = forceEvalsPerRun * iterations;
  return {
    runtime: "nodejs", benchmark: "nbody-v1",
    bodies: n, steps, iterations, checksum,
    elapsedMs: Number(elapsedMs.toFixed(3)),
    iterationsPerSecond: Number((iterations / (elapsedMs / 1000)).toFixed(2)),
    forceEvalsPerSecond: Number((totalForceEvals / (elapsedMs / 1000)).toFixed(0)),
    cpu: { totalMs: Number(((cpu.user + cpu.system) / 1000).toFixed(3)) },
    memory: { rssBytes: mem.rss, heapUsedBytes: mem.heapUsed, heapUsedBefore: __memBefore.heapUsed, heapUsedDelta: mem.heapUsed - __memBefore.heapUsed },
    notes: ["Scaled-integer N-body — checksum matches Python and Galerina bit-for-bit"],
  };
}

function intFlag(name, fb) { const i = process.argv.indexOf(name); return i >= 0 ? parseInt(process.argv[i + 1] || "", 10) || fb : fb; }
const n     = intFlag("--bodies", intFlag("--size", 64));
const steps = intFlag("--steps", 8);
const its   = intFlag("--iterations", intFlag("--operations", 200));
console.log(JSON.stringify(run(n, steps, its), null, 2));

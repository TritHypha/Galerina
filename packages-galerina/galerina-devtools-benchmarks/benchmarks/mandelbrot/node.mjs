import { performance } from "node:perf_hooks";

// Mandelbrot escape-time (Computer Language Benchmarks Game) — scaled-integer kernel.
// Mirrors benchmark.spore, python.py and bench.rs EXACTLY. The only negative division
// numerator (2*zr*zi) is split into sign+magnitude so EVERY integer division has a
// non-negative numerator → Math.trunc == Python // == Rust / == Galerina /, making the
// checksum identical across all runtimes. All intermediates stay < 2^31.
const W = 128, H = 128, MAXITER = 100, SCALE = 8192;
const MINR = -20480, SPANR = 28672;   // real axis: -2.5 .. +1.0 (×SCALE)
const MINI = -16384, SPANI = 32768;   // imag axis: -2.0 .. +2.0 (×SCALE)

function mandel() {
  let checksum = 0;
  for (let py = 0; py < H; py++) {
    const ci = MINI + Math.trunc((py * SPANI) / H);
    for (let px = 0; px < W; px++) {
      const cr = MINR + Math.trunc((px * SPANR) / W);
      let zr = 0, zi = 0, it = 0;
      while (it < MAXITER) {
        const zr2 = Math.trunc((zr * zr) / SCALE);
        const zi2 = Math.trunc((zi * zi) / SCALE);
        if (zr2 + zi2 > 32768) break;          // escape: |z|^2 > 4 (= 4*SCALE)
        const cross = zr * zi;                  // may be negative
        const sgn = cross < 0 ? -1 : 1;
        const mag = cross < 0 ? -cross : cross;
        const nzi = sgn * Math.trunc((2 * mag) / SCALE) + ci;
        const nzr = zr2 - zi2 + cr;
        zr = nzr; zi = nzi;
        it = it + 1;
      }
      checksum = checksum + it;
    }
  }
  return checksum;
}

function run(iterations) {
  for (let w = 0; w < 3; w++) mandel(); // warmup

  if (typeof globalThis.gc === "function") globalThis.gc();
  const memBefore = process.memoryUsage();
  const t0 = performance.now();
  const cpu0 = process.cpuUsage();
  let checksum = 0;
  for (let iter = 0; iter < iterations; iter++) checksum = mandel();
  const elapsedMs = performance.now() - t0;
  const cpu = process.cpuUsage(cpu0);
  const mem = process.memoryUsage();

  const pixels = W * H;                         // 16384 pixels per run
  return {
    runtime: "nodejs", benchmark: "mandelbrot-v1",
    iterations, pixels, checksum,
    elapsedMs: Number(elapsedMs.toFixed(3)),
    operationsPerSecond: Math.round((iterations * pixels) / (elapsedMs / 1000)), // pixels/sec
    cpu: { totalMs: Number(((cpu.user + cpu.system) / 1000).toFixed(3)) },
    memory: {
      rssBytes: mem.rss, heapUsedBytes: mem.heapUsed,
      heapUsedBefore: memBefore.heapUsed, heapUsedDelta: mem.heapUsed - memBefore.heapUsed,
    },
    notes: ["Scaled-integer Mandelbrot escape-time — checksum matches Python, Rust and Galerina bit-for-bit"],
  };
}

function intFlag(name, fb) { const i = process.argv.indexOf(name); return i >= 0 ? parseInt(process.argv[i + 1] || "", 10) || fb : fb; }
const its = intFlag("--iterations", intFlag("--operations", 200));
console.log(JSON.stringify(run(its), null, 2));

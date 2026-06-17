import { performance } from "node:perf_hooks";

// spectral-norm — scaled-integer power iteration (Computer Language Benchmarks Game family).
//
// Cross-language fairness: Node, Python and Rust compute the IDENTICAL integer
// sequence and therefore the SAME `checksum`. All values stay NON-NEGATIVE
// (A>0, vectors start positive and stay positive), so integer division is
// consistent across Node `Math.trunc(a/b)`, Python `a // b` and Rust `a / b`.
//
// One run does ITERS×2×2 matvecs over an n×n implicit matrix. The configured
// op count is ITERS×2×n² = 200000 A(i,j) evaluations; operationsPerSecond is
// reported on that A-evals/sec basis.
//
// Magnitude note: with evalA = SCALE/denom the largest intermediate matvec sum
// is ~4.9e11 — well within 2^53, so plain Number arithmetic is exact here (and
// well within i64 for the Rust mirror). The final dot products divide each
// element by SCALE before accumulating so that vBv*SCALE also stays in i64.
const SCALE = 4096;
const N = 100;
const ITERS = 10;
const A_EVALS = ITERS * 2 * N * N; // 200000

function evalA(i, j) {
  const denom = ((i + j) * (i + j + 1)) / 2 + i + 1; // always a positive integer
  return Math.trunc(SCALE / denom);
}

// dst[i] = ( sum_j A[i][j] * src[j] ) / SCALE   (transpose=true uses A[j][i])
function matvec(transpose, src, dst) {
  for (let i = 0; i < N; i++) {
    let s = 0;
    for (let j = 0; j < N; j++) {
      const a = transpose ? evalA(j, i) : evalA(i, j);
      s += a * src[j];
    }
    dst[i] = Math.trunc(s / SCALE);
  }
}

function spectralNorm() {
  const u = new Array(N).fill(SCALE);
  const v = new Array(N).fill(0);
  const tmp = new Array(N).fill(0);

  for (let it = 0; it < ITERS; it++) {
    // v = A^T A u
    matvec(false, u, tmp);
    matvec(true, tmp, v);
    // u = A^T A v
    matvec(false, v, tmp);
    matvec(true, tmp, u);
  }

  let vBv = 0;
  let vv = 0;
  for (let i = 0; i < N; i++) {
    const ui = Math.trunc(u[i] / SCALE);
    const vi = Math.trunc(v[i] / SCALE);
    vBv += ui * vi;
    vv += vi * vi;
  }
  return vv === 0 ? 0 : Math.trunc((vBv * SCALE) / vv);
}

function runBench(iterations) {
  // Correctness/warmup: compute once, capture checksum.
  let checksum = spectralNorm();
  for (let i = 0; i < 3; i++) spectralNorm(); // warmup

  if (typeof globalThis.gc === "function") globalThis.gc();
  const memBefore = process.memoryUsage();
  const t0 = performance.now();
  const cpu0 = process.cpuUsage();
  for (let iter = 0; iter < iterations; iter++) {
    checksum = spectralNorm();
  }
  const elapsedMs = performance.now() - t0;
  const cpu = process.cpuUsage(cpu0);
  const mem = process.memoryUsage();
  const heapDelta = mem.heapUsed - memBefore.heapUsed;

  return {
    runtime: "nodejs",
    benchmark: "spectral-norm-v1",
    iterations,
    aEvals: A_EVALS,
    checksum,
    elapsedMs: Number(elapsedMs.toFixed(3)),
    operationsPerSecond: Math.round((iterations * A_EVALS) / (elapsedMs / 1000)),
    cpu: { totalMs: Number(((cpu.user + cpu.system) / 1000).toFixed(3)) },
    memory: {
      rssBytes: mem.rss,
      heapUsedBytes: mem.heapUsed,
      heapUsedBefore: memBefore.heapUsed,
      heapUsedDelta: heapDelta,
    },
    notes: ["Scaled-int power iteration (n=100, 10 iters); checksum is byte-identical to Python and Rust"],
  };
}

function parseIntFlag(name, fb) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? parseInt(process.argv[i + 1] || "", 10) || fb : fb;
}
const its = parseIntFlag("--iterations", parseIntFlag("--operations", 50));
console.log(JSON.stringify(runBench(its), null, 2));

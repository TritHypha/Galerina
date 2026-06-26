import { performance } from "node:perf_hooks";

// binary-trees — THE allocation/GC benchmark (Computer Language Benchmarks Game).
// minDepth=4, maxDepth=10. Builds full binary trees of real heap objects, walks them
// to count nodes, and accumulates a deterministic integer checksum. One full run
// ALLOCATES EXACTLY 135854 nodes (the op unit) — so the bytes/op column below is the
// headline result, not throughput. The checksum (135854, since itemCheck counts one
// per node) is identical across Node, Python, Rust and the Galerina path.
const MIN_DEPTH = 4;
const MAX_DEPTH = 10;

// Real node objects: {l, r}. A leaf has both children null. These are genuine heap
// allocations so the heap-delta measurement captures the tree memory.
function bottomUpTree(depth) {
  if (depth <= 0) return { l: null, r: null };
  return { l: bottomUpTree(depth - 1), r: bottomUpTree(depth - 1) };
}

function itemCheck(node) {
  if (node.l === null && node.r === null) return 1;
  return 1 + itemCheck(node.l) + itemCheck(node.r);
}

function checksum() {
  let check = 0;
  const stretchDepth = MAX_DEPTH + 1;
  check += itemCheck(bottomUpTree(stretchDepth));

  const longLivedTree = bottomUpTree(MAX_DEPTH);

  for (let depth = MIN_DEPTH; depth <= MAX_DEPTH; depth += 2) {
    const iterations = 2 ** (MAX_DEPTH - depth + MIN_DEPTH);
    let sum = 0;
    for (let i = 1; i <= iterations; i++) sum += itemCheck(bottomUpTree(depth));
    check += sum;
  }

  check += itemCheck(longLivedTree);
  return check;
}

const NODES_PER_RUN = 135854; // verified: nodes allocated == checksum == 135854

function runBench(iterations) {
  // Correctness gate: a wrong checksum must never be reported as a benchmark result.
  const sample = checksum();
  if (sample !== NODES_PER_RUN) {
    throw new Error(`binary-trees checksum failed: got ${sample}, expected ${NODES_PER_RUN}`);
  }

  if (typeof globalThis.gc === "function") globalThis.gc(); // clean baseline for heap/op
  const memBefore = process.memoryUsage();
  const t0 = performance.now();
  const cpu0 = process.cpuUsage();
  let check = 0;
  for (let i = 0; i < iterations; i++) check = checksum();
  const elapsedMs = performance.now() - t0;
  const cpu = process.cpuUsage(cpu0);
  const mem = process.memoryUsage();
  const heapDelta = mem.heapUsed - memBefore.heapUsed;

  const totalNodes = NODES_PER_RUN * iterations;
  return {
    runtime: "nodejs", benchmark: "binary-trees-v1",
    iterations, nodesAllocated: NODES_PER_RUN, checksum: check,
    elapsedMs: Number(elapsedMs.toFixed(3)),
    operationsPerSecond: Math.round(totalNodes / (elapsedMs / 1000)), // nodes/sec
    cpu: { totalMs: Number(((cpu.user + cpu.system) / 1000).toFixed(3)) },
    memory: {
      rssBytes: mem.rss, heapUsedBytes: mem.heapUsed,
      heapUsedBefore: memBefore.heapUsed, heapUsedDelta: heapDelta,
      bytesPerOperation: Number((heapDelta / totalNodes).toFixed(2)), // per allocated node
    },
    notes: ["One op = one allocated tree node (135854/run). Headline metric = bytesPerOperation."],
  };
}

function parseIntFlag(name, fb) { const i = process.argv.indexOf(name); return i >= 0 ? parseInt(process.argv[i + 1] || "", 10) || fb : fb; }
const its = parseIntFlag("--iterations", parseIntFlag("--operations", 1));
console.log(JSON.stringify(runBench(its), null, 2));

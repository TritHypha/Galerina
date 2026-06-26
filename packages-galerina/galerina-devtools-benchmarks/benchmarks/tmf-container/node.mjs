import { performance } from "node:perf_hooks";
import { writeTmf } from "../../../galerina-ext-tmf/dist/index.js";

// tmf-container — ".tmf trust-container CREATION" throughput.
//
// THE NODE.JS COLUMN IS LITERALLY GALERINA'S SHIPPED ENGINE. `@galerina/ext-tmf` is
// pure TypeScript-on-Node (no `.spore` execution path exists), so its creation
// throughput *is* the Node.js row. python.py and bench.rs are independent,
// byte-identical reference implementations of the same v0 format — that is the
// honest "can other languages create a .tmf, and how fast?" comparison.
//
// One operation = build the canonical golden container (spec tmf-container-v0 §,
// 2 sections → exactly 203 bytes). Every runtime asserts the SAME published root,
// so all three provably do identical work (SHAKE256 leaf/node/root + LE packing).
const GOLDEN_ROOT = "43386e644c7b53aa0900cda21c15acd15f30b3fdf997950e39e7dd3dbc685212";

function i32le3(a, b, c) {
  const u = new Uint8Array(12); const dv = new DataView(u.buffer);
  dv.setInt32(0, a, true); dv.setInt32(4, b, true); dv.setInt32(8, c, true);
  return u;
}
const te = new TextEncoder();
const SECTIONS = [
  { kind: 1, modality: 0, coord: i32le3(3, 5, 7), payload: te.encode("hello") },
  { kind: 1, modality: 2, coord: i32le3(3, 5, 8), payload: te.encode("world!") },
];

const hex = (u) => Buffer.from(u).toString("hex");

function buildOnce() { return writeTmf(SECTIONS); }

function runBench(iterations) {
  // Correctness gate: a wrong build must NOT be reported as a benchmark result.
  const sample = buildOnce();
  const root = hex(sample.subarray(24, 56));
  if (sample.length !== 203 || root !== GOLDEN_ROOT) {
    throw new Error(`tmf-container correctness check failed: len=${sample.length} root=${root}`);
  }

  for (let i = 0; i < 1000; i++) buildOnce(); // warmup

  if (typeof globalThis.gc === "function") globalThis.gc();   // clean baseline for heap/op
  const memBefore = process.memoryUsage();
  const t0 = performance.now();
  const cpu0 = process.cpuUsage();
  let acc = 0;
  for (let i = 0; i < iterations; i++) acc += buildOnce().length;
  const elapsedMs = performance.now() - t0;
  const cpu = process.cpuUsage(cpu0);
  const mem = process.memoryUsage();
  const heapDelta = mem.heapUsed - memBefore.heapUsed;

  return {
    runtime: "nodejs", benchmark: "tmf-container-v1",
    note: "Node.js column = @galerina/ext-tmf engine (the shipped Galerina artifact)",
    iterations, containerBytes: sample.length, integrityRoot: root, checksum: acc,
    elapsedMs: Number(elapsedMs.toFixed(3)),
    operationsPerSecond: Number((iterations / (elapsedMs / 1000)).toFixed(0)),
    cpu: { totalMs: Number(((cpu.user + cpu.system) / 1000).toFixed(3)) },
    memory: {
      rssBytes: mem.rss, heapUsedBytes: mem.heapUsed,
      heapUsedBefore: memBefore.heapUsed, heapUsedDelta: heapDelta,
      bytesPerOperation: Number((heapDelta / iterations).toFixed(2)),  // per container
    },
    notes: ["One op = build the canonical golden .tmf (203 bytes, root asserted): SHAKE256 leaf/node/root + LE packing"],
  };
}

function parseIntFlag(name, fb) { const i = process.argv.indexOf(name); return i >= 0 ? parseInt(process.argv[i + 1] || "", 10) || fb : fb; }
const its = parseIntFlag("--iterations", parseIntFlag("--operations", 300000));
console.log(JSON.stringify(runBench(its), null, 2));

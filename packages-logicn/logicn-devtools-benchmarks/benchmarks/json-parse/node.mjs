import { performance } from "node:perf_hooks";

// Canonical record (matches benchmark.lln). split/length semantics are identical
// across LogicN, JS and Python, so the checksum is reproducible bit-for-bit.
const REC = "id:1001,name:alice,role:admin,active:true,score:95";

function countFields(obj) {
  return obj.split(",").length;
}
function sumValueLengths(obj) {
  let total = 0;
  for (const pair of obj.split(",")) {
    const v = pair.split(":")[1];
    if (v !== undefined) total += v.length;
  }
  return total;
}
function scanRecords(n) {
  let total = 0;
  for (let i = 0; i < n; i++) total += countFields(REC) + sumValueLengths(REC);
  return total;
}

// Realistic JSON workload for throughput: parse a real JSON object and read a field.
const JSON_REC = '{"id":1001,"name":"alice","role":"admin","active":true,"score":95}';
function parseJsonRecord() {
  const o = JSON.parse(JSON_REC);
  return o.name.length + o.role.length + o.score;
}

function bench(name, fn, iterations) {
  for (let i = 0; i < 5; i++) fn();
  if (typeof globalThis.gc === "function") globalThis.gc();
  const t0 = performance.now();
  for (let i = 0; i < iterations; i++) fn();
  const elapsedMs = performance.now() - t0;
  return {
    name, iterations,
    elapsedMs: Number(elapsedMs.toFixed(3)),
    operationsPerSecond: Number((iterations / (elapsedMs / 1000)).toFixed(0)),
    nsPerOp: Number((elapsedMs * 1e6 / iterations).toFixed(1)),
  };
}

function parseIntFlag(name, fb) { const i=process.argv.indexOf(name); return i>=0?parseInt(process.argv[i+1]||"",10)||fb:fb; }
const N   = parseIntFlag("--size",       500);
const its = parseIntFlag("--iterations", parseIntFlag("--operations", 200000));

if (typeof globalThis.gc === "function") globalThis.gc();
const __memBefore = process.memoryUsage();

const __results = {
  splitScan: bench("Split-scan parse (fields + value lengths)", () => scanRecords(N), Math.max(1, Math.floor(its / N))),
  jsonParse: bench("JSON.parse + field read", parseJsonRecord, its),
};

const __memAfter = process.memoryUsage();

const result = {
  runtime: "nodejs",
  benchmark: "json-parse-v1",
  records: N,
  iterations: its,
  checksum: scanRecords(N),
  results: __results,
  memory: {
    heapUsedBefore: __memBefore.heapUsed,
    heapUsedDelta: __memAfter.heapUsed - __memBefore.heapUsed,
  },
  notes: [
    `Records: ${N} key:value records of 5 fields each`,
    "checksum = N × (5 fields + 20 value-chars) via split/length — matches LogicN and Python",
    "splitScan mirrors the .lln kernel; jsonParse is the native JSON.parse path for reference",
  ],
};
console.log(JSON.stringify(result, null, 2));

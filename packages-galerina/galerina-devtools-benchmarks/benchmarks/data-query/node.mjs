import { performance } from "node:perf_hooks";

// Generate test dataset: N records with id, amount, status, category, date
function generateDataset(n) {
  const statuses = ["pending", "approved", "rejected", "flagged"];
  const categories = ["healthcare", "finance", "government", "retail"];
  return Array.from({ length: n }, (_, i) => ({
    id: i + 1,
    amount: (Math.sin(i) * 5000 + 5000) | 0,   // 0-10000, deterministic
    status: statuses[i % 4],
    category: categories[(i * 7) % 4],
    year: 2020 + (i % 5),
    priority: i % 10,
    approved: i % 3 !== 0,
  }));
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
const N   = parseIntFlag("--size",       1000);
const its = parseIntFlag("--iterations", parseIntFlag("--operations", 5000));
const dataset = generateDataset(N);

if (typeof globalThis.gc === "function") globalThis.gc();
const __memBefore = process.memoryUsage();

const __results = {
  // WHERE: filter by status (SQL: SELECT * FROM data WHERE status = 'approved')
  filterByStatus: bench("Filter by status (WHERE status='approved')",
    () => dataset.filter(r => r.status === "approved"), its),

  // WHERE + AND: compound filter
  filterCompound: bench("Compound filter (WHERE status='approved' AND amount>3000)",
    () => dataset.filter(r => r.status === "approved" && r.amount > 3000), its),

  // SUM aggregate (SQL: SELECT SUM(amount) FROM data WHERE category='healthcare')
  aggregateSum: bench("SUM aggregate by category",
    () => dataset.filter(r => r.category === "healthcare").reduce((s, r) => s + r.amount, 0), its),

  // GROUP BY (SQL: SELECT category, COUNT(*) FROM data GROUP BY category)
  groupBy: bench("GROUP BY category",
    () => dataset.reduce((acc, r) => { acc[r.category] = (acc[r.category] ?? 0) + 1; return acc; }, {}), its),

  // ORDER BY (SQL: SELECT * FROM data ORDER BY amount DESC LIMIT 10)
  sortTop10: bench("Sort + LIMIT 10 (ORDER BY amount DESC LIMIT 10)",
    () => [...dataset].sort((a, b) => b.amount - a.amount).slice(0, 10), its),

  // Nested lookup (JOIN-like: find approved high-value records in healthcare)
  joinLike: bench("JOIN-like: approved AND healthcare AND amount>5000",
    () => dataset.filter(r => r.approved && r.category === "healthcare" && r.amount > 5000), its),

  // Full text scan (simulate LIKE: find records where category starts with 'h')
  likeScan: bench("LIKE scan (category LIKE 'h%')",
    () => dataset.filter(r => r.category.startsWith("h")), its),
};

const __memAfter = process.memoryUsage();

const result = {
  runtime: "nodejs",
  benchmark: "data-query-v1",
  datasetSize: N,
  results: __results,
  memory: {
    heapUsedBefore: __memBefore.heapUsed,
    heapUsedDelta: __memAfter.heapUsed - __memBefore.heapUsed,
  },
  notes: [
    `Dataset: ${N} records, 7 fields each`,
    "Simulates typical governed data queries in financial/medical/government domains",
    "Galerina taint checker would flag unvalidated filters as Tainted<String>",
  ],
};
console.log(JSON.stringify(result, null, 2));

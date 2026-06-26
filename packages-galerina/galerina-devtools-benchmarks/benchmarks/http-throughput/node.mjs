/**
 * http-throughput node.mjs shim — runner-compatible wrapper.
 * Delegates to benchmark.mjs and outputs the standard JSON shape.
 */
import { createServer } from "node:http";
import { performance } from "node:perf_hooks";

function httpGet(port) {
  return new Promise((resolve, reject) => {
    const t0 = performance.now();
    import("node:http").then(({ request }) => {
      const r = request({ hostname: "127.0.0.1", port, path: "/health", method: "GET" }, (res) => {
        res.on("data", () => {});
        res.on("end", () => resolve(performance.now() - t0));
      });
      r.on("error", reject);
      r.end();
    });
  });
}

function pct(arr, p) {
  const s = [...arr].sort((a, b) => a - b);
  return +(s[Math.floor(s.length * p / 100)] ?? 0).toFixed(3);
}

async function bench(label, requests = 300) {
  const latencies = [];
  const server = createServer((_, res) => {
    res.writeHead(200);
    res.end('{"ok":true}');
  });
  await new Promise(r => server.listen(0, "127.0.0.1", r));
  const { port } = server.address();

  // Warmup
  for (let i = 0; i < 20; i++) await httpGet(port);

  const t0 = performance.now();
  for (let i = 0; i < requests; i++) latencies.push(await httpGet(port));
  const elapsed = performance.now() - t0;
  server.close();

  return {
    label,
    requestsPerSecond: Math.round(requests / (elapsed / 1000)),
    p50Ms: pct(latencies, 50),
    p99Ms: pct(latencies, 99),
    requests,
    elapsedMs: Math.round(elapsed),
  };
}

const nodeRaw = await bench("nodejs-raw");

console.log(JSON.stringify({
  benchmark: "http-throughput",
  runtime: "node",
  description: "Sequential HTTP requests/sec to localhost (no concurrency, measures server throughput)",
  nodeRaw_reqPerSec: nodeRaw.requestsPerSecond,
  nodeRaw_p50Ms: nodeRaw.p50Ms,
  nodeRaw_p99Ms: nodeRaw.p99Ms,
  requests: nodeRaw.requests,
  elapsedMs: nodeRaw.elapsedMs,
  notes: [
    `Raw Node.js HTTP: ${nodeRaw.requestsPerSecond.toLocaleString()} req/sec`,
    `p50 latency: ${nodeRaw.p50Ms}ms`,
    `p99 latency: ${nodeRaw.p99Ms}ms`,
    "Sequential (not concurrent) — isolates server throughput from client parallelism"
  ]
}, null, 2));

import { performance } from "node:perf_hooks";

const SAMPLE_HTML = "<div class=\"container\"><p>Hello, <b>World</b>!</p><script>alert('test')</script></div>";
const SAMPLE_JSON_OBJ = { status: "ok", user: { id: 1234, email: "user@example.com", role: "admin" }, data: Array.from({length: 20}, (_, i) => ({ id: i, value: i * 1.5 })) };
const SAMPLE_JSON_STR = JSON.stringify(SAMPLE_JSON_OBJ);
const WORDS = "The quick brown fox jumps over the lazy dog and then ran away very fast indeed";
const DEFAULT_ITERATIONS = 50000;

function bench(name, fn, iterations) {
  for (let i = 0; i < 100; i++) fn();
  if (typeof globalThis.gc === "function") globalThis.gc();
  const t0 = performance.now();
  for (let i = 0; i < iterations; i++) fn();
  const elapsedMs = performance.now() - t0;
  return {
    name,
    iterations,
    elapsedMs: Number(elapsedMs.toFixed(3)),
    operationsPerSecond: Number((iterations / (elapsedMs / 1000)).toFixed(0)),
    nsPerOp: Number((elapsedMs * 1e6 / iterations).toFixed(1)),
  };
}

function runBench(iterations = DEFAULT_ITERATIONS) {
  const htmlEscapeRegex = /[&<>"']/g;
  const htmlEscapeMap = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  const re = /\b\w{4,}\b/g;

  if (typeof globalThis.gc === "function") globalThis.gc();
  const __memBefore = process.memoryUsage();

  const results = {
    htmlEscape:      bench("HTML escape (replace chain)", () => {
      let s = SAMPLE_HTML;
      s = s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
      return s;
    }, iterations),
    htmlEscapeRegex: bench("HTML escape (regex map)", () =>
      SAMPLE_HTML.replace(htmlEscapeRegex, m => htmlEscapeMap[m] ?? m), iterations),
    jsonParse:    bench("JSON.parse", () => JSON.parse(SAMPLE_JSON_STR), iterations),
    jsonStringify:bench("JSON.stringify", () => JSON.stringify(SAMPLE_JSON_OBJ), iterations),
    stringSplit:  bench("String split+join", () => WORDS.split(" ").join("-"), iterations),
    wordCount:    bench("Word count", () => WORDS.split(" ").length, iterations),
    templateStr:  bench("Template string", () => `{"status":"ok","data":"${SAMPLE_HTML.slice(0,20)}","ts":${Date.now()}}`, iterations),
    regexMatch:   bench("Regex match (4+ char words)", () => WORDS.match(re)?.length ?? 0, iterations),
  };

  const __memAfter = process.memoryUsage();

  return {
    runtime: "nodejs",
    benchmark: "text-html-v1",
    results,
    memory: {
      heapUsedBefore: __memBefore.heapUsed,
      heapUsedDelta: __memAfter.heapUsed - __memBefore.heapUsed,
    },
    notes: [
      "HTML escaping is security-critical — must be fast to avoid temptation to skip it",
      "JSON parse/stringify is the most common web service operation",
    ],
  };
}

function parseIntFlag(name, fb) { const i=process.argv.indexOf(name); return i>=0?parseInt(process.argv[i+1]||"",10)||fb:fb; }
const its = parseIntFlag("--iterations", parseIntFlag("--operations", DEFAULT_ITERATIONS));
console.log(JSON.stringify(runBench(its), null, 2));

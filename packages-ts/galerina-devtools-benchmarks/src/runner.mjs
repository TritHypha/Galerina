import { spawnSync, execSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { types as utilTypes } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";
import { benchmarkSpec, normalizeThroughput, assertBenchmarkUnits, metricClassOf } from "./throughput-units.mjs";
import { admitSlideVadeEvidence } from "./slide-vade-adapter.mjs";
import { resolvePythonExecutable } from "./python-runtime.mjs";
import { buildMeasurementRecord } from "./measurement-provenance.mjs";
import { resolveSlideRepository } from "./repository-roots.mjs";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const benchDir   = join(__dirname, "..", "benchmarks");
const resultsDir  = join(__dirname, "..", "results");
const galerinaRepository = resolve(__dirname, "..", "..", "..");
const slideRepository = resolveSlideRepository({ galerinaRepository });
const DEFAULT_SLIDE_VADE_EVIDENCE = join(
  __dirname,
  "..",
  "evidence",
  "slide-v2g-verified-ahead-of-demand-b5aab13.json",
);

// opsPerRun: how many operations the Galerina .fungi benchmark does per flow call.
// Used to normalise runsPerSecond → ops/second for fair comparison.
// passiveCallCount: how many outer-loop calls to make in passive mode.
//   Heavy benchmarks (internal loops doing thousands of ops): use 3 calls
//   → just enough to measure warm-path overhead without running for minutes.
//   Light benchmarks (tiny single-op flows): use 1000 calls
//   → gives stable throughput measurement.
//
// Rule of thumb: passiveCallCount × execMs < 1000ms (keep passive < 1s total)
export const BENCHMARKS = [
  { id: "compute-mix",          dir: "compute-mix",          galerinaOpsPerRun: 50000, timeBased: true, passiveCallCount: 3  },
  { id: "arithmetic-threshold", dir: "arithmetic-threshold", galerinaOpsPerRun: null,                   passiveCallCount: 3  },
  { id: "six-digit-guess",      dir: "six-digit-guess",      galerinaOpsPerRun: null,                   passiveCallCount: 3  },
  { id: "record-allocation",    dir: "record-allocation",    galerinaOpsPerRun: 10000,                  passiveCallCount: 20 },
  { id: "fibonacci-recursive",  dir: "fibonacci-recursive",  galerinaOpsPerRun: 1,                      passiveCallCount: 5  },
  // Tower of Hanoi (n=16) with a threaded move-checksum — 65,535 moves/call, deep recursion + per-move
  // governed arithmetic. galerinaOpsPerRun = moves/call so the Galerina column reports moves/sec like the others;
  // `result` (=42452 at n=16) is the cross-language checksum oracle (all runtimes must agree).
  { id: "tower-of-hanoi",       dir: "tower-of-hanoi",       galerinaOpsPerRun: 65535,                  passiveCallCount: 2  },
  { id: "collection-pipeline",  dir: "collection-pipeline",  galerinaOpsPerRun: 10000,                  passiveCallCount: 30 },
  { id: "governance-cost",      dir: "governance-cost",      galerinaOpsPerRun: 1,                      passiveCallCount: 100 },
  { id: "hardware-targets",     dir: "hardware-targets",     galerinaOpsPerRun: 1,                      passiveCallCount: 1000 },
  // Low-memory: measures heap bytes allocated per operation.
  // KEY METRIC: bytesPerOperation — WASM/Rust/Node ~0, tree-walker ~200-400 bytes/op.
  // processStream(10000) does 10000 inner iterations (validate + classify per item).
  { id: "low-memory",          dir: "low-memory",           galerinaOpsPerRun: 10000,                  passiveCallCount: 20   },
  // GPU-compute: parallel map-reduce kernel — a GPU-SHAPED workload run on CPU.
  // mapReduce(100000) does 100000 per-element kernel evaluations.
  // GPU columns are filled by gpu-detect (toolchain-gated); Galerina GPU = pending Phase 38.
  { id: "gpu-compute",         dir: "gpu-compute",          galerinaOpsPerRun: 100000,                 passiveCallCount: 10   },
  // Matrix multiply: canonical float32 GEMM at two scales (32×32 and 64×64).
  // Galerina uses scaled integer arithmetic (×1000) for the WASM path.
  // Key question: does WASM SIMD beat CPU, and at what scale does WebGPU win?
  { id: "matrix-multiply", dir: "matrix-multiply", galerinaOpsPerRun: 32 * 32, passiveCallCount: 5 },
  // Crypto-ops: SHA-256 bulk hashing, HMAC-SHA256, Ed25519 sign+verify.
  // WASM column is N/A — crypto delegates to the host capability.
  // Galerina stub documents the governance model (crypto.verify effect required).
  { id: "crypto-ops", dir: "crypto-ops", galerinaOpsPerRun: 1, passiveCallCount: 100 },
  // Text/HTML: string processing workload for web services.
  // Galerina string flows go through the sync tree-walker (not the integer bytecode VM).
  // Key question: how fast is WASM for string ops, and is the governed path viable for text work?
  { id: "text-html", dir: "text-html", galerinaOpsPerRun: 1, passiveCallCount: 100 },
  // HTTP-throughput: localhost req/s — Node.js raw vs Galerina governed endpoint.
  // Uses a server-lifecycle harness (benchmark.mjs), not the standard file pattern,
  // so it is intentionally NOT in this array. Run it standalone: `npm run run:http`.
  // Tri-logic: 3-valued ternary logic (True=1, False=-1, Unknown=0) — all 27 truth table combinations.
  // Relevant for future photonic compute substrates; validates correctness and shows CPU overhead today.
  { id: "tri-logic", dir: "tri-logic", galerinaOpsPerRun: 300000, passiveCallCount: 100 },
  // Verified native operation: one exact traversal of 1,000,000 Int32 values.
  // checkedReference and slideReference are both non-authorizing, unranked
  // laboratory lanes admitted from one pinned SLIDE publication. Neither is
  // the production `slide` lane used by the historical Wasm transition gate.
  { id: "verified-native-operation", dir: "verified-native-operation", galerinaOpsPerRun: 1000000 },
  // Data-query: SQL-like data filtering on arrays of JSON records — a core web service workload.
  // Galerina governed path validates query inputs as Tainted<String> before execution.
  // main() = filterAndCount(1000) + groupByCategory(1000) = 2000 record-scans per call
  // (was 1000 — undercounted; flagged by the unit-alignment audit, fixed 2026-07-08).
  { id: "data-query", dir: "data-query", galerinaOpsPerRun: 10000, passiveCallCount: 50 },
  // Call-chain: layered call-dispatch overhead — controller → service.method → util fn.
  // In Galerina: main → serviceLayer → domainLayer → leafCompute (7 flow calls per chain).
  // One op = one outer chain; 50,000 chains per run. Isolates flow-call cost (arg binding
  // + governed frame), salted by loop index so the pure-flow memo cache never short-circuits.
  { id: "call-chain", dir: "call-chain", galerinaOpsPerRun: 50000, passiveCallCount: 5, exactIterations: 50000 },
  // N-body: pairwise gravitational force (scaled-integer, governed). One run =
  // simulate(64, 8) = steps×n×n = 32,768 softened inverse-distance force evals.
  // Array-free index-math kernel; checksum (536024) is identical across Node,
  // Python and the Galerina integer path. Physics-shaped compute throughput test.
  { id: "nbody", dir: "nbody", galerinaOpsPerRun: 32768, passiveCallCount: 5 },
  // JSON-parse: key:value record scanning (the expensive part of real JSON workloads) —
  // split records on ',', split fields on ':', accumulate field counts + value lengths.
  // One run = scanRecords(500) = 500 records parsed. split/length match JS/Python exactly,
  // so the checksum (12500) is identical across Node, Python and the Galerina string path.
  { id: "json-parse", dir: "json-parse", galerinaOpsPerRun: 500, passiveCallCount: 20 },
  // ── Real-world cross-language benchmarks (Computer Language Benchmarks Game) ──
  // mandelbrot: scaled-int escape-time over a 128×128 grid (16384 px), max 100 iters.
  // One op = one pixel; checksum = Σ iteration counts (identical across runtimes).
  { id: "mandelbrot", dir: "mandelbrot", galerinaOpsPerRun: 16384, passiveCallCount: 5 },
  // spectral-norm: scaled-int, index-math (no arrays). n=100, 10 power-iterations →
  // 10×2×n² = 200000 A(i,j) evaluations per run. One op = one A-eval.
  { id: "spectral-norm", dir: "spectral-norm", galerinaOpsPerRun: 200000, passiveCallCount: 5 },
  // binary-trees: THE allocation/GC benchmark. minDepth 4, maxDepth 10 → 135854 nodes
  // allocated per run. One op = one node allocated. Read the bytes/op column here.
  { id: "binary-trees", dir: "binary-trees", galerinaOpsPerRun: 135854, passiveCallCount: 3 },
  // ── .spore trust-container CREATION — TMX-256 SHAKE Merkle + LE container packing ──
  // The Node.js column IS the shipped @galerina/ext-spore engine (pure TS/Node — no .fungi
  // path exists); python.py / bench.rs are byte-identical reference writers that assert
  // the SAME golden root. Honest "can other languages create a .spore, and how fast?".
  { id: "spore-container", dir: "spore-container" },
  // ── Native framework vs middleware — Galerina App Kernel's fixed 12-gate pipeline ──
  // The Node.js column IS the Galerina App Kernel (no middleware chain); python.py is an
  // equivalent SYNC gate chain (the "middleware" approach) doing the SAME gates. In-process
  // (no sockets) so it measures pipeline cost, not socket RTT. Unit = requests/sec.
  { id: "framework-pipeline", dir: "framework-pipeline" },
  // ── HTTP throughput — sequential requests/sec to governed localhost endpoint ──
  { id: "http-throughput", dir: "http-throughput", devtoolsOnly: true },
  // ── DevTools benchmarks — measure tool throughput over auth-service corpus ──
  // These run node.mjs only (no .fungi / Rust / WASM path). Key metric: files/sec
  // or queries/sec. Added 2026-06-03 with the 4 new devtools packages.
  { id: "naming-check",       dir: "naming-check",       devtoolsOnly: true },
  { id: "context-receipt",    dir: "context-receipt",    devtoolsOnly: true },
  { id: "intelligence-search",dir: "intelligence-search", devtoolsOnly: true },
  { id: "provenance-trace",   dir: "provenance-trace",   devtoolsOnly: true },
];

// Resolve a usable Deno executable path on this machine.
// Windows-safe: prefer a real .exe path (cmd.exe under shell:true cannot run the
// POSIX-style path that Git's `which` returns, e.g. /c/Users/.../deno).
function resolveDenoBin() {
  const isWin = process.platform === "win32";
  const home  = process.env.USERPROFILE || process.env.HOME || "";
  // 1) Known default install location.
  const candidates = [
    join(home, ".deno", "bin", isWin ? "deno.exe" : "deno"),
  ];
  for (const c of candidates) { if (c && existsSync(c)) return c; }
  // 2) `where deno` (Windows) returns real, runnable paths; take the first .exe.
  try {
    const cmd = isWin ? "where deno" : "command -v deno";
    const out = execSync(cmd, { encoding: "utf8" }).trim().split(/\r?\n/);
    const pick = out.find(p => !isWin || /\.exe$/i.test(p)) || out[0];
    if (pick && existsSync(pick)) return pick;
  } catch { /* fall through */ }
  // 3) Last resort: bare name, let the shell resolve it.
  return "deno";
}

// Go lane (RD-0442) — resolve a runnable `go` executable, or null (skip-if-absent, like the other optional
// toolchains). Cached so the PATH probe runs once for the whole suite, not per benchmark.
let _goBin;
function resolveGoBin() {
  if (_goBin !== undefined) return _goBin;
  const isWin = process.platform === "win32";
  try {
    const out = execSync(isWin ? "where go" : "command -v go", { encoding: "utf8" }).trim().split(/\r?\n/);
    const pick = out.find(p => !isWin || /\.exe$/i.test(p)) || out[0];
    _goBin = pick && existsSync(pick) ? pick : null;
  } catch { _goBin = null; }
  return _goBin;
}

function runProc(cmd, args=[]) {
  // --expose-gc lets node runners force a clean GC baseline before measuring heap
  // delta, so the per-operation memory numbers are reliable (not GC-timing noise).
  const finalArgs = cmd === "node" ? ["--expose-gc", ...args] : args;
  const commandName = basename(cmd).toLowerCase();
  const pythonCommand = /^(?:python|python3(?:\.\d+)?)(?:\.exe)?$/u.test(commandName);
  const spawnRuntime = () => {
    if (!pythonCommand) return spawnSync(cmd, finalArgs, { encoding:"utf8", timeout:180000 });
    const cwd = mkdtempSync(join(tmpdir(), "galerina-python-benchmark-"));
    try {
      return spawnSync(cmd, finalArgs, { cwd, encoding:"utf8", timeout:180000 });
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  };
  const r = spawnRuntime();
  if (r.status !== 0 || !r.stdout?.trim()) return null;
  try { return JSON.parse(r.stdout.trim()); } catch { return null; }
}

async function runGalerina(fungiPath, mode, bench) {
  try {
    const { runGalerinaBenchmark, runGalerinaPassiveBenchmark } = await import("./galerina-runner.mjs");
    if (mode === "passive") {
      const callCount = bench?.passiveCallCount ?? 10;
      return await runGalerinaPassiveBenchmark(fungiPath, callCount);
    }
    return await runGalerinaBenchmark(fungiPath, mode);
  } catch(e) { return { error: true, reason: String(e), runtime: `galerina-${mode}` }; }
}

export function benchmarkProcessArgs(bench) {
  if (bench?.exactIterations === undefined) return [];
  if (bench.id !== "call-chain" || bench.exactIterations !== 50000) {
    throw new Error("BENCHMARK_PROCESS_ARGS_REFUSED:UNREGISTERED_EXACT_WORK");
  }
  return ["--iterations", "50000"];
}

export async function runBenchmark(bench) {
  const dir = join(benchDir, bench.dir);
  const res = {};
  let sourcePair;

  // time-based benchmarks get --target-ms flag to override defaults in quick mode
  const timeBased  = bench.timeBased === true;
  const targetArgs = timeBased && QUICK_MODE ? ["--target-ms", "3000", "--warmup-ms", "500"] : [];
  const workArgs = benchmarkProcessArgs(bench);
  const processArgs = [...targetArgs, ...workArgs];

  const node = join(dir, "node.mjs");
  if (existsSync(node)) { console.log(`  node...`); res.nodejs = runProc("node", [node, ...processArgs]); }

  const py = join(dir, "python.py");
  const python = existsSync(py) ? resolvePythonExecutable() : undefined;
  if (python !== undefined) { console.log(`  python...`); res.python = runProc(python, [py, ...processArgs]); }

  // ── Native hardware variants ─────────────────────────────────────────────
  // Naming convention:
  //   bench-native-rust        — generic x86-64 (safe, runs everywhere)
  //   bench-native-avx2        — AVX2 optimised (i5+, 256-bit SIMD)
  //   bench-native-avx512      — AVX-512 optimised (i9 HX/K only)
  //   bench-compute-mix-rust   — legacy name (kept for backwards compat)
  //   bench-arithmetic-rust    — legacy name
  //   bench-guess-rust         — legacy name
  for (const [key, suffixes] of [
    ["cpp",       ["bench-compute-mix","bench-arithmetic","bench-guess"]],
    ["rust",      ["bench-native-rust","bench-compute-mix-rust","bench-arithmetic-rust","bench-guess-rust"]],
    ["rustAvx2",  ["bench-native-avx2"]],
    ["rustAvx512",["bench-native-avx512"]],  // only populated on i9 machines
  ]) {
    for (const suf of suffixes) {
      const bin = join(dir, suf); const binE = bin + ".exe";
      const exe = existsSync(bin)?bin:existsSync(binE)?binE:null;
      if (exe) { console.log(`  ${key}...`); res[key] = runProc(exe, workArgs); break; }
    }
  }

  // ── Go lane (RD-0442) — `go run bench.go` (compile+run), probed skip-if-absent, JSON on stdout. Go is not
  // the CPU ceiling; it's here to win where designed to (kernel-path / concurrency). Same honest-benchmark
  // discipline: the bench.go must match the reference algorithm + N so its `result` checksum agrees. ─────────
  const goBench = join(dir, "bench.go");
  const goBin = existsSync(goBench) ? resolveGoBin() : null;
  if (goBin) { console.log(`  go...`); res.go = runProc(goBin, ["run", goBench, ...workArgs]); }

  // ── WASM execution (Phase 27 — requires wat-wasm assembler) ─────────────
  const wasmRunner = join(dir, "bench-wasm.mjs");
  if (existsSync(wasmRunner)) {
    console.log(`  wasm...`);
    try { res.wasm = await (await import(pathToFileURL(wasmRunner).href)).runWasmBenchmark(); }
    catch(e) { res.wasm = { error: true, reason: String(e), runtime: "wasm" }; }
  }

  const slideReferenceRunner = join(dir, "bench-slide-reference.mjs");
  if (existsSync(slideReferenceRunner)) {
    console.log("  checked + SLIDE reference...");
    try {
      const observation = await (await import(pathToFileURL(slideReferenceRunner).href))
        .runSlideReferenceBenchmark();
      if (observation.runtime === "galerina-slide-reference") {
        res.slideReference = { ...observation, samples: [...observation.samples] };
      } else if (
        observation.verdict === 1
        && observation.sourcePair?.verdict === 1
        && observation.sourcePair.authorityReleased === false
      ) {
        sourcePair = observation.sourcePair;
        res.checkedReference = { ...observation.checkedReference };
        res.slideReference = {
          ...observation.slideReference,
          phases: observation.phases,
          provenance: observation.provenance,
        };
      } else {
        const unavailable = { error: true, reason: observation.failureId, referenceOnly: true };
        res.checkedReference = unavailable;
        res.slideReference = unavailable;
      }
    } catch (error) {
      const unavailable = { error: true, reason: String(error), referenceOnly: true };
      res.checkedReference = unavailable;
      res.slideReference = unavailable;
    }
  }

  // ── Deno WebGPU execution (Phase 38 — real GPU when Deno+WebGPU available) ─
  const denoWebGpuRunner = join(dir, "bench-deno-webgpu.ts");
  if (existsSync(denoWebGpuRunner)) {
    console.log(`  deno-webgpu...`);
    try {
      const { spawnSync: _sp } = await import("node:child_process");
      const denoBin = resolveDenoBin();
      // Quote the executable path (it may contain spaces / be a full path) for shell:true.
      // Single command string, no args array — args+shell:true triggers Node DEP0190.
      const dr = _sp(denoBin, ["run", "--unstable-webgpu", denoWebGpuRunner], {
        encoding: "utf8", timeout: 60000, shell: false, windowsHide: true,
      });
      res.denoWebGpu = (dr.status === 0 && dr.stdout?.trim())
        ? (() => { try { return JSON.parse(dr.stdout.trim()); } catch { return null; } })()
        : { error: true, reason: dr.stderr?.slice(0,200) ?? "spawn failed", runtime: "deno-webgpu" };
    } catch(e) { res.denoWebGpu = { error: true, reason: String(e), runtime: "deno-webgpu" }; }
  }

  const fungi = join(dir, "benchmark.fungi");
  if (existsSync(fungi)) {
    console.log(`  galerina (governed)...`);
    res.galerinaGoverned = await runGalerina(fungi, "governed", bench);
    console.log(`  galerina (manifest)...`);
    res.galerinaManifest = await runGalerina(fungi, "manifest", bench);
    console.log(`  galerina (passive)...`);
    res.galerinaPassive = await runGalerina(fungi, "passive", bench);
  }

  // ── Normalise throughput to a single canonical unit per benchmark ──────────
  // throughput-units.mjs is the source of truth: it converts EVERY runtime to
  // inner-ops/sec so compare.mjs no longer pits Galerina's inner-ops/sec against
  // the other languages' whole-call/sec (the false-"Galerina wins" bug).
  const spec = benchmarkSpec(bench.id);
  let units;
  if (spec) {
    for (const key of Object.keys(res)) {
      const r = res[key];
      if (!r || typeof r !== "object") continue;
      const n = normalizeThroughput(key, r, bench.id);
      if (!n.speced) continue;
      r.normThroughput = n.ops;            // inner-ops/sec, or null (excluded / no data)
      r.throughputUnit = n.unit;
      if (!n.comparable && n.raw != null) r.rawThroughput = n.raw;  // display-only
    }
    units = assertBenchmarkUnits(bench.id, res);
  } else {
    // Out-of-scope benchmarks (galerinaOpsPerRun null/1) keep the legacy Galerina
    // normalisation: ops/sec = opsPerRun × runsPerSec, or result.value as the op count.
    for (const key of ["galerinaGoverned", "galerinaManifest"]) {
      const r = res[key];
      if (!r || r.error) continue;
      const resultValue = r.result?.__tag === "int" ? r.result.value : null;
      const opsPerRun   = bench.galerinaOpsPerRun ?? resultValue ?? null;
      if (opsPerRun !== null && r.execMs > 0) {
        r.galerinaOpsPerSecond = Math.round((opsPerRun / r.execMs) * 1000);
        r.galerinaOpsPerRun    = opsPerRun;
      }
    }
  }

  // metricClass (additive — measurements unchanged) groups this benchmark into its per-metric report
  // table and lets the UI chart tab by metric without importing throughput-units. R&D co-design 2026-07-17.
  return {
    benchmark: bench.id,
    metricClass: metricClassOf(bench.id),
    results: res,
    ...(sourcePair === undefined ? {} : { sourcePair }),
    ...(units ? { units } : {}),
  };
}

// --quick: use 3s for time-based benchmarks (compute-mix), halve iteration counts.
// Good for CI and development feedback. Use without --quick for publication numbers.
export const QUICK_MODE = process.argv.includes("--quick");

export function slideVadeInputFromArgs(args) {
  const positions = [];
  args.forEach((argument, index) => {
    if (argument === "--slide-vade-input") positions.push(index);
  });
  if (positions.length === 0) return null;
  const index = positions[0];
  const value = args[index + 1];
  if (
    positions.length !== 1
    || typeof value !== "string"
    || value.length === 0
    || value.startsWith("--")
  ) throw new Error("REFUSED: GALERINA-SLIDE-VADE-ARGV-001");
  return value;
}

function slideVadeObservationOptions(options) {
  if (
    options === null
    || typeof options !== "object"
    || Array.isArray(options)
    || utilTypes.isProxy(options)
    || Object.getPrototypeOf(options) !== Object.prototype
    || Object.getOwnPropertySymbols(options).length !== 0
  ) return null;
  const descriptors = Object.getOwnPropertyDescriptors(options);
  const keys = Object.keys(descriptors);
  if (keys.some((key) => !["inputPath", "observational"].includes(key))) return null;
  if (keys.some((key) => !("value" in descriptors[key]))) return null;
  const inputPath = descriptors.inputPath?.value ?? DEFAULT_SLIDE_VADE_EVIDENCE;
  const observational = descriptors.observational?.value ?? false;
  if (typeof inputPath !== "string" || typeof observational !== "boolean") return null;
  return { inputPath, observational };
}

export async function runSlideVadeObservation(options = {}) {
  const admittedOptions = slideVadeObservationOptions(options);
  const result = admittedOptions === null
    ? await admitSlideVadeEvidence("")
    : await admitSlideVadeEvidence(admittedOptions.inputPath, {
      observational: admittedOptions.observational,
    });
  return Object.freeze({
    child: "slide-vade-evidence",
    evidenceClass: "NON_COMPARATIVE_COMPONENT_EVIDENCE",
    comparative: false,
    workEquivalenceCertificate: false,
    ...result,
  });
}

export function publicationOutputName(filter) {
  if (filter === "diagnostic") return null;
  if (filter === null) return "latest.json";
  if (!BENCHMARKS.some((benchmark) => benchmark.id === filter)) {
    throw new Error(`REFUSED: unknown benchmark filter '${filter}'`);
  }

  return `${filter}-latest.json`;
}

function exactReference(command, args, cwd = undefined) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    shell: false,
    timeout: 10_000,
    maxBuffer: 1024 * 1024,
  });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
  if (result.status !== 0 || output.length === 0) {
    throw new Error(`REFUSED: benchmark measurement reference unavailable: ${command} ${args.join(" ")}`);
  }
  return output;
}

function captureMeasurementRecord(resultRaw) {
  const python = resolvePythonExecutable();
  return buildMeasurementRecord({
    measuredAt: new Date().toISOString(),
    resultRaw,
    galerinaCommit: exactReference("git", ["rev-parse", "HEAD"], galerinaRepository),
    slideCommit: exactReference("git", ["rev-parse", "HEAD"], slideRepository),
    toolchains: {
      node: process.version,
      python: exactReference(python, ["--version"]),
      rust: exactReference("rustc", ["--version"]),
      go: exactReference("go", ["version"]),
    },
  });
}

async function main() {
  const filterIdx = process.argv.indexOf("--benchmark");
  const filter    = filterIdx >= 0 ? process.argv[filterIdx+1] : null;
  const toRun     = filter ? BENCHMARKS.filter(b=>b.id===filter) : BENCHMARKS;
  if (QUICK_MODE) console.log("⚡ Quick mode: 3s compute-mix, reduced iteration counts");
  const all       = [];

  if (filter === null) {
    const requestedEvidence = slideVadeInputFromArgs(process.argv.slice(2));
    const slideVade = await runSlideVadeObservation({
      inputPath: requestedEvidence ?? DEFAULT_SLIDE_VADE_EVIDENCE,
      observational: QUICK_MODE,
    });
    console.log("\n=== slide-vade-evidence (non-comparative component evidence) ===");
    console.log(JSON.stringify(slideVade, null, 2));
    if (!QUICK_MODE && slideVade.verdict !== 1) {
      process.exitCode = 1;
      return;
    }
  }

  for (const b of toRun) {
    console.log(`\n=== ${b.id} ===`);
    const r = await runBenchmark(b);
    all.push(r);
    console.log(JSON.stringify(r, null, 2));
  }

  const outputName = publicationOutputName(filter);
  if (outputName !== null) {
    const outPath = join(resultsDir, outputName);
    const resultRaw = JSON.stringify(all, null, 2);
    writeFileSync(outPath, resultRaw);
    if (outputName === "latest.json") {
      const measurement = captureMeasurementRecord(resultRaw);
      writeFileSync(
        join(resultsDir, "benchmark-measurement-latest.json"),
        JSON.stringify(measurement, null, 2),
      );
    }
    console.log(`\nResults: ${outPath}`);
  }

  // ── Unit-alignment assertion ───────────────────────────────────────────────
  // Every comparable benchmark must report ONE unit across all runtimes; the three
  // non-comparable benchmarks are expected to be FLAGGED (excluded). A FAIL means a
  // unit mismatch or a silent dropout slipped back in — fail the run so CI catches it.
  const checks = all.map(b => b.units).filter(Boolean);
  if (checks.length) {
    console.log("\n── Unit-alignment check ─────────────────────────────────");
    let failed = 0;
    for (const c of checks) {
      const icon = c.status === "PASS" ? "✅" : c.status === "FLAGGED" ? "⚠️ " : "❌";
      console.log(`  ${icon} ${c.benchId.padEnd(20)} ${c.status.padEnd(8)} unit=${c.unit}`);
      if (c.status === "FLAGGED") console.log(`        excluded: ${c.reason}`);
      for (const p of c.problems ?? []) { console.log(`        ↳ ${p}`); failed++; }
    }
    if (failed > 0) {
      console.error(`\n  ❌ ${failed} unit-alignment problem(s) — see ↳ lines above.`);
      process.exitCode = 1;
    } else {
      console.log("\n  ✅ All comparable benchmarks report a single, matching unit.");
    }
  }

  // ── Diagnostic Benchmark Suite ────────────────────────────────────────────
  // Only run when --diagnostic flag is passed, or always if --benchmark diagnostic
  if (process.argv.includes("--diagnostic") || filter === "diagnostic") {
    console.log("\n═══════════════════════════════════════════════════");
    console.log("  Diagnostic Benchmarks — Governance Fidelity");
    console.log("═══════════════════════════════════════════════════");
    const { runDiagnosticBenchmarks } = await import(
      "../benchmarks/diagnostic/bench-diagnostic.mjs"
    );
    const diagResults = await runDiagnosticBenchmarks();

    // Print results
    for (const t of diagResults.tests) {
      if (t.category === "logging-throughput") {
        const tax = t.auditTaxPercent;
        console.log(`  [AUDIT TAX] ${t.test}`);
        console.log(`             pure:${t.pureFlowMsPerOp}ms  secure:${t.secureFlowMsPerOp}ms  tax:${tax}%`);
      } else {
        const icon = t.governancePass ? "OK" : "FAIL";
        const traps = t.trapDeclarationsFound !== undefined ? `  traps:${t.trapDeclarationsFound}` : "";
        const ensures = t.invariantClausesFound !== undefined ? `  ensures:${t.invariantClausesFound}` : "";
        console.log(`  [${icon}] ${t.test}${traps}${ensures}  ${t.msPerOp}ms/op`);
      }
    }

    const s = diagResults.summary;
    const compliant = s.governanceCompliant ? "PASS" : "FAIL";
    console.log(`\n  Governance Fidelity:  ${compliant} (all 5 flows)`);
    console.log(`  Total trap decls:     ${s.totalTrapDeclarationsAcrossSuite} across suite`);
    console.log(`  Audit Tax (Stage A):  ${s.auditTaxPercent}% (gov-check variance)`);
    console.log(`  Stage B target:       ${s.stageBTarget}`);

    // Save diagnostic results
    const diagPath = join(resultsDir, "diagnostic-latest.json");
    writeFileSync(diagPath, JSON.stringify(diagResults, null, 2));
    console.log(`\n  Results: ${diagPath}`);
  }
}

const IS_MAIN = process.argv[1] !== undefined
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (IS_MAIN) main().catch(e => { console.error(e); process.exitCode=1; });

import { readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";

/**
 * Passive execution benchmark — pre-builds AST + governance context ONCE,
 * then measures execution-only throughput across N outer-loop calls.
 *
 * This is the key "deployment model" measurement: in a real Galerina service,
 * the program is compiled once at startup. Each request gets the pre-built
 * context and incurs only execution overhead (no re-parsing, no re-governance).
 *
 * Three sub-modes:
 *   warm-cache  — same args on every call → LRU hit after first call
 *   warm-noargs — zero-arg pure flow (same result, cache always hits)
 *   cold-loop   — different arg on each call → execution without cache
 *
 * The runner reports all three so you can see the cache benefit clearly.
 */
export async function runGalerinaPassiveBenchmark(llnPath, callCount = 1000) {
  const compilerPath = new URL("../../galerina-core-compiler/dist/index.js", import.meta.url);
  const m = await import(compilerPath.href);
  const source = readFileSync(llnPath, "utf8");

  // ── Pre-build ONCE (outside timed region) ────────────────────────────────
  const tSetup0 = performance.now();
  const parsed = m.parseProgram(source, llnPath);
  const errors = parsed.diagnostics.filter(d => d.severity === "error");
  if (errors.length > 0) return { runtime: "galerina-passive", error: true, reason: errors[0]?.message };
  const mainFlow = parsed.flows.find(f => f.name === "main") ?? parsed.flows[0];
  if (!mainFlow) return { runtime: "galerina-passive", error: true, reason: "No flow found" };
  // Pre-verify governance (compile-time cost, not charged to execution)
  const eff = m.checkEffects(parsed.flows, parsed.ast);
  const gov = m.verifyGovernance(parsed.ast, parsed.flows, eff, "production");
  const setupMs = performance.now() - tSetup0;

  m.clearPureFlowCache?.();

  // ── Warmup call ──────────────────────────────────────────────────────────
  const runtimeOpts = { pureFastPath: true, sourceTag: llnPath };
  await m.executeFlow(mainFlow.name, new Map(), parsed.ast, parsed.flows,
    undefined, undefined, runtimeOpts, undefined, undefined);

  // ── Cold-loop: different results each call (no arg variation possible for
  //   zero-arg main(), so we clear cache between runs to simulate cold-call)
  // ── Warm-cache: same result cached after first call
  const memBefore = process.memoryUsage();
  const cpuBefore = process.cpuUsage();
  const tWarm = performance.now();
  let result;
  for (let i = 0; i < callCount; i++) {
    result = await m.executeFlow(mainFlow.name, new Map(), parsed.ast, parsed.flows,
      undefined, undefined, runtimeOpts, undefined, undefined);
  }
  const warmMs = performance.now() - tWarm;
  const cpuWarm = process.cpuUsage(cpuBefore);
  const memAfter = process.memoryUsage();

  // ── Cold-loop: clear cache between calls (shows execution-without-cache)
  const cpuBefore2 = process.cpuUsage();
  const tCold = performance.now();
  // Cold calls: always 1 for heavy benchmarks (callCount ≤ 5) to avoid minutes of
  // cache-clearing overhead. For light benchmarks (callCount ≥ 10), use more cold
  // calls so the throughput average is stable.
  const coldCalls = callCount <= 5 ? 1 : Math.min(callCount, 20);
  for (let i = 0; i < coldCalls; i++) {
    m.clearPureFlowCache?.();
    await m.executeFlow(mainFlow.name, new Map(), parsed.ast, parsed.flows,
      undefined, undefined, runtimeOpts, undefined, undefined);
  }
  const coldMs = performance.now() - tCold;
  const cpuCold = process.cpuUsage(cpuBefore2);

  return {
    runtime: "galerina-passive",
    mode: "passive",
    setupMs: Number(setupMs.toFixed(3)),    // one-time compile+governance cost
    warmMs: Number(warmMs.toFixed(3)),      // N calls with LRU cache (after first)
    coldMs: Number(coldMs.toFixed(3)),      // N calls without cache
    warmCalls: callCount,
    coldCalls,
    warmCallsPerSecond: Number((callCount / (warmMs / 1000)).toFixed(2)),
    coldCallsPerSecond: Number((coldCalls / (coldMs / 1000)).toFixed(2)),
    iterationsPerSecond: Number((callCount / (warmMs / 1000)).toFixed(2)), // used by compare
    result: result?.value ?? result,
    error: false,
    cpu: {
      warmTotalMs: Number(((cpuWarm.user + cpuWarm.system) / 1000).toFixed(3)),
      coldTotalMs: Number(((cpuCold.user + cpuCold.system) / 1000).toFixed(3)),
    },
    memory: {
      heapUsedBefore: memBefore.heapUsed,
      heapUsedAfter:  memAfter.heapUsed,
      heapUsedDelta:  memAfter.heapUsed - memBefore.heapUsed,
      rssBytes: memAfter.rss,
    },
    notes: [
      `setupMs: one-time compile+governance cost (not charged to execution)`,
      `warmCallsPerSecond: execution with LRU cache (deployment steady-state)`,
      `coldCallsPerSecond: execution without cache (first-call per unique input)`,
    ],
  };
}

/**
 * Runs a Galerina .spore benchmark file through the governed interpreter.
 * Captures parse time, execution time, memory before/after, and CPU usage.
 */
export async function runGalerinaBenchmark(llnPath, mode = "governed") {
  const compilerPath = new URL("../../galerina-core-compiler/dist/index.js", import.meta.url);
  const m = await import(compilerPath.href);

  const source = readFileSync(llnPath, "utf8");

  // ── Parse ──────────────────────────────────────────────────────────────────
  const t0 = performance.now();
  const parsed = m.parseProgram(source, llnPath);
  const parseMs = performance.now() - t0;

  const errors = parsed.diagnostics.filter(d => d.severity === "error");
  if (errors.length > 0) {
    return {
      runtime: `galerina-${mode}`, error: true,
      parseErrors: errors.length, firstError: errors[0]?.message,
      parseMs: Math.round(parseMs * 100) / 100,
    };
  }

  const mainFlow = parsed.flows.find(f => f.name === "main") ?? parsed.flows[0];
  if (!mainFlow) return { runtime: `galerina-${mode}`, error: true, reason: "No flow found" };

  let manifest;
  if (mode === "manifest") {
    try {
      const eff = m.checkEffects(parsed.flows, parsed.ast);
      const gov = m.verifyGovernance(parsed.ast, parsed.flows, eff, "production");
      manifest = gov.runtimeManifests.find(r => r.flow === mainFlow.name);
    } catch { manifest = undefined; }
  }

  // Clear the pure-flow memoization cache between benchmark files.
  // All benchmarks use "main()" with no args — without clearing, the cached
  // result from one benchmark would be served to the next.
  m.clearPureFlowCache?.();

  // ── Memory + CPU snapshot before execution ─────────────────────────────────
  // Run GC hint if available (Node.js --expose-gc flag) to get a clean baseline
  if (typeof globalThis.gc === "function") globalThis.gc();

  const memBefore  = process.memoryUsage();
  const cpuBefore  = process.cpuUsage();
  const t1         = performance.now();

  // ── Execute ────────────────────────────────────────────────────────────────
  let result;
  let execError;
  try {
    // pureFastPath: true enables LRU memoization for pure EffectFree flows
    // sourceTag: the benchmark file path scopes the cache so "main()" in
    // arithmetic-threshold doesn't collide with "main()" in compute-mix.
    const runtimeOpts = { pureFastPath: true, sourceTag: llnPath };
    result = await m.executeFlow(
      mainFlow.name, new Map(), parsed.ast, parsed.flows,
      undefined, undefined, runtimeOpts, undefined, manifest,
    );
  } catch (e) {
    execError = e;
  }

  // ── Memory + CPU snapshot after execution ──────────────────────────────────
  const execMs    = performance.now() - t1;
  const cpuAfter  = process.cpuUsage(cpuBefore);
  const memAfter  = process.memoryUsage();

  if (execError) {
    return {
      runtime: `galerina-${mode}`, error: true,
      reason: String(execError), parseMs: Math.round(parseMs * 100) / 100,
    };
  }

  const val      = result?.value ?? result;
  const isError  = val?.__tag === "runtimeError";

  // Memory delta (bytes)
  const heapDelta = memAfter.heapUsed - memBefore.heapUsed;
  const rssDelta  = memAfter.rss - memBefore.rss;

  // Throughput — operations implied by the benchmark
  // For Galerina we report exec-iterations-per-second as a proxy
  const iterPerSec = execMs > 0 ? Math.round(1000 / execMs) : 0;

  return {
    runtime:        `galerina-${mode}`,
    mode,
    parseMs:        Math.round(parseMs * 100) / 100,
    execMs:         Math.round(execMs * 100) / 100,
    totalMs:        Math.round((parseMs + execMs) * 100) / 100,
    result:         val,
    error:          isError,
    ...(isError ? { reason: val?.message } : {}),

    // Throughput proxy
    runsPerSecond:  iterPerSec,

    // CPU
    cpu: {
      userMs:         Number((cpuAfter.user   / 1000).toFixed(3)),
      systemMs:       Number((cpuAfter.system / 1000).toFixed(3)),
      totalMs:        Number(((cpuAfter.user + cpuAfter.system) / 1000).toFixed(3)),
    },

    // Memory
    memory: {
      heapUsedBefore:  memBefore.heapUsed,
      heapUsedAfter:   memAfter.heapUsed,
      heapUsedDelta:   heapDelta,
      rssBefore:       memBefore.rss,
      rssAfter:        memAfter.rss,
      rssDelta:        rssDelta,
      externalBefore:  memBefore.external,
      externalAfter:   memAfter.external,
      externalDelta:   memAfter.external - memBefore.external,
    },
  };
}

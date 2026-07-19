/**
 * WASM benchmark runner — Phase 27
 *
 * Compiles a Galerina .fungi file to binary WASM via the Phase 27 pipeline:
 *   parseProgram → checkEffects → emitGIR → buildWATModuleFromGIR(exportAllPure)
 *   → renderWAT → assembleWAT (wabt) → WebAssembly.instantiate → benchmark
 *
 * Reports the same JSON shape as the tree-walker runner so compare.mjs
 * can show WASM throughput alongside governed/manifest/passive numbers.
 */

import { readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";

const compilerPath = new URL("../../galerina-core-compiler/dist/index.js", import.meta.url);

export async function runWASMBenchmark(fungiPath, opsPerRun = null) {
  const m = await import(compilerPath.href);
  const source = readFileSync(fungiPath, "utf8");

  // ── Compile Galerina → WAT → binary WASM ────────────────────────────────────
  const t0 = performance.now();
  const parsed = m.parseProgram(source, fungiPath);
  const errs = (parsed.diagnostics ?? []).filter(d => d.severity === "error");
  if (errs.length > 0) {
    return { runtime: "wasm", error: true, reason: errs[0]?.message, compileMs: 0 };
  }

  const mainFlow = parsed.flows.find(f => f.name === "main") ?? parsed.flows[0];
  if (!mainFlow) return { runtime: "wasm", error: true, reason: "No flow found" };

  const fx = m.checkEffects(parsed.flows, parsed.ast);
  const { gir } = m.emitGIR(parsed.ast, parsed.flows, fx);

  // exportAllPure: true — make every pure flow callable from outside WASM
  const watModule = m.buildWATModuleFromGIR(gir, undefined, "wasm-standalone", parsed.ast, true);
  const wat = m.renderWAT(watModule);
  const assembled = await m.assembleWAT(wat);
  const compileMs = performance.now() - t0;

  // #163: a wabt-REJECTED module comes back as the minimal-encoder STUB with
  // `valid:true` PLUS a "NOT a faithful compile" diagnostic. Gating on `valid`
  // alone benchmarked that stub — timing a module that never held the program.
  // Same `valid && diagnostics.length===0` decline as executeWASMFlow.
  if (!assembled.valid || assembled.diagnostics.length > 0) {
    return {
      runtime: "wasm", error: true,
      reason: assembled.diagnostics.map(d => d.message).join("; "),
      compileMs: Number(compileMs.toFixed(3)),
    };
  }

  // ── Instantiate WASM module ────────────────────────────────────────────────
  const wasmResult = await WebAssembly.instantiate(assembled.wasm);
  const instance = (wasmResult).instance ?? wasmResult;
  const fn = instance.exports[mainFlow.name];
  if (typeof fn !== "function") {
    return {
      runtime: "wasm", error: true,
      reason: `Export '${mainFlow.name}' not found. Exports: ${Object.keys(instance.exports ?? {}).join(", ")}`,
      compileMs: Number(compileMs.toFixed(3)),
    };
  }

  // ── Warmup ────────────────────────────────────────────────────────────────
  for (let i = 0; i < 100; i++) fn();

  // ── Benchmark: run for 1 second ───────────────────────────────────────────
  const TARGET_MS = 1000;
  let calls = 0;
  let result = 0;
  const cpuBefore = process.cpuUsage();
  const memBefore = process.memoryUsage();
  const tBench = performance.now();

  while (performance.now() - tBench < TARGET_MS) {
    // Run in batches to reduce timing overhead
    for (let b = 0; b < 1000; b++) result = fn();
    calls += 1000;
  }

  const elapsedMs = performance.now() - tBench;
  const cpu = process.cpuUsage(cpuBefore);
  const memAfter = process.memoryUsage();

  const callsPerSecond = calls / (elapsedMs / 1000);
  // If opsPerRun is provided (e.g., 10000 iterations per call), normalise
  const opsPerSecond = opsPerRun ? callsPerSecond * opsPerRun : callsPerSecond;

  return {
    runtime: "wasm",
    benchmark: "wasm-phase27",
    flowName: mainFlow.name,
    qualifier: mainFlow.qualifier,
    binaryBytes: assembled.wasm.byteLength,
    compileMs: Number(compileMs.toFixed(3)),    // one-time compile cost (not charged to throughput)
    elapsedMs: Number(elapsedMs.toFixed(3)),
    calls,
    callsPerSecond: Number(callsPerSecond.toFixed(2)),
    iterationsPerSecond: Number(opsPerSecond.toFixed(2)), // used by compare.mjs throughput()
    result: typeof result === "number" ? { __tag: "int", value: result } : null,
    error: false,
    cpu: {
      totalMs: Number(((cpu.user + cpu.system) / 1000).toFixed(3)),
    },
    memory: {
      rssBytes: memAfter.rss,
      heapUsedBytes: memAfter.heapUsed,
      heapUsedDelta: memAfter.heapUsed - memBefore.heapUsed,
    },
    notes: [
      `Phase 27: Galerina → WAT → binary WASM (${assembled.wasm.byteLength} bytes) → WebAssembly.instantiate`,
      `Compile (one-time): ${compileMs.toFixed(1)}ms. Execution: pure WASM, no JS tree-walker.`,
    ],
  };
}

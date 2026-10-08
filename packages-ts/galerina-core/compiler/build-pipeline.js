"use strict";

// Guardian build-pipeline wiring (TODO L1064-L1065, SuperGrok 2026-10-08j).
// Runs vector/offload safety and target/capability import checks, then IR,
// optimiser, linker and CPU/WASM placeholder emitters.

const { checkWebhookSecurity, checkTargetCapabilityImports } = require("./security-checker");
const { checkEffects } = require("./effect-checker");
const { checkJsonApi } = require("./json-api-checker");
const { checkVectorOffloadSafety } = require("./vector-offload-safety");
const { buildIr } = require("./ir");
const { optimiseIr } = require("./optimiser");
const { linkIr } = require("./linker");
const { emitCpuOutput } = require("./cpu-output");
const { emitWasmOutput } = require("./wasm-output");
const { generateCompilerReport } = require("./report-generator");

function countErrors(diagnostics, errorType) {
  return (diagnostics || []).filter((item) => item.errorType === errorType && (item.severity === "error" || item.severity === "fatal")).length;
}

function applyBuildPipelineChecks(project, ast, diagnostics) {
  checkVectorOffloadSafety(project, ast, diagnostics);
  checkTargetCapabilityImports(ast, diagnostics);
}

function applyCompilerCheckers(project, ast, symbols, diagnostics) {
  checkWebhookSecurity(ast, diagnostics);
  checkEffects(ast, diagnostics);
  checkJsonApi(ast, symbols, diagnostics);
  applyBuildPipelineChecks(project, ast, diagnostics);
}

function runCompilerPipeline(result) {
  const ir = buildIr(result.ast, result.symbols);
  const optimiser = optimiseIr(ir, result.diagnostics);
  const linker = linkIr(optimiser.ir || ir, result.symbols, result.diagnostics);
  const cpu = emitCpuOutput(linker);
  const wasm = emitWasmOutput(linker);
  const stages = [
    { name: "security_checker", errors: countErrors(result.diagnostics, "BrowserImportBlocked") + countErrors(result.diagnostics, "CapabilityBlockedImport") },
    { name: "effect_checker", errors: countErrors(result.diagnostics, "PureFlowEffect") + countErrors(result.diagnostics, "UndeclaredEffect") },
    { name: "json_api_checker", errors: countErrors(result.diagnostics, "JsonApiCheckError") },
    { name: "vector_offload_safety", errors: countErrors(result.diagnostics, "VectorOffloadSafetyError") },
    { name: "target_capability_imports", errors: countErrors(result.diagnostics, "BrowserImportBlocked") + countErrors(result.diagnostics, "CapabilityBlockedImport") },
    { name: "ir", status: ir.schema },
    { name: "optimiser", status: optimiser.status },
    { name: "linker", status: linker.status },
    { name: "cpu_output_prototype", executable: cpu.executable },
    { name: "wasm_output_prototype", executable: wasm.executable }
  ];
  const pipeline = { stages, ir, optimiser, linker, cpu, wasm };
  pipeline.report = generateCompilerReport(result, pipeline);
  return pipeline;
}

module.exports = {
  applyBuildPipelineChecks,
  applyCompilerCheckers,
  runCompilerPipeline
};

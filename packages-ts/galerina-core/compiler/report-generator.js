"use strict";

// Dedicated report generator (TODO Create report generator, SuperGrok 2026-10-08j).
// Emits app.compiler-report.json for the guardian pipeline. Existing API,
// security, target and docs reports stay owned by compiler/galerina.js.

function generateCompilerReport(result, pipeline) {
  const diagnostics = result.diagnostics || [];
  const errors = diagnostics.filter((item) => item.severity === "error" || item.severity === "fatal");
  return {
    schema: "galerina.core.compiler-report.v1",
    compiler: result.ast && result.ast.compiler,
    project: result.ast && result.ast.project,
    ok: errors.length === 0,
    stages: (pipeline && pipeline.stages) || [],
    ir: pipeline && pipeline.ir ? { schema: pipeline.ir.schema, unitCount: pipeline.ir.unitCount } : null,
    optimiser: pipeline && pipeline.optimiser ? {
      status: pipeline.optimiser.status,
      rewritten: pipeline.optimiser.rewritten,
      passes: pipeline.optimiser.passes
    } : null,
    linker: pipeline && pipeline.linker ? { status: pipeline.linker.status } : null,
    cpu: pipeline && pipeline.cpu ? {
      schema: pipeline.cpu.schema,
      executable: pipeline.cpu.executable,
      runtimeStatus: pipeline.cpu.runtimeStatus
    } : null,
    wasm: pipeline && pipeline.wasm ? {
      schema: pipeline.wasm.schema,
      executable: pipeline.wasm.executable,
      runtimeStatus: pipeline.wasm.runtimeStatus
    } : null,
    diagnosticCounts: {
      total: diagnostics.length,
      errors: errors.length,
      warnings: diagnostics.filter((item) => item.severity === "warning").length
    }
  };
}

module.exports = {
  generateCompilerReport
};

"use strict";

// Prototype optimiser (TODO Create optimiser, SuperGrok 2026-10-08j).
// Identity pass over galerina.core.ir.v1. Does not rewrite .fungi source
// and does not invent a bytecode optimiser. Vector/offload errors refuse
// optimisation.

const { admitIr } = require("./ir");

function hasVectorOffloadErrors(diagnostics) {
  return (diagnostics || []).some((item) => item.errorType === "VectorOffloadSafetyError" && item.severity === "error");
}

function optimiseIr(ir, diagnostics) {
  const admitted = admitIr(ir);
  if (admitted.status !== "ADMITTED") {
    return {
      schema: "galerina.core.optimiser.v1",
      status: "REFUSED",
      rewritten: false,
      passes: [],
      problem: admitted.problem,
      ir: null
    };
  }
  if (hasVectorOffloadErrors(diagnostics)) {
    return {
      schema: "galerina.core.optimiser.v1",
      status: "REFUSED",
      rewritten: false,
      passes: [],
      problem: "Vector/offload safety errors refuse optimisation.",
      ir
    };
  }
  return {
    schema: "galerina.core.optimiser.v1",
    status: "ADMITTED",
    rewritten: false,
    passes: ["identity"],
    ir
  };
}

module.exports = {
  optimiseIr
};

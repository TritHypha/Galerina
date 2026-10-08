"use strict";

// Prototype linker (TODO Create linker, SuperGrok 2026-10-08j).
// Links IR units with the symbol table. Not a native object linker.
// Fail closed when IR is refused or same-file symbol duplicates exist.

const { admitIr } = require("./ir");

function linkIr(ir, symbols, diagnostics) {
  const admitted = admitIr(ir);
  if (admitted.status !== "ADMITTED") {
    return {
      schema: "galerina.core.linker.v1",
      status: "REFUSED",
      problem: admitted.problem,
      linked: null
    };
  }
  const duplicates = (symbols && symbols.duplicates) || [];
  const duplicateErrors = (diagnostics || []).filter((item) => item.errorType === "SymbolTableDuplicate");
  if (duplicates.length > 0 || duplicateErrors.length > 0) {
    return {
      schema: "galerina.core.linker.v1",
      status: "REFUSED",
      problem: "Symbol table duplicates refuse linking.",
      linked: null
    };
  }
  const byKind = {
    type: [],
    enum: [],
    flow: [],
    api: [],
    webhook: [],
    vectorize: []
  };
  for (const unit of ir.units) {
    if (!byKind[unit.kind]) byKind[unit.kind] = [];
    byKind[unit.kind].push(unit.name);
  }
  return {
    schema: "galerina.core.linker.v1",
    status: "ADMITTED",
    linked: {
      schema: ir.schema,
      compiler: ir.compiler,
      project: ir.project,
      unitCount: ir.unitCount,
      units: ir.units,
      index: byKind
    }
  };
}

module.exports = {
  linkIr
};

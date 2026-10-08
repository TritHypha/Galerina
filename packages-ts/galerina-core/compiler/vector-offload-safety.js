"use strict";

// Vector/offload safety for the build pipeline (TODO L1064, SuperGrok 2026-10-08j).
// Vector blocks must stay pure. Offload nodes from
// docs/primary-lane-and-offload-nodes.md are checked when present.
// Does not invent offload budget syntax; requires a documented policy word.

const { stripComments, findBlocks, loc } = require("./parser");

const SIDE_EFFECT_MARKERS = [
  "database.",
  "fetch(",
  "http.",
  "writeFile",
  "readFile",
  "saveToDatabase"
];

const OFFLOAD_POLICY_WORDS = [
  "timeout",
  "budget",
  "cpu_budget",
  "memory_budget",
  "failure",
  "fallback",
  "max_cpu",
  "queue"
];

function sideEffectsIn(text) {
  return SIDE_EFFECT_MARKERS.filter((marker) => text.includes(marker));
}

function checkVectorizeBlocks(ast, diagnostics) {
  for (const block of ast.vectorizeBlocks || []) {
    const expressions = (block.columns || []).map((column) => column.expression || "").join("\n");
    const hits = sideEffectsIn(expressions);
    if (hits.length === 0) continue;
    diagnostics.push({
      severity: "error",
      errorType: "VectorOffloadSafetyError",
      file: block.file,
      line: block.line,
      column: block.column,
      problem: "vectorize block uses " + hits.join(", ") + ".",
      suggestedFix: "Keep vectorize column expressions pure. Move I/O outside the block."
    });
  }
}

function checkVectorBlocks(project, diagnostics) {
  for (const source of project.files || []) {
    const content = stripComments(source.content);
    for (const block of findBlocks(content, /\bvector\s+([A-Za-z_][A-Za-z0-9_.]*)\s*\{/g)) {
      const hits = sideEffectsIn(block.body);
      if (hits.length === 0) continue;
      diagnostics.push({
        severity: "error",
        errorType: "VectorOffloadSafetyError",
        problem: "vector " + block.name + " uses " + hits.join(", ") + ".",
        suggestedFix: "Vector blocks must be pure. Move database and network writes outside the vector block.",
        ...loc(source, block.index)
      });
    }
  }
}

function checkPureVectorFlows(ast, diagnostics) {
  for (const flow of ast.flows || []) {
    if ((flow.vectorMode || "scalar") === "scalar") continue;
    const hits = sideEffectsIn(flow.body || "");
    if (hits.length === 0) continue;
    diagnostics.push({
      severity: "error",
      errorType: "VectorOffloadSafetyError",
      file: flow.file,
      line: flow.line,
      column: flow.column,
      problem: "vector flow " + flow.name + " uses " + hits.join(", ") + ".",
      suggestedFix: "Keep vector flows pure. Move I/O outside the vector flow."
    });
  }
}

function checkOffloadBlocks(project, diagnostics) {
  for (const source of project.files || []) {
    const content = stripComments(source.content);
    for (const block of findBlocks(content, /\boffload\s+([A-Za-z_][A-Za-z0-9_]*)\s*\{/g)) {
      const hits = sideEffectsIn(block.body);
      const hasPolicy = OFFLOAD_POLICY_WORDS.some((word) => block.body.includes(word));
      if (hits.length > 0 && !hasPolicy) {
        diagnostics.push({
          severity: "error",
          errorType: "VectorOffloadSafetyError",
          problem: "offload " + block.name + " uses " + hits.join(", ") + " without a timeout, budget, failure or fallback policy.",
          suggestedFix: "Add timeout, budget or failure policy to the offload node, or keep I/O on the primary lane.",
          ...loc(source, block.index)
        });
      }
    }
  }
}

function checkVectorOffloadSafety(project, ast, diagnostics) {
  checkVectorizeBlocks(ast, diagnostics);
  checkVectorBlocks(project, diagnostics);
  checkPureVectorFlows(ast, diagnostics);
  checkOffloadBlocks(project, diagnostics);
}

module.exports = {
  checkVectorOffloadSafety
};

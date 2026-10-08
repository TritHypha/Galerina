"use strict";

// Dedicated effect checker (TODO Create effect checker, SuperGrok 2026-10-08j).
// Fail closed when a pure flow uses I/O markers, or when a declared effects
// list does not cover a used marker. Flows with no effects list are not
// required to invent one. Contract blocks are stripped before scanning.

const { findMatchingBrace } = require("./parser");

const EFFECT_MARKERS = [
  { marker: "database.", families: ["database", "database.read", "database.write"] },
  { marker: "fetch(", families: ["network.outbound", "network"] },
  { marker: "http.", families: ["network.outbound", "network"] },
  { marker: "writeFile", families: ["filesystem"] },
  { marker: "readFile", families: ["filesystem"] },
  { marker: "env.", families: ["environment"] }
];

function stripContractBlocks(body) {
  if (typeof body !== "string" || !body) return "";
  let text = body;
  for (;;) {
    const start = text.search(/\bcontract\s*\{/);
    if (start === -1) return text;
    const open = text.indexOf("{", start);
    if (open === -1) return text.slice(0, start);
    const close = findMatchingBrace(text, open);
    if (close === -1) return text.slice(0, start);
    text = text.slice(0, start) + text.slice(close + 1);
  }
}

function usedMarkers(body) {
  const found = [];
  for (const item of EFFECT_MARKERS) {
    if (body.includes(item.marker)) found.push(item);
  }
  return found;
}

function declaresFamily(effects, families) {
  return families.some((family) => effects.includes(family) || effects.some((effect) => effect.startsWith(family + ".")));
}

function checkEffects(ast, diagnostics) {
  for (const flow of ast.flows || []) {
    const body = stripContractBlocks(flow.body || "");
    const markers = usedMarkers(body);
    if (markers.length === 0) continue;
    const qualifier = flow.qualifier || "normal";
    const effects = flow.effects || [];
    if (qualifier.includes("pure")) {
      diagnostics.push({
        severity: "error",
        errorType: "PureFlowEffect",
        file: flow.file,
        line: flow.line,
        column: flow.column,
        problem: "pure flow " + flow.name + " uses " + markers.map((item) => item.marker).join(", ") + ".",
        suggestedFix: "Remove I/O from the pure flow, or drop the pure qualifier and declare effects."
      });
      continue;
    }
    if (effects.length === 0) continue;
    for (const marker of markers) {
      if (declaresFamily(effects, marker.families)) continue;
      diagnostics.push({
        severity: "error",
        errorType: "UndeclaredEffect",
        file: flow.file,
        line: flow.line,
        column: flow.column,
        problem: "flow " + flow.name + " uses " + marker.marker + " without declaring " + marker.families[0] + ".",
        suggestedFix: "Add " + marker.families[0] + " to the flow effects list, or remove the operation."
      });
    }
  }
}

module.exports = {
  checkEffects,
  stripContractBlocks
};

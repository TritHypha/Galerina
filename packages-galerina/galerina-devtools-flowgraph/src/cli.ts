#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { parseProgram } from "@galerina/core-compiler";
import { buildFlowGraph, flowGraphToJson, flowGraphToMermaid } from "./flow-graph.js";
import { checkFlowGraph } from "./diagnostics.js";

const args = process.argv.slice(2);
const command = args[0];
const filePath = args[1];

if (!filePath) {
  process.stdout.write("Usage: galerina-graph <check|json|mermaid> <file.spore>\n");
  process.exit(1);
}

const source = readFileSync(filePath, "utf8");
const parsed = parseProgram(source, filePath);
const graph  = buildFlowGraph(parsed.ast, parsed.flows);

if (command === "json") {
  process.stdout.write(flowGraphToJson(graph) + "\n");
  process.exit(0);
}
if (command === "mermaid") {
  process.stdout.write(flowGraphToMermaid(graph) + "\n");
  process.exit(0);
}
if (command === "check") {
  const diags = checkFlowGraph(graph);
  if (diags.length === 0) {
    process.stdout.write("✓ Flow graph clean — no issues found\n");
    process.exit(0);
  }
  for (const d of diags) {
    const icon = d.severity === "error" ? "🔴" : d.severity === "warning" ? "🟡" : "ℹ️";
    process.stdout.write(`${icon} [${d.code}] ${d.message}\n`);
  }
  process.exit(diags.filter(d => d.severity === "error").length > 0 ? 2 : 0);
}
process.stderr.write("Unknown command: " + command + "\n");
process.exit(1);

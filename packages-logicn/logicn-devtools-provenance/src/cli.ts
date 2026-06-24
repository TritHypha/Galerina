#!/usr/bin/env node
// =============================================================================
// @logicn/devtools-provenance — CLI
//
// Commands:
//   logicn-provenance trace <file.lln> [--flow <name>]
//     Trace data lineage for one file (optionally filtered to one flow).
//
//   logicn-provenance audit <directory>
//     Scan all .lln flows in a directory, show risk summary.
//
//   logicn-provenance report <directory> [--json]
//     Full provenance report for a directory.
//
// Exit codes:
//   0 — success (no high-risk flows)
//   1 — usage error
//   2 — high-risk flows found (taint reaches sink ungated) OR a file the
//       analyzer could not parse (LLN-PROV-001 — blind analysis denies by default)
// =============================================================================

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { analyzeFile, buildProvenanceGraph, collectLlnFiles } from "./analyzer.js";
import { renderTextReport, renderJsonReport, renderProvReport } from "./reporter.js";
import type { ProvenanceOptions } from "./types.js";

const args = process.argv.slice(2);
const command = args[0];

async function main(): Promise<number> {
  switch (command) {
    // -------------------------------------------------------------------------
    case "trace": {
      const filePath = args[1];
      if (filePath === undefined || filePath === "") {
        process.stderr.write("Usage: logicn-provenance trace <file.lln> [--flow <name>]\n");
        return 1;
      }

      const flowIdx = args.indexOf("--flow");
      const options: ProvenanceOptions = flowIdx >= 0 && args[flowIdx + 1] !== undefined
        ? { flowFilter: args[flowIdx + 1] }
        : {};

      let source: string;
      try {
        source = readFileSync(resolve(filePath), "utf8");
      } catch {
        process.stderr.write(`Cannot read '${filePath}'\n`);
        return 1;
      }

      const result = analyzeFile(source, filePath, options);
      // LLN-PROV-001: a blind (parse-failed) analysis is non-clean -> flag high-risk.
      const highRisk = result.ungatedSinkReached || result.analyzerBlind;
      const riskFlows = highRisk
        ? (result.analyzerBlind
            ? [{
                flowName: "<parse-failure>",
                filePath,
                risk: "high" as const,
                description: `LLN-PROV-001: '${filePath}' failed to parse — analyzer BLIND, cannot certify clean (deny-by-default).`,
              }]
            : result.flows.map(flowName => ({
                flowName,
                filePath,
                risk: "high" as const,
                description: `Tainted data reaches a governed sink without a gate in flow '${flowName}'.`,
              })))
        : [];
      const graph = {
        nodes: result.nodes,
        edges: result.edges,
        summary: {
          totalFlows: result.flows.length,
          flowsWithTaintedData: result.hasTaintedData ? 1 : 0,
          flowsWithUngatedSinks: highRisk ? 1 : 0,
          trustBoundaryCrossings: result.edges.filter(e => {
            const fromNode = result.nodes.find(n => n.id === e.from);
            const toNode   = result.nodes.find(n => n.id === e.to);
            return fromNode?.isTrusted === false && toNode?.isTrusted === true;
          }).length,
        },
        riskFlows,
      };

      process.stdout.write(renderTextReport(graph, 1));
      // LLN-PROV-001: blind analysis is NOT a pass — deny by default.
      return highRisk ? 2 : 0;
    }

    // -------------------------------------------------------------------------
    case "audit": {
      const dir = args[1];
      if (dir === undefined || dir === "") {
        process.stderr.write("Usage: logicn-provenance audit <directory>\n");
        return 1;
      }

      const files = collectLlnFiles(resolve(dir));
      if (files.length === 0) {
        process.stderr.write(`No .lln files found in '${dir}'\n`);
        return 0;
      }

      const graph = buildProvenanceGraph(files);

      process.stdout.write(`\nProvenance Audit — ${dir}\n`);
      process.stdout.write(`Files: ${files.length} | Flows: ${graph.summary.totalFlows} | Tainted: ${graph.summary.flowsWithTaintedData} | High-risk: ${graph.summary.flowsWithUngatedSinks}\n\n`);

      if (graph.riskFlows.length === 0) {
        process.stdout.write("  No high-risk flows — all tainted data passes through gates before reaching sinks.\n\n");
        return 0;
      }

      for (const r of graph.riskFlows) {
        process.stdout.write(`  [${r.risk.toUpperCase()}] ${r.flowName} (${r.filePath})\n`);
        process.stdout.write(`         ${r.description}\n`);
      }
      process.stdout.write("\n");
      return 2;
    }

    // -------------------------------------------------------------------------
    case "report": {
      const dir = args[1];
      if (dir === undefined || dir === "") {
        process.stderr.write("Usage: logicn-provenance report <directory> [--json] [--format prov-json]\n");
        return 1;
      }

      const wantJson = args.includes("--json");
      const formatIdx = args.indexOf("--format");
      const formatArg = formatIdx >= 0 ? args[formatIdx + 1] : undefined;
      const wantProvJson = formatArg === "prov-json";

      const files = collectLlnFiles(resolve(dir));

      if (files.length === 0) {
        process.stderr.write(`No .lln files found in '${dir}'\n`);
        return 0;
      }

      const graph = buildProvenanceGraph(files);

      if (wantProvJson) {
        process.stdout.write(renderProvReport(graph, { format: "prov-json" }) + "\n");
      } else if (wantJson) {
        process.stdout.write(renderJsonReport(graph, files.length) + "\n");
      } else {
        process.stdout.write(renderTextReport(graph, files.length));
      }

      return graph.summary.flowsWithUngatedSinks > 0 ? 2 : 0;
    }

    // -------------------------------------------------------------------------
    default: {
      process.stdout.write("logicn-provenance — Data Lineage & Provenance Tracker for LogicN\n\n");
      process.stdout.write("Commands:\n");
      process.stdout.write("  trace <file.lln> [--flow <name>]   Trace data lineage for one file\n");
      process.stdout.write("  audit <directory>                   Scan all flows, show risk summary\n");
      process.stdout.write("  report <directory> [--json]         Full provenance report\n\n");
      process.stdout.write("Exit codes: 0=clean, 1=usage error, 2=high-risk flows found\n");
      return 0;
    }
  }
}

main().then(code => process.exit(code)).catch(e => {
  process.stderr.write(`Fatal: ${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
});

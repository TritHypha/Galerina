// =============================================================================
// @galerina/devtools-provenance — Report Renderer
//
// Renders a ProvenanceGraph as a human-readable text report or JSON.
// =============================================================================

import type { ProvenanceGraph, DataNode } from "./types.js";

// ---------------------------------------------------------------------------
// Text report
// ---------------------------------------------------------------------------

function pad(str: string, width: number): string {
  return str.length >= width ? str : str + " ".repeat(width - str.length);
}

function boxLine(content: string, width: number): string {
  const padded = content.padEnd(width - 4, " ");
  return `║ ${padded} ║`;
}

function boxTop(width: number): string {
  return "╔" + "═".repeat(width - 2) + "╗";
}

function boxBottom(width: number): string {
  return "╚" + "═".repeat(width - 2) + "╝";
}

function kindLabel(node: DataNode): string {
  switch (node.kind) {
    case "source":    return "SOURCE   ";
    case "transform": return "TRANSFORM";
    case "sink":      return "SINK     ";
  }
}

function trustLabel(node: DataNode): string {
  if (node.kind === "source")    return node.isTrusted ? "[trusted]"   : "[untrusted]";
  if (node.kind === "transform") return node.isTrusted ? "→ [trusted]" : "→ [untrusted]";
  if (node.kind === "sink")      return node.isTrusted ? "✓ [gated]"    : "✗ [ungated — HIGH RISK]";
  return "";
}

/**
 * Renders the provenance report as a formatted text string.
 *
 * @param graph         - The provenance graph to render
 * @param fileCount     - Total number of .spore files scanned
 */
export function renderTextReport(graph: ProvenanceGraph, fileCount: number): string {
  const lines: string[] = [];
  const W = 60;

  const { totalFlows, flowsWithTaintedData, flowsWithUngatedSinks } = graph.summary;

  const header1 = `Files: ${fileCount} | Flows: ${totalFlows} | Tainted data flows: ${flowsWithTaintedData}`;
  const riskLabel = flowsWithUngatedSinks === 0
    ? `HIGH RISK (ungated sink): 0 ✓`
    : `HIGH RISK (ungated sink): ${flowsWithUngatedSinks} ✗`;

  lines.push(boxTop(W));
  lines.push(boxLine("══ Data Provenance Report", W));
  lines.push(boxLine(header1, W));
  lines.push(boxLine(riskLabel, W));
  lines.push(boxBottom(W));
  lines.push("");

  // Group nodes by flow and file
  const flowGroups = new Map<string, { filePath: string; nodes: DataNode[] }>();
  for (const node of graph.nodes) {
    const key = `${node.flowName}:::${node.filePath}`;
    if (!flowGroups.has(key)) {
      flowGroups.set(key, { filePath: node.filePath, nodes: [] });
    }
    flowGroups.get(key)!.nodes.push(node);
  }

  // Sort flows — risk flows first
  const riskFlowKeys = new Set(
    graph.riskFlows.map(r => `${r.flowName}:::${r.filePath}`)
  );
  const sortedKeys = [...flowGroups.keys()].sort((a, b) => {
    const aRisk = riskFlowKeys.has(a) ? 0 : 1;
    const bRisk = riskFlowKeys.has(b) ? 0 : 1;
    return aRisk - bRisk || a.localeCompare(b);
  });

  for (const key of sortedKeys) {
    const group = flowGroups.get(key)!;
    const [flowName] = key.split(":::");
    const shortPath = group.filePath.replace(/\\/g, "/");

    lines.push(`FLOW: ${flowName} (${shortPath})`);

    // Sort: sources first, then transforms, then sinks
    const ordered = [...group.nodes].sort((a, b) => {
      const order = { source: 0, transform: 1, sink: 2 } as const;
      return order[a.kind] - order[b.kind];
    });

    for (const node of ordered) {
      const kl = kindLabel(node);
      const tl = trustLabel(node);
      lines.push(`  ${kl}  ${pad(node.label, 36)} ${tl}`);
    }

    // Show risk warning if applicable
    if (riskFlowKeys.has(key)) {
      const riskEntry = graph.riskFlows.find(r => `${r.flowName}:::${r.filePath}` === key);
      if (riskEntry !== undefined) {
        lines.push(`  !! ${riskEntry.description}`);
      }
    }

    lines.push("");
  }

  // If no flows found
  if (flowGroups.size === 0) {
    lines.push("  (no flows found — check that the directory contains .spore files)");
    lines.push("");
  }

  // Risk summary section
  if (graph.riskFlows.length > 0) {
    lines.push("RISK SUMMARY");
    lines.push("=" .repeat(58));
    for (const r of graph.riskFlows) {
      lines.push(`  [${r.risk.toUpperCase()}] ${r.flowName} — ${r.description}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// JSON report
// ---------------------------------------------------------------------------

export function renderJsonReport(graph: ProvenanceGraph, fileCount: number): string {
  const output = {
    schemaVersion: "spore.provenance.v1",
    fileCount,
    ...graph,
  };
  return JSON.stringify(output, null, 2);
}

// ---------------------------------------------------------------------------
// W3C PROV-JSON serialisation
//
// Spec: https://www.w3.org/TR/prov-json/
//
// Mapping:
//   source nodes   → entity  (spore:tainted: true when !isTrusted)
//   transform/gate nodes → activity
//   sink nodes     → entity + wasGeneratedBy link to last gate in the same flow
// ---------------------------------------------------------------------------

export interface ProvReportOptions {
  /** Output format selector. "prov-json" emits a W3C PROV-JSON structure. */
  format?: "prov-json" | "text" | "json";
}

/**
 * Render a provenance graph in W3C PROV-JSON format.
 *
 * Structure:
 * {
 *   "prefix": { "spore": "https://galerina.io/prov/v1#" },
 *   "entity":  { "spore:source_N": { "prov:label": "...", "spore:tainted": true } },
 *   "activity": { "spore:gate_N": { "prov:label": "...", "spore:kind": "gate" } },
 *   "wasGeneratedBy": { "spore:clean_N": { "prov:entity": "...", "prov:activity": "..." } }
 * }
 */
export function renderProvReport(graph: ProvenanceGraph, opts: ProvReportOptions = {}): string {
  if (opts.format !== "prov-json") {
    // Default: delegate to text report
    return renderTextReport(graph, graph.nodes.length);
  }

  const prefix = {
    spore: "https://galerina.io/prov/v1#",
  };

  const entity: Record<string, Record<string, unknown>> = {};
  const activity: Record<string, Record<string, unknown>> = {};
  const wasGeneratedBy: Record<string, Record<string, string>> = {};

  // Index nodes by id for edge traversal
  const nodeById = new Map<string, DataNode>();
  for (const node of graph.nodes) {
    nodeById.set(node.id, node);
  }

  // Track: for each flow, the last gate/transform node id
  const lastGateByFlow = new Map<string, string>();
  // Process transforms first to build lastGate map
  for (const node of graph.nodes) {
    if (node.kind === "transform") {
      lastGateByFlow.set(node.flowName, `spore:gate_${node.id}`);
    }
  }

  let entityCounter = 0;
  let activityCounter = 0;
  let cleanCounter = 0;

  for (const node of graph.nodes) {
    if (node.kind === "source") {
      entityCounter++;
      const key = `spore:source_${entityCounter}`;
      entity[key] = {
        "prov:label": node.label,
        "spore:tainted": !node.isTrusted,
        "spore:flowName": node.flowName,
        "spore:kind": node.sourceKind ?? "unknown",
      };
    } else if (node.kind === "transform") {
      activityCounter++;
      const key = `spore:gate_${activityCounter}`;
      activity[key] = {
        "prov:label": node.label,
        "spore:kind": node.transformKind ?? "gate",
        "spore:flowName": node.flowName,
        "spore:trusted": node.isTrusted,
      };
      // Update lastGateByFlow with the key for later sink linking
      lastGateByFlow.set(node.flowName, key);
    } else if (node.kind === "sink") {
      // Sink nodes appear as entities; link to last gate via wasGeneratedBy
      entityCounter++;
      const entityKey = `spore:sink_${entityCounter}`;
      entity[entityKey] = {
        "prov:label": node.label,
        "spore:tainted": !node.isTrusted,
        "spore:flowName": node.flowName,
        "spore:kind": node.sinkKind ?? "unknown",
      };

      const lastGate = lastGateByFlow.get(node.flowName);
      if (lastGate !== undefined) {
        cleanCounter++;
        const wgbKey = `spore:clean_${cleanCounter}`;
        wasGeneratedBy[wgbKey] = {
          "prov:entity": entityKey,
          "prov:activity": lastGate,
        };
      }
    }
  }

  const provJson = {
    prefix,
    entity,
    activity,
    wasGeneratedBy,
  };

  return JSON.stringify(provJson, null, 2);
}

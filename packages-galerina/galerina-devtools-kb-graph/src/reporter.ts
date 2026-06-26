// =============================================================================
// reporter.ts — generates DOT, JSON, and Markdown outputs from a KBGraph.
// =============================================================================

import type { KBGraph } from "./graph.js";
import type { KBDocNode } from "./scanner.js";

// ── Layer colour map ──────────────────────────────────────────────────────────

const LAYER_FILL: Record<string, string> = {
  "Layer 0":  "#ffe0b2",   // orange
  "Layer 1":  "#e3f2fd",   // blue
  "Layer 2A": "#e8f5e9",   // green
  "Layer 2B": "#e8f5e9",   // green
  "Layer 3":  "#f3e5f5",   // purple
};

const DEFAULT_FILL = "#f5f5f5";

function nodeLabel(doc: KBDocNode): string {
  // Escape backslashes and double-quotes for DOT
  const safe = (s: string) => s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  let label = safe(doc.title);
  if (doc.layer) label += `\\n(${safe(doc.layer)})`;
  if (doc.lnlCodes.length > 0) {
    label += `\\n${doc.lnlCodes.length} SPORE code${doc.lnlCodes.length !== 1 ? "s" : ""}`;
  }
  return label;
}

export function generateDOT(graph: KBGraph): string {
  const lines: string[] = [
    "digraph KBGraph {",
    "  rankdir=LR;",
    '  node [shape=box, style=filled, fontname="Helvetica", fontsize=10];',
    '  edge [fontname="Helvetica", fontsize=9];',
    "",
  ];

  for (const node of graph.nodes) {
    const fill = node.layer ? (LAYER_FILL[node.layer] ?? DEFAULT_FILL) : DEFAULT_FILL;
    const orphanBorder = graph.orphans.includes(node.id) ? ", color=gray, penwidth=2" : "";
    lines.push(
      `  "${node.id}" [label="${nodeLabel(node)}", fillcolor="${fill}"${orphanBorder}];`
    );
  }

  lines.push("");

  for (const edge of graph.edges) {
    const safe = (s: string) => s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    lines.push(`  "${edge.from}" -> "${edge.to}" [label="${safe(edge.linkText.slice(0, 30))}"];`);
  }

  lines.push("}");
  return lines.join("\n");
}

export function generateJSON(graph: KBGraph): string {
  return JSON.stringify(graph, (_key, value) => {
    if (value instanceof Date) return value.toISOString();
    return value;
  }, 2);
}

export function generateMarkdownReport(graph: KBGraph, generatedAt: string): string {
  const { stats, nodes, orphans, staleLinks } = graph;

  const lines: string[] = [
    "# Galerina KB Graph Report",
    `Generated: ${generatedAt}`,
    "",
    "## Stats",
    `- Docs: ${stats.totalDocs} | Edges: ${stats.totalEdges} | Orphans: ${stats.orphanCount} | Stale links: ${stats.staleLinkCount} | SPORE codes: ${stats.totalLlnCodes}`,
    "",
    "## Document Registry (auto-generated)",
    "",
    "| Doc | Layer | Version | Status | SPORE Codes |",
    "|---|---|---|---|---|",
  ];

  // Sort nodes: by layer then id
  const layerOrder: Record<string, number> = {
    "Layer 0": 0, "Layer 1": 1, "Layer 2A": 2, "Layer 2B": 3, "Layer 3": 4,
  };
  const sorted = [...nodes].sort((a, b) => {
    const la = a.layer ? (layerOrder[a.layer] ?? 99) : 99;
    const lb = b.layer ? (layerOrder[b.layer] ?? 99) : 99;
    if (la !== lb) return la - lb;
    return a.id.localeCompare(b.id);
  });

  for (const doc of sorted) {
    const layer = doc.layer ?? "—";
    const version = doc.version ?? "—";
    const status = doc.status ?? "—";
    const codes = doc.lnlCodes.length > 0
      ? doc.lnlCodes.slice(0, 5).join(", ") + (doc.lnlCodes.length > 5 ? ` …+${doc.lnlCodes.length - 5}` : "")
      : "—";
    lines.push(`| ${doc.id}.md | ${layer} | ${version} | ${status} | ${codes} |`);
  }

  lines.push("");
  lines.push("## Orphaned Documents");
  lines.push("Docs with no inbound links from other KB docs:");
  lines.push("");
  if (orphans.length === 0) {
    lines.push("_No orphaned documents._");
  } else {
    for (const id of orphans) {
      const doc = nodes.find(n => n.id === id);
      lines.push(`- \`${id}.md\` — ${doc?.title ?? id}`);
    }
  }

  lines.push("");
  lines.push("## Stale Links");
  lines.push("Links pointing to missing files:");
  lines.push("");
  if (staleLinks.length === 0) {
    lines.push("_No stale links._");
  } else {
    for (const link of staleLinks) {
      lines.push(`- ${link}`);
    }
  }

  lines.push("");
  return lines.join("\n");
}

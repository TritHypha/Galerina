// @galerina/devtools-flowgraph — Flow graph construction
import type { AstNode, FlowMeta } from "@galerina/core-compiler";

export interface FlowNode {
  readonly name: string;
  readonly qualifier: string;         // pure/guarded/secure/flow
  readonly declaredEffects: readonly string[];
  readonly hasPii: boolean;           // any pii/protected effect declared
  readonly hasAudit: boolean;         // audit.write in effects
  readonly hasNetworkOut: boolean;
}

export interface FlowEdge {
  readonly from: string;
  readonly to: string;
  readonly callSite: string;          // brief location hint
}

export interface FlowGraph {
  readonly nodes: ReadonlyMap<string, FlowNode>;
  readonly edges: readonly FlowEdge[];
  readonly routes: ReadonlyMap<string, string>;  // path → flowName
}

/** Build a FlowGraph from the parsed program AST and flow metadata.
 *
 * @param ast    - Parsed program root node.
 * @param flows  - Flow metadata extracted from the parse result.
 * @param extraRoutes - Optional pre-built route map (path → flowName).
 *                     Merged with routes discovered from AST routeDecl nodes.
 *                     Useful for test harnesses and programmatic construction.
 */
export function buildFlowGraph(
  ast: AstNode,
  flows: readonly FlowMeta[],
  extraRoutes?: ReadonlyMap<string, string>,
): FlowGraph {
  const nodes = new Map<string, FlowNode>();
  const edges: FlowEdge[] = [];
  const routes = new Map<string, string>();

  // Seed routes from caller-provided map
  if (extraRoutes) {
    for (const [path, flowName] of extraRoutes) {
      routes.set(path, flowName);
    }
  }

  // Build node map from FlowMeta
  for (const f of flows) {
    const effects = f.declaredEffects;
    nodes.set(f.name, {
      name: f.name,
      qualifier: f.qualifier,
      declaredEffects: effects,
      hasPii: effects.some(e => e.includes("pii") || e.includes("protected")),
      hasAudit: effects.includes("audit.write"),
      hasNetworkOut: effects.includes("network.outbound"),
    });
  }

  // Walk AST to find call edges (callExpr nodes)
  function walk(node: AstNode, currentFlow: string): void {
    if (node.kind === "callExpr") {
      const callee = node.value ?? "";
      if (callee && nodes.has(callee) && callee !== currentFlow) {
        edges.push({ from: currentFlow, to: callee, callSite: callee });
      }
    }
    for (const child of node.children ?? []) {
      walk(child, currentFlow);
    }
  }

  for (const child of ast.children ?? []) {
    const isFlow = ["flowDecl","secureFlowDecl","pureFlowDecl","guardedFlowDecl"].includes(child.kind);
    if (isFlow && child.value) {
      walk(child, child.value);
    }
    // Collect route declarations
    if (child.kind === "routeDecl" && child.value) {
      const parts = child.value.split(" ");
      const pathPart = parts.slice(1).join(" ").trim();
      const flowChild = (child.children ?? []).find(c =>
        c.kind === "identifier" && c.value?.startsWith("flow:"));
      if (flowChild?.value) {
        routes.set(pathPart, flowChild.value.slice("flow:".length));
      }
    }
  }

  return { nodes, edges, routes };
}

/** Serialize FlowGraph to JSON (for AI context / tooling). */
export function flowGraphToJson(g: FlowGraph): string {
  return JSON.stringify({
    schemaVersion: "spore.flowgraph.v1",
    nodes: [...g.nodes.values()],
    edges: g.edges,
    routes: Object.fromEntries(g.routes),
  }, null, 2);
}

/** Generate a Mermaid flowchart from the graph. */
export function flowGraphToMermaid(g: FlowGraph): string {
  const lines = ["flowchart LR"];
  for (const n of g.nodes.values()) {
    const label = n.qualifier === "secure" ? "🔒 " + n.name :
                  n.qualifier === "pure"   ? "⚡ " + n.name : n.name;
    lines.push(`  ${n.name}["${label}"]`);
  }
  for (const e of g.edges) {
    lines.push(`  ${e.from} --> ${e.to}`);
  }
  return lines.join("\n");
}

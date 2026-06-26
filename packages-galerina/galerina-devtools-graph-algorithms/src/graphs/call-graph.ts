import { GraphBuilder } from "../core/builder.js";
import type { Graph } from "../core/types.js";

export interface CallNodeData {
  flowName: string;
  qualifier: string;
}

export interface CallEdgeData {
  callSite: string;
}

export type CallGraph = Graph<CallNodeData, CallEdgeData>;

export interface CallFlowDescriptor {
  name: string;
  qualifier: string;
  calledFlows: readonly string[];
}

/**
 * Builds a CallGraph from a list of flow descriptors.
 *
 * Each flow becomes a node keyed by its name. Each entry in `calledFlows`
 * becomes a directed edge from the caller to the callee. Callees that are
 * not explicitly listed as descriptors are added as stub nodes with an
 * empty qualifier so the graph remains structurally valid.
 */
export function buildCallGraph(flows: readonly CallFlowDescriptor[]): CallGraph {
  const builder = new GraphBuilder<CallNodeData, CallEdgeData>();

  // First pass: add all declared flow nodes
  for (const flow of flows) {
    builder.addNode(flow.name, {
      flowName: flow.name,
      qualifier: flow.qualifier,
    });
  }

  // Build a qualifier lookup for known flows
  const qualifierMap = new Map<string, string>(flows.map((f) => [f.name, f.qualifier]));

  // Second pass: ensure callee nodes exist and add edges
  for (const flow of flows) {
    for (const callee of flow.calledFlows) {
      if (!builder["nodes"].has(callee)) {
        builder.addNode(callee, {
          flowName: callee,
          qualifier: qualifierMap.get(callee) ?? "",
        });
      }
      builder.addEdge(flow.name, callee, { callSite: `${flow.name}->${callee}` });
    }
  }

  return builder.build();
}

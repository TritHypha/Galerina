import { GraphBuilder } from "../core/builder.js";
import type { Graph } from "../core/types.js";

export interface EffectNodeData {
  flowName: string;
  declaredEffects: readonly string[];
  inferredEffects: readonly string[];
}

export interface EffectEdgeData {
  callType: "direct" | "transitive";
}

export type EffectGraph = Graph<EffectNodeData, EffectEdgeData>;

export interface EffectFlowDescriptor {
  name: string;
  declaredEffects: readonly string[];
  calls: readonly string[];
}

/**
 * Builds an EffectGraph from a list of flow descriptors.
 *
 * Each flow becomes a node; each call relationship becomes a directed edge
 * from caller to callee with callType "direct".
 *
 * Flows referenced by `calls` that are not explicitly listed as descriptors
 * are added automatically as nodes with empty effect arrays so the graph
 * remains consistent.
 */
export function buildEffectGraph(flows: readonly EffectFlowDescriptor[]): EffectGraph {
  const builder = new GraphBuilder<EffectNodeData, EffectEdgeData>();

  // First pass: add all declared flow nodes
  for (const flow of flows) {
    builder.addNode(flow.name, {
      flowName: flow.name,
      declaredEffects: flow.declaredEffects,
      inferredEffects: [],
    });
  }

  // Second pass: ensure referenced callee nodes exist and add edges
  for (const flow of flows) {
    for (const callee of flow.calls) {
      if (!builder["nodes"].has(callee)) {
        builder.addNode(callee, {
          flowName: callee,
          declaredEffects: [],
          inferredEffects: [],
        });
      }
      builder.addEdge(flow.name, callee, { callType: "direct" });
    }
  }

  return builder.build();
}

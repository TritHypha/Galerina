// Core types and interfaces
export type { Graph, GraphEdge, GraphJSON, GraphNode, NodeId } from "./core/types.js";

// Core implementations
export { ImmutableGraph } from "./core/graph.js";
export { GraphBuilder } from "./core/builder.js";

// Algorithms
export { bfsPath, bfsReachable } from "./algorithms/bfs.js";
export { detectCycle, dfsVisit } from "./algorithms/dfs.js";
export type { DfsVisitor } from "./algorithms/dfs.js";
export { topoSort } from "./algorithms/topo.js";
export { allReachable, canReach } from "./algorithms/reach.js";

// Galerina-specific graphs
export { buildEffectGraph } from "./graphs/effect-graph.js";
export type {
  EffectEdgeData,
  EffectFlowDescriptor,
  EffectGraph,
  EffectNodeData,
} from "./graphs/effect-graph.js";

export { buildCallGraph } from "./graphs/call-graph.js";
export type {
  CallEdgeData,
  CallFlowDescriptor,
  CallGraph,
  CallNodeData,
} from "./graphs/call-graph.js";

export {
  buildCapabilityGraph,
  getCapabilitiesRequiredByFlow,
  getFlowsRequiringCapability,
  getWASMImportsForFlow,
} from "./graphs/capability-graph.js";
export type {
  CapabilityEdgeData,
  CapabilityEntry,
  CapabilityGraph,
  CapabilityNodeData,
} from "./graphs/capability-graph.js";

// Phase 13 — Semantic Graph System
export {
  SemanticGraphBuilder,
  reachable,
  callers,
  effectsOf,
  graphToJSON,
  graphFromJSON,
} from "./semantic/SemanticGraph.js";
export type {
  SemanticGraph,
  SemanticNode,
  SemanticEdge,
  SemanticNodeKind,
  SemanticEdgeKind,
} from "./semantic/SemanticGraph.js";

export {
  buildBoundaryGraph,
  getBoundaryCrossings,
  getUnauthorisedCrossings,
} from "./graphs/boundary-graph.js";
export type {
  BoundaryEdgeData,
  BoundaryGraph,
  BoundaryKind,
  BoundaryNodeData,
  BoundaryTrustLevel,
} from "./graphs/boundary-graph.js";

export {
  buildWASMModuleGraph,
  getExports,
  getImports,
  getImportsForFlow,
} from "./graphs/wasm-module-graph.js";
export type {
  WASMEdgeData,
  WASMModuleGraph,
  WASMNodeData,
} from "./graphs/wasm-module-graph.js";

// Phase 18–23 — Flag-Aware Query Functions
export {
  NodeFlagQuery,
  GovernanceFlagQuery,
  EffectFlagQuery,
  NativeCapabilityQuery,
  findFlowsByNodeFlags,
  findFlowsByGovernanceFlags,
  findFlowsByEffectFlags,
  findFlowsByNativeCapability,
  getGraphFlagSummary,
  findFlowsWithNetworkPolicy,
  findFlowsWithProcessSpawn,
  findFlowsWithSecretAccess,
  getAntiAbuseReport,
  getPerformanceSummary,
  getGraphReadiness,
} from "./semantic/flag-queries.js";
export type {
  GraphFlagSummary,
  AntiAbuseReport,
  PerformanceSummary,
} from "./semantic/flag-queries.js";

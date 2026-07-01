// =============================================================================
// fungi-graph — public API
//
// Named exports only. No default export.
// All types are re-exported for downstream TypeScript consumers.
// =============================================================================

// ---------------------------------------------------------------------------
// Core — types, immutable graph, builder
// ---------------------------------------------------------------------------

export type {
  NodeId,
  GraphNode,
  GraphEdge,
  Graph,
  GraphJSON,
  FungiDiagnostic,
} from "./core/types.js";

export {
  FUNGI_PGRAPH_001,
  FUNGI_PGRAPH_002,
  FUNGI_PGRAPH_003,
  FUNGI_PGRAPH_004,
  FUNGI_PGRAPH_005,
  FUNGI_PGRAPH_DIAGNOSTICS,
} from "./core/types.js";

export { GraphBuilder } from "./core/builder.js";

// ---------------------------------------------------------------------------
// Algorithms
// ---------------------------------------------------------------------------

export { bfsPath, bfsReachable } from "./algorithms/bfs.js";
export { dfsVisit, detectCycle } from "./algorithms/dfs.js";
export { topoSort } from "./algorithms/topo.js";
export type { TopoResult } from "./algorithms/topo.js";
export { fixpoint, updateNode } from "./algorithms/fixpoint.js";
export type { FixpointResult } from "./algorithms/fixpoint.js";
export { canReach, allReachable, canReachAll, reachableSubset } from "./algorithms/reach.js";

// ---------------------------------------------------------------------------
// Galerina graph types — EffectGraph
// ---------------------------------------------------------------------------

export type {
  EffectSafetyLevel,
  EffectNodeData,
  EffectEdgeData,
  EffectGraph,
  EffectGraphEntry,
} from "./graphs/effect-graph.js";

export {
  FUNGI_PGRAPH_010,
  FUNGI_PGRAPH_011,
  FUNGI_PGRAPH_012,
  FUNGI_PGRAPH_013,
  FUNGI_PGRAPH_EFFECT_DIAGNOSTICS,
  buildEffectGraph,
  propagateEffects,
  validateEffects,
  allEffectsFor,
} from "./graphs/effect-graph.js";

// ---------------------------------------------------------------------------
// Galerina graph types — BoundaryGraph
// ---------------------------------------------------------------------------

export type {
  BoundaryType,
  TrustLevel,
  BoundaryNodeData,
  BoundaryEdgeData,
  BoundaryGraph,
  BoundaryEntry,
  BoundaryCrossing,
} from "./graphs/boundary-graph.js";

export {
  FUNGI_PGRAPH_020,
  FUNGI_PGRAPH_021,
  FUNGI_PGRAPH_022,
  FUNGI_PGRAPH_023,
  FUNGI_PGRAPH_BOUNDARY_DIAGNOSTICS,
  buildBoundaryGraph,
  validateBoundaries,
} from "./graphs/boundary-graph.js";

// ---------------------------------------------------------------------------
// Galerina graph types — ProjectGraph
// ---------------------------------------------------------------------------

export type {
  ProjectGraphNodeKind,
  ProjectGraphEdgeKind,
  EdgeConfidence,
  ProjectGraphNodeData,
  ProjectGraphEdgeData,
  ProjectGraph,
  ProjectGraphNodeEntry,
  ProjectGraphEdgeEntry,
} from "./graphs/project-graph.js";

export {
  buildProjectGraph,
  queryGraph,
  explainNode,
  findPath,
} from "./graphs/project-graph.js";

// ---------------------------------------------------------------------------
// Galerina graph types — DependencyGraph
// ---------------------------------------------------------------------------

export type {
  TaskNodeData,
  DependencyEdgeData,
  DependencyGraph,
  TaskEntry,
  DependencyResolution,
} from "./graphs/dependency-graph.js";

export {
  buildDependencyGraph,
  resolveDependencies,
} from "./graphs/dependency-graph.js";

// ---------------------------------------------------------------------------
// Galerina graph types — ResourceLifecycleGraph
// ---------------------------------------------------------------------------

export type {
  ResourceState,
  ResourceScope,
  ResourceNodeData,
  LifecycleTransitionData,
  ResourceLifecycleGraph,
  ResourceEntry,
  AdvanceStateOptions,
  AdvanceResult,
} from "./graphs/resource-graph.js";

export {
  validateTransition,
  buildResourceLifecycleGraph,
  advanceState,
} from "./graphs/resource-graph.js";

// ---------------------------------------------------------------------------
// Galerina graph types — CapabilityGraph
// ---------------------------------------------------------------------------

export type {
  CapabilityNodeKind,
  CapabilityNodeData,
  CapabilityEdgeKind,
  CapabilityEdgeData,
  CapabilityGraph,
  CapabilityEntry,
  CapabilityRelation,
} from "./graphs/capability-graph.js";

export {
  FUNGI_PGRAPH_030,
  buildCapabilityGraph,
  resolveCapabilities,
  validateCapabilities,
} from "./graphs/capability-graph.js";

// ---------------------------------------------------------------------------
// Reporting — ExecutionProofChain
// ---------------------------------------------------------------------------

export type {
  ExecutionProofHashes,
  ExecutionProofV1,
  ExecutionProofSection,
  ExecutionProofReference,
  ExecutionProofV2,
  ProofChainInputs,
} from "./reporting/chain.js";

export {
  buildProofChain,
  buildProofChainFromBuffers,
  upgradeExecutionProofV1ToV2,
  validateProofChain,
} from "./reporting/chain.js";

// ---------------------------------------------------------------------------
// Reporting — EventDAG
// ---------------------------------------------------------------------------

export type {
  RuntimeAuditCategory,
  RuntimeAuditStatus,
  RuntimeAuditEvent,
  AuditEventNodeData,
  CausalityKind,
  CausalityEdgeData,
  EventDAG,
} from "./reporting/event-dag.js";

export {
  buildEventDAG,
  eventsInTrace,
  eventsByStatus,
  denialEvents,
} from "./reporting/event-dag.js";

// ---------------------------------------------------------------------------
// Reporting — JsonlWriter
// ---------------------------------------------------------------------------

export type { JsonlWriter, InMemoryJsonlWriter } from "./reporting/jsonl.js";
export {
  JsonlWriterError,
  serializeAuditEvent,
  createJsonlWriter,
  createInMemoryJsonlWriter,
} from "./reporting/jsonl.js";

// ---------------------------------------------------------------------------
// Reporting — Report builders
// ---------------------------------------------------------------------------

export type {
  EffectReportSection,
  BoundaryReportSection,
  ProjectReportSection,
  AuditChainSection,
  ProofReportSection,
} from "./reporting/builders.js";

export {
  effectGraphToReport,
  boundaryGraphToReport,
  projectGraphToReport,
  eventDagToReport,
  proofChainToReport,
} from "./reporting/builders.js";

// ---------------------------------------------------------------------------
// Reporting — Serializer
// ---------------------------------------------------------------------------

export {
  graphToJSON,
  graphFromJSON,
  graphToJSONString,
  graphToJSONPretty,
} from "./reporting/serializer.js";

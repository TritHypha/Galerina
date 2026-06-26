export { buildFlowGraph, flowGraphToJson, flowGraphToMermaid } from "./flow-graph.js";
export { checkFlowGraph, detectCycles, detectDeadFlows, detectAuthorityEscalation,
         detectPiiLeakagePaths, detectMissingAuditCoverage, detectUnboundedRetry } from "./diagnostics.js";
export type { FlowGraph, FlowNode, FlowEdge } from "./flow-graph.js";
export type { GraphDiagnostic, GraphSeverity } from "./diagnostics.js";
export const FLOWGRAPH_VERSION = "0.1.0";

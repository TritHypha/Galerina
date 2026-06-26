// =============================================================================
// @galerina/devtools-provenance — Core Types
//
// Data lineage / provenance tracking across a Galerina codebase.
// Maps data from sources (network, DB, user input) through transformations
// (gates, sanitizers) to sinks (DB writes, audit logs, network outputs).
// =============================================================================

export type DataSourceKind = 'network' | 'database' | 'user-input' | 'secret' | 'internal';
export type DataSinkKind = 'database-write' | 'audit-log' | 'network-egress' | 'response' | 'internal';
export type TransformKind = 'gate' | 'sanitize' | 'encrypt' | 'hash' | 'redact';

export interface DataNode {
  id: string;
  kind: 'source' | 'transform' | 'sink';
  sourceKind?: DataSourceKind;
  sinkKind?: DataSinkKind;
  transformKind?: TransformKind;
  label: string;         // e.g. "unsafe let rawPassword" or "validate.input(...)"
  flowName: string;
  filePath: string;
  isTrusted: boolean;    // false = tainted/unsafe, true = gated/safe
}

export interface DataEdge {
  from: string;          // node id
  to: string;            // node id
  label?: string;        // optional transform description
}

export interface ProvenanceGraph {
  nodes: DataNode[];
  edges: DataEdge[];
  summary: {
    totalFlows: number;
    flowsWithTaintedData: number;
    flowsWithUngatedSinks: number;   // high-risk: taint reaches sink without gate
    trustBoundaryCrossings: number;
  };
  riskFlows: Array<{                 // flows where tainted data reaches a sink ungated
    flowName: string;
    filePath: string;
    risk: 'high' | 'medium';
    description: string;
  }>;
}

export interface ProvenanceOptions {
  /** If set, only analyse the named flow. */
  readonly flowFilter?: string;
}

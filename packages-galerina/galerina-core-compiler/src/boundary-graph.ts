// =============================================================================
// Galerina — Boundary Graph (Phase 10C / Stage A)
//
// Type definitions and stub builder for the governed boundary graph.
// Each node represents a flow with its boundary kind and trust level.
// Edges represent cross-boundary calls and the conditions under which
// they are permitted.
//
// Full graph traversal and violation detection are deferred to Phase 20.
// =============================================================================

import { type FlowMeta } from "./parser.js";
import { type EffectCheckResult } from "./effect-checker.js";
import { type GovernanceDiagnostic } from "./governance-verifier.js";

// ---------------------------------------------------------------------------
// Boundary primitive types
// ---------------------------------------------------------------------------

/** The kind of boundary a flow participates in. */
export type BoundaryKind =
  | "api"
  | "webhook"
  | "internal"
  | "package"
  | "secure"
  | "public";

/** The trust level assigned to a boundary node. */
export type BoundaryTrustLevel =
  | "untrusted"
  | "validated"
  | "internal"
  | "privileged";

// ---------------------------------------------------------------------------
// Node and edge data
// ---------------------------------------------------------------------------

/** Data carried by a boundary graph node (one per flow). */
export interface BoundaryNodeData {
  readonly flowName: string;
  readonly kind: BoundaryKind;
  readonly trustLevel: BoundaryTrustLevel;
  /** Effects the flow is allowed to declare at this boundary. */
  readonly allowedEffects: readonly string[];
  /** Effects explicitly denied at this boundary. */
  readonly deniedEffects: readonly string[];
}

/** Data carried by a boundary graph edge (one per cross-boundary call). */
export interface BoundaryEdgeData {
  /** The boundary kind being crossed into. */
  readonly crossesTo: BoundaryKind;
  /**
   * Effect names that are permitted across this edge.
   * An empty array means the cross is unconditionally denied.
   */
  readonly allowedWith: readonly string[];
  /** Whether crossing this boundary requires authentication. */
  readonly requiresAuth: boolean;
}

// ---------------------------------------------------------------------------
// Graph type alias
// ---------------------------------------------------------------------------

/**
 * A directed graph of boundary nodes and edges.
 *
 * Phase 20: replace with Graph<BoundaryNodeData, BoundaryEdgeData> once the
 * devtools-graph-algorithms package exposes a generic Graph type that can be
 * used here without circular imports.
 *
 * For now this is a plain object alias to keep the public API stable.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Graph<N, E> = { nodes: N[]; edges: E[] };
export type BoundaryGraph = Graph<BoundaryNodeData, BoundaryEdgeData>;

// ---------------------------------------------------------------------------
// Check result
// ---------------------------------------------------------------------------

/** The result of running a boundary check over a BoundaryGraph. */
export interface BoundaryCheckResult {
  readonly diagnostics: readonly GovernanceDiagnostic[];
}

// ---------------------------------------------------------------------------
// Builder stub
// ---------------------------------------------------------------------------

/**
 * Builds a BoundaryGraph from a set of flows and their effect check results.
 *
 * Phase 20 stub: returns an empty graph. Full implementation will:
 *   1. Assign each flow a BoundaryKind based on qualifier and contract annotations.
 *   2. Assign trust levels based on capability declarations.
 *   3. Build edges for every cross-flow call detected in the AST.
 *   4. Run violation checks across edges (SPORE-GOV-013 and future boundary rules).
 *
 * @param flows         Flow metadata from parseProgram().
 * @param effectResults Effect checker results per flow.
 * @returns             An empty BoundaryGraph (Phase 20 stub).
 */
export function buildBoundaryGraph(
  _flows: readonly FlowMeta[],
  _effectResults: readonly EffectCheckResult[],
): BoundaryGraph {
  return { nodes: [], edges: [] };
}

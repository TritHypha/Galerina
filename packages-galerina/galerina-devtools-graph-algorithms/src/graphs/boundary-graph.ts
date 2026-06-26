import { GraphBuilder } from "../core/builder.js";
import type { Graph } from "../core/types.js";

// ─── Domain Types ─────────────────────────────────────────────────────────────

export type BoundaryKind =
  | "api"
  | "webhook"
  | "internal"
  | "package"
  | "secure"
  | "public";

export type BoundaryTrustLevel =
  | "untrusted"
  | "validated"
  | "internal"
  | "privileged";

export interface BoundaryNodeData {
  readonly kind: BoundaryKind;
  readonly trustLevel: BoundaryTrustLevel;
  readonly allowedEffects: readonly string[];
  readonly declaredCapabilities: readonly string[];
}

export interface BoundaryEdgeData {
  readonly crossingAllowed: boolean;
  readonly requiresAuth: boolean;
  readonly effectsTransferred: readonly string[];
}

export type BoundaryGraph = Graph<BoundaryNodeData, BoundaryEdgeData>;

// ─── Helper: derive BoundaryKind from qualifier ───────────────────────────────

function qualifierToKind(qualifier: string): BoundaryKind {
  const q = qualifier.toLowerCase();
  if (q === "api") return "api";
  if (q === "webhook") return "webhook";
  if (q === "internal") return "internal";
  if (q === "package") return "package";
  if (q === "secure") return "secure";
  if (q === "public") return "public";
  return "internal";
}

function qualifierToTrustLevel(qualifier: string): BoundaryTrustLevel {
  const q = qualifier.toLowerCase();
  if (q === "secure" || q === "privileged") return "privileged";
  if (q === "internal") return "internal";
  if (q === "api" || q === "validated") return "validated";
  return "untrusted";
}

/**
 * A boundary crossing occurs when a secure/guarded flow calls another flow.
 * The crossing is allowed when the callee's trust level is >= the caller's,
 * or the callee is an "internal" flow (same trust domain).
 *
 * "secure" and "privileged" callers always impose crossing checks.
 */
function isCrossingAllowed(
  callerKind: BoundaryKind,
  calleeTrustLevel: BoundaryTrustLevel,
): boolean {
  if (callerKind === "secure") {
    // secure flows may only call into internal or privileged contexts
    return calleeTrustLevel === "internal" || calleeTrustLevel === "privileged";
  }
  if (callerKind === "api" || callerKind === "webhook") {
    // externally-facing flows may call validated, internal, or privileged
    return (
      calleeTrustLevel === "validated" ||
      calleeTrustLevel === "internal" ||
      calleeTrustLevel === "privileged"
    );
  }
  // internal, public, package callers: crossings are always allowed
  return true;
}

function requiresAuth(callerKind: BoundaryKind): boolean {
  return callerKind === "api" || callerKind === "webhook" || callerKind === "secure";
}

// ─── Builder ─────────────────────────────────────────────────────────────────

/**
 * Builds a BoundaryGraph from flow metadata and effect results.
 *
 * Nodes: each flow is a boundary node. The BoundaryKind and BoundaryTrustLevel
 * are derived from the flow's qualifier string.
 *
 * Edges: each entry in `callGraph` (caller → callees) becomes one directed
 * boundary-crossing edge per callee. The edge records whether the crossing is
 * allowed (based on kinds/trust levels) and which declared effects transfer.
 *
 * A "boundary crossing" is when a secure/guarded flow calls another flow.
 * The effectsTransferred on an edge is the intersection of the caller's
 * declaredEffects and the callee's declaredEffects.
 */
export function buildBoundaryGraph(
  flows: readonly {
    name: string;
    qualifier: string;
    declaredEffects: readonly string[];
  }[],
  callGraph: ReadonlyMap<string, ReadonlySet<string>>,
): BoundaryGraph {
  const builder = new GraphBuilder<BoundaryNodeData, BoundaryEdgeData>();

  // Index flows by name for fast lookup
  const flowIndex = new Map<
    string,
    { qualifier: string; declaredEffects: readonly string[] }
  >();
  for (const flow of flows) {
    flowIndex.set(flow.name, {
      qualifier: flow.qualifier,
      declaredEffects: flow.declaredEffects,
    });
  }

  // First pass: add all known flow nodes
  for (const flow of flows) {
    const kind = qualifierToKind(flow.qualifier);
    const trustLevel = qualifierToTrustLevel(flow.qualifier);
    builder.addNode(flow.name, {
      kind,
      trustLevel,
      allowedEffects: flow.declaredEffects,
      declaredCapabilities: [],
    });
  }

  // Second pass: add callee stub nodes for any callee not in the flow list,
  // then add boundary-crossing edges.
  for (const [callerName, callees] of callGraph) {
    // Ensure caller node exists (may not be in flows list)
    if (!builder["nodes"].has(callerName)) {
      const callerMeta = flowIndex.get(callerName);
      const callerQualifier = callerMeta?.qualifier ?? "internal";
      builder.addNode(callerName, {
        kind: qualifierToKind(callerQualifier),
        trustLevel: qualifierToTrustLevel(callerQualifier),
        allowedEffects: callerMeta?.declaredEffects ?? [],
        declaredCapabilities: [],
      });
    }

    const callerNode = builder["nodes"].get(callerName)!;
    const callerKind = callerNode.data.kind;
    const callerEffects = callerNode.data.allowedEffects;

    for (const calleeName of callees) {
      // Ensure callee node exists
      if (!builder["nodes"].has(calleeName)) {
        const calleeMeta = flowIndex.get(calleeName);
        const calleeQualifier = calleeMeta?.qualifier ?? "internal";
        builder.addNode(calleeName, {
          kind: qualifierToKind(calleeQualifier),
          trustLevel: qualifierToTrustLevel(calleeQualifier),
          allowedEffects: calleeMeta?.declaredEffects ?? [],
          declaredCapabilities: [],
        });
      }

      const calleeNode = builder["nodes"].get(calleeName)!;
      const calleeTrustLevel = calleeNode.data.trustLevel;
      const calleeEffects = calleeNode.data.allowedEffects;

      // Compute effectsTransferred: effects declared by both caller and callee
      const effectsTransferred = callerEffects.filter((e) =>
        (calleeEffects as readonly string[]).includes(e),
      );

      const crossing = isCrossingAllowed(callerKind, calleeTrustLevel);
      const needsAuth = requiresAuth(callerKind);

      builder.addEdge(callerName, calleeName, {
        crossingAllowed: crossing,
        requiresAuth: needsAuth,
        effectsTransferred,
      });
    }
  }

  return builder.build();
}

// ─── Query Functions ──────────────────────────────────────────────────────────

/**
 * Returns all boundary-crossing edges in the graph, regardless of whether
 * the crossing is allowed or not.
 */
export function getBoundaryCrossings(
  graph: BoundaryGraph,
): Array<{ from: string; to: string; allowed: boolean }> {
  return graph.edges().map((edge) => ({
    from: edge.from,
    to: edge.to,
    allowed: edge.data.crossingAllowed,
  }));
}

/**
 * Returns all boundary-crossing edges where the crossing is NOT allowed.
 */
export function getUnauthorisedCrossings(
  graph: BoundaryGraph,
): Array<{ from: string; to: string }> {
  return graph
    .edges()
    .filter((edge) => !edge.data.crossingAllowed)
    .map((edge) => ({ from: edge.from, to: edge.to }));
}

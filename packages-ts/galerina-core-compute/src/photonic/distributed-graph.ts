// Distributed optical graph vocabulary (TODO pass, Grok 2026-10-05).
// Zero-trust defaults, owner may revisit. Names the planned graph roles only;
// no graph is materialised or scheduled here.

/** Closed distributed-graph role names for photonic planning. */
export const DISTRIBUTED_GRAPH_ROLES = Object.freeze([
  "source",
  "sink",
  "relay",
  "aggregator",
  "unspecified",
] as const);

export type DistributedGraphRole = (typeof DISTRIBUTED_GRAPH_ROLES)[number];

export function isDistributedGraphRole(value: unknown): value is DistributedGraphRole {
  return typeof value === "string" && (DISTRIBUTED_GRAPH_ROLES as readonly string[]).includes(value);
}

/** V1 freeze: distributed optical graphs are not admitted for execution. */
export function isDistributedGraphAdmitted(): boolean {
  return false;
}
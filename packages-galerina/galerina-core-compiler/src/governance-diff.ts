// =============================================================================
// Galerina Phase 32 — Governance Diff
//
// Computes a structured governance delta between two versions of a program.
// Turns PR review from "read the code diff" into "read the governance report":
//
//   processRefund: +network.outbound +payment.charge
//   createOrder:   widened to payment.charge
//   deleteUser:    REMOVED
//
// Used by `galerina diff main..branch`. The core diffGovernance() function is
// pure — the CLI supplies the two parsed programs (from git refs).
// =============================================================================

import { type FlowMeta } from "./parser.js";

// ---------------------------------------------------------------------------
// Diff result types
// ---------------------------------------------------------------------------

export interface FlowGovernanceShape {
  readonly name: string;
  readonly qualifier: string;
  readonly effects: readonly string[];
}

/**
 * Change-class classification (task #59 — galerina-governed-design-synthesis.md).
 *
 * tightening    — fewer effects, stricter privacy, smaller limits, narrower targets
 * neutral       — documentation / refactors with no governance delta
 * expansion     — new effects, new secrets, broader authority, larger budgets
 * experimental  — policy { emergency {} }, @experimental_profile, native backend changes
 *
 * Gate required per class:
 *   tightening:   1 reviewer + automated checks
 *   neutral:      1 reviewer
 *   expansion:    2 reviewers including security/governance owner
 *   experimental: architecture review + conformance rerun + signed release
 */
export type ChangeClass = "tightening" | "neutral" | "expansion" | "experimental";

export interface FlowDelta {
  readonly name: string;
  readonly change: "added" | "removed" | "changed";
  readonly qualifierBefore?: string;
  readonly qualifierAfter?: string;
  readonly effectsAdded: readonly string[];
  readonly effectsRemoved: readonly string[];
  /** True if the change widens authority (added effects or escalated qualifier). */
  readonly widensAuthority: boolean;
  /** Change class for this individual flow delta. */
  readonly changeClass: ChangeClass;
}

export interface GovernanceDiff {
  readonly schemaVersion: "lln.govdiff.v1";
  readonly added: readonly FlowDelta[];
  readonly removed: readonly FlowDelta[];
  readonly changed: readonly FlowDelta[];
  /** True if ANY change widens authority — the key signal for PR review. */
  readonly widensAuthority: boolean;
  /**
   * The highest change class across all deltas.
   * CI gate: expansion requires 2 reviewers; experimental requires arch review.
   */
  readonly changeClass: ChangeClass;
  readonly summary: string;
}

// ---------------------------------------------------------------------------
// Qualifier escalation order (for detecting authority widening)
// ---------------------------------------------------------------------------

const QUALIFIER_RANK: Record<string, number> = {
  pure: 0, flow: 1, guarded: 2, secure: 3, privileged: 4,
};

function qualifierEscalated(before: string, after: string): boolean {
  return (QUALIFIER_RANK[after] ?? 0) > (QUALIFIER_RANK[before] ?? 0);
}

// ---------------------------------------------------------------------------
// Core diff
// ---------------------------------------------------------------------------

/** Extract the comparable governance shape from flow metadata. */
export function flowShape(flow: FlowMeta): FlowGovernanceShape {
  return {
    name: flow.name,
    qualifier: flow.qualifier,
    effects: [...flow.declaredEffects].sort(),
  };
}

/**
 * Phase 32: Compute the governance delta between two sets of flows.
 *
 * @param before - flows from the base ref (e.g. main)
 * @param after  - flows from the head ref (e.g. feature branch)
 */
export function diffGovernance(
  before: readonly FlowMeta[],
  after: readonly FlowMeta[],
): GovernanceDiff {
  const beforeMap = new Map(before.map(f => [f.name, flowShape(f)]));
  const afterMap = new Map(after.map(f => [f.name, flowShape(f)]));

  const added: FlowDelta[] = [];
  const removed: FlowDelta[] = [];
  const changed: FlowDelta[] = [];

  // Helper: classify an individual flow delta
  function classifyDelta(
    effectsAdded: readonly string[],
    effectsRemoved: readonly string[],
    qualifierBefore: string | undefined,
    qualifierAfter: string | undefined,
    isAdded: boolean,
  ): ChangeClass {
    const qBefore = qualifierBefore ?? "flow";
    const qAfter  = qualifierAfter  ?? "flow";
    const escalated = qualifierEscalated(qBefore, qAfter);
    const degraded  = (QUALIFIER_RANK[qAfter] ?? 0) < (QUALIFIER_RANK[qBefore] ?? 0);

    if (isAdded) {
      // New flow with effects = expansion; new flow without effects = neutral
      const rank = QUALIFIER_RANK[qAfter] ?? 0;
      return (effectsAdded.length > 0 || rank >= (QUALIFIER_RANK.guarded ?? 2))
        ? "expansion" : "neutral";
    }
    if (effectsAdded.length > 0 || escalated)   return "expansion";
    if (effectsRemoved.length > 0 || degraded)  return "tightening";
    return "neutral";
  }

  // Rank change classes for overall determination
  const CLASS_RANK: Record<ChangeClass, number> = {
    neutral: 0, tightening: 1, expansion: 2, experimental: 3,
  };

  function maxClass(a: ChangeClass, b: ChangeClass): ChangeClass {
    return CLASS_RANK[a] >= CLASS_RANK[b] ? a : b;
  }

  // Added flows (in after, not in before)
  for (const [name, shape] of afterMap) {
    if (!beforeMap.has(name)) {
      const widens = shape.effects.length > 0 || (QUALIFIER_RANK[shape.qualifier] ?? 0) >= QUALIFIER_RANK.guarded!;
      const cc = classifyDelta(shape.effects, [], undefined, shape.qualifier, true);
      added.push({
        name, change: "added",
        qualifierAfter: shape.qualifier,
        effectsAdded: shape.effects,
        effectsRemoved: [],
        widensAuthority: widens,
        changeClass: cc,
      });
    }
  }

  // Removed flows (in before, not in after)
  for (const [name, shape] of beforeMap) {
    if (!afterMap.has(name)) {
      removed.push({
        name, change: "removed",
        qualifierBefore: shape.qualifier,
        effectsAdded: [],
        effectsRemoved: shape.effects,
        widensAuthority: false,
        changeClass: "tightening", // removing a flow is always tightening
      });
    }
  }

  // Changed flows (in both, but different shape)
  for (const [name, afterShape] of afterMap) {
    const beforeShape = beforeMap.get(name);
    if (beforeShape === undefined) continue;

    const beforeEffects = new Set(beforeShape.effects);
    const afterEffects = new Set(afterShape.effects);
    const effectsAdded = afterShape.effects.filter(e => !beforeEffects.has(e));
    const effectsRemoved = beforeShape.effects.filter(e => !afterEffects.has(e));
    const qualifierChanged = beforeShape.qualifier !== afterShape.qualifier;

    if (effectsAdded.length === 0 && effectsRemoved.length === 0 && !qualifierChanged) {
      continue; // no governance change
    }

    const widens = effectsAdded.length > 0 || qualifierEscalated(beforeShape.qualifier, afterShape.qualifier);
    const cc = classifyDelta(effectsAdded, effectsRemoved, beforeShape.qualifier, afterShape.qualifier, false);

    changed.push({
      name, change: "changed",
      qualifierBefore: beforeShape.qualifier,
      qualifierAfter: afterShape.qualifier,
      effectsAdded,
      effectsRemoved,
      widensAuthority: widens,
      changeClass: cc,
    });
  }

  const widensAuthority =
    added.some(d => d.widensAuthority) || changed.some(d => d.widensAuthority);

  // Determine overall change class (highest individual class)
  let overallClass: ChangeClass = "neutral";
  for (const d of [...added, ...removed, ...changed]) {
    overallClass = maxClass(overallClass, d.changeClass);
  }

  const summary = buildSummary(added, removed, changed, widensAuthority);

  return {
    schemaVersion: "lln.govdiff.v1",
    added, removed, changed,
    widensAuthority,
    changeClass: overallClass,
    summary,
  };
}

function buildSummary(
  added: readonly FlowDelta[],
  removed: readonly FlowDelta[],
  changed: readonly FlowDelta[],
  widens: boolean,
): string {
  const parts: string[] = [];
  if (added.length > 0)   parts.push(`${added.length} added`);
  if (removed.length > 0) parts.push(`${removed.length} removed`);
  if (changed.length > 0) parts.push(`${changed.length} changed`);
  const head = parts.length > 0 ? parts.join(", ") : "no governance changes";
  const flag = widens ? " ⚠ WIDENS AUTHORITY — review required" : " ✓ no authority widening";
  return head + flag;
}

/** Change-class label and required gate. */
const CHANGE_CLASS_LABEL: Record<ChangeClass, string> = {
  neutral:      "NEUTRAL      — 1 reviewer",
  tightening:   "TIGHTENING   — 1 reviewer + automated checks",
  expansion:    "EXPANSION    — 2 reviewers including security/governance owner",
  experimental: "EXPERIMENTAL — architecture review + conformance rerun + signed release",
};

/**
 * Render a governance diff as human-readable text (for CLI output).
 */
export function renderGovernanceDiff(diff: GovernanceDiff): string {
  const lines: string[] = [];
  lines.push(`Governance Diff (${diff.summary})`);
  lines.push(`Change class: ${CHANGE_CLASS_LABEL[diff.changeClass]}`);
  lines.push("");

  for (const d of diff.added) {
    const eff = d.effectsAdded.length > 0 ? ` effects { ${d.effectsAdded.join(" ")} }` : "";
    lines.push(`  + ${d.name} (${d.qualifierAfter})${eff}${d.widensAuthority ? "  ⚠" : ""}`);
  }
  for (const d of diff.removed) {
    lines.push(`  - ${d.name} (${d.qualifierBefore}) REMOVED`);
  }
  for (const d of diff.changed) {
    const adds = d.effectsAdded.map(e => `+${e}`);
    const rems = d.effectsRemoved.map(e => `-${e}`);
    const qual = d.qualifierBefore !== d.qualifierAfter ? ` [${d.qualifierBefore}→${d.qualifierAfter}]` : "";
    lines.push(`  ~ ${d.name}${qual} ${[...adds, ...rems].join(" ")}${d.widensAuthority ? "  ⚠" : ""}`);
  }

  return lines.join("\n");
}

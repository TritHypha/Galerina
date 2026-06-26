// =============================================================================
// TriState v0.2 — discriminated union replacing the numeric Tri type
//
// v0.1 Tri (-1 | 0 | 1) stays in the root index for backward compatibility.
// v0.2 TriState carries structured reasons when unknown.
// =============================================================================

import type { UnknownReason } from "./tri-unknown-reason.js";

export type TriState =
  | { readonly kind: "true";    readonly value: true }
  | { readonly kind: "false";   readonly value: false }
  | { readonly kind: "unknown"; readonly reasons: readonly UnknownReason[] };

// ---------------------------------------------------------------------------
// Canonical singletons for true and false (no allocation on the hot path)
// ---------------------------------------------------------------------------

export const TRI_STATE_TRUE: TriState = { kind: "true",  value: true  };
export const TRI_STATE_FALSE: TriState = { kind: "false", value: false };

/**
 * Construct a TriState representing an unknown value with structured reasons.
 * Always use this constructor rather than inline objects so the reasons array
 * is guaranteed to be non-empty.
 */
export function triUnknown(reason: UnknownReason): TriState {
  return { kind: "unknown", reasons: [reason] };
}

/**
 * Construct a TriState representing unknown with multiple reasons
 * (used when combining states).
 */
export function triUnknownFromReasons(
  reasons: readonly UnknownReason[],
): TriState {
  if (reasons.length === 0) {
    throw new Error("triUnknownFromReasons: reasons must be non-empty.");
  }

  return { kind: "unknown", reasons };
}

// ---------------------------------------------------------------------------
// Type guards
// ---------------------------------------------------------------------------

export function isTriTrue(state: TriState): state is { kind: "true"; value: true } {
  return state.kind === "true";
}

export function isTriFalse(state: TriState): state is { kind: "false"; value: false } {
  return state.kind === "false";
}

export function isTriUnknown(
  state: TriState,
): state is { kind: "unknown"; reasons: readonly UnknownReason[] } {
  return state.kind === "unknown";
}

// =============================================================================
// BoolBoundary enforcement — validateBoolBoundary()
//
// Accepts TriState or Decision and returns a BoolBoundaryResult.
// unknown and review always fail closed (allowed=false, value=false).
// =============================================================================

import type { TriState } from "../tri/tri-state.js";
import type { Decision } from "../decision/decision-state.js";
import type { BoolBoundaryContext } from "./bool-boundary-context.js";
import type { BoolBoundaryResult } from "./bool-boundary.js";
import type { LogicDiagnostic } from "../index.js";
import {
  boolDiagnosticFailedClosed,
  boolDiagnosticUnknownReason,
} from "./bool-diagnostics.js";

export type BoolBoundaryInput = TriState | Decision;

/**
 * Validate a TriState or Decision against a boolean boundary.
 *
 * Rules:
 * - TriState true  → allowed=true,  value=true
 * - TriState false → allowed=true,  value=false
 * - TriState unknown → fail closed (allowed=false, value=false, diagnostics)
 * - Decision allow  → allowed=true,  value=true
 * - Decision deny   → allowed=true,  value=false  (explicit deny is not an error)
 * - Decision review  → fail closed
 * - Decision unknown → fail closed
 */
export function validateBoolBoundary(
  input: BoolBoundaryInput,
  context: BoolBoundaryContext,
): BoolBoundaryResult {
  // TriState branch
  if (isTriState(input)) {
    if (input.kind === "true") {
      return { allowed: true, value: true, diagnostics: [], reason: "TriState is true." };
    }

    if (input.kind === "false") {
      return { allowed: true, value: false, diagnostics: [], reason: "TriState is false." };
    }

    // unknown — fail closed
    const diagnostics: LogicDiagnostic[] = [
      boolDiagnosticFailedClosed("unknown", context.boundaryName),
      ...input.reasons.map((r) => boolDiagnosticUnknownReason(r.code, r.message)),
    ];

    return {
      allowed: false,
      value: false,
      diagnostics,
      reason: `TriState unknown at boundary "${context.boundaryName}". Failing closed.`,
    };
  }

  // Decision branch
  if (input.kind === "allow") {
    return {
      allowed: true,
      value: true,
      diagnostics: [],
      reason: input.reason,
    };
  }

  if (input.kind === "deny") {
    return {
      allowed: true,
      value: false,
      diagnostics: [],
      reason: input.reason,
    };
  }

  // review or unknown — fail closed
  const diagnostics: LogicDiagnostic[] = [
    boolDiagnosticFailedClosed(input.kind, context.boundaryName),
  ];

  if (input.kind === "unknown") {
    diagnostics.push(
      ...input.unknownReasons.map((r) =>
        boolDiagnosticUnknownReason(r.code, r.message),
      ),
    );
  }

  return {
    allowed: false,
    value: false,
    diagnostics,
    reason: `Decision "${input.kind}" at boundary "${context.boundaryName}". Failing closed. ${input.reason}`,
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function isTriState(input: BoolBoundaryInput): input is TriState {
  return (
    typeof input === "object" &&
    input !== null &&
    "kind" in input &&
    (input.kind === "true" || input.kind === "false" || input.kind === "unknown") &&
    !("reason" in input)
  );
}

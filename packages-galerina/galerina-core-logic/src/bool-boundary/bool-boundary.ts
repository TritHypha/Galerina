// =============================================================================
// BoolBoundary v0.2 — enforced conversion of TriState/Decision to boolean
//
// Unknown and review always fail closed. This is the safe gateway between
// multi-state logic and runtime boolean checks.
// =============================================================================

import type { LogicDiagnostic } from "../index.js";

export interface BoolBoundaryResult {
  /** Whether the boundary check passed (true) or failed closed (false). */
  readonly allowed: boolean;
  /**
   * The boolean value to use. Always false when allowed=false.
   * Never trust this field without checking allowed first.
   */
  readonly value: boolean;
  /** Diagnostics explaining why the boundary was enforced. */
  readonly diagnostics: readonly LogicDiagnostic[];
  /** Human-readable reason for this boundary outcome. */
  readonly reason: string;
}

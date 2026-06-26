// =============================================================================
// UnknownReason — structured explanation for why a TriState is unknown
// =============================================================================

export interface UnknownReason {
  /**
   * Structured reason code. Convention: "POLICY_NOT_EVALUATED",
   * "MISSING_CAPABILITY", "RUNTIME_DATA_UNAVAILABLE", etc.
   */
  readonly code: string;
  readonly message: string;
  /**
   * Optional source identifier (flow name, capability key, policy name, etc.)
   * that produced this unknown reason.
   */
  readonly source?: string;
}

/**
 * Merge two arrays of UnknownReason, deduplicating by code.
 * Used when combining TriStates with combineUnknownReasons().
 */
export function deduplicateUnknownReasons(
  reasons: readonly UnknownReason[],
): readonly UnknownReason[] {
  const seen = new Set<string>();
  const result: UnknownReason[] = [];

  for (const reason of reasons) {
    if (!seen.has(reason.code)) {
      seen.add(reason.code);
      result.push(reason);
    }
  }

  return result;
}

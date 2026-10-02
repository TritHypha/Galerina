// =============================================================================
// Real I2 (fault-handler tier) + real I3 (body-local invariants) runtime diagnostics.
//
// Single source of truth per galerina-diagnostic-code-conventions.md §5: each code is ONE exported
// metadata constant { code, name, severity, message, suggestedFix } listed in its family's
// _DIAGNOSTICS array, and every emit site references the constant (no inline code literal).
// Pattern copied from requirement-diagnostics.ts (FUNGI-REQUIREMENT-*).
//
// All four codes are PROVISIONAL (zero-trust defaults, owner may revisit; KB registration pending -
// see tests/fixtures/diagnostic-pending-registration.txt). The family arrays below hold only the
// FAULT/INV codes that already use the constant pattern; FUNGI-FAULT-001/003/006 and
// FUNGI-INV-000..004 are still defined inline elsewhere (pre-existing; migration is a follow-up).
// =============================================================================

export interface GovernedControlDiagnosticDefinition {
  readonly code: `FUNGI-FAULT-${string}` | `FUNGI-INV-${string}`;
  readonly name: string;
  readonly severity: "error";
  readonly message: string;
  readonly suggestedFix: string;
}

/** R-I2-1/5/6: an executed `on_timeout_fault quarantine` handler halted, audited, denied and quarantined the flow. */
export const FUNGI_FAULT_007 = {
  code: "FUNGI-FAULT-007",
  name: "FLOW_QUARANTINED",
  severity: "error",
  message:
    "on_timeout_fault quarantine executed: the flow halted, audited and denied, and is quarantined for the " +
    "rest of this execution.",
  suggestedFix: "Fix the cause of the timeout; a new top-level execution starts with an empty quarantine registry.",
} as const satisfies GovernedControlDiagnosticDefinition;

/** R-I2-5: entry to a flow quarantined earlier in the same call tree is denied before every other gate. */
export const FUNGI_FAULT_008 = {
  code: "FUNGI-FAULT-008",
  name: "QUARANTINED_FLOW_DENIED",
  severity: "error",
  message:
    "flow was quarantined by its on_timeout_fault handler earlier in this execution - denied, body not run.",
  suggestedFix: "Do not re-enter a quarantined flow in the same execution; start a new top-level execution.",
} as const satisfies GovernedControlDiagnosticDefinition;

/** R-I3-4: a body-local invariant was evaluated at its check point and was not exactly Bool `true`. */
export const FUNGI_INV_005 = {
  code: "FUNGI-INV-005",
  name: "BODY_LOCAL_INVARIANT_VIOLATED",
  severity: "error",
  message:
    "body-local invariant was not exactly true immediately after its binding (false, non-Bool or not " +
    "evaluable) - denied, later statements not run.",
  suggestedFix: "Make the bound value satisfy the ensure, or move the check into an explicit fault/deny path.",
} as const satisfies GovernedControlDiagnosticDefinition;

/** R-I3-2: the flow produced a value without ever reaching a body-local invariant's check point. */
export const FUNGI_INV_006 = {
  code: "FUNGI-INV-006",
  name: "BODY_LOCAL_INVARIANT_NOT_ESTABLISHED",
  severity: "error",
  message:
    "body-local invariant was never established: the flow exited before the binding it depends on ran - denied.",
  suggestedFix: "Bind the referenced local on every path that returns, or guard the early return with a deny.",
} as const satisfies GovernedControlDiagnosticDefinition;

export const FUNGI_FAULT_DIAGNOSTICS = Object.freeze([
  FUNGI_FAULT_007,
  FUNGI_FAULT_008,
] as const);

export const FUNGI_INV_DIAGNOSTICS = Object.freeze([
  FUNGI_INV_005,
  FUNGI_INV_006,
] as const);

/** The emitted runtime message for a governed-control diagnostic: `[Flow 'f'] CODE NAME: detail`. */
export function governedControlMessage(
  diag: GovernedControlDiagnosticDefinition,
  flowName: string,
  detail: string,
): string {
  return `[Flow '${flowName}'] ${diag.code} ${diag.name}: ${detail}`;
}
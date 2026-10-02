// =============================================================================
// Real I2 (fault-handler tier) + real I3 (body-local invariants) runtime diagnostics.
//
// Single source of truth per galerina-diagnostic-code-conventions.md §5: each code is ONE exported
// metadata constant { code, name, severity, message, suggestedFix } listed in its family's
// _DIAGNOSTICS array, and every emit site references the constant (no inline code literal).
// Pattern copied from requirement-diagnostics.ts (FUNGI-REQUIREMENT-*).
//
// FUNGI-FAULT-007/008 and FUNGI-INV-005/006 are registered in the KB (2026-10-02, owner decision Phillip
// 13:41 BST). 2026-10-02 diag-constants (Phillip 16:35 BST order): the older FUNGI-FAULT-001/003/006 and
// FUNGI-INV-000..004 are migrated here too. IDs, meanings and emitted messages are unchanged; names follow
// the code where it had one and the KB catalog where the KB defines the canonical name (INV-001
// PRECONDITION_VIOLATED, was PRE_CONDITION_STATICALLY_FALSE; INV-002 POSTCONDITION_VIOLATED; INV-000
// GOVERNANCE_VIOLATION). Known KB mismatches are listed, not resolved: FAULT-001 has two meanings (static
// on_denial_fault retry, and the runtime audited `fault <expr>` channel); KB compiler-diagnostics names
// INV-003 HOST_SUPERVISOR_TRAP while the code and governance-rules use INVARIANT_BLOCK_EMPTY.
// =============================================================================

export interface GovernedControlDiagnosticDefinition {
  readonly code: `FUNGI-FAULT-${string}` | `FUNGI-INV-${string}`;
  readonly name: string;
  readonly severity: "error" | "warning";
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

/**
 * 0017 monotonicity: `on_denial_fault retry` is rejected (retrying a capability denial attempts a re-grant).
 * The same code is also used, pre-existing and unchanged, for the interpreter's audited `fault <expr>`
 * channel (a second meaning, listed for the KB/owner; not resolved here).
 */
export const FUNGI_FAULT_001 = {
  code: "FUNGI-FAULT-001",
  name: "FAULT_HANDLER_MONOTONICITY",
  severity: "error",
  message:
    "on_denial_fault retry is rejected: retrying a capability denial attempts a re-grant, colliding with " +
    "deny-only monotonicity (FUNGI-MONO-001).",
  suggestedFix: "Replace 'retry' with 'halt', 'quarantine', or 'fallback <flow>' for on_denial_fault.",
} as const satisfies GovernedControlDiagnosticDefinition;

/** 0017 fail-open guard: a handler resolving to `log` outside the on_rotation_fault opt-in keeps serving past the fault. */
export const FUNGI_FAULT_003 = {
  code: "FUNGI-FAULT-003",
  name: "FAULT_HANDLER_FAIL_OPEN",
  severity: "error",
  message: "a fault handler resolving to 'log' outside on_rotation_fault is fail-OPEN: it keeps serving past the fault.",
  suggestedFix: "Replace 'log' with 'halt' or 'quarantine' (log is fail-open; only on_rotation_fault may opt in).",
} as const satisfies GovernedControlDiagnosticDefinition;

/** Q7 K5 / Q9: a declared handler action other than halt (and the executable on_timeout_fault quarantine) is not executed. */
export const FUNGI_FAULT_006 = {
  code: "FUNGI-FAULT-006",
  name: "DECLARED_HANDLER_NOT_EXECUTED",
  severity: "error",
  message:
    "a declared fault handler action is not executed; at runtime the flow halts, audits and denies instead.",
  suggestedFix: "Replace the declared action with 'halt', or remove the handler until the handler tier is admitted.",
} as const satisfies GovernedControlDiagnosticDefinition;

/** A named `trap COND : ERROR_CODE` fired at runtime: the flow halts, audits and denies (KB name GOVERNANCE_VIOLATION). */
export const FUNGI_INV_000 = {
  code: "FUNGI-INV-000",
  name: "GOVERNANCE_VIOLATION",
  severity: "error",
  message: "a named trap fired at runtime; the flow halts, audits and denies (no value escapes).",
  suggestedFix: "Fix the condition that fires the trap, or handle that case explicitly before the trap.",
} as const satisfies GovernedControlDiagnosticDefinition;

/** An input pre-condition is false: statically proved false by the verifier, or violated / not evaluable at flow entry. */
export const FUNGI_INV_001 = {
  code: "FUNGI-INV-001",
  name: "PRECONDITION_VIOLATED",
  severity: "error",
  message:
    "an input pre-condition (invariant ensure over parameters) is false or not evaluable before the body runs; " +
    "fail-closed, the body never runs.",
  suggestedFix: "Fix or remove the 'ensure' expression, or pass inputs that satisfy it.",
} as const satisfies GovernedControlDiagnosticDefinition;

/** An output post-condition (`ensure result ...`) is false or not evaluable at the single flow exit. */
export const FUNGI_INV_002 = {
  code: "FUNGI-INV-002",
  name: "POSTCONDITION_VIOLATED",
  severity: "error",
  message: "an output post-condition is false or not evaluable at the flow exit; the result never escapes (fail-closed).",
  suggestedFix: "Make the returned value satisfy the 'ensure result ...' expression, and return it explicitly.",
} as const satisfies GovernedControlDiagnosticDefinition;

/** An `invariant {}` block was declared with no ensure statements (warning). */
export const FUNGI_INV_003 = {
  code: "FUNGI-INV-003",
  name: "INVARIANT_BLOCK_EMPTY",
  severity: "warning",
  message: "an invariant {} block declares no 'ensure' statements.",
  suggestedFix: "Add: ensure <condition>; inside the invariant {} block, or remove the block.",
} as const satisfies GovernedControlDiagnosticDefinition;

/** An ensure expression references a name outside the flow's parameter scope (typos included). */
export const FUNGI_INV_004 = {
  code: "FUNGI-INV-004",
  name: "SYMBOL_UNRESOLVED_IN_INVARIANT",
  severity: "error",
  message: "an invariant 'ensure' references a name that is not a parameter of the flow (or an eligible body local).",
  suggestedFix: "Check the spelling of the name, or use a flow parameter name instead.",
} as const satisfies GovernedControlDiagnosticDefinition;

export const FUNGI_FAULT_DIAGNOSTICS = Object.freeze([
  FUNGI_FAULT_001,
  FUNGI_FAULT_003,
  FUNGI_FAULT_006,
  FUNGI_FAULT_007,
  FUNGI_FAULT_008,
] as const);

export const FUNGI_INV_DIAGNOSTICS = Object.freeze([
  FUNGI_INV_000,
  FUNGI_INV_001,
  FUNGI_INV_002,
  FUNGI_INV_003,
  FUNGI_INV_004,
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
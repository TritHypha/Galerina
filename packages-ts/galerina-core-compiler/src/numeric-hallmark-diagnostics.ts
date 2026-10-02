/**
 * FUNGI-NUMERIC-OP-005 and FUNGI-HALLMARK-006 diagnostic constants (2026-10-02 diag-constants, Phillip 16:35 BST
 * order). Same pattern as governed-control-diagnostics.ts: ONE exported constant
 * { code, name, severity, message, suggestedFix } per code, listed in its family _DIAGNOSTICS array, and every
 * emit in type-checker.ts references the constant. IDs, names and emitted text are unchanged.
 *
 * Not migrated here (listed for the KB): FUNGI-NUMERIC-OP-003 has two names in the code base; it stays as is
 * until the KB settles the canonical one.
 */

export interface TypeCheckDiagnosticDefinition {
  readonly code: `FUNGI-${string}`;
  readonly name: string;
  readonly severity: "error";
  readonly message: string;
  readonly suggestedFix: string;
}

/** FUNGI-NUMERIC-OP-005: Money.of was given a computed (non-literal) currency code. */
export const FUNGI_NUMERIC_OP_005 = {
  code: "FUNGI-NUMERIC-OP-005",
  name: "MONEY_CODE_NOT_LITERAL",
  severity: "error",
  message:
    "Money.of needs its currency code as a string LITERAL so the currency is part of the type (Money<CODE>); a computed code cannot be checked.",
  suggestedFix: 'Write the code literally, e.g. Money.of("9.99", "CHF"), or use the constructor Money.chf("9.99").',
} as const satisfies TypeCheckDiagnosticDefinition;

/**
 * FUNGI-HALLMARK-006: a hallmark schema declares `decimals:` or `sign:`, which nothing enforces. The emitted
 * message and fix name the offending field, so type-checker.ts builds them from the field; the constant
 * carries the static code, name, severity and a generic message / fix.
 */
export const FUNGI_HALLMARK_006 = {
  code: "FUNGI-HALLMARK-006",
  name: "HALLMARK_SCHEMA_FIELD_NOT_ENFORCED",
  severity: "error",
  message:
    "Hallmark schema field 'decimals:' / 'sign:' is not enforced by the compiler or either runtime, so it would be a promise nothing keeps. It is refused rather than silently ignored.",
  suggestedFix: "Remove the field and check it in the gate flow (e.g. return Err(...) when the value breaks it).",
} as const satisfies TypeCheckDiagnosticDefinition;

/** FUNGI-NUMERIC-OP-* codes that use the constant pattern (005 only; 001..004 are pre-existing, 003 is listed). */
export const FUNGI_NUMERIC_OP_DIAGNOSTICS = Object.freeze([FUNGI_NUMERIC_OP_005] as const);
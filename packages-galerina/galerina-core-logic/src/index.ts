// =============================================================================
// galerina-core-logic — v0.1 stable exports
//
// Package: @galerina/core-logic
// Role:    Multi-state logic primitives: Tri (numeric), LogicDefinition,
//          TruthTable, and Omni logic contracts.
//
// v0.2 types (TriState, Decision, BoolBoundary, OmniState) are exported from
// sub-path imports:
//   @galerina/core-logic/tri
//   @galerina/core-logic/decision
//   @galerina/core-logic/bool-boundary
//   @galerina/core-logic/omni
// =============================================================================

export type Tri = -1 | 0 | 1;

export const TRI_FALSE: Tri = -1;
export const TRI_UNKNOWN: Tri = 0;
export const TRI_TRUE: Tri = 1;
export const TRI_LOGIC_STATES = ["Negative", "Neutral", "Positive"] as const;
export const DECISION_LOGIC_STATES = ["Deny", "Review", "Allow"] as const;

export type TriLogicStateName = (typeof TRI_LOGIC_STATES)[number];
export type DecisionLogicStateName = (typeof DECISION_LOGIC_STATES)[number];

export type TriBoolPolicy =
  | "unknown_as_false"
  | "unknown_as_true"
  | "unknown_as_error";

/** Matches DiagnosticSeverity in @galerina/core — kept local until workspace links are in place. */
export type LogicDiagnosticSeverity = "info" | "warning" | "error";

/**
 * Diagnostic produced by logic validation functions.
 * Structurally compatible with BaseDiagnostic in @galerina/core.
 * Additional field: path — dot-path into the validated structure.
 */
export interface LogicDiagnostic {
  /** Structured diagnostic code in SPORE-SERIES-NNN format. */
  readonly code: string;
  /** Screaming-snake-case name. Example: "DUPLICATE_STATE". */
  readonly name: string;
  readonly severity: LogicDiagnosticSeverity;
  readonly message: string;
  /** Dot-path into the validated structure, e.g. "states.2". */
  readonly path?: string;
}

export interface LogicState<N extends number> {
  readonly width: N;
  readonly state: number;
}

export interface LogicDefinition<N extends number> {
  readonly name: string;
  readonly width: N;
  readonly states: readonly string[];
}

export interface TruthTableRow<N extends number> {
  readonly inputs: readonly LogicState<N>[];
  readonly output: LogicState<N>;
}

export interface LogicReport<N extends number> {
  readonly logic: LogicDefinition<N>;
  readonly truthTable: readonly TruthTableRow<N>[];
  readonly warnings: readonly string[];
}

export interface OmniLogicDefinition<N extends number> extends LogicDefinition<N> {
  readonly kind: "Omni";
  readonly bounded: true;
  readonly description?: string;
}

export function isTri(value: unknown): value is Tri {
  return value === TRI_FALSE || value === TRI_UNKNOWN || value === TRI_TRUE;
}

export function triNot(value: Tri): Tri {
  return assertTri(value) === TRI_UNKNOWN ? TRI_UNKNOWN : invertTri(value);
}

export function triAnd(left: Tri, right: Tri): Tri {
  return minTri(assertTri(left), assertTri(right));
}

export function triOr(left: Tri, right: Tri): Tri {
  return maxTri(assertTri(left), assertTri(right));
}

export function triNor(left: Tri, right: Tri): Tri {
  return triNot(triOr(left, right));
}

export function triToBool(value: Tri, policy: TriBoolPolicy): boolean {
  const checked = assertTri(value);

  if (checked === TRI_TRUE) {
    return true;
  }

  if (checked === TRI_FALSE) {
    return false;
  }

  if (policy === "unknown_as_false") {
    return false;
  }

  if (policy === "unknown_as_true") {
    return true;
  }

  throw new Error("Cannot convert Tri unknown to Bool without a non-error policy.");
}

export function createLogicDefinition<N extends number>(
  name: string,
  width: N,
  states: readonly string[],
): LogicDefinition<N> {
  const diagnostics = validateLogicDefinition({ name, width, states });
  const errors = diagnostics.filter(
    (diagnostic) => diagnostic.severity === "error",
  );

  if (errors.length > 0) {
    throw new Error(errors.map((diagnostic) => diagnostic.message).join(" "));
  }

  return { name, width, states: [...states] };
}

export function createTriLogicDefinition(): LogicDefinition<3> {
  return createLogicDefinition("Tri", 3, TRI_LOGIC_STATES);
}

export function createDecisionLogicDefinition(): LogicDefinition<3> {
  return createLogicDefinition("Decision", 3, DECISION_LOGIC_STATES);
}

export function createOmniLogicDefinition<N extends number>(
  name: string,
  states: readonly string[],
  options: { readonly description?: string } = {},
): OmniLogicDefinition<N> {
  const width = states.length as N;
  const definition = createLogicDefinition(name, width, states);

  if (states.length > 256) {
    throw new RangeError("Omni logic definitions must stay bounded to 256 states or fewer.");
  }

  return {
    ...definition,
    kind: "Omni",
    bounded: true,
    ...(options.description === undefined
      ? {}
      : { description: options.description }),
  };
}

export function validateOmniLogicDefinition<N extends number>(
  definition: OmniLogicDefinition<N>,
): readonly LogicDiagnostic[] {
  const diagnostics: LogicDiagnostic[] = [...validateLogicDefinition(definition)];

  if (definition.kind !== "Omni" || definition.bounded !== true) {
    diagnostics.push({
      code: "SPORE-LOGIC-006",
      name: "OMNI_MUST_BE_BOUNDED",
      severity: "error",
      message: "Omni logic definitions must be explicitly bounded.",
      path: "bounded",
    });
  }

  if (definition.width > 256) {
    diagnostics.push({
      code: "SPORE-LOGIC-007",
      name: "OMNI_WIDTH_TOO_LARGE",
      severity: "error",
      message: "Omni logic definitions must declare 256 states or fewer.",
      path: "width",
    });
  }

  return diagnostics;
}

export function validateLogicDefinition<N extends number>(
  definition: LogicDefinition<N>,
): readonly LogicDiagnostic[] {
  const diagnostics: LogicDiagnostic[] = [];

  if (!isSafeGalerinaame(definition.name)) {
    diagnostics.push({
      code: "SPORE-LOGIC-001",
      name: "INVALID_NAME",
      severity: "error",
      message:
        "Logic definition names must be non-empty identifiers beginning with a letter or underscore.",
      path: "name",
    });
  }

  if (!Number.isSafeInteger(definition.width) || definition.width < 2) {
    diagnostics.push({
      code: "SPORE-LOGIC-002",
      name: "INVALID_WIDTH",
      severity: "error",
      message: "Logic width must be a safe integer greater than or equal to 2.",
      path: "width",
    });
  }

  if (definition.states.length !== definition.width) {
    diagnostics.push({
      code: "SPORE-LOGIC-003",
      name: "STATE_COUNT_MISMATCH",
      severity: "error",
      message: "Logic state count must exactly match the declared width.",
      path: "states",
    });
  }

  const seenStates = new Set<string>();

  definition.states.forEach((state, index) => {
    if (!isSafeGalerinaame(state)) {
      diagnostics.push({
        code: "SPORE-LOGIC-004",
        name: "INVALID_STATE_NAME",
        severity: "error",
        message:
          "Logic state names must be non-empty identifiers beginning with a letter or underscore.",
        path: `states.${index}`,
      });
    }

    if (seenStates.has(state)) {
      diagnostics.push({
        code: "SPORE-LOGIC-005",
        name: "DUPLICATE_STATE",
        severity: "error",
        message: `Logic state "${state}" is duplicated.`,
        path: `states.${index}`,
      });
    }

    seenStates.add(state);
  });

  return diagnostics;
}

export function createLogicState<N extends number>(
  definition: LogicDefinition<N>,
  state: number,
): LogicState<N> {
  const diagnostics = validateLogicDefinition(definition);

  if (diagnostics.some((diagnostic) => diagnostic.severity === "error")) {
    throw new Error("Cannot create a logic state for an invalid definition.");
  }

  if (!isValidLogicState(definition, { width: definition.width, state })) {
    throw new RangeError("Logic state index is outside the declared width.");
  }

  return { width: definition.width, state };
}

export function triToLogicState(value: Tri): LogicState<3> {
  const definition = createTriLogicDefinition();
  return createLogicState(definition, assertTri(value) + 1);
}

export function logicStateToTri(state: LogicState<3>): Tri {
  const definition = createTriLogicDefinition();

  if (!isValidLogicState(definition, state)) {
    throw new RangeError("Logic state is not a valid Tri state.");
  }

  return (state.state - 1) as Tri;
}

export function createDecisionLogicState(
  state: DecisionLogicStateName,
): LogicState<3> {
  const definition = createDecisionLogicDefinition();
  const index = DECISION_LOGIC_STATES.indexOf(state);

  if (index < 0) {
    throw new RangeError("Unknown Decision state.");
  }

  return createLogicState(definition, index);
}

export function isValidLogicState<N extends number>(
  definition: LogicDefinition<N>,
  state: LogicState<N>,
): boolean {
  return (
    state.width === definition.width &&
    Number.isSafeInteger(state.state) &&
    state.state >= 0 &&
    state.state < definition.width
  );
}

export function createTruthTableReport<N extends number>(
  logic: LogicDefinition<N>,
  truthTable: readonly TruthTableRow<N>[],
): LogicReport<N> {
  const diagnostics = validateTruthTable(logic, truthTable);

  return {
    logic,
    truthTable,
    warnings: diagnostics.map((diagnostic) => diagnostic.message),
  };
}

export function validateTruthTable<N extends number>(
  logic: LogicDefinition<N>,
  truthTable: readonly TruthTableRow<N>[],
): readonly LogicDiagnostic[] {
  const diagnostics: LogicDiagnostic[] = [
    ...validateLogicDefinition(logic),
  ];

  if (truthTable.length === 0) {
    diagnostics.push({
      code: "SPORE-LOGIC-008",
      name: "EMPTY_TRUTH_TABLE",
      severity: "warning",
      message: "Truth table has no rows.",
      path: "truthTable",
    });

    return diagnostics;
  }

  const expectedInputCount = truthTable[0]?.inputs.length;

  if (expectedInputCount === undefined || expectedInputCount === 0) {
    diagnostics.push({
      code: "SPORE-LOGIC-009",
      name: "EMPTY_TRUTH_TABLE_INPUTS",
      severity: "error",
      message: "Truth table rows must declare at least one input.",
      path: "truthTable.0.inputs",
    });
  }

  const rowKeys = new Set<string>();

  truthTable.forEach((row, rowIndex) => {
    if (row.inputs.length !== expectedInputCount) {
      diagnostics.push({
        code: "SPORE-LOGIC-010",
        name: "TRUTH_TABLE_ARITY_MISMATCH",
        severity: "error",
        message: "Truth table rows must use a consistent input count.",
        path: `truthTable.${rowIndex}.inputs`,
      });
    }

    row.inputs.forEach((input, inputIndex) => {
      if (!isValidLogicState(logic, input)) {
        diagnostics.push({
          code: "SPORE-LOGIC-011",
          name: "INVALID_INPUT_STATE",
          severity: "error",
          message: "Truth table input state is outside the declared logic width.",
          path: `truthTable.${rowIndex}.inputs.${inputIndex}`,
        });
      }
    });

    if (!isValidLogicState(logic, row.output)) {
      diagnostics.push({
        code: "SPORE-LOGIC-012",
        name: "INVALID_OUTPUT_STATE",
        severity: "error",
        message: "Truth table output state is outside the declared logic width.",
        path: `truthTable.${rowIndex}.output`,
      });
    }

    const rowKey = row.inputs.map((input) => input.state).join(",");

    if (rowKeys.has(rowKey)) {
      diagnostics.push({
        code: "SPORE-LOGIC-013",
        name: "DUPLICATE_TRUTH_TABLE_ROW",
        severity: "error",
        message: "Truth table contains a duplicate input combination.",
        path: `truthTable.${rowIndex}.inputs`,
      });
    }

    rowKeys.add(rowKey);
  });

  const expectedRows =
    expectedInputCount === undefined ? 0 : logic.width ** expectedInputCount;

  if (
    expectedRows > 0 &&
    expectedRows <= 4096 &&
    rowKeys.size < expectedRows
  ) {
    diagnostics.push({
      code: "SPORE-LOGIC-014",
      name: "INCOMPLETE_TRUTH_TABLE",
      severity: "warning",
      message: "Truth table does not cover every input combination.",
      path: "truthTable",
    });
  }

  return diagnostics;
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

function assertTri(value: Tri): Tri {
  if (!isTri(value)) {
    throw new TypeError("Invalid Tri value. Expected -1, 0 or 1.");
  }

  return value;
}

function invertTri(value: Tri): Tri {
  return value === TRI_TRUE ? TRI_FALSE : TRI_TRUE;
}

function minTri(left: Tri, right: Tri): Tri {
  return left < right ? left : right;
}

function maxTri(left: Tri, right: Tri): Tri {
  return left > right ? left : right;
}

function isSafeGalerinaame(name: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(name);
}

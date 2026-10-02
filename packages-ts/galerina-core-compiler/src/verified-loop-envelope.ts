import { type AstNode } from "./parser.js";
import { isFlowDeclNamed } from "./flow-name.js";

export type LoopEnvelopeTrit = -1 | 0;

export interface VerifiedLoopEnvelopeFacts {
  readonly exactFlowShape: boolean;
  readonly exactContractPermission: boolean;
  readonly exactCardinalityGate: boolean;
  readonly exactInductionInitialization: boolean;
  readonly exactLoopCondition: boolean;
  readonly exactIndexAccess: boolean;
  readonly exactOptionMatch: boolean;
  readonly exactInductionStep: boolean;
  readonly closedLoopBody: boolean;
  readonly inductionInvariantDerived: boolean;
  readonly overflowImpossible: boolean;
  readonly exactTripCountDerived: boolean;
  readonly accessDominatedByGuard: boolean;
}

export interface VerifiedLoopInductionProof {
  readonly arithmeticModelId: "galerina.int.checked.v1";
  readonly initialValue: 0;
  readonly step: 1;
  readonly boundExclusive: 1000000;
  readonly maximumAccessIndex: 999999;
  readonly terminalValue: 1000000;
  readonly exactTripCount: 1000000;
  readonly invariant: "i(k)=k AND 0<=k<=1000000";
}

export interface VerifiedLoopEnvelopeProposal {
  readonly schemaId: "galerina.verified-loop-envelope.proposal.v2";
  readonly candidate: boolean;
  readonly verdict: LoopEnvelopeTrit;
  readonly flowName: string;
  readonly collectionName: "values";
  readonly inductionName: "i";
  readonly bound: 1000000;
  readonly facts: VerifiedLoopEnvelopeFacts;
  readonly proof: VerifiedLoopInductionProof | null;
  readonly executionWhenNotAdmitted: "checked";
  readonly requiredPermission: "verified_native_checked_read_loop_v1";
  readonly permissionTarget: "values";
  readonly contractSuggestion: "permissions { require verified_native_checked_read_loop_v1 on values }";
  readonly failureIds: readonly string[];
}

export interface BoundedLoopInductionProof {
  readonly arithmeticModelId: "galerina.int.checked.v1";
  readonly initialValue: 0;
  readonly step: 1;
  readonly boundExclusive: number;
  readonly maximumAccessIndex: number;
  readonly terminalValue: number;
  readonly exactTripCount: number;
  readonly invariant: string;
}

export interface BoundedReadLoopProposal {
  readonly schemaId: "galerina.bounded-checked-read.proposal.v1";
  readonly candidate: boolean;
  readonly verdict: LoopEnvelopeTrit;
  readonly flowName: string;
  readonly collectionName: "values";
  readonly inductionName: "i";
  readonly bound: number;
  readonly facts: VerifiedLoopEnvelopeFacts;
  readonly proof: BoundedLoopInductionProof | null;
  readonly executionWhenNotAdmitted: "checked";
  readonly requiredPermission: "verified_native_checked_read_loop_v1";
  readonly permissionTarget: "values";
  readonly contractSuggestion: "permissions { require verified_native_checked_read_loop_v1 on values }";
  readonly failureIds: readonly string[];
}

const SCHEMA_ID = "galerina.verified-loop-envelope.proposal.v2" as const;
const COLLECTION_NAME = "values" as const;
const INDUCTION_NAME = "i" as const;
const BOUND = 1000000 as const;
const MIN_BOUND = 1 as const;
const MAXIMUM_ACCESS_INDEX = 999999 as const;
const CONTRACT_PERMISSION = "verified_native_checked_read_loop_v1" as const;

function children(node: AstNode | undefined): readonly AstNode[] {
  return node?.children ?? [];
}

function isIdentifier(node: AstNode | undefined, value: string): boolean {
  return node?.kind === "identifier" && node.value === value;
}

function isNumber(node: AstNode | undefined, value: number): boolean {
  return node?.kind === "numberLiteral" && node.value === String(value);
}

function isExactBinary(
  node: AstNode | undefined,
  operator: string,
  left: (node: AstNode | undefined) => boolean,
  right: (node: AstNode | undefined) => boolean,
): boolean {
  const operands = children(node);
  return node?.kind === "binaryExpr"
    && node.value === operator
    && operands.length === 2
    && left(operands[0])
    && right(operands[1]);
}

function isTerminalErrorReturn(node: AstNode | undefined): boolean {
  const expression = children(node)[0];
  return node?.kind === "returnStmt"
    && expression?.kind === "callExpr"
    && expression.value === "Err"
    && children(expression).length === 1;
}

function isExactCardinalityGate(node: AstNode | undefined, bound: number = BOUND): boolean {
  const parts = children(node);
  const condition = parts[0];
  const refusalBlock = parts[1];
  const leftIsCount = (candidate: AstNode | undefined): boolean => {
    const callChildren = children(candidate);
    return candidate?.kind === "callExpr"
      && candidate.value === "count"
      && candidate.callStyle === "method"
      && callChildren.length === 1
      && isIdentifier(callChildren[0], COLLECTION_NAME);
  };

  return node?.kind === "ifStmt"
    && parts.length === 2
    && isExactBinary(condition, "!=", leftIsCount, (candidate) => isNumber(candidate, bound))
    && refusalBlock?.kind === "block"
    && children(refusalBlock).length === 1
    && isTerminalErrorReturn(children(refusalBlock)[0]);
}

function isExactInductionInitialization(node: AstNode | undefined): boolean {
  return node?.kind === "mutDecl"
    && node.value === `${INDUCTION_NAME}: Int`
    && children(node).length === 1
    && isNumber(children(node)[0], 0);
}

function isExactResultInitialization(node: AstNode | undefined): boolean {
  return node?.kind === "mutDecl"
    && node.value === "last: Int"
    && children(node).length === 1
    && isNumber(children(node)[0], 0);
}

function isExactLoopCondition(node: AstNode | undefined, bound: number = BOUND): boolean {
  return isExactBinary(
    node,
    "<",
    (candidate) => isIdentifier(candidate, INDUCTION_NAME),
    (candidate) => isNumber(candidate, bound),
  );
}

function isExactGet(node: AstNode | undefined): boolean {
  const args = children(node);
  return node?.kind === "callExpr"
    && node.value === "get"
    && node.callStyle === "method"
    && args.length === 2
    && isIdentifier(args[0], COLLECTION_NAME)
    && isIdentifier(args[1], INDUCTION_NAME);
}

function isExactSelection(node: AstNode | undefined): boolean {
  return node?.kind === "letDecl"
    && node.value === "selected: Option<Int>"
    && children(node).length === 1
    && isExactGet(children(node)[0]);
}

function isExactSomeArm(node: AstNode | undefined): boolean {
  const armChildren = children(node);
  const armBody = armChildren[1];
  const statement = children(armBody)[0];
  return node?.kind === "matchArm"
    && node.value === "Some"
    && armChildren.length === 2
    && isIdentifier(armChildren[0], "value")
    && armBody?.kind === "block"
    && children(armBody).length === 1
    && statement?.kind === "assignStmt"
    && statement.value === "last"
    && children(statement).length === 1
    && isIdentifier(children(statement)[0], "value");
}

function isExactRefusalArm(node: AstNode | undefined, name: "None" | "_"): boolean {
  return node?.kind === "matchArm"
    && node.value === name
    && children(node).length === 1
    && isTerminalErrorReturn(children(node)[0]);
}

function isExactOptionMatch(node: AstNode | undefined): boolean {
  const matchChildren = children(node);
  return node?.kind === "matchExpr"
    && matchChildren.length === 4
    && isIdentifier(matchChildren[0], "selected")
    && isExactSomeArm(matchChildren[1])
    && isExactRefusalArm(matchChildren[2], "None")
    && isExactRefusalArm(matchChildren[3], "_");
}

function isExactInductionStep(node: AstNode | undefined): boolean {
  return node?.kind === "assignStmt"
    && node.value === INDUCTION_NAME
    && children(node).length === 1
    && isExactBinary(
      children(node)[0],
      "+",
      (candidate) => isIdentifier(candidate, INDUCTION_NAME),
      (candidate) => isNumber(candidate, 1),
    );
}

function isExactSuccessReturn(node: AstNode | undefined): boolean {
  const expression = children(node)[0];
  return node?.kind === "returnStmt"
    && children(node).length === 1
    && expression?.kind === "callExpr"
    && expression.value === "Ok"
    && children(expression).length === 1
    && isIdentifier(children(expression)[0], "last");
}

function collectNodes(root: AstNode, predicate: (node: AstNode) => boolean): readonly AstNode[] {
  const matches: AstNode[] = [];
  const visit = (node: AstNode): void => {
    if (predicate(node)) matches.push(node);
    for (const child of children(node)) visit(child);
  };
  visit(root);
  return matches;
}

function isExactFlowShape(flow: AstNode): boolean {
  const flowChildren = children(flow);
  const params = flowChildren.filter((node) => node.kind === "paramDecl");
  const resultTypes = flowChildren.filter((node) => node.kind === "typeRef");
  const contracts = flowChildren.filter((node) => node.kind === "contractDecl");
  const bodies = flowChildren.filter((node) => node.kind === "block");
  const contractParts = children(contracts[0]);
  const effects = contractParts.filter((node) => node.kind === "identifier" && node.value === "effects:block");

  return flow.kind === "secureFlowDecl"
    && params.length === 1
    && params[0]?.value === "values: Array<Int>"
    && resultTypes.length === 1
    && resultTypes[0]?.value === "Result<Int,String>"
    && contracts.length === 1
    && effects.length === 1
    && children(effects[0]).length === 0
    && bodies.length === 1;
}

function isExactContractPermission(flow: AstNode): boolean {
  const contract = children(flow).find((node) => node.kind === "contractDecl");
  const permissions = children(contract).filter(
    (node) => node.kind === "identifier" && node.value === "permissions:block",
  );
  return permissions.length === 1
    && children(permissions[0]).length === 1
    && children(permissions[0])[0]?.kind === "identifier"
    && children(permissions[0])[0]?.value === `require:${CONTRACT_PERMISSION}:on:${COLLECTION_NAME}`;
}

function refusalIds(facts: VerifiedLoopEnvelopeFacts): readonly string[] {
  const failures: string[] = [];
  if (!facts.exactFlowShape) failures.push("FLOW_SHAPE_NOT_EXACT");
  if (!facts.exactContractPermission) failures.push("VERIFIED_NATIVE_PERMISSION_MISSING");
  if (!facts.exactCardinalityGate) failures.push("CARDINALITY_GATE_MISSING");
  if (!facts.exactInductionInitialization) failures.push("INDUCTION_INITIALIZATION_NOT_EXACT");
  if (!facts.exactLoopCondition) failures.push("LOOP_CONDITION_NOT_EXACT");
  if (!facts.exactIndexAccess) failures.push("INDEX_ACCESS_NOT_EXACT");
  if (!facts.exactOptionMatch) failures.push("OPTION_MATCH_NOT_EXACT");
  if (!facts.exactInductionStep) failures.push("INDUCTION_STEP_NOT_EXACT");
  if (!facts.closedLoopBody) failures.push("LOOP_BODY_NOT_CLOSED");
  if (!facts.inductionInvariantDerived) failures.push("INDUCTION_INVARIANT_NOT_DERIVED");
  if (!facts.overflowImpossible) failures.push("INDUCTION_OVERFLOW_NOT_EXCLUDED");
  if (!facts.exactTripCountDerived) failures.push("EXACT_TRIP_COUNT_NOT_DERIVED");
  if (!facts.accessDominatedByGuard) failures.push("ACCESS_NOT_DOMINATED_BY_GUARD");
  return Object.freeze(failures);
}

function inductionProof(): VerifiedLoopInductionProof {
  return Object.freeze({
    arithmeticModelId: "galerina.int.checked.v1",
    initialValue: 0,
    step: 1,
    boundExclusive: BOUND,
    maximumAccessIndex: MAXIMUM_ACCESS_INDEX,
    terminalValue: BOUND,
    exactTripCount: BOUND,
    invariant: "i(k)=k AND 0<=k<=1000000",
  });
}

function proposal(
  flowName: string,
  facts: VerifiedLoopEnvelopeFacts,
  failureIds: readonly string[],
): VerifiedLoopEnvelopeProposal {
  const candidate = failureIds.length === 0;
  return Object.freeze({
    schemaId: SCHEMA_ID,
    candidate,
    verdict: candidate ? 0 : -1,
    flowName,
    collectionName: COLLECTION_NAME,
    inductionName: INDUCTION_NAME,
    bound: BOUND,
    facts: Object.freeze(facts),
    proof: candidate ? inductionProof() : null,
    executionWhenNotAdmitted: "checked",
    requiredPermission: CONTRACT_PERMISSION,
    permissionTarget: COLLECTION_NAME,
    contractSuggestion: "permissions { require verified_native_checked_read_loop_v1 on values }",
    failureIds: candidate
      ? Object.freeze(["INDEPENDENT_VERIFIER_UNAVAILABLE"])
      : failureIds,
  });
}

function analyzeFlowFacts(
  flow: AstNode,
  bound: number,
  boundsMatch: boolean,
): VerifiedLoopEnvelopeFacts {
  const body = children(flow).find((node) => node.kind === "block");
  const statements = children(body);
  const loops = collectNodes(flow, (node) => node.kind === "whileStmt");
  const loop = loops[0];
  const loopStatementIndex = loop === undefined ? -1 : statements.indexOf(loop);
  const beforeLoop = loopStatementIndex < 0 ? [] : statements.slice(0, loopStatementIndex);
  const cardinalityGates = beforeLoop.filter((node) => isExactCardinalityGate(node, bound));
  const inductionInitializations = beforeLoop.filter(isExactInductionInitialization);
  const loopStatements = children(children(loop)[1]);
  const getCalls = loop === undefined
    ? []
    : collectNodes(loop, (node) => node.kind === "callExpr" && node.value === "get");
  const inductionWrites = loop === undefined
    ? []
    : collectNodes(loop, (node) => node.kind === "assignStmt" && node.value === INDUCTION_NAME);
  const collectionWrites = loop === undefined
    ? []
    : collectNodes(loop, (node) => node.kind === "assignStmt" && node.value === COLLECTION_NAME);
  const loopCalls = loop === undefined
    ? []
    : collectNodes(loop, (node) => node.kind === "callExpr");
  const allowedCalls = loopCalls.every((node) => node.value === "get" || node.value === "Err");
  const exactOuterShape = statements.length === 5
    && isExactCardinalityGate(statements[0], bound)
    && isExactInductionInitialization(statements[1])
    && isExactResultInitialization(statements[2])
    && statements[3] === loop
    && isExactSuccessReturn(statements[4]);

  const structuralFacts = {
    exactFlowShape: isExactFlowShape(flow),
    exactContractPermission: isExactContractPermission(flow),
    exactCardinalityGate: cardinalityGates.length === 1,
    exactInductionInitialization: inductionInitializations.length === 1,
    exactLoopCondition: loops.length >= 1 && isExactLoopCondition(children(loop)[0], bound),
    exactIndexAccess: getCalls.length === 1 && isExactGet(getCalls[0]),
    exactOptionMatch: isExactSelection(loopStatements[0]) && isExactOptionMatch(loopStatements[1]),
    exactInductionStep: inductionWrites.length === 1
      && loopStatements.length === 3
      && isExactInductionStep(loopStatements[2]),
    closedLoopBody: loops.length === 1
      && exactOuterShape
      && loopStatements.length === 3
      && collectionWrites.length === 0
      && allowedCalls,
  };
  const inductionInvariantDerived = boundsMatch
    && structuralFacts.exactInductionInitialization
    && structuralFacts.exactLoopCondition
    && structuralFacts.exactInductionStep
    && structuralFacts.closedLoopBody;
  const facts: VerifiedLoopEnvelopeFacts = {
    ...structuralFacts,
    inductionInvariantDerived,
    overflowImpossible: inductionInvariantDerived && bound <= 2147483647,
    exactTripCountDerived: inductionInvariantDerived && bound >= MIN_BOUND,
    accessDominatedByGuard: boundsMatch
      && structuralFacts.exactCardinalityGate
      && structuralFacts.exactLoopCondition
      && structuralFacts.exactIndexAccess
      && structuralFacts.exactOptionMatch
      && structuralFacts.closedLoopBody,
  };
  return facts;
}

export function analyzeMillionReadLoopEnvelope(
  ast: AstNode,
  flowName: string,
): VerifiedLoopEnvelopeProposal {
  const flow = children(ast).find((node) => isFlowDeclNamed(node, flowName));
  if (flow === undefined) {
    return proposal(flowName, emptyFacts(), Object.freeze(["FLOW_NOT_FOUND"]));
  }

  const facts = analyzeFlowFacts(flow, BOUND, true);
  return proposal(flowName, facts, refusalIds(facts));
}

function literalInteger(node: AstNode | undefined): number | null {
  if (
    node?.kind !== "numberLiteral"
    || typeof node.value !== "string"
    || !/^(?:0|[1-9][0-9]*)$/u.test(node.value)
  ) return null;
  const value = Number(node.value);
  return Number.isSafeInteger(value) ? value : null;
}

function cardinalityBound(node: AstNode | undefined): number | null {
  const condition = children(node)[0];
  const operands = children(condition);
  return node?.kind === "ifStmt"
    && condition?.kind === "binaryExpr"
    && condition.value === "!="
    && operands.length === 2
    ? literalInteger(operands[1])
    : null;
}

function loopBound(node: AstNode | undefined): number | null {
  const condition = children(node)[0];
  const operands = children(condition);
  return node?.kind === "whileStmt"
    && condition?.kind === "binaryExpr"
    && condition.value === "<"
    && operands.length === 2
    ? literalInteger(operands[1])
    : null;
}

function emptyFacts(): VerifiedLoopEnvelopeFacts {
  return {
    exactFlowShape: false,
    exactContractPermission: false,
    exactCardinalityGate: false,
    exactInductionInitialization: false,
    exactLoopCondition: false,
    exactIndexAccess: false,
    exactOptionMatch: false,
    exactInductionStep: false,
    closedLoopBody: false,
    inductionInvariantDerived: false,
    overflowImpossible: false,
    exactTripCountDerived: false,
    accessDominatedByGuard: false,
  };
}

function boundedProof(bound: number): BoundedLoopInductionProof {
  return Object.freeze({
    arithmeticModelId: "galerina.int.checked.v1",
    initialValue: 0,
    step: 1,
    boundExclusive: bound,
    maximumAccessIndex: bound - 1,
    terminalValue: bound,
    exactTripCount: bound,
    invariant: `i(k)=k AND 0<=k<=${bound}`,
  });
}

function boundedProposal(
  flowName: string,
  bound: number,
  facts: VerifiedLoopEnvelopeFacts,
  failureIds: readonly string[],
): BoundedReadLoopProposal {
  const candidate = failureIds.length === 0;
  return Object.freeze({
    schemaId: "galerina.bounded-checked-read.proposal.v1",
    candidate,
    verdict: candidate ? 0 : -1,
    flowName,
    collectionName: COLLECTION_NAME,
    inductionName: INDUCTION_NAME,
    bound,
    facts: Object.freeze(facts),
    proof: candidate ? boundedProof(bound) : null,
    executionWhenNotAdmitted: "checked",
    requiredPermission: CONTRACT_PERMISSION,
    permissionTarget: COLLECTION_NAME,
    contractSuggestion: "permissions { require verified_native_checked_read_loop_v1 on values }",
    failureIds: candidate
      ? Object.freeze(["INDEPENDENT_VERIFIER_UNAVAILABLE"])
      : Object.freeze([...failureIds]),
  });
}

export function analyzeBoundedReadLoopEnvelope(
  ast: AstNode,
  flowName: string,
): BoundedReadLoopProposal {
  const flow = children(ast).find((node) => isFlowDeclNamed(node, flowName));
  if (flow === undefined) {
    return boundedProposal(flowName, 0, emptyFacts(), Object.freeze(["FLOW_NOT_FOUND"]));
  }

  const body = children(flow).find((node) => node.kind === "block");
  const statements = children(body);
  const loops = collectNodes(flow, (node) => node.kind === "whileStmt");
  const loop = loops[0];
  const declaredBound = cardinalityBound(statements[0]);
  const repeatedBound = loopBound(loop);
  const bound = declaredBound ?? repeatedBound ?? 0;
  const boundsMatch = declaredBound !== null
    && repeatedBound !== null
    && declaredBound === repeatedBound;
  const boundInProfile = bound >= MIN_BOUND && bound <= BOUND;
  const facts = analyzeFlowFacts(flow, bound, boundsMatch);
  const failures = [...refusalIds(facts)];
  if (!boundsMatch) failures.push("LOOP_BOUND_MISMATCH");
  if (!boundInProfile) failures.push("BOUND_OUT_OF_PROFILE");
  return boundedProposal(flowName, bound, facts, failures);
}

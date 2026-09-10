import {
  copyArtifactBytes,
  digestArtifactBytes,
  type Sha256Digest,
} from "./artifact-reference.js";
import {
  CHECKED_MODULE_SNAPSHOT_SCHEMA,
  computeSnapshotRunIdentity,
  decodeCheckedModuleSnapshot,
  encodeCheckedModuleSnapshot,
  type CheckedModuleSnapshotV1,
  type SnapshotCheckerIdentityV1,
  type SnapshotCompilerIdentityV1,
} from "./checked-module-snapshot.js";
import type { AstNode, FlowMeta, ParseResult } from "./parser.js";

export const CHECKED_MODULE_EVIDENCE_SCHEMA = "galerina.checked-module-evidence.v1" as const;
const REQUIRED_STAGES = ["parser", "symbols", "types", "effects", "values", "governance"] as const;
type RequiredStage = typeof REQUIRED_STAGES[number];

export interface CheckedModuleEvidenceStageV1 {
  readonly id: number;
  readonly name: RequiredStage;
  readonly digest: Sha256Digest;
  readonly outcome: "passed";
}

export interface CheckedModuleEvidenceV1 {
  readonly schema: typeof CHECKED_MODULE_EVIDENCE_SCHEMA;
  readonly stages: readonly CheckedModuleEvidenceStageV1[];
}

export interface CheckedModuleSnapshotSealInput {
  readonly sourceBytes: Uint8Array;
  readonly sourceFile: string;
  readonly parseResult: ParseResult;
  readonly checkerEvidence: CheckedModuleEvidenceV1;
  readonly compilerIdentity: SnapshotCompilerIdentityV1;
}

export interface CheckedModuleSnapshotSealResult {
  readonly snapshot: CheckedModuleSnapshotV1;
  readonly snapshotBytes: Uint8Array;
  readonly sourceDigest: Sha256Digest;
  readonly snapshotDigest: Sha256Digest;
  readonly runIdentity: ReturnType<typeof computeSnapshotRunIdentity>;
  readonly stageReceiptDigests: readonly Sha256Digest[];
}

export class CheckedModuleSnapshotSealRefusal extends Error {
  constructor(readonly code: string) {
    super(`CHECKED_MODULE_SNAPSHOT_SEAL_${code}: refused`);
    this.name = "CheckedModuleSnapshotSealRefusal";
  }
}

function refuse(code: string): never {
  throw new CheckedModuleSnapshotSealRefusal(code);
}

function ownRecord(value: unknown, code: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) refuse(`${code}_OBJECT`);
  const descriptors = Object.getOwnPropertyDescriptors(value) as Record<string, PropertyDescriptor>;
  if (Reflect.ownKeys(descriptors).some((key) => typeof key !== "string")) refuse(`${code}_SYMBOL`);
  const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of Object.keys(descriptors)) {
    const descriptor = descriptors[key];
    if (descriptor === undefined || !("value" in descriptor)) refuse(`${code}_ACCESSOR`);
    result[key] = descriptor.value;
  }
  return result;
}

function exactFields(record: Readonly<Record<string, unknown>>, expected: readonly string[], code: string): void {
  const fields = Object.keys(record);
  if (fields.length !== expected.length || fields.some((field) => !expected.includes(field))) refuse(`${code}_FIELD`);
}

function digest(value: unknown, code: string): Sha256Digest {
  if (typeof value !== "string" || !/^sha256:[0-9a-f]{64}$/u.test(value)) refuse(`${code}_DIGEST`);
  return value as Sha256Digest;
}

function checkedText(value: unknown, code: string): string {
  if (typeof value !== "string" || value.length === 0 || value.normalize("NFC") !== value) refuse(`${code}_TEXT`);
  return value;
}

function stageEvidence(value: unknown): readonly CheckedModuleEvidenceStageV1[] {
  const root = ownRecord(value, "EVIDENCE");
  exactFields(root, ["schema", "stages"], "EVIDENCE");
  if (root.schema !== CHECKED_MODULE_EVIDENCE_SCHEMA || !Array.isArray(root.stages)) refuse("EVIDENCE_SCHEMA");
  if (root.stages.length !== REQUIRED_STAGES.length) refuse("EVIDENCE_COUNT");
  const stages: CheckedModuleEvidenceStageV1[] = [];
  for (let index = 0; index < root.stages.length; index += 1) {
    const record = ownRecord(root.stages[index], "EVIDENCE_STAGE");
    exactFields(record, ["id", "name", "digest", "outcome"], "EVIDENCE_STAGE");
    if (record.id !== index + 1 || record.name !== REQUIRED_STAGES[index] || record.outcome !== "passed") refuse("EVIDENCE_STAGE_ORDER");
    stages.push(Object.freeze({ id: index + 1, name: record.name as RequiredStage, digest: digest(record.digest, "EVIDENCE_STAGE"), outcome: "passed" }));
  }
  return Object.freeze(stages);
}

function primitiveType(value: string): "Int" | "Bool" | "Trit" | "Verdict" {
  if (value === "Int" || value === "Bool" || value === "Trit" || value === "Verdict") return value;
  refuse("UNSUPPORTED_TYPE");
}

function parseParam(value: string): { readonly name: string; readonly type: "Int" | "Bool" | "Trit" | "Verdict" } {
  const match = /^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(Int|Bool|Trit|Verdict)$/u.exec(value);
  if (match === null || match[1] === undefined || match[2] === undefined) refuse("PARAMETER");
  return Object.freeze({ name: match[1], type: primitiveType(match[2]) });
}

interface NodeLocation {
  readonly offset?: number;
  readonly endOffset?: number;
  readonly line: number;
  readonly column: number;
}

function nodeLocation(node: AstNode, code: string): NodeLocation {
  const location = node.location;
  if (location === undefined || location.offset === undefined || location.endOffset === undefined) refuse(`${code}_SPAN`);
  if (!Number.isSafeInteger(location.offset) || !Number.isSafeInteger(location.endOffset) || location.offset < 0 || location.endOffset < location.offset) refuse(`${code}_SPAN`);
  return { offset: location.offset, endOffset: location.endOffset, line: location.line, column: location.column };
}

function nodeChildren(node: AstNode): readonly AstNode[] {
  if (node.children === undefined) return [];
  if (!Array.isArray(node.children)) refuse("AST_CHILDREN");
  return node.children;
}

function assertNoBlockingDiagnostics(parseResult: ParseResult): void {
  if (!Array.isArray(parseResult.diagnostics)) refuse("PARSE_DIAGNOSTICS");
  for (const diagnostic of parseResult.diagnostics) {
    const record = ownRecord(diagnostic, "PARSE_DIAGNOSTIC");
    if (record.severity === "error" || record.severity === "warning") refuse("PARSE_DIAGNOSTICS");
  }
}

export function sealCheckedModuleSnapshot(input: CheckedModuleSnapshotSealInput): CheckedModuleSnapshotSealResult {
  const sourceBytes = copyArtifactBytes(input.sourceBytes, "SOURCE");
  const sourceText = new TextDecoder("utf-8", { fatal: true }).decode(sourceBytes);
  const canonicalSource = sourceText.normalize("NFC").replace(/\r\n?/gu, "\n");
  if (canonicalSource.startsWith("\ufeff") || canonicalSource !== sourceText || new TextEncoder().encode(canonicalSource).byteLength !== sourceBytes.byteLength) refuse("SOURCE_CANONICALIZATION");
  const sourceDigest = digestArtifactBytes(sourceBytes);
  const stages = stageEvidence(input.checkerEvidence);
  const compiler = ownRecord(input.compilerIdentity, "COMPILER");
  exactFields(compiler, ["packageId", "version", "commitDigest"], "COMPILER");
  const compilerIdentity = Object.freeze({ packageId: checkedText(compiler.packageId, "COMPILER_PACKAGE"), version: checkedText(compiler.version, "COMPILER_VERSION"), commitDigest: digest(compiler.commitDigest, "COMPILER") });
  if (input.sourceFile.length === 0 || input.sourceFile.normalize("NFC") !== input.sourceFile) refuse("SOURCE_FILE");
  const parseResult = input.parseResult;
  if (parseResult === null || typeof parseResult !== "object") refuse("PARSE_RESULT");
  assertNoBlockingDiagnostics(parseResult);
  if (!Array.isArray(parseResult.flows) || parseResult.flows.length !== 1) refuse("FLOW_COUNT");
  const flow = parseResult.flows[0] as FlowMeta | undefined;
  if (flow === undefined || flow.qualifier !== "pure" || flow.declaredEffects.length !== 0) refuse("FLOW_ADMISSION");
  const parsedParams = flow.params.map(parseParam);
  const flowNode = (parseResult.ast.children ?? []).find((node) => node.kind === "pureFlowDecl" && node.value === flow.name);
  if (flowNode === undefined) refuse("FLOW_NODE");
  if (flowNode.location?.file !== input.sourceFile) refuse("SOURCE_FILE_MISMATCH");
  const flowNodeChildren = nodeChildren(flowNode);
  const body = flowNodeChildren.find((node) => node.kind === "block");
  if (body === undefined) refuse("FLOW_BODY");

  const typeNames = [flow.returnType, ...parsedParams.map((param) => param.type)];
  const uniqueTypeNames = [...new Set(typeNames)];
  const resolvedTypes = uniqueTypeNames.map((name, index) => Object.freeze({ id: index + 1, primitive: primitiveType(name) }));
  const typeId = (name: string): number => {
    const index = uniqueTypeNames.indexOf(name);
    if (index < 0) refuse("TYPE_ID");
    return index + 1;
  };
  const declarations: Array<{ readonly id: number; readonly name: string; readonly kind: "function" | "parameter"; readonly typeId: number }> = [Object.freeze({ id: 1, name: flow.name, kind: "function" as const, typeId: typeId(flow.returnType) })];
  for (let index = 0; index < parsedParams.length; index += 1) {
    const param = parsedParams[index];
    if (param === undefined) refuse("PARAMETER");
    declarations.push(Object.freeze({ id: index + 2, name: param.name, kind: "parameter" as const, typeId: typeId(param.type) }));
  }
  const parameterDeclarationIds = new Map(parsedParams.map((param, index) => [param.name, index + 2] as const));
  const sourceSpans: Array<{ id: number; startByte: number; endByte: number; line: number; column: number }> = [];
  const spanIds = new Map<string, number>();
  const spanFor = (node: AstNode): number => {
    const location = nodeLocation(node, "AST");
    const key = `${location.offset}:${location.endOffset}:${location.line}:${location.column}`;
    const existing = spanIds.get(key);
    if (existing !== undefined) return existing;
    const id = sourceSpans.length + 1;
    spanIds.set(key, id);
    sourceSpans.push({ id, startByte: location.offset ?? 0, endByte: location.endOffset ?? 0, line: location.line, column: location.column });
    return id;
  };
  const constants: Array<{ id: number; typeId: number; value: number | boolean }> = [];
  const constantIds = new Map<string, number>();
  const facts: Array<{ id: number; ordinal: number; operation: "parameter" | "constant" | "binary" | "branch" | "call" | "return"; declarationId: number; checkerId: number; spanId: number; operandDeclarationIds: number[]; constantId: number | null; targetFactIds: number[] }> = [];
  const checkerId = stages.find((stage) => stage.name === "types")?.id ?? 3;
  const addFact = (operation: typeof facts[number]["operation"], node: AstNode, operands: number[] = [], constantId: number | null = null): number => {
    const id = facts.length + 1;
    facts.push({ id, ordinal: id - 1, operation, declarationId: 1, checkerId, spanId: spanFor(node), operandDeclarationIds: [...operands], constantId, targetFactIds: [] });
    return id;
  };
  const addConstant = (node: AstNode): number => {
    if (node.value === undefined) refuse("CONSTANT_VALUE");
    const isBoolean = node.kind === "boolLiteral";
    const numeric = isBoolean ? undefined : Number(node.value);
    if (!isBoolean && (!Number.isSafeInteger(numeric) || numeric === undefined)) refuse("CONSTANT_VALUE");
    const value = isBoolean ? node.value === "true" : numeric as number;
    const key = `${isBoolean ? "Bool" : "Int"}:${String(value)}`;
    const existing = constantIds.get(key);
    if (existing !== undefined) return existing;
    const id = constants.length + 1;
    constantIds.set(key, id);
    constants.push({ id, typeId: typeId(isBoolean ? "Bool" : "Int"), value });
    return id;
  };
  const visitExpression = (node: AstNode): number[] => {
    if (node.kind === "identifier") {
      if (node.value === undefined) refuse("IDENTIFIER");
      const declarationId = parameterDeclarationIds.get(node.value);
      if (declarationId === undefined) refuse("UNRESOLVED_IDENTIFIER");
      return [declarationId];
    }
    if (node.kind === "numberLiteral" || node.kind === "boolLiteral") {
      const constantId = addConstant(node);
      addFact("constant", node, [], constantId);
      return [];
    }
    if (node.kind === "binaryExpr") {
      const children = nodeChildren(node);
      if (children.length !== 2) refuse("BINARY_SHAPE");
      const operands = [...visitExpression(children[0] as AstNode), ...visitExpression(children[1] as AstNode)];
      addFact("binary", node, operands);
      return [];
    }
    refuse("UNSUPPORTED_SNAPSHOT_SEMANTIC");
  };
  const visitStatement = (node: AstNode): void => {
    if (node.kind === "returnStmt") {
      const expression = nodeChildren(node)[0];
      if (expression === undefined) refuse("RETURN_SHAPE");
      const operands = visitExpression(expression);
      addFact("return", node, operands);
      return;
    }
    if (node.kind === "ifStmt") {
      const children = nodeChildren(node);
      if (children.length < 2 || children[0] === undefined) refuse("BRANCH_SHAPE");
      visitExpression(children[0]);
      const branchFactId = addFact("branch", node);
      for (const child of children.slice(1)) for (const statement of nodeChildren(child as AstNode)) visitStatement(statement);
      const branchFact = facts[branchFactId - 1];
      if (branchFact !== undefined) branchFact.targetFactIds.push(...facts.slice(branchFactId).map((fact) => fact.id));
      return;
    }
    if (node.kind === "block") {
      for (const child of nodeChildren(node)) visitStatement(child);
      return;
    }
    refuse("UNSUPPORTED_SNAPSHOT_SEMANTIC");
  };
  for (const param of flowNodeChildren.filter((node) => node.kind === "paramDecl")) {
    addFact("parameter", param);
  }
  visitStatement(body);
  spanFor(flowNode);
  const sourceSpansForFacts = sourceSpans;
  const snapshot: CheckedModuleSnapshotV1 = {
    schema: CHECKED_MODULE_SNAPSHOT_SCHEMA,
    edition: "scalar-v1",
    sourceIdentity: { sourceDigest, sourceCanonicalization: "UTF8_NO_BOM_LF_NFC_V1", byteLength: sourceBytes.byteLength },
    compilerIdentity,
    checkerIdentities: stages.map((stage): SnapshotCheckerIdentityV1 => ({ id: stage.id, name: stage.name, digest: stage.digest })),
    declarations,
    resolvedTypes,
    effects: [{ id: 1, declarationId: 1, checkerId: stages.find((stage) => stage.name === "effects")?.id ?? 4, spanId: spanFor(flowNode), effects: [] }],
    valueStates: parsedParams.map((_, index) => ({ id: index + 1, declarationId: index + 2, checkerId: stages.find((stage) => stage.name === "values")?.id ?? 5, spanId: spanFor(flowNodeChildren[index] ?? flowNode), state: "known" as const })),
    governanceFacts: [{ id: 1, declarationId: 1, checkerId: stages.find((stage) => stage.name === "governance")?.id ?? 6, spanId: spanFor(flowNode), verdict: "admitted" }],
    constants,
    sourceSpans: sourceSpansForFacts,
    diagnostics: [],
    entryFlowId: 1,
    limits: { maxFunctions: 3, maxBlocks: 8, maxInstructions: 32, maxCallDepth: 2, maxWork: 96 },
    traceFacts: facts,
  };
  const snapshotBytes = encodeCheckedModuleSnapshot(snapshot);
  const snapshotDigest = digestArtifactBytes(snapshotBytes);
  const normalizedSnapshot = decodeCheckedModuleSnapshot(snapshotBytes);
  const runIdentity = computeSnapshotRunIdentity(snapshotBytes);
  return Object.freeze({ snapshot: normalizedSnapshot, snapshotBytes: new Uint8Array(snapshotBytes), sourceDigest, snapshotDigest, runIdentity, stageReceiptDigests: Object.freeze(stages.map((stage) => stage.digest)) });
}

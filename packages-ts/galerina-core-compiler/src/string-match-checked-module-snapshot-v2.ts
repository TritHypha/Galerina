import { createHash } from "node:crypto";
import { copyArtifactBytes, digestArtifactBytes, type Sha256Digest } from "./artifact-reference.js";
import type { AstNode, FlowMeta, ParseResult } from "./parser.js";
import type { CheckedModuleEvidenceV1 } from "./seal-checked-module-snapshot.js";
import type { SnapshotCompilerIdentityV1 } from "./checked-module-snapshot.js";

export const STRING_MATCH_SNAPSHOT_SCHEMA = "galerina.checked-module-snapshot.v2" as const;
export const STRING_MATCH_SNAPSHOT_EDITION = "string-match-v1" as const;
export const STRING_MATCH_SNAPSHOT_MAX_BYTES = 262_144;
export const STRING_MATCH_SNAPSHOT_MAX_ITEMS = 16_384;
export const STRING_MATCH_LITERAL_MAX_BYTES = 256;
export const STRING_MATCH_ARM_MAX_COUNT = 16;

const REQUIRED_STAGES = ["parser", "symbols", "types", "effects", "values", "governance"] as const;
type RequiredStage = typeof REQUIRED_STAGES[number];

export interface StringMatchSourceIdentityV2 { readonly sourceDigest: Sha256Digest; readonly sourceCanonicalization: "UTF8_NO_BOM_LF_NFC_V1"; readonly byteLength: number; }
export interface StringMatchCompilerIdentityV2 { readonly packageId: string; readonly version: string; readonly commitDigest: Sha256Digest; }
export interface StringMatchCheckerIdentityV2 { readonly id: number; readonly name: RequiredStage; readonly digest: Sha256Digest; }
export interface StringMatchArmSpanV2 { readonly startByte: number; readonly endByte: number; readonly line: number; readonly column: number; }
export interface StringMatchLiteralArmV2 { readonly id: number; readonly literal: string; readonly result: boolean; readonly span: StringMatchArmSpanV2; }
export interface StringMatchWildcardArmV2 { readonly id: number; readonly literal: null; readonly result: boolean; readonly span: StringMatchArmSpanV2; }
export type StringMatchArmV2 = StringMatchLiteralArmV2 | StringMatchWildcardArmV2;
export interface StringMatchLimitsV2 { readonly maxFunctions: 3; readonly maxBlocks: 8; readonly maxInstructions: 32; readonly maxCallDepth: 2; readonly maxWork: 96; }

export interface StringMatchCheckedModuleSnapshotV2 {
  readonly schema: typeof STRING_MATCH_SNAPSHOT_SCHEMA;
  readonly edition: typeof STRING_MATCH_SNAPSHOT_EDITION;
  readonly sourceIdentity: StringMatchSourceIdentityV2;
  readonly compilerIdentity: StringMatchCompilerIdentityV2;
  readonly checkerIdentities: readonly StringMatchCheckerIdentityV2[];
  readonly flowName: string;
  readonly parameterName: string;
  readonly parameterType: "String";
  readonly returnType: "Bool";
  readonly arms: readonly StringMatchArmV2[];
  readonly limits: StringMatchLimitsV2;
  readonly diagnostics: readonly [];
}

export interface StringMatchSnapshotRunIdentityV2 {
  readonly schema: "galerina.checked-module-snapshot-run.v2";
  readonly sourceDigest: Sha256Digest;
  readonly snapshotSchema: typeof STRING_MATCH_SNAPSHOT_SCHEMA;
  readonly compilerCommitDigest: Sha256Digest;
  readonly checkerDigests: readonly Sha256Digest[];
  readonly snapshotBodyDigest: Sha256Digest;
}
export interface StringMatchSnapshotSealInputV2 { readonly sourceBytes: Uint8Array; readonly sourceFile: string; readonly parseResult: ParseResult; readonly checkerEvidence: CheckedModuleEvidenceV1; readonly compilerIdentity: SnapshotCompilerIdentityV1; }
export interface StringMatchSnapshotSealResultV2 { readonly snapshot: StringMatchCheckedModuleSnapshotV2; readonly snapshotBytes: Uint8Array; readonly sourceDigest: Sha256Digest; readonly snapshotDigest: Sha256Digest; readonly runIdentity: StringMatchSnapshotRunIdentityV2; readonly stageReceiptDigests: readonly Sha256Digest[]; readonly authorityReleased: false; }

export class StringMatchSnapshotRefusal extends Error { constructor(readonly code: string) { super(`STRING_MATCH_SNAPSHOT_${code}: refused`); this.name = "StringMatchSnapshotRefusal"; } }
function refuse(code: string): never { throw new StringMatchSnapshotRefusal(code); }

function ownDataRecord(value: unknown, code: string): Readonly<Record<string, unknown>> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) refuse(`${code}_OBJECT`);
  try {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) refuse(`${code}_OBJECT`);
    const descriptors = Object.getOwnPropertyDescriptors(value) as Record<string, PropertyDescriptor>;
    const names = Reflect.ownKeys(descriptors);
    if (names.some((name) => typeof name !== "string")) refuse(`${code}_SYMBOL`);
    const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    for (const name of names as string[]) { const descriptor = descriptors[name]; if (descriptor === undefined || !("value" in descriptor)) refuse(`${code}_ACCESSOR`); result[name] = descriptor.value; }
    return Object.freeze(result);
  } catch (error) {
    if (error instanceof StringMatchSnapshotRefusal) throw error;
    refuse(`${code}_ACCESS`);
  }
}
function exactFields(record: Readonly<Record<string, unknown>>, expected: readonly string[], code: string): void { const fields = Object.keys(record); if (fields.length !== expected.length || fields.some((field) => !expected.includes(field))) refuse(`${code}_FIELD`); }
function digest(value: unknown, code: string): Sha256Digest { if (typeof value !== "string" || !/^sha256:[0-9a-f]{64}$/u.test(value)) refuse(`${code}_DIGEST`); return value as Sha256Digest; }
function checkedString(value: unknown, code: string, maxBytes = 1024): string {
  if (typeof value !== "string" || value.length === 0) refuse(`${code}_STRING`);
  if (value.normalize("NFC") !== value) refuse(`${code}_NFC`);
  const encoded = new TextEncoder().encode(value);
  if (encoded.byteLength > maxBytes) refuse(`${code}_BOUND`);
  if (encoded.includes(0)) refuse(`${code}_NUL`);
  if (new TextDecoder("utf-8", { fatal: true }).decode(encoded) !== value) refuse(`${code}_UNICODE`);
  return value;
}
function integer(value: unknown, code: string, minimum = 0, maximum = Number.MAX_SAFE_INTEGER): number { if (typeof value !== "number" || !Number.isSafeInteger(value) || value < minimum || value > maximum) refuse(`${code}_INTEGER`); return value; }
function array(value: unknown, code: string, maximum = STRING_MATCH_SNAPSHOT_MAX_ITEMS): readonly unknown[] {
  if (!Array.isArray(value) || value.length > maximum) refuse(`${code}_ARRAY`);
  try {
    if (Object.getPrototypeOf(value) !== Array.prototype) refuse(`${code}_PROTOTYPE`);
    const descriptors = Object.getOwnPropertyDescriptors(value) as Record<string, PropertyDescriptor>;
    const lengthDescriptor = descriptors.length;
    if (lengthDescriptor === undefined || !("value" in lengthDescriptor) || lengthDescriptor.value !== value.length) refuse(`${code}_SPARSE`);
    const expected = new Set(["length", ...Array.from({ length: value.length }, (_, index) => String(index))]);
    if (Reflect.ownKeys(descriptors).some((key) => typeof key !== "string" || !expected.has(key))) refuse(`${code}_FIELD`);
    const result: unknown[] = [];
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = descriptors[String(index)];
      if (descriptor === undefined || !("value" in descriptor) || descriptor.get !== undefined || descriptor.set !== undefined) refuse(`${code}_ACCESSOR`);
      result.push(descriptor.value);
    }
    return Object.freeze(result);
  } catch (error) {
    if (error instanceof StringMatchSnapshotRefusal) throw error;
    refuse(`${code}_ACCESS`);
  }
}
function freezeDeep<T>(value: T): T { if (value !== null && typeof value === "object" && !Object.isFrozen(value)) { for (const child of Object.values(value as Record<string, unknown>)) freezeDeep(child); Object.freeze(value); } return value; }

function validateSpan(value: unknown, sourceLength: number): StringMatchArmSpanV2 {
  const record = ownDataRecord(value, "ARM_SPAN");
  exactFields(record, ["startByte", "endByte", "line", "column"], "ARM_SPAN");
  const startByte = integer(record.startByte, "ARM_SPAN_START", 0, sourceLength);
  const endByte = integer(record.endByte, "ARM_SPAN_END", startByte, sourceLength);
  return Object.freeze({ startByte, endByte, line: integer(record.line, "ARM_SPAN_LINE", 1), column: integer(record.column, "ARM_SPAN_COLUMN", 1) });
}

export function validateStringMatchCheckedModuleSnapshot(value: unknown): StringMatchCheckedModuleSnapshotV2 {
  const root = ownDataRecord(value, "ROOT");
  exactFields(root, ["schema", "edition", "sourceIdentity", "compilerIdentity", "checkerIdentities", "flowName", "parameterName", "parameterType", "returnType", "arms", "limits", "diagnostics"], "ROOT");
  if (root.schema !== STRING_MATCH_SNAPSHOT_SCHEMA) refuse("SCHEMA");
  if (root.edition !== STRING_MATCH_SNAPSHOT_EDITION) refuse("EDITION");
  const sourceRecord = ownDataRecord(root.sourceIdentity, "SOURCE");
  exactFields(sourceRecord, ["sourceDigest", "sourceCanonicalization", "byteLength"], "SOURCE");
  const source = Object.freeze({ sourceDigest: digest(sourceRecord.sourceDigest, "SOURCE"), sourceCanonicalization: sourceRecord.sourceCanonicalization === "UTF8_NO_BOM_LF_NFC_V1" ? "UTF8_NO_BOM_LF_NFC_V1" as const : refuse("SOURCE_CANONICALIZATION"), byteLength: integer(sourceRecord.byteLength, "SOURCE_LENGTH", 1, STRING_MATCH_SNAPSHOT_MAX_BYTES) });
  const compilerRecord = ownDataRecord(root.compilerIdentity, "COMPILER");
  exactFields(compilerRecord, ["packageId", "version", "commitDigest"], "COMPILER");
  const compiler = Object.freeze({ packageId: checkedString(compilerRecord.packageId, "COMPILER_PACKAGE"), version: checkedString(compilerRecord.version, "COMPILER_VERSION"), commitDigest: digest(compilerRecord.commitDigest, "COMPILER") });
  const checkerRecords = array(root.checkerIdentities, "CHECKERS", REQUIRED_STAGES.length).map((item) => ownDataRecord(item, "CHECKER"));
  if (checkerRecords.length !== REQUIRED_STAGES.length) refuse("CHECKERS_COUNT");
  const checkerIdentities = checkerRecords.map((record, index) => { const name = REQUIRED_STAGES[index]; if (name === undefined) refuse("CHECKERS_ORDER"); exactFields(record, ["id", "name", "digest"], "CHECKER"); if (record.id !== index + 1 || record.name !== name) refuse("CHECKERS_ORDER"); return Object.freeze({ id: index + 1, name, digest: digest(record.digest, "CHECKER") }); });
  if (root.parameterType !== "String") refuse("PARAMETER_TYPE");
  if (root.returnType !== "Bool") refuse("RETURN_TYPE");
  const flowName = checkedString(root.flowName, "FLOW_NAME", 256);
  const parameterName = checkedString(root.parameterName, "PARAMETER_NAME", 256);
  const armValues = array(root.arms, "ARMS", STRING_MATCH_ARM_MAX_COUNT).map((item) => ownDataRecord(item, "ARM"));
  if (armValues.length < 2) refuse("ARMS_COUNT");
  let wildcardCount = 0;
  const literals = new Set<string>();
  const arms = armValues.map((record, index) => {
    exactFields(record, ["id", "literal", "result", "span"], "ARM");
    if (record.id !== index + 1) refuse("ARMS_ORDER");
    if (typeof record.result !== "boolean") refuse("ARM_RESULT");
    if (record.literal === null) {
      wildcardCount += 1;
      if (index !== armValues.length - 1) refuse("ARMS_WILDCARD_ORDER");
      return Object.freeze({ id: index + 1, literal: null, result: record.result, span: validateSpan(record.span, source.byteLength) });
    }
    const literal = checkedString(record.literal, "ARM_LITERAL", STRING_MATCH_LITERAL_MAX_BYTES);
    if (new TextEncoder().encode(literal).byteLength === 0) refuse("ARM_LITERAL_EMPTY");
    if (literals.has(literal)) refuse("ARMS_DUPLICATE");
    literals.add(literal);
    return Object.freeze({ id: index + 1, literal, result: record.result, span: validateSpan(record.span, source.byteLength) });
  });
  if (wildcardCount !== 1) refuse("ARMS_WILDCARD");
  const limitsRecord = ownDataRecord(root.limits, "LIMITS");
  exactFields(limitsRecord, ["maxFunctions", "maxBlocks", "maxInstructions", "maxCallDepth", "maxWork"], "LIMITS");
  if (limitsRecord.maxFunctions !== 3 || limitsRecord.maxBlocks !== 8 || limitsRecord.maxInstructions !== 32 || limitsRecord.maxCallDepth !== 2 || limitsRecord.maxWork !== 96) refuse("LIMITS");
  const diagnostics = array(root.diagnostics, "DIAGNOSTICS", 0); if (diagnostics.length !== 0) refuse("DIAGNOSTICS");
  return freezeDeep(Object.freeze({ schema: STRING_MATCH_SNAPSHOT_SCHEMA, edition: STRING_MATCH_SNAPSHOT_EDITION, sourceIdentity: source, compilerIdentity: compiler, checkerIdentities: Object.freeze(checkerIdentities), flowName, parameterName, parameterType: "String" as const, returnType: "Bool" as const, arms: Object.freeze(arms), limits: Object.freeze({ maxFunctions: 3 as const, maxBlocks: 8 as const, maxInstructions: 32 as const, maxCallDepth: 2 as const, maxWork: 96 as const }), diagnostics: [] as const }));
}

export function encodeStringMatchCheckedModuleSnapshot(value: unknown): Uint8Array {
  const snapshot = validateStringMatchCheckedModuleSnapshot(value);
  const body = JSON.stringify({ schema: snapshot.schema, edition: snapshot.edition, sourceIdentity: snapshot.sourceIdentity, compilerIdentity: snapshot.compilerIdentity, checkerIdentities: snapshot.checkerIdentities, flowName: snapshot.flowName, parameterName: snapshot.parameterName, parameterType: snapshot.parameterType, returnType: snapshot.returnType, arms: snapshot.arms, limits: snapshot.limits, diagnostics: snapshot.diagnostics });
  const bytes = new TextEncoder().encode(`${body}\n`); if (bytes.byteLength > STRING_MATCH_SNAPSHOT_MAX_BYTES) refuse("BYTES_BOUND"); return new Uint8Array(bytes);
}
export function decodeStringMatchCheckedModuleSnapshot(bytes: Uint8Array): StringMatchCheckedModuleSnapshotV2 {
  const copy = copyArtifactBytes(bytes, "BYTES"); if (copy.byteLength > STRING_MATCH_SNAPSHOT_MAX_BYTES) refuse("BYTES_BOUND");
  try { return validateStringMatchCheckedModuleSnapshot(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(copy))); } catch (error) { if (error instanceof StringMatchSnapshotRefusal) throw error; refuse("ENCODING"); }
}
export function digestStringMatchCheckedModuleSnapshot(value: Uint8Array | StringMatchCheckedModuleSnapshotV2): Sha256Digest { const bytes = value instanceof Uint8Array ? copyArtifactBytes(value, "BYTES") : encodeStringMatchCheckedModuleSnapshot(value); if (value instanceof Uint8Array) decodeStringMatchCheckedModuleSnapshot(bytes); return `sha256:${createHash("sha256").update(bytes).digest("hex")}` as Sha256Digest; }
export function computeStringMatchSnapshotRunIdentity(snapshot: StringMatchCheckedModuleSnapshotV2 | Uint8Array): StringMatchSnapshotRunIdentityV2 { const decoded = snapshot instanceof Uint8Array ? decodeStringMatchCheckedModuleSnapshot(snapshot) : validateStringMatchCheckedModuleSnapshot(snapshot); const bytes = snapshot instanceof Uint8Array ? copyArtifactBytes(snapshot, "BYTES") : encodeStringMatchCheckedModuleSnapshot(decoded); return Object.freeze({ schema: "galerina.checked-module-snapshot-run.v2", sourceDigest: decoded.sourceIdentity.sourceDigest, snapshotSchema: STRING_MATCH_SNAPSHOT_SCHEMA, compilerCommitDigest: decoded.compilerIdentity.commitDigest, checkerDigests: Object.freeze(decoded.checkerIdentities.map((checker) => checker.digest)), snapshotBodyDigest: digestStringMatchCheckedModuleSnapshot(bytes) }); }

function nodeChildren(node: AstNode): readonly AstNode[] { if (node.children === undefined) return []; if (!Array.isArray(node.children)) refuse("AST_CHILDREN"); return node.children; }
function nodeSpan(node: AstNode, sourceText: string): StringMatchArmSpanV2 { const location = node.location; if (location === undefined || location.offset === undefined || location.endOffset === undefined) refuse("ARM_SPAN"); if (!Number.isSafeInteger(location.offset) || !Number.isSafeInteger(location.endOffset) || location.offset < 0 || location.endOffset < location.offset) refuse("ARM_SPAN"); const byteOffset = (offset: number): number => new TextEncoder().encode(sourceText.slice(0, offset)).byteLength; return Object.freeze({ startByte: byteOffset(location.offset), endByte: byteOffset(location.endOffset), line: location.line, column: location.column }); }
function stageIdentities(value: CheckedModuleEvidenceV1): readonly StringMatchCheckerIdentityV2[] { const root = ownDataRecord(value, "EVIDENCE"); exactFields(root, ["schema", "stages"], "EVIDENCE"); if (root.schema !== "galerina.checked-module-evidence.v1") refuse("EVIDENCE_SCHEMA"); const stageValues = array(root.stages, "EVIDENCE_STAGES", REQUIRED_STAGES.length).map((item) => ownDataRecord(item, "EVIDENCE_STAGE")); if (stageValues.length !== REQUIRED_STAGES.length) refuse("EVIDENCE_COUNT"); return Object.freeze(stageValues.map((record, index) => { const name = REQUIRED_STAGES[index]; if (name === undefined) refuse("EVIDENCE_STAGE_ORDER"); exactFields(record, ["id", "name", "digest", "outcome"], "EVIDENCE_STAGE"); if (record.id !== index + 1 || record.name !== name || record.outcome !== "passed") refuse("EVIDENCE_STAGE_ORDER"); return Object.freeze({ id: index + 1, name, digest: digest(record.digest, "EVIDENCE_STAGE") }); })); }
function returnLiteral(node: AstNode): boolean { const body = node.kind === "block" ? nodeChildren(node) : [node]; if (body.length !== 1 || body[0]?.kind !== "returnStmt") refuse("ARM_RETURN_SHAPE"); const expression = nodeChildren(body[0])[0]; if (expression?.kind !== "boolLiteral" || (expression.value !== "true" && expression.value !== "false")) refuse("ARM_RETURN_TYPE"); return expression.value === "true"; }

export function sealStringMatchCheckedModuleSnapshot(input: StringMatchSnapshotSealInputV2): StringMatchSnapshotSealResultV2 {
  const sourceBytes = copyArtifactBytes(input.sourceBytes, "SOURCE"); const sourceText = new TextDecoder("utf-8", { fatal: true }).decode(sourceBytes); const canonicalSource = sourceText.normalize("NFC").replace(/\r\n?/gu, "\n"); if (canonicalSource.startsWith("\ufeff") || canonicalSource !== sourceText || new TextEncoder().encode(canonicalSource).byteLength !== sourceBytes.byteLength) refuse("SOURCE_CANONICALIZATION");
  const sourceDigest = digestArtifactBytes(sourceBytes); const checkers = stageIdentities(input.checkerEvidence); const compilerRecord = ownDataRecord(input.compilerIdentity, "COMPILER"); exactFields(compilerRecord, ["packageId", "version", "commitDigest"], "COMPILER"); const compilerIdentity = Object.freeze({ packageId: checkedString(compilerRecord.packageId, "COMPILER_PACKAGE"), version: checkedString(compilerRecord.version, "COMPILER_VERSION"), commitDigest: digest(compilerRecord.commitDigest, "COMPILER") });
  const parseResult = input.parseResult; if (parseResult === null || typeof parseResult !== "object" || !Array.isArray(parseResult.diagnostics)) refuse("PARSE_RESULT"); for (const diagnostic of parseResult.diagnostics) { const record = ownDataRecord(diagnostic, "PARSE_DIAGNOSTIC"); if (record.severity === "error" || record.severity === "warning") refuse("PARSE_DIAGNOSTICS"); }
  if (!Array.isArray(parseResult.flows) || parseResult.flows.length !== 1) refuse("FLOW_COUNT"); const flow = parseResult.flows[0] as FlowMeta | undefined; if (flow === undefined || flow.qualifier !== "pure" || flow.declaredEffects.length !== 0 || flow.returnType !== "Bool") refuse("FLOW_ADMISSION"); if (flow.params.length !== 1) refuse("PARAMETER_COUNT"); const parameter = /^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*String$/u.exec(flow.params[0] ?? ""); if (parameter === null || parameter[1] === undefined) refuse("PARAMETER");
  if (input.sourceFile.length === 0 || input.sourceFile.normalize("NFC") !== input.sourceFile) refuse("SOURCE_FILE"); const flowNode = (parseResult.ast.children ?? []).find((node) => node.kind === "pureFlowDecl" && node.value === flow.name); if (flowNode === undefined) refuse("FLOW_NODE"); if (flowNode.location?.file !== input.sourceFile) refuse("SOURCE_FILE_MISMATCH"); const flowChildren = nodeChildren(flowNode); const body = flowChildren.find((node) => node.kind === "block"); if (body === undefined || nodeChildren(body).length !== 1 || nodeChildren(body)[0]?.kind !== "matchExpr") refuse("MATCH_SHAPE"); const match = nodeChildren(body)[0] as AstNode; const matchChildren = nodeChildren(match); const subject = matchChildren[0]; if (subject?.kind !== "identifier" || subject.value !== parameter[1]) refuse("MATCH_SUBJECT");
  const armNodes = matchChildren.slice(1); if (armNodes.length < 2 || armNodes.length > STRING_MATCH_ARM_MAX_COUNT) refuse("ARMS_COUNT"); const arms: StringMatchArmV2[] = []; const seen = new Set<string>(); for (const [index, arm] of armNodes.entries()) { if (arm.kind !== "matchArm" || arm.value === undefined) refuse("ARM_SHAPE"); const raw = arm.value; const literal = raw === "_" ? null : (() => { if (raw.length < 2 || raw[0] !== '"' || raw[raw.length - 1] !== '"') refuse("ARM_PATTERN"); let decoded: unknown; try { decoded = JSON.parse(raw); } catch { refuse("ARM_LITERAL_ENCODING"); } if (typeof decoded !== "string") refuse("ARM_LITERAL_TYPE"); return decoded; })(); if (literal === null && index !== armNodes.length - 1) refuse("ARMS_WILDCARD_ORDER"); if (literal !== null) { if (seen.has(literal)) refuse("ARMS_DUPLICATE"); seen.add(literal); } arms.push(Object.freeze({ id: index + 1, literal, result: returnLiteral(nodeChildren(arm)[0] ?? refuse("ARM_RETURN")), span: nodeSpan(arm, sourceText) })); }
  if (arms.filter((arm) => arm.literal === null).length !== 1) refuse("ARMS_WILDCARD");
  const snapshot: StringMatchCheckedModuleSnapshotV2 = { schema: STRING_MATCH_SNAPSHOT_SCHEMA, edition: STRING_MATCH_SNAPSHOT_EDITION, sourceIdentity: { sourceDigest, sourceCanonicalization: "UTF8_NO_BOM_LF_NFC_V1", byteLength: sourceBytes.byteLength }, compilerIdentity, checkerIdentities: checkers, flowName: checkedString(flow.name, "FLOW_NAME", 256), parameterName: checkedString(parameter[1], "PARAMETER_NAME", 256), parameterType: "String", returnType: "Bool", arms, limits: { maxFunctions: 3, maxBlocks: 8, maxInstructions: 32, maxCallDepth: 2, maxWork: 96 }, diagnostics: [] };
  const snapshotBytes = encodeStringMatchCheckedModuleSnapshot(snapshot); const snapshotDigest = digestArtifactBytes(snapshotBytes); const normalizedSnapshot = decodeStringMatchCheckedModuleSnapshot(snapshotBytes); const runIdentity = computeStringMatchSnapshotRunIdentity(snapshotBytes); return Object.freeze({ snapshot: normalizedSnapshot, snapshotBytes: new Uint8Array(snapshotBytes), sourceDigest, snapshotDigest, runIdentity, stageReceiptDigests: Object.freeze(checkers.map((checker) => checker.digest)), authorityReleased: false });
}

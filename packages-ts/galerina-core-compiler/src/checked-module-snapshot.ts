import { createHash } from "node:crypto";
import {
  copyArtifactBytes,
  type Sha256Digest,
} from "./artifact-reference.js";

export const CHECKED_MODULE_SNAPSHOT_SCHEMA = "galerina.checked-module-snapshot.v1" as const;
export const CHECKED_MODULE_SNAPSHOT_EDITION = "scalar-v1" as const;
export const CHECKED_MODULE_SNAPSHOT_MAX_BYTES = 262_144;
export const CHECKED_MODULE_SNAPSHOT_MAX_ITEMS = 16_384;

type PrimitiveType = "Int" | "Bool" | "Trit" | "Verdict";
type DeclarationKind = "parameter" | "local" | "function";
type FactOperation = "parameter" | "constant" | "binary" | "branch" | "call" | "return";
type DiagnosticSeverity = "error" | "warning" | "info";

export interface SnapshotSourceIdentityV1 {
  readonly sourceDigest: Sha256Digest;
  readonly sourceCanonicalization: "UTF8_NO_BOM_LF_NFC_V1";
  readonly byteLength: number;
}

export interface SnapshotCompilerIdentityV1 {
  readonly packageId: string;
  readonly version: string;
  readonly commitDigest: Sha256Digest;
}

export interface SnapshotCheckerIdentityV1 {
  readonly id: number;
  readonly name: string;
  readonly digest: Sha256Digest;
}

export interface SnapshotDeclarationV1 {
  readonly id: number;
  readonly name: string;
  readonly kind: DeclarationKind;
  readonly typeId: number;
}

export interface SnapshotResolvedTypeV1 {
  readonly id: number;
  readonly primitive: PrimitiveType;
}

export interface SnapshotEffectV1 {
  readonly id: number;
  readonly declarationId: number;
  readonly checkerId: number;
  readonly spanId: number;
  readonly effects: readonly [];
}

export interface SnapshotValueStateV1 {
  readonly id: number;
  readonly declarationId: number;
  readonly checkerId: number;
  readonly spanId: number;
  readonly state: "known" | "unknown" | "conditional";
}

export interface SnapshotGovernanceFactV1 {
  readonly id: number;
  readonly declarationId: number;
  readonly checkerId: number;
  readonly spanId: number;
  readonly verdict: "admitted";
}

export interface SnapshotConstantV1 {
  readonly id: number;
  readonly typeId: number;
  readonly value: number | boolean;
}

export interface SnapshotSourceSpanV1 {
  readonly id: number;
  readonly startByte: number;
  readonly endByte: number;
  readonly line: number;
  readonly column: number;
}

export interface SnapshotDiagnosticV1 {
  readonly id: number;
  readonly code: string;
  readonly severity: DiagnosticSeverity;
  readonly message: string;
  readonly spanId: number | null;
}

export interface SnapshotLimitsV1 {
  readonly maxFunctions: 3;
  readonly maxBlocks: 8;
  readonly maxInstructions: 32;
  readonly maxCallDepth: 2;
  readonly maxWork: 96;
}

export interface SnapshotTraceFactV1 {
  readonly id: number;
  readonly ordinal: number;
  readonly operation: FactOperation;
  readonly declarationId: number;
  readonly checkerId: number;
  readonly spanId: number;
  readonly operandDeclarationIds: readonly number[];
  readonly constantId: number | null;
  readonly targetFactIds: readonly number[];
}

export interface CheckedModuleSnapshotV1 {
  readonly schema: typeof CHECKED_MODULE_SNAPSHOT_SCHEMA;
  readonly edition: typeof CHECKED_MODULE_SNAPSHOT_EDITION;
  readonly sourceIdentity: SnapshotSourceIdentityV1;
  readonly compilerIdentity: SnapshotCompilerIdentityV1;
  readonly checkerIdentities: readonly SnapshotCheckerIdentityV1[];
  readonly declarations: readonly SnapshotDeclarationV1[];
  readonly resolvedTypes: readonly SnapshotResolvedTypeV1[];
  readonly effects: readonly SnapshotEffectV1[];
  readonly valueStates: readonly SnapshotValueStateV1[];
  readonly governanceFacts: readonly SnapshotGovernanceFactV1[];
  readonly constants: readonly SnapshotConstantV1[];
  readonly sourceSpans: readonly SnapshotSourceSpanV1[];
  readonly diagnostics: readonly SnapshotDiagnosticV1[];
  readonly entryFlowId: number;
  readonly limits: SnapshotLimitsV1;
  readonly traceFacts: readonly SnapshotTraceFactV1[];
}

export interface SnapshotRunIdentityV1 {
  readonly schema: "galerina.checked-module-snapshot-run.v1";
  readonly sourceDigest: Sha256Digest;
  readonly snapshotSchema: typeof CHECKED_MODULE_SNAPSHOT_SCHEMA;
  readonly compilerCommitDigest: Sha256Digest;
  readonly checkerDigests: readonly Sha256Digest[];
  readonly snapshotBodyDigest: Sha256Digest;
}

export class CheckedModuleSnapshotRefusal extends Error {
  constructor(readonly code: string) {
    super(`CHECKED_MODULE_SNAPSHOT_${code}: refused`);
    this.name = "CheckedModuleSnapshotRefusal";
  }
}

function refuse(code: string): never {
  throw new CheckedModuleSnapshotRefusal(code);
}

function ownDataRecord(value: unknown, code: string): Readonly<Record<string, unknown>> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) refuse(`${code}_OBJECT`);
  try {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) refuse(`${code}_OBJECT`);
    const descriptors = Object.getOwnPropertyDescriptors(value) as Record<string, PropertyDescriptor>;
    const names = Reflect.ownKeys(descriptors);
    if (names.some((name) => typeof name !== "string")) refuse(`${code}_SYMBOL`);
    const snapshot: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    for (const name of names as string[]) {
      const descriptor = descriptors[name];
      if (descriptor === undefined || !("value" in descriptor)) refuse(`${code}_ACCESSOR`);
      snapshot[name] = descriptor.value;
    }
    return Object.freeze(snapshot);
  } catch (error) {
    if (error instanceof CheckedModuleSnapshotRefusal) throw error;
    refuse(`${code}_ACCESS`);
  }
}

function exactFields(record: Readonly<Record<string, unknown>>, expected: readonly string[], code: string): void {
  const actual = Object.keys(record);
  if (actual.length !== expected.length || actual.some((field) => !expected.includes(field))) refuse(`${code}_FIELD`);
}

function array(value: unknown, code: string): readonly unknown[] {
  if (!Array.isArray(value) || value.length > CHECKED_MODULE_SNAPSHOT_MAX_ITEMS) refuse(`${code}_ARRAY`);
  const descriptors = Object.getOwnPropertyDescriptors(value) as Record<string, PropertyDescriptor>;
  const lengthDescriptor = descriptors.length;
  if (lengthDescriptor === undefined || !("value" in lengthDescriptor) || lengthDescriptor.value !== value.length) refuse(`${code}_SPARSE`);
  const expected = new Set(["length", ...Array.from({ length: value.length }, (_, index) => String(index))]);
  if (Reflect.ownKeys(descriptors).some((key) => typeof key !== "string" || !expected.has(key))) refuse(`${code}_FIELD`);
  return Object.freeze(value.map((item) => item));
}

function string(value: unknown, code: string, max = 1024): string {
  if (typeof value !== "string" || value.length === 0 || new TextEncoder().encode(value).byteLength > max) refuse(`${code}_STRING`);
  if (value.normalize("NFC") !== value) refuse(`${code}_NFC`);
  return value;
}

function digest(value: unknown, code: string): Sha256Digest {
  if (typeof value !== "string" || !/^sha256:[0-9a-f]{64}$/u.test(value)) refuse(`${code}_DIGEST`);
  return value as Sha256Digest;
}

function integer(value: unknown, code: string, minimum = 0, maximum = Number.MAX_SAFE_INTEGER): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < minimum || value > maximum) refuse(`${code}_INTEGER`);
  return value;
}

function sortedUniqueIds(items: readonly Readonly<Record<string, unknown>>[], code: string): void {
  let previous = 0;
  for (const item of items) {
    const id = integer(item.id, `${code}_ID`, 1, CHECKED_MODULE_SNAPSHOT_MAX_ITEMS);
    if (id <= previous) refuse(`${code}_ORDER`);
    previous = id;
  }
}

function idSet(items: readonly Readonly<Record<string, unknown>>[], code: string): Set<number> {
  const result = new Set<number>();
  for (const item of items) {
    const id = integer(item.id, `${code}_ID`, 1, CHECKED_MODULE_SNAPSHOT_MAX_ITEMS);
    if (result.has(id)) refuse(`${code}_DUPLICATE`);
    result.add(id);
  }
  return result;
}

function requireId(ids: Set<number>, value: unknown, code: string): number {
  const id = integer(value, code, 1, CHECKED_MODULE_SNAPSHOT_MAX_ITEMS);
  if (!ids.has(id)) refuse(`${code}_UNKNOWN`);
  return id;
}

function freezeDeep<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) freezeDeep(child);
    Object.freeze(value);
  }
  return value;
}

export function validateCheckedModuleSnapshot(value: unknown): CheckedModuleSnapshotV1 {
  const root = ownDataRecord(value, "ROOT");
  exactFields(root, [
    "schema", "edition", "sourceIdentity", "compilerIdentity", "checkerIdentities",
    "declarations", "resolvedTypes", "effects", "valueStates", "governanceFacts",
    "constants", "sourceSpans", "diagnostics", "entryFlowId", "limits", "traceFacts",
  ], "ROOT");
  if (root.schema !== CHECKED_MODULE_SNAPSHOT_SCHEMA) refuse("SCHEMA");
  if (root.edition !== CHECKED_MODULE_SNAPSHOT_EDITION) refuse("EDITION");

  const sourceIdentity = ownDataRecord(root.sourceIdentity, "SOURCE");
  exactFields(sourceIdentity, ["sourceDigest", "sourceCanonicalization", "byteLength"], "SOURCE");
  const source = Object.freeze({
    sourceDigest: digest(sourceIdentity.sourceDigest, "SOURCE"),
    sourceCanonicalization: sourceIdentity.sourceCanonicalization === "UTF8_NO_BOM_LF_NFC_V1"
      ? "UTF8_NO_BOM_LF_NFC_V1" as const : refuse("SOURCE_CANONICALIZATION"),
    byteLength: integer(sourceIdentity.byteLength, "SOURCE_LENGTH", 1, CHECKED_MODULE_SNAPSHOT_MAX_BYTES),
  });

  const compilerIdentity = ownDataRecord(root.compilerIdentity, "COMPILER");
  exactFields(compilerIdentity, ["packageId", "version", "commitDigest"], "COMPILER");
  const compiler = Object.freeze({
    packageId: string(compilerIdentity.packageId, "COMPILER_PACKAGE"),
    version: string(compilerIdentity.version, "COMPILER_VERSION"),
    commitDigest: digest(compilerIdentity.commitDigest, "COMPILER"),
  });

  const checkerValues = array(root.checkerIdentities, "CHECKERS").map((value) => ownDataRecord(value, "CHECKER"));
  sortedUniqueIds(checkerValues, "CHECKERS");
  const checkerIds = idSet(checkerValues, "CHECKERS");
  const checkerIdentities = checkerValues.map((record) => {
    exactFields(record, ["id", "name", "digest"], "CHECKER");
    return Object.freeze({ id: requireId(checkerIds, record.id, "CHECKER"), name: string(record.name, "CHECKER_NAME"), digest: digest(record.digest, "CHECKER") });
  });

  const declarationValues = array(root.declarations, "DECLARATIONS").map((value) => ownDataRecord(value, "DECLARATION"));
  sortedUniqueIds(declarationValues, "DECLARATIONS");
  const declarationIds = idSet(declarationValues, "DECLARATIONS");
  const declarations = declarationValues.map((record) => {
    exactFields(record, ["id", "name", "kind", "typeId"], "DECLARATION");
    if (!["parameter", "local", "function"].includes(String(record.kind))) refuse("DECLARATION_KIND");
    return Object.freeze({ id: requireId(declarationIds, record.id, "DECLARATION"), name: string(record.name, "DECLARATION_NAME"), kind: record.kind as DeclarationKind, typeId: integer(record.typeId, "DECLARATION_TYPE", 1) });
  });

  const typeValues = array(root.resolvedTypes, "TYPES").map((value) => ownDataRecord(value, "TYPE"));
  sortedUniqueIds(typeValues, "TYPES");
  const typeIds = idSet(typeValues, "TYPES");
  const resolvedTypes = typeValues.map((record) => {
    exactFields(record, ["id", "primitive"], "TYPE");
    if (!["Int", "Bool", "Trit", "Verdict"].includes(String(record.primitive))) refuse("TYPE_PRIMITIVE");
    return Object.freeze({ id: requireId(typeIds, record.id, "TYPE"), primitive: record.primitive as PrimitiveType });
  });
  for (const declaration of declarations) requireId(typeIds, declaration.typeId, "DECLARATION_TYPE");

  const spanValues = array(root.sourceSpans, "SPANS").map((value) => ownDataRecord(value, "SPAN"));
  sortedUniqueIds(spanValues, "SPANS");
  const spanIds = idSet(spanValues, "SPANS");
  const sourceSpans = spanValues.map((record) => {
    exactFields(record, ["id", "startByte", "endByte", "line", "column"], "SPAN");
    const startByte = integer(record.startByte, "SPAN_START", 0, source.byteLength);
    const endByte = integer(record.endByte, "SPAN_END", startByte, source.byteLength);
    return Object.freeze({ id: requireId(spanIds, record.id, "SPAN"), startByte, endByte, line: integer(record.line, "SPAN_LINE", 1), column: integer(record.column, "SPAN_COLUMN", 1) });
  });

  const effectValues = array(root.effects, "EFFECTS").map((value) => ownDataRecord(value, "EFFECT"));
  sortedUniqueIds(effectValues, "EFFECTS");
  const effectIds = idSet(effectValues, "EFFECTS");
  const effects = effectValues.map((record) => {
    exactFields(record, ["id", "declarationId", "checkerId", "spanId", "effects"], "EFFECT");
    const listedEffects = array(record.effects, "EFFECT_VALUES");
    if (listedEffects.length !== 0) refuse("EFFECT_NONEMPTY");
    return Object.freeze({ id: requireId(effectIds, record.id, "EFFECT"), declarationId: requireId(declarationIds, record.declarationId, "EFFECT_DECLARATION"), checkerId: requireId(checkerIds, record.checkerId, "EFFECT_CHECKER"), spanId: requireId(spanIds, record.spanId, "EFFECT_SPAN"), effects: [] as const });
  });

  const valueStateValues = array(root.valueStates, "VALUE_STATES").map((value) => ownDataRecord(value, "VALUE_STATE"));
  sortedUniqueIds(valueStateValues, "VALUE_STATES");
  const valueStateIds = idSet(valueStateValues, "VALUE_STATES");
  const valueStates = valueStateValues.map((record) => {
    exactFields(record, ["id", "declarationId", "checkerId", "spanId", "state"], "VALUE_STATE");
    if (!["known", "unknown", "conditional"].includes(String(record.state))) refuse("VALUE_STATE_KIND");
    return Object.freeze({ id: requireId(valueStateIds, record.id, "VALUE_STATE"), declarationId: requireId(declarationIds, record.declarationId, "VALUE_STATE_DECLARATION"), checkerId: requireId(checkerIds, record.checkerId, "VALUE_STATE_CHECKER"), spanId: requireId(spanIds, record.spanId, "VALUE_STATE_SPAN"), state: record.state as SnapshotValueStateV1["state"] });
  });

  const governanceValues = array(root.governanceFacts, "GOVERNANCE").map((value) => ownDataRecord(value, "GOVERNANCE_FACT"));
  sortedUniqueIds(governanceValues, "GOVERNANCE");
  const governanceIds = idSet(governanceValues, "GOVERNANCE");
  const governanceFacts = governanceValues.map((record) => {
    exactFields(record, ["id", "declarationId", "checkerId", "spanId", "verdict"], "GOVERNANCE_FACT");
    if (record.verdict !== "admitted") refuse("GOVERNANCE_VERDICT");
    return Object.freeze({ id: requireId(governanceIds, record.id, "GOVERNANCE_FACT"), declarationId: requireId(declarationIds, record.declarationId, "GOVERNANCE_DECLARATION"), checkerId: requireId(checkerIds, record.checkerId, "GOVERNANCE_CHECKER"), spanId: requireId(spanIds, record.spanId, "GOVERNANCE_SPAN"), verdict: "admitted" as const });
  });

  const constantValues = array(root.constants, "CONSTANTS").map((value) => ownDataRecord(value, "CONSTANT"));
  sortedUniqueIds(constantValues, "CONSTANTS");
  const constantIds = idSet(constantValues, "CONSTANTS");
  const constants = constantValues.map((record) => {
    exactFields(record, ["id", "typeId", "value"], "CONSTANT");
    if (typeof record.value !== "boolean" && (typeof record.value !== "number" || !Number.isSafeInteger(record.value))) refuse("CONSTANT_VALUE");
    return Object.freeze({ id: requireId(constantIds, record.id, "CONSTANT"), typeId: requireId(typeIds, record.typeId, "CONSTANT_TYPE"), value: record.value });
  });

  const diagnosticValues = array(root.diagnostics, "DIAGNOSTICS").map((value) => ownDataRecord(value, "DIAGNOSTIC"));
  sortedUniqueIds(diagnosticValues, "DIAGNOSTICS");
  const diagnosticIds = idSet(diagnosticValues, "DIAGNOSTICS");
  const diagnostics = diagnosticValues.map((record) => {
    exactFields(record, ["id", "code", "severity", "message", "spanId"], "DIAGNOSTIC");
    if (!["error", "warning", "info"].includes(String(record.severity))) refuse("DIAGNOSTIC_SEVERITY");
    const spanId = record.spanId === null ? null : requireId(spanIds, record.spanId, "DIAGNOSTIC_SPAN");
    return Object.freeze({ id: requireId(diagnosticIds, record.id, "DIAGNOSTIC"), code: string(record.code, "DIAGNOSTIC_CODE"), severity: record.severity as DiagnosticSeverity, message: string(record.message, "DIAGNOSTIC_MESSAGE"), spanId });
  });
  if (diagnostics.some((diagnostic) => diagnostic.severity !== "info")) refuse("DIAGNOSTICS_BLOCKING");

  const limitsRecord = ownDataRecord(root.limits, "LIMITS");
  exactFields(limitsRecord, ["maxFunctions", "maxBlocks", "maxInstructions", "maxCallDepth", "maxWork"], "LIMITS");
  if (limitsRecord.maxFunctions !== 3 || limitsRecord.maxBlocks !== 8 || limitsRecord.maxInstructions !== 32 || limitsRecord.maxCallDepth !== 2 || limitsRecord.maxWork !== 96) refuse("LIMITS");
  const limits = Object.freeze({ maxFunctions: 3 as const, maxBlocks: 8 as const, maxInstructions: 32 as const, maxCallDepth: 2 as const, maxWork: 96 as const });

  const traceValues = array(root.traceFacts, "TRACE").map((value) => ownDataRecord(value, "TRACE_FACT"));
  sortedUniqueIds(traceValues, "TRACE");
  const traceIds = idSet(traceValues, "TRACE");
  const traceFacts = traceValues.map((record, index) => {
    exactFields(record, ["id", "ordinal", "operation", "declarationId", "checkerId", "spanId", "operandDeclarationIds", "constantId", "targetFactIds"], "TRACE_FACT");
    if (record.ordinal !== index) refuse("TRACE_ORDER");
    if (!["parameter", "constant", "binary", "branch", "call", "return"].includes(String(record.operation))) refuse("TRACE_OPERATION");
    const operands = array(record.operandDeclarationIds, "TRACE_OPERANDS").map((id) => requireId(declarationIds, id, "TRACE_OPERAND"));
    const targets = array(record.targetFactIds, "TRACE_TARGETS").map((id) => integer(id, "TRACE_TARGET", 1));
    const constantId = record.constantId === null ? null : requireId(constantIds, record.constantId, "TRACE_CONSTANT");
    return Object.freeze({ id: requireId(traceIds, record.id, "TRACE_FACT"), ordinal: index, operation: record.operation as FactOperation, declarationId: requireId(declarationIds, record.declarationId, "TRACE_DECLARATION"), checkerId: requireId(checkerIds, record.checkerId, "TRACE_CHECKER"), spanId: requireId(spanIds, record.spanId, "TRACE_SPAN"), operandDeclarationIds: Object.freeze(operands), constantId, targetFactIds: Object.freeze(targets) });
  });
  for (const trace of traceFacts) for (const target of trace.targetFactIds) if (!traceIds.has(target)) refuse("TRACE_TARGET_UNKNOWN");
  const entryFlowId = requireId(declarationIds, root.entryFlowId, "ENTRY_FLOW");
  if (declarations.find((declaration) => declaration.id === entryFlowId)?.kind !== "function") refuse("ENTRY_FLOW_KIND");

  return freezeDeep(Object.freeze({
    schema: CHECKED_MODULE_SNAPSHOT_SCHEMA,
    edition: CHECKED_MODULE_SNAPSHOT_EDITION,
    sourceIdentity: source,
    compilerIdentity: compiler,
    checkerIdentities: Object.freeze(checkerIdentities),
    declarations: Object.freeze(declarations),
    resolvedTypes: Object.freeze(resolvedTypes),
    effects: Object.freeze(effects),
    valueStates: Object.freeze(valueStates),
    governanceFacts: Object.freeze(governanceFacts),
    constants: Object.freeze(constants),
    sourceSpans: Object.freeze(sourceSpans),
    diagnostics: Object.freeze(diagnostics),
    entryFlowId,
    limits,
    traceFacts: Object.freeze(traceFacts),
  }));
}

export function encodeCheckedModuleSnapshot(value: unknown): Uint8Array {
  const snapshot = validateCheckedModuleSnapshot(value);
  const body = JSON.stringify({
    schema: snapshot.schema,
    edition: snapshot.edition,
    sourceIdentity: snapshot.sourceIdentity,
    compilerIdentity: snapshot.compilerIdentity,
    checkerIdentities: snapshot.checkerIdentities,
    declarations: snapshot.declarations,
    resolvedTypes: snapshot.resolvedTypes,
    effects: snapshot.effects,
    valueStates: snapshot.valueStates,
    governanceFacts: snapshot.governanceFacts,
    constants: snapshot.constants,
    sourceSpans: snapshot.sourceSpans,
    diagnostics: snapshot.diagnostics,
    entryFlowId: snapshot.entryFlowId,
    limits: snapshot.limits,
    traceFacts: snapshot.traceFacts,
  });
  const bytes = new TextEncoder().encode(`${body}\n`);
  if (bytes.byteLength > CHECKED_MODULE_SNAPSHOT_MAX_BYTES) refuse("BYTES_BOUND");
  return new Uint8Array(bytes);
}

export function decodeCheckedModuleSnapshot(bytes: Uint8Array): CheckedModuleSnapshotV1 {
  const copy = copyArtifactBytes(bytes, "BYTES");
  if (copy.byteLength > CHECKED_MODULE_SNAPSHOT_MAX_BYTES) refuse("BYTES_BOUND");
  try {
    return validateCheckedModuleSnapshot(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(copy)));
  } catch (error) {
    if (error instanceof CheckedModuleSnapshotRefusal) throw error;
    refuse("ENCODING");
  }
}

export function digestCheckedModuleSnapshot(value: Uint8Array | CheckedModuleSnapshotV1): Sha256Digest {
  const bytes = value instanceof Uint8Array ? decodeCheckedModuleSnapshot(value) && new Uint8Array(value) : encodeCheckedModuleSnapshot(value);
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}` as Sha256Digest;
}

export function computeSnapshotRunIdentity(snapshot: CheckedModuleSnapshotV1 | Uint8Array): SnapshotRunIdentityV1 {
  const decoded = snapshot instanceof Uint8Array ? decodeCheckedModuleSnapshot(snapshot) : validateCheckedModuleSnapshot(snapshot);
  const bytes = snapshot instanceof Uint8Array ? new Uint8Array(snapshot) : encodeCheckedModuleSnapshot(decoded);
  return Object.freeze({
    schema: "galerina.checked-module-snapshot-run.v1",
    sourceDigest: decoded.sourceIdentity.sourceDigest,
    snapshotSchema: CHECKED_MODULE_SNAPSHOT_SCHEMA,
    compilerCommitDigest: decoded.compilerIdentity.commitDigest,
    checkerDigests: Object.freeze(decoded.checkerIdentities.map((checker) => checker.digest)),
    snapshotBodyDigest: digestCheckedModuleSnapshot(bytes),
  });
}

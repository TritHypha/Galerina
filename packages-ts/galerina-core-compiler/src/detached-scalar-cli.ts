import { readFileSync, statSync } from "node:fs";
import {
  createComputeTransfer,
  createFileOwnedArtifactRepository,
  digestArtifactBytes,
  type Sha256Digest,
} from "./artifact-reference.js";
import { emitCanonicalGIRFromSnapshot } from "./checked-snapshot-gir-emitter.js";
import { sealCheckedModuleSnapshot, type CheckedModuleEvidenceV1 } from "./seal-checked-module-snapshot.js";
import { parseProgram } from "./parser.js";
import { validateCoreSyntaxSafety } from "./core-syntax-safety.js";
import { resolveSymbols } from "./symbol-resolver.js";
import { checkTypes } from "./type-checker.js";
import { checkValueStates } from "./value-state-checker.js";
import { checkEffects } from "./effect-checker.js";
import { verifyGovernance } from "./governance-verifier.js";
import { checkSourceEscapes } from "./source-escape-checker.js";
import { checkNamingPolicy } from "./naming-policy-checker.js";

const REQUEST_SCHEMA = "galerina.detached-scalar-request.v1" as const;
const HANDOFF_SCHEMA = "galerina.detached-scalar-handoff.v1" as const;
const compilerPackageId = "@galerina/core-compiler";
const compilerVersion = "1.0.0-beta.2";

class DetachedScalarCLIRefusal extends Error {
  constructor(readonly code: string) {
    super(`DETACHED_SCALAR_CLI_${code}: refused`);
    this.name = "DetachedScalarCLIRefusal";
  }
}

function refuse(code: string): never {
  throw new DetachedScalarCLIRefusal(code);
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
  const actual = Object.keys(record);
  if (actual.length !== expected.length || actual.some((field) => !expected.includes(field))) refuse(`${code}_FIELD`);
}

function digest(value: unknown, code: string): Sha256Digest {
  if (typeof value !== "string" || !/^sha256:[0-9a-f]{64}$/u.test(value)) refuse(`${code}_DIGEST`);
  return value as Sha256Digest;
}

function stageDigest(value: unknown): Sha256Digest {
  const bytes = new TextEncoder().encode(`${JSON.stringify(value)}\n`);
  return digestArtifactBytes(bytes);
}

function diagnosticsFrom(value: unknown): readonly unknown[] {
  if (!Array.isArray(value)) return [];
  return value;
}

function runRequest(request: unknown): Record<string, unknown> {
  const root = ownRecord(request, "REQUEST");
  exactFields(root, ["schema", "sourcePath", "repositoryRoot", "sourceFile", "compilerCommitDigest", "authorityEpoch", "authorityContextDigest"], "REQUEST");
  if (root.schema !== REQUEST_SCHEMA) refuse("SCHEMA");
  if (typeof root.sourcePath !== "string" || root.sourcePath.length === 0 || typeof root.repositoryRoot !== "string" || root.repositoryRoot.length === 0 || typeof root.sourceFile !== "string" || root.sourceFile.length === 0) refuse("PATH");
  const compilerCommitDigest = digest(root.compilerCommitDigest, "COMPILER");
  if (typeof root.authorityEpoch !== "number" || !Number.isSafeInteger(root.authorityEpoch) || root.authorityEpoch < 0) refuse("EPOCH");
  const authorityContextDigest = digest(root.authorityContextDigest, "CONTEXT");
  const MAX_DETACHED_SOURCE_BYTES = 10 * 1024 * 1024;
  const sourceStat = statSync(root.sourcePath);
  if (!sourceStat.isFile() || sourceStat.size < 1 || sourceStat.size > MAX_DETACHED_SOURCE_BYTES) refuse("SOURCE_SIZE");
  const sourceBytes = new Uint8Array(readFileSync(root.sourcePath));
  if (sourceBytes.byteLength > MAX_DETACHED_SOURCE_BYTES) refuse("SOURCE_SIZE");
  const sourceText = new TextDecoder("utf-8", { fatal: true }).decode(sourceBytes);
  const safety = validateCoreSyntaxSafety({ file: root.sourceFile, text: sourceText });
  const parsed = parseProgram(sourceText, root.sourceFile, { requireVersionHeader: true });
  const symbols = resolveSymbols(parsed.ast);
  const types = checkTypes(parsed.ast);
  const values = checkValueStates(parsed.ast, "production");
  const effects = checkEffects(parsed.flows, parsed.ast, "production");
  const governance = verifyGovernance(parsed.ast, parsed.flows, effects, "production", root.sourceFile);
  const escapes = checkSourceEscapes(parsed.ast);
  const naming = checkNamingPolicy(parsed.ast);
  const allDiagnostics = [
    ...diagnosticsFrom(safety.diagnostics),
    ...diagnosticsFrom(parsed.diagnostics),
    ...diagnosticsFrom(symbols.diagnostics),
    ...diagnosticsFrom(types.diagnostics),
    ...diagnosticsFrom(values.diagnostics),
    ...effects.flatMap((effect) => diagnosticsFrom((effect as unknown as { diagnostics?: unknown }).diagnostics)),
    ...diagnosticsFrom(governance.diagnostics),
    ...diagnosticsFrom(escapes.diagnostics),
    ...diagnosticsFrom(naming.diagnostics),
  ];
  if (allDiagnostics.some((entry) => {
    const record = ownRecord(entry, "DIAGNOSTIC");
    return record.severity === "error" || record.severity === "warning";
  })) refuse("CHECKER");
  const checkerEvidence: CheckedModuleEvidenceV1 = {
    schema: "galerina.checked-module-evidence.v1",
    stages: [
      ["parser", parsed], ["symbols", symbols], ["types", types], ["effects", effects], ["values", values], ["governance", governance],
    ].map(([name, result], index) => ({ id: index + 1, name: name as "parser" | "symbols" | "types" | "effects" | "values" | "governance", digest: stageDigest(result), outcome: "passed" as const })),
  };
  const repo = createFileOwnedArtifactRepository("galerina", root.repositoryRoot);
  const sourceReference = repo.write("fungi-source", sourceBytes);
  return { sourceReference, checkerEvidence, parsed, sourceBytes, compilerCommitDigest, authorityEpoch: root.authorityEpoch, authorityContextDigest, sourceFile: root.sourceFile, repo } as unknown as Record<string, unknown>;
}

async function main(): Promise<void> {
  const requestText = readFileSync(0 as unknown as string, "utf8");
  const prepared = runRequest(JSON.parse(requestText));
  const repo = prepared.repo as ReturnType<typeof createFileOwnedArtifactRepository<"galerina">>;
  const sourceReference = await prepared.sourceReference as Awaited<ReturnType<typeof repo.write>>;
  const sealed = sealCheckedModuleSnapshot({
    sourceBytes: prepared.sourceBytes as Uint8Array,
    sourceFile: prepared.sourceFile as string,
    parseResult: prepared.parsed as never,
    checkerEvidence: prepared.checkerEvidence as CheckedModuleEvidenceV1,
    compilerIdentity: { packageId: compilerPackageId, version: compilerVersion, commitDigest: prepared.compilerCommitDigest as Sha256Digest },
  });
  const snapshotReference = await repo.write("checked-module-snapshot", sealed.snapshotBytes);
  const verifiedSnapshotBytes = await repo.read(snapshotReference);
  const emission = emitCanonicalGIRFromSnapshot(verifiedSnapshotBytes, snapshotReference);
  const girReference = await repo.write("canonical-gir", emission.girBytes);
  const runIdentityDigest = digestArtifactBytes(new TextEncoder().encode(`${JSON.stringify(sealed.runIdentity)}\n`));
  const transfer = createComputeTransfer({
    fromOwner: "galerina",
    toOwner: "slide",
    artifact: girReference,
    prerequisiteDigests: [sourceReference.digest, snapshotReference.digest],
    operationId: "galerina.detached-scalar",
    runIdentity: runIdentityDigest,
    authorityEpoch: prepared.authorityEpoch as number,
    authorityContextDigest: prepared.authorityContextDigest as Sha256Digest,
  });
  process.stdout.write(`${JSON.stringify({ schema: HANDOFF_SCHEMA, sourceReference, snapshotReference, girReference, transfer, runIdentity: runIdentityDigest, authorityReleased: false })}\n`);
}

try {
  await main();
} catch (error) {
  const code = error instanceof DetachedScalarCLIRefusal ? error.code : "INTERNAL";
  process.stderr.write(`${JSON.stringify({ schema: "galerina.detached-scalar-refusal.v1", failureId: code })}\n`);
  process.exit(2);
}

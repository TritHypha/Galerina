#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { checkEffects, checkTypes, parseProgram, snapshotCheckedFlow } from "../packages-ts/galerina-core-compiler/dist/index.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE_RELATIVE = "packages/fungi/products/galerina/rd0873-first-native-slice/slice.fungi";
const ARTIFACT_RELATIVE = "packages/fungi/products/galerina/rd0873-first-native-slice/slice.checked.json";
const SOURCE = join(ROOT, SOURCE_RELATIVE);
const checkMode = process.argv.includes("--check");
const checkArtifactIndex = process.argv.indexOf("--check-artifact");
const checkArtifactPath = checkArtifactIndex >= 0 ? process.argv[checkArtifactIndex + 1] : undefined;
assert.equal(checkArtifactIndex < 0 || checkMode, true, "--check-artifact is read-only and requires --check");
assert.equal(checkArtifactIndex < 0 || typeof checkArtifactPath === "string", true, "--check-artifact requires a path");
const ARTIFACT = checkArtifactPath === undefined
  ? join(ROOT, ARTIFACT_RELATIVE)
  : resolve(checkArtifactPath);
const sourceBytes = readFileSync(SOURCE);
const sourceText = sourceBytes.toString("utf8");
assert.ok(sourceBytes.length > 0 && sourceBytes[sourceBytes.length - 1] === 0x0a, "source must be non-empty and LF-terminated");
assert.equal(sourceBytes.includes(0x0d), false, "source must use LF only");
assert.equal(Buffer.from(sourceText, "utf8").equals(sourceBytes), true, "source must be valid UTF-8");
assert.equal(sourceText.normalize("NFC"), sourceText, "source must be NFC");

const artifact = JSON.parse(readFileSync(ARTIFACT, "utf8"));
const sourceDigest = `sha256:${createHash("sha256").update(sourceBytes).digest("hex")}`;
assert.equal(artifact.schema, "galerina.rd0873.checked-flow.v1");
assert.equal(artifact.productId, "galerina");
assert.equal(artifact.packageId, "rd0873-first-native-slice");
assert.equal(artifact.flowLocator, "rd0873/first-native-slice/isEnvironmentMode");
assert.equal(artifact.sourceDigest, sourceDigest, "refuse to refresh an artifact after its selected source changes");
assert.equal(artifact.authorizing, false, "the generated artifact must remain non-authorizing");
assert.equal(artifact.authentication, "NONE", "the generated artifact must remain unauthenticated");

const program = parseProgram(sourceText, SOURCE);
assert.deepEqual((program.diagnostics ?? []).filter(({ severity }) => severity === "error"), []);
const typeResult = checkTypes(program.ast);
assert.deepEqual((typeResult.diagnostics ?? []).filter(({ severity }) => severity === "error"), []);
const effectResults = checkEffects(program.flows, program.ast);
assert.deepEqual(effectResults.flatMap((result) => result.diagnostics ?? []).filter(({ severity }) => severity === "error"), []);
const flow = program.flows.find((candidate) => candidate.name === artifact.flowName);
const flowNode = program.ast.children.find((node) => node.kind === "pureFlowDecl" && node.value === artifact.flowName);
assert.ok(flow && flowNode, "selected flow must exist exactly in the current compiler parse");
assert.equal(program.flows.filter((candidate) => candidate.name === artifact.flowName).length, 1, "selected flow must be unique");

const snapshot = snapshotCheckedFlow(flow, flowNode);
assert.ok(snapshot, "the current compiler must construct a complete checked-flow snapshot");
assert.equal(snapshot.name, artifact.flowName, "selected flow name must match the compiler snapshot");
assert.equal(snapshot.qualifier, artifact.qualifier, "artifact qualifier must match the current source and compiler snapshot");
assert.deepEqual(snapshot.params, artifact.parameters.map(({ name, type }) => `${name}: ${type}`),
  "artifact parameters must match the current source and compiler snapshot");
assert.equal(snapshot.returnType, artifact.returnType, "artifact return type must match the current source and compiler snapshot");
assert.deepEqual(snapshot.declaredEffects, artifact.declaredEffects,
  "artifact effects must match the current source and compiler snapshot");
const checkedAst = snapshot.ast;
const next = {
  ...artifact,
  checkedAst,
  semanticDigest: `sha256:${createHash("sha256").update(JSON.stringify({
    name: artifact.flowName,
    qualifier: artifact.qualifier,
    params: artifact.parameters.map(({ name, type }) => `${name}: ${type}`),
    returnType: artifact.returnType,
    declaredEffects: artifact.declaredEffects,
    ast: checkedAst,
  }), "utf8").digest("hex")}`,
};
const nextBytes = `${JSON.stringify(next)}\n`;

if (checkMode) {
  assert.equal(readFileSync(ARTIFACT, "utf8"), nextBytes, "checked artifact is stale; run this generator after verifying source identity");
} else {
  writeFileSync(ARTIFACT, nextBytes, "utf8");
  process.stdout.write(`Updated ${ARTIFACT_RELATIVE}; source identity and non-authorizing provenance preserved.\n`);
}

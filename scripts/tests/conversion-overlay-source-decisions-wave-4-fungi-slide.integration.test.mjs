import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { it } from "node:test";

const SLIDE_ROOT = process.env.GALERINA_SLIDE_REPO;
const SLIDE_AVAILABLE = typeof SLIDE_ROOT === "string"
  && existsSync(join(SLIDE_ROOT, "src", "checked-fungi-package-compiler.mjs"));
const SOURCE_ROOT = join(process.cwd(), "packages-ts", "galerina-test", "src", "self-hosted", "conversion-overlays");
const ALL_ALLOW = Object.freeze({
  identity: 1, provenance: 1, target: 1, effects: 1,
  policy: 1, revocation: 1, validation: 1, memory: 1,
});

const CANDIDATES = Object.freeze([
  ["query-option-kind.fungi", "queryOptionKindCore", [true, "some"], true, "bool"],
  ["egress-loopback-decision.fungi", "egressLoopbackDecisionCore", [false, true, false], true, "bool"],
  ["allowed-host-input-decision.fungi", "allowedHostInputDecisionCore", [true, 2, 1], true, "bool"],
  ["risk-penalty-mask.fungi", "riskPenaltyMaskCore", [true, true, 5], 8, "int"],
  ["ai-token-cost-branch.fungi", "aiTokenCostBranchCore", [false, 5, 9], 5, "int"],
  ["http-method-fallback.fungi", "httpMethodFallbackCore", [false, false, "POST"], "GET", "string"],
  ["digest-normalization-action.fungi", "digestNormalizationActionCore", [true, true], "strip_and_lower", "string"],
  ["tls-socket-shape.fungi", "tlsSocketShapeCore", [true, true, true, true], true, "bool"],
  ["tls-custom-verdict.fungi", "tlsCustomVerdictCore", [1, true, 0, true], 0, "verdict"],
  ["nmr-failure-bound.fungi", "nmrFailureBoundCore", [20, 3, 50], true, "bool"],
  ["lane-read-flip.fungi", "laneReadFlipCore", [true, -1, 1], 1, "int"],
  ["voted-reading-state.fungi", "votedReadingStateCore", [0, 3], "indeterminate", "string"],
  ["deadzone-policy-action.fungi", "deadzonePolicyActionCore", [true, "revote", 3], "revote", "string"],
  ["substrate-guarantee-admission.fungi", "substrateGuaranteeAdmissionCore", [true, true, true], true, "bool"],
  ["substrate-guarantee-result.fungi", "substrateGuaranteeResultCore", [3, 5, 3], true, "bool"],
  ["substrate-denial-severity.fungi", "substrateDenialSeverityCore", ["error", true], "error", "string"],
  ["tolerance-diagnostic-precedence.fungi", "toleranceDiagnosticPrecedenceCore", [true, true, true, 1], "crypto_on_noisy_lane", "string"],
  ["voted-trit-three.fungi", "votedTritThreeCore", [1, 1, -1], 1, "int"],
  ["snapshot-float-equality.fungi", "snapshotFloatEqualityCore", [5, 10], true, "bool"],
  ["snapshot-consistency-admission.fungi", "snapshotConsistencyAdmissionCore", [true, true, true], true, "bool"],
  ["numeric-verdict-admission.fungi", "numericVerdictAdmissionCore", [0], "neutral", "string"],
  ["indeterminate-diagnostic-action.fungi", "indeterminateDiagnosticActionCore", [0, true], "emit", "string"],
  ["confidence-range-admission.fungi", "confidenceRangeAdmissionCore", [80, 70, 90], true, "bool"],
  ["correlation-id-admission.fungi", "correlationIdAdmissionCore", [true, true, 16], "provided", "string"],
  ["transport-data-permission.fungi", "transportDataPermissionCore", [true, true, true], true, "bool"],
  ["transport-initial-state.fungi", "transportInitialStateCore", [true, true], "open", "string"],
  ["transport-close-erasure.fungi", "transportCloseErasureCore", [false, true], false, "bool"],
  ["transport-step-transition.fungi", "transportStepTransitionCore", ["closed", "data", false], "closed", "string"],
  ["lane-grant-mask.fungi", "laneGrantMaskCore", [true, true, false, 1], false, "bool"],
  ["execution-offload-decision.fungi", "executionOffloadDecisionCore", [false, true, "fp8"], "digital", "string"],
  ["tri-pipe-photonic-enable.fungi", "triPipePhotonicEnableCore", [true, true, 1], true, "bool"],
  ["regex-budget-veto-kind.fungi", "regexBudgetVetoKindCore", [true, true], "veto", "string"],
  ["regex-range-membership.fungi", "regexRangeMembershipCore", [65, 64, 90], true, "bool"],
  ["regex-parser-at-end.fungi", "regexParserAtEndCore", [3, 3], true, "bool"],
  ["regex-parser-eat.fungi", "regexParserEatCore", [false, 65, 65], true, "bool"],
  ["regex-singleton-range.fungi", "regexSingletonRangeCore", [97, 97, 97], true, "bool"],
  ["component-prop-kind-admission.fungi", "componentPropKindAdmissionCore", [true, "string"], true, "bool"],
  ["component-child-kind-admission.fungi", "componentChildKindAdmissionCore", [true, true, "safe_html"], "safe_html", "string"],
  ["component-effect-admission.fungi", "componentEffectAdmissionCore", [true, true, false], true, "bool"],
  ["rotation-tick-admission.fungi", "rotationTickAdmissionCore", [true, true, false], true, "bool"],
].map(([file, flow, args, expected, type]) => Object.freeze({ file, flow, args, expected, type })));

async function loadSlide() {
  const fromSlide = async (path) => import(pathToFileURL(join(SLIDE_ROOT, "src", path)).href);
  return {
    ...await fromSlide("checked-fungi-package-compiler.mjs"),
    ...await fromSlide("checked-fungi-package-file.mjs"),
    ...await fromSlide("checked-fungi-package-publication-loader.mjs"),
    ...await fromSlide("safe-value-envelope.mjs"),
    ...await fromSlide("portable-veo.mjs"),
  };
}

function verificationExpectation(receipt) {
  return {
    packageSetDigest: receipt.packageSetDigest,
    packageIdentity: receipt.packageIdentity,
    exportName: receipt.exportName,
    receiptDigest: receipt.receiptDigest,
    safeValueTypeId: receipt.safeValueTypeId,
    safeValueStateId: receipt.safeValueStateId,
    safeValueProvenanceDigest: receipt.safeValueProvenanceDigest,
  };
}

it("publishes and independently re-admits all 40 wave-4 source decisions through physical SLIDE/VOK", { skip: !SLIDE_AVAILABLE }, async () => {
  const slide = await loadSlide();
  const context = slide.portableVeoReferenceContext();
  const sources = CANDIDATES.map((candidate) => Uint8Array.from(readFileSync(join(SOURCE_ROOT, candidate.file))));
  const request = (candidateSources) => ({
    packages: [{
      identity: "@galerina/test",
      version: "1.0.0-beta.4",
      exports: CANDIDATES.map((candidate, index) => ({
        name: candidate.flow,
        sourceFlowName: candidate.flow,
        sourceBytes: candidateSources[index],
      })),
      dependencies: [],
      resources: [],
    }],
    context,
    gates: ALL_ALLOW,
  });
  const compiled = slide.compileCheckedFungiPackageSet(request(sources));
  if (compiled.verdict !== 1) {
    const failures = [];
    for (let index = 0; index < CANDIDATES.length; index += 1) {
      const candidate = CANDIDATES[index];
      const isolated = slide.compileCheckedFungiPackageSet({
        packages: [{ identity: "@galerina/test", version: "1.0.0-beta.4", exports: [{
          name: candidate.flow,
          sourceFlowName: candidate.flow,
          sourceBytes: sources[index],
        }], dependencies: [], resources: [] }],
        context,
        gates: ALL_ALLOW,
      });
      if (isolated.verdict !== 1) failures.push(candidate.flow);
    }
    assert.fail(`physical SLIDE compilation refused: ${failures.join(", ")}`);
  }

  const mutatedSources = sources.map((source) => Uint8Array.from(source));
  mutatedSources[0][0] ^= 1;
  assert.equal(slide.compileCheckedFungiPackageSet(request(mutatedSources)).verdict, -1);

  const parent = await mkdtemp(join(tmpdir(), "galerina-source-decisions-wave-4-slide-"));
  const publicationDirectory = join(parent, "published");
  try {
    const published = await slide.publishCheckedFungiPackageBuild({
      packageBuildHandle: compiled.packageBuildHandle,
      outputDirectory: publicationDirectory,
    });
    assert.equal(published.verdict, 1, JSON.stringify(published));
    const slideFiles = published.outputFiles.filter((name) => name.endsWith(".slide"));
    assert.equal(slideFiles.length, 40);

    let retainedReceipt;
    for (const candidate of CANDIDATES) {
      const prepared = await slide.prepareCheckedFungiPackagePublication({
        publicationDirectory,
        packageIdentity: "@galerina/test",
        exportName: candidate.flow,
        context,
        gates: ALL_ALLOW,
      });
      assert.equal(prepared.verdict, 1, `${candidate.flow}: ${JSON.stringify(prepared)}`);
      const receipt = slide.executeTypedCheckedFungiPackagePublication(prepared.packageExecutionHandle, candidate.args, undefined);
      assert.equal(receipt.status, "SUCCEEDED_PHYSICAL_REFERENCE_ONLY", candidate.flow);
      assert.equal(receipt.safeValueTypeId, slide.SAFE_VALUE_TYPE_IDS[candidate.type], candidate.flow);
      const verified = slide.verifyTypedCheckedFungiPackageReceipt(receipt, verificationExpectation(receipt));
      assert.equal(verified.verdict, 1, candidate.flow);
      assert.equal(verified.value, candidate.expected, candidate.flow);
      assert.equal(verified.authorityReleased, false, candidate.flow);
      retainedReceipt = receipt;
    }

    assert.ok(retainedReceipt);
    assert.equal(slide.verifyTypedCheckedFungiPackageReceipt(
      { ...retainedReceipt, receiptDigest: `sha256:${"0".repeat(64)}` },
      verificationExpectation(retainedReceipt),
    ).verdict, -1);

    const firstSlidePath = join(publicationDirectory, slideFiles[0]);
    const artifactBytes = await readFile(firstSlidePath);
    artifactBytes[0] ^= 1;
    await writeFile(firstSlidePath, artifactBytes);
    const refused = await slide.prepareCheckedFungiPackagePublication({
      publicationDirectory,
      packageIdentity: "@galerina/test",
      exportName: CANDIDATES[0].flow,
      context,
      gates: ALL_ALLOW,
    });
    assert.equal(refused.verdict, -1);
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

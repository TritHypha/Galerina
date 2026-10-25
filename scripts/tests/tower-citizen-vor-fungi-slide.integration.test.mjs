import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, it } from "node:test";

const SLIDE_ROOT = process.env.GALERINA_SLIDE_REPO;
const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const SLIDE_AVAILABLE =
  typeof SLIDE_ROOT === "string"
  && existsSync(join(SLIDE_ROOT, "src", "checked-fungi-package-compiler.mjs"));
const ALL_ALLOW = Object.freeze({
  identity: 1,
  provenance: 1,
  target: 1,
  effects: 1,
  policy: 1,
  revocation: 1,
  validation: 1,
  memory: 1,
});
// K3U2 gcw-k3u10: vOrVerdict is infectious-UNKNOWN OR (matches the frozen TS vOr):
// any native Unknown operand yields Unknown, so Allow no longer absorbs Unknown here
// (strong-Kleene Allow-or-Unknown = Allow would loosen authorization; zero trust rejects it).
// The value 0 is SLIDE's own wire image of native Verdict.Unknown.
const K3_MAX = Object.freeze([
  Object.freeze([-1, -1, -1]),
  Object.freeze([-1, 0, 0]),
  Object.freeze([-1, 1, 1]),
  Object.freeze([0, -1, 0]),
  Object.freeze([0, 0, 0]),
  Object.freeze([0, 1, 0]),
  Object.freeze([1, -1, 1]),
  Object.freeze([1, 0, 0]),
  Object.freeze([1, 1, 1]),
]);
const PACKAGE_IDENTITY = "@galerina/tower-citizen";
const FLOW_NAME = "vOrVerdict";

async function loadSlide() {
  const fromSlide = async (path) => import(pathToFileURL(join(SLIDE_ROOT, "src", path)).href);
  const compiler = await fromSlide("checked-fungi-package-compiler.mjs");
  const file = await fromSlide("checked-fungi-package-file.mjs");
  const loader = await fromSlide("checked-fungi-package-publication-loader.mjs");
  const values = await fromSlide("safe-value-envelope.mjs");
  const veo = await fromSlide("portable-veo.mjs");
  return { ...compiler, ...file, ...loader, ...values, ...veo };
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

async function prepare(slide, publicationDirectory, context) {
  const prepared = await slide.prepareCheckedFungiPackagePublication({
    publicationDirectory,
    packageIdentity: PACKAGE_IDENTITY,
    exportName: FLOW_NAME,
    context,
    gates: ALL_ALLOW,
  });
  assert.equal(prepared.verdict, 1, JSON.stringify(prepared));
  return prepared.packageExecutionHandle;
}

describe("Slice 92 Tower-Citizen vOr through physical SLIDE/VOK", () => {
  it("publishes, re-admits and executes the complete typed infectious K3 OR table", {
    skip: !SLIDE_AVAILABLE,
  }, async () => {
    const slide = await loadSlide();
    const context = slide.portableVeoReferenceContext();
    const sourcePath = join(
      ROOT,
      "packages-ts",
      "galerina-tower-citizen",
      "src",
      "self-hosted",
      "verdict-or.fungi",
    );
    const sourceBytes = Uint8Array.from(readFileSync(sourcePath));
    const request = (candidateBytes) => ({
      packages: [{
        identity: PACKAGE_IDENTITY,
        version: "1.0.0-beta.2",
        exports: [{
          name: FLOW_NAME,
          sourceFlowName: FLOW_NAME,
          sourceBytes: candidateBytes,
        }],
        dependencies: [],
        resources: [],
      }],
      context,
      gates: ALL_ALLOW,
    });

    const compiled = slide.compileCheckedFungiPackageSet(request(sourceBytes));
    assert.equal(compiled.verdict, 1, JSON.stringify(compiled));
    assert.equal(compiled.exports.length, 1);
    assert.deepEqual(compiled.exports[0].parameterTypeIds, [
      slide.SAFE_VALUE_TYPE_IDS.verdict,
      slide.SAFE_VALUE_TYPE_IDS.verdict,
    ]);
    assert.equal(compiled.exports[0].resultTypeId, slide.SAFE_VALUE_TYPE_IDS.verdict);

    const mutatedSource = Uint8Array.from(sourceBytes);
    mutatedSource[0] ^= 1;
    assert.equal(slide.compileCheckedFungiPackageSet(request(mutatedSource)).verdict, -1);

    const parent = await mkdtemp(join(tmpdir(), "galerina-slice-92-verdict-or-"));
    const publicationDirectory = join(parent, "published");
    try {
      const published = await slide.publishCheckedFungiPackageBuild({
        packageBuildHandle: compiled.packageBuildHandle,
        outputDirectory: publicationDirectory,
      });
      assert.equal(published.verdict, 1, JSON.stringify(published));
      const slideFiles = published.outputFiles.filter((name) => name.endsWith(".slide"));
      assert.equal(slideFiles.length, 1);

      let retainedReceipt;
      for (const [left, right, expected] of K3_MAX) {
        const receipt = slide.executeTypedCheckedFungiPackagePublication(
          await prepare(slide, publicationDirectory, context),
          [left, right],
          { steps: 512 },
        );
        assert.equal(receipt.status, "SUCCEEDED_PHYSICAL_REFERENCE_ONLY", JSON.stringify(receipt));
        assert.equal(receipt.safeValueTypeId, slide.SAFE_VALUE_TYPE_IDS.verdict);
        assert.equal(receipt.fallbackInvoked, false);
        assert.equal(receipt.authorityReleased, false);
        const verified = slide.verifyTypedCheckedFungiPackageReceipt(
          receipt,
          verificationExpectation(receipt),
        );
        assert.equal(verified.verdict, 1, JSON.stringify(verified));
        assert.equal(verified.value, expected, `vOrVerdict(${left}, ${right})`);
        assert.equal(verified.authorityReleased, false);
        retainedReceipt = receipt;
      }

      for (const invalidArguments of [
        [],
        [-1],
        [-1, -1, -1],
        [2, 1],
        [-2, 1],
        [1, 2],
        [1, -2],
        [true, 1],
        [1, false],
        ["1", 1],
        [1, "1"],
        [{}, 1],
        [1, {}],
      ]) {
        const refused = slide.executeTypedCheckedFungiPackagePublication(
          await prepare(slide, publicationDirectory, context),
          invalidArguments,
          { steps: 512 },
        );
        assert.equal(refused.status, "REFUSED", JSON.stringify(refused));
        assert.equal(refused.safeValueTypeId, 0);
      }

      const exhausted = slide.executeTypedCheckedFungiPackagePublication(
        await prepare(slide, publicationDirectory, context),
        [1, 1],
        { steps: 1 },
      );
      assert.equal(exhausted.status, "REFUSED", JSON.stringify(exhausted));

      assert.notEqual(retainedReceipt, undefined);
      const expectation = verificationExpectation(retainedReceipt);
      for (const [field, replacement] of [
        ["schema", "slide.checked-fungi.physical-execution.receipt.invalid"],
        ["safeValuePayloadDigest", `sha256:${"0".repeat(64)}`],
        ["receiptDigest", `sha256:${"0".repeat(64)}`],
        ["fallbackInvoked", true],
        ["authorityReleased", true],
      ]) {
        const mutated = { ...retainedReceipt, [field]: replacement };
        assert.equal(slide.inspectTypedCheckedFungiPackageReceipt(mutated).verdict, -1, field);
        assert.equal(slide.verifyTypedCheckedFungiPackageReceipt(mutated, expectation).verdict, -1, field);
      }
      for (let index = 0; index < retainedReceipt.safeValueEnvelopeBytes.length; index += 1) {
        const mutatedBytes = Uint8Array.from(retainedReceipt.safeValueEnvelopeBytes);
        mutatedBytes[index] ^= 1;
        assert.equal(
          slide.verifyTypedCheckedFungiPackageReceipt(
            { ...retainedReceipt, safeValueEnvelopeBytes: mutatedBytes },
            expectation,
          ).verdict,
          -1,
          `safe-value envelope byte ${index}`,
        );
      }

      const mutatedPath = join(publicationDirectory, slideFiles[0]);
      const artifactBytes = await readFile(mutatedPath);
      artifactBytes[0] ^= 1;
      await writeFile(mutatedPath, artifactBytes);
      const mutationAdmission = await slide.prepareCheckedFungiPackagePublication({
        publicationDirectory,
        packageIdentity: PACKAGE_IDENTITY,
        exportName: FLOW_NAME,
        context,
        gates: ALL_ALLOW,
      });
      assert.equal(mutationAdmission.verdict, -1);
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  });
});

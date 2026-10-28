import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { it } from "node:test";

import {
  CompilerTrust,
  dischargeTrust,
} from "../../packages-ts/galerina-core-compiler/dist/index.js";

const SLIDE_ROOT = process.env.GALERINA_SLIDE_REPO;
const SLIDE_AVAILABLE =
  typeof SLIDE_ROOT === "string"
  && existsSync(join(SLIDE_ROOT, "src", "checked-fungi-package-compiler.mjs"));
const SOURCE = join(
  process.cwd(),
  "packages-ts",
  "galerina-core-compiler",
  "src",
  "self-hosted",
  "hardening-trust-boundary.fungi",
);
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
const TRUST_VECTORS = Object.freeze([
  Object.freeze([-1, -1]),
  Object.freeze([-1, 0]),
  Object.freeze([-1, 1]),
  Object.freeze([0, -1]),
  Object.freeze([0, 0]),
  Object.freeze([0, 1]),
  Object.freeze([1, -1]),
  Object.freeze([1, 0]),
  Object.freeze([1, 1]),
]);

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
    packageIdentity: "@galerina/core-compiler",
    exportName: "dischargeTrustFungi",
    context,
    gates: ALL_ALLOW,
  });
  assert.equal(prepared.verdict, 1, JSON.stringify(prepared));
  assert.equal(Object.hasOwn(prepared, "registrySetId"), false);
  assert.equal(Object.hasOwn(prepared, "registrySetDigest"), false);
  return prepared.packageExecutionHandle;
}

function expectedTrust(current, verification) {
  const currentTrust = current === -1
    ? CompilerTrust.REFUTED
    : current === 0
      ? CompilerTrust.UNKNOWN
      : CompilerTrust.PROVEN;
  const verified = verification === -1
    ? false
    : verification === 0
      ? undefined
      : true;
  const result = dischargeTrust(currentTrust, verified);
  return result === CompilerTrust.REFUTED
    ? -1
    : result === CompilerTrust.UNKNOWN
      ? 0
      : 1;
}

it(
  "publishes and independently re-admits typed trust discharge through SLIDE/VOK",
  { skip: !SLIDE_AVAILABLE },
  async () => {
    const slide = await loadSlide();
    const context = slide.portableVeoReferenceContext();
    const sourceBytes = Uint8Array.from(readFileSync(SOURCE));
    const request = (candidateBytes) => ({
      packages: [{
        identity: "@galerina/core-compiler",
        version: "1.0.0-beta.2",
        exports: [{
          name: "dischargeTrustFungi",
          sourceFlowName: "dischargeTrustFungi",
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

    const mutatedSourceBytes = Uint8Array.from(sourceBytes);
    mutatedSourceBytes[0] ^= 0x01;
    assert.equal(slide.compileCheckedFungiPackageSet(request(mutatedSourceBytes)).verdict, -1);

    const parent = await mkdtemp(join(tmpdir(), "galerina-discharge-trust-slide-"));
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
      for (const [current, verification] of TRUST_VECTORS) {
        const receipt = slide.executeTypedCheckedFungiPackagePublication(
          await prepare(slide, publicationDirectory, context),
          [current, verification],
          { steps: 128 },
        );
        assert.equal(receipt.status, "SUCCEEDED_PHYSICAL_REFERENCE_ONLY", JSON.stringify(receipt));
        assert.equal(receipt.safeValueTypeId, slide.SAFE_VALUE_TYPE_IDS.verdict);
        const verified = slide.verifyTypedCheckedFungiPackageReceipt(
          receipt,
          verificationExpectation(receipt),
        );
        assert.equal(verified.verdict, 1, JSON.stringify(verified));
        assert.equal(verified.value, expectedTrust(current, verification));
        assert.equal(verified.authorityReleased, false);
        retainedReceipt = receipt;
      }

      for (const invalidArguments of [
        [],
        [1],
        [1, 0, -1],
        [-2, 0],
        [2, 0],
        [0, false],
        ["1", 0],
      ]) {
        const refused = slide.executeTypedCheckedFungiPackagePublication(
          await prepare(slide, publicationDirectory, context),
          invalidArguments,
          { steps: 128 },
        );
        assert.equal(refused.status, "REFUSED", JSON.stringify(refused));
        assert.equal(refused.safeValueTypeId, 0);
      }

      const exhaustedSteps = slide.executeTypedCheckedFungiPackagePublication(
        await prepare(slide, publicationDirectory, context),
        [1, 1],
        { steps: 1 },
      );
      assert.equal(exhaustedSteps.status, "REFUSED", JSON.stringify(exhaustedSteps));

      assert.ok(retainedReceipt);
      const expectation = verificationExpectation(retainedReceipt);
      for (const [field, replacement] of [
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
        const mutated = { ...retainedReceipt, safeValueEnvelopeBytes: mutatedBytes };
        assert.equal(
          slide.verifyTypedCheckedFungiPackageReceipt(mutated, expectation).verdict,
          -1,
          `safe-value envelope byte ${index}`,
        );
      }

      const mutatedPath = join(publicationDirectory, slideFiles[0]);
      const mutatedBytes = await readFile(mutatedPath);
      mutatedBytes[0] ^= 0x01;
      await writeFile(mutatedPath, mutatedBytes);
      const mutationAdmission = await slide.prepareCheckedFungiPackagePublication({
        publicationDirectory,
        packageIdentity: "@galerina/core-compiler",
        exportName: "dischargeTrustFungi",
        context,
        gates: ALL_ALLOW,
      });
      assert.equal(mutationAdmission.verdict, -1);
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  },
);

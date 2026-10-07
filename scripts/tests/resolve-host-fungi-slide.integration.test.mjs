import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { it } from "node:test";

import {
  canHonour,
  resolveHost,
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
  "hardening-host-capability.fungi",
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
const REGISTRY_SET_ID = "slide.registry.executable-gir.v2c-immutable-value-ops.v1";
const REGISTRY_SET_DIGEST = "956e5f12ea00599f67fc4892774c01b78bedcc5d630df70f0164730ee8a25703";
const HONOUR_REGISTRY_SET_ID = "slide.registry.executable-gir.v2c-bounded-wide-control-flow.v1";
const HONOUR_REGISTRY_SET_DIGEST = "d805dae4b822392e5092126ce4f0fb27e8bfa6aa2de8862ee88e09e23eed43cc";
const RECORD_DESCRIPTOR_DIGEST = "sha256:1416308737ffb44988f8a01339d3d358fe5055ad1859584b52022615422c15bc";
const VECTORS = Object.freeze([
  Object.freeze(["mlock_posix", "mlock_posix"]),
  Object.freeze(["register_pinned", "register_pinned"]),
  Object.freeze(["browser_secure_context", "browser_secure_context"]),
  Object.freeze(["<undeclared>", undefined]),
  Object.freeze(["", ""]),
  Object.freeze(["unknown", "unknown"]),
  Object.freeze(["__proto__", "__proto__"]),
  Object.freeze(["constructor", "constructor"]),
  Object.freeze([" mlock_posix", " mlock_posix"]),
  Object.freeze(["mlock_posix ", "mlock_posix "]),
  Object.freeze(["MLOCK_POSIX", "MLOCK_POSIX"]),
  Object.freeze(["mlock_pos\u0131x", "mlock_pos\u0131x"]),
  Object.freeze(["mlock_posix\u0000tail", "mlock_posix\u0000tail"]),
]);
const HONOUR_HOSTS = Object.freeze([
  resolveHost("mlock_posix"),
  resolveHost("register_pinned"),
  resolveHost("browser_secure_context"),
  resolveHost(undefined),
]);
const HONOUR_CEILINGS = Object.freeze([
  "register_only",
  "no_dram_spill",
  "no_swap",
  "no_disk",
  "unrestricted",
  "",
  "unknown",
  "__proto__",
  "constructor",
  " no_swap",
  "no_swap ",
  "NO_SWAP",
  "n\u00f8_swap",
  "no_swap\u0000tail",
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
  const expectation = {
    packageSetDigest: receipt.packageSetDigest,
    packageIdentity: receipt.packageIdentity,
    exportName: receipt.exportName,
    receiptDigest: receipt.receiptDigest,
    safeValueTypeId: receipt.safeValueTypeId,
    safeValueStateId: receipt.safeValueStateId,
    safeValueProvenanceDigest: receipt.safeValueProvenanceDigest,
  };
  return typeof receipt.recordDescriptorDigest === "string"
    ? { ...expectation, recordDescriptorDigest: receipt.recordDescriptorDigest }
    : expectation;
}

async function prepare(slide, publicationDirectory, context) {
  const prepared = await slide.prepareCheckedFungiPackagePublication({
    publicationDirectory,
    packageIdentity: "@galerina/core-compiler",
    exportName: "resolveHostFungi",
    context,
    gates: ALL_ALLOW,
  });
  assert.equal(prepared.verdict, 1, JSON.stringify(prepared));
  assert.equal(prepared.registrySetId, REGISTRY_SET_ID);
  assert.equal(prepared.registrySetDigest, REGISTRY_SET_DIGEST);
  assert.equal(Object.hasOwn(prepared, "recordDescriptorDigest"), false);
  return prepared.packageExecutionHandle;
}

async function prepareCanHonour(slide, publicationDirectory, context) {
  const prepared = await slide.prepareCheckedFungiPackagePublication({
    publicationDirectory,
    packageIdentity: "@galerina/core-compiler",
    exportName: "canHonourFungi",
    context,
    gates: ALL_ALLOW,
  });
  assert.equal(prepared.verdict, 1, JSON.stringify(prepared));
  assert.equal(prepared.registrySetId, HONOUR_REGISTRY_SET_ID);
  assert.equal(prepared.registrySetDigest, HONOUR_REGISTRY_SET_DIGEST);
  assert.equal(Object.hasOwn(prepared, "recordDescriptorDigest"), false);
  return prepared.packageExecutionHandle;
}

it(
  "publishes and independently re-admits exact host capability records through SLIDE/VOK",
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
          name: "resolveHostFungi",
          sourceFlowName: "resolveHostFungi",
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

    const parent = await mkdtemp(join(tmpdir(), "galerina-resolve-host-slide-"));
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
      for (const [physicalName, referenceName] of VECTORS) {
        const receipt = slide.executeTypedCheckedFungiPackagePublication(
          await prepare(slide, publicationDirectory, context),
          [physicalName],
          { steps: 256 },
        );
        assert.equal(receipt.status, "SUCCEEDED_PHYSICAL_REFERENCE_ONLY", JSON.stringify(receipt));
        assert.equal(receipt.schema, "slide.checked-fungi.physical-execution.receipt.v4-record");
        assert.equal(receipt.safeValueTypeId, slide.SAFE_VALUE_TYPE_IDS.record);
        assert.equal(receipt.recordDescriptorDigest, RECORD_DESCRIPTOR_DIGEST);
        const expectation = verificationExpectation(receipt);
        const verified = slide.verifyTypedCheckedFungiPackageReceipt(receipt, expectation);
        assert.equal(verified.verdict, 1, JSON.stringify(verified));
        assert.deepEqual(verified.value, resolveHost(referenceName));
        assert.equal(verified.authorityReleased, false);
        if (physicalName === "register_pinned" || physicalName === "browser_secure_context") {
          const expectedPhysicalCapabilities = {
            canRegisterPin: false,
            canNoDramSpill: false,
            canNoSwap: false,
            canNoDisk: false,
          };
          for (const [field, value] of Object.entries(expectedPhysicalCapabilities)) {
            assert.equal(verified.value[field], value, `${physicalName}.${field}`);
          }
        }
        retainedReceipt = receipt;
      }
      for (const invalidArguments of [
        [],
        ["mlock_posix", "extra"],
        [1],
        [true],
        [{ name: "mlock_posix" }],
        ["\ud800"],
      ]) {
        const refused = slide.executeTypedCheckedFungiPackagePublication(
          await prepare(slide, publicationDirectory, context),
          invalidArguments,
          { steps: 256 },
        );
        assert.equal(refused.status, "REFUSED", JSON.stringify(refused));
        assert.equal(refused.safeValueTypeId, 0);
      }

      const exhaustedSteps = slide.executeTypedCheckedFungiPackagePublication(
        await prepare(slide, publicationDirectory, context),
        ["mlock_posix"],
        { steps: 1 },
      );
      assert.equal(exhaustedSteps.status, "REFUSED", JSON.stringify(exhaustedSteps));

      assert.ok(retainedReceipt);
      const expectation = verificationExpectation(retainedReceipt);
      for (const [field, replacement] of [
        ["schema", "slide.checked-fungi.physical-execution.receipt.v2"],
        ["recordDescriptorDigest", `sha256:${"0".repeat(64)}`],
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
        exportName: "resolveHostFungi",
        context,
        gates: ALL_ALLOW,
      });
      assert.equal(mutationAdmission.verdict, -1);
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  },
);

it(
  "publishes and independently re-admits the host honour decision through SLIDE/VOK",
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
          name: "canHonourFungi",
          sourceFlowName: "canHonourFungi",
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

    const parent = await mkdtemp(join(tmpdir(), "galerina-can-honour-slide-"));
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
      for (const host of HONOUR_HOSTS) {
        for (const ceiling of HONOUR_CEILINGS) {
          const receipt = slide.executeTypedCheckedFungiPackagePublication(
            await prepareCanHonour(slide, publicationDirectory, context),
            [
              ceiling,
              host.canRegisterPin,
              host.canNoDramSpill,
              host.canNoSwap,
              host.canNoDisk,
            ],
            { steps: 256, textComparisonWork: 65_536 },
          );
          assert.equal(receipt.status, "SUCCEEDED_PHYSICAL_REFERENCE_ONLY", JSON.stringify(receipt));
          assert.equal(receipt.safeValueTypeId, slide.SAFE_VALUE_TYPE_IDS.bool);
          const expectation = verificationExpectation(receipt);
          const verified = slide.verifyTypedCheckedFungiPackageReceipt(receipt, expectation);
          assert.equal(verified.verdict, 1, JSON.stringify(verified));
          assert.equal(verified.value, canHonour(ceiling, host).ok, `${host.name}:${ceiling}`);
          assert.equal(verified.authorityReleased, false);
          retainedReceipt = receipt;
        }
      }

      for (const invalidArguments of [
        [],
        ["no_swap"],
        ["no_swap", false, false, true],
        ["no_swap", false, false, true, true, false],
        [1, false, false, true, true],
        ["no_swap", 0, false, true, true],
        ["no_swap", false, "false", true, true],
        ["no_swap", false, false, 1, true],
        ["no_swap", false, false, true, {}],
        ["\ud800", false, false, true, true],
      ]) {
        const refused = slide.executeTypedCheckedFungiPackagePublication(
          await prepareCanHonour(slide, publicationDirectory, context),
          invalidArguments,
          { steps: 256, textComparisonWork: 65_536 },
        );
        assert.equal(refused.status, "REFUSED", JSON.stringify(refused));
        assert.equal(refused.safeValueTypeId, 0);
      }

      const exhaustedSteps = slide.executeTypedCheckedFungiPackagePublication(
        await prepareCanHonour(slide, publicationDirectory, context),
        ["unrestricted", false, false, false, false],
        { steps: 1, textComparisonWork: 65_536 },
      );
      assert.equal(exhaustedSteps.status, "REFUSED", JSON.stringify(exhaustedSteps));

      assert.ok(retainedReceipt);
      const expectation = verificationExpectation(retainedReceipt);
      for (const [field, replacement] of [
        ["schema", "slide.checked-fungi.physical-execution.receipt.v2"],
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
        exportName: "canHonourFungi",
        context,
        gates: ALL_ALLOW,
      });
      assert.equal(mutationAdmission.verdict, -1);
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  },
);

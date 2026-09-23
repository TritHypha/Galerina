import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";

import {
  buildReceiptBoundSlidePackage,
  digestRuntimeFile,
  slideToolManifestDigest,
} from "../lib/receipt-bound-slide-build.mjs";

const TEMP = [];
const SUCCESSOR_REGISTRY = Object.freeze({
  id: "slide.registry.executable-gir.v2c-bounded-transitive-call-work.v1",
  digest: "6121be7c1e279d8a28eeeaa31e46889e4fd8450aa9383bb40de80d2484bf855e",
});

function rawDigest(domain, parts) {
  const hash = createHash("sha256").update(domain, "utf8").update(Uint8Array.of(0));
  for (const part of parts) hash.update(part);
  return Uint8Array.from(hash.digest());
}

function typedDigest(domain, parts) {
  return `sha256:${Buffer.from(rawDigest(domain, parts)).toString("hex")}`;
}

function framedDigest(domain, parts) {
  const hash = createHash("sha256").update(domain, "utf8").update(Uint8Array.of(0));
  for (const part of parts) {
    hash.update(Uint8Array.of(
      (part.length >>> 24) & 0xff,
      (part.length >>> 16) & 0xff,
      (part.length >>> 8) & 0xff,
      part.length & 0xff,
    ));
    hash.update(part);
  }
  return `sha256:${hash.digest("hex")}`;
}

function cborHead(major, value) {
  if (value < 24) return Buffer.from([(major << 5) | value]);
  if (value <= 0xff) return Buffer.from([(major << 5) | 24, value]);
  if (value <= 0xffff) return Buffer.from([(major << 5) | 25, value >>> 8, value & 0xff]);
  return Buffer.from([
    (major << 5) | 26,
    (value >>> 24) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 8) & 0xff,
    value & 0xff,
  ]);
}

function cborText(value) {
  const bytes = Buffer.from(value, "utf8");
  return Buffer.concat([cborHead(3, bytes.length), bytes]);
}

function cborUint(value) {
  return cborHead(0, value);
}

function cborArray(values) {
  return Buffer.concat([cborHead(4, values.length), ...values]);
}

function descriptorBytes({ identity, version, contentDigest, artifact }) {
  const exported = cborArray([
    cborText(artifact.exportName),
    cborText(artifact.slideBundleDigest),
    cborArray(artifact.parameterTypeIds.map(cborUint)),
    cborUint(artifact.resultTypeId),
  ]);
  return cborArray([
    cborText("slide.flat-package.v1"),
    cborText(identity),
    cborText(version),
    cborText(contentDigest),
    cborArray([exported]),
    cborArray([]),
    cborArray([]),
  ]);
}

function artifactId(packageIdentity, exportName) {
  const identityHash = createHash("sha256").update(packageIdentity, "utf8").digest("hex").slice(0, 16);
  const exportHash = createHash("sha256").update(exportName, "utf8").digest("hex").slice(0, 16);
  return `pkg.${identityHash}.${exportHash}`;
}

function artifactFileName(packageIdentity, exportName) {
  const identityHash = createHash("sha256").update(packageIdentity, "utf8").digest("hex").slice(0, 16);
  const exportHash = createHash("sha256").update(exportName, "utf8").digest("hex").slice(0, 16);
  return `package-${identityHash}-${exportHash}.slide`;
}

function bundle(artifactIdentity) {
  const artifact = Buffer.from(artifactIdentity, "utf8");
  const gir = Uint8Array.of(1);
  const bytes = new Uint8Array(188 + artifact.length + gir.length);
  const view = new DataView(bytes.buffer);
  bytes.set(Uint8Array.of(0x53, 0x4c, 0x49, 0x44, 0x45, 0x0d, 0x0a, 0x1a), 0);
  view.setUint16(8, 1, false);
  view.setUint32(12, bytes.length, false);
  view.setUint16(16, artifact.length, false);
  view.setUint32(20, 1, false);
  view.setUint32(24, gir.length, false);
  bytes.fill(1, 28, 60);
  bytes.fill(2, 60, 92);
  bytes.fill(3, 92, 124);
  bytes.set(rawDigest("slide.bundle.gir.v1", [gir]), 124);
  bytes.set(artifact, 188);
  bytes.set(gir, 188 + artifact.length);
  bytes.set(rawDigest("slide.bundle.descriptor.v1", [bytes.subarray(0, 156), artifact]), 156);
  return bytes;
}

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "galerina-slide-boundary-"));
  TEMP.push(root);
  const toolRoot = join(root, "slide");
  const projectRoot = join(root, "project");
  await mkdir(join(toolRoot, "src"), { recursive: true });
  await mkdir(join(toolRoot, "governance"));
  await mkdir(join(projectRoot, "src"), { recursive: true });
  await mkdir(join(projectRoot, "out"), { recursive: true });
  const entrypoint = "src/checked-fungi-package-manifest-cli.mjs";
  const sourceFiles = [
    [entrypoint, "import './helper.mjs';\n"],
    ["src/helper.mjs", "export const helper = 1;\n"],
  ];
  for (const [path, text] of sourceFiles) await writeFile(join(toolRoot, ...path.split("/")), text);
  const files = sourceFiles.map(([path, text]) => ({
    path,
    byteLength: Buffer.byteLength(text),
    sha256: `sha256:${createHash("sha256").update(text).digest("hex")}`,
  }));
  const toolManifest = {
    schema: "slide.reference-tool-manifest.v1",
    toolId: "slide.checked-fungi-package-compiler.v1",
    profileId: "slide.checked-fungi.source-manifest.v1",
    entrypoint,
    files,
    referenceOnly: true,
    authorityReleased: false,
  };
  const toolManifestBytes = Buffer.from(`${JSON.stringify(toolManifest, null, 2)}\n`);
  const toolManifestPath = join(toolRoot, "governance", "checked-fungi-package-tool-manifest.json");
  await writeFile(toolManifestPath, toolManifestBytes);
  const sourceManifestPath = join(projectRoot, "package-set.json");
  const sourceBytes = Buffer.from("secure flow main(value: Int) -> Int { return value }\n", "utf8");
  await writeFile(join(projectRoot, "src", "main.fungi"), sourceBytes);
  const sourceManifest = {
    schema: "slide.checked-fungi.source-manifest.v1",
    context: {
      targetDigest: `sha256:${"01".repeat(32)}`,
      policyDigest: `sha256:${"02".repeat(32)}`,
      verifierDigest: `sha256:${"03".repeat(32)}`,
    },
    packages: [{
      identity: "@galerina/test",
      version: "1.0.0",
      exports: [{ name: "main", sourceFlowName: "main", source: "src/main.fungi" }],
      dependencies: [],
      resources: [],
    }],
  };
  const sourceManifestBytes = Buffer.from(`${JSON.stringify(sourceManifest, null, 2)}\n`);
  await writeFile(sourceManifestPath, sourceManifestBytes);
  return {
    root,
    toolRoot,
    projectRoot,
    toolManifestPath,
    toolManifestBytes,
    sourceManifestPath,
    sourceManifestBytes,
    sourceBytes,
    outputDirectory: join(projectRoot, "out", "build-one"),
  };
}

function successRunner(fixtureValue, mutate = () => undefined, successorRegistry = null) {
  return async ({ command, args }) => {
    assert.equal(command, process.execPath);
    assert.match(args[0], /slide-pinned-tool-.*checked-fungi-package-manifest-cli\.mjs$/);
    const output = fixtureValue.outputDirectory;
    await mkdir(output);
    const packageIdentity = "@galerina/test";
    const exportName = "main";
    const slide = bundle(artifactId(packageIdentity, exportName));
    const fileName = artifactFileName(packageIdentity, exportName);
    await writeFile(join(output, fileName), slide);
    const version = "1.0.0";
    const baseArtifact = {
      packageIdentity,
      exportName,
      sourceFlowName: "main",
      compilerProfileId: "slide.pure-scalar.v1",
      sourceDigest: typedDigest("slide.checked-fungi.pure-scalar.source.v1", [fixtureValue.sourceBytes]),
      fileName,
      slideBundleDigest: typedDigest("slide.bundle.v1", [slide]),
    };
    const registryArtifact = successorRegistry === null ? {} : {
      registrySetId: successorRegistry.id,
      registrySetDigest: successorRegistry.digest,
    };
    const artifact = {
      ...baseArtifact,
      ...registryArtifact,
      packageDescriptorDigest: "",
      parameterTypeIds: [],
      resultTypeId: 1,
      byteLength: slide.length,
    };
    const contentParts = [
      Buffer.from(packageIdentity, "utf8"),
      Buffer.from(version, "utf8"),
      Buffer.from(artifact.exportName, "utf8"),
      Buffer.from(artifact.sourceFlowName, "utf8"),
      Buffer.from(artifact.compilerProfileId, "utf8"),
      Buffer.from(artifact.sourceDigest, "utf8"),
      Buffer.from(artifact.slideBundleDigest, "utf8"),
      Uint8Array.of(artifact.resultTypeId),
    ];
    if (successorRegistry !== null && successorRegistry.id !== "") {
      contentParts.push(
        Buffer.from(successorRegistry.id, "utf8"),
        Buffer.from(successorRegistry.digest, "utf8"),
      );
    }
    const contentDigest = framedDigest("slide.checked-fungi.package-content.v1", contentParts);
    const canonicalDescriptor = descriptorBytes({
      identity: packageIdentity,
      version,
      contentDigest,
      artifact,
    });
    const descriptorDigest = framedDigest("slide.flat-package.descriptor.v1", [canonicalDescriptor]);
    artifact.packageDescriptorDigest = descriptorDigest;
    const packageSetDigest = framedDigest("slide.flat-package.set.v1", [Buffer.from(descriptorDigest, "utf8")]);
    const receipt = {
      schema: successorRegistry === null
        ? "slide.checked-fungi.package-publication.v1"
        : "slide.checked-fungi.package-publication.v2",
      packageSetDigest,
      topologicalIdentities: [packageIdentity],
      descriptors: [{
        packageIdentity,
        descriptorDigest,
        canonicalBase64: canonicalDescriptor.toString("base64"),
      }],
      artifacts: [artifact],
      publicationMode: "exclusive-directory-receipt-last.v1",
      powerLossDurability: 0,
      referenceOnly: true,
      authorityReleased: false,
    };
    const child = {
      verdict: 1,
      status: "PUBLISHED_SOURCE_MANIFEST_REFERENCE_ONLY",
      failureId: "NONE",
      sourceManifestDigest: typedDigest("slide.checked-fungi.source-manifest.v1", [fixtureValue.sourceManifestBytes]),
      packageSetDigest,
      outputName: "build-one",
      artifactCount: 1,
      outputFiles: [fileName, "package-set.receipt.json"],
      powerLossDurability: 0,
      referenceOnly: true,
      authorityReleased: false,
    };
    await mutate(receipt, child);
    await writeFile(join(output, "package-set.receipt.json"), `${JSON.stringify(receipt, null, 2)}\n`);
    return {
      status: 0,
      signal: null,
      stdout: `${JSON.stringify(child)}\n`,
      stderr: "",
      timedOut: false,
      outputLimitExceeded: false,
      cleanupAttempted: false,
      cleanupAcknowledged: false,
      cleanupDetail: "not required",
      spawnError: null,
    };
  };
}

afterEach(async () => {
  await Promise.all(TEMP.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("receipt-bound Galerina to SLIDE package build", () => {
  it("verifies exact tool/runtime pins and independently reopens the publication", async () => {
    const value = await fixture();
    const result = await buildReceiptBoundSlidePackage({
      rootDirectory: value.projectRoot,
      sourceManifestPath: value.sourceManifestPath,
      outputDirectory: value.outputDirectory,
      slideToolRoot: value.toolRoot,
      slideToolManifestPath: value.toolManifestPath,
      expectedSlideToolManifestDigest: slideToolManifestDigest(value.toolManifestBytes),
      expectedRuntimeDigest: await digestRuntimeFile(process.execPath),
    }, { runOwnedProcess: successRunner(value) });
    assert.equal(result.verdict, 1, JSON.stringify(result));
    assert.equal(result.status, "GALERINA_SLIDE_PACKAGE_VERIFIED_REFERENCE_ONLY");
    assert.equal(result.artifactCount, 1);
    assert.equal(result.referenceOnly, true);
    assert.equal(result.authorityReleased, false);
    assert.equal(Object.hasOwn(result, "slideToolRoot"), false);
  });

  it("admits only an exact registry-bound v2 publication receipt", async () => {
    const accepted = await fixture();
    const acceptedResult = await buildReceiptBoundSlidePackage({
      rootDirectory: accepted.projectRoot,
      sourceManifestPath: accepted.sourceManifestPath,
      outputDirectory: accepted.outputDirectory,
      slideToolRoot: accepted.toolRoot,
      slideToolManifestPath: accepted.toolManifestPath,
      expectedSlideToolManifestDigest: slideToolManifestDigest(accepted.toolManifestBytes),
      expectedRuntimeDigest: await digestRuntimeFile(process.execPath),
    }, { runOwnedProcess: successRunner(accepted, () => undefined, SUCCESSOR_REGISTRY) });
    assert.equal(acceptedResult.verdict, 1, JSON.stringify(acceptedResult));

    for (const refusedRegistry of [
      {
        id: "slide.registry.executable-gir.unknown.v1",
        digest: SUCCESSOR_REGISTRY.digest,
      },
      {
        id: SUCCESSOR_REGISTRY.id,
        digest: "0".repeat(64),
      },
      { id: "", digest: "" },
    ]) {
      const value = await fixture();
      const result = await buildReceiptBoundSlidePackage({
        rootDirectory: value.projectRoot,
        sourceManifestPath: value.sourceManifestPath,
        outputDirectory: value.outputDirectory,
        slideToolRoot: value.toolRoot,
        slideToolManifestPath: value.toolManifestPath,
        expectedSlideToolManifestDigest: slideToolManifestDigest(value.toolManifestBytes),
        expectedRuntimeDigest: await digestRuntimeFile(process.execPath),
      }, { runOwnedProcess: successRunner(value, () => undefined, refusedRegistry) });
      assert.equal(result.verdict, -1);
    }
  });

  it("refuses wrong pins and mutated tool bytes before child execution", async () => {
    const value = await fixture();
    let calls = 0;
    const runOwnedProcess = async () => { calls += 1; throw new Error("must not run"); };
    const base = {
      rootDirectory: value.projectRoot,
      sourceManifestPath: value.sourceManifestPath,
      outputDirectory: value.outputDirectory,
      slideToolRoot: value.toolRoot,
      slideToolManifestPath: value.toolManifestPath,
      expectedSlideToolManifestDigest: slideToolManifestDigest(value.toolManifestBytes),
      expectedRuntimeDigest: await digestRuntimeFile(process.execPath),
    };
    assert.equal((await buildReceiptBoundSlidePackage({ ...base, expectedRuntimeDigest: `sha256:${"0".repeat(64)}` }, { runOwnedProcess })).verdict, -1);
    assert.equal((await buildReceiptBoundSlidePackage({ ...base, expectedSlideToolManifestDigest: `sha256:${"0".repeat(64)}` }, { runOwnedProcess })).verdict, -1);
    await writeFile(join(value.toolRoot, "src", "helper.mjs"), "export const helper = 2;\n");
    assert.equal((await buildReceiptBoundSlidePackage(base, { runOwnedProcess })).verdict, -1);
    assert.equal(calls, 0);
  });

  it("refuses child claims without exact physical evidence", async () => {
    const value = await fixture();
    const result = await buildReceiptBoundSlidePackage({
      rootDirectory: value.projectRoot,
      sourceManifestPath: value.sourceManifestPath,
      outputDirectory: value.outputDirectory,
      slideToolRoot: value.toolRoot,
      slideToolManifestPath: value.toolManifestPath,
      expectedSlideToolManifestDigest: slideToolManifestDigest(value.toolManifestBytes),
      expectedRuntimeDigest: await digestRuntimeFile(process.execPath),
    }, { runOwnedProcess: async () => ({
      status: 0,
      signal: null,
      stdout: `${JSON.stringify({ verdict: 1 })}\n`,
      stderr: "",
      timedOut: false,
      outputLimitExceeded: false,
      cleanupAttempted: false,
      cleanupAcknowledged: false,
      cleanupDetail: "not required",
      spawnError: null,
    }) });
    assert.equal(result.verdict, -1);
    assert.equal(result.artifactCount, 0);
  });

  it("refuses forged descriptor and package-set digests even when the child repeats them", async () => {
    for (const mutate of [
      (receipt) => {
        receipt.descriptors[0].descriptorDigest = `sha256:${"7".repeat(64)}`;
        receipt.artifacts[0].packageDescriptorDigest = receipt.descriptors[0].descriptorDigest;
      },
      (receipt, child) => {
        receipt.packageSetDigest = `sha256:${"8".repeat(64)}`;
        child.packageSetDigest = receipt.packageSetDigest;
      },
    ]) {
      const value = await fixture();
      const result = await buildReceiptBoundSlidePackage({
        rootDirectory: value.projectRoot,
        sourceManifestPath: value.sourceManifestPath,
        outputDirectory: value.outputDirectory,
        slideToolRoot: value.toolRoot,
        slideToolManifestPath: value.toolManifestPath,
        expectedSlideToolManifestDigest: slideToolManifestDigest(value.toolManifestBytes),
        expectedRuntimeDigest: await digestRuntimeFile(process.execPath),
      }, { runOwnedProcess: successRunner(value, mutate) });
      assert.equal(result.verdict, -1);
    }
  });

  it("refuses source-closure mutation performed by the selected child", async () => {
    const value = await fixture();
    const result = await buildReceiptBoundSlidePackage({
      rootDirectory: value.projectRoot,
      sourceManifestPath: value.sourceManifestPath,
      outputDirectory: value.outputDirectory,
      slideToolRoot: value.toolRoot,
      slideToolManifestPath: value.toolManifestPath,
      expectedSlideToolManifestDigest: slideToolManifestDigest(value.toolManifestBytes),
      expectedRuntimeDigest: await digestRuntimeFile(process.execPath),
    }, {
      runOwnedProcess: successRunner(value, async () => {
        await writeFile(join(value.projectRoot, "src", "main.fungi"), "changed after child selection\n");
      }),
    });
    assert.equal(result.verdict, -1);
  });
});

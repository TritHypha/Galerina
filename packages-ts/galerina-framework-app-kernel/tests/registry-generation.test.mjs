import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  chmod,
  mkdtemp,
  mkdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createHash,
  generateKeyPairSync,
  sign as edSign,
} from "node:crypto";
import { describe, it } from "node:test";
import {
  ml_dsa65 as mlDsa65,
} from "../../galerina-tower-citizen/node_modules/@noble/post-quantum/ml-dsa.js";

import {
  buildRegistryGeneration,
  admitRegistryDurabilityProfile,
  activateRegistryDurabilityProfile,
  createRegistryGenerationHostEvidenceAdapter,
  isPersistedRegistryGeneration,
  isProductionAdmittedRegistryGeneration,
  isRegistryGenerationForwardProbe,
  isVerifiedRegistryGeneration,
  loadRegistryGeneration,
  persistRegistryGeneration,
  publishRegistryGenerationWithLinkedHost,
  consumeRegistryGenerationForwardProbe,
  registryGenerationCanonicalJson,
  registryGenerationFileName,
  registryGenerationId,
  verifyRegistryGenerationForwardProbe,
  verifyRegistryDurabilityEvidence,
  verifyRegistryGeneration,
} from "../dist/index.js";

const KEY_ID = "bbbbbbbbbbbbbbbb";
const HOST_EVIDENCE_DIGEST = `sha256:${"a".repeat(64)}`;
const CONTEXTS = Object.freeze({
  "package-manifest": new TextEncoder().encode(
    "galerina.registry.package.manifest.sig.v1",
  ),
  "registry-index": new TextEncoder().encode(
    "galerina.registry.index.sig.v2",
  ),
});

function hybridKey(keyId = KEY_ID) {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const mlSecret = mlDsa65.keygen().secretKey;
  return {
    publicBundle: {
      keyId,
      ed25519PublicKeyPem: publicKey.export({
        type: "spki",
        format: "pem",
      }).toString(),
      mlDsa65PublicKey: mlDsa65.getPublicKey(mlSecret),
    },
    custody: {
      signHybrid(requestedKeyId, message, role) {
        if (requestedKeyId !== keyId || !(role in CONTEXTS)) return null;
        return {
          ed25519: Buffer.from(
            edSign(null, message, privateKey),
          ).toString("base64"),
          mlDsa65: Buffer.from(
            mlDsa65.sign(message, mlSecret, {
              context: CONTEXTS[role],
            }),
          ).toString("base64"),
        };
      },
    },
  };
}

function unsignedManifest(name = "@galerina/example") {
  return {
    schema: "galerina-package-manifest/v1",
    name,
    version: "1.0.0",
    registry: "https://registry.galerina.dev",
    artifactProfile: "galerina-flat-package-tree/v1",
    artifactFiles: ["LICENSE", "package.json", "src/index.fungi"],
    capabilities: ["audit.write"],
    effects: ["audit.write"],
    installScript: null,
    hash: `sha256:${"4".repeat(64)}`,
    publisher: "galerina-owner-governance",
    keyId: "1111111111111111",
    signerKeyId: "1111111111111111",
    certificationLevel: "verified",
    riskRating: "low",
    governance: {
      reviewed: true,
      reviewedBy: "galerina-owner-governance",
      reviewedAt: "2026-08-01T00:00:00.000Z",
    },
  };
}

function builtFixture() {
  const key = hybridKey();
  const generation = buildRegistryGeneration({
    delegationSerial: 2,
    operationalPublicBundle: key.publicBundle,
    unsignedManifests: [unsignedManifest()],
    registry: "https://registry.galerina.dev",
    issuedAt: "2026-08-02T00:00:00.000Z",
    custody: key.custody,
  });
  return { key, generation };
}

function hostEvidenceAdapter(flushDirectory) {
  return createRegistryGenerationHostEvidenceAdapter({
    adapterId: "galerina.test.host-evidence.v1",
    sourceDigest: HOST_EVIDENCE_DIGEST,
    flushDirectory,
  });
}

describe("content-addressed registry generation", () => {
  it("issues one exact generation-bound forward probe and refuses copies or reuse", async () => {
    const directory = await mkdtemp(join(tmpdir(), "galerina-forward-probe-"));
    const otherDirectory = await mkdtemp(
      join(tmpdir(), "galerina-forward-probe-other-"),
    );
    try {
      const { key, generation } = builtFixture();
      const generationId = await registryGenerationId(generation);
      const persisted = await persistRegistryGeneration({
        directory,
        generation,
        verify: {
          expectedDelegationSerial: 2,
          publicBundle: key.publicBundle,
          minIndexIssuedAt: "2026-07-30T16:33:10.307Z",
        },
        durabilityAdapter: hostEvidenceAdapter(async () => true),
      });
      await persistRegistryGeneration({
        directory: otherDirectory,
        generation,
        verify: {
          expectedDelegationSerial: 2,
          publicBundle: key.publicBundle,
          minIndexIssuedAt: "2026-07-30T16:33:10.307Z",
        },
        durabilityAdapter: hostEvidenceAdapter(async () => true),
      });
      const otherPathProbe = await verifyRegistryGenerationForwardProbe({
        directory: otherDirectory,
        generationId,
        verify: {
          expectedDelegationSerial: 2,
          publicBundle: key.publicBundle,
          minIndexIssuedAt: "2026-07-30T16:33:10.307Z",
        },
      });
      assert.equal(
        consumeRegistryGenerationForwardProbe(otherPathProbe, persisted),
        false,
      );
      const probe = await verifyRegistryGenerationForwardProbe({
        directory,
        generationId,
        verify: {
          expectedDelegationSerial: 2,
          publicBundle: key.publicBundle,
          minIndexIssuedAt: "2026-07-30T16:33:10.307Z",
        },
      });

      assert.equal(isRegistryGenerationForwardProbe(probe, persisted), true);
      assert.equal(
        isRegistryGenerationForwardProbe({ ...probe }, persisted),
        false,
      );
      assert.equal(
        isRegistryGenerationForwardProbe(new Proxy(probe, {}), persisted),
        false,
      );
      assert.equal(
        isRegistryGenerationForwardProbe(probe, { ...persisted }),
        false,
      );
      assert.equal(
        isRegistryGenerationForwardProbe(probe, new Proxy(persisted, {})),
        false,
      );
      assert.equal(
        isRegistryGenerationForwardProbe(probe, {
          ...persisted,
          generationId: "0".repeat(64),
        }),
        false,
      );
      assert.equal(
        consumeRegistryGenerationForwardProbe(probe, persisted),
        true,
      );
      assert.equal(
        consumeRegistryGenerationForwardProbe(probe, persisted),
        false,
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
      await rm(otherDirectory, { recursive: true, force: true });
    }
  });

  it("re-signs every manifest, signs the index, and verifies exact correspondence", async () => {
    const { key, generation } = builtFixture();
    assert.equal(generation.delegationSerial, 2);
    assert.equal(generation.operationalKeyId, KEY_ID);
    assert.equal(generation.manifests.length, 1);
    assert.equal(generation.manifests[0].keyId, KEY_ID);
    assert.equal(generation.manifests[0].signerKeyId, KEY_ID);
    assert.equal(generation.index.entries[0].keyId, KEY_ID);
    assert.equal(
      verifyRegistryGeneration(generation, {
        expectedDelegationSerial: 2,
        publicBundle: key.publicBundle,
        minIndexIssuedAt: "2026-07-30T16:33:10.307Z",
      }),
      "verified",
    );
    assert.equal(
      registryGenerationCanonicalJson(generation),
      registryGenerationCanonicalJson(generation),
    );
    const generationId = await registryGenerationId(generation);
    assert.match(generationId, /^[0-9a-f]{64}$/);
    assert.equal(
      generationId,
      await registryGenerationId(generation),
    );
    assert.equal(
      registryGenerationFileName(generationId),
      `registry-generation-${generationId}.json`,
    );
    assert.equal(Object.isFrozen(generation), true);
  });

  it("refuses malformed generation identities and binds the context separator", async () => {
    const { generation } = builtFixture();
    const generationId = await registryGenerationId(generation);
    const unseparatedDigest = createHash("sha256")
      .update(registryGenerationCanonicalJson(generation), "utf8")
      .digest("hex");
    assert.notEqual(
      generationId,
      unseparatedDigest,
    );
    assert.throws(() => registryGenerationFileName(""));
    assert.throws(() => registryGenerationFileName("A".repeat(64)));
    assert.throws(() => registryGenerationFileName("../generation"));
  });

  it("refuses empty input, incomplete custody, duplicate packages, and stale index time", () => {
    const key = hybridKey();
    const base = {
      delegationSerial: 2,
      operationalPublicBundle: key.publicBundle,
      registry: "https://registry.galerina.dev",
      issuedAt: "2026-08-02T00:00:00.000Z",
      custody: key.custody,
    };
    assert.throws(() => buildRegistryGeneration({
      ...base,
      unsignedManifests: [],
    }));
    assert.throws(() => buildRegistryGeneration({
      ...base,
      unsignedManifests: [unsignedManifest(), unsignedManifest()],
    }));
    assert.throws(() => buildRegistryGeneration({
      ...base,
      unsignedManifests: [unsignedManifest()],
      custody: { signHybrid: () => null },
    }));
    assert.throws(() => buildRegistryGeneration({
      ...base,
      issuedAt: "not-a-canonical-instant",
      unsignedManifests: [unsignedManifest()],
    }));
    assert.throws(() => buildRegistryGeneration({
      ...base,
      unsignedManifests: [{
        ...unsignedManifest(),
        artifactFiles: ["../outside-the-package"],
      }],
    }));

    const generation = buildRegistryGeneration({
      ...base,
      unsignedManifests: [unsignedManifest()],
    });
    assert.throws(() => verifyRegistryGeneration(generation, {
      expectedDelegationSerial: 2,
      publicBundle: key.publicBundle,
      minIndexIssuedAt: generation.index.issuedAt,
    }));
  });

  it("refuses substituted keys and mutation of either signed layer", () => {
    const { key, generation } = builtFixture();
    const attacker = hybridKey("cccccccccccccccc");
    const options = {
      expectedDelegationSerial: 2,
      publicBundle: key.publicBundle,
      minIndexIssuedAt: "2026-07-30T16:33:10.307Z",
    };
    assert.throws(() => verifyRegistryGeneration(generation, {
      ...options,
      publicBundle: {
        ...attacker.publicBundle,
        keyId: KEY_ID,
      },
    }));
    assert.throws(() => verifyRegistryGeneration({
      ...generation,
      manifests: [{
        ...generation.manifests[0],
        riskRating: "critical",
      }],
    }, options));
    assert.throws(() => verifyRegistryGeneration({
      ...generation,
      index: {
        ...generation.index,
        entries: [{
          ...generation.index.entries[0],
          sourceHash: `sha256:${"5".repeat(64)}`,
        }],
      },
    }, options));
    assert.throws(() => verifyRegistryGeneration({
      ...generation,
      delegationSerial: 3,
    }, options));
  });

  it("publishes, re-opens, and independently verifies an immutable generation", async () => {
    const directory = await mkdtemp(join(tmpdir(), "galerina-generation-"));
    try {
      const { key, generation } = builtFixture();
      const verify = {
        expectedDelegationSerial: 2,
        publicBundle: key.publicBundle,
        minIndexIssuedAt: "2026-07-30T16:33:10.307Z",
      };
      let barriers = 0;
      const durabilityAdapter = hostEvidenceAdapter(async () => {
        barriers += 1;
        return true;
      });
      const receipt = await persistRegistryGeneration({
        directory,
        generation,
        verify,
        durabilityAdapter,
      });
      assert.equal(isPersistedRegistryGeneration(receipt), true);
      assert.equal(
        isProductionAdmittedRegistryGeneration(receipt),
        false,
      );
      assert.match(receipt.generationId, /^[0-9a-f]{64}$/);
      assert.equal(receipt.delegationSerial, 2);
      assert.equal(receipt.operationalKeyId, KEY_ID);
      assert.equal(barriers, 1);
      const bytes = await readFile(receipt.path, "utf8");
      assert.equal(bytes, registryGenerationCanonicalJson(generation));

      const restored = await loadRegistryGeneration({
        directory,
        generationId: receipt.generationId,
        verify,
      });
      assert.equal(isVerifiedRegistryGeneration(restored), true);
      assert.equal(isPersistedRegistryGeneration(restored), false);
      assert.equal(restored.generationId, receipt.generationId);
      assert.equal(
        registryGenerationCanonicalJson(restored.generation),
        registryGenerationCanonicalJson(generation),
      );

      const idempotent = await persistRegistryGeneration({
        directory,
        generation,
        verify,
        durabilityAdapter,
      });
      assert.equal(idempotent.generationId, receipt.generationId);
      assert.equal(isPersistedRegistryGeneration(idempotent), true);
      assert.equal(barriers, 2);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("refuses non-durable publication, existing-different bytes, and mutation", async () => {
    const directory = await mkdtemp(join(tmpdir(), "galerina-generation-"));
    try {
      const { key, generation } = builtFixture();
      const generationId = await registryGenerationId(generation);
      const fileName = registryGenerationFileName(generationId);
      const verify = {
        expectedDelegationSerial: 2,
        publicBundle: key.publicBundle,
        minIndexIssuedAt: "2026-07-30T16:33:10.307Z",
      };
      await writeFile(join(directory, fileName), "{}", {
        flag: "wx",
      });
      await assert.rejects(() => persistRegistryGeneration({
        directory,
        generation,
        verify,
        durabilityAdapter: hostEvidenceAdapter(async () => true),
      }));
      await rm(join(directory, fileName));

      await assert.rejects(() => persistRegistryGeneration({
        directory,
        generation,
        verify,
        durabilityAdapter: hostEvidenceAdapter(async () => false),
      }));
      await assert.rejects(() => loadRegistryGeneration({
        directory,
        generationId,
        verify,
      }));

      const receipt = await persistRegistryGeneration({
        directory,
        generation,
        verify,
        durabilityAdapter: hostEvidenceAdapter(async () => true),
      });
      await chmod(receipt.path, 0o666);
      await writeFile(receipt.path, "{}");
      await assert.rejects(() => loadRegistryGeneration({
        directory,
        generationId: receipt.generationId,
        verify,
      }));
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("refuses relative and reparse-point generation directories", async (test) => {
    const parent = await mkdtemp(join(tmpdir(), "galerina-generation-"));
    try {
      const { key, generation } = builtFixture();
      const verify = {
        expectedDelegationSerial: 2,
        publicBundle: key.publicBundle,
        minIndexIssuedAt: "2026-07-30T16:33:10.307Z",
      };
      await assert.rejects(() => persistRegistryGeneration({
        directory: ".",
        generation,
        verify,
        durabilityAdapter: hostEvidenceAdapter(async () => true),
      }));

      const real = join(parent, "real");
      const linked = join(parent, "linked");
      await mkdir(real);
      try {
        await symlink(real, linked, "junction");
      } catch (error) {
        if (error?.code === "EPERM") {
          test.skip("junction creation is unavailable on this host");
          return;
        }
        throw error;
      }
      await assert.rejects(() => persistRegistryGeneration({
        directory: linked,
        generation,
        verify,
        durabilityAdapter: hostEvidenceAdapter(async () => true),
      }));
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  });

  it("refuses a structurally forged host-evidence adapter", async () => {
    const directory = await mkdtemp(join(tmpdir(), "galerina-generation-"));
    try {
      const { key, generation } = builtFixture();
      await assert.rejects(() => persistRegistryGeneration({
        directory,
        generation,
        verify: {
          expectedDelegationSerial: 2,
          publicBundle: key.publicBundle,
          minIndexIssuedAt: "2026-07-30T16:33:10.307Z",
        },
        durabilityAdapter: {
          adapterId: "galerina.test.host-evidence.v1",
          sourceDigest: HOST_EVIDENCE_DIGEST,
          flushDirectory: async () => true,
        },
      }), /durability adapter is not an issued capability/);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});

describe("statically linked production generation seam", () => {
  it("binds the exact running host, consumes its native brand once, and reopens exact bytes", async () => {
    const directory = await mkdtemp(join(tmpdir(), "galerina-linked-production-"));
    try {
      const { key, generation } = builtFixture();
      const generationId = await registryGenerationId(generation);
      const executableDigest = `sha256:${createHash("sha256")
        .update(await readFile(process.execPath))
        .digest("hex")}`;
      const sourceDigest = `sha256:${"c".repeat(64)}`;
      const repositoryCommit = "a".repeat(40);
      const evidenceId = `sha256:${"1".repeat(64)}`;
      const storageProfileDigest = `sha256:${"2".repeat(64)}`;
      const verifiedEvidence = verifyRegistryDurabilityEvidence({
        schema: "galerina.registry.durability.evidence.v1",
        evidenceClass: "PRODUCTION_ADMISSION",
        evidenceId,
        repositoryCommit,
        platform: "windows",
        architecture: "x86_64",
        operatingSystem: "windows-10",
        filesystem: "ntfs",
        storageProfileDigest,
        implementationDigest: sourceDigest,
        boundaryIds: ["DIRECTORY_BARRIER", "FILE_BARRIER", "PROCESS_TERMINATION"],
        checks: {
          controlledPowerLoss: "PASS",
          controlledReboot: "PASS",
          functionalPortability: "PASS",
          nativeLive: "PASS",
          processTermination: "PASS",
          productionAdmission: "PASS",
        },
        authenticated: false,
        authorityReleased: false,
        productionAuthorizing: false,
        verdict: 0,
      }, {
        expectedRepositoryCommit: repositoryCommit,
        expectedPlatform: "windows",
        expectedArchitecture: "x86_64",
        expectedOperatingSystem: "windows-10",
        requiredBoundaryIds: ["DIRECTORY_BARRIER", "FILE_BARRIER", "PROCESS_TERMINATION"],
      });
      const candidate = admitRegistryDurabilityProfile({
        schema: "galerina.registry.durability.production-manifest.v1",
        adapterId: "galerina.registry.durability.windows.v1",
        sourceDigest,
        contractDigest: `sha256:${"4".repeat(64)}`,
        binaryDigest: executableDigest,
        buildRecipeDigest: `sha256:${"6".repeat(64)}`,
        toolchainDigest: `sha256:${"7".repeat(64)}`,
        evidenceId,
        repositoryCommit,
        platform: "windows",
        architecture: "x86_64",
        operatingSystem: "windows-10",
        filesystem: "ntfs",
        storageProfileDigest,
        generationId,
        operationalKeyId: KEY_ID,
        delegationSerial: 2,
        indexIssuedAt: generation.index.issuedAt,
        acceptedCheckpointDigest: `sha256:${"8".repeat(64)}`,
        notBefore: "2026-08-01T00:00:00.000Z",
        notAfter: "2026-08-03T00:00:00.000Z",
        rootSignature: {
          algorithm: "Ed25519+ML-DSA-65",
          keyId: "offline-root-v1",
          ed25519Signature: "ed25519-test",
          mlDsa65Signature: "mldsa65-test",
          canon: "jcs",
          context: "galerina.registry.durability.production.sig.v1",
        },
      }, verifiedEvidence, {
        schema: "galerina.registry.durability.production-authority.v1",
        expectedRootKeyId: "offline-root-v1",
        expectedOperationalKeyId: KEY_ID,
        at: "2026-08-02T12:00:00.000Z",
        minDelegationSerial: 1,
        isRevoked: () => false,
        verifyRootEd25519: () => true,
        verifyRootMlDsa65: () => true,
      });

      await assert.rejects(
        () => publishRegistryGenerationWithLinkedHost({
          directory,
          generation,
          verify: {
            expectedDelegationSerial: 2,
            publicBundle: key.publicBundle,
            minIndexIssuedAt: "2026-07-30T16:33:10.307Z",
          },
          durabilityProfile: candidate,
        }),
        /not owner-released/,
      );

      const nativeReceipts = new WeakSet();
      const binding = Object.freeze({
        publishGeneration: async (target, requestedId, bytes) => {
          await writeFile(
            join(target, registryGenerationFileName(requestedId)),
            bytes,
            { flag: "wx", mode: 0o444 },
          );
          const receipt = Object.freeze({
            schema: "galerina.registry.production-host-result.v1",
            verdict: 1,
            reason: "NONE",
            platform: "windows",
            generationId: requestedId,
            byteLength: bytes.length,
            adapterSourceSha256: sourceDigest.slice("sha256:".length),
            hostKind: "STATIC_LINKED_NODE",
            productionAuthorizing: false,
          });
          nativeReceipts.add(receipt);
          return receipt;
        },
        isReceipt: (receipt) => {
          if (!nativeReceipts.has(receipt)) return false;
          nativeReceipts.delete(receipt);
          return true;
        },
      });
      Object.defineProperty(process, "_galerinaLinkedBinding", {
        value: Object.freeze(() => binding),
        configurable: false,
        enumerable: false,
        writable: false,
      });

      const persisted = await publishRegistryGenerationWithLinkedHost({
        directory,
        generation,
        verify: {
          expectedDelegationSerial: 2,
          publicBundle: key.publicBundle,
          minIndexIssuedAt: "2026-07-30T16:33:10.307Z",
        },
        durabilityProfile: activateRegistryDurabilityProfile(
          candidate,
          {
            schema: "galerina.registry.durability.production-release.v1",
            releaseId: "galerina-beta-v1-release-1",
            ownerKeyId: "owner-release-key",
            targetEvidenceId: candidate.evidenceId,
            targetGenerationId: candidate.generationId,
            issuedAt: candidate.indexIssuedAt,
            notBefore: candidate.indexIssuedAt,
            notAfter: candidate.notAfter,
            signature: "owner-release-test",
            canon: "jcs",
            context: "galerina.registry.durability.production.release.v1",
          },
          (message, signature, keyId) =>
            message.length > 0
            && signature === "owner-release-test"
            && keyId === "owner-release-key",
          Date.parse(candidate.indexIssuedAt) + 60_000,
        ),
      });
      assert.equal(isPersistedRegistryGeneration(persisted), true);
      assert.equal(isProductionAdmittedRegistryGeneration(persisted), true);
      assert.equal(persisted.generationId, generationId);
      assert.equal(persisted.durabilityAdapterDigest, sourceDigest);
      assert.equal(
        await readFile(join(directory, registryGenerationFileName(generationId)), "utf8"),
        registryGenerationCanonicalJson(generation),
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("hostile: publication chmod is applied to the staging handle, not a replaceable pathname", () => {
    const src = readFileSync(
      join(import.meta.dirname, "../src/registry-generation-store.ts"),
      "utf8",
    );
    assert.match(src, /handle = await fs\.open\(stagingPath, "wx"/);
    assert.match(src, /await handle\.chmod\(0o444\)/);
    assert.doesNotMatch(src, /await fs\.chmod\(/);
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  admitRegistryDurabilityProfile,
  activateRegistryDurabilityProfile,
  isReleasedRegistryDurabilityProfile,
  isProductionRegistryDurabilityProfile,
  registryDurabilityProfileMatchesRotation,
  verifyRegistryDurabilityEvidence,
} from "../dist/index.js";

const DIGEST = (value) => `sha256:${value.repeat(64)}`;
const COMMIT = "a".repeat(40);
const BOUNDARIES = Object.freeze([
  "DIRECTORY_BARRIER",
  "FILE_BARRIER",
  "PROCESS_TERMINATION",
]);

function evidence() {
  return verifyRegistryDurabilityEvidence({
    schema: "galerina.registry.durability.evidence.v1",
    evidenceClass: "PRODUCTION_ADMISSION",
    evidenceId: DIGEST("1"),
    repositoryCommit: COMMIT,
    platform: "windows",
    architecture: "x86_64",
    operatingSystem: "windows-10",
    filesystem: "ntfs",
    storageProfileDigest: DIGEST("2"),
    implementationDigest: DIGEST("3"),
    boundaryIds: [...BOUNDARIES],
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
    expectedRepositoryCommit: COMMIT,
    expectedPlatform: "windows",
    expectedArchitecture: "x86_64",
    expectedOperatingSystem: "windows-10",
    requiredBoundaryIds: [...BOUNDARIES],
  });
}

function manifest(overrides = {}) {
  return {
    schema: "galerina.registry.durability.production-manifest.v1",
    adapterId: "galerina.registry.durability.windows.v1",
    sourceDigest: DIGEST("3"),
    contractDigest: DIGEST("4"),
    binaryDigest: DIGEST("5"),
    buildRecipeDigest: DIGEST("6"),
    toolchainDigest: DIGEST("7"),
    evidenceId: DIGEST("1"),
    repositoryCommit: COMMIT,
    platform: "windows",
    architecture: "x86_64",
    operatingSystem: "windows-10",
    filesystem: "ntfs",
    storageProfileDigest: DIGEST("2"),
    generationId: "b".repeat(64),
    operationalKeyId: "f31-example-public-id",
    delegationSerial: 7,
    indexIssuedAt: "2026-08-01T18:00:00.000Z",
    acceptedCheckpointDigest: DIGEST("8"),
    notBefore: "2026-08-01T00:00:00.000Z",
    notAfter: "2026-08-02T00:00:00.000Z",
    rootSignature: {
      algorithm: "Ed25519+ML-DSA-65",
      keyId: "offline-root-v1",
      ed25519Signature: "ed25519-public-test-signature",
      mlDsa65Signature: "mldsa65-public-test-signature",
      canon: "jcs",
      context: "galerina.registry.durability.production.sig.v1",
    },
    ...overrides,
  };
}

function authority(overrides = {}) {
  return {
    schema: "galerina.registry.durability.production-authority.v1",
    expectedRootKeyId: "offline-root-v1",
    expectedOperationalKeyId: "f31-example-public-id",
    at: "2026-08-01T19:00:00.000Z",
    minDelegationSerial: 6,
    isRevoked: () => false,
    verifyRootEd25519: (message, signature, keyId) =>
      message.length > 0
      && signature === "ed25519-public-test-signature"
      && keyId === "offline-root-v1",
    verifyRootMlDsa65: (message, signature, keyId) =>
      message.length > 0
      && signature === "mldsa65-public-test-signature"
      && keyId === "offline-root-v1",
    ...overrides,
  };
}

function releaseAuthorization(overrides = {}) {
  return {
    schema: "galerina.registry.durability.production-release.v1",
    releaseId: "galerina-beta-v1-release-1",
    ownerKeyId: "owner-release-key",
    targetEvidenceId: DIGEST("1"),
    targetGenerationId: "b".repeat(64),
    issuedAt: "2026-08-01T18:30:00.000Z",
    notBefore: "2026-08-01T18:30:00.000Z",
    notAfter: "2026-08-01T20:00:00.000Z",
    signature: "owner-release-test",
    canon: "jcs",
    context: "galerina.registry.durability.production.release.v1",
    ...overrides,
  };
}

describe("production registry durability composition", () => {
  it("issues one private, frozen profile only after both root components verify", () => {
    const profile = admitRegistryDurabilityProfile(
      manifest(),
      evidence(),
      authority(),
    );
    assert.equal(isProductionRegistryDurabilityProfile(profile), true);
    assert.equal(Object.isFrozen(profile), true);
    assert.equal(profile.generationId, "b".repeat(64));
    assert.equal(profile.rootKeyId, "offline-root-v1");
    assert.equal(profile.operationalKeyId, "f31-example-public-id");
    assert.equal(profile.minDelegationSerial, 6);
    assert.equal(profile.notBefore, "2026-08-01T00:00:00.000Z");
    assert.equal(profile.productionAuthorizing, false);
    assert.equal(profile.authorityReleased, false);
    assert.equal(profile.authenticated, true);
    assert.equal(isProductionRegistryDurabilityProfile({ ...profile }), false);
  });

  it("releases authority only through a separate owner-signed exact-profile authorization", () => {
    const candidate = admitRegistryDurabilityProfile(manifest(), evidence(), authority());
    const released = activateRegistryDurabilityProfile(
      candidate,
      releaseAuthorization(),
      (message, signature, keyId) =>
        message.length > 0
        && signature === "owner-release-test"
        && keyId === "owner-release-key",
      Date.parse("2026-08-01T19:30:00.000Z"),
    );
    assert.equal(isReleasedRegistryDurabilityProfile(released), true);
    assert.equal(Object.isFrozen(released), true);
    assert.equal(released.authorityReleased, true);
    assert.equal(released.productionAuthorizing, true);
    assert.equal(released.releaseId, "galerina-beta-v1-release-1");
    assert.equal(released.ownerKeyId, "owner-release-key");
    assert.equal(released.releasedAt, "2026-08-01T19:30:00.000Z");
  });

  it("refuses copied candidates, mismatched targets, stale windows and failed owner verifiers", () => {
    const candidate = admitRegistryDurabilityProfile(manifest(), evidence(), authority());
    const now = Date.parse("2026-08-01T19:30:00.000Z");
    const verifier = () => true;
    assert.throws(
      () => activateRegistryDurabilityProfile({ ...candidate }, releaseAuthorization(), verifier, now),
      /REGISTRY_DURABILITY_PRODUCTION_/u,
    );
    for (const changed of [
      { targetEvidenceId: DIGEST("9") },
      { targetGenerationId: "c".repeat(64) },
      { notAfter: "2026-08-01T19:00:00.000Z" },
      { notAfter: "2026-08-03T00:00:00.000Z" },
      { ownerKeyId: candidate.operationalKeyId },
    ]) {
      assert.throws(
        () => activateRegistryDurabilityProfile(candidate, releaseAuthorization(changed), verifier, now),
        /REGISTRY_DURABILITY_PRODUCTION_/u,
      );
    }
    assert.throws(
      () => activateRegistryDurabilityProfile(candidate, releaseAuthorization(), () => false, now),
      /REGISTRY_DURABILITY_PRODUCTION_/u,
    );
  });

  it("refuses copied evidence, stale authority, revocation, and either missing signature verifier", () => {
    const verified = evidence();
    const cases = [
      [manifest(), { ...verified }, authority()],
      [manifest(), verified, authority({ at: "2026-08-03T00:00:00.000Z" })],
      [manifest(), verified, authority({ isRevoked: () => true })],
      [manifest(), verified, authority({ verifyRootEd25519: () => false })],
      [manifest(), verified, authority({ verifyRootMlDsa65: () => "no-key" })],
      [manifest({ delegationSerial: 6 }), verified, authority()],
      [manifest({ indexIssuedAt: "2026-08-01T20:00:00.000Z" }), verified, authority()],
    ];
    for (const values of cases) {
      assert.throws(
        () => admitRegistryDurabilityProfile(...values),
        /REGISTRY_DURABILITY_PRODUCTION_/u,
      );
    }
  });

  it("refuses mixed platform, implementation, storage, evidence, and operational identities", () => {
    const verified = evidence();
    for (const changed of [
      { platform: "linux" },
      { sourceDigest: DIGEST("9") },
      { storageProfileDigest: DIGEST("9") },
      { evidenceId: DIGEST("9") },
      { operationalKeyId: "another-operational-key" },
    ]) {
      assert.throws(
        () => admitRegistryDurabilityProfile(
          manifest(changed),
          verified,
          authority(),
        ),
        /REGISTRY_DURABILITY_PRODUCTION_/u,
      );
    }
  });

  it("binds generation, key, delegation, index, adapter, checkpoint, and active window", () => {
    const profile = admitRegistryDurabilityProfile(manifest(), evidence(), authority());
    const candidateGeneration = {
      generationId: "b".repeat(64),
      operationalKeyId: "f31-example-public-id",
      delegationSerial: 7,
      indexIssuedAt: "2026-08-01T18:00:00.000Z",
      durabilityAdapterDigest: DIGEST("3"),
    };
    const input = {
      profile,
      candidateGeneration,
      receipt: { keyId: "f31-example-public-id", delegationSerial: 7 },
      admittedIndex: { issuedAt: "2026-08-01T18:00:00.000Z" },
      acceptedCheckpointDigest: DIGEST("8"),
      authorityAt: "2026-08-01T19:00:00.000Z",
    };
    assert.equal(registryDurabilityProfileMatchesRotation(input), true);
    assert.equal(registryDurabilityProfileMatchesRotation({
      ...input,
      profile: { ...profile },
    }), false);
    for (const changed of [
      { candidateGeneration: { ...candidateGeneration, generationId: "c".repeat(64) } },
      { receipt: { ...input.receipt, delegationSerial: 8 } },
      { admittedIndex: { issuedAt: "2026-08-01T18:00:01.000Z" } },
      { acceptedCheckpointDigest: DIGEST("9") },
      { authorityAt: "2026-08-03T00:00:00.000Z" },
    ]) {
      assert.equal(
        registryDurabilityProfileMatchesRotation({ ...input, ...changed }),
        false,
      );
    }
  });
});

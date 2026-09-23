import assert from "node:assert/strict";
import {
  generateKeyPairSync,
  sign as edSign,
} from "node:crypto";
import { describe, it } from "node:test";
import { ml_dsa65 as mlDsa65 } from "@noble/post-quantum/ml-dsa.js";

import {
  activeEpoch,
  beginRotation,
  buildRegistryRotationTransition,
  checkReadiness,
  commitTripleLock,
  confirmDrain,
  confirmTripleVerify,
  createKeyRing,
  createRegistryRotationContext,
  registryRotationKeyCommit,
  restoreRegistryRotationCheckpoint,
  retireOldEpoch,
  sealRegistryRotationCheckpoint,
  stageCandidate,
  switchEpoch,
} from "../dist/index.js";

const RING_KEY = new Uint8Array(32).fill(0x61);
const ROTATION_CONTEXT = new TextEncoder().encode(
  "galerina.registry.rotation.proof.v1",
);
const HEAD = "f".repeat(64);
const VOTES = [
  { signer: "owner-a", verdict: 1 },
  { signer: "owner-b", verdict: 1 },
];

function hybridKey(keyId) {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const mlSecretKey = mlDsa65.keygen().secretKey;
  return {
    keyId,
    publicBundle: {
      keyId,
      ed25519PublicKeyPem: publicKey.export({
        type: "spki",
        format: "pem",
      }).toString(),
      mlDsa65PublicKey: mlDsa65.getPublicKey(mlSecretKey),
    },
    sign(message) {
      return {
        ed25519: Buffer.from(edSign(null, message, privateKey)).toString("base64"),
        mlDsa65: Buffer.from(
          mlDsa65.sign(message, mlSecretKey, {
            context: ROTATION_CONTEXT,
          }),
        ).toString("base64"),
      };
    },
  };
}

function fixture() {
  const oldKey = hybridKey("1111111111111111");
  const newKey = hybridKey("2222222222222222");
  const keys = new Map([
    [oldKey.keyId, oldKey],
    [newKey.keyId, newKey],
  ]);
  const custody = {
    signHybrid(keyId, message) {
      return keys.get(keyId)?.sign(message) ?? null;
    },
  };
  const ring = createKeyRing(RING_KEY, {
    keyId: oldKey.keyId,
    keyKind: "asymmetric",
    keyCommit: registryRotationKeyCommit(oldKey.publicBundle),
    fileRef: `custody://registry/${oldKey.keyId}`,
    createdTick: 1,
  });
  const candidate = {
    keyId: newKey.keyId,
    keyKind: "asymmetric",
    keyCommit: registryRotationKeyCommit(newKey.publicBundle),
    fileRef: `custody://registry/${newKey.keyId}`,
    createdTick: 2,
  };
  return { oldKey, newKey, custody, ring, candidate };
}

describe("registry rotation cryptographic adapter", () => {
  it("drives the existing phase machine using real hybrid evidence", () => {
    const value = fixture();
    let process = beginRotation(value.ring);
    let outcome = checkReadiness(
      process,
      { auditRunsMidFlight: 0, queueDepth: 0, maxQueueDepth: 4 },
      { verifyCurrentChain: () => true },
    );
    assert.equal(outcome.decision.authorized, true);
    process = outcome.process;

    outcome = stageCandidate(process, RING_KEY, value.candidate);
    assert.equal(outcome.decision.authorized, true);
    process = outcome.process;

    const transition = buildRegistryRotationTransition({
      fromEpoch: 1,
      toEpoch: 2,
      atTick: 3,
      prevChainHead: HEAD,
      oldKey: value.oldKey.publicBundle,
      newKey: value.newKey.publicBundle,
      custody: value.custody,
    });
    const context = createRegistryRotationContext({
      transition,
      oldKey: value.oldKey.publicBundle,
      newKey: value.newKey.publicBundle,
      custody: value.custody,
      verifyCurrentChain: () => true,
      verifyForwardProbe: () => true,
      verifyBackwardSample: () => true,
    });
    assert.equal(context.verifyCandidateRoundTrip(), true);
    assert.equal(context.verifyTransitionMacOld(), true);
    assert.equal(context.verifyTransitionMacNew(), true);
    outcome = commitTripleLock(
      process,
      RING_KEY,
      transition,
      HEAD,
      VOTES,
      2,
      context,
    );
    assert.equal(outcome.decision.authorized, true);
    process = outcome.process;

    process = switchEpoch(process, RING_KEY, 4).process;
    process = confirmTripleVerify(
      process,
      {
        firstNewBatchPrevHash: HEAD,
        lastOldBatchHash: HEAD,
        cleanBatches: 3,
        canaryN: 3,
      },
      context,
    ).process;
    process = confirmDrain(
      process,
      { oldEpochPendingSigning: 0, oldEpochInFlight: 0 },
      VOTES,
      2,
    ).process;
    process = retireOldEpoch(
      process,
      RING_KEY,
      { mode: "destroy-private" },
      5,
    ).process;

    assert.equal(process.phase, "retired");
    assert.equal(activeEpoch(process.ring)?.keyId, value.newKey.keyId);
    assert.equal(process.ring.epochs[0].status, "retired");
  });

  it("refuses substituted public keys, transition tampering, and unavailable custody", () => {
    const value = fixture();
    const transition = buildRegistryRotationTransition({
      fromEpoch: 1,
      toEpoch: 2,
      atTick: 3,
      prevChainHead: HEAD,
      oldKey: value.oldKey.publicBundle,
      newKey: value.newKey.publicBundle,
      custody: value.custody,
    });
    const tampered = { ...transition, prevChainHead: "0".repeat(64) };
    const substituted = {
      ...value.newKey.publicBundle,
      ed25519PublicKeyPem: value.oldKey.publicBundle.ed25519PublicKeyPem,
    };
    const tamperedContext = createRegistryRotationContext({
      transition: tampered,
      oldKey: value.oldKey.publicBundle,
      newKey: value.newKey.publicBundle,
      custody: value.custody,
      verifyCurrentChain: () => true,
      verifyForwardProbe: () => true,
      verifyBackwardSample: () => true,
    });
    const substitutedContext = createRegistryRotationContext({
      transition,
      oldKey: value.oldKey.publicBundle,
      newKey: substituted,
      custody: value.custody,
      verifyCurrentChain: () => true,
      verifyForwardProbe: () => true,
      verifyBackwardSample: () => true,
    });
    const absentContext = createRegistryRotationContext({
      transition,
      oldKey: value.oldKey.publicBundle,
      newKey: value.newKey.publicBundle,
      custody: { signHybrid: () => null },
      verifyCurrentChain: () => true,
      verifyForwardProbe: () => true,
      verifyBackwardSample: () => true,
    });

    assert.equal(tamperedContext.verifyTransitionMacOld(), false);
    assert.equal(tamperedContext.verifyTransitionMacNew(), false);
    assert.equal(substitutedContext.verifyCandidateRoundTrip(), false);
    assert.equal(absentContext.verifyCandidateRoundTrip(), false);
  });

  it("the trigger proposes only and refuses malformed or rollback schedules", async () => {
    const { registryRotationTriggerVerdict } = await import("../dist/index.js");
    assert.equal(
      registryRotationTriggerVerdict({
        nowTick: 100,
        activeSinceTick: 10,
        rotateAfterTicks: 80,
        signedArtifacts: 2,
        maxSignedArtifacts: 100,
      }),
      1,
    );
    assert.equal(
      registryRotationTriggerVerdict({
        nowTick: 20,
        activeSinceTick: 10,
        rotateAfterTicks: 80,
        signedArtifacts: 2,
        maxSignedArtifacts: 100,
      }),
      0,
    );
    assert.equal(
      registryRotationTriggerVerdict({
        nowTick: 5,
        activeSinceTick: 10,
        rotateAfterTicks: 80,
        signedArtifacts: -1,
        maxSignedArtifacts: 100,
      }),
      -1,
    );
  });

  it("authenticates crash/restart state and enforces external rollback floors", () => {
    const value = fixture();
    const process = beginRotation(value.ring);
    const checkpoint = sealRegistryRotationCheckpoint({
      process,
      delegationSerialFloor: 2,
      indexIssuedAtFloor: "2026-07-01T00:00:00.000Z",
      acceptedDelegationSerial: 3,
      acceptedIndexIssuedAt: "2026-08-01T00:00:00.000Z",
      acceptedGenerationId: "a".repeat(64),
    }, RING_KEY);
    const restored = restoreRegistryRotationCheckpoint(
      checkpoint,
      RING_KEY,
      {
        minEpochId: 1,
        minDelegationSerialFloor: 2,
        minIndexIssuedAtFloor: "2026-07-01T00:00:00.000Z",
        minAcceptedDelegationSerial: 3,
        minAcceptedIndexIssuedAt: "2026-08-01T00:00:00.000Z",
        expectedAcceptedGenerationId: "a".repeat(64),
      },
    );
    assert.equal(restored.process.phase, "idle");
    assert.equal(restored.delegationSerialFloor, 2);
    assert.equal(restored.acceptedDelegationSerial, 3);
    assert.equal(restored.acceptedGenerationId, "a".repeat(64));
    assert.equal(Object.isFrozen(restored), true);

    assert.throws(() => restoreRegistryRotationCheckpoint(
      { ...checkpoint, hmac: "0".repeat(64) },
      RING_KEY,
      {
        minEpochId: 1,
        minDelegationSerialFloor: 2,
        minIndexIssuedAtFloor: "2026-07-01T00:00:00.000Z",
        minAcceptedDelegationSerial: 3,
        minAcceptedIndexIssuedAt: "2026-08-01T00:00:00.000Z",
        expectedAcceptedGenerationId: "a".repeat(64),
      },
    ));
    assert.throws(() => restoreRegistryRotationCheckpoint(
      checkpoint,
      RING_KEY,
      {
        minEpochId: 2,
        minDelegationSerialFloor: 2,
        minIndexIssuedAtFloor: "2026-07-01T00:00:00.000Z",
        minAcceptedDelegationSerial: 3,
        minAcceptedIndexIssuedAt: "2026-08-01T00:00:00.000Z",
        expectedAcceptedGenerationId: "a".repeat(64),
      },
    ));
    assert.throws(() => restoreRegistryRotationCheckpoint(
      checkpoint,
      RING_KEY,
      {
        minEpochId: 1,
        minDelegationSerialFloor: 3,
        minIndexIssuedAtFloor: "2026-07-01T00:00:00.000Z",
        minAcceptedDelegationSerial: 3,
        minAcceptedIndexIssuedAt: "2026-08-01T00:00:00.000Z",
        expectedAcceptedGenerationId: "a".repeat(64),
      },
    ));
    assert.throws(() => restoreRegistryRotationCheckpoint(
      checkpoint,
      RING_KEY,
      {
        minEpochId: 1,
        minDelegationSerialFloor: 2,
        minIndexIssuedAtFloor: "2026-07-02T00:00:00.000Z",
        minAcceptedDelegationSerial: 3,
        minAcceptedIndexIssuedAt: "2026-08-01T00:00:00.000Z",
        expectedAcceptedGenerationId: "a".repeat(64),
      },
    ));
    assert.throws(() => restoreRegistryRotationCheckpoint(
      checkpoint,
      RING_KEY,
      {
        minEpochId: 1,
        minDelegationSerialFloor: 2,
        minIndexIssuedAtFloor: "2026-07-01T00:00:00.000Z",
        minAcceptedDelegationSerial: 4,
        minAcceptedIndexIssuedAt: "2026-08-01T00:00:00.000Z",
        expectedAcceptedGenerationId: "a".repeat(64),
      },
    ));
    assert.throws(() => restoreRegistryRotationCheckpoint(
      checkpoint,
      RING_KEY,
      {
        minEpochId: 1,
        minDelegationSerialFloor: 2,
        minIndexIssuedAtFloor: "2026-07-01T00:00:00.000Z",
        minAcceptedDelegationSerial: 3,
        minAcceptedIndexIssuedAt: "2026-08-01T00:00:00.000Z",
        expectedAcceptedGenerationId: "b".repeat(64),
      },
    ));

    const floors = {
      minEpochId: 1,
      minDelegationSerialFloor: 2,
      minIndexIssuedAtFloor: "2026-07-01T00:00:00.000Z",
      minAcceptedDelegationSerial: 3,
      minAcceptedIndexIssuedAt: "2026-08-01T00:00:00.000Z",
      expectedAcceptedGenerationId: "a".repeat(64),
    };
    let reads = 0;
    const swapped = new Proxy(checkpoint, {
      get(target, prop, receiver) {
        if (prop === "payloadJson") {
          reads += 1;
          return reads === 1 ? target.payloadJson : '{"schema":"forged"}';
        }
        return Reflect.get(target, prop, receiver);
      },
    });
    const owned = restoreRegistryRotationCheckpoint(swapped, RING_KEY, floors);
    assert.equal(owned.acceptedGenerationId, "a".repeat(64));
    assert.ok(reads >= 1);
    assert.throws(
      () => restoreRegistryRotationCheckpoint(
        new Proxy(checkpoint, {
          get(target, prop, receiver) {
            if (prop === "payloadJson") return '{"schema":"forged"}';
            return Reflect.get(target, prop, receiver);
          },
        }),
        RING_KEY,
        floors,
      ),
      /malformed|authentication failed|not JSON|proxy/i,
    );
  });
});

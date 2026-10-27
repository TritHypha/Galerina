import assert from "node:assert/strict";
import {
  readFileSync,
  readdirSync,
} from "node:fs";
import { describe, it } from "node:test";

import {
  ERR_REGISTRY_RUNTIME_IO,
  loadRegistryForBootstrap,
  loadProductionRegistry,
  loadProductionRegistryFromRotationState,
  selectRegistryDelegation,
} from "../dist/registry-runtime.js";
import {
  beginRotation,
  createKeyRing,
  registryRotationKeyCommit,
  restoreRegistryRotationCheckpoint,
  sealRegistryRotationCheckpoint,
} from "../../galerina-tower-citizen/dist/index.js";

const ROOT_KEY_ID = "21415420b447e219";
const OPERATIONAL_KEY_ID = "f3172a48372bfb23";
const RING_KEY = new Uint8Array(32).fill(0x73);
const generationDirectory = new URL(
  "../../../packages-ts/galerina-registry/generations/",
  import.meta.url,
);
const generationFiles = readdirSync(generationDirectory).filter(
  (name) => /^registry-generation-[0-9a-f]{64}\.json$/u.test(name),
);
assert.equal(generationFiles.length, 1);
const ACCEPTED_GENERATION_ID = generationFiles[0]
  .slice("registry-generation-".length, -".json".length);

function restoredProductionState(
  keyId = OPERATIONAL_KEY_ID,
  acceptedDelegationSerial = 1,
  acceptedIndexIssuedAt = "2026-07-30T16:33:10.307Z",
  acceptedGenerationId = ACCEPTED_GENERATION_ID,
) {
  const governanceRoot = new URL("../../../governance/", import.meta.url);
  const ed25519PublicKeyPem = readFileSync(
    new URL(`signing-key-${OPERATIONAL_KEY_ID}.pub.pem`, governanceRoot),
    "utf8",
  );
  const mlDsa65PublicKey = Buffer.from(
    readFileSync(
      new URL(
        `signing-key-${OPERATIONAL_KEY_ID}.mldsa.pub.b64`,
        governanceRoot,
      ),
      "utf8",
    ).trim(),
    "base64",
  );
  const keyCommit = registryRotationKeyCommit({
    keyId: OPERATIONAL_KEY_ID,
    ed25519PublicKeyPem,
    mlDsa65PublicKey,
  });
  const ring = createKeyRing(RING_KEY, {
    keyId,
    keyKind: "asymmetric",
    keyCommit,
    fileRef: `custody://registry/${keyId}`,
    createdTick: 1,
  });
  const checkpoint = sealRegistryRotationCheckpoint({
    process: beginRotation(ring),
    delegationSerialFloor: 0,
    indexIssuedAtFloor: "1970-01-01T00:00:00.000Z",
    acceptedDelegationSerial,
    acceptedIndexIssuedAt,
    acceptedGenerationId,
  }, RING_KEY);
  return restoreRegistryRotationCheckpoint(
    checkpoint,
    RING_KEY,
    {
      minEpochId: 1,
      minDelegationSerialFloor: 0,
      minIndexIssuedAtFloor: "1970-01-01T00:00:00.000Z",
      minAcceptedDelegationSerial: acceptedDelegationSerial,
      minAcceptedIndexIssuedAt: acceptedIndexIssuedAt,
      expectedAcceptedGenerationId: acceptedGenerationId,
    },
  );
}

function productionOptions(overrides = {}) {
  return {
    expectedRootKeyId: ROOT_KEY_ID,
    at: "2026-07-30T16:40:00.000Z",
    minDelegationSerial: 0,
    minIndexIssuedAt: "2026-07-30T16:30:00.000Z",
    isRevoked: () => false,
    ...overrides,
  };
}

describe("production registry runtime", () => {
  it("refuses bootstrap while no current signed live index is published", async () => {
    await assert.rejects(
      loadRegistryForBootstrap(productionOptions()),
      (error) => error?.code === ERR_REGISTRY_RUNTIME_IO
        && error?.message === "bootstrap registry index is missing or unreadable.",
    );
  });

  it("caller freshness and revocation scalars cannot revive an absent live index", async () => {
    const denied = [
      productionOptions({ isRevoked: () => true }),
      productionOptions({ minDelegationSerial: 1 }),
      productionOptions({
        minIndexIssuedAt: "2026-07-30T16:33:10.307Z",
      }),
    ];

    for (const options of denied) {
      await assert.rejects(
        loadRegistryForBootstrap(options),
        (error) => error?.code === ERR_REGISTRY_RUNTIME_IO,
      );
    }
  });

  it("binds production loading to authenticated rotation floors and active identity", async () => {
    const state = restoredProductionState();
    const runtime = await loadProductionRegistry({
      expectedRootKeyId: ROOT_KEY_ID,
      rotationState: state,
    });
    assert.equal(runtime.operationalKeyId, OPERATIONAL_KEY_ID);
    assert.equal(runtime.generationId, ACCEPTED_GENERATION_ID);
    assert.deepEqual(
      runtime.admit(
        {
          name: "@galerina/auth",
          version: "1.0.0-beta.2",
          sourceHash:
            "sha256:56f8f08d7d37efa8936b5871582dcab900e7223e69be32361f1ab4dfc4eaee86",
          keyId: OPERATIONAL_KEY_ID,
        },
        {
          allowedLevels: ["uncertified"],
          maxRiskRating: "high",
        },
      ),
      {
        ok: true,
        entry: {
          name: "@galerina/auth",
          version: "1.0.0-beta.2",
          sourceHash:
            "sha256:56f8f08d7d37efa8936b5871582dcab900e7223e69be32361f1ab4dfc4eaee86",
          publisher: "galerina-owner-governance",
          keyId: OPERATIONAL_KEY_ID,
          certificationLevel: "uncertified",
          riskRating: "high",
          capabilities: ["clock.read", "crypto.verify"],
          effects: ["clock.read", "crypto.verify"],
        },
      },
    );

    await assert.rejects(loadProductionRegistryFromRotationState({
      expectedRootKeyId: ROOT_KEY_ID,
      rotationState: { ...state },
    }));
    await assert.rejects(loadProductionRegistryFromRotationState({
      expectedRootKeyId: ROOT_KEY_ID,
      rotationState: restoredProductionState("eeeeeeeeeeeeeeee"),
    }));
    await assert.rejects(loadProductionRegistryFromRotationState({
      expectedRootKeyId: ROOT_KEY_ID,
      rotationState: restoredProductionState(
        OPERATIONAL_KEY_ID,
        2,
      ),
    }));
    await assert.rejects(loadProductionRegistryFromRotationState({
      expectedRootKeyId: ROOT_KEY_ID,
      rotationState: restoredProductionState(
        OPERATIONAL_KEY_ID,
        1,
        "2026-07-30T16:34:00.000Z",
      ),
    }));
    await assert.rejects(loadProductionRegistryFromRotationState({
      expectedRootKeyId: ROOT_KEY_ID,
      rotationState: restoredProductionState(
        OPERATIONAL_KEY_ID,
        1,
        "2026-07-30T16:33:10.307Z",
        "f".repeat(64),
      ),
    }));
  });
});

describe("registry delegation serial selection", () => {
  const governanceRoot = new URL("../../../governance/", import.meta.url);
  const load = (serial) => JSON.parse(readFileSync(
    new URL(
      `registry-delegation-${OPERATIONAL_KEY_ID}-v${serial}.json`,
      governanceRoot,
    ),
    "utf8",
  ));
  const candidates = [load(2), load(1)];

  it("keeps serial 1 until serial 2 becomes active", () => {
    assert.deepEqual(candidates.map((entry) => entry.serial), [2, 1]);
    const at = (instant) =>
      selectRegistryDelegation(candidates, { instant })?.serial;
    assert.equal(at("2026-10-27T15:44:59.999Z"), 1);
    assert.equal(at("2026-10-27T15:45:00.000Z"), 2);
    assert.equal(at("2026-12-01T00:00:00.000Z"), 2);
  });

  it("returns nothing outside every window so the verifier refuses the highest serial", () => {
    assert.equal(
      selectRegistryDelegation(candidates, { instant: "2026-07-01T00:00:00.000Z" }),
      undefined,
    );
    assert.equal(
      selectRegistryDelegation(candidates, { instant: "2027-02-01T00:00:00.000Z" }),
      undefined,
    );
    assert.equal(selectRegistryDelegation(candidates, { instant: "not a date" }), undefined);
    assert.equal(selectRegistryDelegation(candidates, {}), undefined);
  });

  it("pins the accepted artifact serial regardless of the clock", () => {
    assert.equal(
      selectRegistryDelegation(candidates, { pinnedSerial: 1, instant: "2027-01-01T00:00:00.000Z" })?.serial,
      1,
    );
    assert.equal(selectRegistryDelegation(candidates, { pinnedSerial: 2 })?.serial, 2);
    assert.equal(selectRegistryDelegation(candidates, { pinnedSerial: 3 }), undefined);
  });
});
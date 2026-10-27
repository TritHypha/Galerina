import assert from "node:assert/strict";
import {
  generateKeyPairSync,
  sign as edSign,
} from "node:crypto";
import { describe, it } from "node:test";

import { ml_dsa65 as mlDsa65 } from "@noble/post-quantum/ml-dsa.js";

import {
  createRegistryPublicVerifiers,
} from "../dist/registry-public-verifier.js";

const KEY_ID = "0123456789abcdef";
const CONTEXTS = {
  root: "galerina.registry.delegation.sig.v1",
  operational: "galerina.registry.index.sig.v2",
  packageManifest: "galerina.registry.package.manifest.sig.v1",
  rotation: "galerina.registry.rotation.proof.v1",
  rotationPolicy: "galerina.registry.rotation-policy.sig.v1",
  rotationIssuer: "galerina.registry.delegation.issued.sig.v1",
};

function canonicalBase64(bytes) {
  return Buffer.from(bytes).toString("base64");
}

function fixture(role) {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const mlSecret = mlDsa65.keygen().secretKey;
  const mlPublic = mlDsa65.getPublicKey(mlSecret);
  const message = new TextEncoder().encode(`registry-${role}-fixture`);
  const context = new TextEncoder().encode(CONTEXTS[role]);
  return {
    input: {
      role,
      keyId: KEY_ID,
      ed25519PublicKeyPem: publicKey.export({
        type: "spki",
        format: "pem",
      }).toString(),
      mlDsa65PublicKey: mlPublic,
    },
    message,
    edSignature: canonicalBase64(edSign(null, message, privateKey)),
    mlSignature: canonicalBase64(
      mlDsa65.sign(message, mlSecret, { context }),
    ),
  };
}

describe("registry public verifier", () => {
  for (const role of [
    "root",
    "operational",
    "packageManifest",
    "rotation",
    "rotationPolicy",
    "rotationIssuer",
  ]) {
    it(`verifies both ${role} signature halves with the admitted context`, () => {
      const value = fixture(role);
      const verifier = createRegistryPublicVerifiers(value.input);

      assert.equal(
        verifier.ed25519(value.message, value.edSignature, KEY_ID),
        true,
      );
      assert.equal(
        verifier.mlDsa65(value.message, value.mlSignature, KEY_ID),
        true,
      );
      assert.equal(
        verifier.ed25519(value.message, value.edSignature, "ffffffffffffffff"),
        "no-key",
      );
      assert.equal(
        verifier.mlDsa65(value.message, value.mlSignature, "ffffffffffffffff"),
        "no-key",
      );
    });
  }

  it("refuses tampering, malformed signatures, and cross-role replay", () => {
    const root = fixture("root");
    const operationalVerifier = createRegistryPublicVerifiers({
      ...root.input,
      role: "operational",
    });
    const rootVerifier = createRegistryPublicVerifiers(root.input);
    const tampered = Uint8Array.from(root.message);
    tampered[0] ^= 1;

    assert.equal(
      rootVerifier.ed25519(tampered, root.edSignature, KEY_ID),
      false,
    );
    assert.equal(
      rootVerifier.mlDsa65(tampered, root.mlSignature, KEY_ID),
      false,
    );
    assert.equal(
      rootVerifier.ed25519(root.message, "not-base64", KEY_ID),
      false,
    );
    assert.equal(
      rootVerifier.mlDsa65(root.message, "not-base64", KEY_ID),
      false,
    );
    assert.equal(
      operationalVerifier.mlDsa65(root.message, root.mlSignature, KEY_ID),
      false,
    );
  });

  it("refuses malformed identities and public keys before producing authority", () => {
    const root = fixture("root");
    assert.throws(() => createRegistryPublicVerifiers({
      ...root.input,
      keyId: "../escape",
    }));
    assert.throws(() => createRegistryPublicVerifiers({
      ...root.input,
      ed25519PublicKeyPem: "not a public key",
    }));
    assert.throws(() => createRegistryPublicVerifiers({
      ...root.input,
      mlDsa65PublicKey: new Uint8Array(1),
    }));
  });

  it("keeps the rotation-policy and rotation-issuer contexts from replaying across roles", () => {
    for (const [signedRole, otherRole] of [
      ["rotationPolicy", "root"],
      ["rotationPolicy", "rotationIssuer"],
      ["rotationIssuer", "root"],
      ["rotationIssuer", "operational"],
      ["root", "rotationPolicy"],
    ]) {
      const value = fixture(signedRole);
      const other = createRegistryPublicVerifiers({ ...value.input, role: otherRole });
      assert.equal(other.ed25519(value.message, value.edSignature, KEY_ID), true);
      assert.notEqual(other.mlDsa65(value.message, value.mlSignature, KEY_ID), true);
    }
  });
});

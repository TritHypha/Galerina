import {
  createPublicKey,
  verify as verifyEd25519,
  type KeyObject,
} from "node:crypto";
import { ml_dsa65 as mlDsa65 } from "@noble/post-quantum/ml-dsa.js";

const KEY_ID = /^[0-9a-f]{16}$/;
const CONTEXT = Object.freeze({
  root: new TextEncoder().encode("galerina.registry.delegation.sig.v1"),
  operational: new TextEncoder().encode("galerina.registry.index.sig.v2"),
  packageManifest: new TextEncoder().encode(
    "galerina.registry.package.manifest.sig.v1",
  ),
  rotation: new TextEncoder().encode("galerina.registry.rotation.proof.v1"),
  // Root-signed rotation policy (registry-rotation-policy.ts) and the policy
  // issuer's delegations. Distinct contexts keep these signatures from being
  // replayed as root delegations, index signatures or manifest signatures.
  rotationPolicy: new TextEncoder().encode(
    "galerina.registry.rotation-policy.sig.v1",
  ),
  rotationIssuer: new TextEncoder().encode(
    "galerina.registry.delegation.issued.sig.v1",
  ),
});

export interface RegistryPublicVerifierInput {
  readonly role:
    | "root"
    | "operational"
    | "packageManifest"
    | "rotation"
    | "rotationPolicy"
    | "rotationIssuer";
  readonly keyId: string;
  readonly ed25519PublicKeyPem: string;
  readonly mlDsa65PublicKey: Uint8Array;
}

export type RegistryPublicVerifier = (
  message: Uint8Array,
  signature: string,
  keyId: string,
) => boolean | "no-key";

export interface RegistryPublicVerifiers {
  readonly ed25519: RegistryPublicVerifier;
  readonly mlDsa65: RegistryPublicVerifier;
}

function decodeSignature(
  value: string,
  expectedLength: number,
): Uint8Array | undefined {
  if (
    typeof value !== "string"
    || value.length === 0
    || value.length % 4 !== 0
    || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)
  ) {
    return undefined;
  }
  const bytes = Buffer.from(value, "base64");
  if (
    bytes.length !== expectedLength
    || bytes.toString("base64") !== value
  ) {
    return undefined;
  }
  return bytes;
}

function requireEd25519PublicKey(value: string): KeyObject {
  let key: KeyObject;
  try {
    key = createPublicKey(value);
  } catch {
    throw new TypeError("Registry Ed25519 public key is malformed.");
  }
  if (key.asymmetricKeyType !== "ed25519") {
    throw new TypeError("Registry classical public key must be Ed25519.");
  }
  return key;
}

export function createRegistryPublicVerifiers(
  input: RegistryPublicVerifierInput,
): RegistryPublicVerifiers {
  if (!KEY_ID.test(input.keyId)) {
    throw new TypeError("Registry keyId must be 16 lowercase hexadecimal characters.");
  }
  if (
    input.role !== "root"
    && input.role !== "operational"
    && input.role !== "packageManifest"
    && input.role !== "rotation"
    && input.role !== "rotationPolicy"
    && input.role !== "rotationIssuer"
  ) {
    throw new TypeError("Registry signing role is not admitted.");
  }
  const ed25519PublicKey = requireEd25519PublicKey(
    input.ed25519PublicKeyPem,
  );
  if (
    !(input.mlDsa65PublicKey instanceof Uint8Array)
    || input.mlDsa65PublicKey.length !== mlDsa65.lengths.publicKey
  ) {
    throw new TypeError("Registry ML-DSA-65 public key has the wrong length.");
  }
  const mlDsa65SignatureLength = mlDsa65.lengths.signature;
  if (
    typeof mlDsa65SignatureLength !== "number"
    || !Number.isSafeInteger(mlDsa65SignatureLength)
    || mlDsa65SignatureLength <= 0
  ) {
    throw new TypeError("Registry ML-DSA-65 signature profile is unavailable.");
  }
  const keyId = input.keyId;
  const mlDsa65PublicKey = Uint8Array.from(input.mlDsa65PublicKey);
  const context = CONTEXT[input.role];

  return Object.freeze({
    ed25519(
      message: Uint8Array,
      signature: string,
      requestedKeyId: string,
    ): boolean | "no-key" {
      if (requestedKeyId !== keyId) return "no-key";
      const bytes = decodeSignature(signature, 64);
      if (bytes === undefined) return false;
      try {
        return verifyEd25519(
          null,
          Buffer.from(message),
          ed25519PublicKey,
          bytes,
        ) === true;
      } catch {
        return false;
      }
    },
    mlDsa65(
      message: Uint8Array,
      signature: string,
      requestedKeyId: string,
    ): boolean | "no-key" {
      if (requestedKeyId !== keyId) return "no-key";
      const bytes = decodeSignature(
        signature,
        mlDsa65SignatureLength,
      );
      if (bytes === undefined) return false;
      try {
        return mlDsa65.verify(
          bytes,
          message,
          mlDsa65PublicKey,
          { context },
        ) === true;
      } catch {
        return false;
      }
    },
  });
}

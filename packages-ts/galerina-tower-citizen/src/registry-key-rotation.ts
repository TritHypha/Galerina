import {
  createHash,
  createHmac,
  createPublicKey,
  timingSafeEqual,
} from "node:crypto";
import {
  createRegistryPublicVerifiers,
  type RegistryPublicVerifiers,
} from "./registry-public-verifier.js";
import { Verdict, type GovernanceDiagnostic } from "./three-valued-governance.js";
import type {
  RotationCtx,
  RotationProcess,
  Transition,
} from "./key-rotation.js";
import { verifyRing } from "./key-rotation.js";

const KEY_ID = /^[0-9a-f]{16}$/;
const GENERATION_ID = /^[0-9a-f]{64}$/;
const TRANSITION_CONTEXT = "galerina.registry.rotation.transition.v1";
const CHALLENGE_CONTEXT = "galerina.registry.rotation.challenge.v1";
const restoredRotationStates = new WeakSet<object>();

export interface RegistryRotationPublicBundle {
  readonly keyId: string;
  readonly ed25519PublicKeyPem: string;
  readonly mlDsa65PublicKey: Uint8Array;
}

export interface RegistryRotationHybridSignature {
  readonly ed25519: string;
  readonly mlDsa65: string;
}

export interface RegistryRotationCustody {
  signHybrid(
    keyId: string,
    message: Uint8Array,
  ): RegistryRotationHybridSignature | null;
  /** Idempotently destroy one retired private signing identity. */
  readonly retirePrivate?: (keyId: string) => boolean;
}

export interface RegistryRotationContextOptions {
  readonly transition: Transition;
  readonly oldKey: RegistryRotationPublicBundle;
  readonly newKey: RegistryRotationPublicBundle;
  readonly custody: RegistryRotationCustody;
  readonly verifyCurrentChain: () => boolean;
  readonly verifyForwardProbe: () => boolean;
  readonly verifyBackwardSample: () => boolean;
}

export interface RegistryRotationTrigger {
  readonly nowTick: number;
  readonly activeSinceTick: number;
  readonly rotateAfterTicks: number;
  readonly signedArtifacts: number;
  readonly maxSignedArtifacts: number;
}

export interface RegistryRotationPublicKeyFingerprints {
  readonly ed25519PublicKeySha256: string;
  readonly mlDsa65PublicKeySha256: string;
}

export interface RegistryRotationState {
  readonly process: RotationProcess;
  readonly delegationSerialFloor: number;
  readonly indexIssuedAtFloor: string;
  readonly acceptedDelegationSerial: number;
  readonly acceptedIndexIssuedAt: string;
  readonly acceptedGenerationId: string;
}

export interface RegistryRotationCheckpoint {
  readonly schema: "galerina-registry-rotation-checkpoint/v1";
  readonly payloadJson: string;
  readonly hmac: string;
}

export interface RegistryRotationRollbackFloors {
  readonly minEpochId: number;
  readonly minDelegationSerialFloor: number;
  readonly minIndexIssuedAtFloor: string;
  readonly minAcceptedDelegationSerial: number;
  readonly minAcceptedIndexIssuedAt: string;
  readonly expectedAcceptedGenerationId: string;
}

function validTick(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function strongMacKey(value: Uint8Array): boolean {
  if (!(value instanceof Uint8Array) || value.length < 32) return false;
  for (const byte of value) if (byte !== 0) return true;
  return false;
}

function canonicalInstant(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0) return false;
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds)
    && new Date(milliseconds).toISOString() === value;
}

function transitionWellFormed(value: Transition | null): boolean {
  if (value === null) return true;
  return Number.isSafeInteger(value.fromEpoch)
    && value.fromEpoch >= 1
    && value.toEpoch === value.fromEpoch + 1
    && validTick(value.atTick)
    && /^[0-9a-f]{64}$/.test(value.prevChainHead)
    && typeof value.macOld === "string"
    && value.macOld.length > 0
    && typeof value.macNew === "string"
    && value.macNew.length > 0;
}

function stateWellFormed(
  state: RegistryRotationState,
  ringMacKey: Uint8Array,
): boolean {
  if (
    typeof state !== "object"
    || state === null
    || typeof state.process !== "object"
    || state.process === null
    || !verifyRing(state.process.ring, ringMacKey)
    || !Number.isSafeInteger(state.delegationSerialFloor)
    || state.delegationSerialFloor < 0
    || !canonicalInstant(state.indexIssuedAtFloor)
    || !Number.isSafeInteger(state.acceptedDelegationSerial)
    || state.acceptedDelegationSerial <= state.delegationSerialFloor
    || !canonicalInstant(state.acceptedIndexIssuedAt)
    || Date.parse(state.acceptedIndexIssuedAt)
      <= Date.parse(state.indexIssuedAtFloor)
    || !GENERATION_ID.test(state.acceptedGenerationId)
    || !Array.isArray(state.process.log)
    || state.process.log.length > 1_024
    || state.process.log.some(
      (entry) => typeof entry !== "string" || entry.length > 1_024,
    )
    || !transitionWellFormed(state.process.transition)
  ) {
    return false;
  }
  const phases = [
    "idle",
    "ready",
    "staged",
    "locked",
    "switched",
    "verified",
    "drained",
    "retired",
  ];
  if (!phases.includes(state.process.phase)) return false;
  for (const epoch of state.process.ring.epochs) {
    if (
      (epoch.keyKind !== "symmetric" && epoch.keyKind !== "asymmetric")
      || !["staged", "active", "retired", "revoked"].includes(epoch.status)
      || !validTick(epoch.createdTick)
      || (
        epoch.retiredTick !== null
        && !validTick(epoch.retiredTick)
      )
    ) {
      return false;
    }
  }
  const staged = state.process.ring.epochs.filter(
    (epoch) => epoch.status === "staged",
  ).length;
  if (
    (state.process.phase === "idle" || state.process.phase === "ready")
    && (staged !== 0 || state.process.transition !== null)
  ) {
    return false;
  }
  if (
    state.process.phase === "staged"
    && (staged !== 1 || state.process.transition !== null)
  ) {
    return false;
  }
  if (
    state.process.phase === "locked"
    && (staged !== 1 || state.process.transition === null)
  ) {
    return false;
  }
  if (
    ["switched", "verified", "drained", "retired"].includes(
      state.process.phase,
    )
    && (staged !== 0 || state.process.transition === null)
  ) {
    return false;
  }
  return true;
}

function checkpointMac(
  ringMacKey: Uint8Array,
  payloadJson: string,
): string {
  return createHmac("sha256", ringMacKey)
    .update("galerina.registry.rotation.checkpoint.v1\0", "utf8")
    .update(payloadJson, "utf8")
    .digest("hex");
}

function deepFreeze(value: unknown): void {
  if (
    typeof value !== "object"
    || value === null
    || Object.isFrozen(value)
  ) {
    return;
  }
  for (const child of Object.values(value)) deepFreeze(child);
  Object.freeze(value);
}

export function sealRegistryRotationCheckpoint(
  state: RegistryRotationState,
  ringMacKey: Uint8Array,
): RegistryRotationCheckpoint {
  if (!strongMacKey(ringMacKey) || !stateWellFormed(state, ringMacKey)) {
    throw new TypeError("registry rotation state is not sealable");
  }
  const payloadJson = JSON.stringify(state);
  if (payloadJson.length > 1_048_576) {
    throw new TypeError("registry rotation state exceeds its fixed size bound");
  }
  return Object.freeze({
    schema: "galerina-registry-rotation-checkpoint/v1",
    payloadJson,
    hmac: checkpointMac(ringMacKey, payloadJson),
  });
}

export function restoreRegistryRotationCheckpoint(
  checkpoint: RegistryRotationCheckpoint,
  ringMacKey: Uint8Array,
  floors: RegistryRotationRollbackFloors,
): RegistryRotationState {
  if (
    !strongMacKey(ringMacKey)
    || typeof checkpoint !== "object"
    || checkpoint === null
    || checkpoint.schema !== "galerina-registry-rotation-checkpoint/v1"
    || typeof checkpoint.payloadJson !== "string"
    || checkpoint.payloadJson.length === 0
    || checkpoint.payloadJson.length > 1_048_576
    || typeof checkpoint.hmac !== "string"
    || !/^[0-9a-f]{64}$/.test(checkpoint.hmac)
  ) {
    throw new TypeError("registry rotation checkpoint is malformed");
  }
  const payloadJson = checkpoint.payloadJson;
  const hmac = checkpoint.hmac;
  const expected = Buffer.from(
    checkpointMac(ringMacKey, payloadJson),
    "hex",
  );
  const actual = Buffer.from(hmac, "hex");
  if (
    expected.length !== actual.length
    || !timingSafeEqual(expected, actual)
  ) {
    throw new TypeError("registry rotation checkpoint authentication failed");
  }
  let state: RegistryRotationState;
  try {
    state = JSON.parse(payloadJson) as RegistryRotationState;
  } catch {
    throw new TypeError("registry rotation checkpoint payload is not JSON");
  }
  if (!stateWellFormed(state, ringMacKey)) {
    throw new TypeError("registry rotation checkpoint state is malformed");
  }
  if (
    !Number.isSafeInteger(floors.minEpochId)
    || floors.minEpochId < 1
    || !Number.isSafeInteger(floors.minDelegationSerialFloor)
    || floors.minDelegationSerialFloor < 0
    || !canonicalInstant(floors.minIndexIssuedAtFloor)
    || !Number.isSafeInteger(floors.minAcceptedDelegationSerial)
    || floors.minAcceptedDelegationSerial < 1
    || !canonicalInstant(floors.minAcceptedIndexIssuedAt)
    || !GENERATION_ID.test(floors.expectedAcceptedGenerationId)
    || state.process.ring.epochs.length < floors.minEpochId
    || state.delegationSerialFloor < floors.minDelegationSerialFloor
    || Date.parse(state.indexIssuedAtFloor)
      < Date.parse(floors.minIndexIssuedAtFloor)
    || state.acceptedDelegationSerial
      < floors.minAcceptedDelegationSerial
    || Date.parse(state.acceptedIndexIssuedAt)
      < Date.parse(floors.minAcceptedIndexIssuedAt)
    || state.acceptedGenerationId
      !== floors.expectedAcceptedGenerationId
  ) {
    throw new TypeError("registry rotation checkpoint is below an accepted rollback floor");
  }
  deepFreeze(state);
  restoredRotationStates.add(state);
  return state;
}

export function isRestoredRegistryRotationState(
  value: unknown,
): value is RegistryRotationState {
  return typeof value === "object"
    && value !== null
    && restoredRotationStates.has(value);
}

function encodeSignature(
  value: RegistryRotationHybridSignature | null,
): string {
  if (
    value === null
    || typeof value.ed25519 !== "string"
    || value.ed25519.length === 0
    || typeof value.mlDsa65 !== "string"
    || value.mlDsa65.length === 0
    || value.ed25519.includes(":")
    || value.mlDsa65.includes(":")
  ) {
    throw new TypeError("registry rotation custody returned no complete hybrid proof");
  }
  return `${value.ed25519}:${value.mlDsa65}`;
}

function decodeSignature(
  value: string,
): RegistryRotationHybridSignature | null {
  if (typeof value !== "string") return null;
  const parts = value.split(":");
  if (
    parts.length !== 2
    || parts[0] === undefined
    || parts[0].length === 0
    || parts[1] === undefined
    || parts[1].length === 0
  ) {
    return null;
  }
  return { ed25519: parts[0], mlDsa65: parts[1] };
}

function transitionPreimage(
  transition: Pick<
    Transition,
    "fromEpoch" | "toEpoch" | "atTick" | "prevChainHead"
  >,
): Uint8Array {
  return new TextEncoder().encode(JSON.stringify([
    TRANSITION_CONTEXT,
    transition.fromEpoch,
    transition.toEpoch,
    transition.atTick,
    transition.prevChainHead,
  ]));
}

function challengePreimage(
  bundle: RegistryRotationPublicBundle,
): Uint8Array {
  return new TextEncoder().encode(JSON.stringify([
    CHALLENGE_CONTEXT,
    bundle.keyId,
    registryRotationKeyCommit(bundle),
  ]));
}

function verifyEnvelope(
  verifiers: RegistryPublicVerifiers,
  keyId: string,
  message: Uint8Array,
  envelope: string,
): boolean {
  const signatures = decodeSignature(envelope);
  if (signatures === null) return false;
  return verifiers.ed25519(message, signatures.ed25519, keyId) === true
    && verifiers.mlDsa65(message, signatures.mlDsa65, keyId) === true;
}

function signEnvelope(
  custody: RegistryRotationCustody,
  keyId: string,
  message: Uint8Array,
): string {
  let signature: RegistryRotationHybridSignature | null;
  try {
    signature = custody.signHybrid(keyId, message);
  } catch {
    signature = null;
  }
  return encodeSignature(signature);
}

/** Commitment to both public halves of one operational identity. */
export function registryRotationKeyCommit(
  bundle: RegistryRotationPublicBundle,
): string {
  if (!KEY_ID.test(bundle.keyId)) {
    throw new TypeError("registry rotation keyId must be 16 lowercase hexadecimal characters");
  }
  createRegistryPublicVerifiers({
    role: "rotation",
    ...bundle,
  });
  const publicKey = createPublicKey(bundle.ed25519PublicKeyPem);
  const edDer = publicKey.export({ type: "spki", format: "der" });
  return createHash("sha256")
    .update("galerina.registry.rotation.public-bundle.v1\0", "utf8")
    .update(bundle.keyId, "utf8")
    .update("\0", "utf8")
    .update(edDer)
    .update(bundle.mlDsa65PublicKey)
    .digest("hex");
}

export function registryRotationPublicKeyFingerprints(
  bundle: RegistryRotationPublicBundle,
): RegistryRotationPublicKeyFingerprints {
  registryRotationKeyCommit(bundle);
  const publicKey = createPublicKey(bundle.ed25519PublicKeyPem);
  const edDer = publicKey.export({ type: "spki", format: "der" });
  return Object.freeze({
    ed25519PublicKeySha256: createHash("sha256")
      .update(edDer)
      .digest("hex"),
    mlDsa65PublicKeySha256: createHash("sha256")
      .update(bundle.mlDsa65PublicKey)
      .digest("hex"),
  });
}

/**
 * Build the dual-signed transition evidence. This function does not change a
 * ring or select an active key; the phase machine must still admit it.
 */
export function buildRegistryRotationTransition(options: {
  readonly fromEpoch: number;
  readonly toEpoch: number;
  readonly atTick: number;
  readonly prevChainHead: string;
  readonly oldKey: RegistryRotationPublicBundle;
  readonly newKey: RegistryRotationPublicBundle;
  readonly custody: RegistryRotationCustody;
}): Transition {
  if (
    !validTick(options.atTick)
    || !Number.isSafeInteger(options.fromEpoch)
    || !Number.isSafeInteger(options.toEpoch)
    || options.fromEpoch < 1
    || options.toEpoch !== options.fromEpoch + 1
    || !/^[0-9a-f]{64}$/.test(options.prevChainHead)
    || options.oldKey.keyId === options.newKey.keyId
  ) {
    throw new TypeError("registry rotation transition facts are malformed");
  }
  registryRotationKeyCommit(options.oldKey);
  registryRotationKeyCommit(options.newKey);
  const body = {
    fromEpoch: options.fromEpoch,
    toEpoch: options.toEpoch,
    atTick: options.atTick,
    prevChainHead: options.prevChainHead,
  };
  const message = transitionPreimage(body);
  return {
    ...body,
    macOld: signEnvelope(options.custody, options.oldKey.keyId, message),
    macNew: signEnvelope(options.custody, options.newKey.keyId, message),
  };
}

/**
 * Bind concrete hybrid proof checks to the existing K3 decision core. Chain,
 * canary and backward-sample evidence remain independent seams; thrown seams
 * become INDETERMINATE in the core and never authorize.
 */
export function createRegistryRotationContext(
  options: RegistryRotationContextOptions,
): RotationCtx {
  const oldVerifiers = createRegistryPublicVerifiers({
    role: "rotation",
    ...options.oldKey,
  });
  const newVerifiers = createRegistryPublicVerifiers({
    role: "rotation",
    ...options.newKey,
  });
  const transitionMessage = transitionPreimage(options.transition);
  return Object.freeze({
    verifyCandidateRoundTrip(): boolean {
      const message = challengePreimage(options.newKey);
      let envelope: string;
      try {
        envelope = signEnvelope(
          options.custody,
          options.newKey.keyId,
          message,
        );
      } catch {
        return false;
      }
      return verifyEnvelope(
        newVerifiers,
        options.newKey.keyId,
        message,
        envelope,
      );
    },
    verifyCurrentChain: options.verifyCurrentChain,
    verifyTransitionMacOld: (): boolean =>
      verifyEnvelope(
        oldVerifiers,
        options.oldKey.keyId,
        transitionMessage,
        options.transition.macOld,
      ),
    verifyTransitionMacNew: (): boolean =>
      verifyEnvelope(
        newVerifiers,
        options.newKey.keyId,
        transitionMessage,
        options.transition.macNew,
      ),
    verifyForwardProbe: options.verifyForwardProbe,
    verifyBackwardSample: options.verifyBackwardSample,
  });
}

/**
 * Scheduler decision only. ALLOW means “propose rotation”; it never changes
 * the ring. A not-yet-due schedule abstains; malformed or rollback facts deny.
 */
export function registryRotationTriggerVerdict(
  trigger: RegistryRotationTrigger,
  onDiagnostic?: (diagnostic: GovernanceDiagnostic) => void,
): Verdict {
  if (
    !validTick(trigger.nowTick)
    || !validTick(trigger.activeSinceTick)
    || !Number.isSafeInteger(trigger.rotateAfterTicks)
    || trigger.rotateAfterTicks < 1
    || !Number.isSafeInteger(trigger.signedArtifacts)
    || trigger.signedArtifacts < 0
    || !Number.isSafeInteger(trigger.maxSignedArtifacts)
    || trigger.maxSignedArtifacts < 1
    || trigger.nowTick < trigger.activeSinceTick
  ) {
    return Verdict.DENY;
  }
  const due = trigger.nowTick - trigger.activeSinceTick
      >= trigger.rotateAfterTicks
    || trigger.signedArtifacts >= trigger.maxSignedArtifacts;
  if (!due) {
    onDiagnostic?.({
      code: "FUNGI-GOV-3VL-001",
      name: "INDETERMINATE_COLLAPSED_TO_DENY",
      severity: "warning",
      message: "registry rotation trigger is not due; no phase may advance",
    });
    return Verdict.INDETERMINATE;
  }
  return Verdict.ALLOW;
}

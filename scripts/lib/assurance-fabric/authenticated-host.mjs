import { createHash, generateKeyPairSync, randomBytes, sign as ed25519Sign, verify as ed25519Verify } from "node:crypto";
import { types as utilTypes } from "node:util";
import { TRIT } from "./result-model.mjs";
import { canonicalJson, framedDigest } from "./private-host.mjs";

export const GRANT_DOMAIN = "galerina.signet.grant.v1";
export const SEAL_DOMAIN = "galerina.signet.wax-seal.v1";
export const GRANT_KIND = "GRANT";
export const SEAL_KIND = "WAX_SEAL";
export const AUTHENTICATED_KIND = "AUTHENTICATED_SIGNET";
export const SYNTHETIC_ACTION = "synthetic.effect.v1";

const GRANT_KEYS = Object.freeze([
  "action",
  "envelopeDigest",
  "epoch",
  "expiryUnixMs",
  "grantId",
  "issuedAtUnixMs",
  "issuerKeyId",
  "kind",
  "profileDigest",
  "schemaVersion",
  "subjectId",
]);
const SEAL_KEYS = Object.freeze([
  "action",
  "authentication",
  "authorizing",
  "envelopeDigest",
  "epoch",
  "grantId",
  "kind",
  "profileDigest",
  "replayable",
  "schemaVersion",
  "subjectId",
  "terminalOutcome",
]);
const ENVELOPE_KEYS = Object.freeze([
  "abi",
  "buildPoint",
  "capabilityDigest",
  "componentDigest",
  "dependencyClosureDigest",
  "epoch",
  "evidenceSetDigest",
  "policyDigest",
  "schemaVersion",
  "target",
]);
const TERMINAL_OUTCOMES = new Set(["CONSUMED", "REFUSED", "FAILED", "UNKNOWN"]);
const SHA256 = /^sha256:[a-f0-9]{64}$/u;
const HEX64 = /^[a-f0-9]{64}$/u;
const HEX128 = /^[a-f0-9]{128}$/u;

function exactRecord(value, expectedKeys, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)
      || utilTypes.isProxy(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new TypeError(`${label} must be an exact ordinary object`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const ownKeys = Reflect.ownKeys(descriptors);
  if (ownKeys.some((key) => typeof key !== "string")) {
    throw new TypeError(`${label} cannot contain symbol fields`);
  }
  const actual = ownKeys.map(String).sort();
  const expected = [...expectedKeys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new TypeError(`${label} has unexpected or missing fields`);
  }
  const result = {};
  for (const key of expected) {
    const descriptor = descriptors[key];
    if (!descriptor || descriptor.enumerable !== true || !("value" in descriptor)
        || descriptor.get !== undefined || descriptor.set !== undefined) {
      throw new TypeError(`${label}.${key} must be an ordinary data field`);
    }
    result[key] = descriptor.value;
  }
  return result;
}

function nonEmptyString(value, label) {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`${label} must be a non-empty string`);
  }
  return value;
}

function digest(value, label) {
  const normalized = nonEmptyString(value, label);
  if (!SHA256.test(normalized)) throw new TypeError(`${label} must be a lowercase sha256 digest`);
  return normalized;
}

function hexToBytes(hex, label, length) {
  if (typeof hex !== "string" || hex.length !== length * 2 || !/^[a-f0-9]+$/u.test(hex)) {
    throw new TypeError(`${label} must be lowercase hex of ${length} bytes`);
  }
  return Buffer.from(hex, "hex");
}

function rawPublicKey(publicKey) {
  const der = publicKey.export({ type: "spki", format: "der" });
  if (!Buffer.isBuffer(der) || der.length < 32) {
    throw new TypeError("ed25519 public key export is too short");
  }
  return der.subarray(der.length - 32);
}

export function signedMessage(domain, payload) {
  const canonical = canonicalJson(payload);
  return Buffer.from(`${domain.length}:${domain}${Buffer.byteLength(canonical)}:${canonical}`, "utf8");
}

function signPayload(domain, payload, privateKey) {
  const message = signedMessage(domain, payload);
  return ed25519Sign(null, message, privateKey).toString("hex");
}

function verifyPayload(domain, payload, publicKey, signatureHex) {
  if (typeof signatureHex !== "string" || !HEX128.test(signatureHex)) return false;
  const message = signedMessage(domain, payload);
  try {
    return ed25519Verify(null, message, publicKey, Buffer.from(signatureHex, "hex")) === true;
  } catch {
    return false;
  }
}

function envelopeDigestOf(value) {
  const fields = exactRecord(value, ENVELOPE_KEYS, "Envelope");
  if (fields.schemaVersion !== 1) throw new TypeError("Envelope.schemaVersion must equal 1");
  if (!Number.isSafeInteger(fields.epoch) || fields.epoch < 1) {
    throw new TypeError("Envelope.epoch must be a positive safe integer");
  }
  return framedDigest("galerina.assurance.envelope.v1", {
    schemaVersion: 1,
    componentDigest: digest(fields.componentDigest, "Envelope.componentDigest"),
    policyDigest: digest(fields.policyDigest, "Envelope.policyDigest"),
    target: nonEmptyString(fields.target, "Envelope.target"),
    abi: nonEmptyString(fields.abi, "Envelope.abi"),
    dependencyClosureDigest: digest(fields.dependencyClosureDigest, "Envelope.dependencyClosureDigest"),
    capabilityDigest: digest(fields.capabilityDigest, "Envelope.capabilityDigest"),
    buildPoint: nonEmptyString(fields.buildPoint, "Envelope.buildPoint"),
    epoch: fields.epoch,
    evidenceSetDigest: digest(fields.evidenceSetDigest, "Envelope.evidenceSetDigest"),
  });
}

function splitSigned(value, payloadKeys, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  const signature = value.signature;
  const payload = {};
  for (const key of payloadKeys) payload[key] = value[key];
  exactRecord(payload, payloadKeys, label);
  return { payload, signature };
}

export function createEffectSink() {
  let count = 0;
  return Object.freeze({
    get count() {
      return count;
    },
    apply() {
      count += 1;
    },
  });
}

export function guardTamper(ok) {
  /* GATE1_GUARD_TAMPER */ if (ok !== true) throw new TypeError("signed statement tampered or malformed");
}

export function guardUnusedGrant(consumed, grantId) {
  /* GATE1_GUARD_REPLAY */ if (consumed.has(grantId)) throw new TypeError("grant already consumed");
  consumed.add(grantId);
}

export function guardPinnedIssuer(ok) {
  /* GATE1_GUARD_ISSUER */ if (ok !== true) throw new TypeError("grant signed by unpinned issuer");
}

export function guardGrantKind(kind) {
  /* GATE1_GUARD_KIND */ if (kind !== GRANT_KIND) throw new TypeError("effect gate requires a GRANT");
}

export function guardFresh(grant, nowMs, epoch) {
  /* GATE1_GUARD_EXPIRED */ if (grant.epoch !== epoch || grant.expiryUnixMs <= nowMs) {
    throw new TypeError("grant expired or from a previous epoch");
  }
}

export function createAuthenticatedAssuranceHost(inputConfig, options = {}) {
  const clock = typeof options.clock === "function" ? options.clock : () => Date.now();
  const defaultTtlMs = Number.isSafeInteger(options.ttlMs) && options.ttlMs > 0 ? options.ttlMs : 60_000;
  const subjects = Array.isArray(inputConfig?.subjects) ? inputConfig.subjects : [];
  if (subjects.length < 1) throw new TypeError("host config.subjects must not be empty");
  const subjectById = new Map();
  const subjectByDigest = new Map();
  for (const subject of subjects) {
    const subjectId = nonEmptyString(subject?.subjectId, "subjectId");
    const subjectDigest = digest(subject?.digest, "subject digest");
    if (subjectById.has(subjectId) || subjectByDigest.has(subjectDigest)) {
      throw new TypeError("host config subjects must have unique identities and digests");
    }
    subjectById.set(subjectId, Object.freeze({ subjectId, digest: subjectDigest }));
    subjectByDigest.set(subjectDigest, subjectId);
  }
  const profileId = nonEmptyString(inputConfig.profileId, "profileId");
  const policyDigest = digest(inputConfig.policyDigest, "policyDigest");
  const target = nonEmptyString(inputConfig.target, "target");
  const abi = nonEmptyString(inputConfig.abi, "abi");
  const buildPoint = nonEmptyString(inputConfig.buildPoint, "buildPoint");
  let epoch = 1;
  const pair = generateKeyPairSync("ed25519");
  const publicKeyRaw = rawPublicKey(pair.publicKey);
  const publicKeyHex = publicKeyRaw.toString("hex");
  const pinnedIssuerKeyId = `sha256:${createHash("sha256").update(publicKeyRaw).digest("hex")}`;
  const consumed = new Set();
  const seals = new WeakMap();

  function currentProfileDigest() {
    return framedDigest("galerina.assurance.profile.v1", {
      profileId,
      context: { policyDigest, target, abi, buildPoint, epoch },
      subjects: [...subjectById.values()],
    });
  }

  function issueGrant(envelope, action, ttlMs) {
    const envelopeDigest = envelopeDigestOf(envelope);
    const declared = subjectByDigest.get(envelope.componentDigest);
    if (!declared || !subjectById.has(declared)) {
      throw new TypeError("Envelope subject is undeclared");
    }
    const act = nonEmptyString(action, "action");
    const ttl = Number.isSafeInteger(ttlMs) ? ttlMs : defaultTtlMs;
    const nowMs = clock();
    const payload = {
      schemaVersion: 1,
      kind: GRANT_KIND,
      grantId: randomBytes(32).toString("hex"),
      subjectId: declared,
      envelopeDigest,
      action: act,
      epoch,
      expiryUnixMs: nowMs + ttl,
      issuedAtUnixMs: nowMs,
      issuerKeyId: pinnedIssuerKeyId,
      profileDigest: currentProfileDigest(),
    };
    const signature = signPayload(GRANT_DOMAIN, payload, pair.privateKey);
    return Object.freeze({ ...payload, signature });
  }

  function authenticateGrant(value) {
    const { payload, signature } = splitSigned(value, GRANT_KEYS, "GRANT");
    if (payload.kind !== GRANT_KIND) throw new TypeError("GRANT kind mismatch");
    if (payload.schemaVersion !== 1) throw new TypeError("GRANT schemaVersion must equal 1");
    nonEmptyString(payload.grantId, "grantId");
    if (!HEX64.test(payload.grantId)) throw new TypeError("grantId must be 32-byte hex");
    nonEmptyString(payload.action, "action");
    digest(payload.envelopeDigest, "envelopeDigest");
    digest(payload.profileDigest, "profileDigest");
    digest(payload.issuerKeyId, "issuerKeyId");
    nonEmptyString(payload.subjectId, "subjectId");
    if (!Number.isSafeInteger(payload.epoch) || payload.epoch < 1) {
      throw new TypeError("GRANT epoch must be a positive safe integer");
    }
    if (!Number.isSafeInteger(payload.expiryUnixMs) || !Number.isSafeInteger(payload.issuedAtUnixMs)) {
      throw new TypeError("GRANT timestamps must be safe integers");
    }
    guardPinnedIssuer(payload.issuerKeyId === pinnedIssuerKeyId);
    const pinned = verifyPayload(GRANT_DOMAIN, payload, pair.publicKey, signature);
    guardTamper(pinned);
    return { payload, signature };
  }

  function applyGrant(value, action, sink) {
    if (sink === null || typeof sink !== "object" || typeof sink.apply !== "function") {
      throw new TypeError("effect sink is required");
    }
    const requested = nonEmptyString(action, "action");
    guardGrantKind(value?.kind);
    const { payload } = value?.kind === GRANT_KIND
      ? authenticateGrant(value)
      : { payload: value };
    if (payload.action !== requested) throw new TypeError("grant action mismatch");
    if (payload.profileDigest !== currentProfileDigest()) {
      throw new TypeError("grant profile does not match current host");
    }
    if (!subjectById.has(payload.subjectId)) throw new TypeError("grant subject is undeclared");
    guardFresh(payload, clock(), epoch);
    guardUnusedGrant(consumed, payload.grantId);
    sink.apply();
    const sealPayload = {
      schemaVersion: 1,
      kind: SEAL_KIND,
      grantId: payload.grantId,
      subjectId: payload.subjectId,
      envelopeDigest: payload.envelopeDigest,
      action: payload.action,
      epoch: payload.epoch,
      terminalOutcome: "CONSUMED",
      authentication: AUTHENTICATED_KIND,
      authorizing: false,
      replayable: false,
      profileDigest: payload.profileDigest,
    };
    const signature = signPayload(SEAL_DOMAIN, sealPayload, pair.privateKey);
    const seal = Object.freeze({ ...sealPayload, signature });
    seals.set(seal, Object.freeze({
      grantId: payload.grantId,
      subjectId: payload.subjectId,
      sealDigest: framedDigest(SEAL_DOMAIN, sealPayload),
    }));
    return seal;
  }

  function classifySeal(value, expectedSubjectId) {
    const subjectId = nonEmptyString(expectedSubjectId, "expectedSubjectId");
    if (value && typeof value === "object" && value.kind === "absent") return TRIT.UNKNOWN;
    if (value == null) return TRIT.UNKNOWN;
    const state = seals.get(value);
    if (!state) {
      try {
        const { payload, signature } = splitSigned(value, SEAL_KEYS, "WAX_SEAL");
        if (payload.kind !== SEAL_KIND || payload.authorizing !== false) return TRIT.DISTRUSTED;
        const ok = verifyPayload(SEAL_DOMAIN, payload, pair.publicKey, signature);
        if (!ok) return TRIT.DISTRUSTED;
        if (payload.subjectId !== subjectId) return TRIT.DISTRUSTED;
        if (payload.epoch !== epoch || payload.profileDigest !== currentProfileDigest()) {
          return TRIT.DISTRUSTED;
        }
        return TRIT.ASSURED;
      } catch {
        return TRIT.DISTRUSTED;
      }
    }
    if (state.subjectId !== subjectId) return TRIT.DISTRUSTED;
    return TRIT.ASSURED;
  }

  function rotateContext() {
    if (epoch === Number.MAX_SAFE_INTEGER) throw new RangeError("host context epoch is exhausted");
    epoch += 1;
    return epoch;
  }

  return Object.freeze({
    publicVerifyingKeyHex: publicKeyHex,
    issueGrant,
    applyGrant,
    classifySeal,
    rotateContext,
    currentEpoch() {
      return epoch;
    },
  });
}

export function publicKeyBytesFromHex(hex) {
  return hexToBytes(hex, "publicKeyHex", 32);
}

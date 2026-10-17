import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmodSync, copyFileSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { pathToFileURL } from "node:url";
import { TRIT } from "../lib/assurance-fabric/result-model.mjs";
import {
  execPinnedVerifierBytes,
  loadPinnedVerifierBytes,
  resetSealedSpawnCount,
  spawnSignetVerifier,
  takeSealedSpawnCount,
} from "../lib/assurance-fabric/signet-verifier-spawn.mjs";

const hostModuleUrl = process.env.GATE1_HOST_MODULE
  ? pathToFileURL(process.env.GATE1_HOST_MODULE).href
  : new URL("../lib/assurance-fabric/authenticated-host.mjs", import.meta.url).href;

const {
  AUTHENTICATED_KIND,
  GRANT_KIND,
  SEAL_KIND,
  SYNTHETIC_ACTION,
  createAuthenticatedAssuranceHost,
  createEffectSink,
} = await import(hostModuleUrl);

const envelope = Object.freeze({
  schemaVersion: 1,
  componentDigest: "sha256:" + "11".repeat(32),
  policyDigest: "sha256:" + "22".repeat(32),
  target: "node-esm",
  abi: "galerina.assurance-host.v1",
  dependencyClosureDigest: "sha256:" + "33".repeat(32),
  capabilityDigest: "sha256:" + "44".repeat(32),
  buildPoint: "git:" + "55".repeat(20),
  epoch: 1,
  evidenceSetDigest: "sha256:" + "66".repeat(32),
});

const config = Object.freeze({
  profileId: "profile:signet-gate1",
  policyDigest: envelope.policyDigest,
  target: envelope.target,
  abi: envelope.abi,
  buildPoint: envelope.buildPoint,
  subjects: Object.freeze([
    Object.freeze({ subjectId: "subject:component", digest: envelope.componentDigest }),
  ]),
});

function flipHex(hex) {
  const last = hex[hex.length - 1];
  const next = last === "0" ? "1" : "0";
  return `${hex.slice(0, -1)}${next}`;
}

describe("authenticated Signet / Grant / Wax Seal host", () => {
  it("tamper of signed grant and seal is refused with zero effects", () => {
    const host = createAuthenticatedAssuranceHost(config);
    const sink = createEffectSink();
    const grant = host.issueGrant(envelope, SYNTHETIC_ACTION);
    const tamperedSig = { ...grant, signature: flipHex(grant.signature) };
    assert.throws(() => host.applyGrant(tamperedSig, SYNTHETIC_ACTION, sink), /tampered|unpinned|GRANT/);
    assert.equal(sink.count, 0);
    const tamperedField = { ...grant, action: "synthetic.write.v1" };
    assert.throws(() => host.applyGrant(tamperedField, "synthetic.write.v1", sink), /tampered|unpinned|GRANT|action/);
    assert.equal(sink.count, 0);
    const seal = host.applyGrant(grant, SYNTHETIC_ACTION, sink);
    assert.equal(sink.count, 1);
    const tamperedSeal = { ...seal, signature: flipHex(seal.signature) };
    assert.equal(host.classifySeal(tamperedSeal, "subject:component"), TRIT.DISTRUSTED);
    assert.throws(() => host.applyGrant(tamperedSeal, SYNTHETIC_ACTION, createEffectSink()), /GRANT|tampered|unpinned|issuerKeyId/);
  });

  it("replay and concurrent second consume refuse with at most one effect", async () => {
    const host = createAuthenticatedAssuranceHost(config);
    const sink = createEffectSink();
    const grant = host.issueGrant(envelope, SYNTHETIC_ACTION);
    host.applyGrant(grant, SYNTHETIC_ACTION, sink);
    assert.equal(sink.count, 1);
    assert.throws(() => host.applyGrant(grant, SYNTHETIC_ACTION, sink), /already consumed/);
    assert.equal(sink.count, 1);

    const raced = createAuthenticatedAssuranceHost(config);
    const raceSink = createEffectSink();
    const raceGrant = raced.issueGrant(envelope, SYNTHETIC_ACTION);
    const attempts = await Promise.allSettled([
      Promise.resolve().then(() => raced.applyGrant(raceGrant, SYNTHETIC_ACTION, raceSink)),
      Promise.resolve().then(() => raced.applyGrant(raceGrant, SYNTHETIC_ACTION, raceSink)),
    ]);
    const fulfilled = attempts.filter((row) => row.status === "fulfilled").length;
    const rejected = attempts.filter((row) => row.status === "rejected").length;
    assert.equal(fulfilled, 1);
    assert.equal(rejected, 1);
    assert.equal(raceSink.count, 1);
  });

  it("wrong issuer is refused with zero effects", () => {
    const hostA = createAuthenticatedAssuranceHost(config);
    const hostB = createAuthenticatedAssuranceHost(config);
    const sink = createEffectSink();
    const foreign = hostB.issueGrant(envelope, SYNTHETIC_ACTION);
    assert.throws(() => hostA.applyGrant(foreign, SYNTHETIC_ACTION, sink), /unpinned|tampered/);
    assert.equal(sink.count, 0);
  });

  it("receipt used as authority is refused with zero effects", () => {
    const host = createAuthenticatedAssuranceHost(config);
    const issueSink = createEffectSink();
    const grant = host.issueGrant(envelope, SYNTHETIC_ACTION);
    const mislabelled = { ...grant, kind: SEAL_KIND };
    assert.throws(() => host.applyGrant(mislabelled, SYNTHETIC_ACTION, issueSink), /GRANT|kind|tampered|unpinned/);
    assert.equal(issueSink.count, 0);
    const seal = host.applyGrant(grant, SYNTHETIC_ACTION, issueSink);
    assert.equal(seal.kind, SEAL_KIND);
    assert.equal(seal.authentication, AUTHENTICATED_KIND);
    assert.equal(seal.authorizing, false);
    const sink = createEffectSink();
    assert.throws(() => host.applyGrant(seal, SYNTHETIC_ACTION, sink), /GRANT|issuerKeyId|kind|tampered/);
    assert.equal(sink.count, 0);
    const peer = createAuthenticatedAssuranceHost(config);
    const peerSink = createEffectSink();
    assert.throws(() => peer.applyGrant(seal, SYNTHETIC_ACTION, peerSink), /GRANT|issuerKeyId|kind|tampered/);
    assert.equal(peerSink.count, 0);
    const relabelled = {
      schemaVersion: 1,
      kind: GRANT_KIND,
      grantId: seal.grantId,
      subjectId: seal.subjectId,
      envelopeDigest: seal.envelopeDigest,
      action: seal.action,
      epoch: seal.epoch,
      expiryUnixMs: Date.now() + 60_000,
      issuedAtUnixMs: Date.now(),
      issuerKeyId: grant.issuerKeyId,
      profileDigest: seal.profileDigest,
      signature: seal.signature,
    };
    assert.throws(() => host.applyGrant(relabelled, SYNTHETIC_ACTION, sink), /tampered|unpinned|GRANT|issuerKeyId/);
    assert.equal(sink.count, 0);
  });

  it("expired grant and previous epoch are refused with zero effects", () => {
    const host = createAuthenticatedAssuranceHost(config);
    const sink = createEffectSink();
    const expired = host.issueGrant(envelope, SYNTHETIC_ACTION, -1);
    assert.throws(() => host.applyGrant(expired, SYNTHETIC_ACTION, sink), /expired|previous epoch/);
    assert.equal(sink.count, 0);
    const staleHost = createAuthenticatedAssuranceHost(config);
    const staleSink = createEffectSink();
    const staleGrant = staleHost.issueGrant(envelope, SYNTHETIC_ACTION);
    staleHost.rotateContext();
    assert.throws(() => staleHost.applyGrant(staleGrant, SYNTHETIC_ACTION, staleSink), /expired|previous epoch|profile|UNKNOWN/);
    assert.equal(staleSink.count, 0);
  });

  it("restart refuses prior grants as UNKNOWN and never as unused", () => {
    const host = createAuthenticatedAssuranceHost(config);
    const sink = createEffectSink();
    const grant = host.issueGrant(envelope, SYNTHETIC_ACTION);
    host.applyGrant(grant, SYNTHETIC_ACTION, sink);
    assert.equal(sink.count, 1);
    host.restartHost();
    const afterConsume = createEffectSink();
    assert.throws(() => host.applyGrant(grant, SYNTHETIC_ACTION, afterConsume), /UNKNOWN/);
    assert.equal(afterConsume.count, 0);

    const fresh = createAuthenticatedAssuranceHost(config);
    const unused = fresh.issueGrant(envelope, SYNTHETIC_ACTION);
    fresh.restartHost();
    const unusedSink = createEffectSink();
    assert.throws(() => fresh.applyGrant(unused, SYNTHETIC_ACTION, unusedSink), /UNKNOWN/);
    assert.equal(unusedSink.count, 0);
    const replacement = fresh.issueGrant(envelope, SYNTHETIC_ACTION);
    const okSink = createEffectSink();
    fresh.applyGrant(replacement, SYNTHETIC_ACTION, okSink);
    assert.equal(okSink.count, 1);
  });

  it("positive control: one effect and verifier-accepted seal; missing seal is 0", () => {
    const host = createAuthenticatedAssuranceHost(config);
    const sink = createEffectSink();
    const grant = host.issueGrant(envelope, SYNTHETIC_ACTION);
    assert.equal(grant.kind, GRANT_KIND);
    const seal = host.applyGrant(grant, SYNTHETIC_ACTION, sink);
    assert.equal(sink.count, 1);
    assert.equal(seal.authorizing, false);
    assert.equal(seal.replayable, false);
    assert.equal(host.classifySeal(seal, "subject:component"), TRIT.ASSURED);
    assert.equal(host.classifySeal(null, "subject:component"), TRIT.UNKNOWN);
    assert.equal(host.classifySeal({ kind: "absent", reason: "not produced" }, "subject:component"), TRIT.UNKNOWN);

    const verifierPath = process.env.GATE1_VERIFIER;
    const pin = process.env.GATE1_VERIFIER_SHA256;
    assert.ok(verifierPath && pin, "GATE1_VERIFIER and GATE1_VERIFIER_SHA256 are required");
    const grantVerdict = spawnSignetVerifier({
      verifierPath,
      expectedSha256Hex: pin,
      publicKeyHex: host.publicVerifyingKeyHex,
      statement: grant,
    });
    assert.equal(grantVerdict.authorizing, false);
    assert.equal(grantVerdict.trit, 1, grantVerdict.reason);
    const sealVerdict = spawnSignetVerifier({
      verifierPath,
      expectedSha256Hex: pin,
      publicKeyHex: host.publicVerifyingKeyHex,
      statement: seal,
    });
    assert.equal(sealVerdict.authorizing, false);
    assert.equal(sealVerdict.trit, 1, sealVerdict.reason);
    const tamperVerdict = spawnSignetVerifier({
      verifierPath,
      expectedSha256Hex: pin,
      publicKeyHex: host.publicVerifyingKeyHex,
      statement: { ...grant, signature: flipHex(grant.signature) },
    });
    assert.equal(tamperVerdict.trit, -1);
    assert.equal(tamperVerdict.authorizing, false);
  });

  it("rust verifier negatives are trit -1 or unavailable 0, never +1", () => {
    const verifierPath = process.env.GATE1_VERIFIER;
    const pin = process.env.GATE1_VERIFIER_SHA256;
    assert.ok(verifierPath && pin, "GATE1_VERIFIER and GATE1_VERIFIER_SHA256 are required");
    const hostA = createAuthenticatedAssuranceHost(config);
    const hostB = createAuthenticatedAssuranceHost(config);
    const grantA = hostA.issueGrant(envelope, SYNTHETIC_ACTION);
    const sealA = hostA.applyGrant(grantA, SYNTHETIC_ACTION, createEffectSink());
    const grantB = hostB.issueGrant(envelope, SYNTHETIC_ACTION);
    const sealB = hostB.applyGrant(grantB, SYNTHETIC_ACTION, createEffectSink());

    function check(statement, publicKeyHex = hostA.publicVerifyingKeyHex, expectedSha256Hex = pin, path = verifierPath) {
      return spawnSignetVerifier({
        verifierPath: path,
        expectedSha256Hex,
        publicKeyHex,
        statement,
      });
    }

    function refuse(verdict) {
      assert.equal(verdict.authorizing, false);
      assert.equal(verdict.trit, -1, verdict.reason);
      assert.notEqual(verdict.trit, 1);
    }

    refuse(check(grantB));
    refuse(check(sealB));
    refuse(check({ ...sealA, subjectId: flipHex(sealA.subjectId) }));
    refuse(check({ ...sealA, terminalOutcome: flipHex(sealA.terminalOutcome) }));
    refuse(check({ ...sealA, signature: flipHex(sealA.signature) }));
    refuse(check({ ...sealA, authorizing: true }));
    refuse(check({ ...grantA, extra: true }));
    const missing = { ...grantA };
    delete missing.grantId;
    refuse(check(missing));

    const pinMismatch = check(grantA, hostA.publicVerifyingKeyHex, "00".repeat(32));
    assert.equal(pinMismatch.authorizing, false);
    assert.equal(pinMismatch.trit, -1, pinMismatch.reason);
    assert.notEqual(pinMismatch.trit, 1);

    const decoyDir = mkdtempSync(join(tmpdir(), "gate1-unavail-"));
    const decoy = join(decoyDir, "decoy");
    writeFileSync(decoy, "gate1-unavailable-decoy\n");
    chmodSync(decoy, 0o400);
    const decoyPin = createHash("sha256").update(readFileSync(decoy)).digest("hex");
    const unavailable = check(grantA, hostA.publicVerifyingKeyHex, decoyPin, decoy);
    assert.equal(unavailable.authorizing, false);
    assert.equal(unavailable.trit, 0, unavailable.reason);
    assert.notEqual(unavailable.trit, 1);
  });

  it("malformed headers refuse before spawn", () => {
    const verifierPath = process.env.GATE1_VERIFIER;
    const pin = process.env.GATE1_VERIFIER_SHA256;
    assert.ok(verifierPath && pin, "GATE1_VERIFIER and GATE1_VERIFIER_SHA256 are required");
    const host = createAuthenticatedAssuranceHost(config);
    const grant = host.issueGrant(envelope, SYNTHETIC_ACTION);
    const cases = [
      { ...grant, extra: true },
      (() => { const missing = { ...grant }; delete missing.grantId; return missing; })(),
      { ...grant, signature: grant.signature.slice(0, 8) },
      { ...grant, envelopeDigest: "not-a-digest" },
      { ...grant, kind: "OTHER" },
      "not-an-object",
    ];
    for (const statement of cases) {
      resetSealedSpawnCount();
      const verdict = spawnSignetVerifier({
        verifierPath,
        expectedSha256Hex: pin,
        publicKeyHex: host.publicVerifyingKeyHex,
        statement,
      });
      assert.equal(verdict.authorizing, false);
      assert.equal(verdict.trit, -1, verdict.reason);
      assert.notEqual(verdict.trit, 1);
      assert.equal(takeSealedSpawnCount(), 0, verdict.reason);
    }
    resetSealedSpawnCount();
    const oversized = { ...grant, action: "x".repeat(20_000) };
    const tooLarge = spawnSignetVerifier({
      verifierPath,
      expectedSha256Hex: pin,
      publicKeyHex: host.publicVerifyingKeyHex,
      statement: oversized,
    });
    assert.equal(tooLarge.trit, -1);
    assert.equal(tooLarge.reason, "HEADER_TOO_LARGE");
    assert.equal(takeSealedSpawnCount(), 0);
  });

  it("on-disk swap after hash still runs the pinned bytes", () => {
    const verifierPath = process.env.GATE1_VERIFIER;
    const pin = process.env.GATE1_VERIFIER_SHA256;
    assert.ok(verifierPath && pin, "GATE1_VERIFIER and GATE1_VERIFIER_SHA256 are required");
    const host = createAuthenticatedAssuranceHost(config);
    const grant = host.issueGrant(envelope, SYNTHETIC_ACTION);
    const body = `${JSON.stringify({
      schema: "galerina.signet.verify.v1",
      publicKeyHex: host.publicVerifyingKeyHex,
      statement: grant,
    })}\n`;
    const dir = mkdtempSync(join(tmpdir(), "gate1-swap-"));
    const tmp = join(dir, "verifier");
    copyFileSync(verifierPath, tmp);
    chmodSync(tmp, 0o755);
    const loaded = loadPinnedVerifierBytes(tmp, pin);
    assert.equal(loaded.ok, true);
    writeFileSync(tmp, "gate1-swapped-decoy\n");
    chmodSync(tmp, 0o755);
    const verdict = execPinnedVerifierBytes(loaded.bytes, {
      expectedSha256Hex: pin,
      verifierPath: tmp,
      input: body,
    });
    assert.equal(verdict.authorizing, false);
    assert.equal(verdict.trit, 1, verdict.reason);
  });
});

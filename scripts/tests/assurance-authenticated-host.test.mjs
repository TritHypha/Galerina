import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, copyFileSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { TRIT } from "../lib/assurance-fabric/result-model.mjs";
import {
  execPinnedVerifierBytes,
  loadPinnedHelperBytes,
  loadPinnedVerifierBytes,
  resetSealedSpawnCount,
  setAfterHelperPinnedHook,
  spawnSignetVerifier,
  takeLastHelperStderr,
  takeLastHelperStdout,
  takeSealedSpawnCount,
  validateVerifyRequest,
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

const sealedExecSrc = fileURLToPath(new URL("../lib/assurance-fabric/signet-sealed-exec.c", import.meta.url));

function flipHex(hex) {
  const last = hex[hex.length - 1];
  const next = last === "0" ? "1" : "0";
  return `${hex.slice(0, -1)}${next}`;
}

function sealedHelper() {
  const helperPath = process.env.GATE1_SEALED_EXEC;
  const helperSha256Hex = process.env.GATE1_SEALED_EXEC_SHA256;
  assert.ok(typeof helperPath === "string" && helperPath.length > 0, "GATE1_SEALED_EXEC is required");
  assert.ok(
    typeof helperSha256Hex === "string" && /^[a-f0-9]{64}$/u.test(helperSha256Hex),
    "GATE1_SEALED_EXEC_SHA256 is required",
  );
  return { helperPath, helperSha256Hex };
}

function spawnVerifier(opts) {
  return spawnSignetVerifier({ ...sealedHelper(), ...opts });
}

function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function writeFakeHelper(dir, body) {
  const fake = join(dir, "fake-helper");
  writeFileSync(fake, body);
  chmodSync(fake, 0o755);
  return fake;
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

  it("G1 valid grant with a different requested action is refused with zero effects", () => {
    const host = createAuthenticatedAssuranceHost(config);
    const sink = createEffectSink();
    const grant = host.issueGrant(envelope, SYNTHETIC_ACTION);
    assert.throws(() => host.applyGrant(grant, "synthetic.write.v1", sink), /action mismatch/);
    assert.equal(sink.count, 0);
    const okSink = createEffectSink();
    host.applyGrant(grant, SYNTHETIC_ACTION, okSink);
    assert.equal(okSink.count, 1);
  });

  it("classifySeal identity and copy agree; previous epoch or profile is DISTRUSTED", () => {
    const host = createAuthenticatedAssuranceHost(config);
    const seal = host.applyGrant(host.issueGrant(envelope, SYNTHETIC_ACTION), SYNTHETIC_ACTION, createEffectSink());
    const copy = { ...seal };
    assert.equal(host.classifySeal(seal, "subject:component"), TRIT.ASSURED);
    assert.equal(host.classifySeal(copy, "subject:component"), TRIT.ASSURED);
    assert.equal(host.classifySeal(seal, "subject:other"), TRIT.DISTRUSTED);
    assert.equal(host.classifySeal(copy, "subject:other"), TRIT.DISTRUSTED);
    host.restartHost();
    assert.equal(host.classifySeal(seal, "subject:component"), TRIT.DISTRUSTED);
    assert.equal(host.classifySeal(copy, "subject:component"), TRIT.DISTRUSTED);

    const rotated = createAuthenticatedAssuranceHost(config);
    const rotatedSeal = rotated.applyGrant(
      rotated.issueGrant(envelope, SYNTHETIC_ACTION),
      SYNTHETIC_ACTION,
      createEffectSink(),
    );
    const rotatedCopy = { ...rotatedSeal };
    rotated.rotateContext();
    assert.equal(rotated.classifySeal(rotatedSeal, "subject:component"), TRIT.DISTRUSTED);
    assert.equal(rotated.classifySeal(rotatedCopy, "subject:component"), TRIT.DISTRUSTED);
  });

  it("NaN Infinity and non-number clocks refuse expired grants with zero effects", () => {
    let mode = "real";
    const host = createAuthenticatedAssuranceHost(config, {
      clock: () => {
        if (mode === "real") return 1_700_000_000_000;
        if (mode === "nan") return Number.NaN;
        if (mode === "inf") return Number.POSITIVE_INFINITY;
        return "not-a-number";
      },
    });
    const expired = host.issueGrant(envelope, SYNTHETIC_ACTION, -1);
    const nanSink = createEffectSink();
    mode = "nan";
    assert.throws(() => host.applyGrant(expired, SYNTHETIC_ACTION, nanSink), /clock is not a safe integer/);
    assert.equal(nanSink.count, 0);
    const infSink = createEffectSink();
    mode = "inf";
    assert.throws(() => host.applyGrant(expired, SYNTHETIC_ACTION, infSink), /clock is not a safe integer/);
    assert.equal(infSink.count, 0);
    const badSink = createEffectSink();
    mode = "str";
    assert.throws(() => host.applyGrant(expired, SYNTHETIC_ACTION, badSink), /clock is not a safe integer/);
    assert.equal(badSink.count, 0);
  });

  it("sink.apply throw records DELIVERY_UNKNOWN, never CONSUMED, and keeps the grant consumed", () => {
    const host = createAuthenticatedAssuranceHost(config);
    const grant = host.issueGrant(envelope, SYNTHETIC_ACTION);
    const exploding = {
      apply() {
        throw new Error("sink boom");
      },
    };
    const seal = host.applyGrant(grant, SYNTHETIC_ACTION, exploding);
    assert.equal(seal.terminalOutcome, "DELIVERY_UNKNOWN");
    assert.notEqual(seal.terminalOutcome, "CONSUMED");
    assert.equal(seal.authorizing, false);
    assert.equal(host.classifySeal(seal, "subject:component"), TRIT.UNKNOWN);
    const copy = { ...seal };
    assert.equal(host.classifySeal(copy, "subject:component"), TRIT.UNKNOWN);
    const retry = createEffectSink();
    assert.throws(() => host.applyGrant(grant, SYNTHETIC_ACTION, retry), /already consumed/);
    assert.equal(retry.count, 0);
  });

  it("Proxy-wrapped grants and extra keys are refused at applyGrant", () => {
    const host = createAuthenticatedAssuranceHost(config);
    const grant = host.issueGrant(envelope, SYNTHETIC_ACTION);
    const proxySink = createEffectSink();
    assert.throws(
      () => host.applyGrant(new Proxy({ ...grant }, {}), SYNTHETIC_ACTION, proxySink),
      /exact ordinary object/,
    );
    assert.equal(proxySink.count, 0);
    const extraSink = createEffectSink();
    assert.throws(
      () => host.applyGrant({ ...grant, extra: "x" }, SYNTHETIC_ACTION, extraSink),
      /unexpected or missing fields/,
    );
    assert.equal(extraSink.count, 0);
    const okSink = createEffectSink();
    host.applyGrant(grant, SYNTHETIC_ACTION, okSink);
    assert.equal(okSink.count, 1);
  });

  it("restartHost checks epoch exhaustion before clearing consumed", () => {
    const host = createAuthenticatedAssuranceHost(config, {
      epoch: Number.MAX_SAFE_INTEGER,
      clock: () => 1_000_000,
    });
    const sink = createEffectSink();
    const grant = host.issueGrant(envelope, SYNTHETIC_ACTION, 60_000);
    host.applyGrant(grant, SYNTHETIC_ACTION, sink);
    assert.equal(sink.count, 1);
    assert.throws(() => host.restartHost(), /exhausted/);
    const retry = createEffectSink();
    assert.throws(() => host.applyGrant(grant, SYNTHETIC_ACTION, retry), /already consumed/);
    assert.equal(retry.count, 0);
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
    const grantVerdict = spawnVerifier({
      verifierPath,
      expectedSha256Hex: pin,
      publicKeyHex: host.publicVerifyingKeyHex,
      statement: grant,
    });
    assert.equal(grantVerdict.authorizing, false);
    assert.equal(grantVerdict.trit, 1, grantVerdict.reason);
    const sealsLine = takeLastHelperStderr();
    assert.match(sealsLine, /SEALS:\d+/);
    const seals = Number.parseInt(sealsLine.match(/SEALS:(\d+)/u)[1], 10);
    const want = 0x0001 | 0x0002 | 0x0004 | 0x0008;
    assert.equal(seals & want, want, sealsLine);
    const sealVerdict = spawnVerifier({
      verifierPath,
      expectedSha256Hex: pin,
      publicKeyHex: host.publicVerifyingKeyHex,
      statement: seal,
    });
    assert.equal(sealVerdict.authorizing, false);
    assert.equal(sealVerdict.trit, 1, sealVerdict.reason);
    const tamperVerdict = spawnVerifier({
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
      return spawnVerifier({
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
      const verdict = spawnVerifier({
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
    const tooLarge = spawnVerifier({
      verifierPath,
      expectedSha256Hex: pin,
      publicKeyHex: host.publicVerifyingKeyHex,
      statement: oversized,
    });
    assert.equal(tooLarge.trit, -1);
    assert.equal(tooLarge.reason, "HEADER_TOO_LARGE");
    assert.equal(takeSealedSpawnCount(), 0);
  });

  it("validateVerifyRequest returns a typed ok result, never null", () => {
    const host = createAuthenticatedAssuranceHost(config);
    const grant = host.issueGrant(envelope, SYNTHETIC_ACTION);
    const valid = validateVerifyRequest({
      publicKeyHex: host.publicVerifyingKeyHex,
      statement: grant,
    });
    assert.equal(valid.ok, true);
    assert.equal(Object.hasOwn(valid, "refusal"), false);
    const invalid = validateVerifyRequest({
      publicKeyHex: host.publicVerifyingKeyHex,
      statement: { ...grant, extra: true },
    });
    assert.equal(invalid.ok, false);
    assert.equal(invalid.refusal.trit, -1);
    assert.equal(invalid.refusal.reason, "HEADER_KEYS");
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
      ...sealedHelper(),
      input: body,
    });
    assert.equal(verdict.authorizing, false);
    assert.equal(verdict.trit, 1, verdict.reason);
  });

  it("substituted helper with correct output and wrong hash refuses with zero verifier spawns", () => {
    const verifierPath = process.env.GATE1_VERIFIER;
    const pin = process.env.GATE1_VERIFIER_SHA256;
    assert.ok(verifierPath && pin, "GATE1_VERIFIER and GATE1_VERIFIER_SHA256 are required");
    const host = createAuthenticatedAssuranceHost(config);
    const real = sealedHelper();
    const grant = host.issueGrant(envelope, SYNTHETIC_ACTION);
    const tampered = { ...grant, signature: flipHex(grant.signature) };
    const dir = mkdtempSync(join(tmpdir(), "gate1-fake-helper-"));
    const fake = writeFakeHelper(
      dir,
      "#!/bin/sh\n/bin/cat >/dev/null\nprintf '%s\\n' '{\"schema\":\"galerina.signet.verdict.v1\",\"trit\":1,\"reason\":\"OK\",\"authorizing\":false}'\nexit 0\n",
    );
    resetSealedSpawnCount();
    const verdict = spawnSignetVerifier({
      verifierPath,
      expectedSha256Hex: pin,
      helperPath: fake,
      helperSha256Hex: real.helperSha256Hex,
      publicKeyHex: host.publicVerifyingKeyHex,
      statement: tampered,
    });
    assert.equal(verdict.trit, -1, verdict.reason);
    assert.equal(verdict.reason, "HELPER_PIN_MISMATCH");
    assert.equal(takeSealedSpawnCount(), 0);
  });

  it("GATE1_SEALED_EXEC env cannot redirect the helper; omitted pin refuses", () => {
    const verifierPath = process.env.GATE1_VERIFIER;
    const pin = process.env.GATE1_VERIFIER_SHA256;
    assert.ok(verifierPath && pin, "GATE1_VERIFIER and GATE1_VERIFIER_SHA256 are required");
    const host = createAuthenticatedAssuranceHost(config);
    const grant = host.issueGrant(envelope, SYNTHETIC_ACTION);
    const tampered = { ...grant, signature: flipHex(grant.signature) };
    const real = sealedHelper();
    const dir = mkdtempSync(join(tmpdir(), "gate1-env-helper-"));
    const fake = writeFakeHelper(
      dir,
      "#!/bin/sh\n/bin/cat >/dev/null\nprintf '%s\\n' '{\"schema\":\"galerina.signet.verdict.v1\",\"trit\":1,\"reason\":\"OK\",\"authorizing\":false}'\nexit 0\n",
    );
    const previous = process.env.GATE1_SEALED_EXEC;
    process.env.GATE1_SEALED_EXEC = fake;
    const envIgnored = spawnSignetVerifier({
      verifierPath,
      expectedSha256Hex: pin,
      helperPath: real.helperPath,
      helperSha256Hex: real.helperSha256Hex,
      publicKeyHex: host.publicVerifyingKeyHex,
      statement: tampered,
    });
    process.env.GATE1_SEALED_EXEC = previous;
    assert.equal(envIgnored.trit, -1, envIgnored.reason);
    assert.notEqual(envIgnored.trit, 1);
    const omitted = spawnSignetVerifier({
      verifierPath,
      expectedSha256Hex: pin,
      publicKeyHex: host.publicVerifyingKeyHex,
      statement: grant,
    });
    assert.equal(omitted.trit, -1);
    assert.equal(omitted.reason, "HELPER_PATH");
  });

  it("exit 7 with a +1 body refuses", () => {
    const verifierPath = process.env.GATE1_VERIFIER;
    const pin = process.env.GATE1_VERIFIER_SHA256;
    assert.ok(verifierPath && pin, "GATE1_VERIFIER and GATE1_VERIFIER_SHA256 are required");
    const host = createAuthenticatedAssuranceHost(config);
    const grant = host.issueGrant(envelope, SYNTHETIC_ACTION);
    const dir = mkdtempSync(join(tmpdir(), "gate1-exit7-"));
    const fake = writeFakeHelper(
      dir,
      "#!/bin/sh\n/bin/cat >/dev/null\nprintf '%s\\n' '{\"schema\":\"galerina.signet.verdict.v1\",\"trit\":1,\"reason\":\"OK\",\"authorizing\":false}'\nexit 7\n",
    );
    const fakePin = sha256File(fake);
    const verdict = spawnSignetVerifier({
      verifierPath,
      expectedSha256Hex: pin,
      helperPath: fake,
      helperSha256Hex: fakePin,
      publicKeyHex: host.publicVerifyingKeyHex,
      statement: grant,
    });
    assert.equal(verdict.trit, -1, verdict.reason);
    assert.equal(verdict.reason, "VERIFIER_STATUS");
    assert.notEqual(verdict.trit, 1);
  });

  it("G4 C helper pin check is reached; PIN_MISMATCH and zero verifier output", () => {
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
    const loaded = loadPinnedVerifierBytes(verifierPath, pin);
    assert.equal(loaded.ok, true);
    resetSealedSpawnCount();
    takeLastHelperStdout();
    const verdict = execPinnedVerifierBytes(loaded.bytes, {
      expectedSha256Hex: "00".repeat(32),
      verifierPath,
      ...sealedHelper(),
      input: body,
    });
    assert.equal(verdict.reason, "VERIFIER_PIN_MISMATCH");
    assert.equal(verdict.status, 3);
    assert.equal(verdict.trit, -1);
    assert.equal(takeLastHelperStdout().trim(), "");
    assert.equal(takeSealedSpawnCount(), 1);
  });

  it("G8 helper exit 3 maps to PIN_MISMATCH", () => {
    const verifierPath = process.env.GATE1_VERIFIER;
    const pin = process.env.GATE1_VERIFIER_SHA256;
    assert.ok(verifierPath && pin, "GATE1_VERIFIER and GATE1_VERIFIER_SHA256 are required");
    const host = createAuthenticatedAssuranceHost(config);
    const grant = host.issueGrant(envelope, SYNTHETIC_ACTION);
    const dir = mkdtempSync(join(tmpdir(), "gate1-exit3-"));
    const fake = writeFakeHelper(dir, "#!/bin/sh\n/bin/cat >/dev/null\nexit 3\n");
    const fakePin = sha256File(fake);
    const verdict = spawnSignetVerifier({
      verifierPath,
      expectedSha256Hex: pin,
      helperPath: fake,
      helperSha256Hex: fakePin,
      publicKeyHex: host.publicVerifyingKeyHex,
      statement: grant,
    });
    assert.equal(verdict.reason, "VERIFIER_PIN_MISMATCH");
    assert.equal(verdict.status, 3);
    assert.equal(verdict.trit, -1);
  });

  it("G5 helper that skips sealing is refused", () => {
    const verifierPath = process.env.GATE1_VERIFIER;
    const pin = process.env.GATE1_VERIFIER_SHA256;
    assert.ok(verifierPath && pin, "GATE1_VERIFIER and GATE1_VERIFIER_SHA256 are required");
    const host = createAuthenticatedAssuranceHost(config);
    const grant = host.issueGrant(envelope, SYNTHETIC_ACTION);
    const src = readFileSync(sealedExecSrc, "utf8");
    const mutated = src.replace(
      "if (fcntl(mfd, F_ADD_SEALS,",
      "if (0 && fcntl(mfd, F_ADD_SEALS,",
    );
    assert.notEqual(mutated, src);
    const dir = mkdtempSync(join(tmpdir(), "gate1-unsealed-"));
    const cPath = join(dir, "unsealed.c");
    const helperPath = join(dir, "unsealed-helper");
    writeFileSync(cPath, mutated);
    const compiled = spawnSync("cc", ["-O2", "-Wall", "-Werror", "-o", helperPath, cPath], {
      encoding: "utf8",
    });
    assert.equal(compiled.status, 0, compiled.stderr);
    chmodSync(helperPath, 0o755);
    const helperSha256Hex = sha256File(helperPath);
    const loadedHelper = loadPinnedHelperBytes(helperPath, helperSha256Hex);
    assert.equal(loadedHelper.ok, true);
    const verdict = spawnSignetVerifier({
      verifierPath,
      expectedSha256Hex: pin,
      helperPath,
      helperSha256Hex,
      publicKeyHex: host.publicVerifyingKeyHex,
      statement: grant,
    });
    assert.notEqual(verdict.trit, 1, verdict.reason);
    assert.equal(verdict.authorizing, false);
  });

  it("issueGrant refuses a NaN or non-integer clock", () => {
    for (const clock of [() => Number.NaN, () => Number.POSITIVE_INFINITY, () => 1.5, () => "now"]) {
      const host = createAuthenticatedAssuranceHost(config, { clock });
      assert.throws(() => host.issueGrant(envelope, SYNTHETIC_ACTION), /clock is not a safe integer/);
    }
  });

  it("invalid options.epoch throws instead of falling back to 1", () => {
    for (const epoch of [Number.NaN, 0, 1.5, -1, "1", null]) {
      assert.throws(
        () => createAuthenticatedAssuranceHost(config, { epoch }),
        /host epoch must be a positive safe integer/,
      );
    }
    const host = createAuthenticatedAssuranceHost(config);
    assert.equal(host.currentEpoch(), 1);
  });

  it("G10 extra verdict key is VERIFIER_KEYS", () => {
    const verifierPath = process.env.GATE1_VERIFIER;
    const pin = process.env.GATE1_VERIFIER_SHA256;
    assert.ok(verifierPath && pin, "GATE1_VERIFIER and GATE1_VERIFIER_SHA256 are required");
    const host = createAuthenticatedAssuranceHost(config);
    const grant = host.issueGrant(envelope, SYNTHETIC_ACTION);
    const dir = mkdtempSync(join(tmpdir(), "gate1-g10-"));
    const fake = writeFakeHelper(
      dir,
      "#!/bin/sh\n/bin/cat >/dev/null\nprintf '%s\\n' '{\"schema\":\"galerina.signet.verdict.v1\",\"trit\":1,\"reason\":\"OK\",\"authorizing\":false,\"extra\":true}'\nexit 0\n",
    );
    const verdict = spawnSignetVerifier({
      verifierPath,
      expectedSha256Hex: pin,
      helperPath: fake,
      helperSha256Hex: sha256File(fake),
      publicKeyHex: host.publicVerifyingKeyHex,
      statement: grant,
    });
    assert.equal(verdict.reason, "VERIFIER_KEYS");
    assert.equal(verdict.trit, -1);
  });

  it("G11 authorizing true in a +1 verdict is VERIFIER_AUTHORIZING", () => {
    const verifierPath = process.env.GATE1_VERIFIER;
    const pin = process.env.GATE1_VERIFIER_SHA256;
    assert.ok(verifierPath && pin, "GATE1_VERIFIER and GATE1_VERIFIER_SHA256 are required");
    const host = createAuthenticatedAssuranceHost(config);
    const grant = host.issueGrant(envelope, SYNTHETIC_ACTION);
    const dir = mkdtempSync(join(tmpdir(), "gate1-g11-"));
    const fake = writeFakeHelper(
      dir,
      "#!/bin/sh\n/bin/cat >/dev/null\nprintf '%s\\n' '{\"schema\":\"galerina.signet.verdict.v1\",\"trit\":1,\"reason\":\"OK\",\"authorizing\":true}'\nexit 0\n",
    );
    const verdict = spawnSignetVerifier({
      verifierPath,
      expectedSha256Hex: pin,
      helperPath: fake,
      helperSha256Hex: sha256File(fake),
      publicKeyHex: host.publicVerifyingKeyHex,
      statement: grant,
    });
    assert.equal(verdict.reason, "VERIFIER_AUTHORIZING");
    assert.equal(verdict.trit, -1);
  });

  it("G13 empty verdict reason is VERIFIER_REASON", () => {
    const verifierPath = process.env.GATE1_VERIFIER;
    const pin = process.env.GATE1_VERIFIER_SHA256;
    assert.ok(verifierPath && pin, "GATE1_VERIFIER and GATE1_VERIFIER_SHA256 are required");
    const host = createAuthenticatedAssuranceHost(config);
    const grant = host.issueGrant(envelope, SYNTHETIC_ACTION);
    const dir = mkdtempSync(join(tmpdir(), "gate1-g13-"));
    const fake = writeFakeHelper(
      dir,
      "#!/bin/sh\n/bin/cat >/dev/null\nprintf '%s\\n' '{\"schema\":\"galerina.signet.verdict.v1\",\"trit\":1,\"reason\":\"\",\"authorizing\":false}'\nexit 0\n",
    );
    const verdict = spawnSignetVerifier({
      verifierPath,
      expectedSha256Hex: pin,
      helperPath: fake,
      helperSha256Hex: sha256File(fake),
      publicKeyHex: host.publicVerifyingKeyHex,
      statement: grant,
    });
    assert.equal(verdict.reason, "VERIFIER_REASON");
    assert.equal(verdict.trit, -1);
  });

  it("G14 uppercase helper pin is HELPER_PIN", () => {
    const verifierPath = process.env.GATE1_VERIFIER;
    const pin = process.env.GATE1_VERIFIER_SHA256;
    assert.ok(verifierPath && pin, "GATE1_VERIFIER and GATE1_VERIFIER_SHA256 are required");
    const host = createAuthenticatedAssuranceHost(config);
    const grant = host.issueGrant(envelope, SYNTHETIC_ACTION);
    const real = sealedHelper();
    const verdict = spawnSignetVerifier({
      verifierPath,
      expectedSha256Hex: pin,
      helperPath: real.helperPath,
      helperSha256Hex: real.helperSha256Hex.toUpperCase(),
      publicKeyHex: host.publicVerifyingKeyHex,
      statement: grant,
    });
    assert.equal(verdict.reason, "HELPER_PIN");
    assert.equal(verdict.trit, -1);
  });

  it("G12 hashed helper copy runs after helperPath is swapped", () => {
    const verifierPath = process.env.GATE1_VERIFIER;
    const pin = process.env.GATE1_VERIFIER_SHA256;
    assert.ok(verifierPath && pin, "GATE1_VERIFIER and GATE1_VERIFIER_SHA256 are required");
    const host = createAuthenticatedAssuranceHost(config);
    const tampered = {
      ...host.issueGrant(envelope, SYNTHETIC_ACTION),
    };
    const tamperedGrant = { ...tampered, signature: flipHex(tampered.signature) };
    const real = sealedHelper();
    const dir = mkdtempSync(join(tmpdir(), "gate1-g12-"));
    const helperCopy = join(dir, "helper");
    copyFileSync(real.helperPath, helperCopy);
    chmodSync(helperCopy, 0o755);
    const helperPin = sha256File(helperCopy);
    const fake = writeFakeHelper(
      dir,
      "#!/bin/sh\n/bin/cat >/dev/null\nprintf '%s\\n' '{\"schema\":\"galerina.signet.verdict.v1\",\"trit\":1,\"reason\":\"OK\",\"authorizing\":false}'\nexit 0\n",
    );
    setAfterHelperPinnedHook(() => {
      copyFileSync(fake, helperCopy);
      chmodSync(helperCopy, 0o755);
    });
    try {
      const verdict = spawnSignetVerifier({
        verifierPath,
        expectedSha256Hex: pin,
        helperPath: helperCopy,
        helperSha256Hex: helperPin,
        publicKeyHex: host.publicVerifyingKeyHex,
        statement: tamperedGrant,
      });
      assert.notEqual(verdict.trit, 1, verdict.reason);
      assert.equal(verdict.authorizing, false);
    } finally {
      setAfterHelperPinnedHook(null);
    }
  });

  it("DELIVERY_UNKNOWN seal is authentic +1 and classifySeal UNKNOWN, never ASSURED", () => {
    const verifierPath = process.env.GATE1_VERIFIER;
    const pin = process.env.GATE1_VERIFIER_SHA256;
    assert.ok(verifierPath && pin, "GATE1_VERIFIER and GATE1_VERIFIER_SHA256 are required");
    const host = createAuthenticatedAssuranceHost(config);
    const exploding = {
      apply() {
        throw new Error("partial then throw");
      },
    };
    const seal = host.applyGrant(host.issueGrant(envelope, SYNTHETIC_ACTION), SYNTHETIC_ACTION, exploding);
    assert.equal(seal.terminalOutcome, "DELIVERY_UNKNOWN");
    assert.equal(host.classifySeal(seal, "subject:component"), TRIT.UNKNOWN);
    assert.equal(host.classifySeal({ ...seal }, "subject:component"), TRIT.UNKNOWN);
    const header = validateVerifyRequest({
      publicKeyHex: host.publicVerifyingKeyHex,
      statement: seal,
    });
    assert.equal(header.ok, true);
    const failedHeader = validateVerifyRequest({
      publicKeyHex: host.publicVerifyingKeyHex,
      statement: { ...seal, terminalOutcome: "FAILED" },
    });
    assert.equal(failedHeader.ok, false);
    assert.equal(failedHeader.refusal.reason, "HEADER_TERMINAL");
    const verdict = spawnVerifier({
      verifierPath,
      expectedSha256Hex: pin,
      publicKeyHex: host.publicVerifyingKeyHex,
      statement: seal,
    });
    assert.equal(verdict.authorizing, false);
    assert.equal(verdict.trit, 1, verdict.reason);
    assert.equal(host.classifySeal(seal, "subject:component"), TRIT.UNKNOWN);
  });
});

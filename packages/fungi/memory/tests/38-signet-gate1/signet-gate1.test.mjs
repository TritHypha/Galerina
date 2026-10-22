import { spawnSync } from "node:child_process";
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";

const HERE = dirname(fileURLToPath(import.meta.url));
const MEM = join(HERE, "..", "..");
const REPO = join(MEM, "..", "..", "..");
const BOUNDARY = join(MEM, "src", "c-boundary.fungi");
const RCP = join(MEM, "src", "release-commit-point.fungi");
const UNIT = join(MEM, "src", "signet-grant-seal.fungi");
const GALERINA = join(REPO, "galerina.mjs");
const CB_IMPORT = "\nimport \"./c-boundary.fungi\"\n";
const RCP_IMPORT = "\nimport \"./release-commit-point.fungi\"\n";

let unitSourceOverride = null;

function invoke(file, flow, args) {
  const argv = [GALERINA, "run", file, "--invoke", flow, ...args.map(String)];
  const r = spawnSync(process.execPath, argv, { encoding: "utf8", cwd: REPO, timeout: 120000 });
  const text = (r.stdout || "") + (r.stderr || "");
  const m = text.match(/=>\s*(-?\d+)\s*$/m) || text.match(/(-?\d+)\s*$/);
  if (!m) {
    return { status: r.status, text, present: false, reason: "INVOKE_VALUE_ABSENT", value: 0 };
  }
  const value = Number(m[1]);
  if (Number.isSafeInteger(value) !== true) {
    return { status: r.status, text, present: false, reason: "INVOKE_VALUE_NOT_SAFE_INTEGER", value: 0 };
  }
  return { status: r.status, text, present: true, reason: "INVOKE_VALUE_PRESENT", value };
}

function stripVersion(src) {
  const marker = "@version 1";
  const first = src.indexOf(marker);
  assert.notEqual(first, -1, "version marker");
  return src.slice(first + marker.length);
}

function flattenUnit() {
  const boundary = readFileSync(BOUNDARY, "utf8");
  const rcp = readFileSync(RCP, "utf8");
  const unit = unitSourceOverride !== null ? unitSourceOverride : readFileSync(UNIT, "utf8");
  assert.equal(unit.includes(CB_IMPORT), true, "landed source must import c-boundary");
  assert.equal(unit.includes(RCP_IMPORT), true, "landed source must import release-commit-point");
  const cbParts = unit.split(CB_IMPORT);
  assert.equal(cbParts.length, 2, "c-boundary import line must occur once");
  const afterCb = cbParts[0] + cbParts[1];
  const rcpParts = afterCb.split(RCP_IMPORT);
  assert.equal(rcpParts.length, 2, "release-commit-point import line must occur once");
  const rest = stripVersion(rcpParts[0] + rcpParts[1]);
  const rcpBody = stripVersion(rcp);
  const dir = mkdtempSync(join(tmpdir(), "q38-flat-"));
  const file = join(dir, "flat.fungi");
  writeFileSync(file, boundary + "\n" + rcpBody + "\n" + rest);
  return { dir, file };
}

function runFlow(flow, args) {
  const flat = flattenUnit();
  try {
    return invoke(flat.file, flow, args);
  } finally {
    rmSync(flat.dir, { recursive: true, force: true });
  }
}

function issue(over) {
  const o = over || {};
  return runFlow("issueGrant", [
    o.subjectCountClass ?? 0,
    o.subjectCount ?? 1,
    o.duplicateClass ?? 0,
    o.duplicateToken ?? 0,
    o.digestClass ?? 0,
    o.digestOk ?? 1,
    o.profileClass ?? 0,
    o.profilePresent ?? 1,
    o.epochClass ?? 0,
    o.epoch ?? 1,
    o.clockClass ?? 0,
    o.clock ?? 1000,
    o.clockPresentClass ?? 0,
    o.clockPresent ?? 1,
    o.randomClass ?? 0,
    o.randomPresent ?? 1,
    o.keyClass ?? 0,
    o.keyPresent ?? 1,
    o.ttlClass ?? 0,
    o.ttl ?? 60000,
    o.suiteClass ?? 0,
    o.suiteId ?? 0,
    o.pqClass ?? 0,
    o.pqAvailable ?? 1,
  ]);
}

function authenticate(over) {
  const o = over || {};
  return runFlow("authenticateGrant", [
    o.shapeClass ?? 0,
    o.shapeToken ?? 0,
    o.tamperClass ?? 0,
    o.tamperToken ?? 0,
    o.issuerClass ?? 0,
    o.issuerPinned ?? 1,
    o.actionClass ?? 0,
    o.actionMatch ?? 1,
    o.epochMatchClass ?? 0,
    o.epochMatch ?? 1,
    o.profileMatchClass ?? 0,
    o.profileMatch ?? 1,
    o.grantEpochClass ?? 0,
    o.grantEpoch ?? 1,
    o.currentEpochClass ?? 0,
    o.currentEpoch ?? 1,
    o.grantProfileClass ?? 0,
    o.grantProfile ?? 1,
    o.currentProfileClass ?? 0,
    o.currentProfile ?? 1,
    o.declaredClass ?? 0,
    o.declaredToken ?? 1,
    o.expiredClass ?? 0,
    o.expiredToken ?? 0,
    o.suiteClass ?? 0,
    o.suiteId ?? 0,
    o.pqClass ?? 0,
    o.pqAvailable ?? 1,
  ]);
}

function pre(over) {
  const o = over || {};
  return runFlow("applyPreSink", [
    o.authPackedClass ?? 0,
    o.authPacked ?? 100,
    o.consumedClass ?? 0,
    o.consumedToken ?? 0,
    o.restartClass ?? 0,
    o.restartToken ?? 0,
    o.epochExhClass ?? 0,
    o.epochExhausted ?? 0,
    o.cleanupClass ?? 0,
    o.cleanupEvidence ?? 1,
    o.suiteClass ?? 0,
    o.suiteId ?? 0,
    o.pqClass ?? 0,
    o.pqAvailable ?? 1,
    o.issueClockClass ?? 0,
    o.issueClock ?? 1000,
    o.applyClockClass ?? 0,
    o.applyClock ?? 2000,
    o.ttlClass ?? 0,
    o.ttl ?? 60000,
    o.issueGenClass ?? 0,
    o.issueClockGen ?? 1,
    o.applyGenClass ?? 0,
    o.applyClockGen ?? 1,
    o.clockEpochClass ?? 0,
    o.clockEpochMatch ?? 1,
    o.authTokClass ?? 0,
    o.independentAuthToken ?? 1,
    o.custodyClass ?? 0,
    o.preparedCustodyToken ?? 1,
    o.emptyClass ?? 0,
    o.emptyObligationSetToken ?? 1,
    o.consumedAuthClass ?? 0,
    o.consumedAuthorityToken ?? 1,
    o.validityClass ?? 0,
    o.currentValidityToken ?? 1,
    o.presentClass ?? 0,
    o.presentToken ?? 1,
    o.matchClass ?? 0,
    o.tokenMatchToken ?? 1,
    o.epochMatchClass ?? 0,
    o.epochMatchToken ?? 1,
    o.leaseClass ?? 0,
    o.leaseState ?? 0,
    o.revokeClass ?? 0,
    o.revokeCommittedToken ?? 0,
  ]);
}

function post(over) {
  const o = over || {};
  return runFlow("applyPostSink", [
    o.preClass ?? 0,
    o.prePacked ?? 100,
    o.sinkClass ?? 0,
    o.sinkOutcome ?? 0,
    o.cleanupClass ?? 0,
    o.cleanupEvidence ?? 1,
    o.authTokClass ?? 0,
    o.independentAuthToken ?? 1,
    o.custodyClass ?? 0,
    o.preparedCustodyToken ?? 1,
    o.emptyClass ?? 0,
    o.emptyObligationSetToken ?? 1,
    o.consumedAuthClass ?? 0,
    o.consumedAuthorityToken ?? 1,
    o.validityClass ?? 0,
    o.currentValidityToken ?? 1,
  ]);
}

function apply(over) {
  const p = pre(over);
  if (p.present !== true || p.value !== 100) {
    return p;
  }
  return post({ ...(over || {}), prePacked: 100 });
}

function classify(over) {
  const o = over || {};
  return runFlow("classifySeal", [
    o.kindClass ?? 0,
    o.sealKind ?? 1,
    o.pathClass ?? 0,
    o.identityPath ?? 0,
    o.suiteClass ?? 0,
    o.suiteId ?? 0,
    o.pqClass ?? 0,
    o.pqAvailable ?? 1,
  ]);
}

function restart(over) {
  const o = over || {};
  return runFlow("restartHost", [
    o.epochClass ?? 0,
    o.epoch ?? 1,
  ]);
}

function verify(over) {
  const o = over || {};
  return runFlow("validateVerifyRequest", [
    o.validatedClass ?? 0,
    o.validatedBeforeSerialize ?? 1,
    o.bodyClass ?? 0,
    o.bodyBytes ?? 100,
    o.getterClass ?? 0,
    o.getterChanging ?? 0,
    o.pinnedClass ?? 0,
    o.pinnedSize ?? 1024,
    o.readClass ?? 0,
    o.verifierRead ?? 1,
    o.exitClass ?? 0,
    o.childExit ?? 0,
    o.kindClass ?? 0,
    o.childKind ?? 1,
    o.tritClass ?? 0,
    o.tritToken ?? 1,
    o.authorizingClass ?? 0,
    o.authorizingToken ?? 0,
    o.extraClass ?? 0,
    o.extraKey ?? 0,
    o.hookClass ?? 0,
    o.testHook ?? 0,
    o.cleanupClass ?? 0,
    o.cleanupEvidence ?? 1,
    o.authTokClass ?? 0,
    o.independentAuthToken ?? 1,
    o.custodyClass ?? 0,
    o.preparedCustodyToken ?? 1,
    o.emptyClass ?? 0,
    o.emptyObligationSetToken ?? 1,
    o.consumedAuthClass ?? 0,
    o.consumedAuthorityToken ?? 1,
    o.validityClass ?? 0,
    o.currentValidityToken ?? 1,
  ]);
}

function expectPacked(r, expected, label) {
  assert.equal(r.status, 0, label + " status " + r.reason + " " + r.text);
  assert.equal(r.present, true, label + " " + r.reason + " " + r.text);
  assert.equal(r.value, expected, label + " " + r.text);
}

function replaceOnce(s, from, to) {
  const i = s.indexOf(from);
  assert.notEqual(i, -1, "needle missing: " + from.slice(0, 80));
  const j = s.indexOf(from, i + from.length);
  assert.equal(j, -1, "needle not unique: " + from.slice(0, 80));
  return s.slice(0, i) + to + s.slice(i + from.length);
}

function shaOf(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function withMutant(from, to, runRed) {
  const origBytes = readFileSync(UNIT);
  const orig = origBytes.toString("utf8");
  const before = shaOf(origBytes);
  const mutant = replaceOnce(orig, from, to);
  const prev = unitSourceOverride;
  unitSourceOverride = mutant;
  try {
    runRed();
  } finally {
    unitSourceOverride = prev;
    const after = shaOf(readFileSync(UNIT));
    assert.equal(after, before, "tracked UNIT must be unchanged after mutant");
  }
}

test("c-boundary helper still maps classTag 0..10 and unlisted 11", () => {
  expectPacked(invoke(BOUNDARY, "readForeignSafeInteger", [0, 4]), 0, "ok");
  expectPacked(invoke(BOUNDARY, "readForeignSafeInteger", [3, 0]), 3, "NaN");
  expectPacked(invoke(BOUNDARY, "readForeignSafeInteger", [11, 0]), 11, "unlisted");
});

test("CN-1 unit imports helper once and does not copy the classTag table", () => {
  const unit = readFileSync(UNIT, "utf8");
  assert.equal(unit.includes(CB_IMPORT), true);
  assert.equal(unit.split(CB_IMPORT).length, 2);
  assert.equal(unit.includes("if classTag == 0"), false, "no helper copy");
  assert.equal(unit.includes("pure flow finish("), false, "finish lives in release-commit-point");
});

test("MUST-ADMIT hybrid issue with clock random key and positive TTL", () => {
  expectPacked(issue({}), 100, "issued");
});

test("MUST-REFUSE empty subjects", () => {
  expectPacked(issue({ subjectCount: 0 }), 101, "empty");
});

test("MUST-REFUSE duplicate subjects", () => {
  expectPacked(issue({ duplicateToken: 1 }), 102, "duplicate");
});

test("MUST-REFUSE bad digest missing profile bad epoch", () => {
  expectPacked(issue({ digestOk: 0 }), 103, "digest");
  expectPacked(issue({ profilePresent: 0 }), 104, "profile");
  expectPacked(issue({ epoch: 0 }), 105, "epoch zero");
});

test("MUST-REFUSE missing clock random key", () => {
  expectPacked(issue({ clockPresent: 0 }), 106, "clock");
  expectPacked(issue({ clock: -1 }), 106, "negative clock");
  expectPacked(issue({ randomPresent: 0 }), 107, "random");
  expectPacked(issue({ keyPresent: 0 }), 108, "key");
});

test("MUST-REFUSE TTL zero negative over bound", () => {
  expectPacked(issue({ ttl: 0 }), 109, "ttl 0");
  expectPacked(issue({ ttl: -3 }), 109, "ttl neg");
  expectPacked(issue({ ttl: 86400001 }), 109, "ttl over");
});

test("MUST-REFUSE issuedAt plus TTL overflow", () => {
  expectPacked(issue({ clock: 2147483647, ttl: 1 }), 112, "overflow");
});

test("MUST-REFUSE unknown suite and classical-only issue", () => {
  expectPacked(issue({ suiteId: 2 }), 113, "unknown suite");
  expectPacked(issue({ suiteId: 1 }), 114, "classical-only");
  expectPacked(issue({ pqAvailable: 0 }), 114, "pq missing");
});

test("MUST-ADMIT authenticate exact hybrid grant", () => {
  expectPacked(authenticate({}), 100, "auth");
});

test("MUST-REFUSE getter proxy extra missing symbol", () => {
  expectPacked(authenticate({ shapeToken: 1 }), 123, "getter");
  expectPacked(authenticate({ shapeToken: 2 }), 123, "proxy");
  expectPacked(authenticate({ shapeToken: 3 }), 123, "extra");
  expectPacked(authenticate({ shapeToken: 4 }), 123, "missing");
  expectPacked(authenticate({ shapeToken: 5 }), 123, "symbol");
});

test("MUST-REFUSE tamper unpinned wrong action previous epoch profile undeclared expired", () => {
  expectPacked(authenticate({ tamperToken: 1 }), 115, "tamper");
  expectPacked(authenticate({ issuerPinned: 0 }), 116, "unpinned");
  expectPacked(authenticate({ actionMatch: 0 }), 117, "action");
  expectPacked(authenticate({ epochMatch: 0 }), 118, "prev epoch");
  expectPacked(authenticate({ profileMatch: 0 }), 119, "prev profile");
  expectPacked(authenticate({ declaredToken: 0 }), 121, "undeclared");
  expectPacked(authenticate({ expiredToken: 1 }), 122, "expired");
});

test("MUST-REFUSE listed cleanup after consume Success as DELIVERY_UNKNOWN", () => {
  expectPacked(apply({}), 106, "cleanup 1");
  expectPacked(apply({ cleanupEvidence: 0 }), 106, "cleanup 0");
});

test("MUST-REFUSE replayed grant", () => {
  expectPacked(apply({ consumedToken: 1 }), 126, "replay");
});

test("MUST-REFUSE sink Failed and Refused after consume", () => {
  expectPacked(apply({ sinkOutcome: 1 }), 127, "failed");
  expectPacked(apply({ sinkOutcome: 2 }), 128, "refused");
});

test("MUST-REFUSE sink Indeterminate and crash as DELIVERY_UNKNOWN", () => {
  expectPacked(apply({ sinkOutcome: 3 }), 106, "indeterminate");
  expectPacked(apply({ sinkOutcome: 4 }), 106, "crash");
});

test("MUST-REFUSE clock regression different clock epoch and expired apply", () => {
  expectPacked(apply({ applyClock: 500 }), 130, "regression");
  expectPacked(apply({ clockEpochMatch: 0 }), 130, "clock epoch");
  expectPacked(apply({ applyClock: 100000 }), 122, "expired apply");
});

test("MUST-REFUSE restart then old grant and epoch exhaustion", () => {
  expectPacked(apply({ restartToken: 1 }), 131, "restart");
  expectPacked(apply({ epochExhausted: 1 }), 132, "exhaust");
});

test("MUST-REFUSE classical-only apply never hybrid success", () => {
  expectPacked(apply({ pqAvailable: 0 }), 114, "pq apply");
  expectPacked(apply({ suiteId: 1 }), 114, "classical apply");
});

test("MUST-REFUSE cleanup UNKNOWN via releaseGuard on apply", () => {
  expectPacked(apply({ cleanupEvidence: 4 }), 106, "cleanup unknown");
  expectPacked(apply({ cleanupEvidence: 2 }), 106, "cleanup pending");
  expectPacked(apply({ cleanupEvidence: 3 }), 106, "cleanup failed");
});

test("MUST-ADMIT classify current CONSUMED hybrid as Assured", () => {
  expectPacked(classify({}), 100, "assured identity");
  expectPacked(classify({ identityPath: 1 }), 100, "assured copy");
});

test("MUST-REFUSE classify typed Absent Unknown forged Distrusted", () => {
  expectPacked(classify({ sealKind: 0 }), 101, "absent");
  expectPacked(classify({ sealKind: 3 }), 102, "forged");
  expectPacked(classify({ sealKind: 2 }), 101, "delivery unknown");
});

test("MUST-REFUSE classify previous epoch and profile Distrusted on both paths", () => {
  expectPacked(classify({ sealKind: 4, identityPath: 0 }), 102, "prev epoch identity");
  expectPacked(classify({ sealKind: 4, identityPath: 1 }), 102, "prev epoch copy");
  expectPacked(classify({ sealKind: 5, identityPath: 0 }), 102, "prev profile identity");
  expectPacked(classify({ sealKind: 5, identityPath: 1 }), 102, "prev profile copy");
  expectPacked(classify({ sealKind: 6 }), 102, "authorizing true");
});

test("MUST-REFUSE classify default unlisted and classical-only never Assured", () => {
  expectPacked(classify({ sealKind: 9 }), 111, "unlisted default");
  expectPacked(classify({ pqAvailable: 0 }), 101, "pq unknown");
  expectPacked(classify({ suiteId: 1 }), 101, "classical unknown");
  expectPacked(classify({ suiteId: 2 }), 102, "unknown suite distrust");
});

test("MUST-ADMIT restart within epoch range", () => {
  expectPacked(restart({}), 100, "restart");
});

test("MUST-REFUSE epoch exhaustion on restart", () => {
  expectPacked(restart({ epoch: 2147483647 }), 132, "exhaust");
  expectPacked(restart({ epoch: 0 }), 105, "bad epoch");
});

test("MUST-REFUSE listed cleanup after trit allow as DELIVERY_UNKNOWN", () => {
  expectPacked(verify({}), 106, "verify cleanup 1");
  expectPacked(verify({ cleanupEvidence: 0 }), 106, "verify cleanup 0");
});

test("MUST-REFUSE serialise before validate getter body over pinned over", () => {
  expectPacked(verify({ validatedBeforeSerialize: 0 }), 143, "serialize first");
  expectPacked(verify({ getterChanging: 1 }), 145, "getter");
  expectPacked(verify({ bodyBytes: 16385 }), 144, "body over");
  expectPacked(verify({ pinnedSize: 67108865 }), 146, "pinned over");
});

test("MUST-REFUSE verifier unavailable unlisted exit exit3 trit authorizing hook", () => {
  expectPacked(verify({ verifierRead: 0 }), 147, "unavailable");
  expectPacked(verify({ tritToken: 0, childExit: 1 }), 148, "exit 1");
  expectPacked(verify({ tritToken: 0, childExit: 5 }), 148, "exit 5");
  expectPacked(verify({ tritToken: 0, childExit: 137 }), 148, "exit 137");
  expectPacked(verify({ tritToken: 0, childExit: 3 }), 149, "exit 3");
  expectPacked(verify({ tritToken: 2 }), 150, "trit 2");
  expectPacked(verify({ tritToken: 1, childExit: 1 }), 151, "trit plus nonzero");
  expectPacked(verify({ extraKey: 1 }), 152, "extra");
  expectPacked(verify({ authorizingToken: 1 }), 153, "authorizing");
  expectPacked(verify({ testHook: 1 }), 154, "hook");
  expectPacked(verify({ tritToken: 0, childExit: -1 }), 156, "signal");
  expectPacked(verify({ tritToken: 0, childExit: -2 }), 157, "timeout");
  expectPacked(verify({ tritToken: 0, childExit: -3 }), 158, "stdout over");
});

test("MUST-REFUSE verify cleanup failure reported", () => {
  expectPacked(verify({ cleanupEvidence: 4 }), 106, "cleanup unknown");
  expectPacked(verify({ cleanupEvidence: 3 }), 106, "cleanup failed");
});

test("MUST-REFUSE foreign classTag on issue", () => {
  expectPacked(issue({ subjectCountClass: 3 }), 110, "NaN");
  expectPacked(issue({ ttlClass: 11 }), 111, "unlisted class");
});

test("F5 epoch and profile compared in-unit", () => {
  expectPacked(authenticate({ grantEpoch: 1, currentEpoch: 2, epochMatch: 1 }), 118, "epoch values");
  expectPacked(authenticate({ grantEpoch: 1, currentEpoch: 1, epochMatch: 0 }), 118, "epoch token disagree");
  expectPacked(authenticate({ grantProfile: 1, currentProfile: 9, profileMatch: 1 }), 119, "profile values");
  expectPacked(authenticate({ grantProfile: 1, currentProfile: 1, profileMatch: 0 }), 119, "profile token disagree");
});

test("F5 pre-sink takes packed authenticate and compares clock generation", () => {
  expectPacked(pre({ authPacked: 118 }), 111, "non-auth packed");
  expectPacked(pre({ issueClockGen: 1, applyClockGen: 2, clockEpochMatch: 1 }), 130, "clock gen values");
  expectPacked(pre({ issueClockGen: 1, applyClockGen: 1, clockEpochMatch: 0 }), 130, "clock gen token disagree");
});

test("F4 admit only trit 1 with exit 0", () => {
  expectPacked(verify({ tritToken: -1, childExit: 0 }), 159, "trit deny");
  expectPacked(verify({ tritToken: 0, childExit: 0 }), 159, "trit unknown");
  expectPacked(verify({ tritToken: 1, childExit: 0 }), 106, "trit allow listed cleanup");
});

test("F3 pre-sink refusals reachable with no sink outcome", () => {
  expectPacked(pre({ consumedToken: 1 }), 126, "replay pre");
  expectPacked(pre({ restartToken: 1 }), 131, "restart pre");
  expectPacked(pre({ applyClock: 500 }), 130, "regression pre");
  expectPacked(pre({ pqAvailable: 0 }), 114, "pq pre");
  expectPacked(pre({}), 100, "pre consume-ok");
});

test("F3 post-sink with a non-consume pre-code refuses", () => {
  expectPacked(post({ prePacked: 126 }), 111, "replay prePacked");
  expectPacked(post({ prePacked: 0 }), 111, "unpacked");
  expectPacked(post({ prePacked: 106 }), 111, "unknown prePacked");
});

test("F1 release tokens pass through commit point", () => {
  expectPacked(pre({ independentAuthToken: 0 }), 105, "auth absent");
  expectPacked(pre({ preparedCustodyToken: 0 }), 105, "custody absent");
  expectPacked(pre({ presentToken: 0 }), 105, "consume missing");
  expectPacked(pre({ revokeCommittedToken: 1 }), 102, "revoke first");
  expectPacked(pre({ consumedAuthorityToken: 0 }), 106, "consumed authority unknown");
  expectPacked(pre({ emptyObligationSetToken: 0, cleanupEvidence: 0 }), 102, "empty obligation");
  expectPacked(pre({ tokenMatchToken: 0 }), 102, "token mismatch");
  expectPacked(pre({ epochMatchToken: 0 }), 104, "epoch mismatch");
  expectPacked(pre({ authTokClass: 3 }), 110, "auth NaN");
  expectPacked(pre({ authTokClass: 11 }), 111, "auth unlisted");
  expectPacked(pre({ presentClass: 3 }), 110, "present NaN");
  expectPacked(pre({ presentClass: 11 }), 111, "present unlisted");
  expectPacked(pre({ revokeClass: 3 }), 110, "revoke NaN");
  expectPacked(pre({ revokeClass: 11 }), 111, "revoke unlisted");
  expectPacked(pre({ validityClass: 3 }), 110, "validity NaN");
  expectPacked(pre({ validityClass: 11 }), 111, "validity unlisted");
  expectPacked(pre({ cleanupClass: 3 }), 110, "cleanup NaN");
  expectPacked(pre({ cleanupClass: 11 }), 111, "cleanup unlisted");
  expectPacked(verify({ cleanupClass: 3 }), 110, "verify cleanup NaN");
  expectPacked(verify({ cleanupClass: 11 }), 111, "verify cleanup unlisted");
  expectPacked(verify({ authTokClass: 3 }), 110, "verify auth NaN");
  expectPacked(verify({ authTokClass: 11 }), 111, "verify auth unlisted");
});

test("RED mutant accept classical-only as hybrid issue", () => {
  withMutant(
    "  if pqAvailable == 0 {\n    return finish(14, true)\n  }\n  if suiteId != 0 {\n    return finish(13, true)\n  }\n  return finish(0, true)\n}\n\npure flow authenticateGrant(",
    "  if pqAvailable == 0 {\n    return finish(0, true)\n  }\n  if suiteId != 0 {\n    return finish(13, true)\n  }\n  return finish(0, true)\n}\n\npure flow authenticateGrant(",
    () => {
      const r = issue({ pqAvailable: 0 });
      assert.notEqual(r.value, 114, "classical-only must not stay PQ unavailable");
      assert.equal(r.value, 100, "classical-only issued");
    },
  );
  expectPacked(issue({ pqAvailable: 0 }), 114, "restore pq issue");
});

test("RED mutant drop suite-id unknown check", () => {
  withMutant(
    "  if suiteId != 0 {\n    if suiteId != 1 {\n      return finish(13, true)\n    }\n  }\n  if subjectCount == 0 {",
    "  if suiteId != 0 {\n    if suiteId != 1 {\n      return finish(0, true)\n    }\n  }\n  if subjectCount == 0 {",
    () => {
      const r = issue({ suiteId: 2 });
      assert.notEqual(r.value, 113, "unknown suite must not stay unknown");
      assert.equal(r.value, 100, "unknown suite issued");
    },
  );
  expectPacked(issue({ suiteId: 2 }), 113, "restore suite");
});

test("RED mutant map sink Failed to CONSUMED", () => {
  withMutant(
    "  if sinkOutcome == 1 {\n    return finish(27, true)\n  }",
    "  if sinkOutcome == 1 {\n    return finish(0, true)\n  }",
    () => {
      const r = apply({ sinkOutcome: 1 });
      assert.notEqual(r.value, 127, "Failed must not stay Failed");
      assert.equal(r.value, 100, "Failed consumed");
    },
  );
  expectPacked(apply({ sinkOutcome: 1 }), 127, "restore failed");
});

test("RED mutant accept TTL 0", () => {
  withMutant(
    "  if ttl < 1 {\n    return finish(9, true)\n  }\n  if ttl > 86400000 {\n    return finish(9, true)\n  }\n  if clock > 2147483647 - ttl {",
    "  if ttl < 1 {\n    return finish(0, true)\n  }\n  if ttl > 86400000 {\n    return finish(9, true)\n  }\n  if clock > 2147483647 - ttl {",
    () => {
      const r = issue({ ttl: 0 });
      assert.notEqual(r.value, 109, "TTL 0 must not stay ttl-bound");
      assert.equal(r.value, 100, "TTL 0 issued");
    },
  );
  expectPacked(issue({ ttl: 0 }), 109, "restore ttl");
});

test("RED mutant drop overflow check", () => {
  withMutant(
    "  if clock > 2147483647 - ttl {\n    return finish(12, true)\n  }",
    "  if clock == 99 {\n    return finish(12, true)\n  }",
    () => {
      const r = issue({ clock: 2147483647, ttl: 1 });
      assert.notEqual(r.value, 112, "overflow must not stay overflow");
      assert.equal(r.value, 100, "overflow issued");
    },
  );
  expectPacked(issue({ clock: 2147483647, ttl: 1 }), 112, "restore overflow");
});

test("RED mutant map forged absent to Unknown", () => {
  withMutant(
    "  if sealKind == 3 {\n    return finish(2, true)\n  }",
    "  if sealKind == 3 {\n    return finish(1, true)\n  }",
    () => {
      const r = classify({ sealKind: 3 });
      assert.notEqual(r.value, 102, "forged must not stay Distrusted");
      assert.equal(r.value, 101, "forged Unknown");
    },
  );
  expectPacked(classify({ sealKind: 3 }), 102, "restore forged");
});

test("RED mutant turn classification default into Assured", () => {
  withMutant(
    "    return finish(0, true)\n  }\n  return finish(11, true)\n}\n\npure flow restartHost(",
    "    return finish(0, true)\n  }\n  return finish(0, true)\n}\n\npure flow restartHost(",
    () => {
      const r = classify({ sealKind: 9 });
      assert.notEqual(r.value, 111, "default must not stay Unlisted");
      assert.equal(r.value, 100, "default Assured");
    },
  );
  expectPacked(classify({ sealKind: 9 }), 111, "restore default");
});

test("RED mutant serialise before validating", () => {
  withMutant(
    "  if validatedBeforeSerialize == 0 {\n    return finish(43, true)\n  }",
    "  if validatedBeforeSerialize == 99 {\n    return finish(43, true)\n  }",
    () => {
      const r = verify({ validatedBeforeSerialize: 0 });
      assert.notEqual(r.value, 143, "serialize-first must not stay");
      assert.equal(r.value, 106, "serialize-first reached listed cleanup");
    },
  );
  expectPacked(verify({ validatedBeforeSerialize: 0 }), 143, "restore serialize");
});

test("RED mutant unlisted exit reaches stdout parsing", () => {
  withMutant(
    "                    if childExit != -3 {\n                      return finish(48, true)\n                    }",
    "                    if childExit != -3 {\n                      return finish(0, true)\n                    }",
    () => {
      const r = verify({ childExit: 99 });
      assert.notEqual(r.value, 148, "unlisted exit must not stay");
      assert.equal(r.value, 100, "unlisted exit admitted");
    },
  );
  expectPacked(verify({ childExit: 99 }), 148, "restore unlisted exit");
});

test("RED mutant accept trit plus one with nonzero exit", () => {
  withMutant(
    "  if tritToken == 1 {\n    if childExit != 0 {\n      return finish(51, true)\n    }\n  }",
    "  if tritToken == 1 {\n    if childExit != 0 {\n      return finish(0, true)\n    }\n  }",
    () => {
      const r = verify({ tritToken: 1, childExit: 1 });
      assert.notEqual(r.value, 151, "trit plus nonzero must not stay");
      assert.equal(r.value, 100, "trit plus nonzero admitted");
    },
  );
  expectPacked(verify({ tritToken: 1, childExit: 1 }), 151, "restore trit");
});

test("RED mutant swallow cleanup error", () => {
  withMutant(
    "  if childExit == 3 {\n    return finish(49, true)\n  }\n  let guardOutcome: Int = releaseGuard(independentAuthToken, preparedCustodyToken, cleanupEvidence, emptyObligationSetToken, consumedAuthorityToken, currentValidityToken)\n  if guardOutcome != 100 {\n    return guardOutcome\n  }\n  return finish(6, true)\n}",
    "  if childExit == 3 {\n    return finish(49, true)\n  }\n  let guardOutcome: Int = releaseGuard(independentAuthToken, preparedCustodyToken, cleanupEvidence, emptyObligationSetToken, consumedAuthorityToken, currentValidityToken)\n  if guardOutcome != 100 {\n    return guardOutcome\n  }\n  return finish(0, true)\n}",
    () => {
      const r = verify({ cleanupEvidence: 1 });
      assert.notEqual(r.value, 106, "listed cleanup must not stay unknown");
      assert.equal(r.value, 100, "listed cleanup swallowed");
    },
  );
  expectPacked(verify({ cleanupEvidence: 1 }), 106, "restore listed cleanup");
});

test("RED mutant F1 remove consumeStep", () => {
  withMutant(
    "  let consumed: Int = consumeStep(presentToken, tokenMatchToken, 0, epochMatchToken, leaseState, revokeCommittedToken, guardOutcome)\n  return consumed\n}",
    "  return guardOutcome\n}",
    () => {
      const r = pre({ presentToken: 0 });
      assert.notEqual(r.value, 105, "missing present must not stay missing");
      assert.equal(r.value, 100, "consumeStep gone returns guard");
    },
  );
  expectPacked(pre({ presentToken: 0 }), 105, "restore consumeStep");
});

test("RED mutant F2 return packed 100 on listed cleanup", () => {
  withMutant(
    "  if sinkOutcome != 0 {\n    return finish(11, true)\n  }\n  return finish(6, true)\n}",
    "  if sinkOutcome != 0 {\n    return finish(11, true)\n  }\n  return finish(0, true)\n}",
    () => {
      const r = apply({});
      assert.notEqual(r.value, 106, "listed cleanup must not stay unknown");
      assert.equal(r.value, 100, "listed cleanup delivered");
    },
  );
  expectPacked(apply({}), 106, "restore MB-06");
});

test("F1 F2 post-sink UNKNOWN never REFUSED after consume", () => {
  expectPacked(post({ sinkOutcome: 3, independentAuthToken: 0 }), 106, "indeterminate auth 0");
  expectPacked(post({ sinkOutcome: 3, preparedCustodyToken: 0 }), 106, "indeterminate custody 0");
  expectPacked(post({ sinkOutcome: 3, emptyObligationSetToken: 0 }), 106, "indeterminate empty 0");
  expectPacked(post({ sinkOutcome: 3, consumedAuthorityToken: 0 }), 106, "indeterminate consumed 0");
  expectPacked(post({ sinkOutcome: 3, currentValidityToken: 0 }), 106, "indeterminate validity 0");
  expectPacked(post({ sinkOutcome: 4, independentAuthToken: 0 }), 106, "crash auth 0");
  expectPacked(post({ sinkOutcome: 4, preparedCustodyToken: 0 }), 106, "crash custody 0");
  expectPacked(post({ sinkOutcome: 4, emptyObligationSetToken: 0 }), 106, "crash empty 0");
  expectPacked(post({ sinkOutcome: 4, consumedAuthorityToken: 0 }), 106, "crash consumed 0");
  expectPacked(post({ sinkOutcome: 4, currentValidityToken: 0 }), 106, "crash validity 0");
  expectPacked(post({ sinkOutcome: 0, independentAuthToken: 0 }), 106, "success auth 0");
  expectPacked(post({ sinkOutcome: 0, preparedCustodyToken: 0 }), 106, "success custody 0");
  expectPacked(post({ sinkOutcome: 0, emptyObligationSetToken: 0 }), 106, "success empty 0");
  expectPacked(post({ sinkOutcome: 0, consumedAuthorityToken: 0 }), 106, "success consumed 0");
  expectPacked(post({ sinkOutcome: 0, currentValidityToken: 0 }), 106, "success validity 0");
  expectPacked(post({ sinkOutcome: 0, cleanupEvidence: 0, emptyObligationSetToken: 0 }), 106, "success cleanup 0 empty 0");
  expectPacked(post({ sinkOutcome: 1, independentAuthToken: 0 }), 127, "failed stays failed");
  expectPacked(post({ sinkOutcome: 2, preparedCustodyToken: 0 }), 128, "refused stays refused");
});

test("RED mutant F1 restore releaseGuard on Indeterminate", () => {
  withMutant(
    "  if sinkOutcome == 3 {\n    return finish(6, true)\n  }",
    "  if sinkOutcome == 3 {\n    let unknownIndeterminate: Int = releaseGuard(independentAuthToken, preparedCustodyToken, 4, emptyObligationSetToken, consumedAuthorityToken, currentValidityToken)\n    return unknownIndeterminate\n  }",
    () => {
      const r = post({ sinkOutcome: 3, independentAuthToken: 0 });
      assert.notEqual(r.value, 106, "indeterminate false token must not stay UNKNOWN");
      assert.equal(r.value, 105, "releaseGuard pass-through refuses");
    },
  );
  expectPacked(post({ sinkOutcome: 3, independentAuthToken: 0 }), 106, "restore indeterminate");
});

test("RED mutant F4 skip trit allow gate", () => {
  withMutant(
    "  if childExit == 0 {\n    if tritToken != 1 {\n      return finish(59, true)\n    }\n  }",
    "  if childExit == 99 {\n    if tritToken != 1 {\n      return finish(59, true)\n    }\n  }",
    () => {
      const r = verify({ tritToken: 0, childExit: 0 });
      assert.notEqual(r.value, 159, "trit unknown must not stay");
      assert.equal(r.value, 106, "trit unknown reached listed cleanup");
    },
  );
  expectPacked(verify({ tritToken: 0, childExit: 0 }), 159, "restore trit gate");
});

test("RED mutant F5 skip grantEpoch versus currentEpoch", () => {
  withMutant(
    "  if grantEpoch != currentEpoch {\n    return finish(18, true)\n  }",
    "  if grantEpoch == 99 {\n    return finish(18, true)\n  }",
    () => {
      const r = authenticate({ grantEpoch: 1, currentEpoch: 2, epochMatch: 1 });
      assert.notEqual(r.value, 118, "epoch mismatch must not stay");
      assert.equal(r.value, 100, "epoch mismatch authenticated");
    },
  );
  expectPacked(authenticate({ grantEpoch: 1, currentEpoch: 2, epochMatch: 1 }), 118, "restore epoch compare");
});

test("RED mutant production test hook admitted", () => {
  withMutant(
    "  if testHook == 1 {\n    return finish(54, true)\n  }",
    "  if testHook == 1 {\n    return finish(0, true)\n  }",
    () => {
      const r = verify({ testHook: 1 });
      assert.notEqual(r.value, 154, "hook must not stay");
      assert.equal(r.value, 100, "hook admitted");
    },
  );
  expectPacked(verify({ testHook: 1 }), 154, "restore hook");
});

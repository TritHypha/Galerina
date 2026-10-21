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
const BODY = join(MEM, "src", "body-reader.fungi");
const RCP = join(MEM, "src", "release-commit-point.fungi");
const SECRET = join(MEM, "src", "secret-gate.fungi");
const PORTS = join(MEM, "src", "kernel-ports.fungi");
const UNIT = join(MEM, "src", "kernel.fungi");
const GALERINA = join(REPO, "galerina.mjs");
const CB_IMPORT = "\nimport \"./c-boundary.fungi\"\n";
const BODY_IMPORT = "\nimport \"./body-reader.fungi\"\n";
const RCP_IMPORT = "\nimport \"./release-commit-point.fungi\"\n";
const SECRET_IMPORT = "\nimport \"./secret-gate.fungi\"\n";
const PORTS_IMPORT = "\nimport \"./kernel-ports.fungi\"\n";
const UNIT_SOURCE_LANDING = Object.freeze({ kind: "LANDING" });
let unitSourceOverride = UNIT_SOURCE_LANDING;
let portsSourceOverride = UNIT_SOURCE_LANDING;

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

function splitOnce(src, needle, label) {
  const parts = src.split(needle);
  assert.equal(parts.length, 2, label + " import line must occur once");
  return parts[0] + "\n" + parts[1];
}

function stripBodyFinish(src) {
  const start = src.indexOf("pure flow finish(");
  assert.notEqual(start, -1, "body-reader packer");
  const next = src.indexOf("pure flow rangesOverlap");
  assert.equal(next > start, true, "body-reader packer bounds");
  return src.slice(0, start) + src.slice(next);
}

function stripSecretImports(src) {
  let s = src;
  s = splitOnce(s, CB_IMPORT, "secret c-boundary");
  s = splitOnce(s, RCP_IMPORT, "secret release-commit-point");
  return stripVersion(s);
}

function stripPortsImports(src) {
  let s = src;
  s = splitOnce(s, CB_IMPORT, "ports c-boundary");
  s = splitOnce(s, RCP_IMPORT, "ports release-commit-point");
  return stripVersion(s);
}

function flattenUnit() {
  const boundary = readFileSync(BOUNDARY, "utf8");
  const bodyReader = readFileSync(BODY, "utf8");
  const rcp = readFileSync(RCP, "utf8");
  const secret = readFileSync(SECRET, "utf8");
  const ports = portsSourceOverride === UNIT_SOURCE_LANDING ? readFileSync(PORTS, "utf8") : portsSourceOverride;
  const unit = unitSourceOverride === UNIT_SOURCE_LANDING ? readFileSync(UNIT, "utf8") : unitSourceOverride;
  assert.equal(unit.includes(CB_IMPORT), true, "landed source must import c-boundary");
  assert.equal(unit.includes(BODY_IMPORT), true, "landed source must import body-reader");
  assert.equal(unit.includes(RCP_IMPORT), true, "landed source must import release-commit-point");
  assert.equal(unit.includes(SECRET_IMPORT), true, "landed source must import secret-gate");
  assert.equal(unit.includes(PORTS_IMPORT), true, "landed source must import kernel-ports");
  let rest = unit;
  rest = splitOnce(rest, CB_IMPORT, "c-boundary");
  rest = splitOnce(rest, BODY_IMPORT, "body-reader");
  rest = splitOnce(rest, RCP_IMPORT, "release-commit-point");
  rest = splitOnce(rest, SECRET_IMPORT, "secret-gate");
  rest = splitOnce(rest, PORTS_IMPORT, "kernel-ports");
  rest = stripVersion(rest);
  const dir = mkdtempSync(join(tmpdir(), "q36-flat-"));
  const file = join(dir, "flat.fungi");
  writeFileSync(
    file,
    boundary + "\n" + stripVersion(stripBodyFinish(bodyReader)) + "\n" + stripVersion(rcp) + "\n" + stripSecretImports(secret) + "\n" + stripPortsImports(ports) + "\n" + rest,
  );
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

function replaceOnce(src, needle, next, label) {
  const parts = src.split(needle);
  assert.equal(parts.length, 2, label + " must occur once");
  return parts[0] + next + parts[1];
}

function withMutant(needle, next, label, fn) {
  const original = readFileSync(UNIT, "utf8");
  const shaBefore = createHash("sha256").update(original, "utf8").digest("hex");
  unitSourceOverride = replaceOnce(original, needle, next, label);
  try {
    return fn();
  } finally {
    unitSourceOverride = UNIT_SOURCE_LANDING;
    const shaAfter = createHash("sha256").update(readFileSync(UNIT, "utf8"), "utf8").digest("hex");
    assert.equal(shaAfter, shaBefore, "tracked unit sha256 unchanged");
  }
}

function withPortsMutant(needle, next, label, fn) {
  const original = readFileSync(PORTS, "utf8");
  const shaBefore = createHash("sha256").update(original, "utf8").digest("hex");
  portsSourceOverride = replaceOnce(original, needle, next, label);
  try {
    return fn();
  } finally {
    portsSourceOverride = UNIT_SOURCE_LANDING;
    const shaAfter = createHash("sha256").update(readFileSync(PORTS, "utf8"), "utf8").digest("hex");
    assert.equal(shaAfter, shaBefore, "tracked ports sha256 unchanged");
  }
}

function construct(over) {
  const o = over || {};
  return runFlow("constructKernel", [
    o.postureClass ?? 0, o.postureToken ?? 0,
    o.envClass ?? 0, o.envToken ?? 0,
    o.closedClass ?? 0, o.closedTypeToken ?? 0,
    o.validatorClass ?? 0, o.validatorToken ?? 0,
    o.duplicateClass ?? 0, o.duplicateToken ?? 0,
    o.rateClass ?? 0, o.rateToken ?? 0,
    o.capacityClass ?? 0, o.capacity ?? 10000,
    o.keyClass ?? 0, o.keyLimit ?? 256,
    o.ttlClass ?? 0, o.ttl ?? 60,
    o.secretReqClass ?? 0, o.secretRequiredToken ?? 0,
    o.providerClass ?? 0, o.providerToken ?? 1,
    o.intrinsicClass ?? 0, o.intrinsicToken ?? 0,
  ]);
}

function match(over) {
  const o = over || {};
  return runFlow("admitMatch", [
    o.pathClass ?? 0, o.pathToken ?? 0,
    o.methodClass ?? 0, o.methodToken ?? 0,
    o.policyClass ?? 0, o.policyToken ?? 0,
  ]);
}

function auth(over) {
  const o = over || {};
  return runFlow("admitAuth", [
    o.channelClass ?? 0, o.channelToken ?? 0,
    o.modeClass ?? 0, o.authModeToken ?? 0,
    o.principalClass ?? 0, o.principalToken ?? 0,
    o.scopeClass ?? 0, o.scopeToken ?? 0,
  ]);
}

function body(over) {
  const o = over || {};
  return runFlow("admitBody", [
    o.bodyClass ?? 0, o.bodyPacked ?? 100,
    o.contentClass ?? 0, o.contentToken ?? 0,
    o.presentClass ?? 0, o.bodyPresentToken ?? 1,
  ]);
}

function clock(over) {
  const o = over || {};
  return runFlow("applyClock", [
    o.clockClass ?? 0, o.clock ?? 1000,
    o.presentClass ?? 0, o.clockPresent ?? 1,
    o.armedClass ?? 0, o.armedAt ?? 1000,
    o.budgetClass ?? 0, o.budget ?? 5000,
    o.clockEpochClass ?? 0, o.clockEpoch ?? 1,
    o.armedEpochClass ?? 0, o.armedEpoch ?? 1,
  ]);
}

function rate(over) {
  const o = over || {};
  return runFlow("applyRate", [
    o.countClass ?? 0, o.count ?? 0,
    o.limitClass ?? 0, o.limit ?? 10,
    o.jumpClass ?? 0, o.jumpToken ?? 0,
  ]);
}

function decode(over) {
  const o = over || {};
  return runFlow("applyDecode", [
    o.presentClass ?? 0, o.bodyPresentToken ?? 1,
    o.malformedClass ?? 0, o.malformedToken ?? 0,
    o.nullClass ?? 0, o.jsonNullToken ?? 0,
    o.dupClass ?? 0, o.dupKeysToken ?? 0,
    o.unknownClass ?? 0, o.unknownFieldToken ?? 0,
    o.validatorClass ?? 0, o.decodeValidatorToken ?? 0,
  ]);
}

function budget(over) {
  const o = over || {};
  return runFlow("applyBudget", [
    o.bodyClass ?? 0, o.bodyBytes ?? 16,
    o.memoryClass ?? 0, o.memoryBytes ?? 16384,
  ]);
}

function concurrency(over) {
  const o = over || {};
  return runFlow("applyConcurrency", [
    o.currentClass ?? 0, o.current ?? 0,
    o.maxClass ?? 0, o.maxConcurrent ?? 4,
    o.releasedClass ?? 0, o.releasedToken ?? 1,
    o.zombieClass ?? 0, o.handlerStillRunningToken ?? 0,
  ]);
}

function mint(over) {
  const o = over || {};
  return runFlow("mintOperation", [
    o.randomClass ?? 0, o.randomnessPresentToken ?? 1,
    o.callerClass ?? 0, o.callerMintToken ?? 0,
    o.idClass ?? 0, o.idPresentToken ?? 1,
    o.epochClass ?? 0, o.epoch ?? 1,
    o.existingClass ?? 0, o.existingPresentToken ?? 0,
    o.leaseClass ?? 0, o.existingLease ?? 0,
    o.retiredClass ?? 0, o.retiredToken ?? 0,
    o.capClass ?? 0, o.atCapToken ?? 0,
    o.freshClass ?? 0, o.issuedFreshToken ?? 1,
    o.hereClass ?? 0, o.issuedHereToken ?? 0,
  ]);
}

function secrets(over) {
  const o = over || {};
  return runFlow("applySecrets", [
    o.requiredClass ?? 0, o.requiredCount ?? 0,
    o.providerClass ?? 0, o.providerPresent ?? 0,
    o.presenceClass ?? 0, o.presenceStatus ?? 0,
    o.epochClass ?? 0, o.epoch ?? 1,
    o.epochPresentClass ?? 0, o.epochPresentToken ?? 1,
    o.mintedOpClass ?? 0, o.mintedOp ?? 1,
    o.secretOpClass ?? 0, o.secretOp ?? 1,
    o.mintedEpochClass ?? 0, o.mintedEpoch ?? 1,
    o.secretEpochClass ?? 0, o.secretEpoch ?? 1,
  ]);
}

function idemp(over) {
  const o = over || {};
  return runFlow("applyIdempotency", [
    o.enabledClass ?? 0, o.enabledToken ?? 1,
    o.claimClass ?? 0, o.claimToken ?? 1,
    o.reservedClass ?? 0, o.alreadyReservedToken ?? 0,
    o.dispatchClass ?? 0, o.dispatchToken ?? 1,
    o.ttlClass ?? 0, o.ttl ?? 60,
    o.settleClass ?? 0, o.settleToken ?? 0,
  ]);
}

function dispatch(over) {
  const o = over || {};
  return runFlow("applyDispatch", [
    o.handlerClass ?? 0, o.handlerToken ?? 0,
  ]);
}

function consume(over) {
  const o = over || {};
  return runFlow("applyConsume", [
    o.presentClass ?? 0, o.presentToken ?? 1,
    o.matchClass ?? 0, o.tokenMatchToken ?? 1,
    o.epochMatchClass ?? 0, o.epochMatchToken ?? 1,
    o.leaseClass ?? 0, o.leaseState ?? 0,
    o.revokeClass ?? 0, o.revokeCommittedToken ?? 0,
    o.cleanupClass ?? 0, o.cleanupEvidence ?? 1,
    o.authClass ?? 0, o.independentAuthToken ?? 1,
    o.custodyClass ?? 0, o.preparedCustodyToken ?? 1,
    o.emptyClass ?? 0, o.emptyObligationSetToken ?? 0,
    o.consumedAuthClass ?? 0, o.consumedAuthorityToken ?? 1,
    o.validityClass ?? 0, o.currentValidityToken ?? 1,
  ]);
}

function finalize(over) {
  const o = over || {};
  return runFlow("applyFinalize", [
    o.spentClass ?? 0, o.spentToken ?? 0,
    o.dispatchClass ?? 0, o.dispatchPacked ?? 100,
    o.consumeClass ?? 0, o.consumePacked ?? 100,
    o.auditClass ?? 0, o.auditPacked ?? 100,
    o.presentClass ?? 0, o.presentToken ?? 1,
    o.matchClass ?? 0, o.tokenMatchToken ?? 1,
    o.epochPresentClass ?? 0, o.epochPresentToken ?? 1,
    o.epochMatchClass ?? 0, o.epochMatchToken ?? 1,
    o.leaseClass ?? 0, o.leaseState ?? 1,
  ]);
}

function getSecret(over) {
  const o = over || {};
  return runFlow("getSecretAccess", [
    o.activeClass ?? 0, o.activeToken ?? 1,
    o.deadlineClass ?? 0, o.deadlineToken ?? 0,
    o.spentClass ?? 0, o.spentToken ?? 0,
    o.reentrantClass ?? 0, o.reentrantToken ?? 0,
    o.failedClass ?? 0, o.failedToken ?? 0,
    o.declaredClass ?? 0, o.declaredToken ?? 1,
  ]);
}

function recover(over) {
  const o = over || {};
  return runFlow("recoverLease", [
    o.presentClass ?? 0, o.presentToken ?? 1,
    o.retiredClass ?? 0, o.retiredToken ?? 0,
    o.tombstoneClass ?? 0, o.tombstoneDroppedToken ?? 0,
    o.leaseClass ?? 0, o.leaseState ?? 1,
  ]);
}

function http(code) {
  return runFlow("httpStatusFor", [0, code]);
}

function preDispatch(over) {
  const o = over || {};
  const clock = o.clock ?? 1000;
  return runFlow("runPreDispatch", [
    o.matchPacked ?? 100,
    o.bodyPacked ?? 100,
    o.authPacked ?? 100,
    o.ratePacked ?? 100,
    o.decodePacked ?? 100,
    o.budgetPacked ?? 100,
    o.concurrencyPacked ?? 100,
    o.secretsPacked ?? 100,
    o.mintPacked ?? 100,
    o.idempPacked ?? 100,
    o.clockClass ?? 0,
    o.clock1 ?? clock,
    o.clock2 ?? clock,
    o.clock3 ?? clock,
    o.clock4 ?? clock,
    o.clock5 ?? clock,
    o.clock6 ?? clock,
    o.clock7 ?? clock,
    o.clock8 ?? clock,
    o.clock9 ?? clock,
    o.clock10 ?? clock,
    o.clock11 ?? clock,
    o.presentClass ?? 0, o.clockPresent ?? 1,
    o.armedClass ?? 0, o.armedAt ?? 1000,
    o.budgetClass ?? 0, o.budget ?? 5000,
    o.clockEpochClass ?? 0, o.clockEpoch ?? 1,
    o.armedEpochClass ?? 0, o.armedEpoch ?? 1,
    o.handlerClass ?? 0, o.handlerToken ?? 0,
  ]);
}

function postDispatch(over) {
  const o = over || {};
  const clock = o.clock ?? 1000;
  return runFlow("runPostDispatch", [
    o.clockClass ?? 0,
    o.clockConsume ?? clock,
    o.clockFinalize ?? clock,
    o.clockAudit ?? clock,
    o.presentClass ?? 0, o.clockPresent ?? 1,
    o.armedClass ?? 0, o.armedAt ?? 1000,
    o.budgetClass ?? 0, o.budget ?? 5000,
    o.clockEpochClass ?? 0, o.clockEpoch ?? 1,
    o.armedEpochClass ?? 0, o.armedEpoch ?? 1,
    o.spentClass ?? 0, o.spentToken ?? 0,
    o.dispatchClass ?? 0, o.dispatchPacked ?? 100,
    o.consumeClass ?? 0, o.consumePacked ?? 0,
    o.auditClass ?? 0, o.auditPacked ?? 100,
    o.ackPresentClass ?? 0, o.presentToken ?? 1,
    o.ackMatchClass ?? 0, o.tokenMatchToken ?? 1,
    o.epochPresentClass ?? 0, o.epochPresentToken ?? 1,
    o.epochMatchClass ?? 0, o.epochMatchToken ?? 1,
    o.leaseClass ?? 0, o.leaseState ?? 1,
    o.currentClass ?? 0, o.current ?? 0,
    o.maxClass ?? 0, o.maxConcurrent ?? 4,
    o.releasedClass ?? 0, o.releasedToken ?? 1,
    o.zombieClass ?? 0, o.handlerStillRunningToken ?? 0,
  ]);
}

function expect(r, value, label) {
  assert.equal(r.present, true, label + " present " + r.reason + " " + (r.text || "").slice(-200));
  assert.equal(r.value, value, label + " got " + String(r.value));
}

test("happy construction match auth body clock rate decode budget concurrency mint secrets idemp dispatch", () => {
  expect(construct(), 100, "construct");
  expect(match(), 100, "match");
  expect(auth(), 100, "auth public");
  expect(body(), 100, "body");
  expect(clock(), 100, "clock");
  expect(rate(), 100, "rate");
  expect(decode(), 100, "decode");
  expect(budget(), 100, "budget");
  expect(concurrency(), 100, "concurrency");
  expect(mint(), 100, "mint");
  expect(secrets(), 100, "secrets empty-require");
  expect(idemp(), 100, "idemp commit after dispatch");
  expect(dispatch(), 100, "dispatch");
});

test("MUST-REFUSE construction reasons", () => {
  expect(construct({ postureToken: 3 }), 112, "unknown posture");
  expect(construct({ envToken: 2 }), 113, "unknown env");
  expect(construct({ closedTypeToken: 1, validatorToken: 1 }), 114, "missing validator");
  expect(construct({ duplicateToken: 1 }), 115, "duplicate route");
  expect(construct({ rateToken: 1 }), 116, "bad rate");
  expect(construct({ capacity: 0 }), 117, "non-positive capacity");
  expect(construct({ keyLimit: 0 }), 117, "non-positive key limit");
  expect(construct({ ttl: 0 }), 117, "non-positive ttl");
  expect(construct({ secretRequiredToken: 1, providerToken: 0 }), 118, "secret route no provider");
  expect(construct({ intrinsicToken: 1 }), 119, "missing intrinsic");
});

test("MUST-REFUSE match auth body", () => {
  expect(match({ pathToken: 1 }), 120, "unknown path");
  expect(match({ methodToken: 1 }), 121, "wrong method");
  expect(match({ policyToken: 1 }), 122, "policy absent");
  expect(match({ policyToken: 2 }), 122, "policy unlisted");
  expect(auth({ channelToken: 1 }), 125, "channel deny");
  expect(auth({ channelToken: 2 }), 125, "channel indeterminate");
  expect(auth({ authModeToken: 1, channelToken: 3 }), 125, "required no channel");
  expect(auth({ authModeToken: 1, channelToken: 0, principalToken: 1 }), 125, "required no principal");
  expect(auth({ scopeToken: 1 }), 126, "missing scope");
  expect(body({ bodyPacked: 105 }), 123, "body over cap");
  expect(body({ contentToken: 1, bodyPresentToken: 1 }), 124, "content-type");
  expect(body({ bodyPacked: 110 }), 106, "body throw UNKNOWN");
});

test("MUST-REFUSE rate decode budget concurrency clock", () => {
  expect(rate({ count: 10, limit: 10 }), 127, "rate over");
  expect(rate({ jumpToken: 1 }), 128, "forward jump");
  expect(rate({ jumpToken: 2 }), 128, "backward jump");
  expect(decode({ malformedToken: 1 }), 129, "malformed json");
  expect(decode({ jsonNullToken: 1 }), 130, "json null");
  expect(decode({ dupKeysToken: 1 }), 131, "duplicate keys");
  expect(decode({ unknownFieldToken: 1 }), 132, "unknown field");
  expect(decode({ bodyPresentToken: 0, malformedToken: 1 }), 100, "empty body skips decode");
  expect(budget({ bodyBytes: 16385, memoryBytes: 16384 }), 133, "memory budget");
  expect(concurrency({ current: 4, maxConcurrent: 4 }), 134, "concurrency over");
  expect(concurrency({ releasedToken: 0, handlerStillRunningToken: 0 }), 159, "slot not released");
  expect(concurrency({ releasedToken: 0, handlerStillRunningToken: 1 }), 159, "deadline handler still running is held-slot");
  expect(clock({ clockPresent: 0 }), 121, "clock missing");
  expect(clock({ clock: 999, armedAt: 1000 }), 122, "backwards");
  expect(clock({ clockEpoch: 1, armedEpoch: 2 }), 123, "epoch mismatch");
  expect(clock({ clock: 2147483647, armedAt: 2147483647, budget: 1 }), 151, "overflow");
  expect(clock({ clock: 7000, armedAt: 1000, budget: 5000 }), 147, "deadline");
});


test("MUST-REFUSE mint secrets idempotency dispatch getSecret recover", () => {
  expect(mint({ callerMintToken: 1 }), 137, "caller mint");
  expect(mint({ randomnessPresentToken: 0 }), 136, "mint absent randomness");
  expect(secrets({ requiredCount: 1, providerPresent: 0, presenceStatus: 1 }), 135, "secret unavailable");
  expect(secrets({ requiredCount: 1, providerPresent: 1, presenceStatus: 0, mintedOp: 1, secretOp: 2 }), 135, "bind mismatch");
  expect(idemp({ claimToken: 0, dispatchToken: 0, settleToken: 1 }), 138, "missing key cancelled");
  expect(idemp({ claimToken: 2 }), 139, "duplicate key");
  expect(idemp({ claimToken: 3 }), 140, "store full");
  expect(idemp({ claimToken: 4 }), 106, "store throw UNKNOWN");
  expect(idemp({ alreadyReservedToken: 1, dispatchToken: 1 }), 106, "retry after dispatch");
  expect(idemp({ dispatchToken: 1, settleToken: 1 }), 143, "unconditional delete after dispatch");
  expect(idemp({ dispatchToken: 1, settleToken: 2 }), 106, "post-dispatch crash");
  expect(dispatch({ handlerToken: 1 }), 106, "handler throw");
  expect(dispatch({ handlerToken: 2 }), 147, "handler never settles");
  expect(dispatch({ handlerToken: 3 }), 111, "unlisted shape");
  expect(getSecret({ deadlineToken: 1 }), 152, "getSecret after deadline");
  expect(getSecret({ spentToken: 1 }), 153, "getSecret after spend");
  expect(getSecret({ reentrantToken: 1 }), 154, "getSecret reentrant");
  expect(getSecret({ failedToken: 1 }), 155, "getSecret after failure");
  expect(getSecret({ declaredToken: 0 }), 156, "getSecret undeclared");
  expect(getSecret({ activeToken: 0 }), 152, "getSecret inactive");
  expect(recover({ leaseState: 9 }), 138, "unlisted recovery");
});

test("landed consume revoke-first and finalize audit-before-ack", () => {
  expect(consume({ revokeCommittedToken: 1, currentValidityToken: 1 }), 102, "revoke first");
  expect(consume({ currentValidityToken: 0, revokeCommittedToken: 1 }), 106, "validity before revoke");
  expect(finalize({ spentToken: 0, dispatchPacked: 100, consumePacked: 0, auditPacked: 100 }), 100, "unspent handler ok");
  expect(finalize({ spentToken: 0, dispatchPacked: 100, consumePacked: 100, auditPacked: 100 }), 106, "unspent consume packed 100");
  expect(finalize({ spentToken: 0, dispatchPacked: 100, consumePacked: 999, auditPacked: 100 }), 106, "unspent unlisted consumePacked");
  expect(finalize({ spentToken: 0, dispatchPacked: 100, consumePacked: 0, auditPacked: 101 }), 106, "unspent audit fail");
  expect(finalize({ spentToken: 0, dispatchPacked: 999, consumePacked: 0, auditPacked: 100 }), 106, "unspent unlisted dispatch");
  expect(finalize({ spentToken: 0, dispatchPacked: 106, consumePacked: 0, auditPacked: 100 }), 106, "unspent listed 106");
  expect(finalize({ spentToken: 0, dispatchPacked: 147, consumePacked: 0, auditPacked: 100 }), 147, "unspent listed 147");
  expect(finalize({ spentToken: 1, consumePacked: 100, auditPacked: 100, leaseState: 1 }), 106, "spent never 100");
  expect(finalize({ spentToken: 1, consumePacked: 100, auditPacked: 106, leaseState: 1 }), 144, "audit fail ack not recorded");
  expect(finalize({ spentToken: 1, consumePacked: 106, auditPacked: 100 }), 106, "consume unknown stays unknown");
  expect(finalize({ spentToken: 1, consumePacked: 100, auditPacked: 100, leaseState: 0 }), 106, "spent lease 0 never raw");
  expect(finalize({ spentToken: 1, consumePacked: 100, auditPacked: 100, leaseState: 3 }), 106, "spent lease 3 never raw");
  expect(finalize({ spentToken: 1, consumePacked: 100, auditPacked: 100, leaseState: 4 }), 106, "spent lease 4 never raw");
  expect(finalize({ spentToken: 1, consumePacked: 100, auditPacked: 100, leaseState: 5 }), 106, "spent lease 5 never raw");
  expect(finalize({ spentToken: 2 }), 111, "spentToken 2 unlisted");
});

test("HTTP map total default 503 deadline 504", () => {
  expect(http(100), 200, "ok");
  expect(http(120), 404, "path");
  expect(http(121), 405, "method");
  expect(http(123), 413, "body");
  expect(http(124), 415, "content-type");
  expect(http(125), 401, "unauth");
  expect(http(126), 403, "forbidden");
  expect(http(127), 429, "rate");
  expect(http(129), 422, "malformed");
  expect(http(134), 429, "concurrency");
  expect(http(139), 409, "idemp missing");
  expect(http(144), 503, "audit-failed-no-ack");
  expect(http(147), 504, "deadline");
  expect(http(159), 503, "slot-held");
  expect(http(106), 503, "unknown");
  expect(http(111), 503, "unlisted");
  expect(http(999), 503, "default");
  expect(runFlow("httpStatusFor", [3, 100]), 503, "classTag 3 with 100");
  expect(runFlow("httpStatusFor", [11, 100]), 503, "classTag 11 with 100");
});

test("CN-1 helper defined once in memory src", () => {
  const src = readFileSync(BOUNDARY, "utf8");
  const unit = readFileSync(UNIT, "utf8");
  const ports = readFileSync(PORTS, "utf8");
  assert.equal((src.match(/pure flow readForeignSafeInteger/g) || []).length, 1, "one helper def");
  assert.equal(unit.includes("pure flow readForeignSafeInteger"), false, "kernel does not copy helper");
  assert.equal(ports.includes("pure flow readForeignSafeInteger"), false, "ports does not copy helper");
});

test("mutant deadline arm at clock goes RED then restored green", () => {
  const needle = "if clock > armedAt + budget - 1 {\n    return finish(47, true)";
  expect(clock({ clock: 7000, armedAt: 1000, budget: 5000 }), 147, "landed deadline");
  withMutant(needle, "if clock > armedAt + budget - 1 {\n    return finish(0, true)", "deadline mutant", () => {
    expect(clock({ clock: 7000, armedAt: 1000, budget: 5000 }), 100, "mutant admits past deadline");
  });
  expect(clock({ clock: 7000, armedAt: 1000, budget: 5000 }), 147, "restored deadline");
});

test("mutant rate jump to wall-clock reset goes RED then restored green", () => {
  const needle = "if jumpToken != 0 {\n    return finish(28, true)";
  expect(rate({ jumpToken: 1 }), 128, "landed jump");
  withMutant(needle, "if jumpToken != 0 {\n    return finish(0, true)", "rate jump mutant", () => {
    expect(rate({ jumpToken: 1 }), 100, "mutant resets window");
  });
  expect(rate({ jumpToken: 1 }), 128, "restored jump");
});

test("mutant ack before audit commit goes RED then restored green", () => {
  const needle = "if auditPacked != 100 {\n    return finish(44, true)";
  expect(finalize({ spentToken: 1, consumePacked: 100, auditPacked: 106, leaseState: 1 }), 144, "landed audit fail");
  withMutant(needle, "if auditPacked != 100 {\n    return finish(6, true)", "ack-before-audit mutant", () => {
    expect(finalize({ spentToken: 1, consumePacked: 100, auditPacked: 106, leaseState: 1 }), 106, "mutant drops 144 to 106");
  });
  expect(finalize({ spentToken: 1, consumePacked: 100, auditPacked: 106, leaseState: 1 }), 144, "restored audit fail");
});

test("mutant post-dispatch delete goes RED then restored green", () => {
  const needle = "if settleToken == 1 {\n    return finish(43, true)";
  expect(idemp({ dispatchToken: 1, settleToken: 1 }), 143, "landed delete");
  withPortsMutant(needle, "if settleToken == 1 {\n    return finish(0, true)", "post-dispatch delete mutant", () => {
    expect(idemp({ dispatchToken: 1, settleToken: 1 }), 100, "mutant deletes after dispatch");
  });
  expect(idemp({ dispatchToken: 1, settleToken: 1 }), 143, "restored delete");
});

test("mutant retry after dispatch goes RED then restored green", () => {
  const needle = "if alreadyReservedToken == 1 {\n    if dispatchToken == 1 {\n      return finish(6, true)";
  expect(idemp({ alreadyReservedToken: 1, dispatchToken: 1 }), 106, "landed retry");
  withPortsMutant(needle, "if alreadyReservedToken == 1 {\n    if dispatchToken == 1 {\n      return finish(0, true)", "retry mutant", () => {
    const r = idemp({ alreadyReservedToken: 1, dispatchToken: 1, claimToken: 1, settleToken: 0 });
    assert.equal(r.present, true, "mutant present");
    assert.notEqual(r.value, 106, "mutant retries");
  });
  expect(idemp({ alreadyReservedToken: 1, dispatchToken: 1 }), 106, "restored retry");
});

test("mutant drop recovery default arm goes RED then restored green", () => {
  const needle = "if recovered == 111 {\n    return finish(38, true)\n  }\n  return recovered";
  expect(recover({ leaseState: 9 }), 138, "landed unlisted");
  withMutant(needle, "if recovered == 111 {\n    return finish(0, true)\n  }\n  return recovered", "recovery default mutant", () => {
    expect(recover({ leaseState: 9 }), 100, "mutant admits unlisted");
  });
  expect(recover({ leaseState: 9 }), 138, "restored unlisted");
});

test("mutant skip slot release goes RED then restored green", () => {
  const needle = "if releasedToken == 0 {\n    return finish(59, true)";
  expect(concurrency({ releasedToken: 0 }), 159, "landed slot");
  withMutant(needle, "if releasedToken == 0 {\n    return finish(0, true)", "slot mutant", () => {
    expect(concurrency({ releasedToken: 0 }), 100, "mutant skips release");
  });
  expect(concurrency({ releasedToken: 0 }), 159, "restored slot");
});

test("mutant untyped getSecret after deadline goes RED then restored green", () => {
  const needle = "if deadlineToken == 1 {\n    return finish(52, true)";
  expect(getSecret({ deadlineToken: 1 }), 152, "landed getSecret deadline");
  withMutant(needle, "if deadlineToken == 1 {\n    return finish(0, true)", "getSecret mutant", () => {
    expect(getSecret({ deadlineToken: 1 }), 100, "mutant grants after deadline");
  });
  expect(getSecret({ deadlineToken: 1 }), 152, "restored getSecret deadline");
});

test("mutant skip minted bind goes RED then restored green", () => {
  const needle = "if mintedOp != secretOp {\n      return finish(35, true)";
  expect(secrets({ requiredCount: 1, providerPresent: 1, presenceStatus: 0, mintedOp: 1, secretOp: 2 }), 135, "landed bind");
  withMutant(needle, "if mintedOp != secretOp {\n      return finish(0, true)", "bind mutant", () => {
    const r = secrets({ requiredCount: 1, providerPresent: 1, presenceStatus: 0, mintedOp: 1, secretOp: 2 });
    assert.equal(r.present, true, "mutant present");
    assert.notEqual(r.value, 135, "mutant skips bind");
  });
  expect(secrets({ requiredCount: 1, providerPresent: 1, presenceStatus: 0, mintedOp: 1, secretOp: 2 }), 135, "restored bind");
});

test("F1 composed pre-dispatch TS order never reaches dispatch after a refusal", () => {
  expect(preDispatch(), 100, "happy composed dispatch");
  expect(preDispatch({ matchPacked: 120, handlerToken: 1 }), 120, "path refusal skips dispatch throw");
  expect(preDispatch({ bodyPacked: 123, handlerToken: 1 }), 123, "body refusal skips dispatch throw");
  expect(preDispatch({ authPacked: 125, handlerToken: 1 }), 125, "auth refusal skips dispatch throw");
  expect(preDispatch({ ratePacked: 127, handlerToken: 1 }), 127, "rate refusal skips dispatch throw");
  expect(preDispatch({ decodePacked: 129, handlerToken: 1 }), 129, "decode refusal skips dispatch throw");
  expect(preDispatch({ budgetPacked: 133, handlerToken: 1 }), 133, "budget refusal skips dispatch throw");
  expect(preDispatch({ concurrencyPacked: 134, handlerToken: 1 }), 134, "concurrency refusal skips dispatch throw");
  expect(preDispatch({ secretsPacked: 135, handlerToken: 1 }), 135, "secrets refusal skips dispatch throw");
  expect(preDispatch({ mintPacked: 136, handlerToken: 1 }), 136, "mint refusal skips dispatch throw");
  expect(preDispatch({ idempPacked: 139, handlerToken: 1 }), 139, "idemp refusal skips dispatch throw");
  expect(preDispatch({ handlerToken: 1 }), 106, "all gates 100 reaches dispatch throw");
});

test("F1 composed body-reader over cap becomes 123 and skips dispatch", () => {
  const chunks = runFlow("readChunks", [1, 1, 0, 16385, 0, 0, 0, 16384, false, 0, true, false, false]);
  expect(chunks, 105, "readChunks cap+1");
  expect(body({ bodyPacked: 105 }), 123, "admitBody over-cap");
  expect(preDispatch({ bodyPacked: 123, handlerToken: 1 }), 123, "composed over-cap skips dispatch");
});

test("F1 composed deadline at each pre-dispatch stage and post finalize/audit", () => {
  expect(preDispatch({ clock: 7000, armedAt: 1000, budget: 5000, handlerToken: 0 }), 147, "deadline before match");
  expect(preDispatch({ clock: 6000, armedAt: 1000, budget: 5000 }), 147, "deadline at later pre stage same reading");
  expect(postDispatch({ clock: 7000, armedAt: 1000, budget: 5000, spentToken: 1, consumePacked: 100, auditPacked: 100 }), 106, "spent deadline before consume is 106");
  expect(postDispatch({ clock: 6000, armedAt: 1000, budget: 5000, spentToken: 1, consumePacked: 100, auditPacked: 106 }), 106, "spent deadline before finalize and audit is 106");
  expect(postDispatch({ spentToken: 1, consumePacked: 100, auditPacked: 106 }), 144, "post audit fail 144 after clocks");
  expect(postDispatch({ spentToken: 1, consumePacked: 100, auditPacked: 100, leaseState: 1 }), 106, "post spent success 106");
  expect(postDispatch({ spentToken: 0, consumePacked: 0, dispatchPacked: 100, auditPacked: 100 }), 100, "post unspent ok");
});

test("F1 spent finalize UNKNOWN wins over slot-held 159", () => {
  expect(postDispatch({ spentToken: 1, consumePacked: 100, auditPacked: 101, releasedToken: 0 }), 144, "spent audit 101 released 0 is 144");
  expect(postDispatch({ spentToken: 1, consumePacked: 100, auditPacked: 100, leaseState: 1, releasedToken: 0 }), 106, "spent all 100 released 0 is 106");
  expect(postDispatch({ spentToken: 1, consumePacked: 100, auditPacked: 100, leaseState: 1, releasedToken: 1 }), 106, "spent all 100 released 1 is 106");
});

test("F2 spent deadline is 106 unspent deadline is 147", () => {
  expect(postDispatch({ clock: 7000, spentToken: 1, consumePacked: 100, auditPacked: 100, releasedToken: 1 }), 106, "spent deadline consume 106");
  expect(postDispatch({ clockConsume: 1000, clockFinalize: 7000, clockAudit: 1000, spentToken: 1, consumePacked: 100, auditPacked: 100, releasedToken: 1 }), 106, "spent deadline finalize 106");
  expect(postDispatch({ clockConsume: 1000, clockFinalize: 1000, clockAudit: 7000, spentToken: 1, consumePacked: 100, auditPacked: 100, releasedToken: 1 }), 106, "spent deadline audit 106");
  expect(postDispatch({ clock: 7000, spentToken: 0, consumePacked: 0, dispatchPacked: 100, auditPacked: 100, releasedToken: 1 }), 147, "unspent deadline 147");
  expect(http(106), 503, "spent deadline HTTP 503");
  expect(http(147), 504, "unspent deadline HTTP 504");
});

test("F4 unlisted pre-dispatch gate packed is 111 never raw", () => {
  expect(preDispatch({ idempPacked: 999, handlerToken: 1 }), 111, "idempPacked 999");
  expect(preDispatch({ matchPacked: 0, handlerToken: 1 }), 111, "matchPacked 0");
  expect(preDispatch({ bodyPacked: 999, handlerToken: 1 }), 111, "bodyPacked 999");
  expect(preDispatch({ authPacked: 0, handlerToken: 1 }), 111, "authPacked 0");
  expect(preDispatch({ ratePacked: 999, handlerToken: 1 }), 111, "ratePacked 999");
  expect(preDispatch({ decodePacked: 0, handlerToken: 1 }), 111, "decodePacked 0");
  expect(preDispatch({ budgetPacked: 999, handlerToken: 1 }), 111, "budgetPacked 999");
  expect(preDispatch({ concurrencyPacked: 0, handlerToken: 1 }), 111, "concurrencyPacked 0");
  expect(preDispatch({ secretsPacked: 999, handlerToken: 1 }), 111, "secretsPacked 999");
  expect(preDispatch({ mintPacked: 0, handlerToken: 1 }), 111, "mintPacked 0");
  expect(runFlow("listedMatchPacked", [999]), 111, "listedMatchPacked 999");
  expect(runFlow("listedMatchPacked", [120]), 120, "listedMatchPacked 120");
  expect(runFlow("listedIdempPacked", [139]), 139, "listedIdempPacked 139");
});

test("F5 one clock reading per stage non-decreasing and first-trip deadline", () => {
  expect(preDispatch({ clock1: 2000, clock2: 1500 }), 122, "pre backwards clock2");
  expect(postDispatch({ clockConsume: 2000, clockFinalize: 1500, clockAudit: 1500, spentToken: 0, consumePacked: 0 }), 122, "post backwards finalize");
  let stage = 1;
  while (stage <= 11) {
    const over = { handlerToken: 0, armedAt: 1000, budget: 5000 };
    let i = 1;
    while (i <= 11) {
      over["clock" + String(i)] = i === stage ? 7000 : 1000;
      i = i + 1;
    }
    expect(preDispatch(over), 147, "first trip pre stage " + String(stage));
    stage = stage + 1;
  }
  expect(postDispatch({ clockConsume: 7000, clockFinalize: 1000, clockAudit: 1000, spentToken: 0, consumePacked: 0, releasedToken: 1 }), 147, "first trip post consume");
  expect(postDispatch({ clockConsume: 1000, clockFinalize: 7000, clockAudit: 1000, spentToken: 0, consumePacked: 0, releasedToken: 1 }), 147, "first trip post finalize");
  expect(postDispatch({ clockConsume: 1000, clockFinalize: 1000, clockAudit: 7000, spentToken: 0, consumePacked: 0, releasedToken: 1 }), 147, "first trip post audit");
});

test("F6 unspent slot-held 159 on finalize 100 handler-running and deadline", () => {
  expect(postDispatch({ spentToken: 0, consumePacked: 0, dispatchPacked: 100, auditPacked: 100, releasedToken: 0 }), 159, "unspent finalize 100 released 0");
  expect(postDispatch({ spentToken: 0, consumePacked: 0, dispatchPacked: 100, auditPacked: 100, releasedToken: 1, handlerStillRunningToken: 1 }), 159, "unspent handler running 1");
  expect(postDispatch({ clock: 7000, spentToken: 0, consumePacked: 0, dispatchPacked: 100, auditPacked: 100, releasedToken: 0 }), 159, "unspent deadline released 0");
});

test("T1 composed unspent finalize failure is 106", () => {
  expect(postDispatch({ spentToken: 0, consumePacked: 0, dispatchPacked: 100, auditPacked: 101, releasedToken: 1 }), 106, "unspent audit 101");
  expect(postDispatch({ spentToken: 0, consumePacked: 999, dispatchPacked: 100, auditPacked: 100, releasedToken: 1 }), 106, "unspent consume 999");
  expect(postDispatch({ spentToken: 0, consumePacked: 100, dispatchPacked: 100, auditPacked: 100, releasedToken: 1 }), 106, "unspent consume 100");
  expect(postDispatch({ spentToken: 0, consumePacked: 0, dispatchPacked: 106, auditPacked: 100, releasedToken: 1 }), 106, "unspent dispatch 106");
  expect(postDispatch({ spentToken: 0, consumePacked: 0, dispatchPacked: 999, auditPacked: 100, releasedToken: 1 }), 106, "unspent dispatch 999");
});

test("T2 unspent slot-held on finalize and audit clock exits", () => {
  expect(postDispatch({ clockConsume: 1000, clockFinalize: 7000, clockAudit: 1000, spentToken: 0, consumePacked: 0, releasedToken: 0 }), 159, "deadline finalize released 0");
  expect(postDispatch({ clockConsume: 1000, clockFinalize: 1000, clockAudit: 7000, spentToken: 0, consumePacked: 0, releasedToken: 0 }), 159, "deadline audit released 0");
  expect(postDispatch({ clockConsume: 2000, clockFinalize: 1500, clockAudit: 1500, spentToken: 0, consumePacked: 0, releasedToken: 0 }), 159, "backwards finalize released 0");
  expect(postDispatch({ clockConsume: 2000, clockFinalize: 2000, clockAudit: 1500, spentToken: 0, consumePacked: 0, releasedToken: 0 }), 159, "backwards audit released 0");
});

test("T3 adjacent pre pairs and audit backwards are 122", () => {
  let k = 2;
  while (k <= 11) {
    const over = { handlerToken: 0 };
    let i = 1;
    while (i <= 11) {
      over["clock" + String(i)] = i < k ? 2000 : 1500;
      i = i + 1;
    }
    expect(preDispatch(over), 122, "pre backwards clock" + String(k));
    k = k + 1;
  }
  expect(postDispatch({ clockConsume: 1000, clockFinalize: 2000, clockAudit: 1500, spentToken: 0, consumePacked: 0, releasedToken: 1 }), 122, "unspent audit < finalize");
});

test("T4 spent applyFinalize every ack outcome never 100", () => {
  const presents = [0, 1];
  const matches = [0, 1];
  const epochPresents = [0, 1];
  const epochMatches = [0, 1];
  const leases = [0, 1, 2, 3, 4, 5];
  let pi = 0;
  while (pi < presents.length) {
    let mi = 0;
    while (mi < matches.length) {
      let ei = 0;
      while (ei < epochPresents.length) {
        let qi = 0;
        while (qi < epochMatches.length) {
          let li = 0;
          while (li < leases.length) {
            const label = "T4 p" + String(presents[pi]) + " m" + String(matches[mi]) + " ep" + String(epochPresents[ei]) + " em" + String(epochMatches[qi]) + " l" + String(leases[li]);
            const r = finalize({
              spentToken: 1,
              consumePacked: 100,
              auditPacked: 100,
              presentToken: presents[pi],
              tokenMatchToken: matches[mi],
              epochPresentToken: epochPresents[ei],
              epochMatchToken: epochMatches[qi],
              leaseState: leases[li],
            });
            assert.equal(r.present, true, label + " present " + r.reason);
            assert.notEqual(r.value, 100, label + " got " + String(r.value));
            li = li + 1;
          }
          qi = qi + 1;
        }
        ei = ei + 1;
      }
      mi = mi + 1;
    }
    pi = pi + 1;
  }
});

test("T5 spent applyFinalize acked==100 unreachable; U07 EQUIVALENT", () => {
  const unit = readFileSync(UNIT, "utf8");
  const call = "ackStep(presentToken, tokenMatchToken, epochPresentToken, 0, epochMatchToken, leaseState, 1)";
  assert.equal(unit.includes(call), true, "applyFinalize ackStep shape");
  const needle = "if acked == 100 {\n    return finish(6, true)";
  assert.equal(unit.includes(needle), true, "U07 needle present");
  const presents = [0, 1];
  const matches = [0, 1];
  const epochPresents = [0, 1];
  const epochMatches = [0, 1];
  const leases = [0, 1, 2, 3, 4, 5];
  let reached = 0;
  let pi = 0;
  while (pi < presents.length) {
    let mi = 0;
    while (mi < matches.length) {
      let ei = 0;
      while (ei < epochPresents.length) {
        let qi = 0;
        while (qi < epochMatches.length) {
          let li = 0;
          while (li < leases.length) {
            const p = presents[pi];
            const m = matches[mi];
            const ep = epochPresents[ei];
            const em = epochMatches[qi];
            const lease = leases[li];
            const label =
              "T5 p" +
              String(p) +
              " m" +
              String(m) +
              " ep" +
              String(ep) +
              " em" +
              String(em) +
              " l" +
              String(lease);
            const stepped = runFlow("ackStep", [p, m, ep, 0, em, lease, 1]);
            assert.equal(stepped.present, true, label + " ackStep present " + stepped.reason);
            assert.notEqual(stepped.value, 100, label + " ackStep packed " + String(stepped.value));
            if (stepped.value !== 101) {
              reached = reached + 1;
            }
            li = li + 1;
          }
          qi = qi + 1;
        }
        ei = ei + 1;
      }
      mi = mi + 1;
    }
    pi = pi + 1;
  }
  assert.equal(reached > 0, true, "inputs reach the acked==100 line");
  withMutant(needle, "if acked == 100 {\n    return finish(0, true)", "U07 acked==100 success", () => {
    expect(
      finalize({
        spentToken: 1,
        consumePacked: 100,
        auditPacked: 100,
        presentToken: 0,
        tokenMatchToken: 1,
        epochPresentToken: 1,
        epochMatchToken: 1,
        leaseState: 1,
      }),
      106,
      "U07 reaching input still 106",
    );
    expect(
      finalize({ spentToken: 1, consumePacked: 100, auditPacked: 100, leaseState: 1 }),
      106,
      "U07 acked==101 input still 106",
    );
  });
  expect(
    finalize({
      spentToken: 1,
      consumePacked: 100,
      auditPacked: 100,
      presentToken: 0,
      tokenMatchToken: 1,
      epochPresentToken: 1,
      epochMatchToken: 1,
      leaseState: 1,
    }),
    106,
    "restored reaching input",
  );
});

test("F4 standalone survivor pins no mutant needle", () => {
  expect(clock({ clock: 6000, armedAt: 1000, budget: 5000 }), 147, "clock == armedAt+budget is 147");
  expect(clock({ clock: 5999, armedAt: 1000, budget: 5000 }), 100, "clock == armedAt+budget-1 is 100");
  expect(mint({ atCapToken: 1 }), 136, "mintAdmit 102 maps to 136");
  expect(runFlow("mintAdmit", [1, 0, 1, 0, 0, 0, 0, 0, 1, 0]), 102, "mintAdmit randomness-absent 102");
  expect(mint({ randomnessPresentToken: 0 }), 136, "kernel randomness-absent arm EQUIVALENT 136");
  expect(secrets({ requiredCount: 1, providerPresent: 1, presenceStatus: 4, epochPresentToken: 1 }), 135, "admit 101 maps 135");
  const unit = readFileSync(UNIT, "utf8");
  assert.equal(unit.includes("if admitted == 106 {\n    return finish(6, true)"), true, "admit 106 stays 106 never 135");
  expect(secrets({ requiredCount: 1, providerPresent: 1, presenceStatus: 0, mintedOp: 1, secretOp: 1, mintedEpoch: 1, secretEpoch: 2 }), 123, "minted epoch mismatch");
  expect(idemp({ claimToken: 0, dispatchToken: 0, settleClass: 11 }), 111, "reserve refused cancel failure");
  expect(consume({ independentAuthToken: 0 }), 105, "independentAuth 0 non-100");
  expect(consume({ cleanupEvidence: 2 }), 106, "cleanup pending");
  expect(consume({ cleanupEvidence: 3 }), 106, "cleanup failed");
  expect(consume({ cleanupEvidence: 4 }), 106, "cleanup unknown");
  expect(finalize({ spentToken: 1, consumePacked: 100, auditPacked: 100, leaseState: 1 }), 106, "spent full success 106");
  expect(clock({ clockClass: 3, clock: 1000 }), 110, "clock classTag 3");
  expect(clock({ clockClass: 11, clock: 1000 }), 111, "clock classTag 11");
  expect(mint({ epoch: -1 }), 123, "mint epoch -1");
});

test("mutant swallow ack-downgrade goes RED then restored green", () => {
  const needle = "if acked == 101 {\n    return finish(6, true)";
  expect(finalize({ spentToken: 1, consumePacked: 100, auditPacked: 100, leaseState: 1 }), 106, "landed spent success");
  withMutant(needle, "if acked == 101 {\n    return finish(0, true)", "swallow downgrade mutant", () => {
    expect(finalize({ spentToken: 1, consumePacked: 100, auditPacked: 100, leaseState: 1 }), 100, "mutant swallows to 100");
  });
  expect(finalize({ spentToken: 1, consumePacked: 100, auditPacked: 100, leaseState: 1 }), 106, "restored spent success");
});

test("mutant map port throw to REFUSED goes RED then restored green", () => {
  const needle = "if claimToken == 4 {\n    return finish(6, true)";
  expect(idemp({ claimToken: 4 }), 106, "landed store throw UNKNOWN");
  withPortsMutant(needle, "if claimToken == 4 {\n    return finish(11, true)", "port throw refused mutant", () => {
    expect(idemp({ claimToken: 4 }), 111, "mutant maps throw to REFUSED");
  });
  expect(idemp({ claimToken: 4 }), 106, "restored store throw");
});

test("mutant set minted epoch from local flag goes RED then restored green", () => {
  const needle = "if mintedEpoch != secretEpoch {\n      return finish(23, true)";
  expect(secrets({ requiredCount: 1, providerPresent: 1, presenceStatus: 0, mintedOp: 1, secretOp: 1, mintedEpoch: 1, secretEpoch: 2 }), 123, "landed epoch bind");
  withMutant(needle, "if mintedEpoch != secretEpoch {\n      return finish(0, true)", "minted local flag mutant", () => {
    const r = secrets({ requiredCount: 1, providerPresent: 1, presenceStatus: 0, mintedOp: 1, secretOp: 1, mintedEpoch: 1, secretEpoch: 2 });
    assert.equal(r.present, true, "mutant present");
    assert.notEqual(r.value, 123, "mutant skips minted epoch bind");
  });
  expect(secrets({ requiredCount: 1, providerPresent: 1, presenceStatus: 0, mintedOp: 1, secretOp: 1, mintedEpoch: 1, secretEpoch: 2 }), 123, "restored epoch bind");
});

test("skip-one-wipe is typed UNKNOWN outside this unit", () => {
  const unit = readFileSync(UNIT, "utf8");
  assert.equal(unit.includes("packed +100 is a wipe construct"), true, "wipe construct documented");
  assert.equal(unit.includes("pure flow finish("), false, "kernel does not own wipe");
});

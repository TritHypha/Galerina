import { spawnSync } from "node:child_process";
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { basename, dirname, join } from "node:path";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";

const HERE = dirname(fileURLToPath(import.meta.url));
const MEM = join(HERE, "..", "..");
const REPO = join(MEM, "..", "..", "..");
const BOUNDARY = join(MEM, "src", "c-boundary.fungi");
const BODY = join(MEM, "src", "body-reader.fungi");
const RCP = join(MEM, "src", "release-commit-point.fungi");
const SECRET = join(MEM, "src", "secret-gate.fungi");
const UNIT = join(MEM, "src", "auth-verify-route.fungi");
const GALERINA = join(REPO, "galerina.mjs");
const CB_IMPORT = "\nimport \"./c-boundary.fungi\"\n";
const BODY_IMPORT = "\nimport \"./body-reader.fungi\"\n";
const RCP_IMPORT = "\nimport \"./release-commit-point.fungi\"\n";
const SECRET_IMPORT = "\nimport \"./secret-gate.fungi\"\n";

const UNIT_SOURCE_LANDING = Object.freeze({ kind: "LANDING" });
let unitSourceOverride = UNIT_SOURCE_LANDING;
let bodySourceOverride = UNIT_SOURCE_LANDING;

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

function flattenUnit() {
  const boundary = readFileSync(BOUNDARY, "utf8");
  const bodyReader = bodySourceOverride === UNIT_SOURCE_LANDING ? readFileSync(BODY, "utf8") : bodySourceOverride;
  const rcp = readFileSync(RCP, "utf8");
  const secret = readFileSync(SECRET, "utf8");
  const unit = unitSourceOverride === UNIT_SOURCE_LANDING ? readFileSync(UNIT, "utf8") : unitSourceOverride;
  assert.equal(unit.includes(CB_IMPORT), true, "landed source must import c-boundary");
  assert.equal(unit.includes(BODY_IMPORT), true, "landed source must import body-reader");
  assert.equal(unit.includes(RCP_IMPORT), true, "landed source must import release-commit-point");
  assert.equal(unit.includes(SECRET_IMPORT), true, "landed source must import secret-gate");
  let rest = unit;
  rest = splitOnce(rest, CB_IMPORT, "c-boundary");
  rest = splitOnce(rest, BODY_IMPORT, "body-reader");
  rest = splitOnce(rest, RCP_IMPORT, "release-commit-point");
  rest = splitOnce(rest, SECRET_IMPORT, "secret-gate");
  rest = stripVersion(rest);
  const dir = mkdtempSync(join(tmpdir(), "q35-flat-"));
  const file = join(dir, basename(dir) + ".fungi");
  const body = stripVersion(stripBodyFinish(bodyReader));
  writeFileSync(file, boundary + "\n" + body + "\n" + stripVersion(rcp) + "\n" + stripSecretImports(secret) + "\n" + rest);
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

function readChunksArgs(over) {
  const o = over || {};
  return [
    o.nChunksClass ?? 0,
    o.nChunks ?? 0,
    o.id1 ?? 0,
    o.off1Class ?? 0,
    o.off1 ?? 0,
    o.len1Class ?? 0,
    o.len1 ?? 0,
    o.id2 ?? 0,
    o.off2Class ?? 0,
    o.off2 ?? 0,
    o.len2Class ?? 0,
    o.len2 ?? 0,
    o.capClass ?? 0,
    o.cap ?? 16384,
    o.declaredPresent ?? 0,
    o.declaredLenClass ?? 0,
    o.declaredLen ?? 0,
    o.streamPresent ?? 1,
    o.deadlineExpired ?? 0,
    o.foreignThrow ?? 0,
  ];
}

const OVER_CAP_20 = readChunksArgs({ nChunks: 1, id1: 1, off1: 0, len1: 16385, cap: 16384, streamPresent: 1 });
const OLD_13_ABI = [1, 1, 0, 16385, 0, 0, 0, 16384, false, 0, true, false, false];

function ingress(over) {
  const o = over || {};
  return runFlow("admitIngress", [
    o.methodClass ?? 0,
    o.methodToken ?? 0,
    o.pathClass ?? 0,
    o.pathToken ?? 0,
    o.contentClass ?? 0,
    o.contentTypeToken ?? 0,
    o.channelClass ?? 0,
    o.channelToken ?? 0,
    o.bodyClass ?? 0,
    o.bodyPacked ?? 100,
    o.unknownClass ?? 0,
    o.unknownFieldToken ?? 0,
    o.malformedClass ?? 0,
    o.malformedToken ?? 0,
  ]);
}

function mint(over) {
  const o = over || {};
  return runFlow("mintOperation", [
    o.randomClass ?? 0,
    o.randomnessPresentToken ?? 1,
    o.callerClass ?? 0,
    o.callerMintToken ?? 0,
    o.idClass ?? 0,
    o.idPresentToken ?? 1,
    o.epochClass ?? 0,
    o.epoch ?? 1,
    o.existingClass ?? 0,
    o.existingPresentToken ?? 0,
    o.leaseClass ?? 0,
    o.existingLease ?? 0,
    o.retiredClass ?? 0,
    o.retiredToken ?? 0,
    o.capClass ?? 0,
    o.atCapToken ?? 0,
    o.freshClass ?? 0,
    o.issuedFreshToken ?? 1,
    o.hereClass ?? 0,
    o.issuedHereToken ?? 0,
  ]);
}

function clock(over) {
  const o = over || {};
  return runFlow("applyClock", [
    o.clockClass ?? 0,
    o.clock ?? 1000,
    o.presentClass ?? 0,
    o.clockPresent ?? 1,
    o.armedClass ?? 0,
    o.armedAt ?? 1000,
    o.budgetClass ?? 0,
    o.budget ?? 5000,
    o.clockEpochClass ?? 0,
    o.clockEpoch ?? 1,
    o.armedEpochClass ?? 0,
    o.armedEpoch ?? 1,
  ]);
}

function pre(over) {
  const o = over || {};
  return runFlow("applyPrePorts", [
    o.digestClass ?? 0,
    o.digestToken ?? 1,
    o.aotClass ?? 0,
    o.aotToken ?? 0,
    o.bytecodeClass ?? 0,
    o.bytecodeToken ?? 0,
    o.slideClass ?? 0,
    o.slideToken ?? 0,
    o.vokClass ?? 0,
    o.vokToken ?? 0,
    o.verdictClass ?? 0,
    o.verdictToken ?? 0,
    o.secretClass ?? 0,
    o.secretPacked ?? 100,
    o.tcbClass ?? 0,
    o.tcbToken ?? 0,
    o.mintedOpClass ?? 0,
    o.mintedOp ?? 7,
    o.secretOpClass ?? 0,
    o.secretOp ?? 7,
    o.mintedEpochClass ?? 0,
    o.mintedEpoch ?? 1,
    o.secretEpochClass ?? 0,
    o.secretEpoch ?? 1,
    o.recPresentClass ?? 0,
    o.recPresentToken ?? 0,
    o.recRetiredClass ?? 0,
    o.recRetiredToken ?? 0,
    o.recTombClass ?? 0,
    o.recTombstoneToken ?? 0,
    o.recLeaseClass ?? 0,
    o.recLeaseState ?? 0,
  ]);
}

function consume(over) {
  const o = over || {};
  return runFlow("applyConsume", [
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
    o.cleanupClass ?? 0,
    o.cleanupEvidence ?? 1,
    o.authClass ?? 0,
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

function post(over) {
  const o = over || {};
  return runFlow("applyPostConsume", [
    o.preClass ?? 0,
    o.prePacked ?? 100,
    o.guestClass ?? 0,
    o.guestToken ?? 0,
    o.disconnectClass ?? 0,
    o.disconnectToken ?? 0,
    o.sinkClass ?? 0,
    o.sinkToken ?? 0,
    o.cleanupClass ?? 0,
    o.cleanupEvidence ?? 1,
    o.ackClass ?? 0,
    o.ackToken ?? 0,
    o.suiteClass ?? 0,
    o.suiteId ?? 0,
    o.pqClass ?? 0,
    o.pqAvailable ?? 1,
    o.authClass ?? 0,
    o.independentAuthToken ?? 1,
    o.consumedAuthClass ?? 0,
    o.consumedAuthorityToken ?? 1,
    o.validityClass ?? 0,
    o.currentValidityToken ?? 1,
  ]);
}

function recover(over) {
  const o = over || {};
  return runFlow("recoverLease", [
    o.presentClass ?? 0,
    o.presentToken ?? 0,
    o.retiredClass ?? 0,
    o.retiredToken ?? 0,
    o.tombstoneClass ?? 0,
    o.tombstoneDroppedToken ?? 0,
    o.leaseClass ?? 0,
    o.leaseState ?? 0,
  ]);
}

function http(code) {
  return runFlow("httpStatusFor", [0, code]);
}

function seal(over) {
  const o = over || {};
  return runFlow("sealReceipt", [
    o.suiteClass ?? 0,
    o.suiteId ?? 0,
    o.pqClass ?? 0,
    o.pqAvailable ?? 1,
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

function withBodyMutant(from, to, runRed) {
  const origBytes = readFileSync(BODY);
  const orig = origBytes.toString("utf8");
  const before = shaOf(origBytes);
  const mutant = replaceOnce(orig, from, to);
  const prev = bodySourceOverride;
  bodySourceOverride = mutant;
  try {
    runRed();
  } finally {
    bodySourceOverride = prev;
    const after = shaOf(readFileSync(BODY));
    assert.equal(after, before, "tracked BODY must be unchanged after mutant");
  }
}

test("c-boundary helper still maps classTag 0..10 and unlisted 11", () => {
  expectPacked(invoke(BOUNDARY, "readForeignSafeInteger", [0, 4]), 0, "ok");
  expectPacked(invoke(BOUNDARY, "readForeignSafeInteger", [3, 0]), 3, "NaN");
  expectPacked(invoke(BOUNDARY, "readForeignSafeInteger", [11, 0]), 11, "unlisted");
});

test("CN-1 unit imports four frozen files once and does not copy the helper or packer", () => {
  const unit = readFileSync(UNIT, "utf8");
  assert.equal(unit.split(CB_IMPORT).length, 2);
  assert.equal(unit.split(BODY_IMPORT).length, 2);
  assert.equal(unit.split(RCP_IMPORT).length, 2);
  assert.equal(unit.split(SECRET_IMPORT).length, 2);
  assert.equal(unit.includes("if classTag == 0"), false, "no helper copy");
  assert.equal(unit.includes("pure flow finish("), false, "packer lives in release-commit-point");
});

test("MUST-ADMIT exact POST json allowed channel body-ok", () => {
  expectPacked(ingress({}), 100, "ingress ok");
});

test("MUST-REFUSE wrong method", () => {
  expectPacked(ingress({ methodToken: 1 }), 112, "GET");
});

test("MUST-REFUSE path variants trailing slash case percent dot", () => {
  expectPacked(ingress({ pathToken: 1 }), 113, "slash");
  expectPacked(ingress({ pathToken: 2 }), 113, "case");
  expectPacked(ingress({ pathToken: 3 }), 113, "percent");
  expectPacked(ingress({ pathToken: 4 }), 113, "dot");
});

test("MUST-REFUSE wrong content type and channel", () => {
  expectPacked(ingress({ contentTypeToken: 1 }), 114, "content-type");
  expectPacked(ingress({ channelToken: 1 }), 115, "channel");
});

test("MUST-REFUSE body over cap by one packed 105", () => {
  expectPacked(ingress({ bodyPacked: 105 }), 116, "over cap");
});

test("MUST-REFUSE unknown body field", () => {
  expectPacked(ingress({ unknownFieldToken: 1 }), 117, "unknown field");
});

test("MUST-REFUSE malformed body and other body-reader packed codes", () => {
  expectPacked(ingress({ malformedToken: 1 }), 118, "malformed token");
  expectPacked(ingress({ bodyPacked: 101 }), 118, "dup ref");
  expectPacked(ingress({ bodyPacked: 108 }), 118, "absent stream");
});

test("MUST-REFUSE body timeout as deadline and body throw as UNKNOWN", () => {
  expectPacked(ingress({ bodyPacked: 109 }), 129, "body timeout");
  expectPacked(ingress({ bodyPacked: 110 }), 106, "body throw");
  expectPacked(ingress({ bodyPacked: 111 }), 111, "body unlisted");
});

test("MUST-REFUSE unlisted ingress tokens", () => {
  expectPacked(ingress({ methodToken: 9 }), 111, "method unlisted");
  expectPacked(ingress({ pathToken: 9 }), 111, "path unlisted");
  expectPacked(ingress({ unknownFieldToken: 9 }), 111, "unknown unlisted");
});

test("MUST-REFUSE foreign classTag on ingress", () => {
  expectPacked(ingress({ methodClass: 3 }), 110, "method NaN");
  expectPacked(ingress({ methodClass: 11 }), 111, "method unlisted class");
  expectPacked(ingress({ bodyClass: 3 }), 110, "body NaN");
});

test("MUST-ADMIT kernel mint with randomness", () => {
  expectPacked(mint({}), 100, "mint ok");
});

test("MUST-REFUSE mint with randomness absent", () => {
  expectPacked(mint({ randomnessPresentToken: 0 }), 119, "no random");
});

test("MUST-REFUSE caller-supplied mint in production", () => {
  expectPacked(mint({ callerMintToken: 1 }), 120, "caller mint");
});

test("MUST-REFUSE mint replay of existing terminal lease", () => {
  expectPacked(mint({ existingPresentToken: 1, existingLease: 1, issuedHereToken: 1 }), 137, "reissued released");
});

test("MUST-ADMIT clock inside budget same epoch", () => {
  expectPacked(clock({}), 100, "clock ok");
});

test("MUST-REFUSE clock missing negative backwards epoch overflow deadline", () => {
  expectPacked(clock({ clockPresent: 0 }), 121, "missing");
  expectPacked(clock({ clock: -1 }), 121, "negative");
  expectPacked(clock({ clock: 900, armedAt: 1000 }), 122, "backwards");
  expectPacked(clock({ clockEpoch: 1, armedEpoch: 2 }), 123, "epoch");
  expectPacked(clock({ clock: 2147483647, armedAt: 2147483647, budget: 1 }), 124, "overflow");
  expectPacked(clock({ clock: 7000, armedAt: 1000, budget: 5000 }), 129, "deadline");
});

test("MUST-ADMIT pre-ports fresh not-found with bound secret", () => {
  expectPacked(pre({}), 100, "pre ok");
});

test("MUST-REFUSE each typed load-artifact and verifier reason", () => {
  expectPacked(pre({ digestToken: 0 }), 125, "digest missing");
  expectPacked(pre({ digestToken: 2 }), 126, "mismatch");
  expectPacked(pre({ aotToken: 1 }), 127, "AOT");
  expectPacked(pre({ bytecodeToken: 1 }), 128, "bytecode");
  expectPacked(pre({ slideToken: 1 }), 130, "slide");
  expectPacked(pre({ vokToken: 1 }), 131, "authority missing");
  expectPacked(pre({ vokToken: 2 }), 132, "stale");
  expectPacked(pre({ vokToken: 3 }), 133, "revoked");
  expectPacked(pre({ verdictToken: 1 }), 134, "VERDICT");
  expectPacked(pre({ tcbToken: 1 }), 136, "tcb");
});

test("MUST-REFUSE secret unavailable and bind mismatch", () => {
  expectPacked(pre({ secretPacked: 101 }), 135, "secret 101");
  expectPacked(pre({ mintedOp: 7, secretOp: 8 }), 135, "op bind");
  expectPacked(pre({ mintedEpoch: 1, secretEpoch: 2 }), 123, "epoch bind");
});

test("MUST-REFUSE secret 106 before consume as UNKNOWN never REFUSED", () => {
  expectPacked(pre({ secretPacked: 106 }), 106, "secret unknown");
});

test("MUST-REFUSE replay of every canonical recovery plus unlisted", () => {
  expectPacked(pre({ recPresentToken: 1, recLeaseState: 2 }), 137, "RELEASED_ACKED");
  expectPacked(pre({ recPresentToken: 1, recLeaseState: 1 }), 137, "RELEASED_UNACKED");
  expectPacked(pre({ recPresentToken: 1, recLeaseState: 3 }), 137, "REFUSED fenced");
  expectPacked(pre({ recPresentToken: 1, recLeaseState: 4 }), 137, "DELIVERY_UNKNOWN");
  expectPacked(pre({ recPresentToken: 0, recRetiredToken: 1 }), 137, "retired unknown");
  expectPacked(pre({ recLeaseState: 9 }), 138, "unlisted recovery");
});

test("MUST-ADMIT consume at commit point", () => {
  expectPacked(consume({}), 100, "consume released");
});

test("MUST-REFUSE revocation committed before release", () => {
  expectPacked(consume({ revokeCommittedToken: 1 }), 102, "revoke first");
});

test("landed source currentValidityToken 0 with presentToken 1 is UNKNOWN 106", () => {
  expectPacked(consume({ currentValidityToken: 0, presentToken: 1 }), 106, "validity 0");
});

test("landed source consumedAuthorityToken 0 with presentToken 1 is UNKNOWN 106", () => {
  expectPacked(consume({ consumedAuthorityToken: 0, presentToken: 1 }), 106, "consumedAuth 0");
});

test("landed source currentValidityToken 0 with revokeCommittedToken 1 is UNKNOWN 106", () => {
  expectPacked(consume({ currentValidityToken: 0, revokeCommittedToken: 1 }), 106, "guard validity before revoke");
});

test("MUST-REFUSE listed cleanup as UNKNOWN at consume", () => {
  expectPacked(consume({ cleanupEvidence: 2 }), 106, "pending");
  expectPacked(consume({ cleanupEvidence: 3 }), 106, "failed");
  expectPacked(consume({ cleanupEvidence: 4 }), 106, "unknown");
});

test("MUST-REFUSE post-consume never packed 100", () => {
  expectPacked(post({}), 106, "happy post unknown");
});

test("MUST-REFUSE guest trap and guest unknown", () => {
  expectPacked(post({ guestToken: 1 }), 139, "trap");
  expectPacked(post({ guestToken: 2 }), 106, "guest unknown");
});

test("MUST-REFUSE client disconnect distinct from deadline", () => {
  expectPacked(post({ disconnectToken: 1 }), 140, "disconnect");
  expectPacked(clock({ clock: 7000, armedAt: 1000, budget: 5000 }), 129, "deadline stays 129");
});

test("MUST-REFUSE sink partial unknown throw never-settles as UNKNOWN", () => {
  expectPacked(post({ sinkToken: 1 }), 106, "partial");
  expectPacked(post({ sinkToken: 2 }), 106, "unknown");
  expectPacked(post({ sinkToken: 3 }), 106, "throw");
  expectPacked(post({ sinkToken: 4 }), 106, "never settles");
});

test("MUST-REFUSE cleanup failed plus quarantine", () => {
  expectPacked(post({ cleanupEvidence: 3 }), 141, "cleanup failed");
});

test("MUST-REFUSE ack refused", () => {
  expectPacked(post({ ackToken: 1 }), 142, "ack");
});

test("MUST-REFUSE receipt with no suite id", () => {
  expectPacked(post({ suiteId: 2 }), 143, "no suite");
  expectPacked(seal({ suiteId: 2 }), 143, "seal no suite");
});

test("MUST-REFUSE classical-only and missing PQ as UNKNOWN never Assured", () => {
  expectPacked(post({ suiteId: 1 }), 106, "classical");
  expectPacked(post({ pqAvailable: 0 }), 106, "pq missing");
  expectPacked(seal({ suiteId: 1 }), 106, "seal classical");
  expectPacked(seal({ pqAvailable: 0 }), 106, "seal pq missing");
});

test("MUST-REFUSE false release tokens after consume as UNKNOWN", () => {
  expectPacked(post({ independentAuthToken: 0 }), 106, "auth 0");
  expectPacked(post({ consumedAuthorityToken: 0 }), 106, "consumedAuth 0");
  expectPacked(post({ currentValidityToken: 0 }), 106, "validity 0");
});

test("MUST-REFUSE post when prePacked is not consume-100", () => {
  expectPacked(post({ prePacked: 106 }), 106, "pre unknown");
  expectPacked(post({ prePacked: 102 }), 106, "pre refused");
});

test("MUST-REFUSE unlisted post tokens", () => {
  expectPacked(post({ guestToken: 9 }), 106, "guest unlisted");
  expectPacked(post({ sinkToken: 9 }), 106, "sink unlisted");
  expectPacked(post({ suiteId: 9 }), 106, "suite unlisted");
});

test("MUST-REFUSE foreign classTag after consume as UNKNOWN never REFUSED", () => {
  expectPacked(post({ guestClass: 3 }), 106, "guest NaN");
  expectPacked(post({ sinkClass: 11 }), 106, "sink unlisted class");
});

test("MUST-REFUSE classTag 3 and 11 on every post-consume pair and unlisted 9 on every token as UNKNOWN never packed 100", () => {
  const classFields = [
    "preClass",
    "guestClass",
    "disconnectClass",
    "sinkClass",
    "cleanupClass",
    "ackClass",
    "suiteClass",
    "pqClass",
    "authClass",
    "consumedAuthClass",
    "validityClass",
  ];
  const tokenFields = [
    "guestToken",
    "disconnectToken",
    "sinkToken",
    "cleanupEvidence",
    "ackToken",
    "pqAvailable",
    "independentAuthToken",
    "consumedAuthorityToken",
    "currentValidityToken",
    "suiteId",
  ];
  let saw100 = false;
  let i = 0;
  while (i < classFields.length) {
    const field = classFields[i];
    const over3 = {};
    over3[field] = 3;
    const r3 = post(over3);
    expectPacked(r3, 106, field + " classTag 3");
    if (r3.value === 100) {
      saw100 = true;
    }
    const over11 = {};
    over11[field] = 11;
    const r11 = post(over11);
    expectPacked(r11, 106, field + " classTag 11");
    if (r11.value === 100) {
      saw100 = true;
    }
    i = i + 1;
  }
  let t = 0;
  while (t < tokenFields.length) {
    const field = tokenFields[t];
    const over = {};
    over[field] = 9;
    const r = post(over);
    expectPacked(r, 106, field + " unlisted 9");
    if (r.value === 100) {
      saw100 = true;
    }
    t = t + 1;
  }
  assert.equal(saw100, false, "no (field, classTag 3/11) or (field, unlisted) combination returns packed 100");
});

test("MUST-REFUSE prePacked 102 and 106 combined with trap tokens as UNKNOWN never named 139-142", () => {
  const traps = [
    { guestToken: 1, label: "guest trap" },
    { disconnectToken: 1, label: "disconnect" },
    { cleanupEvidence: 3, label: "cleanup" },
    { ackToken: 1, label: "ack" },
  ];
  const pres = [102, 106];
  let pi = 0;
  while (pi < pres.length) {
    let ti = 0;
    while (ti < traps.length) {
      const over = { prePacked: pres[pi] };
      if (traps[ti].guestToken !== undefined) {
        over.guestToken = traps[ti].guestToken;
      }
      if (traps[ti].disconnectToken !== undefined) {
        over.disconnectToken = traps[ti].disconnectToken;
      }
      if (traps[ti].cleanupEvidence !== undefined) {
        over.cleanupEvidence = traps[ti].cleanupEvidence;
      }
      if (traps[ti].ackToken !== undefined) {
        over.ackToken = traps[ti].ackToken;
      }
      const r = post(over);
      expectPacked(r, 106, "prePacked " + String(pres[pi]) + " " + traps[ti].label);
      assert.notEqual(r.value, 100, "prePacked " + String(pres[pi]) + " " + traps[ti].label + " never packed 100");
      ti = ti + 1;
    }
    pi = pi + 1;
  }
});

test("status-only recovery never reopens", () => {
  expectPacked(recover({}), 104, "NOT_FOUND");
  expectPacked(recover({ presentToken: 1, leaseState: 2 }), 100, "RELEASED_ACKED");
  expectPacked(recover({ presentToken: 1, leaseState: 1 }), 101, "RELEASED_UNACKED");
  expectPacked(recover({ leaseState: 9 }), 138, "unlisted");
});

test("httpStatusFor is total with refusing default 503 and disconnect 499", () => {
  expectPacked(http(100), 200, "released");
  expectPacked(http(112), 400, "method");
  expectPacked(http(116), 413, "over cap");
  expectPacked(http(137), 409, "replay");
  expectPacked(http(129), 504, "deadline");
  expectPacked(http(140), 499, "disconnect");
  expectPacked(http(106), 503, "unknown");
  expectPacked(http(999), 503, "default");
  expectPacked(http(134), 403, "verdict");
});

test("seal hybrid with PQ admits packed 100", () => {
  expectPacked(seal({}), 100, "hybrid");
});

test("RED mutant drop unknown-field refusal", () => {
  withMutant(
    "if unknownFieldToken == 1 {\n    return finish(17, true)",
    "if unknownFieldToken == 1 {\n    return finish(0, true)",
    () => {
      const r = ingress({ unknownFieldToken: 1 });
      assert.notEqual(r.value, 117, "unknown field must not stay refused");
      assert.equal(r.value, 100, "unknown field admitted");
    },
  );
  expectPacked(ingress({ unknownFieldToken: 1 }), 117, "restore unknown field");
});

test("RED mutant accept caller mint", () => {
  withMutant(
    "if callerMintToken == 1 {\n    return finish(20, true)",
    "if callerMintToken == 1 {\n    return finish(0, true)",
    () => {
      const r = mint({ callerMintToken: 1 });
      assert.notEqual(r.value, 120, "caller mint must not stay refused");
      assert.equal(r.value, 100, "caller mint admitted");
    },
  );
  expectPacked(mint({ callerMintToken: 1 }), 120, "restore caller mint");
});

test("RED mutant drop default arm on recovery switch", () => {
  withMutant(
    "if recovered == 111 {\n    return finish(38, true)\n  }\n  if recovered != 104 {",
    "if recovered == 111 {\n    return finish(0, true)\n  }\n  if recovered != 104 {",
    () => {
      const r = pre({ recLeaseState: 9 });
      assert.notEqual(r.value, 138, "unlisted recovery must not stay 138");
      assert.equal(r.value, 100, "unlisted recovery admitted");
    },
  );
  expectPacked(pre({ recLeaseState: 9 }), 138, "restore recovery default");
});

test("RED mutant map delivery_unknown to released after consume", () => {
  withMutant(
    "if sinkToken != 0 {\n    return finish(6, true)\n  }\n  if cleanupEvidence != 1 {\n    return finish(6, true)\n  }\n  return finish(6, true)",
    "if sinkToken != 0 {\n    return finish(6, true)\n  }\n  if cleanupEvidence != 1 {\n    return finish(6, true)\n  }\n  return finish(0, true)",
    () => {
      const r = post({});
      assert.notEqual(r.value, 106, "happy post must not stay UNKNOWN");
      assert.equal(r.value, 100, "happy post released");
    },
  );
  expectPacked(post({}), 106, "restore post unknown");
});

test("RED mutant map a port throw to REFUSED", () => {
  withMutant(
    "if bodyPacked == 110 {\n    return finish(6, true)",
    "if bodyPacked == 110 {\n    return finish(18, true)",
    () => {
      const r = ingress({ bodyPacked: 110 });
      assert.notEqual(r.value, 106, "throw must not stay UNKNOWN");
      assert.equal(r.value, 118, "throw mapped refused");
    },
  );
  expectPacked(ingress({ bodyPacked: 110 }), 106, "restore throw unknown");
});

test("RED mutant drop deadline check", () => {
  withMutant(
    "if clock > armedAt + budget - 1 {\n    return finish(29, true)",
    "if clock > armedAt + budget - 1 {\n    return finish(0, true)",
    () => {
      const r = clock({ clock: 7000, armedAt: 1000, budget: 5000 });
      assert.notEqual(r.value, 129, "deadline must not stay refused");
      assert.equal(r.value, 100, "deadline admitted");
    },
  );
  expectPacked(clock({ clock: 7000, armedAt: 1000, budget: 5000 }), 129, "restore deadline");
});

test("RED mutant swap release and revoke order", () => {
  withMutant(
    "let consumed: Int = consumeStep(presentToken, tokenMatchToken, 0, epochMatchToken, leaseState, revokeCommittedToken, guardOutcome)",
    "let consumed: Int = consumeStep(presentToken, tokenMatchToken, 0, epochMatchToken, leaseState, 0, guardOutcome)",
    () => {
      const r = consume({ revokeCommittedToken: 1 });
      assert.notEqual(r.value, 102, "revoke first must not stay refused");
    },
  );
  expectPacked(consume({ revokeCommittedToken: 1 }), 102, "restore revoke first");
});

test("landed source unknownFieldToken 1 is 117 without mutant", () => {
  expectPacked(ingress({ unknownFieldToken: 1 }), 117, "standalone unknown field");
});

test("landed source callerMintToken 1 is 120 without mutant", () => {
  expectPacked(mint({ callerMintToken: 1 }), 120, "standalone caller mint");
});

test("landed source recLeaseState 9 is 138 without mutant", () => {
  expectPacked(pre({ recLeaseState: 9 }), 138, "standalone unlisted recovery");
});

test("landed source mint retiredToken 1 is 137 without mutant", () => {
  expectPacked(mint({ retiredToken: 1 }), 137, "standalone retired");
});

test("landed source mint issuedFreshToken 0 is 137 without mutant", () => {
  expectPacked(mint({ issuedFreshToken: 0 }), 137, "standalone not fresh");
});

test("landed source clock budget 5001 is 129 without mutant", () => {
  expectPacked(clock({ budget: 5001 }), 129, "standalone budget over");
});

test("landed source consume independentAuthToken 0 is 105 without mutant", () => {
  expectPacked(consume({ independentAuthToken: 0 }), 105, "standalone auth 0");
});

test("landed source httpStatusFor classTag 3 and 11 with code 100 is 503", () => {
  expectPacked(runFlow("httpStatusFor", [3, 100]), 503, "standalone class 3");
  expectPacked(runFlow("httpStatusFor", [11, 100]), 503, "standalone class 11");
});

test("landed source consume currentValidity classTag 3 is 110 and 11 is 111", () => {
  expectPacked(consume({ validityClass: 3 }), 110, "standalone validity NaN");
  expectPacked(consume({ validityClass: 11 }), 111, "standalone validity unlisted class");
});

test("RED mutant skip one wipe on cleanup-failed post", () => {
  withMutant(
    "if cleanupEvidence == 3 {\n    return finish(41, true)",
    "if cleanupEvidence == 3 {\n    return finish(41, false)",
    () => {
      const r = post({ cleanupEvidence: 3 });
      assert.notEqual(r.value, 141, "cleanup failed must not stay packed 141");
      assert.equal(r.value, 41, "skip wipe unpacks to 41");
    },
  );
  expectPacked(post({ cleanupEvidence: 3 }), 141, "restore cleanup failed");
});

test("MUST-REFUSE body over cap by one byte via body-reader readChunks", () => {
  const bodyPacked = runFlow("readChunks", OVER_CAP_20);
  expectPacked(bodyPacked, 105, "readChunks over cap");
  expectPacked(ingress({ bodyPacked: bodyPacked.value }), 116, "admitIngress over cap from reader");
});

test("MUST-REFUSE composed readChunks classTag token and offset overflow", () => {
  expectPacked(
    runFlow("readChunks", readChunksArgs({ nChunks: 1, id1: 1, off1: 0, len1: 4, capClass: 1, cap: 16384, streamPresent: 1 })),
    111,
    "cap classTag 1",
  );
  expectPacked(
    runFlow("readChunks", readChunksArgs({ nChunks: 1, id1: 1, off1: 0, len1: 4, streamPresent: 2 })),
    111,
    "streamPresentToken 2",
  );
  expectPacked(
    runFlow("readChunks", readChunksArgs({ nChunks: 1, id1: 1, off1: 0, len1: 4, deadlineExpired: 2, streamPresent: 1 })),
    111,
    "deadlineExpiredToken 2",
  );
  expectPacked(
    runFlow("readChunks", readChunksArgs({ nChunks: 1, id1: 1, off1: 2147483647, len1: 2, cap: 16384, streamPresent: 1 })),
    114,
    "offset+len overflow matches 31 MUST-REFUSE offset plus length overflow",
  );
});

test("mutant 47a old 13-arg readChunks call goes RED then restore", () => {
  const red = runFlow("readChunks", OLD_13_ABI);
  assert.notEqual(red.value, 105, "old 13-arg must not pack OverCap 105");
  expectPacked(runFlow("readChunks", OVER_CAP_20), 105, "restore 20-arg");
});

test("mutant 47a body-reader cap compare off by one goes RED then restore", () => {
  withBodyMutant(
    "    if len1 > cap {\n      return finish(5, true)\n    }\n    let maxInt1: Int = 2147483647",
    "    if len1 > cap + 1 {\n      return finish(5, true)\n    }\n    let maxInt1: Int = 2147483647",
    () => {
      const red = runFlow("readChunks", OVER_CAP_20);
      assert.notEqual(red.value, 105, "cap+1 admitted");
    },
  );
  expectPacked(runFlow("readChunks", OVER_CAP_20), 105, "restore cap compare");
});

test("mutant 47a drop cap classTag gate goes RED then restore", () => {
  withBodyMutant(
    "  if capClass != 0 {\n    return finish(11, true)\n  }",
    "  if capClass == 999 {\n    return finish(11, true)\n  }",
    () => {
      const red = runFlow(
        "readChunks",
        readChunksArgs({ nChunks: 1, id1: 1, off1: 0, len1: 4, capClass: 1, cap: 16384, streamPresent: 1 }),
      );
      assert.notEqual(red.value, 111, "cap classTag 1 admitted");
    },
  );
  expectPacked(
    runFlow("readChunks", readChunksArgs({ nChunks: 1, id1: 1, off1: 0, len1: 4, capClass: 1, cap: 16384, streamPresent: 1 })),
    111,
    "restore cap classTag",
  );
});

test("MUST-COMPOSE secret-gate deliverPreHandoff into applyPrePorts", () => {
  const admitted = runFlow("deliverPreHandoff", [0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 0, 0, 0, 0, 1]);
  expectPacked(admitted, 100, "deliver admitted");
  expectPacked(pre({ secretPacked: admitted.value }), 100, "pre admitted from gate");
  const refused = runFlow("deliverPreHandoff", [0, 1, 0, 0, 0, 1, 0, 1, 0, 1, 0, 0, 0, 0, 0, 1]);
  expectPacked(refused, 119, "deliver no provider");
  expectPacked(pre({ secretPacked: refused.value }), 135, "pre secret unavailable from gate");
});

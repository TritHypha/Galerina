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
const SRC = join(MEM, "src");
const GALERINA = join(REPO, "galerina.mjs");
const UNIT = join(SRC, "auth-verify-e2e.fungi");
const UNIT_SOURCE_LANDING = Object.freeze({ kind: "LANDING" });
let unitSourceOverride = UNIT_SOURCE_LANDING;
let arityGuardEnabled = true;

const CB_IMPORT = "\nimport \"./c-boundary.fungi\"\n";
const BODY_IMPORT = "\nimport \"./body-reader.fungi\"\n";
const RCP_IMPORT = "\nimport \"./release-commit-point.fungi\"\n";
const SECRET_IMPORT = "\nimport \"./secret-gate.fungi\"\n";
const PORTS_IMPORT = "\nimport \"./kernel-ports.fungi\"\n";
const SERVE_IMPORT = "\nimport \"./serve-gate.fungi\"\n";
const ROUTE_IMPORT = "\nimport \"./auth-verify-route.fungi\"\n";
const SIGNET_IMPORT = "\nimport \"./signet-grant-seal.fungi\"\n";
const MONO_IMPORT = "\nimport \"./monotonic-time.fungi\"\n";
const KERNEL_IMPORT = "\nimport \"./kernel.fungi\"\n";
const ARENA_IMPORT = "\nimport \"./secret-arena.fungi\"\n";
const CUSTODY_IMPORT = "\nimport \"./secret-arena-custodian-port.fungi\"\n";
const CLEAN_IMPORT = "\nimport \"./cleanup-evidence.fungi\"\n";
const ADAPTER_IMPORT = "\nimport \"./adapter-profile.fungi\"\n";

const PARAMS = Object.freeze([
  "gClass", "layer", "method", "pathClass", "effectClass", "reachClass",
  "nChunksClass", "nChunks", "id1", "off1Class", "off1", "len1Class", "len1",
  "id2", "off2Class", "off2", "len2Class", "len2", "capClass", "cap",
  "declaredPresent", "declaredLenClass", "declaredLen", "streamPresent",
  "deadlineExpired", "foreignThrow", "routeMethod", "routePath", "contentType",
  "channel", "unknownField", "malformed", "tamper", "issuerPinned", "actionMatch",
  "grantEpoch", "currentEpoch", "epochMatchTok", "grantProfile", "currentProfile",
  "profileMatch", "declared", "expired", "suiteId", "pqAvailable", "pqHalf",
  "classicalHalf", "validatedBefore", "verifyBodyBytes", "getterChanging",
  "pinnedSize", "verifierRead", "childExit", "tritToken", "authorizing",
  "extraKey", "testHook", "clockReading", "clockEpoch", "hasLast", "lastEpoch",
  "lastTicks", "deadlineEpoch", "deadlineTicks", "rateCount", "rateLimit",
  "rateJump", "bodyPresent", "jsonMalformed", "jsonNull", "dupKeys",
  "decodeUnknown", "decodeValidator", "budgetBody", "budgetMemory",
  "concCurrent", "concMax", "concReleased", "concZombie", "secretRequired",
  "secretProvider", "secretPresence", "secretEpoch", "secretEpochPresent",
  "mintedOp", "secretOp", "mintedEpochBind", "secretEpochBind", "idempEnabled",
  "idempClaim", "idempAlready", "idempDispatch", "idempTtl", "idempSettle",
  "handlerToken", "secretActive", "secretDeadlineTok", "secretSpent",
  "secretReentrant", "secretFailed", "secretDeclared", "adapterKind",
  "adapterAudit", "casOpenState", "casCompetitor", "casClaimedState",
  "casEpochMatch", "casRevokeAfter", "casCrash", "consumePresent",
  "consumeMatch", "consumeEpochMatch", "consumeLease", "consumeRevoke",
  "independentAuth", "preparedCustody", "cleanupEvidence", "emptyObligation",
  "consumedAuth", "currentValidity", "ackPresent", "ackMatch", "ackEpochPresent",
  "ackEpochMatch", "ackLease", "ackAudit", "priorAck", "retryPrior",
  "sinkOutcome", "crashAfterSink", "postSpent", "postDispatchPacked",
  "postConsumePacked", "postAuditPacked", "postCurrent", "postMax",
  "postReleased", "postZombie", "arenaState", "arenaStatus", "arenaLen",
  "arenaByte", "cleanupMinted", "cleanupEvOp", "cleanupCallOp", "cleanupEvGen",
  "cleanupCallGen", "cleanupEvDigest", "cleanupCallDigest", "cleanupStatus",
  "cleanupOpClass",
]);

const DEFAULTS = Object.freeze({
  gClass: 0, layer: 0, method: 0, pathClass: 0, effectClass: 0, reachClass: 0,
  nChunksClass: 0, nChunks: 1, id1: 1, off1Class: 0, off1: 0, len1Class: 0, len1: 16,
  id2: 0, off2Class: 0, off2: 0, len2Class: 0, len2: 0, capClass: 0, cap: 16384,
  declaredPresent: 0, declaredLenClass: 0, declaredLen: 0, streamPresent: 1,
  deadlineExpired: 0, foreignThrow: 0, routeMethod: 0, routePath: 0, contentType: 0,
  channel: 0, unknownField: 0, malformed: 0, tamper: 0, issuerPinned: 1, actionMatch: 1,
  grantEpoch: 1, currentEpoch: 1, epochMatchTok: 1, grantProfile: 1, currentProfile: 1,
  profileMatch: 1, declared: 1, expired: 0, suiteId: 0, pqAvailable: 1, pqHalf: 1,
  classicalHalf: 1, validatedBefore: 1, verifyBodyBytes: 16, getterChanging: 0,
  pinnedSize: 1024, verifierRead: 1, childExit: 0, tritToken: 1, authorizing: 0,
  extraKey: 0, testHook: 0, clockReading: 1000, clockEpoch: 1, hasLast: 1, lastEpoch: 1,
  lastTicks: 1000, deadlineEpoch: 1, deadlineTicks: 6000, rateCount: 0, rateLimit: 10,
  rateJump: 0, bodyPresent: 1, jsonMalformed: 0, jsonNull: 0, dupKeys: 0,
  decodeUnknown: 0, decodeValidator: 0, budgetBody: 16, budgetMemory: 16384,
  concCurrent: 0, concMax: 4, concReleased: 1, concZombie: 0, secretRequired: 1,
  secretProvider: 1, secretPresence: 0, secretEpoch: 1, secretEpochPresent: 1,
  mintedOp: 7, secretOp: 7, mintedEpochBind: 1, secretEpochBind: 1, idempEnabled: 1,
  idempClaim: 1, idempAlready: 0, idempDispatch: 1, idempTtl: 60, idempSettle: 0,
  handlerToken: 0, secretActive: 1, secretDeadlineTok: 0, secretSpent: 0,
  secretReentrant: 0, secretFailed: 0, secretDeclared: 1, adapterKind: 0,
  adapterAudit: 0, casOpenState: 0, casCompetitor: 0, casClaimedState: 1,
  casEpochMatch: 1, casRevokeAfter: 0, casCrash: 0, consumePresent: 1,
  consumeMatch: 1, consumeEpochMatch: 1, consumeLease: 0, consumeRevoke: 0,
  independentAuth: 1, preparedCustody: 1, cleanupEvidence: 1, emptyObligation: 1,
  consumedAuth: 1, currentValidity: 1, ackPresent: 1, ackMatch: 1, ackEpochPresent: 1,
  ackEpochMatch: 1, ackLease: 1, ackAudit: 1, priorAck: 0, retryPrior: 0,
  sinkOutcome: 0, crashAfterSink: 0, postSpent: 1, postDispatchPacked: 100,
  postConsumePacked: 100, postAuditPacked: 100, postCurrent: 0, postMax: 4,
  postReleased: 1, postZombie: 0, arenaState: 0, arenaStatus: 0, arenaLen: 1,
  arenaByte: 1, cleanupMinted: 1, cleanupEvOp: 7, cleanupCallOp: 7, cleanupEvGen: 1,
  cleanupCallGen: 1, cleanupEvDigest: 9, cleanupCallDigest: 9, cleanupStatus: 0,
  cleanupOpClass: 0,
});

function invoke(file, flow, args) {
  const argv = [GALERINA, "run", file, "--invoke", flow, ...args.map(String)];
  const r = spawnSync(process.execPath, argv, { encoding: "utf8", cwd: REPO, timeout: 180000 });
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

function takeBlockEnd(src, from) {
  const brace = src.indexOf("{", from);
  assert.notEqual(brace, -1, "block open");
  let depth = 0;
  let i = brace;
  while (i < src.length) {
    if (src[i] === "{") depth = depth + 1;
    if (src[i] === "}") {
      depth = depth - 1;
      if (depth === 0) return i + 1;
    }
    i = i + 1;
  }
  assert.fail("unclosed block");
  return src.length;
}

function stripNamedFlow(src, name) {
  const re = new RegExp("(pure |secure |unsafe )?flow\\s+" + name + "\\s*\\(");
  const m = src.match(re);
  assert.equal(m !== null, true, "missing flow " + name);
  const start = m.index;
  const headerEnd = src.indexOf("{", start);
  const header = src.slice(start, headerEnd);
  let end = takeBlockEnd(src, start);
  if (header.includes("contract")) {
    end = takeBlockEnd(src, end);
  }
  return src.slice(0, start) + src.slice(end);
}

function stripFinishUntil(src, nextName) {
  const start = src.indexOf("pure flow finish(");
  assert.notEqual(start, -1, "finish packer");
  const next = src.indexOf("pure flow " + nextName);
  assert.equal(next > start, true, "finish bounds " + nextName);
  return src.slice(0, start) + src.slice(next);
}

function stripImports(src, needles, label) {
  let s = src;
  let i = 0;
  while (i < needles.length) {
    s = splitOnce(s, needles[i], label + " " + String(i));
    i = i + 1;
  }
  return stripVersion(s);
}

function flattenUnit() {
  const boundary = readFileSync(join(SRC, "c-boundary.fungi"), "utf8");
  const rcp = readFileSync(join(SRC, "release-commit-point.fungi"), "utf8");
  const bodyReader = readFileSync(join(SRC, "body-reader.fungi"), "utf8");
  const serve = readFileSync(join(SRC, "serve-gate.fungi"), "utf8");
  const cleanup = readFileSync(join(SRC, "cleanup-evidence.fungi"), "utf8");
  const ports = readFileSync(join(SRC, "kernel-ports.fungi"), "utf8");
  const secret = readFileSync(join(SRC, "secret-gate.fungi"), "utf8");
  const custody = readFileSync(join(SRC, "secret-arena-custodian-port.fungi"), "utf8");
  const arena = readFileSync(join(SRC, "secret-arena.fungi"), "utf8");
  const adapter = readFileSync(join(SRC, "adapter-profile.fungi"), "utf8");
  const mono = readFileSync(join(SRC, "monotonic-time.fungi"), "utf8");
  const signet = readFileSync(join(SRC, "signet-grant-seal.fungi"), "utf8");
  const route = readFileSync(join(SRC, "auth-verify-route.fungi"), "utf8");
  const kernel = readFileSync(join(SRC, "kernel.fungi"), "utf8");
  const unit = unitSourceOverride === UNIT_SOURCE_LANDING ? readFileSync(UNIT, "utf8") : unitSourceOverride;
  assert.equal(unit.includes(CB_IMPORT), true, "e2e imports c-boundary");
  assert.equal(unit.includes(SERVE_IMPORT), true, "e2e imports serve-gate");
  assert.equal(unit.includes(BODY_IMPORT), true, "e2e imports body-reader");
  assert.equal(unit.includes(ROUTE_IMPORT), true, "e2e imports route");
  assert.equal(unit.includes(SIGNET_IMPORT), true, "e2e imports signet");
  assert.equal(unit.includes(MONO_IMPORT), true, "e2e imports monotonic-time");
  assert.equal(unit.includes(KERNEL_IMPORT), true, "e2e imports kernel");
  assert.equal(unit.includes(PORTS_IMPORT), true, "e2e imports kernel-ports");
  assert.equal(unit.includes(SECRET_IMPORT), true, "e2e imports secret-gate");
  assert.equal(unit.includes(ARENA_IMPORT), true, "e2e imports secret-arena");
  assert.equal(unit.includes(CUSTODY_IMPORT), true, "e2e imports custodian");
  assert.equal(unit.includes(RCP_IMPORT), true, "e2e imports rcp");
  assert.equal(unit.includes(CLEAN_IMPORT), true, "e2e imports cleanup");
  assert.equal(unit.includes(ADAPTER_IMPORT), true, "e2e imports adapter");
  let routeRest = stripImports(route, [CB_IMPORT, BODY_IMPORT, RCP_IMPORT, SECRET_IMPORT], "route");
  routeRest = stripNamedFlow(routeRest, "mintOperation");
  routeRest = stripNamedFlow(routeRest, "applyClock");
  routeRest = stripNamedFlow(routeRest, "applyConsume");
  routeRest = stripNamedFlow(routeRest, "recoverLease");
  let kernelRest = stripImports(kernel, [CB_IMPORT, BODY_IMPORT, RCP_IMPORT, SECRET_IMPORT, PORTS_IMPORT], "kernel");
  kernelRest = stripNamedFlow(kernelRest, "mintOperation");
  kernelRest = stripNamedFlow(kernelRest, "applyConsume");
  kernelRest = stripNamedFlow(kernelRest, "recoverLease");
  kernelRest = stripNamedFlow(kernelRest, "httpStatusFor");
  let e2eRest = unit;
  e2eRest = splitOnce(e2eRest, CB_IMPORT, "e2e cb");
  e2eRest = splitOnce(e2eRest, SERVE_IMPORT, "e2e serve");
  e2eRest = splitOnce(e2eRest, BODY_IMPORT, "e2e body");
  e2eRest = splitOnce(e2eRest, ROUTE_IMPORT, "e2e route");
  e2eRest = splitOnce(e2eRest, SIGNET_IMPORT, "e2e signet");
  e2eRest = splitOnce(e2eRest, MONO_IMPORT, "e2e mono");
  e2eRest = splitOnce(e2eRest, KERNEL_IMPORT, "e2e kernel");
  e2eRest = splitOnce(e2eRest, PORTS_IMPORT, "e2e ports");
  e2eRest = splitOnce(e2eRest, SECRET_IMPORT, "e2e secret");
  e2eRest = splitOnce(e2eRest, ARENA_IMPORT, "e2e arena");
  e2eRest = splitOnce(e2eRest, CUSTODY_IMPORT, "e2e custody");
  e2eRest = splitOnce(e2eRest, RCP_IMPORT, "e2e rcp");
  e2eRest = splitOnce(e2eRest, CLEAN_IMPORT, "e2e clean");
  e2eRest = splitOnce(e2eRest, ADAPTER_IMPORT, "e2e adapter");
  e2eRest = stripVersion(e2eRest);
  const dir = mkdtempSync(join(tmpdir(), "q47-flat-"));
  const file = join(dir, basename(dir) + ".fungi");
  const parts = [
    boundary,
    stripVersion(rcp),
    stripVersion(stripFinishUntil(bodyReader, "rangesOverlap")),
    stripFinishUntil(stripImports(serve, [CB_IMPORT], "serve"), "pathProtection"),
    stripFinishUntil(stripImports(cleanup, [CB_IMPORT], "cleanup"), "emptyObligationClass"),
    stripImports(ports, [CB_IMPORT, RCP_IMPORT], "ports"),
    stripImports(secret, [CB_IMPORT, RCP_IMPORT], "secret"),
    stripImports(custody, [CB_IMPORT], "custody"),
    stripImports(arena, [CB_IMPORT, RCP_IMPORT, CUSTODY_IMPORT], "arena"),
    stripImports(adapter, [CB_IMPORT], "adapter"),
    stripImports(mono, [CB_IMPORT], "mono"),
    stripImports(signet, [CB_IMPORT, RCP_IMPORT], "signet"),
    routeRest,
    kernelRest,
    e2eRest,
  ];
  writeFileSync(file, parts.join("\n"));
  return { dir, file };
}

function declaredArity(src, flow) {
  const re = new RegExp("flow\\s+" + flow + "\\s*\\(([\\s\\S]*?)\\)\\s*->");
  const m = src.match(re);
  assert.equal(m !== null, true, "signature " + flow);
  const inner = m[1].trim();
  if (inner.length === 0) return 0;
  return inner.split(",").length;
}

function guardedInvoke(file, flow, args, src) {
  const n = declaredArity(src, flow);
  if (arityGuardEnabled === true) {
    if (args.length !== n) {
      return { status: 0, text: "ARITY_REFUSED", present: true, reason: "ARITY_REFUSED", value: 111 };
    }
  }
  return invoke(file, flow, args);
}

function runFlow(flow, args) {
  const flat = flattenUnit();
  try {
    const src = readFileSync(flat.file, "utf8");
    return guardedInvoke(flat.file, flow, args, src);
  } finally {
    rmSync(flat.dir, { recursive: true, force: true });
  }
}

function args(over) {
  const o = over || {};
  const out = [];
  let i = 0;
  while (i < PARAMS.length) {
    const name = PARAMS[i];
    const v = Object.prototype.hasOwnProperty.call(o, name) ? o[name] : DEFAULTS[name];
    out.push(v);
    i = i + 1;
  }
  return out;
}

function e2e(over) {
  return runFlow("runAuthVerify", args(over));
}

function expect(r, value, label) {
  assert.equal(r.present, true, label + " present " + r.reason + " " + (r.text || "").slice(-400));
  assert.equal(r.value, value, label + " got " + String(r.value) + " " + (r.text || "").slice(-400));
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

test("harness arity matches landed runAuthVerify", () => {
  const src = readFileSync(UNIT, "utf8");
  assert.equal(declaredArity(src, "runAuthVerify"), PARAMS.length, "arity");
  assert.equal(args({}).length, PARAMS.length, "defaults");
});

test("happy path Success with receipt ack cleanup and HTTP 200", () => {
  expect(e2e(), 100, "success");
});

test("MUST-REFUSE unprotected path class", () => {
  expect(e2e({ pathClass: 7 }), 160, "unprotected");
});

test("MUST-REFUSE body over cap at the reader", () => {
  expect(e2e({ nChunks: 1, id1: 1, off1: 0, len1: 16385, cap: 16384, streamPresent: 1 }), 105, "over-cap");
});

test("MUST-REFUSE classTag != 0 on a foreign Int", () => {
  expect(e2e({ nChunksClass: 1 }), 111, "classTag");
});

test("MUST-REFUSE classical-only suite", () => {
  expect(e2e({ suiteId: 1 }), 114, "classical");
});

test("MUST-REFUSE one bad Signet half under AND", () => {
  expect(e2e({ pqHalf: 0, classicalHalf: 1 }), 115, "pq half");
  expect(e2e({ pqHalf: 1, classicalHalf: 0 }), 115, "classical half");
});

test("MUST-REFUSE revoked stale grant and Signet tamper", () => {
  expect(e2e({ expired: 1 }), 122, "stale expired");
  expect(e2e({ tamper: 1 }), 115, "tamper");
  expect(e2e({ grantEpoch: 1, currentEpoch: 2 }), 118, "prev-epoch");
});

test("MUST-REFUSE clock backwards and clock unavailable", () => {
  expect(e2e({ hasLast: 1, lastTicks: 2000, clockReading: 1000 }), 122, "backwards");
  expect(e2e({ hasLast: 2 }), 111, "unavailable");
});

test("MUST-REFUSE deadline expired before sink", () => {
  expect(e2e({ clockReading: 6000, lastTicks: 6000, deadlineTicks: 6000 }), 126, "expired");
});

test("MUST-REFUSE rate budget concurrency exhausted", () => {
  expect(e2e({ rateCount: 10, rateLimit: 10 }), 127, "rate");
  expect(e2e({ concCurrent: 4, concMax: 4 }), 134, "concurrency");
});

test("MUST-REFUSE duplicate idempotency key", () => {
  expect(e2e({ idempClaim: 2 }), 139, "duplicate");
});

test("MUST-REFUSE secret not acquirable", () => {
  expect(e2e({ secretRequired: 1, secretProvider: 0, secretPresence: 1 }), 135, "secret");
});

test("MUST-REFUSE CAS lost to revoke", () => {
  expect(e2e({ casCompetitor: 1 }), 102, "revoke wins");
});

test("MUST-REFUSE releaseGuard consumed authority expired validity", () => {
  expect(e2e({ currentValidity: 0 }), 106, "expired validity");
});

test("after-begin OOP crash is Indeterminate DELIVERY_UNKNOWN", () => {
  expect(e2e({ adapterKind: 7, casCrash: 1 }), 106, "oop crash");
});

test("crash after sink is never Refused", () => {
  expect(e2e({ crashAfterSink: 1 }), 106, "crash after sink");
});

test("second sink ack on the same operation refuses", () => {
  expect(e2e({ priorAck: 1 }), 163, "second ack");
});

test("retry after UNKNOWN stays UNKNOWN", () => {
  expect(e2e({ retryPrior: 6 }), 106, "retry");
});

test("cleanup runs on unprotected refusal when minted is absent", () => {
  expect(e2e({ pathClass: 7, cleanupMinted: 0 }), 109, "unminted cleanup");
});

test("harness arity guard RED on a short call", () => {
  const flat = flattenUnit();
  try {
    const src = readFileSync(flat.file, "utf8");
    const r = guardedInvoke(flat.file, "runAuthVerify", [0, 0, 0], src);
    expect(r, 111, "short arity");
  } finally {
    rmSync(flat.dir, { recursive: true, force: true });
  }
});

test("collided recoverLease is byte-identical; other collisions stripped to the e2e callee", () => {
  const route = readFileSync(join(SRC, "auth-verify-route.fungi"), "utf8");
  const kernel = readFileSync(join(SRC, "kernel.fungi"), "utf8");
  function flowBody(src, name) {
    const re = new RegExp("(pure |secure |unsafe )?flow\\s+" + name + "\\s*\\(");
    const m = src.match(re);
    assert.equal(m !== null, true, name);
    const start = m.index;
    const headerEnd = src.indexOf("{", start);
    const header = src.slice(start, headerEnd);
    let end = takeBlockEnd(src, start);
    if (header.includes("contract")) end = takeBlockEnd(src, end);
    return src.slice(start, end);
  }
  assert.equal(flowBody(route, "recoverLease"), flowBody(kernel, "recoverLease"), "recoverLease identical");
  const e2eSrc = readFileSync(UNIT, "utf8");
  assert.equal(e2eSrc.includes("mintOperation("), false, "e2e does not call mintOperation");
  assert.equal(e2eSrc.includes("applyClock("), false, "e2e does not call applyClock");
  assert.equal(e2eSrc.includes("applyConsume("), false, "e2e does not call applyConsume");
  assert.equal(e2eSrc.includes("httpStatusFor("), true, "e2e calls route httpStatusFor");
  const flat = flattenUnit();
  try {
    const text = readFileSync(flat.file, "utf8");
    const finishes = text.split("pure flow finish(").length - 1;
    assert.equal(finishes, 1, "one finish");
    const mints = text.split("pure flow mintOperation(").length - 1;
    assert.equal(mints, 0, "mintOperation stripped");
    const clocks = text.split("pure flow applyClock(").length - 1;
    assert.equal(clocks, 1, "kernel applyClock kept");
    const consumes = text.split("pure flow applyConsume(").length - 1;
    assert.equal(consumes, 0, "applyConsume stripped");
    const https = text.split("pure flow httpStatusFor(").length - 1;
    assert.equal(https, 1, "route httpStatusFor kept");
    assert.equal(text.includes("Client disconnect stays 499"), true, "surviving httpStatusFor is route");
  } finally {
    rmSync(flat.dir, { recursive: true, force: true });
  }
});

test("mutant (a) skip Signet goes red", () => {
  const original = readFileSync(UNIT, "utf8");
  const start = original.indexOf("  let verifiedReq: Int = validateVerifyRequest(");
  const end = original.indexOf("  let clockAdmit: Int = mintFromClock(");
  assert.equal(start > 0, true, "signet start");
  assert.equal(end > start, true, "signet end");
  const shaBefore = createHash("sha256").update(original, "utf8").digest("hex");
  unitSourceOverride = original.slice(0, start) + original.slice(end);
  try {
    const r = e2e({ suiteId: 1 });
    assert.notEqual(r.value, 114, "classical would have refused");
  } finally {
    unitSourceOverride = UNIT_SOURCE_LANDING;
    const shaAfter = createHash("sha256").update(readFileSync(UNIT, "utf8"), "utf8").digest("hex");
    assert.equal(shaAfter, shaBefore, "tracked unit sha256 unchanged");
  }
});

test("mutant (b) AND weakened to OR goes red", () => {
  withMutant(
    "  if pqHalfToken != 1 {\n    return 15\n  }\n  if classicalHalfToken != 1 {\n    return 15\n  }",
    "  if pqHalfToken != 1 {\n    if classicalHalfToken != 1 {\n      return 15\n    }\n  }",
    "and to or",
    () => {
      const r = e2e({ pqHalf: 0, classicalHalf: 1 });
      assert.notEqual(r.value, 115, "OR admits one good half");
    },
  );
});

test("mutant (c) releaseGuard moved before consume goes red", () => {
  withMutant(
    "  let consumed: Int = consumeStep(consumePresent, consumeMatch, gClass, consumeEpochMatch, consumeLease, consumeRevoke, 100)\n  if consumed != 100 {\n    return exitAfterBegin(cleanupStatus, consumed)\n  }\n  let guarded: Int = releaseGuard(independentAuth, preparedCustody, cleanupEvidence, emptyObligation, consumedAuth, currentValidity)",
    "  let guarded: Int = releaseGuard(independentAuth, preparedCustody, cleanupEvidence, emptyObligation, consumedAuth, currentValidity)",
    "guard before consume",
    () => {
      const r = e2e({ consumeRevoke: 1 });
      assert.notEqual(r.value, 102, "consume skipped so revoke does not win");
    },
  );
});

test("mutant (d) cleanup skipped on unprotected refusal goes red", () => {
  withMutant(
    "  if served == 100 {\n    return exitBeforeBegin(cleanupMinted, cleanupEvOp, cleanupCallOp, cleanupEvGen, cleanupCallGen, cleanupEvDigest, cleanupCallDigest, cleanupStatus, cleanupOpClass, 160)\n  }",
    "  if served == 100 {\n    return 160\n  }",
    "skip cleanup",
    () => {
      const r = e2e({ pathClass: 7, cleanupMinted: 0 });
      assert.notEqual(r.value, 109, "skipped cleanup hides unminted");
    },
  );
});

test("mutant (e) OOP after-begin crash mapped to Refused goes red", () => {
  withMutant(
    "    if committedOop != 100 {\n      return exitAfterBegin(cleanupStatus, committedOop)\n    }\n    return exitAfterBegin(cleanupStatus, 106)",
    "    if committedOop != 100 {\n      return exitAfterBegin(cleanupStatus, 102)\n    }\n    return exitAfterBegin(cleanupStatus, 102)",
    "oop refused",
    () => {
      const r = e2e({ adapterKind: 7, casCrash: 1 });
      assert.notEqual(r.value, 106, "mapped to Refused");
    },
  );
});

test("mutant (f) retry allowed after UNKNOWN goes red", () => {
  withMutant(
    "  if retryPrior == 6 {\n    let retried: Int = retryAfterUnknown(retryPrior)\n    return exitAfterBegin(cleanupStatus, retried)\n  }",
    "  if retryPrior == 6 {\n    let retried: Int = 100\n    if retried != 100 {\n      return 11\n    }\n  }",
    "retry allowed",
    () => {
      const r = e2e({ retryPrior: 6 });
      assert.notEqual(r.value, 106, "retry admitted");
    },
  );
});

test("mutant (g) second ack admitted goes red", () => {
  withMutant(
    "  if priorAck == 1 {\n    return exitAfterBegin(cleanupStatus, 163)\n  }",
    "  if priorAck == 1 {\n    let _second: Int = 0\n    if _second != 0 {\n      return 11\n    }\n  }",
    "second ack",
    () => {
      const r = e2e({ priorAck: 1 });
      assert.notEqual(r.value, 163, "second ack admitted");
    },
  );
});

test("mutant (h) monotonic backwards clock admitted goes red", () => {
  withMutant(
    "  if clockAdmit != 0 {\n    return exitBeforeBegin(cleanupMinted, cleanupEvOp, cleanupCallOp, cleanupEvGen, cleanupCallGen, cleanupEvDigest, cleanupCallDigest, cleanupStatus, cleanupOpClass, finish(clockAdmit, true))\n  }",
    "  if clockAdmit != 0 {\n    if clockAdmit == 11 {\n      return exitBeforeBegin(cleanupMinted, cleanupEvOp, cleanupCallOp, cleanupEvGen, cleanupCallGen, cleanupEvDigest, cleanupCallDigest, cleanupStatus, cleanupOpClass, finish(clockAdmit, true))\n    }\n  }",
    "backwards admitted",
    () => {
      const r = e2e({ hasLast: 1, lastTicks: 2000, clockReading: 1000 });
      assert.notEqual(r.value, 122, "backwards admitted");
    },
  );
});

test("mutant (i) harness arity guard removed goes red", () => {
  arityGuardEnabled = false;
  try {
    const flat = flattenUnit();
    try {
      const src = readFileSync(flat.file, "utf8");
      const r = guardedInvoke(flat.file, "runAuthVerify", [0, 0, 0], src);
      assert.notEqual(r.value, 111, "guard gone");
    } finally {
      rmSync(flat.dir, { recursive: true, force: true });
    }
  } finally {
    arityGuardEnabled = true;
  }
});

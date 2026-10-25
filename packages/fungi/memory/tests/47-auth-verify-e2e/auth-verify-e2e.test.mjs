import { spawnSync } from "node:child_process";
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { basename, dirname, join } from "node:path";
import { readFileSync, writeFileSync, mkdtempSync, rmSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { REGISTERED, DIVERGENT, flowsOf, sha as bodySha, FlattenRefusal, divergentStrips as deriveDivergentStrips, assertFlatBinding } from "../s2-harness/clash-table.mjs";

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

// Units the flattened e2e program composes (its whole import closure, root excluded).
const COMPOSED = Object.freeze(["c-boundary.fungi", "release-commit-point.fungi", "body-reader.fungi", "serve-gate.fungi",
  "cleanup-evidence.fungi", "kernel-ports.fungi", "secret-gate.fungi", "secret-arena-custodian-port.fungi",
  "secret-arena.fungi", "adapter-profile.fungi", "monotonic-time.fungi", "signet-grant-seal.fungi",
  "auth-verify-route.fungi", "kernel.fungi"]);
// Same-code duplicates (REGISTERED) the flattener drops from route and kernel; divergent ones come from DIVERGENT.
const REGISTERED_STRIPS = Object.freeze(["applyConsume", "recoverLease"]);

function flattenUnit(tables = { divergent: DIVERGENT }) {
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
  const rest = {
    "auth-verify-route.fungi": stripImports(route, [CB_IMPORT, BODY_IMPORT, RCP_IMPORT, SECRET_IMPORT], "route"),
    "kernel.fungi": stripImports(kernel, [CB_IMPORT, BODY_IMPORT, RCP_IMPORT, SECRET_IMPORT, PORTS_IMPORT], "kernel"),
  };
  for (const n of REGISTERED_STRIPS) {
    if (REGISTERED.has(n) !== true) {
      throw new FlattenRefusal("UNDECLARED_CLASH", "same-code strip '" + n + "' is not in REGISTERED");
    }
    for (const u of Object.keys(rest)) {
      rest[u] = stripNamedFlow(rest[u], n);
    }
  }
  const divergentStrips = deriveDivergentStrips(COMPOSED, tables.divergent);
  for (const { unit, name } of divergentStrips) {
    if (Object.hasOwn(rest, unit) !== true) {
      throw new FlattenRefusal("UNSTRIPPABLE", "divergent '" + name + "' must be stripped from " + unit + ", which the flattener cannot strip");
    }
    rest[unit] = stripNamedFlow(rest[unit], name);
  }
  const routeRest = rest["auth-verify-route.fungi"];
  const kernelRest = rest["kernel.fungi"];
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
  const text = parts.join("\n");
  assertFlatBinding(text, unit, COMPOSED, tables.divergent);
  const dir = mkdtempSync(join(tmpdir(), "q47-flat-"));
  const file = join(dir, basename(dir) + ".fungi");
  writeFileSync(file, text);
  return { dir, file, stem: basename(dir), divergentStrips };
}

function removeBuildStem(stem) {
  const buildDir = join(REPO, "build");
  let names = [];
  try {
    names = readdirSync(buildDir);
  } catch {
    return;
  }
  let i = 0;
  while (i < names.length) {
    const n = names[i];
    if (n === stem || n.startsWith(stem + ".")) {
      rmSync(join(buildDir, n), { recursive: true, force: true });
    }
    i = i + 1;
  }
}

function cleanupFlat(flat) {
  rmSync(flat.dir, { recursive: true, force: true });
  removeBuildStem(flat.stem);
}

const LISTED = Object.freeze([
  100, 101, 102, 103, 104, 105, 106, 109, 110, 111, 114, 115, 117, 118,
  122, 126, 127, 133, 134, 135, 139, 144, 147, 159, 160, 163, 172, 173, 174,
]);

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
    cleanupFlat(flat);
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

test("H1 unique flatten basename and build stem cleaned", () => {
  const a = flattenUnit();
  const b = flattenUnit();
  try {
    assert.notEqual(a.stem, b.stem, "unique stems");
    assert.equal(a.stem.startsWith("q47-flat-"), true, "prefix a");
    assert.equal(b.stem.startsWith("q47-flat-"), true, "prefix b");
  } finally {
    cleanupFlat(a);
    cleanupFlat(b);
  }
});

test("harness arity matches landed runAuthVerify", () => {
  const src = readFileSync(UNIT, "utf8");
  assert.equal(declaredArity(src, "runAuthVerify"), PARAMS.length, "arity");
  assert.equal(args({}).length, PARAMS.length, "defaults");
});

test("happy path spent post-dispatch is Indeterminate 106", () => {
  expect(e2e(), 106, "spent happy");
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

test("F1 post-dispatch Indeterminate never Success", () => {
  const r111 = e2e({ postDispatchPacked: 111 });
  assert.notEqual(r111.value, 100, "postDispatchPacked 111 never success");
  expect(r111, 106, "postDispatchPacked 111");
  const r999 = e2e({ postConsumePacked: 999 });
  assert.notEqual(r999.value, 100, "postConsumePacked 999 never success");
  expect(r999, 106, "postConsumePacked 999");
  const rz = e2e({ postZombie: 1 });
  assert.notEqual(rz.value, 100, "postZombie 1 never success");
  expect(rz, 106, "postZombie 1");
  const rm = e2e({ postMax: 0 });
  assert.notEqual(rm.value, 100, "postMax 0 never success");
  expect(rm, 106, "postMax 0");
});

test("postSpent 0 on the default vector is Indeterminate 106", () => {
  const r = e2e({ postSpent: 0 });
  assert.notEqual(r.value, 100, "postSpent 0 never success");
  expect(r, 106, "postSpent 0 default");
});

test("every postSpent other than 1 matches postSpent 1 and never 100", () => {
  const baseline = e2e({ postSpent: 1 });
  expect(baseline, 106, "postSpent 1 default");
  const values = [0, 2, -1, 7, 2147483647];
  let i = 0;
  while (i < values.length) {
    const v = values[i];
    const r = e2e({ postSpent: v });
    assert.notEqual(r.value, 100, "postSpent " + String(v) + " never 100");
    assert.equal(r.value, baseline.value, "postSpent " + String(v) + " same as 1");
    i = i + 1;
  }
});

test("postSpent 0 + postConsumePacked 0 is 106 never 100", () => {
  const r = e2e({ postSpent: 0, postConsumePacked: 0 });
  assert.notEqual(r.value, 100, "bypass vector never success");
  expect(r, 106, "bypass vector");
});

test("post-dispatch grid never returns 100 and stays listed", () => {
  const spent = [0, 1, 2];
  const consume = [0, 100, 106, 999];
  const dispatch = [100, 106, 111, 147];
  const audit = [100, 44];
  let si = 0;
  while (si < spent.length) {
    let ci = 0;
    while (ci < consume.length) {
      let di = 0;
      while (di < dispatch.length) {
        let ai = 0;
        while (ai < audit.length) {
          const over = {
            postSpent: spent[si],
            postConsumePacked: consume[ci],
            postDispatchPacked: dispatch[di],
            postAuditPacked: audit[ai],
          };
          const r = e2e(over);
          const label = "grid s=" + String(spent[si])
            + " c=" + String(consume[ci])
            + " d=" + String(dispatch[di])
            + " a=" + String(audit[ai]);
          assert.equal(r.present, true, label + " present");
          assert.notEqual(r.value, 100, label + " never 100 got " + String(r.value));
          assert.equal(LISTED.includes(r.value), true, label + " unlisted " + String(r.value));
          ai = ai + 1;
        }
        di = di + 1;
      }
      ci = ci + 1;
    }
    si = si + 1;
  }
});

test("F2 unlisted host flag values refuse 111", () => {
  expect(e2e({ priorAck: 2 }), 111, "priorAck 2");
  expect(e2e({ crashAfterSink: 2 }), 111, "crashAfterSink 2");
  expect(e2e({ retryPrior: 1 }), 111, "retryPrior 1");
  expect(e2e({ retryPrior: 7 }), 111, "retryPrior 7");
});

test("F3 raw adapter codes map into packed table", () => {
  expect(e2e({ adapterKind: 99 }), 173, "unknown kind packed");
  expect(e2e({ adapterKind: 1 }), 172, "SAB packed");
});

test("F3 observed outcomes are a subset of the listed table", () => {
  const probes = [
    {},
    { pathClass: 7 },
    { nChunks: 1, id1: 1, off1: 0, len1: 16385, cap: 16384, streamPresent: 1 },
    { nChunksClass: 1 },
    { suiteId: 1 },
    { pqHalf: 0, classicalHalf: 1 },
    { expired: 1 },
    { tamper: 1 },
    { grantEpoch: 1, currentEpoch: 2 },
    { hasLast: 1, lastTicks: 2000, clockReading: 1000 },
    { hasLast: 2 },
    { clockReading: 6000, lastTicks: 6000, deadlineTicks: 6000 },
    { rateCount: 10, rateLimit: 10 },
    { concCurrent: 4, concMax: 4 },
    { idempClaim: 2 },
    { secretRequired: 1, secretProvider: 0, secretPresence: 1 },
    { casCompetitor: 1 },
    { currentValidity: 0 },
    { adapterKind: 7, casCrash: 1 },
    { crashAfterSink: 1 },
    { priorAck: 1 },
    { retryPrior: 6 },
    { pathClass: 7, cleanupMinted: 0 },
    { priorAck: 2 },
    { crashAfterSink: 2 },
    { retryPrior: 1 },
    { adapterKind: 99 },
    { ackMatch: 0 },
    { gClass: 1 },
    { budgetBody: 99999 },
    { postAuditPacked: 44 },
    { postDispatchPacked: 111 },
  ];
  let i = 0;
  while (i < probes.length) {
    const r = e2e(probes[i]);
    assert.equal(r.present, true, "probe " + String(i) + " present");
    assert.equal(LISTED.includes(r.value), true, "probe " + String(i) + " unlisted " + String(r.value));
    i = i + 1;
  }
});

test("harness arity guard RED on a short call", () => {
  const flat = flattenUnit();
  try {
    const src = readFileSync(flat.file, "utf8");
    const r = guardedInvoke(flat.file, "runAuthVerify", [0, 0, 0], src);
    expect(r, 111, "short arity");
  } finally {
    cleanupFlat(flat);
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
    cleanupFlat(flat);
  }
});

// S21 OPEN-S2-1 (2026-10-25): the flattener's divergent strips come from the shared DIVERGENT table, and the
// surviving copy is pinned to the reviewed sha of the bound unit. Zero-trust: an undeclared clash refuses.
test("S21-R1 flattener strip set equals the DIVERGENT-derived set", () => {
  const expected = [];
  for (const [name, d] of DIVERGENT) {
    for (const u of d.units) {
      if (u !== d.bound) expected.push(u + ":" + name);
    }
  }
  const flat = flattenUnit();
  try {
    const got = (flat.divergentStrips ?? []).map((x) => x.unit + ":" + x.name);
    assert.deepEqual(got.sort(), expected.sort());
  } finally {
    cleanupFlat(flat);
  }
});

test("S21-R2 surviving divergent copies are the bound units' pinned bodies", () => {
  const flat = flattenUnit();
  try {
    const flows = flowsOf(readFileSync(flat.file, "utf8"));
    const clock = flows.get("applyClock") ?? [];
    assert.equal(clock.length, 1, "one applyClock");
    assert.equal(bodySha(clock[0]), DIVERGENT.get("applyClock").sha["kernel.fungi"], "applyClock is the kernel copy");
    const http = flows.get("httpStatusFor") ?? [];
    assert.equal(http.length, 1, "one httpStatusFor");
    assert.equal(bodySha(http[0]), DIVERGENT.get("httpStatusFor").sha["auth-verify-route.fungi"], "httpStatusFor is the route copy");
    assert.equal((flows.get("mintOperation") ?? []).length, 0, "mintOperation bound to none");
  } finally {
    cleanupFlat(flat);
  }
});

test("S21-R3 flipping applyClock's binding in a synthetic table keeps the route copy (derived, not hardcoded)", () => {
  const flipped = new Map(DIVERGENT);
  flipped.set("applyClock", { ...DIVERGENT.get("applyClock"), bound: "auth-verify-route.fungi" });
  const flat = flattenUnit({ divergent: flipped });
  try {
    const clock = flowsOf(readFileSync(flat.file, "utf8")).get("applyClock") ?? [];
    assert.equal(clock.length, 1, "one applyClock");
    assert.equal(bodySha(clock[0]), DIVERGENT.get("applyClock").sha["auth-verify-route.fungi"], "flipped binding keeps route applyClock");
    assert.notEqual(bodySha(clock[0]), DIVERGENT.get("applyClock").sha["kernel.fungi"]);
  } finally {
    cleanupFlat(flat);
  }
});

test("S21-R4 an undeclared clash in the flatten input refuses with a typed FlattenRefusal", () => {
  const dup = "\npure flow s21Dup(a: Int) -> Int\ncontract {\n  intent { \"s21 dup\" }\n}\n{\n  return a\n}\n";
  unitSourceOverride = readFileSync(UNIT, "utf8") + dup + dup;
  try {
    assert.throws(() => {
      const f = flattenUnit();
      cleanupFlat(f);
    }, (e) => e instanceof FlattenRefusal && e.kind === "UNDECLARED_CLASH" && /s21Dup/.test(e.message));
  } finally {
    unitSourceOverride = UNIT_SOURCE_LANDING;
  }
});

test("S21-R5 a bound copy whose body is not the reviewed one refuses (PIN_MISMATCH)", () => {
  const tampered = new Map(DIVERGENT);
  const d = DIVERGENT.get("httpStatusFor");
  tampered.set("httpStatusFor", { ...d, sha: { ...d.sha, "auth-verify-route.fungi": "0".repeat(64) } });
  assert.throws(() => {
    const f = flattenUnit({ divergent: tampered });
    cleanupFlat(f);
  }, (e) => e instanceof FlattenRefusal && e.kind === "PIN_MISMATCH" && /httpStatusFor/.test(e.message));
});

test("S21-R6 a divergent name bound to none that the root calls refuses (UNBOUND_CALL)", () => {
  const unbound = new Map(DIVERGENT);
  unbound.set("httpStatusFor", { ...DIVERGENT.get("httpStatusFor"), bound: "none" });
  assert.throws(() => {
    const f = flattenUnit({ divergent: unbound });
    cleanupFlat(f);
  }, (e) => e instanceof FlattenRefusal && e.kind === "UNBOUND_CALL" && /httpStatusFor/.test(e.message));
});

test("S21-R7 a divergent strip naming a composed unit outside route/kernel refuses (UNSTRIPPABLE)", () => {
  // Synthetic declaration (s21Synthetic is not a real flow): both units are composed, so a strip is derived for
  // secret-gate.fungi, which the flattener cannot strip. Zero-trust: refuse, never skip the strip.
  const outside = new Map(DIVERGENT);
  outside.set("s21Synthetic", { units: ["auth-verify-route.fungi", "secret-gate.fungi"], bound: "auth-verify-route.fungi",
    sha: { "auth-verify-route.fungi": "0".repeat(64), "secret-gate.fungi": "1".repeat(64) }, why: "S21-R7 synthetic" });
  assert.throws(() => {
    const f = flattenUnit({ divergent: outside });
    cleanupFlat(f);
  }, (e) => e instanceof FlattenRefusal && e.kind === "UNSTRIPPABLE" && /s21Synthetic/.test(e.message) && /secret-gate\.fungi/.test(e.message));
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

test("mutant (c) consumeStep omitted goes red", () => {
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
    "  if retryPrior == 6 {\n    return exitAfterBegin(cleanupStatus, 100)\n  }",
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
      cleanupFlat(flat);
    }
  } finally {
    arityGuardEnabled = true;
  }
});

test("mutant G7 re-admit post-dispatch 106 as continue goes red", () => {
  withMutant(
    "  if postPacked != 100 {\n    return exitAfterBegin(cleanupStatus, postPacked)\n  }",
    "  if postPacked != 100 {\n    if postPacked != 106 {\n      return exitAfterBegin(cleanupStatus, postPacked)\n    }\n  }",
    "g7 admit 106",
    () => {
      const r = e2e({ postDispatchPacked: 111 });
      assert.notEqual(r.value, 106, "106 admitted as Success");
      assert.equal(r.value, 100, "G7 restores Success");
    },
  );
});

test("mutant F2 crashAfterSink unlisted gate removed goes red", () => {
  withMutant(
    "  if crashAfterSink != 0 {\n    if crashAfterSink != 1 {\n      return exitAfterBegin(cleanupStatus, 111)\n    }\n  }\n  if crashAfterSink == 1 {",
    "  if crashAfterSink == 1 {",
    "f2 crash gate",
    () => {
      const r = e2e({ crashAfterSink: 2 });
      assert.notEqual(r.value, 111, "unlisted crashAfterSink admitted");
    },
  );
});

test("mutant F2 priorAck unlisted gate removed goes red", () => {
  withMutant(
    "  if priorAck != 0 {\n    if priorAck != 1 {\n      return exitAfterBegin(cleanupStatus, 111)\n    }\n  }\n  if priorAck == 1 {",
    "  if priorAck == 1 {",
    "f2 priorAck gate",
    () => {
      const r = e2e({ priorAck: 2 });
      assert.notEqual(r.value, 111, "unlisted priorAck admitted");
    },
  );
});

test("mutant F2 retryPrior unlisted gate removed goes red", () => {
  withMutant(
    "  if retryPrior != 0 {\n    if retryPrior != 6 {\n      return exitAfterBegin(cleanupStatus, 111)\n    }\n  }\n  if retryPrior == 6 {",
    "  if retryPrior == 6 {",
    "f2 retryPrior gate",
    () => {
      const r = e2e({ retryPrior: 1 });
      assert.notEqual(r.value, 111, "unlisted retryPrior admitted");
    },
  );
});

test("mutant G8 re-open host postSpent pass-through goes red", () => {
  withMutant(
    ", gClass, 1, gClass, postDispatchPacked, gClass, postConsumePacked,",
    ", gClass, postSpent, gClass, postDispatchPacked, gClass, postConsumePacked,",
    "g8 restore host postSpent",
    () => {
      const r = e2e({ postSpent: 0, postConsumePacked: 0 });
      assert.notEqual(r.value, 106, "G8 reopens unspent Success");
      assert.equal(r.value, 100, "G8 restores Success");
    },
  );
});

// S7 round c (S7-R3): arena listing states reach the route exit as UNKNOWN 106, never as a raw listing token.
// Zero-trust: Partial (3), Quarantined (1) and Disposed (2) all exit 106 (quarantine); unlisted stays 111.
test("S7-R3a e2e: Partial arena (state token 3) exits UNKNOWN 106, not raw listing 103", () => {
  expect(e2e({ arenaState: 3 }), 106, "partial arena");
});

test("S7-R3b e2e: Quarantined arena (state token 1) exits UNKNOWN 106, not raw listing 101", () => {
  expect(e2e({ arenaState: 1 }), 106, "quarantined arena");
});

test("S7-R3c e2e: Disposed arena (state token 2) exits UNKNOWN 106, not raw listing 102", () => {
  expect(e2e({ arenaState: 2 }), 106, "disposed arena");
});

test("S7-R3d e2e control: unlisted arena state token 7 stays Unlisted 111", () => {
  expect(e2e({ arenaState: 7 }), 111, "unlisted arena");
});
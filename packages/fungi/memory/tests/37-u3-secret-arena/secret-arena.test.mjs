import { spawnSync } from "node:child_process";
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";

import { uniqueFungiFile } from "../_harness/unique-build-name.mjs";
const HERE = dirname(fileURLToPath(import.meta.url));
const MEM = join(HERE, "..", "..");
const REPO = join(MEM, "..", "..", "..");
const BOUNDARY = join(MEM, "src", "c-boundary.fungi");
const RCP = join(MEM, "src", "release-commit-point.fungi");
const PORT = join(MEM, "src", "secret-arena-custodian-port.fungi");
const UNIT = join(MEM, "src", "secret-arena.fungi");
const GALERINA = join(REPO, "galerina.mjs");
const CB_IMPORT = "\nimport \"./c-boundary.fungi\"\n";
const RCP_IMPORT = "\nimport \"./release-commit-point.fungi\"\n";
const PORT_IMPORT = "\nimport \"./secret-arena-custodian-port.fungi\"\n";
const UNIT_SOURCE_LANDING = Object.freeze({ kind: "LANDING" });
let unitSourceOverride = UNIT_SOURCE_LANDING;
let portSourceOverride = UNIT_SOURCE_LANDING;

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

function stripPortImports(src) {
  let s = src;
  s = splitOnce(s, CB_IMPORT, "port c-boundary");
  return stripVersion(s);
}

function flattenUnit() {
  const boundary = readFileSync(BOUNDARY, "utf8");
  const rcp = readFileSync(RCP, "utf8");
  const port = portSourceOverride === UNIT_SOURCE_LANDING ? readFileSync(PORT, "utf8") : portSourceOverride;
  const unit = unitSourceOverride === UNIT_SOURCE_LANDING ? readFileSync(UNIT, "utf8") : unitSourceOverride;
  assert.equal(unit.includes(CB_IMPORT), true, "landed source must import c-boundary");
  assert.equal(unit.includes(RCP_IMPORT), true, "landed source must import release-commit-point");
  assert.equal(unit.includes(PORT_IMPORT), true, "landed source must import custodian port");
  let rest = unit;
  rest = splitOnce(rest, CB_IMPORT, "c-boundary");
  rest = splitOnce(rest, RCP_IMPORT, "release-commit-point");
  rest = splitOnce(rest, PORT_IMPORT, "custodian-port");
  rest = stripVersion(rest);
  const dir = mkdtempSync(join(tmpdir(), "q37-flat-"));
  const file = uniqueFungiFile(dir);
  writeFileSync(file, boundary + "\n" + stripVersion(rcp) + "\n" + stripPortImports(port) + "\n" + rest);
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

function expectPacked(r, expected, label) {
  assert.equal(r.status, 0, label + " status " + r.reason + " " + r.text);
  assert.equal(r.present, true, label + " " + r.reason + " " + r.text);
  assert.equal(r.value, expected, label + " " + r.text);
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

function withPortMutant(needle, next, label, fn) {
  const original = readFileSync(PORT, "utf8");
  const shaBefore = createHash("sha256").update(original, "utf8").digest("hex");
  portSourceOverride = replaceOnce(original, needle, next, label);
  try {
    return fn();
  } finally {
    portSourceOverride = UNIT_SOURCE_LANDING;
    const shaAfter = createHash("sha256").update(readFileSync(PORT, "utf8"), "utf8").digest("hex");
    assert.equal(shaAfter, shaBefore, "tracked port sha256 unchanged");
  }
}

function construct(over) {
  const o = over || {};
  return runFlow("constructArena", [
    o.platformClass ?? 0, o.platformToken ?? 1,
    o.pathClass ?? 0, o.pathPresent ?? 1,
    o.spawnClass ?? 0, o.spawnToken ?? 0,
    o.stdioClass ?? 0, o.stdioToken ?? 1,
    o.helloClass ?? 0, o.helloStatus ?? 0,
    o.helloLenClass ?? 0, o.helloLen ?? 1,
    o.intrinsicClass ?? 0, o.intrinsicPresent ?? 1,
  ]);
}

function has(over) {
  const o = over || {};
  return runFlow("arenaHas", [
    o.stateClass ?? 0, o.stateToken ?? 0,
    o.statusClass ?? 0, o.statusToken ?? 0,
    o.lenClass ?? 0, o.dataLen ?? 1,
    o.byteClass ?? 0, o.dataByte ?? 1,
  ]);
}

function statusOf(over) {
  const o = over || {};
  return runFlow("arenaStatus", [
    o.stateClass ?? 0, o.stateToken ?? 0,
    o.statusClass ?? 0, o.statusToken ?? 0,
    o.lenClass ?? 0, o.dataLen ?? 1,
    o.byteClass ?? 0, o.dataByte ?? 0,
  ]);
}

function epoch(over) {
  const o = over || {};
  return runFlow("arenaEpoch", [
    o.stateClass ?? 0, o.stateToken ?? 0,
    o.statusClass ?? 0, o.statusToken ?? 0,
    o.lenClass ?? 0, o.dataLen ?? 8,
    o.epochClass ?? 0, o.epochValue ?? 1,
    o.lastClass ?? 0, o.lastEpoch ?? 1,
    o.fenceClass ?? 0, o.fenceEpoch ?? 2,
  ]);
}

function use(over) {
  const o = over || {};
  return runFlow("arenaUse", [
    o.stateClass ?? 0, o.stateToken ?? 0,
    o.abortClass ?? 0, o.abortToken ?? 0,
    o.statusClass ?? 0, o.statusToken ?? 0,
    o.lenClass ?? 0, o.dataLen ?? 1,
    o.callbackClass ?? 0, o.callbackToken ?? 1,
    o.wipeClass ?? 0, o.wipeToken ?? 0,
    o.spentClass ?? 0, o.spentViewToken ?? 0,
    o.clockClass ?? 0, o.clock ?? 1000,
    o.presentClass ?? 0, o.clockPresent ?? 1,
    o.armedClass ?? 0, o.armedAt ?? 1000,
    o.budgetClass ?? 0, o.budget ?? 5000,
    o.clockEpochClass ?? 0, o.clockEpoch ?? 1,
    o.armedEpochClass ?? 0, o.armedEpoch ?? 1,
  ]);
}

function put(over) {
  const o = over || {};
  return runFlow("arenaPut", [
    o.stateClass ?? 0, o.stateToken ?? 0,
    o.nameClass ?? 0, o.nameLen ?? 1,
    o.valueClass ?? 0, o.valueLen ?? 1,
    o.maxClass ?? 0, o.maxFrame ?? 64,
    o.highClass ?? 0, o.highBit ?? 0,
    o.statusClass ?? 0, o.statusToken ?? 0,
    o.wipeClass ?? 0, o.wipeToken ?? 0,
  ]);
}

function dispose(over) {
  const o = over || {};
  return runFlow("arenaDispose", [
    o.stateClass ?? 0, o.stateToken ?? 0,
    o.cleanupClass ?? 0, o.cleanupStatus ?? 0,
    o.termClass ?? 0, o.termToken ?? 0,
    o.recordedClass ?? 0, o.recordedPacked ?? 106,
  ]);
}

function presence(over) {
  const o = over || {};
  return runFlow("mapHasToPresence", [
    o.packedClass ?? 0, o.packedCode ?? 100,
  ]);
}

test("c-boundary helper still maps classTag 0 and unlisted 11", () => {
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
  assert.equal(unit.includes("secret-gate.fungi"), false, "do not import secret-gate");
  assert.equal(unit.includes("kernel.fungi"), false, "do not import kernel");
  assert.equal(unit.includes("monotonic-time"), false, "do not import monotonic-time");
});

test("port and unit have no wait loop and no live getter", () => {
  const unit = readFileSync(UNIT, "utf8");
  const port = readFileSync(PORT, "utf8");
  assert.equal(unit.includes("while "), false);
  assert.equal(port.includes("while "), false);
  assert.equal(unit.includes("for "), false);
  assert.equal(port.includes("for "), false);
  assert.equal(unit.includes("prototype"), false);
  assert.equal(port.includes("prototype"), false);
  assert.equal(unit.includes(".buffer"), false);
  assert.equal(unit.includes("defaultCustodian"), false);
});

test("MUST-ADMIT construction on linux with path spawn stdio hello intrinsic", () => {
  expectPacked(construct({}), 100, "construct ok");
});

test("MUST-REFUSE construction platform path spawn stdio hello frame intrinsic", () => {
  expectPacked(construct({ platformToken: 0 }), 112, "platform");
  expectPacked(construct({ pathPresent: 0 }), 113, "path absent");
  expectPacked(construct({ spawnToken: 1 }), 114, "spawn refused");
  expectPacked(construct({ stdioToken: 0 }), 115, "stdio missing");
  expectPacked(construct({ helloStatus: 1 }), 116, "hello not ok");
  expectPacked(construct({ helloStatus: 2 }), 116, "hello quarantined");
  expectPacked(construct({ helloLen: 0 }), 117, "hello empty");
  expectPacked(construct({ helloLen: 2 }), 117, "hello long");
  expectPacked(construct({ intrinsicPresent: 0 }), 118, "missing intrinsic");
});

test("MUST-ADMIT has present and absent", () => {
  expectPacked(has({}), 100, "present");
  expectPacked(has({ dataByte: 0 }), 101, "absent byte 0");
  expectPacked(has({ statusToken: 1 }), 101, "NOT_FOUND");
});

test("MUST-REFUSE has unlisted empty byte-2 extra-bytes never absent", () => {
  expectPacked(has({ statusToken: 9 }), 106, "unlisted 9");
  expectPacked(has({ statusToken: 3 }), 106, "unlisted 3");
  expectPacked(has({ dataLen: 0 }), 106, "empty");
  expectPacked(has({ dataByte: 2 }), 106, "byte 2");
  expectPacked(has({ dataLen: 2 }), 106, "two bytes");
  expectPacked(has({ statusToken: 2 }), 106, "frame quarantined");
  assert.notEqual(has({ statusToken: 9 }).value, 101, "unlisted never absent");
  assert.notEqual(has({ dataLen: 0 }).value, 101, "empty never absent");
});

test("MUST-REFUSE has from quarantined state never absent", () => {
  expectPacked(has({ stateToken: 1 }), 106, "state quarantined");
  assert.notEqual(has({ stateToken: 1 }).value, 101, "quarantined never absent");
  expectPacked(has({ stateToken: 2 }), 141, "disposed");
});

test("MUST-ADMIT status Active on OK one zero byte", () => {
  expectPacked(statusOf({}), 100, "active");
});

test("MUST-REFUSE status empty over-long quarantined-bit never Active", () => {
  expectPacked(statusOf({ dataLen: 0 }), 121, "empty");
  expectPacked(statusOf({ dataLen: 2 }), 121, "over-long");
  expectPacked(statusOf({ dataByte: 1 }), 121, "quarantined bit");
  expectPacked(statusOf({ dataByte: 2 }), 121, "byte 2");
  expectPacked(statusOf({ statusToken: 1 }), 121, "not ok");
  expectPacked(statusOf({ stateToken: 1 }), 121, "state quarantined");
  expectPacked(statusOf({ stateToken: 2 }), 141, "disposed");
  assert.notEqual(statusOf({ dataLen: 0 }).value, 100, "empty never Active");
  assert.notEqual(statusOf({ dataLen: 2 }).value, 100, "over-long never Active");
});

test("MUST-ADMIT epoch current exactly 8 bytes non-decreasing", () => {
  expectPacked(epoch({}), 100, "current");
  expectPacked(epoch({ epochValue: 1, lastEpoch: 1 }), 100, "equal last");
  expectPacked(epoch({ epochValue: 4, lastEpoch: 1 }), 100, "forward");
});

test("MUST-REFUSE epoch short long not-ok stale overflow disposed", () => {
  expectPacked(epoch({ dataLen: 7 }), 140, "7 bytes");
  expectPacked(epoch({ dataLen: 9 }), 140, "9 bytes");
  expectPacked(epoch({ statusToken: 1 }), 140, "not ok");
  expectPacked(epoch({ epochValue: 0, lastEpoch: 1 }), 139, "STALE");
  expectPacked(epoch({ epochValue: -1 }), 140, "negative");
  expectPacked(epoch({ stateToken: 2 }), 141, "disposed");
});

test("MUST-REFUSE quarantined epoch fence strictly past last else UNKNOWN", () => {
  expectPacked(epoch({ stateToken: 1, lastEpoch: 3, fenceEpoch: 4 }), 121, "fence past");
  expectPacked(epoch({ stateToken: 1, lastEpoch: 3, fenceEpoch: 3 }), 106, "fence not past");
  expectPacked(epoch({ statusToken: 2, lastEpoch: 3, fenceEpoch: 4 }), 121, "frame quarantined fence past");
});

test("MUST-REFUSE quarantined epoch lastEpoch at i32 max is 140 never a trap", () => {
  expectPacked(epoch({ stateToken: 1, lastEpoch: 2147483647, fenceEpoch: 0 }), 140, "state quarantined last max");
  expectPacked(epoch({ stateToken: 1, lastEpoch: 2147483647, fenceEpoch: 2147483647 }), 140, "state quarantined both max");
  expectPacked(epoch({ statusToken: 2, lastEpoch: 2147483647, fenceEpoch: 0 }), 140, "frame quarantined last max");
  expectPacked(epoch({ lastEpoch: 2147483648, fenceEpoch: 0 }), 140, "wide lastEpoch");
  expectPacked(epoch({ fenceEpoch: 2147483648 }), 140, "wide fenceEpoch");
});

test("MUST-ADMIT use wiped-ok once-void", () => {
  expectPacked(use({}), 100, "wiped ok");
  expectPacked(use({ spentViewToken: 1 }), 100, "spent view still wiped-ok");
});

test("MUST-REFUSE use abort not-found callback wipe deadline disposed", () => {
  expectPacked(use({ abortToken: 1 }), 116, "abort");
  expectPacked(use({ statusToken: 1 }), 102, "not found");
  expectPacked(use({ callbackToken: 0 }), 113, "not-called");
  expectPacked(use({ callbackToken: 3 }), 113, "returns-value");
  expectPacked(use({ callbackToken: 2 }), 114, "twice");
  expectPacked(use({ callbackToken: 4 }), 115, "thenable");
  expectPacked(use({ wipeToken: 1 }), 117, "wipe failed");
  expectPacked(use({ wipeToken: 2 }), 106, "wipe unknown");
  expectPacked(use({ clock: 6000 }), 147, "deadline");
  expectPacked(use({ clockPresent: 0 }), 121, "clock missing");
  expectPacked(use({ clock: 500 }), 122, "backwards");
  expectPacked(use({ clockEpoch: 2 }), 123, "clock epoch");
  expectPacked(use({ clock: 2147483647, armedAt: 2147483647, budget: 1 }), 151, "overflow");
  expectPacked(use({ statusToken: 2 }), 106, "custodian quarantined mid-call");
  expectPacked(use({ statusToken: 9 }), 106, "unlisted frame");
  expectPacked(use({ stateToken: 1 }), 106, "state quarantined");
  expectPacked(use({ stateToken: 2 }), 141, "disposed");
  expectPacked(use({ spentViewToken: 3 }), 111, "unlisted spent");
});

test("MUST-REFUSE use wipe-failed wins over deadline", () => {
  expectPacked(use({ wipeToken: 1, clock: 6000 }), 117, "wipe over deadline");
  expectPacked(use({ wipeToken: 2, clock: 6000 }), 106, "unknown wipe over deadline");
});

test("MUST-REFUSE wipe-failed and unknown win over later boundary refusals", () => {
  expectPacked(use({ wipeToken: 1, lenClass: 3 }), 117, "use wipe over len NaN");
  expectPacked(use({ wipeToken: 1, spentClass: 3 }), 117, "use wipe over spent NaN");
  expectPacked(use({ wipeToken: 1, abortClass: 3 }), 117, "use wipe over abort NaN");
  expectPacked(use({ wipeToken: 2, lenClass: 3 }), 106, "use unknown wipe over len NaN");
  expectPacked(put({ wipeToken: 1, nameClass: 3 }), 117, "put wipe over name NaN");
  expectPacked(put({ wipeToken: 1, valueClass: 3 }), 117, "put wipe over value NaN");
  expectPacked(put({ wipeToken: 1, maxClass: 3 }), 117, "put wipe over max NaN");
  expectPacked(put({ wipeToken: 2, nameClass: 11 }), 106, "put unknown wipe over name unlisted");
});

test("MUST-ADMIT put within cap", () => {
  expectPacked(put({}), 100, "put ok");
});

test("MUST-REFUSE put over-cap zero-len high-bit wipe quarantined", () => {
  expectPacked(put({ nameLen: 65, maxFrame: 64 }), 123, "name over");
  expectPacked(put({ valueLen: 64, nameLen: 1, maxFrame: 64 }), 123, "combined over");
  expectPacked(put({ nameLen: 0, valueLen: 0 }), 124, "zero");
  expectPacked(put({ highBit: 1 }), 125, "high bit");
  expectPacked(put({ wipeToken: 1 }), 117, "wipe failed");
  expectPacked(put({ stateToken: 1 }), 106, "quarantined");
  expectPacked(put({ stateToken: 2 }), 141, "disposed");
  expectPacked(put({ statusToken: 2 }), 106, "frame quarantined");
});

test("MUST-REFUSE dispose never Verified; Failed; Unknown; second recorded", () => {
  expectPacked(dispose({}), 106, "ok cleanup still Unknown");
  expectPacked(dispose({ cleanupStatus: 1 }), 144, "non-ok cleanup Failed");
  expectPacked(dispose({ cleanupStatus: 2 }), 144, "quarantined cleanup Failed");
  expectPacked(dispose({ termToken: 2 }), 106, "still-running Unknown");
  expectPacked(dispose({ termToken: 1 }), 106, "signaled Unknown");
  expectPacked(dispose({ stateToken: 2, recordedPacked: 144 }), 144, "second Failed");
  expectPacked(dispose({ stateToken: 2, recordedPacked: 106 }), 106, "second Unknown");
  expectPacked(dispose({ stateToken: 2, recordedPacked: 100 }), 106, "second never 100");
  expectPacked(dispose({ stateToken: 2, recordedPacked: 0 }), 111, "second raw 0 refuses");
  expectPacked(dispose({ stateToken: 2, recordedPacked: 101 }), 111, "second has-absent refuses");
  assert.notEqual(dispose({}).value, 100, "first dispose never 100");
});

test("MUST-REFUSE foreign and unlisted classTags", () => {
  expectPacked(construct({ platformClass: 3 }), 110, "construct NaN");
  expectPacked(construct({ platformClass: 11 }), 111, "construct unlisted");
  expectPacked(has({ stateClass: 3 }), 110, "has NaN");
  expectPacked(has({ stateToken: 9 }), 111, "has unlisted state");
  expectPacked(statusOf({ stateClass: 11 }), 111, "status unlisted class");
  expectPacked(epoch({ epochClass: 3 }), 110, "epoch NaN");
  expectPacked(use({ wipeClass: 3 }), 106, "use wipe NaN is UNKNOWN");
  expectPacked(put({ nameClass: 11 }), 111, "put unlisted");
  expectPacked(dispose({ stateClass: 3 }), 110, "dispose NaN");
});

test("mapHasToPresence closed table never maps quarantine to absent", () => {
  expectPacked(presence({ packedCode: 100 }), 0, "present");
  expectPacked(presence({ packedCode: 101 }), 1, "absent");
  expectPacked(presence({ packedCode: 106 }), 2, "unknown faulted");
  expectPacked(presence({ packedCode: 117 }), 2, "wipe-failed faulted");
  expectPacked(presence({ packedCode: 121 }), 2, "quarantined faulted");
  expectPacked(presence({ packedCode: 141 }), 2, "disposed faulted");
  expectPacked(presence({ packedCode: 102 }), 11, "unlisted packed");
  expectPacked(presence({ packedCode: 111 }), 11, "unlisted 111");
  expectPacked(presence({ packedClass: 3 }), 10, "foreign");
});

test("port decode closed sums refuse unlisted", () => {
  expectPacked(runFlow("decodeSpawn", [0, 0]), 0, "spawn ok");
  expectPacked(runFlow("decodeSpawn", [0, 1]), 1, "spawn refused");
  expectPacked(runFlow("decodeSpawn", [0, 2]), 11, "spawn unlisted");
  expectPacked(runFlow("decodeFrameStatus", [0, 0]), 0, "OK");
  expectPacked(runFlow("decodeFrameStatus", [0, 1]), 1, "NOT_FOUND");
  expectPacked(runFlow("decodeFrameStatus", [0, 2]), 2, "QUARANTINED");
  expectPacked(runFlow("decodeFrameStatus", [0, 3]), 11, "unlisted status");
  expectPacked(runFlow("decodeTerminate", [0, 0]), 0, "exited");
  expectPacked(runFlow("decodeTerminate", [0, 2]), 2, "still-running");
  expectPacked(runFlow("decodeTerminate", [0, 4]), 11, "unlisted term");
  expectPacked(runFlow("decodePresence", [0, 0]), 0, "missing");
  expectPacked(runFlow("decodePresence", [0, 1]), 1, "present");
  expectPacked(runFlow("decodePresence", [0, 2]), 11, "unlisted presence");
});

test("mutant unlisted has status mapped to absent goes RED", () => {
  expectPacked(has({ statusToken: 9 }), 106, "landed unlisted 106");
  withMutant(
    "if frameDecoded == 11 {\n    return finish(6, true)\n  }",
    "if frameDecoded == 11 {\n    return finish(1, true)\n  }",
    "unlisted-has-absent",
    () => {
      expectPacked(has({ statusToken: 9 }), 101, "mutant absent");
    },
  );
  expectPacked(has({ statusToken: 9 }), 106, "restored");
});

test("mutant empty status Active goes RED", () => {
  expectPacked(statusOf({ dataLen: 0 }), 121, "landed empty 121");
  withMutant(
    "if dataLen != 1 {\n    return finish(21, true)\n  }",
    "if dataLen != 1 {\n    return finish(0, true)\n  }",
    "empty-status-active",
    () => {
      expectPacked(statusOf({ dataLen: 0 }), 100, "mutant Active");
    },
  );
  expectPacked(statusOf({ dataLen: 0 }), 121, "restored");
});

test("mutant 7-byte epoch accepted goes RED", () => {
  expectPacked(epoch({ dataLen: 7 }), 140, "landed 140");
  withMutant(
    "if dataLen != 8 {\n    return finish(40, true)\n  }",
    "if dataLen != 8 {\n    return finish(0, true)\n  }",
    "seven-byte-epoch",
    () => {
      expectPacked(epoch({ dataLen: 7 }), 100, "mutant admits");
    },
  );
  expectPacked(epoch({ dataLen: 7 }), 140, "restored");
});

test("mutant drop STALE_EPOCH goes RED", () => {
  expectPacked(epoch({ epochValue: 0, lastEpoch: 1 }), 139, "landed stale");
  withMutant(
    "if epochValue < lastEpoch {\n    return finish(39, true)\n  }",
    "if epochValue < lastEpoch {\n    return finish(0, true)\n  }",
    "drop-stale",
    () => {
      expectPacked(epoch({ epochValue: 0, lastEpoch: 1 }), 100, "mutant admits");
    },
  );
  expectPacked(epoch({ epochValue: 0, lastEpoch: 1 }), 139, "restored");
});

test("mutant quarantine returns Active goes RED", () => {
  expectPacked(has({ stateToken: 1 }), 106, "landed quarantined");
  withMutant(
    "if statePacked == 101 {\n    return finish(6, true)\n  }",
    "if statePacked == 101 {\n    return finish(0, true)\n  }",
    "quarantine-active",
    () => {
      expectPacked(has({ stateToken: 1 }), 100, "mutant Active");
    },
  );
  expectPacked(has({ stateToken: 1 }), 106, "restored");
});

test("mutant skip wipe failed goes RED", () => {
  expectPacked(use({ wipeToken: 1 }), 117, "landed wipe failed");
  withMutant(
    "if wipeToken == 1 {\n    return finish(17, true)",
    "if wipeToken == 1 {\n    return finish(0, true)",
    "skip-wipe-failed",
    () => {
      expectPacked(use({ wipeToken: 1 }), 100, "mutant success");
    },
  );
  expectPacked(use({ wipeToken: 1 }), 117, "restored");
});

test("mutant skip unknown wipe read-back goes RED", () => {
  expectPacked(use({ wipeToken: 2 }), 106, "landed unknown wipe");
  withMutant(
    "if wipeToken == 2 {\n    return finish(6, true)",
    "if wipeToken == 2 {\n    return finish(0, true)",
    "skip-read-back",
    () => {
      expectPacked(use({ wipeToken: 2 }), 100, "mutant success");
    },
  );
  expectPacked(use({ wipeToken: 2 }), 106, "restored");
});

test("mutant ignore cleanup reply never 100 goes RED", () => {
  expectPacked(dispose({ cleanupStatus: 1 }), 144, "landed Failed");
  expectPacked(dispose({}), 106, "landed Unknown");
  withMutant(
    "if cleanupDecoded != 0 {\n    return finish(44, true)\n  }\n  return finish(6, true)",
    "if cleanupDecoded != 0 {\n    return finish(44, true)\n  }\n  return finish(0, true)",
    "dispose-verified",
    () => {
      expectPacked(dispose({}), 100, "mutant Verified");
    },
  );
  expectPacked(dispose({}), 106, "restored");
});

test("mutant skip lastEpoch overflow gate goes RED", () => {
  expectPacked(epoch({ stateToken: 1, lastEpoch: 2147483647, fenceEpoch: 0 }), 140, "landed overflow");
  withMutant(
    "if statePacked == 101 {\n    if lastEpoch > 2147483647 - 1 {\n      return finish(40, true)\n    }",
    "if statePacked == 101 {\n    if lastEpoch > 2147483647 - 1 {\n      return finish(0, true)\n    }",
    "epoch-overflow-gate",
    () => {
      expectPacked(epoch({ stateToken: 1, lastEpoch: 2147483647, fenceEpoch: 0 }), 100, "mutant admits");
    },
  );
  expectPacked(epoch({ stateToken: 1, lastEpoch: 2147483647, fenceEpoch: 0 }), 140, "restored");
});

test("mutant second dispose passthrough unlisted recorded goes RED", () => {
  expectPacked(dispose({ stateToken: 2, recordedPacked: 0 }), 111, "landed refuse 0");
  withMutant(
    "    if recordedPacked == 106 {\n      return finish(6, true)\n    }\n    return finish(11, true)",
    "    if recordedPacked == 106 {\n      return finish(6, true)\n    }\n    return recordedPacked",
    "dispose-recorded-passthrough",
    () => {
      expectPacked(dispose({ stateToken: 2, recordedPacked: 0 }), 0, "mutant passthrough 0");
    },
  );
  expectPacked(dispose({ stateToken: 2, recordedPacked: 0 }), 111, "restored");
});

test("mutant skip wipeWins over boundary refusal goes RED", () => {
  expectPacked(use({ wipeToken: 1, lenClass: 3 }), 117, "landed wipe over len");
  withMutant(
    "  if wiped == 117 {\n    return wiped\n  }\n  if wiped == 106 {\n    return wiped\n  }\n  return finish(0, true)",
    "  if wiped == 117 {\n    return finish(0, true)\n  }\n  if wiped == 106 {\n    return wiped\n  }\n  return finish(0, true)",
    "skip-wipeWins",
    () => {
      expectPacked(use({ wipeToken: 1, lenClass: 3 }), 110, "mutant len NaN hides wipe");
    },
  );
  expectPacked(use({ wipeToken: 1, lenClass: 3 }), 117, "restored");
});

test("mutant drop frame-status default arm goes RED", () => {
  expectPacked(has({ statusToken: 9 }), 106, "landed unlisted");
  withPortMutant(
    "if statusToken == 2 {\n    return 2\n  }\n  return 11",
    "if statusToken == 2 {\n    return 2\n  }\n  return 0",
    "status-default-arm",
    () => {
      expectPacked(has({ statusToken: 9, dataByte: 1 }), 100, "mutant treats unlisted as OK present");
    },
  );
  expectPacked(has({ statusToken: 9 }), 106, "restored");
});

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
const UNIT = join(MEM, "src", "secret-gate.fungi");
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
  const dir = mkdtempSync(join(tmpdir(), "q34-flat-"));
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

function admit(over) {
  const o = over || {};
  return runFlow("admit", [
    o.requiredCountClass ?? 0,
    o.requiredCount ?? 1,
    o.providerClass ?? 0,
    o.providerPresent ?? 1,
    o.presenceClass ?? 0,
    o.presenceStatus ?? 0,
    o.epochClass ?? 0,
    o.epoch ?? 1,
    o.epochPresentClass ?? 0,
    o.epochPresentToken ?? 1,
  ]);
}

function deliver(over) {
  const o = over || {};
  return runFlow("deliverSecret", [
    o.declaredClass ?? 0,
    o.declaredToken ?? 1,
    o.providerClass ?? 0,
    o.providerPresent ?? 1,
    o.callbackClass ?? 0,
    o.callbackOutcome ?? 1,
    o.wipeClass ?? 0,
    o.wipeResult ?? 0,
    o.epochMintClass ?? 0,
    o.epochMint ?? 1,
    o.epochUseClass ?? 0,
    o.epochUse ?? 1,
    o.epochMovedClass ?? 0,
    o.epochMovedToken ?? 0,
    o.epochPresentClass ?? 0,
    o.epochPresentToken ?? 1,
    o.cleanupClass ?? 0,
    o.cleanupEvidence ?? 1,
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

test("MUST-ADMIT empty require without a provider", () => {
  expectPacked(admit({ requiredCount: 0, providerPresent: 0, epochPresentToken: 0, presenceStatus: 0 }), 100, "empty no provider");
});

test("MUST-ADMIT nonempty present provider with epoch", () => {
  expectPacked(admit({}), 100, "present");
});

test("MUST-ADMIT empty require with provider and epoch", () => {
  expectPacked(admit({ requiredCount: 0, providerPresent: 1, epochPresentToken: 1, presenceStatus: 0 }), 100, "empty with provider");
});

test("MUST-REFUSE empty require with provider and no epoch", () => {
  expectPacked(admit({ requiredCount: 0, providerPresent: 1, epochPresentToken: 0 }), 103, "legacy epoch on empty+provider");
});

test("MUST-REFUSE required secret absent faulted error and has-threw", () => {
  expectPacked(admit({ presenceStatus: 1 }), 101, "absent");
  expectPacked(admit({ presenceStatus: 2 }), 101, "faulted");
  expectPacked(admit({ presenceStatus: 3 }), 101, "error");
  expectPacked(admit({ presenceStatus: 4 }), 101, "has-threw");
});

test("MUST-REFUSE provider absent with requirements", () => {
  expectPacked(admit({ providerPresent: 0, epochPresentToken: 0 }), 101, "no provider");
});

test("MUST-REFUSE unlisted presence status", () => {
  expectPacked(admit({ presenceStatus: 9 }), 111, "unlisted 9");
  expectPacked(admit({ presenceStatus: 2147483647 }), 111, "unlisted maxint");
});

test("MUST-REFUSE foreign classTag on admit", () => {
  expectPacked(admit({ requiredCountClass: 3 }), 110, "required NaN");
  expectPacked(admit({ providerClass: 3 }), 110, "provider NaN");
  expectPacked(admit({ presenceClass: 3 }), 110, "presence NaN");
  expectPacked(admit({ epochClass: 3 }), 110, "epoch NaN");
  expectPacked(admit({ epochPresentClass: 3 }), 110, "epochPresent NaN");
  expectPacked(admit({ requiredCountClass: 11 }), 111, "required unlisted class");
  expectPacked(admit({ presenceClass: 11 }), 111, "presence unlisted class");
});

test("MUST-ADMIT short-lived delivery then consume", () => {
  expectPacked(deliver({}), 100, "delivered");
});

test("MUST-REFUSE undeclared name", () => {
  expectPacked(deliver({ declaredToken: 0 }), 112, "undeclared");
});

test("MUST-REFUSE provider absent on deliver", () => {
  expectPacked(deliver({ providerPresent: 0 }), 119, "provider absent");
});

test("MUST-REFUSE callback not called twice value thenable", () => {
  expectPacked(deliver({ callbackOutcome: 0 }), 113, "not called");
  expectPacked(deliver({ callbackOutcome: 2 }), 114, "twice");
  expectPacked(deliver({ callbackOutcome: 3 }), 115, "returns value");
  expectPacked(deliver({ callbackOutcome: 4 }), 116, "thenable");
});

test("MUST-REFUSE wipe failed and wipe unknown", () => {
  expectPacked(deliver({ wipeResult: 1 }), 117, "wipe failed");
  expectPacked(deliver({ wipeResult: 2 }), 117, "wipe unknown");
});

test("MUST-REFUSE epoch moved between admit and use", () => {
  expectPacked(deliver({ epochMovedToken: 1 }), 118, "epoch moved");
});

test("MUST-REFUSE legacy provider without epoch on deliver", () => {
  expectPacked(deliver({ epochPresentToken: 0 }), 103, "legacy epoch deliver");
});

test("MUST-REFUSE cleanup UNKNOWN via releaseGuard", () => {
  expectPacked(deliver({ cleanupEvidence: 4 }), 106, "cleanup unknown");
  expectPacked(deliver({ cleanupEvidence: 2 }), 106, "cleanup pending");
  expectPacked(deliver({ cleanupEvidence: 3 }), 106, "cleanup failed");
});

test("MUST-REFUSE unlisted callback and wipe", () => {
  expectPacked(deliver({ callbackOutcome: 9 }), 111, "unlisted callback");
  expectPacked(deliver({ wipeResult: 9 }), 111, "unlisted wipe");
});

test("MUST-REFUSE foreign classTag on deliver", () => {
  expectPacked(deliver({ declaredClass: 3 }), 110, "declared NaN");
  expectPacked(deliver({ callbackClass: 3 }), 110, "callback NaN");
  expectPacked(deliver({ wipeClass: 3 }), 110, "wipe NaN");
  expectPacked(deliver({ epochMovedClass: 11 }), 111, "moved unlisted class");
});

test("gateAcknowledge delegates to ackStep", () => {
  expectPacked(runFlow("gateAcknowledge", [0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1]), 101, "ack released");
  expectPacked(runFlow("gateAcknowledge", [0, 0, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1]), 105, "ack missing");
});

test("gateStatus delegates to classifyRecovery and never opens the provider", () => {
  expectPacked(runFlow("gateStatus", [0, 1, 0, 0, 0, 0, 0, 2]), 100, "RELEASED_ACKED");
  expectPacked(runFlow("gateStatus", [0, 1, 0, 0, 0, 0, 0, 1]), 101, "RELEASED_UNACKED");
  expectPacked(runFlow("gateStatus", [0, 1, 0, 0, 0, 0, 0, 4]), 103, "DELIVERY_UNKNOWN");
  expectPacked(runFlow("gateStatus", [0, 0, 0, 0, 0, 0, 0, 0]), 104, "NOT_FOUND");
});

test("gateNoteUndelivered delegates to revokeDelivery", () => {
  expectPacked(runFlow("gateNoteUndelivered", [0, 2]), 106, "ack to unknown");
  expectPacked(runFlow("gateNoteUndelivered", [0, 0]), 108, "unused no-op");
});

test("RED mutant accept missing epoch", () => {
  withMutant(
    "if epochPresentToken == 0 {\n    return finish(3, true)",
    "if epochPresentToken == 0 {\n    return finish(0, true)",
    () => {
      const r = admit({ requiredCount: 0, providerPresent: 1, epochPresentToken: 0 });
      assert.notEqual(r.value, 103, "missing epoch must not stay LegacyEpoch");
      assert.equal(r.value, 100, "missing epoch admitted");
    },
  );
  expectPacked(admit({ requiredCount: 0, providerPresent: 1, epochPresentToken: 0 }), 103, "restore epoch");
});

test("RED mutant admit on faulted", () => {
  withMutant(
    "if requiredCount == 1 {\n    if presenceStatus != 0 {\n      return finish(1, true)",
    "if requiredCount == 1 {\n    if presenceStatus != 0 {\n      return finish(0, true)",
    () => {
      const r = admit({ presenceStatus: 2 });
      assert.notEqual(r.value, 101, "faulted must not stay SecretUnavailable");
      assert.equal(r.value, 100, "faulted admitted");
    },
  );
  expectPacked(admit({ presenceStatus: 2 }), 101, "restore faulted");
});

test("RED mutant allow second callback", () => {
  withMutant(
    "if callbackOutcome == 2 {\n    return finish(14, true)",
    "if callbackOutcome == 2 {\n    return finish(0, true)",
    () => {
      const r = deliver({ callbackOutcome: 2 });
      assert.notEqual(r.value, 114, "twice must not stay CallbackTwice");
      assert.equal(r.value, 100, "second callback admitted");
    },
  );
  expectPacked(deliver({ callbackOutcome: 2 }), 114, "restore twice");
});

test("RED mutant skip wipe check", () => {
  withMutant(
    "if wipeResult != 0 {\n    return finish(17, true)",
    "if wipeResult == 99 {\n    return finish(17, true)",
    () => {
      const r = deliver({ wipeResult: 1 });
      assert.notEqual(r.value, 117, "wipe fail must not stay WipeFailed");
      assert.equal(r.value, 100, "wipe fail consumed");
    },
  );
  expectPacked(deliver({ wipeResult: 1 }), 117, "restore wipe");
});

test("RED mutant drop the default arm", () => {
  withMutant(
    "if presenceStatus != 3 {\n          if presenceStatus != 4 {\n            return finish(11, true)",
    "if presenceStatus != 3 {\n          if presenceStatus != 4 {\n            return finish(0, true)",
    () => {
      const r = admit({ presenceStatus: 9 });
      assert.notEqual(r.value, 111, "unlisted presence must not stay Unlisted");
      assert.equal(r.value, 100, "unlisted presence admitted");
    },
  );
  expectPacked(admit({ presenceStatus: 9 }), 111, "restore default arm");
});

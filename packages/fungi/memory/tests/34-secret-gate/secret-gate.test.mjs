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

const UNIT_SOURCE_LANDING = Object.freeze({ kind: "LANDING" });
let unitSourceOverride = UNIT_SOURCE_LANDING;

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
  const unit = unitSourceOverride === UNIT_SOURCE_LANDING ? readFileSync(UNIT, "utf8") : unitSourceOverride;
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

function pre(over) {
  const o = over || {};
  return runFlow("deliverPreHandoff", [
    o.declaredClass ?? 0,
    o.declaredToken ?? 1,
    o.providerClass ?? 0,
    o.providerPresent ?? 1,
    o.epochPresentClass ?? 0,
    o.epochPresentToken ?? 1,
    o.epochMintClass ?? 0,
    o.epochMint ?? 1,
    o.epochUseClass ?? 0,
    o.epochUse ?? 1,
    o.epochMovedClass ?? 0,
    o.epochMovedToken ?? 0,
    o.revokeClass ?? 0,
    o.revokeCommittedToken ?? 0,
    o.validityClass ?? 0,
    o.currentValidityToken ?? 1,
  ]);
}

function post(over) {
  const o = over || {};
  return runFlow("deliverPostHandoff", [
    o.preClass ?? 0,
    o.prePacked ?? 100,
    o.callbackClass ?? 0,
    o.callbackOutcome ?? 1,
    o.wipeClass ?? 0,
    o.wipeResult ?? 0,
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
    o.currentValidityClass ?? 0,
    o.currentValidityToken ?? 1,
  ]);
}

function deliver(over) {
  const p = pre(over);
  if (p.present !== true || p.value !== 100) {
    return p;
  }
  return post({ ...(over || {}), prePacked: 100 });
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

test("MUST-REFUSE listed cleanup as DELIVERY_UNKNOWN after good callback and wipe", () => {
  expectPacked(deliver({}), 106, "cleanup 1");
  expectPacked(deliver({ cleanupEvidence: 0 }), 106, "cleanup 0");
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
  expectPacked(pre({ epochMint: 1, epochUse: 2, epochMovedToken: 0 }), 118, "mint use mismatch");
  expectPacked(pre({ epochMint: 5, epochUse: 999, epochMovedToken: 0 }), 118, "mint 5 use 999");
  expectPacked(pre({ epochMint: 1, epochUse: 1, epochMovedToken: 1 }), 118, "token disagrees with equal compare");
});

test("MUST-REFUSE legacy provider without epoch on deliver", () => {
  expectPacked(deliver({ epochPresentToken: 0 }), 103, "legacy epoch deliver");
});

test("MUST-REFUSE cleanup UNKNOWN via releaseGuard", () => {
  expectPacked(deliver({ cleanupEvidence: 4 }), 106, "cleanup unknown");
  expectPacked(deliver({ cleanupEvidence: 2 }), 106, "cleanup pending");
  expectPacked(deliver({ cleanupEvidence: 3 }), 106, "cleanup failed");
  expectPacked(deliver({ cleanupEvidence: 1 }), 106, "cleanup succeeded still unknown");
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
  expectPacked(pre({ epochPresentClass: 3 }), 110, "epochPresent NaN");
  expectPacked(pre({ epochPresentClass: 11 }), 111, "epochPresent unlisted");
  expectPacked(deliver({ cleanupClass: 3 }), 110, "cleanup NaN");
  expectPacked(deliver({ cleanupClass: 11 }), 111, "cleanup unlisted");
  expectPacked(post({ authClass: 3 }), 110, "auth NaN");
  expectPacked(post({ authClass: 11 }), 111, "auth unlisted");
  expectPacked(post({ custodyClass: 3 }), 110, "custody NaN");
  expectPacked(post({ custodyClass: 11 }), 111, "custody unlisted");
  expectPacked(post({ emptyClass: 3 }), 110, "empty NaN");
  expectPacked(post({ emptyClass: 11 }), 111, "empty unlisted");
  expectPacked(post({ consumedAuthClass: 3 }), 110, "consumedAuth NaN");
  expectPacked(post({ consumedAuthClass: 11 }), 111, "consumedAuth unlisted");
  expectPacked(post({ presentClass: 3 }), 110, "present NaN");
  expectPacked(post({ presentClass: 11 }), 111, "present unlisted");
  expectPacked(post({ matchClass: 3 }), 110, "match NaN");
  expectPacked(post({ matchClass: 11 }), 111, "match unlisted");
  expectPacked(post({ epochMatchClass: 3 }), 110, "epochMatch NaN");
  expectPacked(post({ epochMatchClass: 11 }), 111, "epochMatch unlisted");
  expectPacked(post({ leaseClass: 3 }), 110, "lease NaN");
  expectPacked(post({ leaseClass: 11 }), 111, "lease unlisted");
  expectPacked(post({ revokeClass: 3 }), 110, "post revoke NaN");
  expectPacked(post({ revokeClass: 11 }), 111, "revoke unlisted");
  expectPacked(pre({ validityClass: 3 }), 110, "validity NaN");
  expectPacked(pre({ validityClass: 11 }), 111, "validity unlisted");
  expectPacked(pre({ revokeClass: 3 }), 110, "pre revoke NaN");
  expectPacked(pre({ revokeClass: 11 }), 111, "pre revoke unlisted");
  expectPacked(pre({ epochMintClass: 3 }), 110, "epochMint NaN");
  expectPacked(pre({ epochMintClass: 11 }), 111, "epochMint unlisted");
  expectPacked(pre({ epochUseClass: 3 }), 110, "epochUse NaN");
  expectPacked(pre({ epochUseClass: 11 }), 111, "epochUse unlisted");
  expectPacked(post({ preClass: 3 }), 110, "preClass NaN");
  expectPacked(post({ preClass: 11 }), 111, "preClass unlisted");
  expectPacked(post({ currentValidityClass: 3 }), 110, "post validity NaN");
  expectPacked(post({ currentValidityClass: 11 }), 111, "post validity unlisted");
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
      assert.equal(r.value, 106, "wipe fail reached release");
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

test("F4 pre-handoff refusals reachable with no callback outcome", () => {
  expectPacked(pre({ declaredToken: 0 }), 112, "undeclared pre");
  expectPacked(pre({ providerPresent: 0 }), 119, "provider pre");
  expectPacked(pre({ epochPresentToken: 0 }), 103, "epoch pre");
  expectPacked(pre({ epochMint: 1, epochUse: 2 }), 118, "epoch compare pre");
  expectPacked(pre({ revokeCommittedToken: 1 }), 102, "revocation first pre");
  expectPacked(pre({ currentValidityToken: 0 }), 106, "validity pre");
  expectPacked(pre({}), 100, "pre admit");
});

test("F4 post-handoff with a non-admit pre-code refuses", () => {
  expectPacked(post({ prePacked: 112 }), 111, "pre undeclared");
  expectPacked(post({ prePacked: 0 }), 111, "unpacked");
  expectPacked(post({ prePacked: 106 }), 111, "pre unknown");
});

test("F2 release tokens pass through commit point", () => {
  expectPacked(post({ independentAuthToken: 0 }), 105, "auth absent");
  expectPacked(post({ preparedCustodyToken: 0 }), 105, "custody absent");
  expectPacked(post({ presentToken: 0 }), 105, "consume missing");
  expectPacked(post({ revokeCommittedToken: 1 }), 102, "revoke in consumeStep");
  expectPacked(post({ consumedAuthorityToken: 0 }), 106, "consumed authority unknown");
  expectPacked(post({ emptyObligationSetToken: 0, cleanupEvidence: 0 }), 102, "empty obligation");
  expectPacked(post({ tokenMatchToken: 0 }), 102, "token mismatch unused");
  expectPacked(post({ epochMatchToken: 0 }), 104, "epoch mismatch");
  expectPacked(post({ leaseState: 1 }), 103, "lease acked");
  expectPacked(post({ independentAuthToken: 2 }), 111, "auth unlisted value");
  expectPacked(post({ presentToken: 2 }), 111, "present unlisted value");
  expectPacked(post({ leaseState: 9 }), 111, "lease unlisted value");
});

test("RED mutant F1 skip epochMint versus epochUse", () => {
  withMutant(
    "  if epochMint != epochUse {\n    return finish(18, true)\n  }",
    "  if epochMint == 99 {\n    return finish(18, true)\n  }",
    () => {
      const r = pre({ epochMint: 1, epochUse: 2, epochMovedToken: 0 });
      assert.notEqual(r.value, 118, "mismatch must not stay EpochMoved");
      assert.equal(r.value, 100, "mismatch admitted");
    },
  );
  expectPacked(pre({ epochMint: 1, epochUse: 2, epochMovedToken: 0 }), 118, "restore compare");
});

test("RED mutant F2 remove consumeStep", () => {
  withMutant(
    "  let consumed: Int = consumeStep(presentToken, tokenMatchToken, 0, epochMatchToken, leaseState, revokeCommittedToken, guardOutcome)\n  if consumed == 100 {\n    return finish(6, true)\n  }\n  return consumed",
    "  return finish(6, true)",
    () => {
      const r = post({ presentToken: 0 });
      assert.notEqual(r.value, 105, "missing present must not stay missing");
      assert.equal(r.value, 106, "consumeStep gone maps to unknown");
    },
  );
  expectPacked(post({ presentToken: 0 }), 105, "restore consumeStep");
});

test("RED mutant F3 return packed 100 on listed cleanup", () => {
  withMutant(
    "  if consumed == 100 {\n    return finish(6, true)\n  }",
    "  if consumed == 100 {\n    return finish(0, true)\n  }",
    () => {
      const r = deliver({});
      assert.notEqual(r.value, 106, "listed cleanup must not stay unknown");
      assert.equal(r.value, 100, "listed cleanup delivered");
    },
  );
  expectPacked(deliver({}), 106, "restore MB-06");
});

test("RED mutant F4 skip prePacked gate", () => {
  withMutant(
    "  if prePacked != 100 {\n    return finish(11, true)\n  }",
    "  if prePacked == 99 {\n    return finish(11, true)\n  }",
    () => {
      const r = post({ prePacked: 112 });
      assert.notEqual(r.value, 111, "non-admit pre must not stay Unlisted");
      assert.equal(r.value, 106, "non-admit pre reached release");
    },
  );
  expectPacked(post({ prePacked: 112 }), 111, "restore prePacked gate");
});

test("F1 post-handoff current validity through releaseGuard", () => {
  expectPacked(post({ currentValidityToken: 0 }), 106, "validity 0");
  expectPacked(post({ currentValidityToken: 2 }), 111, "validity 2 unlisted");
  expectPacked(post({ currentValidityClass: 3 }), 110, "validity class 3");
  expectPacked(post({ currentValidityClass: 11 }), 111, "validity class 11");
  expectPacked(pre({ currentValidityToken: 0 }), 106, "pre validity kept");
});

test("RED mutant F1 fabricate current validity as 1", () => {
  withMutant(
    "  let guardOutcome: Int = releaseGuard(independentAuthToken, preparedCustodyToken, cleanupEvidence, emptyObligationSetToken, consumedAuthorityToken, currentValidityToken)",
    "  let guardOutcome: Int = releaseGuard(independentAuthToken, preparedCustodyToken, cleanupEvidence, emptyObligationSetToken, consumedAuthorityToken, 1)",
    () => {
      const r = post({ currentValidityToken: 0, presentToken: 0 });
      assert.notEqual(r.value, 106, "lapsed validity must not stay DELIVERY_UNKNOWN");
      assert.equal(r.value, 105, "hardcoded 1 reaches consumeStep missing");
    },
  );
  expectPacked(post({ currentValidityToken: 0, presentToken: 0 }), 106, "restore currentValidityToken");
});

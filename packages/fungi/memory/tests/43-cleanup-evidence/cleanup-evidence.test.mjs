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
const UNIT = join(MEM, "src", "cleanup-evidence.fungi");
const GALERINA = join(REPO, "galerina.mjs");
const IMPORT_LINE = "\nimport \"./c-boundary.fungi\"\n";

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

function flattenUnit() {
  const boundary = readFileSync(BOUNDARY, "utf8");
  const unit = unitSourceOverride !== null ? unitSourceOverride : readFileSync(UNIT, "utf8");
  assert.equal(unit.includes(IMPORT_LINE), true, "landed source must import c-boundary");
  const parts = unit.split(IMPORT_LINE);
  assert.equal(parts.length, 2, "import line must occur once");
  let rest = parts[0] + parts[1];
  const marker = "@version 1";
  const first = rest.indexOf(marker);
  assert.notEqual(first, -1, "unit version marker");
  rest = rest.slice(first + marker.length);
  const dir = mkdtempSync(join(tmpdir(), "q43-flat-"));
  const file = uniqueFungiFile(dir);
  writeFileSync(file, boundary + "\n" + rest);
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
  return runFlow("admitCleanup", [
    o.mintedClass ?? 0,
    o.mintedToken ?? 1,
    o.evOpIdClass ?? 0,
    o.evOpId ?? 10,
    o.callOpIdClass ?? 0,
    o.callOpId ?? 10,
    o.evGenClass ?? 0,
    o.evGen ?? 1,
    o.callGenClass ?? 0,
    o.callGen ?? 1,
    o.evDigestClass ?? 0,
    o.evDigest ?? 77,
    o.callDigestClass ?? 0,
    o.callDigest ?? 77,
    o.statusClass ?? 0,
    o.evStatus ?? 0,
    o.opClassClass ?? 0,
    o.opClass ?? 2,
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

test("mintCleanup admits listed status and refuses unlisted", () => {
  expectPacked(runFlow("mintCleanup", [0, 0]), 101, "mint DONE");
  expectPacked(runFlow("mintCleanup", [0, 1]), 101, "mint NOT_REQUIRED");
  expectPacked(runFlow("mintCleanup", [0, 2]), 101, "mint PENDING");
  expectPacked(runFlow("mintCleanup", [0, 3]), 101, "mint FAILED");
  expectPacked(runFlow("mintCleanup", [0, 4]), 101, "mint UNKNOWN");
  expectPacked(runFlow("mintCleanup", [0, 9]), 111, "mint unlisted status");
  expectPacked(runFlow("mintCleanup", [3, 0]), 110, "mint NaN class");
});

test("MUST-ADMIT DONE with matching opId generation and digest", () => {
  expectPacked(admit({}), 100, "bound DONE");
});

test("MUST-ADMIT NOT_REQUIRED for listed empty classes", () => {
  expectPacked(admit({ evStatus: 1, opClass: 0 }), 101, "empty noop");
  expectPacked(admit({ evStatus: 1, opClass: 1 }), 101, "empty observe");
});

test("MUST-REFUSE NOT_REQUIRED on nonempty classes", () => {
  expectPacked(admit({ evStatus: 1, opClass: 2 }), 108, "nonempty secret");
  expectPacked(admit({ evStatus: 1, opClass: 3 }), 108, "nonempty wipe");
});

test("MUST-REFUSE unlisted opClass for every status before status arms", () => {
  expectPacked(admit({ evStatus: 0, opClass: 9 }), 111, "unlisted DONE");
  expectPacked(admit({ evStatus: 0, opClass: 2147483647 }), 111, "unlisted DONE maxint");
  expectPacked(admit({ evStatus: 1, opClass: 9 }), 111, "unlisted NOT_REQUIRED");
  expectPacked(admit({ evStatus: 2, opClass: 9 }), 111, "unlisted PENDING");
  expectPacked(admit({ evStatus: 3, opClass: 9 }), 111, "unlisted FAILED");
  expectPacked(admit({ evStatus: 4, opClass: 9 }), 111, "unlisted UNKNOWN");
});

test("MUST-REFUSE each mismatch with its own typed code", () => {
  expectPacked(admit({ evOpId: 10, callOpId: 11 }), 102, "opId mismatch");
  expectPacked(admit({ evGen: 1, callGen: 2 }), 103, "generation mismatch");
  expectPacked(admit({ evDigest: 77, callDigest: 88 }), 104, "digest mismatch");
  expectPacked(admit({ evStatus: 2 }), 105, "PENDING");
  expectPacked(admit({ evStatus: 3 }), 106, "FAILED before begin");
  expectPacked(admit({ evStatus: 4 }), 107, "UNKNOWN before begin");
  expectPacked(admit({ mintedToken: 0 }), 109, "unminted");
  expectPacked(admit({ evStatus: 9 }), 111, "unlisted status");
  expectPacked(admit({ mintedToken: 2 }), 111, "unlisted minted token");
});

test("MUST-REFUSE evidence from operation A for operation B same generation", () => {
  expectPacked(admit({ evOpId: 10, callOpId: 11, evGen: 1, callGen: 1 }), 102, "op A vs B");
});

test("MUST-REFUSE evidence from generation N for N+1 same opId", () => {
  expectPacked(admit({ evOpId: 10, callOpId: 10, evGen: 5, callGen: 6 }), 103, "gen N vs N+1");
});

test("MUST-REFUSE foreign NaN through the helper as ForeignRawRefused", () => {
  expectPacked(admit({ mintedClass: 3 }), 110, "minted NaN");
  expectPacked(admit({ statusClass: 3 }), 110, "status NaN");
  expectPacked(admit({ opClassClass: 3 }), 110, "opClass NaN");
});

test("MUST-REFUSE classTag 3 and 11 on each opId generation digest gate", () => {
  expectPacked(admit({ evOpIdClass: 3 }), 110, "evOpId NaN");
  expectPacked(admit({ evOpIdClass: 11 }), 111, "evOpId unlisted");
  expectPacked(admit({ callOpIdClass: 3 }), 110, "callOpId NaN");
  expectPacked(admit({ callOpIdClass: 11 }), 111, "callOpId unlisted");
  expectPacked(admit({ evGenClass: 3 }), 110, "evGen NaN");
  expectPacked(admit({ evGenClass: 11 }), 111, "evGen unlisted");
  expectPacked(admit({ callGenClass: 3 }), 110, "callGen NaN");
  expectPacked(admit({ callGenClass: 11 }), 111, "callGen unlisted");
  expectPacked(admit({ evDigestClass: 3 }), 110, "evDigest NaN");
  expectPacked(admit({ evDigestClass: 11 }), 111, "evDigest unlisted");
  expectPacked(admit({ callDigestClass: 3 }), 110, "callDigest NaN");
  expectPacked(admit({ callDigestClass: 11 }), 111, "callDigest unlisted");
});

test("after-begin listed statuses are DELIVERY_UNKNOWN plus QUARANTINED", () => {
  expectPacked(runFlow("afterBeginCleanup", [0, 2, 0, 1]), 106, "PENDING after begin");
  expectPacked(runFlow("afterBeginCleanup", [0, 3, 0, 1]), 106, "FAILED after begin");
  expectPacked(runFlow("afterBeginCleanup", [0, 4, 0, 1]), 106, "UNKNOWN after begin");
  expectPacked(runFlow("afterBeginCleanup", [0, 0, 0, 1]), 106, "DONE after begin never success");
  expectPacked(runFlow("afterBeginCleanup", [0, 1, 0, 1]), 106, "NOT_REQUIRED after begin");
  expectPacked(runFlow("resourceAfterBegin", [0, 2, 0, 1]), 121, "PENDING -> QUARANTINED");
  expectPacked(runFlow("resourceAfterBegin", [0, 3, 0, 1]), 121, "FAILED -> QUARANTINED");
  expectPacked(runFlow("resourceAfterBegin", [0, 4, 0, 1]), 121, "UNKNOWN -> QUARANTINED");
  expectPacked(runFlow("resourceAfterBegin", [0, 0, 0, 1]), 121, "DONE -> QUARANTINED");
  expectPacked(runFlow("resourceAfterBegin", [0, 1, 0, 1]), 121, "NOT_REQUIRED -> QUARANTINED");
  expectPacked(runFlow("afterBeginCleanup", [0, 9, 0, 1]), 111, "unlisted status after begin");
  expectPacked(runFlow("afterBeginCleanup", [0, 3, 0, 0]), 112, "phaseToken 0 own code");
  expectPacked(runFlow("afterBeginCleanup", [0, 3, 0, 5]), 111, "unlisted phase");
  expectPacked(runFlow("afterBeginCleanup", [3, 3, 0, 1]), 110, "status NaN after begin");
});

test("QUARANTINED refuses reuse and release and admits wipe then destroy", () => {
  expectPacked(runFlow("resourceTransition", [0, 1, 0, 0, 0, 0]), 114, "reuse refused");
  expectPacked(runFlow("resourceTransition", [0, 1, 0, 1, 0, 0]), 115, "release refused");
  expectPacked(runFlow("resourceTransition", [0, 1, 0, 2, 0, 2]), 122, "wipe admitted");
  expectPacked(runFlow("resourceTransition", [0, 1, 0, 3, 0, 3]), 116, "destroy without wipe refused");
  expectPacked(runFlow("resourceTransition", [0, 2, 0, 3, 0, 3]), 123, "destroy after wipe");
  expectPacked(runFlow("resourceTransition", [0, 1, 0, 4, 0, 1]), 117, "free from QUARANTINED not DONE");
  expectPacked(runFlow("resourceTransition", [0, 9, 0, 2, 0, 2]), 111, "unlisted from-state");
  expectPacked(runFlow("resourceTransition", [0, 1, 0, 9, 0, 2]), 111, "unlisted event");
});

test("MUST-REFUSE WIPED reuse and WIPED release", () => {
  expectPacked(runFlow("resourceTransition", [0, 2, 0, 0, 0, 0]), 114, "WIPED reuse");
  expectPacked(runFlow("resourceTransition", [0, 2, 0, 1, 0, 0]), 115, "WIPED release");
});

test("free without wipe is not DONE; explicit wipe reports wipe-step-reported", () => {
  expectPacked(runFlow("freeStep", [0, 0]), 117, "free is not DONE");
  expectPacked(runFlow("freeStep", [0, 1]), 118, "explicit wipe reports wipe-step-reported");
  expectPacked(runFlow("freeStep", [0, 2]), 111, "unlisted action");
});

test("unlisted resource pair refuses", () => {
  expectPacked(runFlow("resourceTransition", [0, 0, 0, 0, 0, 1]), 111, "LIVE reuse to QUARANTINED unlisted");
  expectPacked(runFlow("resourceTransition", [0, 3, 0, 0, 0, 0]), 111, "DESTROYED reuse");
});

test("RED mutant skip the opId compare", () => {
  withMutant("let opIdCheckOn: Int = 1", "let opIdCheckOn: Int = 0", () => {
    const r = admit({ evOpId: 10, callOpId: 11 });
    assert.notEqual(r.value, 102, "skip opId must not keep OpIdMismatch");
    assert.equal(r.value, 100, "skip opId admits mismatched DONE");
  });
});

test("RED mutant skip the generation compare", () => {
  withMutant("let genCheckOn: Int = 1", "let genCheckOn: Int = 0", () => {
    const r = admit({ evGen: 1, callGen: 2 });
    assert.notEqual(r.value, 103, "skip generation must not keep GenerationMismatch");
    assert.equal(r.value, 100, "skip generation admits mismatched DONE");
  });
});

test("RED mutant skip the digest compare", () => {
  withMutant("let digestCheckOn: Int = 1", "let digestCheckOn: Int = 0", () => {
    const r = admit({ evDigest: 77, callDigest: 88 });
    assert.notEqual(r.value, 104, "skip digest must not keep DigestMismatch");
    assert.equal(r.value, 100, "skip digest admits mismatched DONE");
  });
});

test("RED mutant admit PENDING", () => {
  withMutant("let pendingRefuseOn: Int = 1", "let pendingRefuseOn: Int = 0", () => {
    const r = admit({ evStatus: 2 });
    assert.notEqual(r.value, 105, "admit PENDING must not keep StatusPending");
    assert.equal(r.value, 100, "PENDING admitted");
  });
});

test("RED mutant admit UNKNOWN", () => {
  withMutant("let unknownRefuseOn: Int = 1", "let unknownRefuseOn: Int = 0", () => {
    const r = admit({ evStatus: 4 });
    assert.notEqual(r.value, 107, "admit UNKNOWN must not keep StatusUnknown");
    assert.equal(r.value, 100, "UNKNOWN admitted");
  });
});

test("RED mutant NOT_REQUIRED on a non-empty class", () => {
  withMutant("let nonemptySecretReleaseEmpty: Int = 0", "let nonemptySecretReleaseEmpty: Int = 1", () => {
    const r = admit({ evStatus: 1, opClass: 2 });
    assert.notEqual(r.value, 108, "nonempty empty-flag must not keep NotRequiredNonEmpty");
    assert.equal(r.value, 101, "NOT_REQUIRED admitted on nonempty");
  });
});

test("RED mutant merge two mismatch codes", () => {
  withMutant("let generationMismatchCode: Int = 3", "let generationMismatchCode: Int = 2", () => {
    const opId = admit({ evOpId: 10, callOpId: 11 });
    const gen = admit({ evGen: 1, callGen: 2 });
    assert.equal(opId.value, 102, "opId still 102");
    assert.equal(gen.value, 102, "generation merged onto 102");
    assert.notEqual(gen.value, 103, "generation no longer unique");
  });
});

test("RED mutant after-begin failure mapped to REFUSED", () => {
  withMutant("let afterBeginFailedCode: Int = 6", "let afterBeginFailedCode: Int = 2", () => {
    const r = runFlow("afterBeginCleanup", [0, 3, 0, 1]);
    assert.notEqual(r.value, 106, "must not stay DELIVERY_UNKNOWN");
    assert.equal(r.value, 102, "mapped to REFUSED");
  });
});

test("RED mutant after-begin PENDING mapped to REFUSED", () => {
  withMutant("let afterBeginPendingCode: Int = 6", "let afterBeginPendingCode: Int = 2", () => {
    const r = runFlow("afterBeginCleanup", [0, 2, 0, 1]);
    assert.notEqual(r.value, 106, "PENDING must not stay DELIVERY_UNKNOWN");
    assert.equal(r.value, 102, "PENDING mapped to REFUSED");
  });
});

test("RED mutant after-begin UNKNOWN mapped to REFUSED", () => {
  withMutant("let afterBeginUnknownCode: Int = 6", "let afterBeginUnknownCode: Int = 2", () => {
    const r = runFlow("afterBeginCleanup", [0, 4, 0, 1]);
    assert.notEqual(r.value, 106, "UNKNOWN must not stay DELIVERY_UNKNOWN");
    assert.equal(r.value, 102, "UNKNOWN mapped to REFUSED");
  });
});

test("RED mutant after-begin DONE mapped to success", () => {
  withMutant("let afterBeginDoneCode: Int = 6", "let afterBeginDoneCode: Int = 0", () => {
    const r = runFlow("afterBeginCleanup", [0, 0, 0, 1]);
    assert.notEqual(r.value, 106, "DONE after begin must not stay DELIVERY_UNKNOWN");
    assert.equal(r.value, 100, "DONE after begin admitted");
  });
});

test("RED mutant after-begin NOT_REQUIRED mapped to success", () => {
  withMutant("let afterBeginNotRequiredCode: Int = 6", "let afterBeginNotRequiredCode: Int = 0", () => {
    const r = runFlow("afterBeginCleanup", [0, 1, 0, 1]);
    assert.notEqual(r.value, 106, "NOT_REQUIRED after begin must not stay DELIVERY_UNKNOWN");
    assert.equal(r.value, 100, "NOT_REQUIRED after begin admitted");
  });
});

test("RED mutant phaseToken 0 collapsed to Unlisted", () => {
  withMutant("let phaseBeforeBeginCode: Int = 12", "let phaseBeforeBeginCode: Int = 11", () => {
    const r = runFlow("afterBeginCleanup", [0, 3, 0, 0]);
    assert.notEqual(r.value, 112, "phase 0 must not keep own code");
    assert.equal(r.value, 111, "phase 0 collapsed to Unlisted");
  });
});

test("RED mutant QUARANTINED to LIVE allowed", () => {
  withMutant("let quarantinedReuseRefuseOn: Int = 1", "let quarantinedReuseRefuseOn: Int = 0", () => {
    const r = runFlow("resourceTransition", [0, 1, 0, 0, 0, 0]);
    assert.notEqual(r.value, 114, "must not keep reuse refused");
    assert.equal(r.value, 120, "QUARANTINED -> LIVE admitted");
  });
});

test("RED mutant WIPED reuse admitted", () => {
  withMutant("let wipedReuseRefuseOn: Int = 1", "let wipedReuseRefuseOn: Int = 0", () => {
    const r = runFlow("resourceTransition", [0, 2, 0, 0, 0, 0]);
    assert.notEqual(r.value, 114, "must not keep WIPED reuse refused");
    assert.equal(r.value, 120, "WIPED reuse admitted");
  });
});

test("RED mutant WIPED release admitted", () => {
  withMutant("let wipedReleaseRefuseOn: Int = 1", "let wipedReleaseRefuseOn: Int = 0", () => {
    const r = runFlow("resourceTransition", [0, 2, 0, 1, 0, 0]);
    assert.notEqual(r.value, 115, "must not keep WIPED release refused");
    assert.equal(r.value, 120, "WIPED release admitted");
  });
});

test("RED mutant free counted as DONE", () => {
  withMutant("let freeIsNotDoneOn: Int = 1", "let freeIsNotDoneOn: Int = 0", () => {
    const r = runFlow("freeStep", [0, 0]);
    assert.notEqual(r.value, 117, "must not keep free-is-not-DONE");
    assert.equal(r.value, 100, "free counted as DONE");
  });
});

test("RED mutant wipe-step-reported collapsed to AdmitDone", () => {
  withMutant("let wipeStepReportedCode: Int = 18", "let wipeStepReportedCode: Int = 0", () => {
    const r = runFlow("freeStep", [0, 1]);
    assert.notEqual(r.value, 118, "must not keep wipe-step-reported");
    assert.equal(r.value, 100, "wipe step read as AdmitDone");
  });
});

test("RED mutant accept an unminted value", () => {
  withMutant("let mintedCheckOn: Int = 1", "let mintedCheckOn: Int = 0", () => {
    const r = admit({ mintedToken: 0 });
    assert.notEqual(r.value, 109, "must not keep Unminted");
    assert.equal(r.value, 100, "unminted DONE admitted");
  });
});

test("RED mutant skip evOpId foreign gate", () => {
  withMutant("let evOpIdForeignOn: Int = 1", "let evOpIdForeignOn: Int = 0", () => {
    const r = admit({ evOpIdClass: 3 });
    assert.notEqual(r.value, 110, "skip evOpId foreign must not keep ForeignRaw");
    assert.equal(r.value, 100, "evOpId NaN admitted");
  });
});

test("RED mutant skip callOpId foreign gate", () => {
  withMutant("let callOpIdForeignOn: Int = 1", "let callOpIdForeignOn: Int = 0", () => {
    const r = admit({ callOpIdClass: 3 });
    assert.notEqual(r.value, 110, "skip callOpId foreign must not keep ForeignRaw");
    assert.equal(r.value, 100, "callOpId NaN admitted");
  });
});

test("RED mutant skip evGen foreign gate", () => {
  withMutant("let evGenForeignOn: Int = 1", "let evGenForeignOn: Int = 0", () => {
    const r = admit({ evGenClass: 3 });
    assert.notEqual(r.value, 110, "skip evGen foreign must not keep ForeignRaw");
    assert.equal(r.value, 100, "evGen NaN admitted");
  });
});

test("RED mutant skip callGen foreign gate", () => {
  withMutant("let callGenForeignOn: Int = 1", "let callGenForeignOn: Int = 0", () => {
    const r = admit({ callGenClass: 3 });
    assert.notEqual(r.value, 110, "skip callGen foreign must not keep ForeignRaw");
    assert.equal(r.value, 100, "callGen NaN admitted");
  });
});

test("RED mutant skip evDigest foreign gate", () => {
  withMutant("let evDigestForeignOn: Int = 1", "let evDigestForeignOn: Int = 0", () => {
    const r = admit({ evDigestClass: 3 });
    assert.notEqual(r.value, 110, "skip evDigest foreign must not keep ForeignRaw");
    assert.equal(r.value, 100, "evDigest NaN admitted");
  });
});

test("RED mutant skip callDigest foreign gate", () => {
  withMutant("let callDigestForeignOn: Int = 1", "let callDigestForeignOn: Int = 0", () => {
    const r = admit({ callDigestClass: 3 });
    assert.notEqual(r.value, 110, "skip callDigest foreign must not keep ForeignRaw");
    assert.equal(r.value, 100, "callDigest NaN admitted");
  });
});

test("RED mutant unlisted opClass admitted", () => {
  withMutant("let unlistedOpClassRefuseOn: Int = 1", "let unlistedOpClassRefuseOn: Int = 0", () => {
    const r = admit({ evStatus: 0, opClass: 9 });
    assert.notEqual(r.value, 111, "unlisted opClass must not stay Unlisted");
    assert.equal(r.value, 100, "unlisted opClass DONE admitted");
  });
});

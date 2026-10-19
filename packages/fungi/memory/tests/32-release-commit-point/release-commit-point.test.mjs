import { spawnSync } from "node:child_process";
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";

const HERE = dirname(fileURLToPath(import.meta.url));
const MEM = join(HERE, "..", "..");
const REPO = join(MEM, "..", "..", "..");
const BOUNDARY = join(MEM, "src", "c-boundary.fungi");
const RCP = join(MEM, "src", "release-commit-point.fungi");
const GALERINA = join(REPO, "galerina.mjs");

function invoke(file, flow, args) {
  const argv = [GALERINA, "run", file, "--invoke", flow, ...args.map(String)];
  const r = spawnSync(process.execPath, argv, { encoding: "utf8", cwd: REPO });
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

function expectPacked(r, expected, label) {
  assert.equal(r.status, 0, label + " status " + r.reason + " " + r.text);
  assert.equal(r.present, true, label + " " + r.reason + " " + r.text);
  assert.equal(r.value, expected, label + " " + r.text);
}

function withMutant(file, from, to, runRed) {
  const orig = readFileSync(file, "utf8");
  const mutant = orig.replace(from, to);
  assert.notEqual(mutant, orig, "mutant must change source");
  writeFileSync(file, mutant);
  try {
    runRed();
  } finally {
    writeFileSync(file, orig);
  }
}

test("CN-1 helper lives only in c-boundary; epoch NaN refuses through helper", () => {
  expectPacked(invoke(BOUNDARY, "readForeignSafeInteger", [3, 0]), 3, "helper NaN");
  expectPacked(invoke(RCP, "mintAdmit", [1, 3, 0, 0, 0, 0, 1, 0, 1, 0]), 111, "mint NaN epoch class");
});

test("MUST-REFUSE mint with randomness absent", () => {
  expectPacked(invoke(RCP, "mintAdmit", [1, 0, 1, 0, 0, 0, 0, 0, 1, 0]), 102, "absent nonce");
});

test("MUST-REFUSE mint of retired or in-flight unused", () => {
  expectPacked(invoke(RCP, "mintAdmit", [1, 0, 1, 0, 0, 1, 1, 0, 1, 0]), 103, "retired");
  expectPacked(invoke(RCP, "mintAdmit", [1, 0, 1, 1, 0, 0, 1, 0, 1, 1]), 103, "in-flight unused");
});

test("MUST-REFUSE mint at cap and unfresh issued id", () => {
  expectPacked(invoke(RCP, "mintAdmit", [1, 0, 1, 0, 0, 0, 1, 1, 1, 0]), 102, "at cap");
  expectPacked(invoke(RCP, "mintAdmit", [1, 0, 1, 0, 0, 0, 1, 0, 0, 0]), 103, "not fresh");
});

test("MUST-ADMIT mint of a fresh unused lease", () => {
  expectPacked(invoke(RCP, "mintAdmit", [1, 0, 1, 0, 0, 0, 1, 0, 1, 0]), 100, "fresh mint");
});

test("MUST-REFUSE consume after committed revocation", () => {
  expectPacked(invoke(RCP, "consumeStep", [1, 1, 0, 1, 0, 1]), 102, "revoke first");
});

test("MUST-REFUSE second consume of released op", () => {
  expectPacked(invoke(RCP, "consumeStep", [1, 1, 0, 1, 1, 0]), 103, "second release");
});

test("MUST-ADMIT consume of unused matching token and epoch", () => {
  expectPacked(invoke(RCP, "consumeStep", [1, 1, 0, 1, 0, 0]), 100, "consume D");
});

test("MUST-REFUSE consume with omitted or mismatched epoch", () => {
  expectPacked(invoke(RCP, "consumeStep", [1, 1, 0, 0, 0, 0]), 104, "epoch mismatch");
  expectPacked(invoke(RCP, "consumeStep", [1, 1, 3, 1, 0, 0]), 111, "epoch NaN class");
});

test("MUST-REFUSE ack with omitted epoch", () => {
  expectPacked(invoke(RCP, "ackStep", [1, 1, 0, 0, 1, 1, 1]), 104, "omitted epoch");
});

test("MUST-REFUSE ack before audit commit", () => {
  expectPacked(invoke(RCP, "ackStep", [1, 1, 1, 0, 1, 1, 0]), 106, "ack before audit");
});

test("MUST-ADMIT ack of released after audit", () => {
  expectPacked(invoke(RCP, "ackStep", [1, 1, 1, 0, 1, 1, 1]), 101, "ack released");
});

test("MUST-REFUSE ack of unused or fenced without ternary collapse", () => {
  expectPacked(invoke(RCP, "ackStep", [1, 1, 1, 0, 1, 0, 1]), 104, "ack unused");
  expectPacked(invoke(RCP, "ackStep", [1, 1, 1, 0, 1, 3, 1]), 102, "ack fenced");
  expectPacked(invoke(RCP, "ackStep", [1, 1, 1, 0, 1, 4, 1]), 103, "ack delivery-unknown");
  expectPacked(invoke(RCP, "ackStep", [1, 1, 1, 0, 1, 9, 1]), 111, "ack unlisted lease");
});

test("status: evicted/live/default are DELIVERY_UNKNOWN never NOT_FOUND-then-re-mint", () => {
  expectPacked(invoke(RCP, "classifyRecovery", [0, 1, 0, 0]), 103, "retired");
  expectPacked(invoke(RCP, "classifyRecovery", [0, 0, 1, 0]), 103, "tombstone dropped");
  expectPacked(invoke(RCP, "classifyRecovery", [1, 0, 0, 0]), 103, "live unused");
  expectPacked(invoke(RCP, "classifyRecovery", [0, 0, 0, 0]), 104, "absent is NOT_FOUND");
  expectPacked(invoke(RCP, "classifyRecovery", [1, 0, 0, 2]), 100, "acked");
  expectPacked(invoke(RCP, "classifyRecovery", [1, 0, 0, 1]), 101, "released unacked");
  expectPacked(invoke(RCP, "classifyRecovery", [1, 0, 0, 3]), 102, "fenced REFUSED");
  expectPacked(invoke(RCP, "classifyRecovery", [1, 0, 0, 9]), 111, "unlisted lease");
});

test("MUST-REFUSE Q07 revoke winning the OPEN CAS", () => {
  expectPacked(invoke(RCP, "casBegin", [0, 1]), 102, "revoke wins");
});

test("MUST-ADMIT Q07 release-begin winning the OPEN CAS", () => {
  expectPacked(invoke(RCP, "casBegin", [0, 0]), 100, "release begins");
});

test("MUST-REFUSE Q07 unlisted competitor and begun-then-cancelled", () => {
  expectPacked(invoke(RCP, "casBegin", [0, 2]), 111, "unlisted competitor");
  expectPacked(invoke(RCP, "casCommit", [1, 0, 1, 1, 0]), 106, "revoke after begin");
});

test("MUST-REFUSE Q09 out-of-process COMMITTED and unknown adapter", () => {
  expectPacked(invoke(RCP, "casCommit", [1, 1, 1, 0, 0]), 106, "out-of-process");
  expectPacked(invoke(RCP, "casCommit", [1, 2, 1, 0, 0]), 111, "unknown adapter");
});

test("MUST-ADMIT Q09 in-process same-epoch commit", () => {
  expectPacked(invoke(RCP, "casCommit", [1, 0, 1, 0, 0]), 100, "in-process commit");
});

test("MUST-REFUSE rejected observation points", () => {
  expectPacked(invoke(RCP, "observationPoint", [0]), 100, "CAS-begin");
  expectPacked(invoke(RCP, "observationPoint", [1]), 111, "publish word");
  expectPacked(invoke(RCP, "observationPoint", [2]), 111, "atomics wait");
  expectPacked(invoke(RCP, "observationPoint", [3]), 111, "write return");
  expectPacked(invoke(RCP, "observationPoint", [4]), 111, "fsync");
  expectPacked(invoke(RCP, "observationPoint", [15]), 111, "unlisted kind");
});

test("MUST-REFUSE retry after DELIVERY_UNKNOWN", () => {
  expectPacked(invoke(RCP, "retryAfterUnknown", [6]), 106, "no retry");
  expectPacked(invoke(RCP, "retryAfterUnknown", [0]), 111, "unlisted prior");
});

test("bytesEqual full-length scan; length mismatch unequal; early-exit refuses", () => {
  expectPacked(invoke(RCP, "bytesEqualScan", [4, 4, 0, 4]), 100, "equal");
  expectPacked(invoke(RCP, "bytesEqualScan", [4, 3, 0, 4]), 101, "length mismatch");
  expectPacked(invoke(RCP, "bytesEqualScan", [4, 4, 1, 4]), 101, "mismatch found");
  expectPacked(invoke(RCP, "bytesEqualScan", [4, 4, 0, 2]), 102, "early exit");
});

test("revokeDelivery is one-way acknowledged to delivery-unknown", () => {
  expectPacked(invoke(RCP, "revokeDelivery", [2]), 106, "acked to unknown");
  expectPacked(invoke(RCP, "revokeDelivery", [1]), 108, "released no-op");
  expectPacked(invoke(RCP, "revokeDelivery", [0]), 108, "unused no-op");
  expectPacked(invoke(RCP, "revokeDelivery", [3]), 108, "fenced no-op");
  expectPacked(invoke(RCP, "revokeDelivery", [9]), 111, "unlisted");
});

test("B1 MUST-REFUSE consumeStep surviving mutants", () => {
  expectPacked(invoke(RCP, "consumeStep", [1, 0, 0, 1, 0, 0]), 102, "forged unused");
  expectPacked(invoke(RCP, "consumeStep", [1, 0, 0, 1, 1, 0]), 104, "forged released");
  expectPacked(invoke(RCP, "consumeStep", [1, 1, 0, 1, 3, 0]), 102, "fenced");
  expectPacked(invoke(RCP, "consumeStep", [1, 1, 0, 1, 4, 0]), 103, "delivery-unknown");
  expectPacked(invoke(RCP, "consumeStep", [1, 1, 0, 1, 2, 0]), 103, "acknowledged");
  expectPacked(invoke(RCP, "consumeStep", [1, 1, 0, 1, 9, 0]), 111, "unlisted lease");
  expectPacked(invoke(RCP, "consumeStep", [0, 1, 0, 1, 0, 0]), 105, "absent op");
  expectPacked(invoke(RCP, "consumeStep", [1, 0, 0, 1, 9, 0]), 111, "B6 forged + unlisted lease");
});

test("B1 MUST-REFUSE ackStep surviving mutants", () => {
  expectPacked(invoke(RCP, "ackStep", [1, 0, 1, 0, 1, 1, 1]), 104, "forged token");
  expectPacked(invoke(RCP, "ackStep", [1, 1, 1, 0, 0, 1, 1]), 104, "stale/future epoch");
  expectPacked(invoke(RCP, "ackStep", [1, 1, 1, 3, 1, 1, 1]), 111, "epochClass 3");
  expectPacked(invoke(RCP, "ackStep", [0, 1, 1, 0, 1, 1, 1]), 105, "absent op");
  expectPacked(invoke(RCP, "ackStep", [1, 1, 1, 0, 1, 1, 2]), 111, "unlisted audit");
  expectPacked(invoke(RCP, "ackStep", [1, 1, 1, 0, 1, 3, 0]), 102, "B6 fenced + audit absent");
});

test("B1 MUST-REFUSE mintAdmit surviving mutants", () => {
  expectPacked(invoke(RCP, "mintAdmit", [1, 0, -1, 0, 0, 0, 1, 0, 1, 0]), 104, "epoch -1");
  expectPacked(invoke(RCP, "mintAdmit", [0, 0, 1, 0, 0, 0, 1, 0, 1, 0]), 105, "absent id");
  expectPacked(invoke(RCP, "mintAdmit", [1, 0, 1, 2, 0, 0, 1, 0, 1, 0]), 111, "unlisted existingPresent");
  expectPacked(invoke(RCP, "mintAdmit", [1, 0, 1, 0, 0, 2, 1, 0, 1, 0]), 111, "unlisted retired");
  expectPacked(invoke(RCP, "mintAdmit", [1, 0, 1, 0, 0, 0, 1, 2, 1, 0]), 111, "unlisted atCap");
});

test("B1 MUST-REFUSE classifyRecovery unlisted tokens", () => {
  expectPacked(invoke(RCP, "classifyRecovery", [2, 0, 0, 0]), 111, "unlisted present");
  expectPacked(invoke(RCP, "classifyRecovery", [0, 2, 0, 0]), 111, "unlisted retired");
});

test("B1 MUST-REFUSE casBegin surviving mutants", () => {
  expectPacked(invoke(RCP, "casBegin", [2, 0]), 102, "REVOKED");
  expectPacked(invoke(RCP, "casBegin", [1, 0]), 103, "CLAIMED");
  expectPacked(invoke(RCP, "casBegin", [5, 0]), 106, "INDETERMINATE");
  expectPacked(invoke(RCP, "casBegin", [9, 0]), 111, "unlisted capState");
  expectPacked(invoke(RCP, "casBegin", [1, 9]), 111, "B6 non-OPEN unlisted competitor");
});

test("B1 MUST-REFUSE casCommit surviving mutants", () => {
  expectPacked(invoke(RCP, "casCommit", [1, 0, 1, 0, 1]), 106, "in-process crash");
  expectPacked(invoke(RCP, "casCommit", [1, 0, 0, 0, 0]), 106, "epoch mismatch");
  expectPacked(invoke(RCP, "casCommit", [2, 0, 1, 0, 0]), 102, "REVOKED");
  expectPacked(invoke(RCP, "casCommit", [0, 0, 1, 0, 0]), 105, "OPEN");
  expectPacked(invoke(RCP, "casCommit", [3, 0, 1, 0, 0]), 111, "COMMITTED again");
  expectPacked(invoke(RCP, "casCommit", [9, 0, 1, 0, 0]), 111, "unlisted capState");
  expectPacked(invoke(RCP, "casCommit", [1, 1, 1, 0, 2]), 111, "B6 out-of-process unlisted crash");
});

test("B1 MUST-REFUSE revokeDelivery DU and bytesEqual unlisted token", () => {
  expectPacked(invoke(RCP, "revokeDelivery", [4]), 106, "delivery-unknown");
  expectPacked(invoke(RCP, "bytesEqualScan", [4, 4, 2, 4]), 111, "unlisted mismatch token");
});

test("B2 mintAdmit re-issue of existing terminal is code 7 not a fresh mint", () => {
  expectPacked(invoke(RCP, "mintAdmit", [1, 0, 1, 1, 1, 0, 1, 0, 1, 1]), 107, "reissue released");
  expectPacked(invoke(RCP, "mintAdmit", [1, 0, 1, 1, 2, 0, 1, 0, 1, 1]), 107, "reissue acknowledged");
  expectPacked(invoke(RCP, "mintAdmit", [1, 0, 1, 0, 0, 0, 1, 0, 1, 0]), 100, "fresh still 100");
});

test("B2 mintAdmit unlisted existing lease and not-issued-here missing", () => {
  expectPacked(invoke(RCP, "mintAdmit", [1, 0, 1, 1, 9, 0, 1, 0, 1, 1]), 111, "unlisted existing lease");
  expectPacked(invoke(RCP, "mintAdmit", [1, 0, 1, 1, 1, 0, 1, 0, 1, 0]), 105, "looks issued but not here");
});

test("B3 releaseGuard independent authorization / custody / cleanup / split fields", () => {
  expectPacked(invoke(RCP, "releaseGuard", [1, 1, 1, 0, 1, 1]), 100, "all hold succeeded");
  expectPacked(invoke(RCP, "releaseGuard", [1, 1, 0, 1, 1, 1]), 100, "NotRequired empty set");
  expectPacked(invoke(RCP, "releaseGuard", [0, 1, 1, 0, 1, 1]), 105, "auth missing");
  expectPacked(invoke(RCP, "releaseGuard", [1, 0, 1, 0, 1, 1]), 105, "custody missing");
  expectPacked(invoke(RCP, "releaseGuard", [1, 1, 2, 0, 1, 1]), 106, "cleanup pending");
  expectPacked(invoke(RCP, "releaseGuard", [1, 1, 3, 0, 1, 1]), 106, "cleanup failed");
  expectPacked(invoke(RCP, "releaseGuard", [1, 1, 4, 0, 1, 1]), 106, "cleanup unknown");
  expectPacked(invoke(RCP, "releaseGuard", [1, 1, 0, 0, 1, 1]), 102, "NotRequired without empty set");
  expectPacked(invoke(RCP, "releaseGuard", [1, 1, 1, 0, 0, 1]), 106, "consumed 0");
  expectPacked(invoke(RCP, "releaseGuard", [1, 1, 1, 0, 1, 0]), 106, "validity 0");
  expectPacked(invoke(RCP, "releaseGuard", [1, 1, 9, 0, 1, 1]), 111, "unlisted cleanup");
});

test("mutant skip epoch compare on consume goes RED then restore", () => {
  withMutant(
    RCP,
    "  if epochMatchToken == 0 {\n    return finish(4, true)\n  }\n  return finish(0, true)\n}",
    "  if epochMatchToken == 0 {\n    return finish(0, true)\n  }\n  return finish(0, true)\n}",
    () => {
      const red = invoke(RCP, "consumeStep", [1, 1, 0, 0, 0, 0]);
      assert.equal(red.present, true, red.reason + " " + red.text);
      assert.notEqual(red.value, 104, "mutant must admit mismatched epoch: " + String(red.value));
    },
  );
  expectPacked(invoke(RCP, "consumeStep", [1, 1, 0, 0, 0, 0]), 104, "restore epoch compare");
});

test("mutant accept fallback nonce goes RED then restore", () => {
  withMutant(
    RCP,
    "  if randomnessPresentToken == 0 {\n    return finish(2, true)\n  }",
    "  if randomnessPresentToken == 0 {\n    return finish(0, true)\n  }",
    () => {
      const red = invoke(RCP, "mintAdmit", [1, 0, 1, 0, 0, 0, 0, 0, 1, 0]);
      assert.equal(red.present, true, red.reason + " " + red.text);
      assert.notEqual(red.value, 102, "mutant must admit absent nonce: " + String(red.value));
    },
  );
  expectPacked(invoke(RCP, "mintAdmit", [1, 0, 1, 0, 0, 0, 0, 0, 1, 0]), 102, "restore nonce refuse");
});

test("mutant drop audit-before-ack goes RED then restore", () => {
  withMutant(
    RCP,
    "  if auditCommittedToken == 0 {\n    return finish(6, true)\n  }",
    "  if auditCommittedToken == 0 {\n    return finish(1, true)\n  }",
    () => {
      const red = invoke(RCP, "ackStep", [1, 1, 1, 0, 1, 1, 0]);
      assert.equal(red.present, true, red.reason + " " + red.text);
      assert.notEqual(red.value, 106, "mutant must ack without audit: " + String(red.value));
    },
  );
  expectPacked(invoke(RCP, "ackStep", [1, 1, 1, 0, 1, 1, 0]), 106, "restore audit-before-ack");
});

test("mutant bytesEqual early-exit goes RED then restore", () => {
  withMutant(
    RCP,
    "  if scanned != lenA {\n    return finish(2, true)\n  }",
    "  if scanned < 0 {\n    return finish(2, true)\n  }",
    () => {
      const red = invoke(RCP, "bytesEqualScan", [4, 4, 0, 2]);
      assert.equal(red.present, true, red.reason + " " + red.text);
      assert.notEqual(red.value, 102, "mutant must admit early exit: " + String(red.value));
    },
  );
  expectPacked(invoke(RCP, "bytesEqualScan", [4, 4, 0, 2]), 102, "restore full scan");
});

test("mutant swap Q07 competitor order goes RED then restore", () => {
  withMutant(
    RCP,
    "  if competitor == 1 {\n    return finish(2, true)\n  }\n  if competitor == 0 {\n    return finish(0, true)\n  }",
    "  if competitor == 1 {\n    return finish(0, true)\n  }\n  if competitor == 0 {\n    return finish(2, true)\n  }",
    () => {
      const red = invoke(RCP, "casBegin", [0, 1]);
      assert.equal(red.present, true, red.reason + " " + red.text);
      assert.notEqual(red.value, 102, "mutant must admit revoke-win as release: " + String(red.value));
    },
  );
  expectPacked(invoke(RCP, "casBegin", [0, 1]), 102, "restore revoke-wins");
});

test("mutant B1 consume unlisted lease goes RED then restore", () => {
  withMutant(
    RCP,
    "          if leaseState != 4 {\n            return finish(11, true)\n          }\n        }\n      }\n    }\n  }\n  if presentToken == 0 {\n    return finish(5, true)\n  }\n  if revokeCommittedToken == 1 {",
    "          if leaseState != 4 {\n            return finish(0, true)\n          }\n        }\n      }\n    }\n  }\n  if presentToken == 0 {\n    return finish(5, true)\n  }\n  if revokeCommittedToken == 1 {",
    () => {
      const red = invoke(RCP, "consumeStep", [1, 1, 0, 1, 9, 0]);
      assert.equal(red.present !== true || red.value !== 111, true, "must not keep 111: " + String(red.value));
    },
  );
  expectPacked(invoke(RCP, "consumeStep", [1, 1, 0, 1, 9, 0]), 111, "restore unlisted lease");
});

test("mutant B2 reissue as fresh mint goes RED then restore", () => {
  withMutant(
    RCP,
    "    if existingLease == 1 {\n      return finish(7, true)\n    }",
    "    if existingLease == 1 {\n      return finish(0, true)\n    }",
    () => {
      const red = invoke(RCP, "mintAdmit", [1, 0, 1, 1, 1, 0, 1, 0, 1, 1]);
      assert.equal(red.present, true, red.reason + " " + red.text);
      assert.notEqual(red.value, 107, "mutant must collide with fresh mint: " + String(red.value));
    },
  );
  expectPacked(invoke(RCP, "mintAdmit", [1, 0, 1, 1, 1, 0, 1, 0, 1, 1]), 107, "restore reissue 7");
});

test("mutant B2 skip issuedHere missing goes RED then restore", () => {
  withMutant(
    RCP,
    "    if issuedHereToken == 0 {\n      return finish(5, true)\n    }",
    "    if issuedHereToken == 99 {\n      return finish(5, true)\n    }",
    () => {
      const red = invoke(RCP, "mintAdmit", [1, 0, 1, 1, 1, 0, 1, 0, 1, 0]);
      assert.equal(red.present, true, red.reason + " " + red.text);
      assert.notEqual(red.value, 105, "mutant must not missing: " + String(red.value));
    },
  );
  expectPacked(invoke(RCP, "mintAdmit", [1, 0, 1, 1, 1, 0, 1, 0, 1, 0]), 105, "restore issuedHere");
});

test("mutant B3 skip independent auth goes RED then restore", () => {
  withMutant(
    RCP,
    "  if independentAuthToken == 0 {\n    return finish(5, true)\n  }",
    "  if independentAuthToken == 99 {\n    return finish(5, true)\n  }",
    () => {
      const red = invoke(RCP, "releaseGuard", [0, 1, 1, 0, 1, 1]);
      assert.equal(red.present, true, red.reason + " " + red.text);
      assert.notEqual(red.value, 105, "mutant must skip auth: " + String(red.value));
    },
  );
  expectPacked(invoke(RCP, "releaseGuard", [0, 1, 1, 0, 1, 1]), 105, "restore auth");
});

test("mutant B3 skip prepared custody goes RED then restore", () => {
  withMutant(
    RCP,
    "  if preparedCustodyToken == 0 {\n    return finish(5, true)\n  }",
    "  if preparedCustodyToken == 99 {\n    return finish(5, true)\n  }",
    () => {
      const red = invoke(RCP, "releaseGuard", [1, 0, 1, 0, 1, 1]);
      assert.equal(red.present, true, red.reason + " " + red.text);
      assert.notEqual(red.value, 105, "mutant must skip custody: " + String(red.value));
    },
  );
  expectPacked(invoke(RCP, "releaseGuard", [1, 0, 1, 0, 1, 1]), 105, "restore custody");
});

test("mutant B3 skip cleanup pending goes RED then restore", () => {
  withMutant(
    RCP,
    "  if cleanupEvidence == 2 {\n    return finish(6, true)\n  }",
    "  if cleanupEvidence == 99 {\n    return finish(6, true)\n  }",
    () => {
      const red = invoke(RCP, "releaseGuard", [1, 1, 2, 0, 1, 1]);
      assert.equal(red.present, true, red.reason + " " + red.text);
      assert.notEqual(red.value, 106, "mutant must skip pending: " + String(red.value));
    },
  );
  expectPacked(invoke(RCP, "releaseGuard", [1, 1, 2, 0, 1, 1]), 106, "restore pending");
});

test("mutant B3 skip NotRequired empty-set goes RED then restore", () => {
  withMutant(
    RCP,
    "  if cleanupEvidence == 0 {\n    if emptyObligationSetToken == 0 {\n      return finish(2, true)\n    }\n  }",
    "  if cleanupEvidence == 99 {\n    if emptyObligationSetToken == 0 {\n      return finish(2, true)\n    }\n  }",
    () => {
      const red = invoke(RCP, "releaseGuard", [1, 1, 0, 0, 1, 1]);
      assert.equal(red.present, true, red.reason + " " + red.text);
      assert.notEqual(red.value, 102, "mutant must admit NotRequired nonempty: " + String(red.value));
    },
  );
  expectPacked(invoke(RCP, "releaseGuard", [1, 1, 0, 0, 1, 1]), 102, "restore NotRequired");
});

test("mutant B3 skip consumed authority goes RED then restore", () => {
  withMutant(
    RCP,
    "  if consumedAuthorityToken == 0 {\n    return finish(6, true)\n  }",
    "  if consumedAuthorityToken == 99 {\n    return finish(6, true)\n  }",
    () => {
      const red = invoke(RCP, "releaseGuard", [1, 1, 1, 0, 0, 1]);
      assert.equal(red.present, true, red.reason + " " + red.text);
      assert.notEqual(red.value, 106, "mutant must skip consumed: " + String(red.value));
    },
  );
  expectPacked(invoke(RCP, "releaseGuard", [1, 1, 1, 0, 0, 1]), 106, "restore consumed");
});

test("mutant B3 skip current validity goes RED then restore", () => {
  withMutant(
    RCP,
    "  if currentValidityToken == 0 {\n    return finish(6, true)\n  }",
    "  if currentValidityToken == 99 {\n    return finish(6, true)\n  }",
    () => {
      const red = invoke(RCP, "releaseGuard", [1, 1, 1, 0, 1, 0]);
      assert.equal(red.present, true, red.reason + " " + red.text);
      assert.notEqual(red.value, 106, "mutant must skip validity: " + String(red.value));
    },
  );
  expectPacked(invoke(RCP, "releaseGuard", [1, 1, 1, 0, 1, 0]), 106, "restore validity");
});

test("B5 import c-boundary: check admits, build and run --invoke refuse", () => {
  const tmp = mkdtempSync(join(tmpdir(), "q32-03-b5-"));
  try {
    const boundarySrc = readFileSync(BOUNDARY, "utf8");
    const probe =
      "@version 1\n" +
      "import \"./c-boundary.fungi\"\n" +
      "pure flow ping(classTag: Int, integer: Int) -> Int\n" +
      "contract {\n" +
      "  intent { \"B5 probe import helper CALL\" }\n" +
      "}\n" +
      "{\n" +
      "  let reason: Int = readForeignSafeInteger(classTag, integer)\n" +
      "  return reason\n" +
      "}\n";
    writeFileSync(join(tmp, "c-boundary.fungi"), boundarySrc);
    const probePath = join(tmp, "probe.fungi");
    writeFileSync(probePath, probe);
    const check = spawnSync(process.execPath, [GALERINA, "check", probePath, "--strict-types", "--strict-governance"], {
      encoding: "utf8", cwd: REPO,
    });
    const build = spawnSync(process.execPath, [GALERINA, "build", probePath], {
      encoding: "utf8", cwd: REPO,
    });
    const run = spawnSync(process.execPath, [GALERINA, "run", probePath, "--invoke", "ping", "0", "4"], {
      encoding: "utf8", cwd: REPO,
    });
    assert.equal(check.status, 0, "check must admit import: " + (check.stdout || "") + (check.stderr || ""));
    assert.notEqual(build.status, 0, "build must refuse: " + (build.stdout || "") + (build.stderr || ""));
    assert.equal((build.stderr || "").includes("FUNGI-NAME-001"), true, build.stderr);
    assert.notEqual(run.status, 0, "run --invoke must refuse: " + (run.stdout || "") + (run.stderr || ""));
    assert.equal((run.stderr || "").includes("readForeignSafeInteger"), true, run.stderr);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("S1 MUST-REFUSE drain / write-callback / close / transferred-undelivered", () => {
  expectPacked(invoke(RCP, "observationPoint", [5]), 111, "drain as delivery");
  expectPacked(invoke(RCP, "observationPoint", [6]), 111, "write callback as delivery");
  expectPacked(invoke(RCP, "observationPoint", [7]), 111, "close as file release");
  expectPacked(invoke(RCP, "observationPoint", [8]), 111, "transferred buffer undelivered");
});

test("S1 post-write events stay DELIVERY_UNKNOWN never REFUSED or success", () => {
  expectPacked(invoke(RCP, "observationPoint", [9]), 106, "error after write");
  expectPacked(invoke(RCP, "observationPoint", [10]), 106, "destroy after write");
  expectPacked(invoke(RCP, "observationPoint", [11]), 106, "cancellation after write");
  expectPacked(invoke(RCP, "observationPoint", [12]), 106, "missing ack after write");
  expectPacked(invoke(RCP, "observationPoint", [13]), 106, "crash after write");
});

test("S1 crash before begin is not REFUSED (no durable revocation)", () => {
  expectPacked(invoke(RCP, "observationPoint", [14]), 111, "crash before begin as refuse");
});

test("S2 outcomeClass before-begin missing/stale is Refused; after-begin is Indeterminate", () => {
  expectPacked(invoke(RCP, "outcomeClass", [5, 0]), 102, "missing before begin");
  expectPacked(invoke(RCP, "outcomeClass", [4, 0]), 102, "stale before begin");
  expectPacked(invoke(RCP, "outcomeClass", [5, 1]), 106, "missing after begin");
  expectPacked(invoke(RCP, "outcomeClass", [4, 1]), 106, "stale after begin");
  expectPacked(invoke(RCP, "mintAdmit", [0, 0, 1, 0, 0, 0, 1, 0, 1, 0]), 105, "mint missing before begin");
  expectPacked(invoke(RCP, "casCommit", [1, 0, 0, 0, 0]), 106, "casCommit mismatch after begin");
  expectPacked(invoke(RCP, "outcomeClass", [0, 0]), 100, "released is Success");
  expectPacked(invoke(RCP, "outcomeClass", [8, 0]), 108, "no-op stays no-op");
  expectPacked(invoke(RCP, "outcomeClass", [9, 0]), 111, "unlisted outcome");
});

test("S3 revokeDelivery no-op is code 8 never released", () => {
  expectPacked(invoke(RCP, "revokeDelivery", [1]), 108, "released no-op not 100");
  expectPacked(invoke(RCP, "revokeDelivery", [0]), 108, "unused no-op not 100");
  expectPacked(invoke(RCP, "revokeDelivery", [3]), 108, "fenced no-op not 100");
});

test("mutant S1 drain as delivery goes RED then restore", () => {
  withMutant(
    RCP,
    "  if kind == 5 {\n    return finish(11, true)\n  }",
    "  if kind == 5 {\n    return finish(0, true)\n  }",
    () => {
      const red = invoke(RCP, "observationPoint", [5]);
      assert.equal(red.present, true, red.reason + " " + red.text);
      assert.notEqual(red.value, 111, "mutant must admit drain: " + String(red.value));
    },
  );
  expectPacked(invoke(RCP, "observationPoint", [5]), 111, "restore drain refuse");
});

test("mutant S1 close as file release goes RED then restore", () => {
  withMutant(
    RCP,
    "  if kind == 7 {\n    return finish(11, true)\n  }",
    "  if kind == 7 {\n    return finish(0, true)\n  }",
    () => {
      const red = invoke(RCP, "observationPoint", [7]);
      assert.equal(red.present, true, red.reason + " " + red.text);
      assert.notEqual(red.value, 111, "mutant must admit close: " + String(red.value));
    },
  );
  expectPacked(invoke(RCP, "observationPoint", [7]), 111, "restore close refuse");
});

test("mutant S1 transferred undelivered goes RED then restore", () => {
  withMutant(
    RCP,
    "  if kind == 8 {\n    return finish(11, true)\n  }",
    "  if kind == 8 {\n    return finish(0, true)\n  }",
    () => {
      const red = invoke(RCP, "observationPoint", [8]);
      assert.equal(red.present, true, red.reason + " " + red.text);
      assert.notEqual(red.value, 111, "mutant must admit transferred-undelivered: " + String(red.value));
    },
  );
  expectPacked(invoke(RCP, "observationPoint", [8]), 111, "restore transferred refuse");
});

test("mutant S1 error-after-write as zero effect goes RED then restore", () => {
  withMutant(
    RCP,
    "  if kind == 9 {\n    return finish(6, true)\n  }",
    "  if kind == 9 {\n    return finish(0, true)\n  }",
    () => {
      const red = invoke(RCP, "observationPoint", [9]);
      assert.equal(red.present, true, red.reason + " " + red.text);
      assert.notEqual(red.value, 106, "mutant must treat error as zero effect: " + String(red.value));
    },
  );
  expectPacked(invoke(RCP, "observationPoint", [9]), 106, "restore error-after-write");
});

test("mutant S1 crash-before-begin as REFUSE goes RED then restore", () => {
  withMutant(
    RCP,
    "  if kind == 14 {\n    return finish(11, true)\n  }",
    "  if kind == 14 {\n    return finish(2, true)\n  }",
    () => {
      const red = invoke(RCP, "observationPoint", [14]);
      assert.equal(red.present, true, red.reason + " " + red.text);
      assert.equal(red.value, 102, "mutant must report REFUSE: " + String(red.value));
    },
  );
  expectPacked(invoke(RCP, "observationPoint", [14]), 111, "restore crash-before-begin");
});

test("mutant S2 after-begin stale as Refused goes RED then restore", () => {
  withMutant(
    RCP,
    "  if outcomeCode == 4 {\n    if phaseToken == 0 {\n      return finish(2, true)\n    }\n    return finish(6, true)\n  }",
    "  if outcomeCode == 4 {\n    if phaseToken == 0 {\n      return finish(2, true)\n    }\n    return finish(2, true)\n  }",
    () => {
      const red = invoke(RCP, "outcomeClass", [4, 1]);
      assert.equal(red.present, true, red.reason + " " + red.text);
      assert.notEqual(red.value, 106, "mutant must map after-begin stale as Refused: " + String(red.value));
    },
  );
  expectPacked(invoke(RCP, "outcomeClass", [4, 1]), 106, "restore after-begin stale");
});

test("mutant S3 no-op as released goes RED then restore", () => {
  withMutant(
    RCP,
    "  if leaseState == 1 {\n    return finish(8, true)\n  }",
    "  if leaseState == 1 {\n    return finish(0, true)\n  }",
    () => {
      const red = invoke(RCP, "revokeDelivery", [1]);
      assert.equal(red.present, true, red.reason + " " + red.text);
      assert.notEqual(red.value, 108, "mutant must report released: " + String(red.value));
    },
  );
  expectPacked(invoke(RCP, "revokeDelivery", [1]), 108, "restore no-op 8");
});

test("CN-1 release-commit-point does not define the helper", () => {
  const src = readFileSync(RCP, "utf8");
  assert.equal(src.includes("pure flow readForeignSafeInteger"), false);
});

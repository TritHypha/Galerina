import { spawnSync } from "node:child_process";
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { readFileSync, writeFileSync } from "node:fs";

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

test("CN-1 helper lives only in c-boundary; epoch NaN refuses through helper", () => {
  expectPacked(invoke(BOUNDARY, "readForeignSafeInteger", [3, 0]), 3, "helper NaN");
  expectPacked(invoke(RCP, "mintAdmit", [1, 3, 0, 0, 0, 0, 1, 0, 1]), 111, "mint NaN epoch class");
});

test("MUST-REFUSE mint with randomness absent", () => {
  expectPacked(invoke(RCP, "mintAdmit", [1, 0, 1, 0, 0, 0, 0, 0, 1]), 102, "absent nonce");
});

test("MUST-REFUSE mint of retired or in-flight unused", () => {
  expectPacked(invoke(RCP, "mintAdmit", [1, 0, 1, 0, 0, 1, 1, 0, 1]), 103, "retired");
  expectPacked(invoke(RCP, "mintAdmit", [1, 0, 1, 1, 0, 0, 1, 0, 1]), 103, "in-flight unused");
});

test("MUST-REFUSE mint at cap and unfresh issued id", () => {
  expectPacked(invoke(RCP, "mintAdmit", [1, 0, 1, 0, 0, 0, 1, 1, 1]), 102, "at cap");
  expectPacked(invoke(RCP, "mintAdmit", [1, 0, 1, 0, 0, 0, 1, 0, 0]), 103, "not fresh");
});

test("MUST-ADMIT mint of a fresh unused lease", () => {
  expectPacked(invoke(RCP, "mintAdmit", [1, 0, 1, 0, 0, 0, 1, 0, 1]), 100, "fresh mint");
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
  expectPacked(invoke(RCP, "revokeDelivery", [1]), 100, "released unchanged");
  expectPacked(invoke(RCP, "revokeDelivery", [9]), 111, "unlisted");
});

test("mutant skip epoch compare on consume goes RED then restore", () => {
  const orig = readFileSync(RCP, "utf8");
  const mutant = orig.replace(
    "if epochMatchToken != 1 {\n    if epochMatchToken == 0 {\n      return finish(4, true)\n    }\n    return finish(11, true)\n  }\n  return finish(0, true)\n}",
    "if epochMatchToken != 1 {\n    if epochMatchToken == 0 {\n      return finish(0, true)\n    }\n    return finish(11, true)\n  }\n  return finish(0, true)\n}",
  );
  assert.notEqual(mutant, orig);
  writeFileSync(RCP, mutant);
  const red = invoke(RCP, "consumeStep", [1, 1, 0, 0, 0, 0]);
  writeFileSync(RCP, orig);
  const green = invoke(RCP, "consumeStep", [1, 1, 0, 0, 0, 0]);
  assert.equal(red.present, true, red.reason + " " + red.text);
  assert.notEqual(red.value, 104, "mutant must admit mismatched epoch: " + String(red.value));
  expectPacked(green, 104, "restore epoch compare");
});

test("mutant accept fallback nonce goes RED then restore", () => {
  const orig = readFileSync(RCP, "utf8");
  const mutant = orig.replace(
    "if randomnessPresentToken != 1 {\n    if randomnessPresentToken == 0 {\n      return finish(2, true)\n    }",
    "if randomnessPresentToken != 1 {\n    if randomnessPresentToken == 0 {\n      return finish(0, true)\n    }",
  );
  assert.notEqual(mutant, orig);
  writeFileSync(RCP, mutant);
  const red = invoke(RCP, "mintAdmit", [1, 0, 1, 0, 0, 0, 0, 0, 1]);
  writeFileSync(RCP, orig);
  const green = invoke(RCP, "mintAdmit", [1, 0, 1, 0, 0, 0, 0, 0, 1]);
  assert.equal(red.present, true, red.reason + " " + red.text);
  assert.notEqual(red.value, 102, "mutant must admit absent nonce: " + String(red.value));
  expectPacked(green, 102, "restore nonce refuse");
});

test("mutant drop audit-before-ack goes RED then restore", () => {
  const orig = readFileSync(RCP, "utf8");
  const mutant = orig.replace(
    "if auditCommittedToken != 1 {\n    if auditCommittedToken == 0 {\n      return finish(6, true)\n    }",
    "if auditCommittedToken != 1 {\n    if auditCommittedToken == 0 {\n      return finish(1, true)\n    }",
  );
  assert.notEqual(mutant, orig);
  writeFileSync(RCP, mutant);
  const red = invoke(RCP, "ackStep", [1, 1, 1, 0, 1, 1, 0]);
  writeFileSync(RCP, orig);
  const green = invoke(RCP, "ackStep", [1, 1, 1, 0, 1, 1, 0]);
  assert.equal(red.present, true, red.reason + " " + red.text);
  assert.notEqual(red.value, 106, "mutant must ack without audit: " + String(red.value));
  expectPacked(green, 106, "restore audit-before-ack");
});

test("mutant bytesEqual early-exit goes RED then restore", () => {
  const orig = readFileSync(RCP, "utf8");
  const mutant = orig.replace(
    "if scanned != lenA {\n    return finish(2, true)\n  }",
    "if scanned < 0 {\n    return finish(2, true)\n  }",
  );
  assert.notEqual(mutant, orig);
  writeFileSync(RCP, mutant);
  const red = invoke(RCP, "bytesEqualScan", [4, 4, 0, 2]);
  writeFileSync(RCP, orig);
  const green = invoke(RCP, "bytesEqualScan", [4, 4, 0, 2]);
  assert.equal(red.present, true, red.reason + " " + red.text);
  assert.notEqual(red.value, 102, "mutant must admit early exit: " + String(red.value));
  expectPacked(green, 102, "restore full scan");
});

test("mutant swap Q07 competitor order goes RED then restore", () => {
  const orig = readFileSync(RCP, "utf8");
  const mutant = orig.replace(
    "if competitor == 1 {\n    return finish(2, true)\n  }\n  if competitor == 0 {\n    return finish(0, true)\n  }",
    "if competitor == 1 {\n    return finish(0, true)\n  }\n  if competitor == 0 {\n    return finish(2, true)\n  }",
  );
  assert.notEqual(mutant, orig);
  writeFileSync(RCP, mutant);
  const red = invoke(RCP, "casBegin", [0, 1]);
  writeFileSync(RCP, orig);
  const green = invoke(RCP, "casBegin", [0, 1]);
  assert.equal(red.present, true, red.reason + " " + red.text);
  assert.notEqual(red.value, 102, "mutant must admit revoke-win as release: " + String(red.value));
  expectPacked(green, 102, "restore revoke-wins");
});

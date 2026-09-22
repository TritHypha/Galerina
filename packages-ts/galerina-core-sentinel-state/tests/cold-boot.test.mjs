// cold-boot.test.mjs — checkpoint / restore / scrub + tamper + missing.

import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  StateSerializer,
  AtomicWriter,
  ColdBootOrchestrator,
  SecurityTrap,
  HardenedBorderViolation,
} from "../dist/index.js";
import { tmpDir } from "./_tmp.mjs";

const TEST_KEY = Uint8Array.from({ length: 32 }, (_, i) => i + 1);

const TEST_RESTORE_AUTHORITY = Object.freeze({
  packageIdentity: "@galerina/core-sentinel-state",
  exportName: "restoreVerdict",
  restoreVerdict: (snapshotPresent, integrityOk) => (
    snapshotPresent && integrityOk ? 1 : -1
  ),
});

function makeOrchestrator() {
  const dir = tmpDir();
  const orch = new ColdBootOrchestrator(
    new StateSerializer({ hmacKey: TEST_KEY }),
    new AtomicWriter(dir),
    TEST_RESTORE_AUTHORITY,
  );
  return { dir, orch };
}

test("checkpoint → restore returns the same payload + logicalTick", () => {
  const { orch } = makeOrchestrator();
  const payload = { a: 1, b: [1, 2, 3], nested: { ok: true } };
  orch.checkpoint("engine", payload, 314);
  const restored = orch.restore("engine");
  assert.deepEqual(restored.payload, payload);
  assert.equal(restored.logicalTick, 314);
});

test("restore of a byte-tampered .snap throws SecurityTrap", () => {
  const { dir, orch } = makeOrchestrator();
  orch.checkpoint("engine", { a: 1 }, 1);
  // Corrupt the persisted payload inside the live snapshot file.
  const snapPath = join(dir, "engine.snap");
  const obj = JSON.parse(readFileSync(snapPath, "utf8"));
  obj.payloadJson = obj.payloadJson.replace("1", "2");
  writeFileSync(snapPath, JSON.stringify(obj), "utf8");
  const err = caught(() => orch.restore("engine"));
  assert.ok(err instanceof SecurityTrap, "tampered snapshot must trap");
  assert.equal(err.code, "LSS-INTEGRITY-001");
});

test("restore of a missing name throws HardenedBorderViolation LSS-NOSNAP-001", () => {
  const { orch } = makeOrchestrator();
  const err = caught(() => orch.restore("never-checkpointed"));
  assert.ok(err instanceof HardenedBorderViolation);
  assert.equal(err.code, "LSS-NOSNAP-001");
});

test("restore refuses a snapshot below the rollback floor", () => {
  const dir = tmpDir();
  const writer = new AtomicWriter(dir);
  const serializer = new StateSerializer({ hmacKey: TEST_KEY });
  const low = new ColdBootOrchestrator(serializer, writer, TEST_RESTORE_AUTHORITY, 0);
  low.checkpoint("engine", { a: 1 }, 5);
  const high = new ColdBootOrchestrator(serializer, writer, TEST_RESTORE_AUTHORITY, 10);
  const err = caught(() => high.restore("engine"));
  assert.ok(err instanceof HardenedBorderViolation);
  assert.equal(err.code, "LSS-ROLLBACK-001");
});

test("scrub hard-erases the snapshot; no throw when absent", () => {
  const { dir, orch } = makeOrchestrator();
  orch.checkpoint("doomed", { secret: 42 }, 9);
  const snapPath = join(dir, "doomed.snap");
  assert.equal(existsSync(snapPath), true);
  orch.scrub("doomed");
  assert.equal(existsSync(snapPath), false, "scrubbed file is gone");
  // Idempotent: scrubbing an absent snapshot does not throw.
  assert.doesNotThrow(() => orch.scrub("doomed"));
  assert.doesNotThrow(() => orch.scrub("never-existed"));
});

function caught(fn) {
  try {
    fn();
    return null;
  } catch (e) {
    return e;
  }
}

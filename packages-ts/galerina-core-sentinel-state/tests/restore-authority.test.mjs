import assert from "node:assert/strict";
import { test } from "node:test";

import {
  AtomicWriter,
  ColdBootOrchestrator,
  HardenedBorderViolation,
  StateSerializer,
} from "../dist/index.js";
import { tmpDir } from "./_tmp.mjs";

const TEST_KEY = Uint8Array.from({ length: 32 }, (_, i) => i + 1);
const PACKAGE_IDENTITY = "@galerina/core-sentinel-state";
const EXPORT_NAME = "restoreVerdict";

function authority(restoreVerdict, overrides = {}) {
  return {
    packageIdentity: PACKAGE_IDENTITY,
    exportName: EXPORT_NAME,
    restoreVerdict,
    ...overrides,
  };
}

function dependencies() {
  return {
    serializer: new StateSerializer({ hmacKey: TEST_KEY }),
    writer: new AtomicWriter(tmpDir()),
  };
}

function isAuthorityRefusal(error) {
  return error instanceof HardenedBorderViolation
    && error.code === "LSS-RESTORE-AUTHORITY-001";
}

test("restore calls the exact authority once with locally verified facts", () => {
  const calls = [];
  const { serializer, writer } = dependencies();
  const orchestrator = new ColdBootOrchestrator(
    serializer,
    writer,
    authority((snapshotPresent, integrityOk) => {
      calls.push([snapshotPresent, integrityOk]);
      return 1;
    }),
  );

  orchestrator.checkpoint("engine", { ready: true }, 7);
  assert.deepEqual(orchestrator.restore("engine"), {
    payload: { ready: true },
    logicalTick: 7,
  });
  assert.deepEqual(calls, [[true, true]]);
});

test("constructor refuses a missing or wrongly identified authority", () => {
  const first = dependencies();
  assert.throws(
    () => new ColdBootOrchestrator(first.serializer, first.writer),
    isAuthorityRefusal,
  );

  const second = dependencies();
  assert.throws(
    () => new ColdBootOrchestrator(
      second.serializer,
      second.writer,
      authority(() => 1, { exportName: "other" }),
    ),
    isAuthorityRefusal,
  );
});

for (const [name, decision] of [
  ["authority exception", () => { throw new Error("unavailable"); }],
  ["K3 unknown", () => 0],
  ["non-integer value", () => 1.5],
  ["local/authority disagreement", () => -1],
]) {
  test(`restore fails closed on ${name}`, () => {
    const { serializer, writer } = dependencies();
    const orchestrator = new ColdBootOrchestrator(
      serializer,
      writer,
      authority(decision),
    );
    orchestrator.checkpoint("engine", { ready: true }, 8);
    assert.throws(() => orchestrator.restore("engine"), isAuthorityRefusal);
  });
}

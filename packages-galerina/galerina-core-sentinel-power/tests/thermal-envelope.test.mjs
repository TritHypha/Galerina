import test from "node:test";
import assert from "node:assert/strict";

import {
  validateEnvelope,
  AEROSPACE_ENVELOPE,
  PowerFault,
} from "../dist/index.js";

test("AEROSPACE_ENVELOPE is well-ordered and accepted", () => {
  assert.equal(AEROSPACE_ENVELOPE.throttleC, 70);
  assert.equal(AEROSPACE_ENVELOPE.safeC, 85);
  assert.equal(AEROSPACE_ENVELOPE.criticalC, 95);
  assert.doesNotThrow(() => validateEnvelope(AEROSPACE_ENVELOPE));
});

test("validateEnvelope rejects throttle >= safe", () => {
  assert.throws(
    () => validateEnvelope({ throttleC: 85, safeC: 85, criticalC: 95 }),
    (err) => err instanceof PowerFault && err.code === "LSP-ENV-001",
  );
  assert.throws(
    () => validateEnvelope({ throttleC: 90, safeC: 85, criticalC: 95 }),
    (err) => err instanceof PowerFault && err.code === "LSP-ENV-001",
  );
});

test("validateEnvelope rejects safe >= critical", () => {
  assert.throws(
    () => validateEnvelope({ throttleC: 70, safeC: 95, criticalC: 95 }),
    (err) => err instanceof PowerFault && err.code === "LSP-ENV-001",
  );
});

test("validateEnvelope rejects non-positive throttle", () => {
  assert.throws(
    () => validateEnvelope({ throttleC: 0, safeC: 85, criticalC: 95 }),
    (err) => err instanceof PowerFault && err.code === "LSP-ENV-001",
  );
  assert.throws(
    () => validateEnvelope({ throttleC: -1, safeC: 85, criticalC: 95 }),
    (err) => err instanceof PowerFault && err.code === "LSP-ENV-001",
  );
});

test("validateEnvelope rejects non-finite thresholds", () => {
  assert.throws(
    () =>
      validateEnvelope({ throttleC: 70, safeC: Number.NaN, criticalC: 95 }),
    (err) => err instanceof PowerFault && err.code === "LSP-ENV-001",
  );
});

test("PowerFault carries name and code", () => {
  const f = new PowerFault("LSP-ENV-001", "boom");
  assert.equal(f.name, "PowerFault");
  assert.equal(f.code, "LSP-ENV-001");
  assert.ok(f instanceof Error);
});

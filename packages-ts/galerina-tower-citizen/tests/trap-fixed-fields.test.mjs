// trap-fixed-fields.test.mjs — AuditLogger.trap's logger-owned fields (`violation`, `rollbackStatus`)
// cannot be overwritten by caller-supplied details. Zero-trust default, owner may revisit (docs/TODO.md
// "Decide whether trap's caller-supplied details are intentionally allowed to overwrite fixed
// violation/rollbackStatus"): before this, `{ violation, rollbackStatus: "clean", ...details }` let a
// caller rename or blank the recorded violation, hiding it from getLifecycle().violations.
import { test } from "node:test";
import assert from "node:assert/strict";
import { AuditLogger } from "../dist/index.js";

test("caller details cannot overwrite the recorded violation or rollbackStatus", () => {
  const log = new AuditLogger(null);
  const ev = log.trap("c1", "sha256:a", "galerina", "BUDGET_EXCEEDED", {
    violation: "NOTHING_TO_SEE", rollbackStatus: "dirty", requestedMB: 999,
  });
  assert.equal(ev.details.violation, "BUDGET_EXCEEDED");
  assert.equal(ev.details.rollbackStatus, "clean");
  assert.equal(ev.details.requestedMB, 999, "non-colliding caller details are kept");
  assert.deepEqual(log.getLifecycle("c1").violations, ["BUDGET_EXCEEDED"]);
});

test("a blank violation in caller details cannot hide the trap from the lifecycle", () => {
  const log = new AuditLogger(null);
  log.load("c2", "sha256:a", "galerina");
  log.trap("c2", "sha256:a", "galerina", "ERR_HOST_NATIVE_DENIED", { violation: "" });
  assert.deepEqual(log.getLifecycle("c2").violations, ["ERR_HOST_NATIVE_DENIED"]);
});

test("anti-neutering: trap without colliding details is unchanged", () => {
  const log = new AuditLogger(null);
  const ev = log.trap("c3", "sha256:a", "galerina", "ERR_LATENCY_INVARIANT", { latencyMs: 9, boundMs: 5 });
  assert.deepEqual(ev.details, { violation: "ERR_LATENCY_INVARIANT", rollbackStatus: "clean", latencyMs: 9, boundMs: 5 });
  assert.equal(ev.phase, "TRAP");
  assert.equal(ev.governancePass, false);
});
